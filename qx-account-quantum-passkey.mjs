import {accountPasskey,PASSKEY_RP,bytesToBase64url,base64urlToBytes} from './qx-account-quantum-passkey-schema.mjs';
const text=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true});
export const PASSKEY_UNAVAILABLE="Face ID isn't available in this browser; use your passphrase";
const PRF_INPUT=text.encode('qhooks.com/account-quantum/prf/v1');
const WRAP_SALT=text.encode('qhooks.com/account-quantum/passkey-wrap/v1');
const WRAP_INFO=text.encode('QHooks account quantum signer v1');
const unavailable=()=>Error(PASSKEY_UNAVAILABLE);
export function embeddedPasskeyBrowser(env=globalThis){
 const ua=env.navigator?.userAgent||'';
 if(env.Telegram?.WebApp||/Telegram|Instagram|Twitter|\bX\/|FBAN|FBAV|MicroMessenger|\bLine\/|;\s*wv\b|GSA\//i.test(ua))return true;
 if(/AppleWebKit\//i.test(ua)&&!/Safari\//i.test(ua))return true;
 const ios=/iPhone|iPad|iPod/i.test(ua)||/Macintosh/i.test(ua)&&env.navigator?.maxTouchPoints>1;
 return ios&&(!/Safari\//i.test(ua)||!/Version\/|CriOS\/|FxiOS\/|EdgiOS\//i.test(ua));
}
export async function detectQuantumPasskey(env=globalThis){
 const no={available:false,prf:false,largeBlob:false};
 if(!env.isSecureContext||env.location?.protocol!=='https:'||!(env.location.hostname===PASSKEY_RP||env.location.hostname?.endsWith('.'+PASSKEY_RP))||embeddedPasskeyBrowser(env)||!env.PublicKeyCredential||!env.navigator?.credentials?.create||!env.navigator?.credentials?.get)return no;
 try{
  if(!await env.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())return no;
  if(typeof env.PublicKeyCredential.getClientCapabilities!=='function')return{available:true,prf:null,largeBlob:null,probeAtCreation:true};
  const capabilities=await env.PublicKeyCredential.getClientCapabilities();
  const prf=capabilities?.['extension:prf']===true||capabilities?.prf===true,largeBlob=capabilities?.['extension:largeBlob']===true||capabilities?.largeBlob===true;
  return{available:prf||largeBlob,prf,largeBlob};
 }catch{return no;}
}
const random=(env,n)=>env.crypto.getRandomValues(new Uint8Array(n));
function material(value){const result=value instanceof ArrayBuffer?new Uint8Array(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):null;if(!result||result.length!==32)throw unavailable();return result;}
async function wrappingKey(secret,crypto){
 const bytes=material(secret);
 try{const input=await crypto.subtle.importKey('raw',bytes,'HKDF',false,['deriveKey']);return await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:WRAP_SALT,info:WRAP_INFO},input,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
 finally{bytes.fill(0);}
}
const aad=entry=>text.encode(JSON.stringify({version:1,rp:PASSKEY_RP,mode:entry.mode,credentialId:entry.credentialId,publicKey:entry.publicKey}));
export async function wrapQuantumPasskey({payload,secret,credentialId,publicKey,mode='prf',crypto=globalThis.crypto}){
 const iv=crypto.getRandomValues(new Uint8Array(12)),entry={version:1,mode,credentialId,publicKey,iv:bytesToBase64url(iv)},key=await wrappingKey(secret,crypto),bytes=text.encode(payload);
 try{entry.wrappedKey=bytesToBase64url(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(entry)},key,bytes));return accountPasskey(entry,publicKey);}finally{bytes.fill(0);}
}
export async function unwrapQuantumPasskey(entry,secret,crypto=globalThis.crypto){
 accountPasskey(entry,entry.publicKey);const key=await wrappingKey(secret,crypto);
 const bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:base64urlToBytes(entry.iv),additionalData:aad(entry)},key,base64urlToBytes(entry.wrappedKey)));
 try{return decode.decode(bytes);}finally{bytes.fill(0);}
}
function checkedCredential(credential,{challenge,origin,type,credentialId}){
 if(credential?.type!=='public-key'||!credential.rawId)throw unavailable();
 const id=bytesToBase64url(credential.rawId);base64urlToBytes(id);if(credentialId&&id!==credentialId)throw unavailable();
 const data=JSON.parse(decode.decode(credential.response.clientDataJSON));
 if(data.type!==type||data.challenge!==bytesToBase64url(challenge)||data.origin!==origin||data.crossOrigin===true)throw unavailable();
 if(type==='webauthn.get'){const auth=new Uint8Array(credential.response.authenticatorData);if(auth.length<37||(auth[32]&5)!==5)throw unavailable();}
 return{id,extensions:credential.getClientExtensionResults()};
}
export function createQuantumPasskeyService({env=globalThis}={}){
 let support={available:false,prf:false,largeBlob:false};
 const proof=entry=>JSON.stringify({version:1,entry,origin:env.location?.origin,ua:env.navigator?.userAgent});
 async function assertion(entry,extension){
  const challenge=random(env,32),credential=await env.navigator.credentials.get({publicKey:{rpId:PASSKEY_RP,challenge,userVerification:'required',timeout:60000,allowCredentials:[{type:'public-key',id:base64urlToBytes(entry.credentialId)}],extensions:extension}});
  return checkedCredential(credential,{challenge,origin:env.location.origin,type:'webauthn.get',credentialId:entry.credentialId}).extensions;
 }
 async function readSecret(entry){
  const result=await assertion(entry,entry.mode==='prf'?{prf:{eval:{first:PRF_INPUT.slice()}}}:{largeBlob:{read:true}});
  return material(entry.mode==='prf'?result.prf?.results?.first:result.largeBlob?.blob);
 }
 async function unlock(entry,loadClient){
  if(!support.available||embeddedPasskeyBrowser(env)||entry.mode==='prf'&&support.prf===false||entry.mode==='largeBlob'&&support.largeBlob===false)throw unavailable();
  accountPasskey(entry,entry.publicKey);let next;
  try{
   const secret=await readSecret(entry),payload=JSON.parse(await unwrapQuantumPasskey(entry,secret,env.crypto));
   if(Object.keys(payload).sort().join(',')!=='backup,secret'||typeof payload.secret!=='string')throw unavailable();
   const client=await loadClient();next=await client.restoreSigner(payload.backup,payload.secret);
   if(next.publicKeyHex!==entry.publicKey||!next.backupVerified||next.locked)throw unavailable();const result=next;next=null;return result;
  }catch(error){next?.lock();if(error?.name==='NotAllowedError')throw Error('Face ID was cancelled or unavailable. Use your passphrase.');throw unavailable();}
 }
 async function enroll({signer,wallet,loadClient}){
  if(!support.available||!signer?.backupVerified||signer.locked||embeddedPasskeyBrowser(env))throw unavailable();
  const challenge=random(env,32),extensions={};if(support.prf!==false)extensions.prf={eval:{first:PRF_INPUT.slice()}};if(support.largeBlob!==false)extensions.largeBlob={support:'preferred'};
  let secret,probe;
  try{
   const credential=await env.navigator.credentials.create({publicKey:{rp:{id:PASSKEY_RP,name:'QHooks'},user:{id:text.encode(wallet),name:wallet,displayName:'QHooks quantum key'},challenge,pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],attestation:'none',timeout:60000,authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},extensions}});
   const result=checkedCredential(credential,{challenge,origin:env.location.origin,type:'webauthn.create'}),prf=result.extensions.prf;
   const mode=support.prf!==false&&(prf?.enabled===true||prf?.results?.first)?'prf':support.largeBlob!==false&&result.extensions.largeBlob?.supported===true?'largeBlob':null;
   if(!mode)throw unavailable();const identity={credentialId:result.id,publicKey:signer.publicKeyHex,mode};
   // iPhone returns no PRF output at creation: that read is itself a real Face ID get, so it doubles as the proof.
   const fromGet=mode==='prf'&&!prf?.results?.first;
   if(mode==='prf')secret=fromGet?await readSecret(identity):material(prf.results.first);
   else{
    secret=random(env,32);const stored=await assertion(identity,{largeBlob:{write:secret.slice().buffer}});if(stored.largeBlob?.written!==true)throw unavailable();
   }
   // The signer exposes encrypted export only. Seal an independently encrypted
   // signer copy and its random inner password; neither is saved in plaintext.
   const innerSecret=bytesToBase64url(random(env,32)),backup=await signer.exportBackup(innerSecret);
   const check=fromGet?secret.slice():null;
   const entry=await wrapQuantumPasskey({payload:JSON.stringify({backup,secret:innerSecret}),secret,crypto:env.crypto,...identity});secret=null;
   if(check){
    // Same get-derived secret: unwrap + restore locally (no third Face ID prompt).
    try{const payload=JSON.parse(await unwrapQuantumPasskey(entry,check,env.crypto)),client=await loadClient();probe=await client.restoreSigner(payload.backup,payload.secret);if(probe.publicKeyHex!==entry.publicKey||!probe.backupVerified||probe.locked)throw unavailable();}finally{check.fill(0);}
   }else probe=await unlock(entry,loadClient); // A real get + unwrap + restored-key proof, before offering unlock.
   return entry;
  }catch(error){if(error?.name==='NotAllowedError')throw Error('Face ID was cancelled or unavailable. Use your passphrase.');throw unavailable();}
  finally{secret?.fill(0);probe?.lock();}
 }
 return Object.freeze({detect:async()=>support=await detectQuantumPasskey(env),get support(){return support;},proof,enroll,unlock});
}
