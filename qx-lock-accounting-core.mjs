// QHOOKS QLocks v1 accounting. Pure: no network, wallet, storage, timers or transaction builders.
import {decodeLock,vestedAt,FUND} from './qdrops-fund.mjs';
export const TARGET=Object.freeze({chainId:'4663',contract:FUND.qlocks,token:FUND.qhooks,ids:[0,1,2,3,4]});
const amount=v=>{if(typeof v==='bigint'&&v>=0n)return v;if(typeof v==='string'&&/^\d+$/.test(v))return BigInt(v);throw Error('Invalid exact amount');};
const uint=h=>{if(!/^0x[0-9a-f]{64}$/i.test(h))throw Error('Incomplete uint256');return BigInt(h);};
const seconds=v=>{if(!Number.isSafeInteger(v)||v<0)throw Error('Invalid block or schedule time');return v;};
const json=v=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x));
const address=a=>typeof a==='string'&&/^0x[0-9a-f]{40}$/i.test(a)&&BigInt(a)!==0n;

export function accountLock({id,get,vested},at){
 if(!TARGET.ids.includes(id)||!/^0x[0-9a-f]{640}$/i.test(get))throw Error('Incomplete QLocks v1 row');
 const raw=get.slice(2).match(/.{64}/g);if(BigInt('0x'+raw[0])>=2n**160n||BigInt('0x'+raw[3])>=2n**160n)throw Error('Invalid ABI address');
 for(const [index,bits]of [[1,64],[2,32],[4,32],[5,32],[6,128],[7,128],[8,128],[9,64]])if(BigInt('0x'+raw[index])>=2n**BigInt(bits))throw Error('Invalid ABI integer');
 const l=decodeLock(get);for(const k of ['start','cliff','duration','notice','readyAt'])seconds(l[k]);seconds(at);
 if(!address(l.token)||!address(l.beneficiary)||l.token.toLowerCase()!==TARGET.token)throw Error('Wrong lock identity');
 const v=uint(vested);if(l.total>=2n**128n||l.claimed>v||v>l.total||l.announced>l.total-l.claimed)throw Error('Inconsistent lock amounts');
 if(v!==vestedAt(l,at))throw Error('Vesting differs from QLocks v1 at this block');
 const held=l.total-l.claimed,timeLocked=l.total-v,vestedUnclaimed=v-l.claimed;
 if(held!==timeLocked+vestedUnclaimed)throw Error('Accounting invariant');
 const status=l.announced===0n?'none':at>l.readyAt+FUND.window?'expired':at<l.readyAt?'notice':'ready';
 const withdrawable=status==='ready'?(l.announced<vestedUnclaimed?l.announced:vestedUnclaimed):0n;
 return {id,beneficiary:l.beneficiary,total:l.total,claimed:l.claimed,held,timeLocked,vestedCumulative:v,vestedUnclaimed,
  dripStartsAt:l.start+l.cliff,dripEndsAt:l.start+l.cliff+l.duration,cliffSeconds:l.cliff,
  notice:{status,announced:l.announced,readyAt:l.readyAt,expiresAt:l.announced?l.readyAt+FUND.window:null,withdrawable},
  source:l};
}

export function accountingSnapshot(input){
 if(input?.chainId!==TARGET.chainId||input.contract?.toLowerCase()!==TARGET.contract||input.token?.toLowerCase()!==TARGET.token)throw Error('Wrong accounting scope');
 const b=input.block;if(!b||!/^\d+$/.test(b.number)||!/^0x[0-9a-f]{64}$/i.test(b.hash))throw Error('Missing pinned block');seconds(b.timestamp);
 const tag='0x'+BigInt(b.number).toString(16),sameBlock=x=>{if(x?.blockTag!==tag)throw Error('Mixed block snapshot');};
 if(!Array.isArray(input.rows)||input.rows.length!==5||[...input.rows].map(x=>x.id).sort().join(',')!=='0,1,2,3,4')throw Error('All five known locks are required');
 for(const r of input.rows)sameBlock(r);sameBlock(input.summary);sameBlock(input.balance);
 const rows=input.rows.map(r=>accountLock(r,b.timestamp)).sort((a,b)=>a.id-b.id),sum=k=>rows.reduce((n,r)=>n+r[k],0n);
 const totals={deposited:sum('total'),claimed:sum('claimed'),held:sum('held'),timeLocked:sum('timeLocked'),vestedCumulative:sum('vestedCumulative'),vestedUnclaimed:sum('vestedUnclaimed')};
 const s=input.summary,allHeld=amount(s.locked),allFree=amount(s.unlocked),allAnnounced=amount(s.announced),balance=amount(input.balance.amount);
 if(allFree>allHeld||allAnnounced>allHeld||balance<allHeld)throw Error('Token balance/summary liability mismatch');
 const count=amount(s.locks);if(count<5n||count>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Incomplete token lock membership');
 const ids=input.discoveredIds;if(ids!==undefined&&(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(x=>!Number.isSafeInteger(x)||x<0)||!TARGET.ids.every(x=>ids.includes(x))||count!==BigInt(ids.length)))throw Error('Incomplete token lock membership');
 seconds(s.nextReady);const complete=count===5n;
 const live=rows.filter(r=>r.notice.announced>0n&&r.notice.status!=='expired'),announced=live.reduce((n,r)=>n+r.notice.announced,0n),nextReady=live.length?Math.min(...live.map(r=>r.notice.readyAt)):0;
 if(complete&&(allHeld!==totals.held||allFree!==totals.vestedUnclaimed||allAnnounced!==announced||s.nextReady!==nextReady))throw Error('Rows do not reconcile with summary at the pinned block');
 if(!complete&&(allHeld<totals.held||allFree<totals.vestedUnclaimed))throw Error('Selected locks exceed token summary');
 return json({scope:'QHOOKS QLocks v1 ids0–4',block:{...b,tag},readAt:input.readAt??null,rows,totals,
  tokenSummary:{held:allHeld,vestedUnclaimed:allFree,timeLocked:allHeld-allFree,announced:allAnnounced,nextReady:s.nextReady,lockCount:Number(count)},
  membershipComplete:complete,additionalIds:ids?ids.filter(x=>!TARGET.ids.includes(x)):null,additionalLockCount:Number(count)-5,tokenBalance:balance,unassignedBalance:balance-allHeld,
  invariant:'held = timeLocked + vestedUnclaimed',hasWalletActions:false});
}

// A failed/mixed/inconsistent refresh never invents zero balances or advances the
// source block/vesting clock. Retention/refresh policy is intentionally not chosen here.
export function acceptAccounting(previous,attempt){
 try{
  if(attempt.error)throw Error(attempt.error);
  const model=accountingSnapshot(attempt.data);
  if(previous?.model&&BigInt(model.block.number)<BigInt(previous.model.block.number))throw Error('Older block ignored');
  return {state:'available',stale:false,model,error:null};
 }catch(e){return {state:previous?.model?'last-good':'unavailable',stale:!!previous?.model,model:previous?.model||null,error:e.message};}
}
