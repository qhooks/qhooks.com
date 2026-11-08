// Account-key lifecycle, independent of the page. Only encrypted envelopes go
// to storage or fetch; unlocked signers live in this module's caller for one tab.
import {parseBackup} from './full-launch/prototypes/pq-graduation/client/backup-envelope.mjs';
import {accountPasskey} from './qx-account-quantum-passkey-schema.mjs';
import {createQuantumPasskeyService} from './qx-account-quantum-passkey.mjs';
export const ACCOUNT_QUANTUM_PREFIX='qhooks:account-quantum:v1:';
const validWallet=value=>/^0x[0-9a-f]{40}$/i.test(value||'')?value.toLowerCase():null;
export function encryptedQuantumBackup(backup,publicKey){
 if(typeof backup!=='string'||new TextEncoder().encode(backup).length>20000)throw Error('Choose an encrypted QHooks backup up to 20 KB.');
 const envelope=parseBackup(backup);if(publicKey&&publicKey!==envelope.publicKey)throw Error('The backup public key does not match.');return envelope;
}
const apiError=body=>({sign_in:'Sign in again to open your account key.',fresh_session_required:'Sign in again before replacing an account key.',different_key:'Your account already has a different quantum key. Import the matching key for this launch.',key_changed:'Your account key changed in another tab. Refresh the key before trying again.',wrong_origin:'Open QHooks directly to save your key.',quantum_unavailable:'Your account key could not be read or saved. Retry; your passphrase is still here.'})[body?.error]||'Your encrypted key could not be saved. Retry; your passphrase is still here.';
// Wallet-signature wrap (2026-11-07). The account key's encrypted envelope is unlocked by a secret derived
// from ONE fixed, domain-separated wallet signature, so a creator never handles a passphrase:
// any device logged into the same wallet unlocks with one signature (Face ID for a Privy wallet).
// Threat note: anyone able to sign this message with the wallet can unlock the key; they can already
// move that wallet's funds, so the key adds no weaker link. The signature never leaves this tab and
// is never stored; only the encrypted envelope goes to device storage and the account.
// ECDSA wallets (RFC 6979) sign deterministically. Creation signs twice and refuses a wallet whose two
// signatures differ (smart-contract/passkey wallets); those fall back to a passphrase.
export const WALLET_KEY_VERSION='w1';
// Passphrase strength: any passphrase of 12+ characters whose estimated strength is about 70 bits or more.
// The estimate is the character-pool size per character, minus long runs and repeats. Random
// manager-generated passwords (Chrome, iCloud, Google, 1Password) pass at 12+ characters; short or
// repetitive typed phrases are asked for a few more words. No byte counts are shown.
export function passphraseStrength(value=''){
 const text=String(value),chars=[...text];if(chars.length<12)return{ok:false,bits:0,hint:'Add a few more words (at least 12 characters).'};
 let pool=0;if(/[a-z]/.test(text))pool+=26;if(/[A-Z]/.test(text))pool+=26;if(/[0-9]/.test(text))pool+=10;if(/[^A-Za-z0-9]/.test(text))pool+=33;
 const unique=new Set(chars).size,effective=Math.min(chars.length,unique*2.5);
 const bits=Math.round(effective*Math.log2(Math.max(pool,2)));const ok=bits>=70;
 return{ok,bits,hint:ok?'Strong enough.':'Add a few more words.'};
}
export const walletKeyMessage=wallet=>'QHooks account key v1\n\nSign to unlock your QHooks quantum key on qhooks.com.\nThis signature does not send a transaction or move funds.\n\nAccount: '+wallet;
export async function walletKeySecret(signature,wallet,crypto=globalThis.crypto){
 if(typeof signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature))throw Error('Your wallet returned an unusable signature.');
 const bytes=Uint8Array.from(signature.slice(2).toLowerCase().match(/../g),x=>parseInt(x,16)),text=new TextEncoder();
 try{const ikm=await crypto.subtle.importKey('raw',bytes,'HKDF',false,['deriveBits']);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:text.encode('qhooks.com/account-quantum/wallet-wrap/v1'),info:text.encode('QHooks account key '+wallet.toLowerCase())},ikm,256));
  const out=WALLET_KEY_VERSION+'.'+btoa(String.fromCharCode(...bits)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');bits.fill(0);return out;}
 finally{bytes.fill(0);}
}
export function createAccountQuantum({getConnection,sessions,fetcher=(...args)=>globalThis.fetch(...args),storage=()=>globalThis.localStorage,loadClient=()=>import('./qx-launch-engine.mjs').then(m=>m.loadStudioClient()),getExpectedKey=()=>null,passkeys=createQuantumPasskeyService(),sessionWrap=true}={}){
 let wallet=null,epoch=0,account=null,checked=false,signer=null,client=null,invalidSession=false,passphraseNeeded=false,walletUnsupported=false,pendingWalletSecret=null;
 const owner=()=>validWallet(getConnection()?.owner);
 const deviceKey=()=>ACCOUNT_QUANTUM_PREFIX+wallet;
 const archiveKey=key=>deviceKey()+':'+key;
 const passkeyKey=()=>deviceKey()+':passkey',proofKey=()=>deviceKey()+':passkey-verified';
 function devicePasskey(){try{const value=JSON.parse(storage().getItem(passkeyKey())||'null');return value?accountPasskey(value,account?.publicKey):null;}catch{return null;}}
 function testedPasskey(entry){try{return !!entry&&storage().getItem(proofKey())===passkeys.proof(entry);}catch{return false;}}
 function rememberPasskey(entry){if(entry)write(passkeyKey(),JSON.stringify(entry));else{storage().removeItem(passkeyKey());storage().removeItem(proofKey());}}
 function read(key){try{const text=storage().getItem(key);if(text)encryptedQuantumBackup(text);return text||null;}catch{return null;}}
 function write(key,backup){storage().setItem(key,backup);if(storage().getItem(key)!==backup)throw Error('Device storage did not keep the encrypted key.');}
 function remember(backup,{legacy=false}={}){
  const {publicKey}=encryptedQuantumBackup(backup);
  try{write(archiveKey(publicKey),backup);if(!legacy)write(deviceKey(),backup);}catch{throw Error('Your encrypted key could not be saved on this device. Free browser storage and retry.');}
 }
 function select(){
  if(owner()!==wallet){signer?.lock();signer=null;wallet=owner();account=null;checked=false;invalidSession=false;passphraseNeeded=false;walletUnsupported=false;pendingWalletSecret=null;epoch++;}
 }
 function capture(){select();if(!wallet)throw Error('Connect your QHooks wallet first.');const expected=wallet,revision=epoch;
  return()=>{select();if(wallet!==expected||epoch!==revision)throw Error('Your wallet changed. Open the key for the connected account.');};
 }
 function selectedBackup(){
  if(!wallet)return null;const expected=getExpectedKey();
  if(expected){if(account?.publicKey===expected)return account.backup;const archived=read(archiveKey(expected));if(archived)return archived;const local=read(deviceKey());return local&&encryptedQuantumBackup(local).publicKey===expected?local:null;}
  return account?.backup||read(deviceKey());
 }
 function snapshot(){
  select();const backup=selectedBackup(),expected=getExpectedKey(),matching=signer&&(!expected||signer.publicKeyHex===expected)&&(!backup||encryptedQuantumBackup(backup).publicKey===signer.publicKeyHex);
  const local=backup&&read(expected?archiveKey(expected):deviceKey())===backup;
  const onAccount=!!backup&&account?.backup===backup;
  const unlocked=!!matching&&signer.backupVerified&&!signer.locked,entry=devicePasskey(),supported=!!passkeys.support.available,passkeyVerified=supported&&testedPasskey(entry);
  return {legacyLaunch:!!expected&&checked&&expected!==account?.publicKey,wallet,checked,backup,onAccount,onDevice:!!local,hasKey:!!backup,needsImport:!!expected&&!backup,needsSignIn:!!wallet&&(invalidSession||!sessions.boardSession()),unlocked,ready:unlocked&&!!local&&(onAccount||!!expected),signer:matching?signer:null,passkeySupported:supported,passkeyVerified,passphraseNeeded:passphraseNeeded||walletUnsupported,walletUnsupported,canEnrollPasskey:supported&&unlocked&&onAccount,canUnlockPasskey:passkeyVerified&&checked&&onAccount&&(!expected||entry.publicKey===expected)};
 }
 async function request(method='GET',backup,passkey,wrapSecret){
  const live=capture(),connection=sessions.capture();await connection.check();live();
  const auth=sessions.authHeaders();if(!auth.authorization)throw Error('Sign in to open your account key.');
  const response=await fetcher('/api/account/quantum-key',{method,cache:'no-store',credentials:'omit',redirect:'error',headers:{...auth,...(backup?{'content-type':'application/json','if-match':String(account?.updatedAt??0)}:{})},...(backup?{body:JSON.stringify({backup,publicKey:encryptedQuantumBackup(backup).publicKey,...(passkey!==undefined?{passkey}:{}),...(wrapSecret!==undefined?{wrapSecret}:{})})}:{})});
  const value=await response.json().catch(()=>null);live();connection.assertCurrent();
  if(!response.ok){if(value?.error==='sign_in')invalidSession=true;throw Error(apiError(value));}
  if(value?.version!==1||value.wallet!==wallet||!Object.hasOwn(value,'key'))throw Error('The account key response did not match your wallet.');
  if(value.key!==null){const key=value.key;encryptedQuantumBackup(key.backup,key.publicKey);if(key.passkey!==undefined)accountPasskey(key.passkey,key.publicKey);if(!Number.isSafeInteger(key.createdAt)||key.createdAt<=0||!Number.isSafeInteger(key.updatedAt)||key.updatedAt<key.createdAt)throw Error('The account key response was incomplete.');}
  return value.key;
 }
 async function refresh({signIn=false}={}){
  const live=capture();
  if(invalidSession||!sessions.boardSession()){if(!signIn)return snapshot();await sessions.signIn();live();invalidSession=false;}
  const next=await request();live();
  const prior=read(deviceKey());if(prior&&next&&encryptedQuantumBackup(prior).publicKey!==next.publicKey)remember(prior,{legacy:true});
  account=next;checked=true;
  if(signer&&next&&signer.publicKeyHex!==next.publicKey&&signer.publicKeyHex!==getExpectedKey()){signer.lock();signer=null;}
  if(next){remember(next.backup);rememberPasskey(next.passkey||null);}
  return snapshot();
 }
 async function save(backup,wrapSecret){
  const live=capture(),key=encryptedQuantumBackup(backup).publicKey,expected=getExpectedKey();
  if(expected&&key!==expected)throw Error('That key belongs to a different launch. Import the matching backup.');
  // An old in-progress launch can retain its own key without replacing the
  // account's key or changing any recorded controller/public-key identity.
  if(expected&&account&&account.publicKey!==key){remember(backup,{legacy:true});return;}
  if(account&&account.publicKey!==key)throw Error('Your account already has a different quantum key. Refresh to use it.');
  if(!checked)throw Error('Sign in and check your account key before saving.');
  // Keep a recovery copy even when the account write or connection fails.
  remember(backup,{legacy:!!account});
  account=await request('PUT',backup,undefined,wrapSecret);live();remember(backup);
 }
 function passphrases(passphrase,again){const bytes=new TextEncoder().encode(passphrase);
  if(!passphraseStrength(passphrase).ok)throw Error('Passphrase not strong enough yet: add a few more words.');
  if(bytes.length>1024)throw Error('Passphrase too long: use at most 1024 bytes.');
  if(passphrase!==again)throw Error('The two passphrases don\'t match. Type or paste the same passphrase in both boxes.');}
 async function unlock(passphrase,again){
  const live=capture();await refresh({signIn:true});live();let backup=selectedBackup(),next;
  if(getExpectedKey()&&!backup)throw Error('Import the encrypted key for this in-progress launch in Advanced.');
  client??=await loadClient();live();
  try{
   if(backup){try{next=await client.restoreSigner(backup,passphrase);}catch{throw Error('That passphrase could not unlock this key. Try again.');}
    // One-time move off the passphrase: re-wrap the same key with the wallet secret (same public key).
    // One-time move off the passphrase: the same key is re-wrapped with a session secret (same public key).
    if(sessionWrap&&!getExpectedKey()){try{const {wrapped,secret}=await sessionWrapped(next);live();await save(wrapped,secret);live();passphraseNeeded=false;signer?.lock();signer=next;next=null;return snapshot();}catch{}finally{pendingWalletSecret=null;}}}
   else{passphrases(passphrase,again);next=client.createSigner();backup=await next.exportBackup(passphrase);await next.verifyBackup(backup,passphrase);}
   live();await save(backup);live();signer?.lock();signer=next;next=null;return snapshot();
  }finally{next?.lock();}
 }
 const passphraseWalletKey=()=>ACCOUNT_QUANTUM_PREFIX+'passphrase-wallet:'+wallet;
 function markPassphraseWallet(){walletUnsupported=true;try{storage().setItem(passphraseWalletKey(),'1');}catch{}}
 function knownPassphraseWallet(){try{return storage().getItem(passphraseWalletKey())==='1';}catch{return false;}}
 async function walletSecret(){const c=sessions.capture();if(c.owner!==wallet)throw Error('Your wallet changed. Open the key for the connected account.');return walletKeySecret(await c.sign(walletKeyMessage(wallet)),wallet);}
 // The normal path: one wallet signature unlocks (or, first time, creates) the account key.
 // Session wrap: a random secret saved with the account and released only to this wallet's signed-in session.
 // The normal path for every wallet: no passphrase, no per-unlock signature beyond the session sign-in.
 const newWrapSecret=()=>{const b=crypto.getRandomValues(new Uint8Array(32));const t='s1.'+btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');b.fill(0);return t;};
 async function sessionWrapped(next){const secret=newWrapSecret(),wrapped=await next.exportBackup(secret);await next.verifyBackup(wrapped,secret);return{wrapped,secret};}
 async function unlockWithWallet(){
  const live=capture();await refresh({signIn:true});live();let backup=selectedBackup(),next;
  if(getExpectedKey()&&!backup)throw Error('This unfinished launch used an older key that isn’t here. Use Start over to launch with your account key.');
  // A launch started with the account key resumes; only launches that used their own older key need its passphrase.
  if(getExpectedKey()&&getExpectedKey()!==account?.publicKey)throw Error('This unfinished launch used its own key. Enter that launch’s passphrase below, or use Start over.');
  client??=await loadClient();live();
  try{
   if(backup&&account?.wrapSecret&&account.backup===backup){
    try{next=await client.restoreSigner(backup,account.wrapSecret);}catch{throw Error('Your account key could not be opened. Refresh and try again.');}
    live();passphraseNeeded=false;signer?.lock();signer=next;next=null;return snapshot();
   }
   if(backup){
    // Keys made before the session wrap: wallet-signature keys open with one signature, then move to the session wrap.
    let opened=null;
    if(!knownPassphraseWallet()){try{const secret=await walletSecret();live();opened=await client.restoreSigner(backup,secret);}catch(e){if(/wallet changed/i.test(e?.message||''))throw e;}}
    if(!opened){
     // An old copy left only on this device while the account holds no key: start fresh (the old copy stays archived here).
     if(!(checked&&!account)){passphraseNeeded=true;throw Error('This key was made with a passphrase. Enter it once below; after that it opens with your sign-in.');}
     try{remember(backup,{legacy:true});}catch{}
     next=client.createSigner();
    }else next=opened;
   }else next=client.createSigner();
   const {wrapped,secret}=await sessionWrapped(next);live();await save(wrapped,secret);live();
   passphraseNeeded=false;signer?.lock();signer=next;next=null;return snapshot();
  }finally{next?.lock();}
 }
 async function importKey(backup,passphrase){
  encryptedQuantumBackup(backup);const live=capture();await refresh({signIn:true});live();client??=await loadClient();live();let next;
  try{try{next=await client.restoreSigner(backup,passphrase);}catch{throw Error('That passphrase could not unlock this key. Try again.');}live();await save(backup);live();signer?.lock();signer=next;next=null;return snapshot();}finally{next?.lock();}
 }
 async function changePassphrase(oldPassphrase,passphrase,again){
  passphrases(passphrase,again);const live=capture();await refresh({signIn:true});live();const backup=selectedBackup();if(!backup)throw Error('Create your quantum key on the Create page first.');client??=await loadClient();live();let next;
  try{
   try{next=await client.restoreSigner(backup,oldPassphrase);}catch{throw Error('That passphrase could not unlock this key. Try again.');}
   live();const encrypted=await next.exportBackup(passphrase);await next.verifyBackup(encrypted,passphrase);live();await save(encrypted);live();signer?.lock();signer=next;next=null;return snapshot();
  }finally{next?.lock();}
 }
 async function enablePasskey(){
  const live=capture();if(!snapshot().canEnrollPasskey)throw Error('Unlock with your passphrase first, then enable Face ID / Touch ID.');
  // Start WebAuthn before any network/import await, preserving the iPhone tap.
  const entry=await passkeys.enroll({signer,wallet,loadClient:async()=>client??=await loadClient()});live();accountPasskey(entry,signer.publicKeyHex);
  const next=await request('PUT',account.backup,entry);live();account=next;rememberPasskey(entry);write(proofKey(),passkeys.proof(entry));return snapshot();
 }
 async function unlockWithPasskey(){
  const live=capture();if(!snapshot().canUnlockPasskey)throw Error('Use your passphrase first to enable Face ID / Touch ID on this device.');
  const entry=devicePasskey(),attemptedProofKey=proofKey();let next;
  try{
   next=await passkeys.unlock(entry,async()=>client??=await loadClient());live();await refresh();live();
   if(next.publicKeyHex!==account?.publicKey||JSON.stringify(account.passkey)!==JSON.stringify(entry)||getExpectedKey()&&next.publicKeyHex!==getExpectedKey())throw Error('Your account key changed. Use your passphrase.');
   signer?.lock();signer=next;next=null;return snapshot();
  }catch(error){try{storage().removeItem(attemptedProofKey);}catch{}throw error;}finally{next?.lock();}
 }
 return Object.freeze({snapshot,refresh,unlock,unlockWithWallet,importKey,changePassphrase,enablePasskey,unlockWithPasskey,async checkPasskeySupport(){await passkeys.detect();return snapshot();},exportCopy(){select();const backup=selectedBackup();if(!backup)throw Error('No encrypted key is available on this device. Sign in to read your account copy.');return backup;},lock(){signer?.lock();signer=null;epoch++;}});
}
