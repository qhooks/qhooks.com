import {createAccountQuantum,passphraseStrength} from './qx-account-quantum.mjs';
import {createBoardSession} from './qx-board-session.mjs';

// Both pages use the same lifecycle and forms. The Create caller supplies only
// its recorded public-key constraint and the unlocked signer callback.
export function mountAccountQuantum(target,{hub,id='qc',mode='launch',getExpectedKey=()=>null,onChange=()=>{},enabled=()=>true,document:doc=globalThis.document}={}){
 const current=()=>hub.snapshot().current,sessions=createBoardSession({getConnection:current});
 const key=createAccountQuantum({getConnection:current,sessions,getExpectedKey});
 const h=(tag,attrs={},...children)=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k in n&&k!=='role')n[k]=v;else n.setAttribute(k,v);}n.append(...children);return n;};
 const field=(name,label,autocomplete='current-password')=>{const input=h('input',{id:id+'-'+name,name:id+'-'+name,type:'password',maxLength:1024,autocomplete,autocapitalize:'off',spellcheck:false});return{input,label:h('label',{},label,input)};};
 const button=(name,label)=>h('button',{id:id+'-'+name,type:'button',className:mode==='account'?'qa-btn':''},label);
 const status=h('p',{id:id+'-key-status',className:'qaq-status qxc-fine',role:'status','aria-live':'polite'}),location=h('span',{id:id+'-key-location',className:'qaq-location'});
 const toggle=h('input',{id:id+'-quantum',type:'checkbox',role:'switch',checked:true,disabled:true,'aria-describedby':id+'-quantum-note'});
 const row=h('div',{className:'qaq-row'},mode==='launch'?h('label',{className:'qxc-check'},toggle,h('strong',{},'Quantum lock'),h('span',{},'On')):h('strong',{},'Quantum key'),location);
 const help=h('p',{id:id+'-quantum-note',className:'qxc-fine'},mode==='launch'?'Your account key protects creator actions. It opens with Face ID / Touch ID or your passphrase, never with your wallet alone.':'One quantum key for your QHooks account. It opens with Face ID / Touch ID or your passphrase, never with your wallet alone.');
 const signIn=button('key-signin','Sign in to open your key'),refresh=button('key-refresh','Refresh key'),walletUnlock=h('button',{id:id+'-key-wallet',type:'button',className:mode==='account'?'qa-btn qa-btn-primary':'qxc-primary'},'Unlock with your wallet');
 const password=field('password','Passphrase'),again=field('password-again','Passphrase again','new-password');
 const submit=h('button',{id:id+'-key-submit',type:'submit',className:mode==='account'?'qa-btn qa-btn-primary':'qxc-primary'},'Unlock');
 // Password managers pair a new password with the account it belongs to: a hidden username field, both boxes new-password.
 const username=h('input',{id:id+'-username',name:'username',type:'text',autocomplete:'username',tabIndex:-1,'aria-hidden':'true',readOnly:true,className:'qaq-username',style:'position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;border:0!important;opacity:0;overflow:hidden;clip:rect(0 0 0 0);pointer-events:none'});
 const show=h('input',{id:id+'-show-pass',type:'checkbox'}),showLabel=h('label',{className:'qxc-check qaq-show'},show,h('span',{},'Show passphrase'));
 show.addEventListener('change',()=>{for(const input of [password.input,again.input])input.type=show.checked?'text':'password';});
 const strength=h('p',{id:id+'-pass-strength',className:'qxc-fine qaq-strength','aria-live':'polite',hidden:true});
 const form=h('form',{className:'qaq-unlock','aria-label':'Unlock quantum key',autocomplete:'on'},username,h('div',{className:'qxc-fields'},password.label,again.label),strength,showLabel,submit);
 password.input.addEventListener('input',()=>{if(again.label.hidden){strength.hidden=true;return;}const v=password.input.value;strength.hidden=!v;const r=passphraseStrength(v);strength.textContent=r.hint;strength.dataset.ok=String(r.ok);});
 const enrollPasskey=button('face-enroll','Use Face ID / Touch ID'),unlockPasskey=button('face-unlock','Unlock with Face ID / Touch ID'),passkeyHelp=h('p',{id:id+'-passkey-help',className:'qxc-fine'},'Add Face ID / Touch ID so your key opens without typing. Your passphrase stays the backup.');
 const advanced=h('details',{id:id+'-key-advanced',className:'qaq-advanced'}),exportButton=button('export-key','Export a copy'),save=button('save-key','Save backup file'),copy=button('copy-key','Copy backup text'),select=button('select-key','Select all');
 const text=h('textarea',{id:id+'-key-text',readOnly:true,rows:4,spellcheck:false,autocomplete:'off'}),link=h('a',{id:id+'-key-link',href:'#',target:'_blank',rel:'noopener',download:'qhooks-account-encrypted-key.json'},'Open as a file');
 const exported=h('div',{id:id+'-key-text-wrap',className:'qxc-key-text',hidden:true},h('label',{},'Encrypted key copy',text),h('div',{className:'qxc-key-actions'},save,copy,select,link));
 const file=h('input',{id:id+'-key-file',type:'file',accept:'.json,application/json,text/plain,application/octet-stream'}),paste=h('textarea',{id:id+'-key-paste',rows:4,maxLength:20000,spellcheck:false,autocomplete:'off'}),importPassword=field('import-password','Imported key passphrase'),restore=button('restore-key','Import a key');
 advanced.append(h('summary',{},'Advanced'),h('div',{className:'qxc-key-actions'},exportButton),exported,h('div',{className:'qaq-import'},h('label',{},'Import a key file',file),h('label',{},'Or paste encrypted key text',paste),importPassword.label,restore));
 const old=field('old-password','Current passphrase'),next=field('new-password','New passphrase','new-password'),confirm=field('new-password-again','New passphrase again','new-password'),change=h('details',{id:id+'-key-change',className:'qaq-change'}),changeForm=h('form',{'aria-label':'Change quantum key passphrase'},old.label,next.label,confirm.label,h('button',{type:'submit',className:'qa-btn'},'Save passphrase'));
 change.append(h('summary',{},'Change passphrase'),changeForm,h('p',{className:'qxc-fine'},'Your public key stays the same. Any older exported copies still use their old passphrase.'));
 target.replaceChildren(row,help,h('div',{className:'qxc-key-actions'},walletUnlock,signIn,refresh,enrollPasskey,unlockPasskey),passkeyHelp,form,status,...(mode==='account'?[h('div',{className:'qxc-key-actions'},exportButton),change]:[]),advanced);
 let working=false,message='',failed=false,lastWallet=null,formMode='unlock';
 const notify=()=>{const state=key.snapshot();onChange({...state,ready:state.ready&&!working});};
 function say(value,error=false){message=value;failed=error;render();}
 function render(){
  const s=key.snapshot(),usable=enabled();
  location.textContent=s.onAccount?'On account':s.onDevice?'On this device':'None';
  // Unlock methods: Face ID / Touch ID (passkey) first where the browser supports it, the passphrase always.
  // The wallet only signs in to read the encrypted copy; it never opens the key.
  formMode=s.legacyWrap&&!s.unlocked?'replace':s.needsPassphraseBackup?'protect':!s.hasKey?'create':'unlock';
  const twoBoxes=formMode!=='unlock';
  walletUnlock.hidden=!s.wallet||s.checked;walletUnlock.textContent=working?'Waiting for your wallet…':'Continue with your wallet';
  signIn.hidden=true;refresh.hidden=mode==='launch'||!s.wallet||s.needsSignIn;
  form.hidden=!s.wallet||!s.checked||s.needsImport||(s.ready&&formMode!=='protect')||(s.unlocked&&formMode==='unlock');
  enrollPasskey.hidden=!s.canEnrollPasskey||!!(s.hasPasskey||s.passkeyVerified);unlockPasskey.hidden=!s.canUnlockPasskey||s.unlocked||s.ready;
  passkeyHelp.hidden=!s.passkeySupported||!!s.legacyWrap;passkeyHelp.textContent=s.passkeyVerified?'Face ID / Touch ID is ready on this browser. Your passphrase remains the backup.':s.hasPasskey?'Face ID / Touch ID is set up for this account. Your passphrase remains the backup.':'Add Face ID / Touch ID after your key is open. Your passphrase stays the backup.';
  again.label.hidden=!twoBoxes;password.input.autocomplete=twoBoxes?'new-password':'current-password';again.input.autocomplete='new-password';username.value=s.wallet||'';
  password.input.setAttribute('aria-invalid',String(failed));again.input.setAttribute('aria-invalid',String(failed&&twoBoxes));
  submit.textContent=working?'Checking…':formMode==='create'?'Create with passphrase':formMode==='replace'?'Make a new key':formMode==='protect'?'Save with a passphrase':'Unlock with passphrase';
  change.hidden=!s.hasKey||s.legacyWrap;exportButton.disabled=working||!s.hasKey;
  status.dataset.error=String(failed);
  status.textContent=message||(!s.wallet?'Connect your QHooks wallet to open your quantum key.'
   :!s.checked?'Sign in with your wallet to read your encrypted key. Opening it needs Face ID / Touch ID or your passphrase.'
   :s.needsPassphraseBackup?'Your key is open in this tab. Choose a passphrase now so your account keeps a copy only you can open.'
   :s.ready?'Unlocked for this tab. Your encrypted key is saved'+(s.onAccount?' on your account and this device.':' on this device for this launch.')
   :s.legacyWrap?'Your key was kept with your QHooks sign-in, which no longer opens it. Import your backup file in Advanced, or make a new key below. A launch protected by the old key moves to the new one through its 30-day recovery.'
   :s.needsImport?'This unfinished launch used an older key that isn’t on this device. Use Start over to launch with your account key, or import that older key in Advanced.'
   :s.legacyLaunch&&s.hasKey?'This unfinished launch used its own key. Enter its passphrase, or use Start over.'
   :s.hasKey?(s.canUnlockPasskey?'Open your key with Face ID / Touch ID, or with your passphrase.':'Enter your key passphrase to open it.')
   :'Create your account key with a passphrase (your browser’s suggested password works). Then add Face ID / Touch ID.');
  for(const n of target.querySelectorAll('button,input,textarea'))if(n!==toggle)n.disabled=working||!usable||!s.wallet;
  exportButton.disabled=working||!usable||!s.hasKey;toggle.disabled=true;
 }
 async function run(fn,{clear=[]}={}){
  if(working||!enabled())return;working=true;message='Opening your account key…';failed=false;render();notify();
  try{await fn();for(const input of clear)input.value='';message='';failed=false;}catch(error){message=error.message||'Your key could not be opened. Retry.';failed=true;}
  finally{working=false;render();notify();}
 }
 signIn.addEventListener('click',()=>void run(()=>key.refresh({signIn:true})));
 walletUnlock.addEventListener('click',()=>void run(()=>key.refresh({signIn:true})));
 refresh.addEventListener('click',()=>void run(()=>key.refresh()));
 enrollPasskey.addEventListener('click',()=>void run(()=>key.enablePasskey()));
 unlockPasskey.addEventListener('click',()=>void run(()=>key.unlockWithPasskey()));
 form.addEventListener('submit',e=>{e.preventDefault();const a=password.input.value,b=again.input.value;void run(()=>formMode==='replace'?key.replaceKey(a,b):formMode==='protect'?key.protectWithPassphrase(a,b):key.unlock(a,b),{clear:[password.input,again.input]});});
 restore.addEventListener('click',()=>void run(async()=>{const f=file.files?.[0];if(f?.size>20000)throw Error('Choose an encrypted key file up to 20 KB.');const backup=f?await f.text():paste.value.trim();await key.importKey(backup,importPassword.input.value);},{clear:[file,paste,importPassword.input,password.input,again.input]}));
 changeForm.addEventListener('submit',e=>{e.preventDefault();void run(async()=>{await key.changePassphrase(old.input.value,next.input.value,confirm.input.value);exported.hidden=true;text.value='';link.href='#';},{clear:[old.input,next.input,confirm.input]});});
 exportButton.addEventListener('click',()=>{try{const backup=key.exportCopy();text.value=backup;link.href='data:application/json;charset=utf-8,'+encodeURIComponent(backup);advanced.open=true;exported.hidden=false;say('Your copy is encrypted. Keep its passphrase separately.');}catch(e){say(e.message,true);}});
 save.addEventListener('click',()=>{if(!text.value)return;const url=URL.createObjectURL(new Blob([text.value],{type:'application/json'})),a=h('a',{href:url,download:'qhooks-account-encrypted-key.json'});doc.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text.value);say('Encrypted key text copied.');}catch{text.focus();text.select();say('Select and copy the encrypted text below.');}});
 select.addEventListener('click',()=>{text.focus();text.select();text.setSelectionRange(0,text.value.length);});
 async function refreshWallet({force=false}={}){
  const wallet=current()?.owner?.toLowerCase()||null;if(wallet===lastWallet&&!force){render();return;}lastWallet=wallet;
  message='';failed=false;for(const input of [password.input,again.input,importPassword.input,old.input,next.input,confirm.input,file,paste,text])input.value='';exported.hidden=true;link.href='#';
  render();notify();if(wallet)await run(()=>key.refresh());
 }
 render();
 key.checkPasskeySupport?.().then(()=>{render();notify();}).catch(()=>{});
 return Object.freeze({key,render,refresh:refreshWallet,lock(){key.lock();for(const input of [password.input,again.input,importPassword.input,old.input,next.input,confirm.input])input.value='';message='';failed=false;render();notify();}});
}
