// Additive adaptation of accepted L26 EIP712 wallet proof; primitives unchanged.
// Fixed16-word GraduationAction/domain. Execute only in the isolated client run.
import {keccak_256} from '../../qpools/client/vendor/hashes/sha3.js';
import {secp256k1} from '../../qwallet/client/vendor/curves/secp256k1.js';
import {encodeGraduationAction} from './graduation-codec.mjs';
const utf8=new TextEncoder(),hashText=s=>keccak_256(utf8.encode(s));
const hex=b=>'0x'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const bytes=s=>Uint8Array.from(s.slice(2).match(/../g)||[],x=>parseInt(x,16));
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
const DOMAIN='EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';
const ACTION='GraduationAction(uint256 schemaVersion,uint256 chainId,address controller,bytes32 moduleId,bytes32 profileId,bytes32 accountId,address owner,bytes32 publicKey,uint256 actionType,uint256 authEpoch,uint256 policyVersion,bytes32 policyHash,bytes32 operationHash,uint256 nonce,uint64 validAfter,uint64 validUntil)';
const ORDER=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function digest(encoded){const domain=keccak_256(concat(hashText(DOMAIN),hashText('QHooks QGraduation'),hashText('1'),encoded.subarray(32,96)));return hex(keccak_256(concat(Uint8Array.of(0x19,0x01),domain,keccak_256(concat(hashText(ACTION),encoded)))));}
export function graduationWalletDigest(action){return digest(encodeGraduationAction(action));}
export function verifyGraduationWalletApproval(action,signature){
 const encoded=encodeGraduationAction(action),messageDigest=digest(encoded),expectedOwner=hex(encoded.subarray(204,224));
 if(typeof signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature))throw new TypeError('Expected a 65-byte wallet signature');
 const raw=bytes(signature),r=BigInt(hex(raw.subarray(0,32))),s=BigInt(hex(raw.subarray(32,64)));let v=raw[64];if(v===0||v===1)v+=27;
 if((v!==27&&v!==28)||r<1n||r>=ORDER||s<1n||s>ORDER/2n)throw new TypeError('Invalid wallet signature');
 const parsed=secp256k1.Signature.fromBytes(raw.subarray(0,64),'compact').addRecoveryBit(v-27),publicKey=parsed.recoverPublicKey(bytes(messageDigest)).toBytes(false);
 if(hex(keccak_256(publicKey.subarray(1)).subarray(12))!==expectedOwner||!secp256k1.verify(raw.subarray(0,64),bytes(messageDigest),publicKey,{prehash:false,lowS:true,format:'compact'}))throw new TypeError('Wallet approval owner mismatch');
 raw[64]=v;return hex(raw);
}
