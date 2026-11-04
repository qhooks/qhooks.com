// SOURCE ONLY: receipt-level evidence for the separately admitted direct-swap flow.
// Canonical-chain admission, reviewed calldata, runtime identities and finality live elsewhere.
import {abiWord} from '../launchpad/abi-word.mjs';
import {normalizeSwapFields} from './swap-fields.mjs';
import {readSwapQuote} from './journal.mjs';
import {keccak_256} from '../../prototypes/qpools/client/vendor/hashes/sha3.js';

const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
const ZERO='0x'+'00'.repeat(20);
// Current launches pay the protocol fee straight to the platform wallet inside the swap (PoolManager.take);
// earlier ones minted it to the launch's fee collector as an ERC6909 balance.
const PLATFORM='0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71',FLYWHEEL='0xb85e67cf7728572033a9d36aee3218dadf85baa2'; // the protocol fee goes to the flywheel on Robinhood Chain
const hex=bytes=>'0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const topic=signature=>hex(keccak_256(new TextEncoder().encode(signature)));
const TOPICS=Object.freeze({
 erc20Approval:topic('Approval(address,address,uint256)'),
 permit2Approval:topic('Approval(address,address,address,uint160,uint48)'),
 swap:topic('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)'),
 erc20Transfer:topic('Transfer(address,address,uint256)'),
 protocolFee:topic('ProtocolFeeAccrued(address,uint256)'),
 erc6909Transfer:topic('Transfer(address,address,address,uint256,uint256)')
});
const kindSet=new Set(['erc20-reset','erc20-approve','permit2-approve','swap']);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
function own(value,name,label){
 ensure(plain(value),label+' must be a plain object');
 const d=Object.getOwnPropertyDescriptor(value,name);
 ensure(d?.enumerable&&Object.hasOwn(d,'value'),label+' requires data field '+name);
 return d.value;
}
function exact(value,names,label){
 ensure(plain(value),label+' must be a plain object');
 const d=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(d);
 ensure(keys.length===names.length&&keys.every(key=>typeof key==='string'&&names.includes(key)&&d[key].enumerable&&Object.hasOwn(d[key],'value')),label+' has invalid fields');
 return Object.fromEntries(names.map(name=>[name,d[name].value]));
}
function address(value,label,{zero=false}={}){
 ensure(typeof value==='string'&&value.length===42&&/^0x[0-9a-f]{40}$/.test(value)&&(zero||BigInt(value)!==0n),label+' must be a canonical address');
 return value;
}
function digest(value,label){ensure(typeof value==='string'&&value.length===66&&/^0x[0-9a-f]{64}$/.test(value),label+' must be bytes32');return value;}
function quantity(value,label){
 ensure(typeof value==='string'&&value.length>=3&&value.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value),'Invalid '+label);
 return value;
}
function decimal(value,max,label,{positive=false}={}){
 ensure(typeof value==='string'&&value.length>0&&value.length<=78&&/^(0|[1-9][0-9]*)$/.test(value),label+' must be a canonical decimal string');
 const n=BigInt(value);ensure(n<=max&&(!positive||n>0n),label+' is out of range');return n;
}
const indexedAddress=value=>'0x'+abiWord('address',value);
const indexedUint=value=>'0x'+abiWord('uint256',value.toString());
function words(data,count,label){
 ensure(typeof data==='string'&&data.length===2+64*count&&/^0x[0-9a-f]*$/.test(data),label+' has invalid ABI data');
 return Array.from({length:count},(_,i)=>data.slice(2+i*64,2+(i+1)*64));
}
function decodedWord(raw,type,label){
 let value;
 if(type==='address')value='0x'+raw.slice(24);
 else if(type.startsWith('int'))value=BigInt.asIntN(256,BigInt('0x'+raw)).toString();
 else value=BigInt('0x'+raw).toString();
 ensure(abiWord(type,value)===raw,label+' has non-canonical ABI padding');
 return value;
}
function decodedData(data,types,label){return words(data,types.length,label).map((raw,i)=>decodedWord(raw,types[i],label));}
function logRecord(raw,receipt,index,seen){
 ensure(plain(raw),'Receipt log must be a plain object');
 const log={
  address:address(own(raw,'address','Receipt log'),'Log address'),
  topics:own(raw,'topics','Receipt log'),data:own(raw,'data','Receipt log'),
  removed:own(raw,'removed','Receipt log'),transactionHash:own(raw,'transactionHash','Receipt log'),
  blockHash:own(raw,'blockHash','Receipt log'),blockNumber:own(raw,'blockNumber','Receipt log'),
  transactionIndex:own(raw,'transactionIndex','Receipt log'),logIndex:own(raw,'logIndex','Receipt log')
 };
 ensure(Array.isArray(log.topics)&&log.topics.length>=1&&log.topics.length<=4&&log.topics.every(v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v)),'Canonical log topics required');
 ensure(typeof log.data==='string'&&/^0x(?:[0-9a-f]{64})*$/.test(log.data),'Canonical ABI log data required');
 ensure(log.removed===false&&log.transactionHash===receipt.transactionHash&&log.blockHash===receipt.blockHash&&log.blockNumber===receipt.blockNumber&&log.transactionIndex===receipt.transactionIndex,'Receipt log identity mismatch');
 quantity(log.transactionIndex,'log transaction index');quantity(log.logIndex,'log index');
 ensure(!seen.has(log.logIndex),'Duplicate receipt log index');seen.add(log.logIndex);
 return Object.freeze({...log,index});
}
function event(log,emitter,topics,types,label){
 ensure(log.address===emitter&&log.topics.length===topics.length&&log.topics.every((value,i)=>value===topics[i]),label+' identity mismatch');
 return decodedData(log.data,types,label);
}
function one(logs,signature,label){const matches=logs.filter(log=>log.topics[0]===signature);ensure(matches.length===1,'Exactly one '+label+' required');return matches[0];}
function freeze(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}
 return value;
}

