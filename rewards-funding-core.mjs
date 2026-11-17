import {C,word,addressWord,callData} from './safe-lock-core.mjs';
import {multiSendData} from './qdrops-fund.mjs';
import {keccakHex,safeHashCall,safeExecData} from './qdrops-core.mjs';
import {REWARDS_POLICY_ID,WEEKLY_FUNDING_QHOOKS_RAW,REWARDS_BUDGET} from './rewards-budget.mjs';

export const FUNDING=Object.freeze({chainId:'4663',safe:C.safe,token:C.token,drops:C.drops,multi:C.multi,amountRaw:WEEKLY_FUNDING_QHOOKS_RAW});
export const FUNDING_OWNERS=Object.freeze(['0x88db60586866294409e47bbbb0b436104f09c1b5','0x9b13398df547c18e68d1cfe086ff1cb5f1a84127']);
// This page is one reviewed funding proposal, not a generic weekly authorizer.
// A changed week/nonce/deposit baseline needs a separately reconciled release.
export const FUNDING_REVIEW_SCOPE=Object.freeze({weekStart:'2026-11-16',safeNonce:'17',fundedBeforeRaw:'1000000000000000000000000'});
const HASH=/^0x[0-9a-f]{64}$/i,RAW=/^(0|[1-9]\d{0,77})$/;
const topic=s=>keccakHex(new TextEncoder().encode(s));
export const FUNDING_EVENTS=Object.freeze({deposit:topic('Deposited(address,address,uint256,uint256)'),transfer:topic('Transfer(address,address,uint256)'),success:topic('ExecutionSuccess(bytes32,uint256)'),failure:topic('ExecutionFailure(bytes32,uint256)')});
const requireValue=(value,message)=>{if(!value)throw Error(message);};
const uint=value=>{requireValue(RAW.test(String(value))&&BigInt(value)<1n<<256n,'Invalid exact token amount or nonce.');return BigInt(value);};
export function validateFundingReview(review){
 requireValue(review?.version===1&&review.policyId===REWARDS_POLICY_ID,'This is not the approved fixed-QHOOKS rewards policy.');
 for(const key of ['chainId','safe','token','drops','amountRaw'])requireValue(review[key]===FUNDING[key],'The reviewed funding destination or amount changed.');
 for(const [key,value]of Object.entries(FUNDING_REVIEW_SCOPE))requireValue(review[key]===value,'The fixed funding week, nonce or deposit baseline changed. Obtain a reconciled review.');
 requireValue(/^\d{4}-\d{2}-\d{2}$/.test(review.weekStart||''),'Invalid funding week.');
 const start=Date.parse(review.weekStart+'T00:00:00Z');requireValue(Number.isFinite(start)&&new Date(start).toISOString().slice(0,10)===review.weekStart&&new Date(start).getUTCDay()===1,'The funding week must start Monday UTC.');
 uint(review.safeNonce);uint(review.fundedBeforeRaw);
 requireValue(review.source==='safe-existing-balance'&&review.lockFundingStatus==='not-collected','Funding source needs a new review.');
 requireValue(HASH.test(review.sourceBlockHash||'')&&RAW.test(review.sourceBlockNumber||'')&&Number.isFinite(Date.parse(review.createdAt||'')),'Missing on-chain funding review.');
 requireValue(JSON.stringify(review.allocations)===JSON.stringify(REWARDS_BUDGET.allocationsRaw),'The approved allocation split changed.');
 requireValue(!Object.hasOwn(review,'usd')&&!Object.hasOwn(review,'usdCents')&&!Object.hasOwn(review,'transactions'),'Superseded or injected award plan.');
 return review;
}
export function fundingTransaction(review){
 validateFundingReview(review);const amount=uint(review.amountRaw);
 const calls=[
  [C.token,callData('approve(address,uint256)',addressWord(C.drops),word(amount))],
  [C.drops,callData('deposit(address,uint256)',addressWord(C.token),word(amount))],
  [C.token,callData('approve(address,uint256)',addressWord(C.drops),word(0))],
 ];
 return {to:C.multi,value:0,operation:1,data:multiSendData(calls),amount,calls};
}
export function fundingState(review,state){
 validateFundingReview(review);const nonce=uint(state.nonce),funded=uint(state.funded),amount=uint(review.amountRaw);
 if(nonce!==uint(review.safeNonce))return {ready:false,reason:'The Safe nonce changed. Reconcile this week’s funding before preparing a replacement proposal.'};
 if(funded!==uint(review.fundedBeforeRaw))return {ready:false,reason:'QDrops funding changed. Reconcile deposits before preparing a replacement proposal.'};
 if(state.listed!==true||String(state.dropsOwner).toLowerCase()!==C.safe)return {ready:false,reason:'QDrops token listing or owner changed.'};
 if(state.paused!==false||state.rooterFrozen!==false)return {ready:false,reason:'QDrops distribution is paused, frozen or unreadable. Review it before funding.'};
 if(uint(state.allowance)!==0n)return {ready:false,reason:'The existing QDrops allowance needs review.'};
 if(uint(state.safeBalance)<amount)return {ready:false,reason:'The Safe holds less than 750,000 QHOOKS.'};
 requireValue(state.ownersVerified===true&&state.contractCodesVerified===true,'Contract or Safe-owner checks are incomplete.');
 return {ready:true,reason:'Deposit exactly 750,000 QHOOKS into QDrops for this funding week.',tx:fundingTransaction(review)};
}
export const fundingHashCall=(review)=>safeHashCall(fundingTransaction(review),uint(review.safeNonce));
export function fundingExecutionData(review){return safeExecData(fundingTransaction(review),FUNDING_OWNERS);}
export function fundingProposalKey(review,hash){validateFundingReview(review);requireValue(HASH.test(hash||''),'Invalid Safe hash.');return [review.policyId,review.weekStart,review.safeNonce,hash.toLowerCase(),review.fundedBeforeRaw,review.amountRaw].join(':');}
export function fundingShareLink(href,review,hash){fundingProposalKey(review,hash);const url=new URL(href);url.search='';url.searchParams.set('week',review.weekStart);url.searchParams.set('nonce',review.safeNonce);url.searchParams.set('safeHash',hash.toLowerCase());return url.href;}
export function validateFundingLink(search,review,hash){
 const q=new URLSearchParams(search);if(!q.toString())return true;
 requireValue([...q.keys()].every(k=>['week','nonce','safeHash'].includes(k))&&[...q.keys()].length===3&&q.get('week')===review.weekStart&&q.get('nonce')===review.safeNonce&&q.get('safeHash')?.toLowerCase()===hash.toLowerCase(),'This shared proposal differs from the reviewed week, nonce or Safe hash.');return true;
}
export function verifyFundingReceipt(review,receipt,{safeHash,expectedTxHash}={}){
 try{
  validateFundingReview(review);if(!HASH.test(safeHash||'')||receipt?.status!=='0x1'||receipt.to?.toLowerCase()!==C.safe||!HASH.test(receipt.transactionHash||'')||!HASH.test(receipt.blockHash||'')||!/^0x[0-9a-f]+$/i.test(receipt.blockNumber||'')||expectedTxHash&&receipt.transactionHash.toLowerCase()!==expectedTxHash.toLowerCase()||!Array.isArray(receipt.logs)||receipt.logs.length>1000)return null;
  const logs=receipt.logs.filter(l=>!l.removed),match=(l,address,t)=>l.address?.toLowerCase()===address&&l.topics?.[0]?.toLowerCase()===t;
  const safeEvent=l=>l.topics.length===2&&HASH.test(l.topics[1]||'')&&l.topics[1].toLowerCase()===safeHash.toLowerCase()&&/^0x[0-9a-f]{64}$/i.test(l.data||'')&&BigInt(l.data)===0n;
  const successes=logs.filter(l=>match(l,C.safe,FUNDING_EVENTS.success));
  if(successes.length!==1||!safeEvent(successes[0])||logs.some(l=>match(l,C.safe,FUNDING_EVENTS.failure)))return null;
  const deposits=logs.filter(l=>match(l,C.drops,FUNDING_EVENTS.deposit));
  if(deposits.length!==1)return null;const deposit=deposits[0];
  if(deposit.topics.length!==3||deposit.topics[1].toLowerCase()!=='0x'+addressWord(C.token)||deposit.topics[2].toLowerCase()!=='0x'+addressWord(C.safe)||!/^0x[0-9a-f]{128}$/i.test(deposit.data||''))return null;
  const amount=BigInt('0x'+deposit.data.slice(2,66)),funded=BigInt('0x'+deposit.data.slice(66));
  if(amount!==uint(review.amountRaw)||funded!==uint(review.fundedBeforeRaw)+amount)return null;
  const transfers=logs.filter(l=>match(l,C.token,FUNDING_EVENTS.transfer)&&l.topics?.[1]?.toLowerCase()==='0x'+addressWord(C.safe)&&l.topics?.[2]?.toLowerCase()==='0x'+addressWord(C.drops));
  if(transfers.length!==1||transfers[0].topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(transfers[0].data||'')||BigInt(transfers[0].data)!==amount)return null;
  return {confirmed:true,weekStart:review.weekStart,policyId:review.policyId,transactionHash:receipt.transactionHash.toLowerCase(),blockNumber:receipt.blockNumber,blockHash:receipt.blockHash.toLowerCase(),safeHash:safeHash.toLowerCase(),amountRaw:amount.toString(),fundedRaw:funded.toString()};
 }catch{return null;}
}
