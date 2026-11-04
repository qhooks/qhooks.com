// Additive Q48 adaptation of the accepted L25 SLH signer/backup implementation.
// Fixed Graduation domain/backup and full operation review. SOURCE ONLY.
// No network/storage APIs. JavaScript wiping is best effort, not zeroization.
import {slh_dsa_sha2_128s} from '../../qpools/client/vendor/post-quantum/slh-dsa.js';
import {keccak_256} from '../../qpools/client/vendor/hashes/sha3.js';
import {encodeGraduationAction} from './graduation-codec.mjs';
import {reviewGraduationAction} from './graduation-review.mjs';
import {parseBackup} from './backup-envelope.mjs';

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
