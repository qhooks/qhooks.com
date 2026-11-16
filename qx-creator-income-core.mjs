import {BLOCK_FIELDS,BLOCK_BITS} from './full-launch/packages/multichain-launch/launch-blocks.mjs';
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';
const A=/^0x[0-9a-f]{40}$/i,H=/^0x[0-9a-f]{64}$/i,Z='0x'+'0'.repeat(40),MAX=(1n<<256n)-1n;
const hex=b=>'0x'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export const RELEASED_TOPIC=hex(keccak_256(new TextEncoder().encode('Released(address,uint256)')));
const selector=s=>hex(keccak_256(new TextEncoder().encode(s))).slice(0,10);
export const INCOME_ABI=Object.freeze({config:selector('config()'),quote:selector('creatorQuote()'),token:selector('creatorToken()'),release:selector('release()'),buybackPot:selector('buybackPot()'),lastBuyback:selector('lastBuyback()')});
export const incomeRaw=v=>{if(typeof v==='bigint'&&v>=0n&&v<=MAX)return v;if(typeof v!=='string'||!(/^(?:0|[1-9][0-9]{0,77})$/.test(v)||/^0x[0-9a-f]{1,64}$/i.test(v)))throw Error('invalid_amount');const n=BigInt(v);if(n>MAX)throw Error('invalid_amount');return n;};
const words=data=>{if(typeof data!=='string'||!/^0x(?:[0-9a-f]{64})+$/i.test(data))throw Error('invalid_abi');return data.slice(2).match(/.{64}/g).map(w=>'0x'+w);};
const address=w=>{if(!/^0x0{24}[0-9a-f]{40}$/i.test(w))throw Error('invalid_address_word');return '0x'+w.slice(-40).toLowerCase();};
export function decodeIncomeConfig(data,{token,quote}={}){
  const w=words(data);if(w.length!==BLOCK_FIELDS.length+16)throw Error('unsupported_config_layout');
  const cfg=Object.fromEntries(BLOCK_FIELDS.map(([name,type],i)=>[name,type==='address'?address(w[i]):incomeRaw(w[i]).toString()]));
  if(!A.test(token||'')||!A.test(quote||'')||cfg.token!==token.toLowerCase()||cfg.quote!==quote.toLowerCase())throw Error('currency_mismatch');
  const accounts=w.slice(BLOCK_FIELDS.length,BLOCK_FIELDS.length+8).map(address),shares=w.slice(BLOCK_FIELDS.length+8).map(incomeRaw),payees=[];let ended=false;
  for(let i=0;i<8;i++){if(accounts[i]===Z){if(shares[i])throw Error('invalid_split');ended=true;continue;}if(ended||!shares[i]||shares[i]>10000n||payees.some(p=>p.address===accounts[i]))throw Error('invalid_split');payees.push({address:accounts[i],bps:Number(shares[i])});}
  if(!payees.length||payees.reduce((s,p)=>s+p.bps,0)!==10000)throw Error('invalid_split');
  return {cfg,payees,buybackEnabled:(BigInt(cfg.mask)&(1n<<BigInt(BLOCK_BITS.buyback)))!==0n,fingerprint:hex(keccak_256(new Uint8Array(data.slice(2).match(/../g).map(v=>parseInt(v,16)))))};
}
// Exact Solidity _split: each non-final share floors separately; final gets remainder.
export function splitIncome(raw,payees){
  const n=incomeRaw(raw);if(!Array.isArray(payees)||!payees.length||payees.length>8||payees.reduce((s,p)=>s+p.bps,0)!==10000||payees.some(p=>!A.test(p.address)||!Number.isInteger(p.bps)||p.bps<=0))throw Error('invalid_split');
  let left=n;return payees.map((p,i)=>{const amount=i===payees.length-1?left:n*BigInt(p.bps)/10000n;left-=amount;return {address:p.address,raw:amount.toString()};});
}
export function appendIncomeLogs(state,logs,{address:contract,token,quote,payees,from,to}){
  if(!Array.isArray(logs)||logs.length>2000)throw Error('log_limit');
  const next=structuredClone(state),seen=new Set();next.released||={};next.paid||={};
  for(const l of logs){
    if(l.removed===true||String(l.address).toLowerCase()!==contract.toLowerCase()||l.topics?.length!==2||l.topics[0]?.toLowerCase()!==RELEASED_TOPIC||!H.test(l.transactionHash||'')||!H.test(l.blockHash||'')||!/^0x[0-9a-f]+$/i.test(l.blockNumber||'')||!/^0x[0-9a-f]+$/i.test(l.logIndex||''))throw Error('invalid_release_log');
    const block=Number(BigInt(l.blockNumber)),idx=Number(BigInt(l.logIndex));if(!Number.isSafeInteger(block)||block<from||block>to||!Number.isSafeInteger(idx)||idx<0)throw Error('release_out_of_range');
    const id=l.transactionHash.toLowerCase()+':'+idx;if(seen.has(id))throw Error('duplicate_release_log');seen.add(id);
    const currency=address(l.topics[1]);if(![token.toLowerCase(),quote.toLowerCase()].includes(currency)||!/^0x[0-9a-f]{64}$/i.test(l.data||''))throw Error('unexpected_release_currency');
    const raw=incomeRaw(l.data);next.released[currency]=(incomeRaw(next.released[currency]||'0')+raw).toString();
    for(const p of splitIncome(raw,payees)){const key=currency+':'+p.address;next.paid[key]=(incomeRaw(next.paid[key]||'0')+incomeRaw(p.raw)).toString();}
  }
  next.cursor=to;return next;
}
export function incomeSnapshot(state,{quotePending,tokenPending,config,token,quote,complete,block,blockHash,timestamp}){
  const currencies=[{address:quote,pending:incomeRaw(quotePending)},{address:token,pending:incomeRaw(tokenPending)}].map(c=>{
    const address=c.address.toLowerCase(),paid=complete?incomeRaw(state.released?.[address]||'0'):null;
    return {address,pending:c.pending.toString(),paid:paid?.toString()??null,earned:paid==null?null:(paid+c.pending).toString(),payees:splitIncome(c.pending,config.payees).map(p=>{const prior=complete?incomeRaw(state.paid?.[address+':'+p.address]||'0'):null;return{...p,pending:p.raw,paid:prior?.toString()??null,earned:prior==null?null:(prior+incomeRaw(p.raw)).toString()};})};
  });
  return {schema:1,status:complete?'ready':'Loading history',complete,block,blockHash,timestamp,currencies,payees:config.payees,configFingerprint:config.fingerprint,throughBlock:state.cursor};
}
