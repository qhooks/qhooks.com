// Arc Zero8 emits an EIP-7708 native18 mirror alongside its USDC ERC20six event.
// Match that mirror exactly, then use the unchanged strict pool/token parser.
// No arbitrary transfer filtering, alternate emitter or other-chain exception.
import {swapReceiptOutcome as ordinaryOutcome} from './receipt-outcome.mjs';
const USDC='0x3600000000000000000000000000000000000000';
const SYSTEM='0xfffffffffffffffffffffffffffffffffffffffe';
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SCALE=1000000000000n,CHAINS=new Set(['8453','4663','1','42161','56','5042']);
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
function own(o,k){ensure(o&&Object.getPrototypeOf(o)===Object.prototype,'Plain receipt data required');const d=Object.getOwnPropertyDescriptor(o,k);ensure(d?.enumerable&&Object.hasOwn(d,'value'),'Receipt data field required: '+k);return d.value;}
const quantity=x=>typeof x==='string'&&x.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x);
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
function transfer(log){
 const topics=own(log,'topics'),data=own(log,'data');
 ensure(Array.isArray(topics)&&topics.length===3&&topics[0]===TRANSFER&&topics.slice(1).every(x=>typeof x==='string'&&/^0x0{24}[0-9a-f]{40}$/.test(x)),'Arc transfer topics must be canonical');
 ensure(hash(data),'Arc transfer amount must be uint256');
 return {log,topics,amount:BigInt(data)};
}
export function swapReceiptOutcomeForChain(args){
 const chainId=own(args,'chainId'),record=own(args,'record'),transaction=own(own(record,'stage'),'transaction'),transactionChain=own(transaction,'chainId');
 ensure(CHAINS.has(chainId)&&quantity(transactionChain)&&BigInt(transactionChain).toString()===chainId,'Receipt chain differs from reviewed transaction');
 if(chainId!=='5042')return ordinaryOutcome(args);
 const key=own(own(record,'quote'),'poolKey');ensure([own(key,'currency0'),own(key,'currency1')].includes(USDC),'Arc receipt requires its admitted shared USDC asset');
 const receipt=own(args,'receipt'),r=Object.fromEntries(['status','from','to','transactionHash','blockHash','blockNumber','transactionIndex','logs'].map(k=>[k,own(receipt,k)]));
 ensure(r.status==='0x1'&&hash(r.transactionHash)&&hash(r.blockHash)&&quantity(r.blockNumber)&&quantity(r.transactionIndex),'Arc receipt identity required');
 ensure(Array.isArray(r.logs)&&r.logs.length>0&&r.logs.length<=128,'Bounded Arc receipt logs required');
 const seen=new Set(),native=[],tokens=[],ordinary=[];
 for(const log of r.logs){
  const emitter=own(log,'address'),index=own(log,'logIndex');ensure(quantity(index)&&!seen.has(index),'Duplicate or invalid receipt log index');seen.add(index);
  if(emitter===SYSTEM){
   ensure(own(log,'removed')===false&&own(log,'transactionHash')===r.transactionHash&&own(log,'blockHash')===r.blockHash&&own(log,'blockNumber')===r.blockNumber&&own(log,'transactionIndex')===r.transactionIndex,'Arc native mirror identity mismatch');
   native.push(transfer(log));
  }else{
   ordinary.push(log);if(emitter===USDC&&own(log,'topics')?.[0]===TRANSFER)tokens.push(transfer(log));
  }
 }
 ensure(native.length===tokens.length,'Exactly one Arc native mirror per USDC transfer required');
 const matched=new Set();
 for(const n of native){
  const matches=tokens.filter(t=>n.topics[1]===t.topics[1]&&n.topics[2]===t.topics[2]&&n.amount===t.amount*SCALE&&n.amount>0n);
  ensure(matches.length===1&&!matched.has(matches[0].log),'Arc native mirror parties or scaled amount mismatch');
  const token=matches[0].log;ensure(BigInt(own(n.log,'logIndex'))<BigInt(own(token,'logIndex')),'Arc native mirror must precede its ERC20 event');matched.add(token);
 }
 ensure(matched.size===tokens.length,'Unmatched Arc USDC transfer');
 // All removed events were individually checked against both the receipt and
 // the exact ERC20 transfer. The original parser still rejects unrelated logs,
 // wrong parties/amounts/fees, duplicate events and unsupported token behavior.
 return ordinaryOutcome({...args,receipt:{...r,logs:ordinary}});
}
