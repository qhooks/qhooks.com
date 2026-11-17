import {keccakHex} from './qdrops-core.mjs';
import {decodeLock,vestedAt,multiSendData} from './qdrops-fund.mjs';
export const C=Object.freeze({chain:'4663',safe:'0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71',locks:'0xd921e59e25f6bc283d60ec92799dc35fc40ce02a',token:'0x20429af7ca3b0ce4d99edbaa0693f26c5df05195',drops:'0x89eb481a2ea221e62647c113c88de67e7b9a5a70',multi:'0x9641d764fc13c8b624c04430c7356c1c7c8102e2',singleton:'0xedd160febbd92e350d4d398fb636302fccd67c7e',tokenImplementation:'0xdb3b3544d95cf445e869bf3bb9a2d1dfb1d7007f',cliff:8553600,readyAt:1794998110,amount:250000n*10n**18n});
export const word=n=>{const x=BigInt(n);if(x<0n||x>=2n**256n)throw Error('Invalid uint256');return x.toString(16).padStart(64,'0');};
export const addressWord=a=>{if(!/^0x[0-9a-f]{40}$/i.test(a))throw Error('Invalid address');return a.slice(2).toLowerCase().padStart(64,'0');};
export const selector=s=>keccakHex(new TextEncoder().encode(s)).slice(0,10);
export const callData=(signature,...words)=>selector(signature)+words.join('');
export function strictLock(raw){if(!/^0x[0-9a-f]{640}$/i.test(raw))throw Error('Incomplete QLocks v1 state');const l=decodeLock(raw);for(const k of ['start','cliff','duration','notice','readyAt'])if(!Number.isSafeInteger(l[k])||l[k]<0)throw Error('Invalid lock time');if(BigInt('0x'+raw.slice(2,66))>=2n**160n||BigInt('0x'+raw.slice(194,258))>=2n**160n)throw Error('Invalid lock address');return l;}
export const expectedLock=kind=>({token:C.token,start:kind==='treasury'?1794103528:1794103554,cliff:0,beneficiary:C.safe,duration:62208000,notice:604800,total:(kind==='treasury'?50000000n:30000000n)*10n**18n,claimed:0n,announced:kind==='treasury'?0n:C.amount,readyAt:kind==='treasury'?0:C.readyAt});
const same=(a,b)=>Object.keys(b).every(k=>String(a[k]).toLowerCase()===String(b[k]).toLowerCase());
export function validateLock(kind,l){if(!['treasury','drops'].includes(kind))throw Error('Unknown operation');const e=expectedLock(kind);if(kind==='treasury'&&same(l,{...e,cliff:C.cliff}))return 'complete';if(!same(l,e))throw Error('The lock changed from the reviewed state. No action is available; obtain a new review.');return 'pending';}
export function treasuryTx(l){if(validateLock('treasury',l)==='complete')return null;return {to:C.locks,value:0,operation:0,data:callData('extend(uint256,uint32)',word(2),word(C.cliff))};}
export function lock4Tx(l){validateLock('drops',l);const amount=l.announced,calls=[[C.locks,callData('withdraw(uint256)',word(4))],[C.token,callData('approve(address,uint256)',addressWord(C.drops),word(amount))],[C.drops,callData('deposit(address,uint256)',addressWord(C.token),word(amount))]];return {to:C.multi,value:0,operation:1,data:multiSendData(calls),amount,calls};}
export function operationState(kind,{lock,now,vested,allowance=0n,listed=true,dropsOwner=C.safe}){
 const state=validateLock(kind,lock);if(state==='complete')return {tx:null,ready:false,done:true,reason:'The treasury cliff is already extended to the reviewed date.'};
 if(BigInt(vested)!==vestedAt(lock,now))throw Error('The on-chain vesting result differs from the reviewed v1 schedule.');
 if(kind==='treasury')return {tx:treasuryTx(lock),ready:true,done:false,reason:'Extend lock 2 to its reviewed 99-day cliff.'};
 if(!listed||dropsOwner.toLowerCase()!==C.safe)throw Error('QDrops token listing or owner changed.');
 if(BigInt(allowance)!==0n)throw Error('An existing QDrops allowance must be reviewed separately. This page will not replace it.');
 const tx=lock4Tx(lock);if(now<C.readyAt)return {tx,ready:false,done:false,reason:'The public notice is still running.',remaining:C.readyAt-now};
 if(now>C.readyAt+604800)return {tx,ready:false,done:false,reason:'The lock 4 announcement expired. A new announcement needs a separate review.'};
 if(BigInt(vested)-lock.claimed<tx.amount)return {tx,ready:false,done:false,reason:'The announced amount is not fully vested.'};
 return {tx,ready:true,done:false,reason:'Withdraw and deposit exactly 250,000 QHOOKS in one atomic Safe transaction.'};
}
export function stateHash(kind,lock){const e=expectedLock(kind);return keccakHex(new TextEncoder().encode(JSON.stringify({kind,...Object.fromEntries(Object.keys(e).map(k=>[k,String(lock[k]).toLowerCase()]))})));}
export const openAt=1802657128,endAt=1864865128;
export const utc=seconds=>new Date(seconds*1000).toISOString().replace('T',' ').replace('.000Z',' UTC');
