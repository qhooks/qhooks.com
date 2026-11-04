// L72 fee-aware six-chain adaptation of pinned Q50. NEW ACCEPTANCE REQUIRED.
// Additive Q48 adaptation of the accepted L25 SLH signer/backup implementation.
// Fixed Graduation domain/backup and full operation review. SOURCE ONLY.
// No network/storage APIs. JavaScript wiping is best effort, not zeroization.
import {slh_dsa_sha2_128s} from '../../../prototypes/qpools/client/vendor/post-quantum/slh-dsa.js';
import {keccak_256} from '../../../prototypes/qpools/client/vendor/hashes/sha3.js';
import {encodeGraduationAction} from '../../../prototypes/pq-graduation/client/graduation-codec.mjs';
import {reviewGraduationAction} from './review.mjs';
import {parseBackup} from '../../../prototypes/pq-graduation/client/backup-envelope.mjs';
import {abiEncode} from '../../launchpad/abi-encode.mjs';
// Lab public-chain contracts use the same two-key action with their own kinds and operation tags.
// Lab two-key actions: kind → the operation tag its contract hashes (21 vault withdrawal, 22 LP fee, 23 price band,
// 24 next volume epoch, 25 directional fees, 26 circuit resume).
const LAB_OPERATIONS=Object.freeze({21:'QHOOKS/SLHVAULT/WITHDRAW/1',22:'QHOOKS/LPFEE/REPLACE/1',23:'QHOOKS/PRICEBAND/REPLACE/1',24:'QHOOKS/VOLEPOCH/OPEN/1',25:'QHOOKS/DIRFEE/SCHEDULE/1',26:'QHOOKS/CIRCUIT/RESUME/1'});

