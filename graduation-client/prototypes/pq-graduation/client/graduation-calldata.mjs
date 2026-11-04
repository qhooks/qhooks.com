// Complete static operation plus dynamic dual-proof tuple, no generic call.
import {abiEncode} from '../../../packages/launchpad/abi-encode.mjs';
import {abiWord} from '../../../packages/launchpad/abi-word.mjs';
import {keccak_256} from '../../qpools/client/vendor/hashes/sha3.js';
import {reviewGraduationAction} from './graduation-review.mjs';
import {verifyGraduationWalletApproval} from './graduation-wallet-proof.mjs';
export function graduationCalldata(action,request,walletSignature,pqSignature){
 const r=reviewGraduationAction(action,request),a=r.action,o=r.operation;
 const wallet=verifyGraduationWalletApproval(a,walletSignature);
 if(typeof pqSignature!=='string'||!/^0x[0-9a-f]{15712}$/.test(pqSignature))throw new TypeError('Expected a full SLH-SHA2-128s signature');
 const selector=Array.from(keccak_256(new TextEncoder().encode(o.signature)).subarray(0,4),b=>b.toString(16).padStart(2,'0')).join('');
 const args=abiEncode(o.argumentTypes,o.argumentValues).slice(2);
 const proof=abiEncode(['uint256','uint64','uint64','bytes','bytes'],[a.nonce.toString(),a.validAfter.toString(),a.validUntil.toString(),wallet,pqSignature]).slice(2);
 return '0x'+selector+args+abiWord('uint256',String(args.length/2+32))+proof;
}
