// Revalidate the exact approved action before producing a fixed QPool call.
import {slh_dsa_sha2_128s} from './vendor/post-quantum/slh-dsa.js';
import {keccak_256} from './vendor/hashes/sha3.js';
import {encodePoolAction} from './pool-codec.mjs';
import {poolWalletDigest,verifyPoolWalletApproval} from './pool-wallet-proof.mjs';
import {canonicalPoolAction} from './pool-approval.mjs';
import {poolCall} from './pool-call.mjs';
import {abiEncode} from '../../../packages/launchpad/abi-encode.mjs';
const text=new TextEncoder();
export const poolHex=b=>'0x'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export const poolBytes=s=>Uint8Array.from(s.slice(2).match(/../g)||[],x=>parseInt(x,16));
export const poolHash=b=>poolHex(keccak_256(b));
export function poolCalldata(signature,types,values){
 return poolHash(text.encode(signature)).slice(0,10)+abiEncode(types,values).slice(2);
}
export function approvedPoolCalldata(approval,expectedAction){
 const action=canonicalPoolAction(expectedAction),encoded=encodePoolAction(action);
 if(!approval||poolHex(encodePoolAction(approval.action))!==poolHex(encoded)||approval.walletDigestHex!==poolWalletDigest(action)||approval.publicKeyHex!==action.publicKey||approval.keyId!==poolHash(poolBytes(action.publicKey)))throw new TypeError('Approval action changed');
 const signature=verifyPoolWalletApproval(action,approval.walletSignatureHex);
 if(signature!==approval.walletSignatureHex||typeof approval.pqSignatureHex!=='string'||!/^0x[0-9a-f]{15712}$/.test(approval.pqSignatureHex)||!slh_dsa_sha2_128s.verify(poolBytes(approval.pqSignatureHex),encoded,poolBytes(action.publicKey),{context:text.encode('QHOOKS/QPOOL/SLH128S/1')}))throw new TypeError('Invalid protected approval');
 const call=poolCall(action,signature,approval.pqSignatureHex);
 return poolCalldata(call.signature,call.types,call.values);
}
