// The Studio and Create use the same QLocks selector, types and zero-start convention.
import {abiEncode} from './full-launch/packages/launchpad/abi-encode.mjs';
export const LOCK_SELECTOR='0x806c27c7';
export const LOCK_TYPES=Object.freeze(['address','address','uint256','uint64','uint32','uint32','uint32']);
export function allocationLockData(token,beneficiary,amount,{cliff,duration,notice}) {
 return LOCK_SELECTOR+abiEncode(LOCK_TYPES,[token,beneficiary,amount,'0',String(cliff),String(duration),String(notice)]).slice(2);
}
export function readAllocationLock(hex) {
 if(!/^0x(?:[0-9a-f]{64}){10}$/i.test(hex))throw Error('QLocks returned an invalid lock.');
 const w=Array.from({length:10},(_,i)=>BigInt('0x'+hex.slice(2+i*64,66+i*64)));
 return {token:'0x'+w[0].toString(16).padStart(40,'0'),start:w[1].toString(),cliff:Number(w[2]),wallet:'0x'+w[3].toString(16).padStart(40,'0'),duration:Number(w[4]),notice:Number(w[5]),amount:w[6].toString()};
}
export const lockMatches=(lock,row,token)=>lock.token===token.toLowerCase()&&lock.wallet===row.wallet.toLowerCase()&&lock.amount===row.amount&&['cliff','duration','notice'].every(k=>lock[k]===row[k]);