export function swapReceiptOutcome({receipt,record,owner,manager,router,permit2,collector,fields:rawFields,poolId,blocks=null}){
 const fields=normalizeSwapFields(rawFields),entry=exact(record,['kind','quote','stage'],'Swap record');
 ensure(kindSet.has(entry.kind),'Unknown swap record kind');
 const quote=readSwapQuote(entry.quote,fields),stage=exact(entry.stage,['transaction','status','hash'],'Swap stage');
 ensure(stage.status==='submitted','Only a submitted swap stage can have an outcome');
 const transaction=stage.transaction;
 owner=address(owner,'Owner');manager=address(manager,'Pool manager');router=address(router,'Universal Router');permit2=address(permit2,'Permit2');collector=address(collector,'Fee collector');poolId=digest(poolId,'Pool id');
 const key=quote.poolKey,input=fields.zeroForOne?key.currency0:key.currency1,output=fields.zeroForOne?key.currency1:key.currency0,hook=key.hooks;
 ensure(new Set([owner,manager,router,permit2,collector,key.currency0,key.currency1,hook]).size===8,'Receipt identities must be distinct');
 const target=address(own(transaction,'to','Reviewed transaction'),'Reviewed transaction target');
 ensure(address(own(transaction,'from','Reviewed transaction'),'Reviewed transaction sender')===owner,'Reviewed transaction owner mismatch');
 const expectedTarget=entry.kind==='swap'?router:entry.kind==='permit2-approve'?permit2:input;
 ensure(target===expectedTarget,'Reviewed transaction target mismatch');
 ensure(stage.hash!==null&&digest(stage.hash,'Submitted transaction hash')===own(receipt,'transactionHash','Receipt'),'Receipt transaction hash mismatch');
 const normalizedReceipt={
  transactionHash:stage.hash,blockHash:digest(own(receipt,'blockHash','Receipt'),'Receipt block hash'),
  blockNumber:quantity(own(receipt,'blockNumber','Receipt'),'receipt block number'),
  transactionIndex:quantity(own(receipt,'transactionIndex','Receipt'),'receipt transaction index')
 };
 ensure(own(receipt,'status','Receipt')==='0x1'&&address(own(receipt,'from','Receipt'),'Receipt sender')===owner&&address(own(receipt,'to','Receipt'),'Receipt target')===target,'Unsuccessful or mismatched receipt');
 const rawLogs=own(receipt,'logs','Receipt');ensure(Array.isArray(rawLogs)&&rawLogs.length>0&&rawLogs.length<=128,'Bounded receipt logs required');
 const seen=new Set(),logs=rawLogs.map((raw,index)=>logRecord(raw,normalizedReceipt,index,seen));
 const common={kind:entry.kind,hash:stage.hash,blockHash:normalizedReceipt.blockHash,blockNumber:normalizedReceipt.blockNumber,owner,target,poolId};

 if(entry.kind==='erc20-reset'||entry.kind==='erc20-approve'){
  const expected=entry.kind==='erc20-reset'?0n:BigInt(fields.amountIn);
  const approvalLogs=logs.filter(log=>log.topics[0]===TOPICS.erc20Approval);
  ensure(approvalLogs.length===1,'Exactly one ERC20 approval required');
  const values=event(approvalLogs[0],input,[TOPICS.erc20Approval,indexedAddress(owner),indexedAddress(permit2)],['uint256'],'ERC20 approval');
  ensure(BigInt(values[0])===expected,'ERC20 approval amount mismatch');
  return freeze({...common,approval:{layer:'erc20',token:input,spender:permit2,amount:expected.toString(),expiration:null,revoked:expected===0n},swap:null});
 }
 if(entry.kind==='permit2-approve'){
  const expiration=decimal(quote.approvalExpiration,(1n<<48n)-1n,'Approval expiration'),amount=BigInt(fields.amountIn);
  const approvalLogs=logs.filter(log=>log.topics[0]===TOPICS.permit2Approval);
  ensure(approvalLogs.length===1,'Exactly one Permit2 approval required');
  const values=event(approvalLogs[0],permit2,[TOPICS.permit2Approval,indexedAddress(owner),indexedAddress(input),indexedAddress(router)],['uint160','uint48'],'Permit2 approval');
  ensure(BigInt(values[0])===amount&&BigInt(values[1])===expiration,'Permit2 approval values mismatch');
  return freeze({...common,approval:{layer:'permit2',token:input,spender:router,amount:amount.toString(),expiration:expiration.toString(),revoked:false},swap:null});
 }

 // A reviewed single-router call cannot legitimately contain another pool-token transfer
 // or another copy of an application event. Reject them instead of choosing a convenient log.
 for(const log of logs){
  if(log.topics[0]===TOPICS.swap)ensure(log.address===manager,'Swap event has wrong emitter');
  if(log.topics[0]===TOPICS.protocolFee)ensure(log.address===hook,'Protocol fee event has wrong emitter');
  if(log.topics[0]===TOPICS.erc6909Transfer)ensure(log.address===manager,'ERC6909 event has wrong emitter');
  if(log.topics[0]===TOPICS.erc20Transfer)ensure(log.address===input||log.address===output,'Unrelated ERC20 transfer in swap receipt');
  ensure(log.topics[0]!==TOPICS.permit2Approval,'Unexpected Permit2 approval in swap receipt');
 }
 const swapLog=one(logs,TOPICS.swap,'PoolManager Swap event');
 const swapValues=event(swapLog,manager,[TOPICS.swap,poolId,indexedAddress(router)],['int128','int128','uint160','uint128','int24','uint24'],'PoolManager Swap');
 const amount0=BigInt(swapValues[0]),amount1=BigInt(swapValues[1]);
 ensure(fields.zeroForOne?amount0<0n&&amount1>0n:amount1<0n&&amount0>0n,'Swap direction or deltas mismatch');
 const rawIn=fields.zeroForOne?-amount0:-amount1,rawOut=fields.zeroForOne?amount1:amount0,requested=BigInt(fields.amountIn);
 ensure(rawIn>0n&&rawIn<=requested,'Swap input exceeds the requested exact-input bound');
 const allowanceLogs=logs.filter(log=>log.topics[0]===TOPICS.erc20Approval);
 ensure(allowanceLogs.length<=1,'At most one finite input-token allowance update is permitted');
 ensure(BigInt(swapValues[5])===BigInt(key.fee),'Pool fee differs from admitted pool key');
 const protocolPpm=BigInt(key.fee)/5n,protocolFee=rawOut*protocolPpm/1000000n,minimum=BigInt(quote.minimumOut);
 // Blocks pools (hook flags 10956) also charge in the input before the swap, in the output after it, and may
 // burn output tokens. Every charge must be an ERC6909 mint from the hook to the pool's blocks contract or a
 // transfer from the PoolManager to the dead address, and together they must account for every unit exactly.
 const blocksPool=(BigInt(hook)&16383n)===10956n;let netOut=rawOut-protocolFee,userIn=rawIn,preCharge=0n,postCharge=0n,burned=0n;
 const allTransfers=logs.filter(log=>log.topics[0]===TOPICS.erc20Transfer);
 const feeTransfer=protocolFee>0n?allTransfers.find(log=>log.address===output&&log.topics.length===3&&log.topics[1]===indexedAddress(manager)&&(log.topics[2]===indexedAddress(PLATFORM)||log.topics[2]===indexedAddress(FLYWHEEL))&&log.data==='0x'+indexedUint(protocolFee).slice(2))||null:null;
 const transfers=allTransfers.filter(log=>log!==feeTransfer);
 if(blocksPool){
  const DEAD='0x000000000000000000000000000000000000dead';
  ensure(blocks===null||BigInt(address(blocks,'Blocks contract',{zero:true}))===0n||blocks!==owner,'Blocks contract identity');
  const burns=transfers.filter(log=>log.topics.length===3&&log.topics[1]===indexedAddress(manager)&&log.topics[2]===indexedAddress(DEAD));
  ensure(burns.length<=1&&transfers.length===2+burns.length,'Unexpected pool-token transfer in blocks swap');
  if(burns.length){ensure(burns[0].address===output,'Blocks burn must be in the output token');burned=BigInt(event(burns[0],output,[TOPICS.erc20Transfer,indexedAddress(manager),indexedAddress(DEAD)],['uint256'],'Blocks burn')[0]);}
  const blockMints=logs.filter(log=>log.topics[0]===TOPICS.erc6909Transfer&&log.topics[2]!==indexedAddress(collector));
  ensure(blockMints.length<=2&&(blockMints.length===0||blocks&&BigInt(blocks)!==0n),'Unexpected blocks charge');
  for(const m of blockMints){
   ensure(m.topics.length===4&&m.topics[1]===indexedAddress(ZERO)&&m.topics[2]===indexedAddress(blocks),'Blocks charge must mint to the blocks contract');
   const [caller,amount]=decodedData(m.data,['address','uint256'],'Blocks charge');ensure(caller===hook,'Blocks charge must come from the hook');
   if(m.topics[3]===indexedUint(BigInt(input))){ensure(preCharge===0n,'One input charge at most');preCharge=BigInt(amount);}
   else{ensure(m.topics[3]===indexedUint(BigInt(output))&&postCharge===0n,'Blocks charge currency mismatch');postCharge=BigInt(amount);}
  }
  userIn=rawIn+preCharge;netOut=rawOut-protocolFee-postCharge-burned;
  ensure(userIn<=requested&&netOut>0n,'Blocks charges exceed the trade');
 }
 ensure(netOut>=minimum,'Net swap output is below the reviewed minimum');
 if(!blocksPool)ensure(transfers.length===2,'Exactly two pool-token transfers required');
 const remaining=requested-userIn;
 if(allowanceLogs.length===1){
  const values=event(allowanceLogs[0],input,[TOPICS.erc20Approval,indexedAddress(owner),indexedAddress(permit2)],['uint256'],'Finite input-token allowance update');
  ensure(BigInt(values[0])===remaining,'Finite input-token allowance remainder mismatch');
 }
 const inMatches=transfers.filter(log=>log.address===input&&log.topics.length===3&&log.topics[1]===indexedAddress(owner)&&log.topics[2]===indexedAddress(manager));
 const outMatches=transfers.filter(log=>log.address===output&&log.topics.length===3&&log.topics[1]===indexedAddress(manager)&&log.topics[2]===indexedAddress(owner));
 ensure(inMatches.length===1&&outMatches.length===1,'Swap token transfer parties mismatch');
 ensure(BigInt(event(inMatches[0],input,[TOPICS.erc20Transfer,indexedAddress(owner),indexedAddress(manager)],['uint256'],'Input transfer')[0])===userIn,'Input transfer amount mismatch');
 ensure(BigInt(event(outMatches[0],output,[TOPICS.erc20Transfer,indexedAddress(manager),indexedAddress(owner)],['uint256'],'Output transfer')[0])===netOut,'Output transfer amount mismatch');
 const feeLogs=logs.filter(log=>log.topics[0]===TOPICS.protocolFee),mintLogs=logs.filter(log=>log.topics[0]===TOPICS.erc6909Transfer&&(!blocksPool||log.topics[2]===indexedAddress(collector)));
 if(protocolFee===0n)ensure(feeLogs.length===0&&mintLogs.length===0,'Zero rounded protocol fee must not emit fee evidence');
 else{
  // One fee event, paid exactly one way: straight to the platform wallet, or (earlier launches) minted to the collector.
  ensure(feeLogs.length===1&&(feeTransfer?mintLogs.length===0:mintLogs.length===1),'Exactly one fee event and one fee payment required');
  const feeValue=event(feeLogs[0],hook,[TOPICS.protocolFee,indexedAddress(output)],['uint256'],'Protocol fee')[0];
  ensure(BigInt(feeValue)===protocolFee,'Protocol fee evidence mismatch');
  if(!feeTransfer){
   const mintValue=event(mintLogs[0],manager,[TOPICS.erc6909Transfer,indexedAddress(ZERO),indexedAddress(collector),indexedUint(BigInt(output))],['address','uint256'],'ERC6909 fee mint');
   ensure(mintValue[0]===hook&&BigInt(mintValue[1])===protocolFee,'Protocol fee evidence mismatch');
  }
 }
 return freeze({...common,approval:null,swap:{zeroForOne:fields.zeroForOne,inputCurrency:input,outputCurrency:output,requestedAmountIn:requested.toString(),actualAmountIn:userIn.toString(),partial:userIn<requested,remainingErc20Allowance:allowanceLogs.length===1?remaining.toString():null,rawAmountOut:rawOut.toString(),protocolFeePpm:protocolPpm.toString(),protocolFee:protocolFee.toString(),netAmountOut:netOut.toString(),quotedNetAmountOut:quote.expectedAmount,minimumOut:minimum.toString(),slippageBps:fields.slippageBps,sqrtPriceX96:swapValues[2],liquidity:swapValues[3],tick:swapValues[4],lpFee:swapValues[5],collector}});
}
