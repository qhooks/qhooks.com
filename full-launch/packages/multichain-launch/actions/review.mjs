// L72 fee-aware six-chain adaptation of pinned Q50. NEW ACCEPTANCE REQUIRED.
import {networkProfile} from '../../multichain/profiles.mjs';
// Lead-owned complete intent validation. Not a substitute for trusted chain state.
import {typedGraduationAction} from '../../../prototypes/pq-graduation/client/graduation-typed-data.mjs';
import {prepareGraduationOperation} from './operation.mjs';
import {abiEncode} from '../../launchpad/abi-encode.mjs';
import {keccak_256} from '../../../prototypes/qpools/client/vendor/hashes/sha3.js';
const hex=b=>'0x'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const padded=s=>hex(new TextEncoder().encode(s)).padEnd(66,'0');
const MODULE=padded('QHOOKS/QGRAD/SLH128S/V1'),PROFILE=padded('SLH-DSA-SHA2-128s/FIPS205');
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
export function reviewGraduationAction(input,request){
 const typed=typedGraduationAction(input),action=Object.freeze(Object.fromEntries(typed.types.GraduationAction.map(({name,type})=>[name,type.startsWith('uint')?BigInt(typed.message[name]):typed.message[name]])));
 const a=action;
 networkProfile(a.chainId.toString());
 for(const {name,type} of typed.types.GraduationAction)if(!type.startsWith('uint'))ensure(input[name]===a[name],'Exact canonical action identity required');
 ensure(a.schemaVersion===1n&&a.chainId>0n&&BigInt(a.controller)>0n&&BigInt(a.owner)>0n&&a.controller!==a.owner,'Invalid graduation domain');
 ensure(a.moduleId===MODULE&&a.profileId===PROFILE&&a.authEpoch>=1n&&BigInt(a.publicKey)>0n,'Wrong graduation profile or epoch');
 ensure(a.actionType>=1n&&a.actionType<=7n&&a.nonce<(1n<<256n)-1n&&a.validUntil>a.validAfter&&a.validUntil-a.validAfter<=900n,'Invalid graduation kind, nonce or window');
 const identity=abiEncode(['uint256','address','bytes32','bytes32','address','bytes32'],[a.chainId.toString(),a.controller,MODULE,PROFILE,a.owner,a.publicKey]);
 // After a key rotation (epoch > 1) the account keeps the launch's original identity; the controller checks it.
 const raw=Uint8Array.from(identity.slice(2).match(/../g),x=>parseInt(x,16));ensure(a.authEpoch>1n||a.accountId===hex(keccak_256(raw)),'Wrong key-bound graduation account');
 const operation=prepareGraduationOperation(Number(a.actionType),request);
 ensure(operation.operationHash===a.operationHash,'Transaction details do not match signed operation');
 ensure(a.policyHash===operation.currentPolicyHash&&(a.actionType===1n?a.policyVersion===0n:a.policyVersion>0n),'Wrong current policy binding');
 const recipient=operation.review.migration?.limits.recipient??operation.review.withdrawal?.recipient;
 ensure(recipient!==a.controller,'Controller cannot receive protected payout');
 return Object.freeze({action,operation,typed});
}