const text=new TextEncoder(),CTX=text.encode('QHOOKS/QGRAD/SLH128S/1');
const PROOF_CTX=text.encode('QHOOKS/QGRAD/SLH128S/BACKUP/1');
const hex=b=>'0x'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.slice(2).match(/../g)||[],x=>parseInt(x,16));
const random=n=>globalThis.crypto.getRandomValues(new Uint8Array(n));
function ensure(ok,message){if(!ok)throw new TypeError(message);}
function header(publicKey,salt,iv){return {format:'qhooks-qgraduation-backup',version:1,algorithm:'SLH-DSA-SHA2-128s',encoding:'seed48',kdf:'PBKDF2-SHA256',iterations:600000,cipher:'AES-256-GCM',salt,iv,publicKey};}
const aad=e=>text.encode(JSON.stringify(header(e.publicKey,e.salt,e.iv)));
async function wrappingKey(password,salt){
  ensure(typeof password==='string'&&password.length<=1024,'Password must be text');
  const bytes=text.encode(password);
  try{
    ensure(bytes.length>=16&&bytes.length<=1024,'Use a passphrase of 16–1024 UTF-8 bytes');
    const input=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']);
    return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},input,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }finally{bytes.fill(0);}
}
function prove(keys){
  const challenge=random(32),sig=slh_dsa_sha2_128s.sign(challenge,keys.secretKey,{context:PROOF_CTX});
  ensure(sig.length===7856&&slh_dsa_sha2_128s.verify(sig,challenge,keys.publicKey,{context:PROOF_CTX}),'Restored possession check failed');
}
async function material(backup,password){
  const envelope=parseBackup(backup);let seed,keys;
  try{
    const key=await wrappingKey(password,unhex(envelope.salt));
    seed=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(envelope.iv),additionalData:aad(envelope),tagLength:128},key,unhex(envelope.ciphertext)));
    ensure(seed.length===48,'Invalid seed size');keys=slh_dsa_sha2_128s.keygen(seed);
    ensure(hex(keys.publicKey)===envelope.publicKey,'Backup key identity mismatch');prove(keys);
    return {seed,keys};
  }catch{seed?.fill(0);keys?.secretKey.fill(0);throw new TypeError('Backup could not be restored');}
}
function messageFor(action,request,publicKeyHex){
  const reviewed=reviewGraduationAction(action,request);
  ensure(reviewed.action.publicKey===publicKeyHex,'Graduation quantum key mismatch');
  return encodeGraduationAction(reviewed.action);
}
function makeHandle(seed,keys,verified){
  const publicKeyHex=hex(keys.publicKey),keyId=hex(keccak_256(keys.publicKey));let locked=false,revision=0;
  const live=expected=>ensure(!locked&&(expected===undefined||expected===revision),'Signer was locked or changed');
  const handle={
    publicKeyHex,keyId,
    get backupVerified(){return verified&&!locked;},
    get locked(){return locked;},
    lock(){if(!locked){locked=true;verified=false;revision++;seed.fill(0);keys.secretKey.fill(0);}},
    async exportBackup(password){
      live();const expected=revision,copy=seed.slice();
      try{const e=header(publicKeyHex,hex(random(32)),hex(random(12)));const key=await wrappingKey(password,unhex(e.salt));live(expected);
        const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:unhex(e.iv),additionalData:aad(e),tagLength:128},key,copy);live(expected);
        const result=JSON.stringify({...e,ciphertext:hex(new Uint8Array(ciphertext))});parseBackup(result);return result;
      }finally{copy.fill(0);}
    },
    async verifyBackup(backup,password){
      live();const expected=revision;let restored;
      try{restored=await material(backup,password);live(expected);ensure(hex(restored.keys.publicKey)===publicKeyHex,'Backup belongs to another key');
        const challenge=random(32),sig=slh_dsa_sha2_128s.sign(challenge,restored.keys.secretKey,{context:PROOF_CTX});
        ensure(slh_dsa_sha2_128s.verify(sig,challenge,keys.publicKey,{context:PROOF_CTX}),'Restore comparison failed');verified=true;return true;
      }finally{restored?.seed.fill(0);restored?.keys.secretKey.fill(0);}
    },
    // Key rotation and recovery actions (types 8 rotate, 9 recover, 10 cancel recovery) carry only the new keys
    // in their operation hash, so they are signed here without the graduation review; the controller checks them.
    signKeyAction(action){
      live();ensure(verified,'Verify a backup before signing');
      ensure(action&&[8n,9n,10n].includes(action.actionType)&&action.publicKey===publicKeyHex&&action.authEpoch>=1n,'Not a key action for this key');
      const message=encodeGraduationAction(action),signature=slh_dsa_sha2_128s.sign(message,keys.secretKey,{context:CTX});
      ensure(signature.length===7856&&slh_dsa_sha2_128s.verify(signature,message,keys.publicKey,{context:CTX}),'Signature self-check failed');
      return Object.freeze({publicKeyHex,messageHex:hex(message),signatureHex:hex(signature)});
    },
    // Lab claim withdrawals (21) and fee replacements (22). The caller passes the exact operation (types and
    // values after the tag); the hash is recomputed here, so the key never signs an operation it was not shown.
    signLabAction(action,operation){
      live();ensure(verified,'Verify a backup before signing');
      ensure(action&&Object.hasOwn(LAB_OPERATIONS,Number(action.actionType))&&action.publicKey===publicKeyHex&&action.authEpoch>=1n&&action.schemaVersion===1n,'Not a Lab action for this key');
      ensure(action.validUntil>action.validAfter&&action.validUntil-action.validAfter<=900n,'Signing window must be at most 15 minutes');
      ensure(operation&&Array.isArray(operation.types)&&Array.isArray(operation.values)&&operation.types.length===operation.values.length&&operation.types.length<=12,'Invalid Lab operation');
      const encoded=abiEncode(['string',...operation.types],[LAB_OPERATIONS[Number(action.actionType)],...operation.values]);
      ensure(hex(keccak_256(unhex(encoded)))===action.operationHash,'Operation does not match the signed action');
      const message=encodeGraduationAction(action),signature=slh_dsa_sha2_128s.sign(message,keys.secretKey,{context:CTX});
      ensure(signature.length===7856&&slh_dsa_sha2_128s.verify(signature,message,keys.publicKey,{context:CTX}),'Signature self-check failed');
      return Object.freeze({publicKeyHex,messageHex:hex(message),signatureHex:hex(signature)});
    },
    signAction(action,request){
      live();ensure(verified,'Verify a backup before signing');const message=messageFor(action,request,publicKeyHex);
      const signature=slh_dsa_sha2_128s.sign(message,keys.secretKey,{context:CTX});
      ensure(signature.length===7856&&slh_dsa_sha2_128s.verify(signature,message,keys.publicKey,{context:CTX}),'Signature self-check failed');
      return Object.freeze({publicKeyHex,keyId,messageHex:hex(message),signatureHex:hex(signature)});
    }
  };
  return Object.freeze(handle);
}
export function createSigner(){
  const seed=random(48);let keys;
  try{keys=slh_dsa_sha2_128s.keygen(seed);return makeHandle(seed,keys,false);}
  catch(e){seed.fill(0);keys?.secretKey.fill(0);throw e;}
}
export async function restoreSigner(backup,password){
  const restored=await material(backup,password);
  try{return makeHandle(restored.seed,restored.keys,true);}
  catch(e){restored.seed.fill(0);restored.keys.secretKey.fill(0);throw e;}
}
