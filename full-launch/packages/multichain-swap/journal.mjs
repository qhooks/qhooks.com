// Public recovery data only. Structural validity never authorizes a send.
import {normalizeSwapFields} from './swap-fields.mjs';
import {swapQuoteBounds} from './swap-quote-math.mjs';
import {parseActionStage} from '../multichain-launch/actions/action-stage-envelope.mjs';
import {walletFeePolicy} from '../chain-wallet/fees.mjs';
const ensure=(ok,m)=>{if(!ok)throw new TypeError(m);};
const kinds=['erc20-reset','erc20-approve','permit2-approve','swap'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function exact(o,keys){ensure(o&&Object.getPrototypeOf(o)===Object.prototype,'Plain swap record required');const d=Object.getOwnPropertyDescriptors(o),names=Reflect.ownKeys(d);ensure(names.length===keys.length&&names.every(k=>typeof k==='string'&&keys.includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value')),'Exact swap record fields required');return Object.fromEntries(keys.map(k=>[k,d[k].value]));}
const addr=x=>typeof x==='string'&&x.length===42&&/^0x[0-9a-f]{40}$/.test(x)&&BigInt(x)>0n;
const hash=x=>typeof x==='string'&&x.length===66&&/^0x[0-9a-f]{64}$/.test(x);
const hex=x=>typeof x==='string'&&x.length>=3&&x.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x)&&'0x'+BigInt(x).toString(16)===x;
function identity(input){const i=exact(input,['chainId','controller','contextId','owner','fields']);walletFeePolicy(i.chainId);ensure(addr(i.controller)&&addr(i.owner)&&hash(i.contextId)&&i.owner!==i.controller,'Swap journal identity');return {...i,fields:normalizeSwapFields(i.fields)};}
export function newSwapJournal(input){return {schemaVersion:1,kind:'qhooks-connected-swap',...identity(input),records:[]};}
export function readSwapQuote(value,fields){
 const v=exact(value,['poolKey','phase','blockNumber','blockHash','timestamp','expectedAmount','minimumOut','deadline','approvalExpiration','quotedAt','expiresAt']);
 const k=exact(v.poolKey,['currency0','currency1','fee','tickSpacing','hooks']);
 ensure(addr(k.currency0)&&addr(k.currency1)&&addr(k.hooks)&&BigInt(k.currency0)<BigInt(k.currency1)&&[10820n,10956n].includes(BigInt(k.hooks)&16383n)&&k.tickSpacing==='60','Canonical swap pool');
 ensure(typeof k.fee==='string'&&k.fee.length<=6&&!/[^0-9]/.test(k.fee)&&BigInt(k.fee)>0n&&BigInt(k.fee)<=100000n&&BigInt(k.fee).toString()===k.fee,'Canonical pool fee');
 ensure(['1','2'].includes(v.phase)&&hex(v.blockNumber)&&hash(v.blockHash),'Swap quote block and phase');
 const bounds=swapQuoteBounds(v.expectedAmount,fields.slippageBps,v.timestamp);
 ensure(v.minimumOut===bounds.minimumOut&&v.deadline===bounds.deadline&&BigInt(v.timestamp)<=(1n<<48n)-901n&&v.approvalExpiration===(BigInt(v.timestamp)+900n).toString(),'Swap quote bounds');
 ensure(Number.isSafeInteger(v.quotedAt)&&v.quotedAt>=0&&Number.isSafeInteger(v.quotedAt+120000)&&v.expiresAt===v.quotedAt+120000,'Swap observation expiry');
 return {...v,poolKey:k};
}
export function readSwapJournal(text,input){
 const id=identity(input);ensure(typeof text==='string'&&text.length>0&&text.length<=250000,'Bounded public swap journal');
 const j=exact(JSON.parse(text),['schemaVersion','kind','chainId','controller','contextId','owner','fields','records']);
 ensure(j.schemaVersion===1&&j.kind==='qhooks-connected-swap'&&['chainId','controller','contextId','owner'].every(k=>j[k]===id[k])&&same(normalizeSwapFields(j.fields),id.fields),'Swap progress identity changed');
 ensure(Array.isArray(j.records)&&j.records.length<=12,'Bounded swap history');
 const hashes=new Set(),records=j.records.map((raw,i)=>{
  const r=exact(raw,['kind','quote','stage']);ensure(kinds.includes(r.kind),'Unknown swap stage');const quote=readSwapQuote(r.quote,id.fields),stage=parseActionStage(r.stage,walletFeePolicy(id.chainId),id.owner);
  ensure(i===j.records.length-1||stage.status==='confirmed','Unresolved prior swap stage');
  ensure(i===j.records.length-1||r.kind!=='swap','No transaction after completed swap');
  if(stage.hash){ensure(!hashes.has(stage.hash),'Repeated transaction hash');hashes.add(stage.hash);}
  return {kind:r.kind,quote,stage};
 });
 return {...j,fields:id.fields,records};
}
