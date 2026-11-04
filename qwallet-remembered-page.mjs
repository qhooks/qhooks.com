import {bindKeyBackupFeedback} from './key-backup-feedback.mjs';
// UI orchestration only. Accepted wallet/signing modules load on explicit actions.
import {discoverConnectedWallets as discoverWallets,passiveProvider,bindWalletWorkspace} from './wallet-hub-fresh.mjs';
import {launchChains} from './chain-catalog.mjs';
const ZERO='0x'+'0'.repeat(40),address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x),pending=e=>!!e?.journal&&(!['confirmed','reverted','rejected'].includes(e.journal.status)||e.journal.status==='confirmed'&&!e.outcome);
export function bindQWalletPage({document:d=document,target=window,loadSetup,loadWorkspace,loadToolkit,downloadFile,clock=Date.now,discover=discoverWallets}){
 const $=id=>d.getElementById('qw-'+id),ensure=(ok,m)=>{if(!ok)throw Error(m);};
 let walletBinding=null;
 let wallets=[],provider=null,session=null,setup=null,workspace=null,modules=null,toolkit=null,busy=false,dead=false,epoch=0,release=null,review=null,reviewKind=null,quoteTimer=null,approved=false,units=null;
 const chain=()=>launchChains.find(c=>c.id===$('chain').value),connected=()=>session?.current?.chainId===chain()?.id?session.current:null;
 const state=()=>workspace?.snapshot(),exec=()=>state()?.execution;
 const note=(message,error=false)=>{if(dead)return;$('feedback').textContent=message;$('feedback').dataset.error=String(error);};
 const keyUI=bindKeyBackupFeedback({document:d,prefix:'qw-',run,busy:()=>dead||busy});
 function clearReview(){review=null;reviewKind=null;target.clearTimeout(quoteTimer);$('consent').checked=false;}
 function clearSecrets(){$('password').value='';$('backup-file').value='';}
 function connectionChanged(){epoch++;clearReview();clearSecrets();approved=false;workspace?.lock();render();}
 function format(raw,decimals){if(typeof raw!=='string'||!/^(0|[1-9][0-9]*)$/.test(raw))return '—';const s=raw.padStart(decimals+1,'0'),fraction=decimals?s.slice(-decimals).replace(/0+$/,''):'';return decimals?s.slice(0,-decimals)+(fraction?'.'+fraction:''):s;}
 function render(){
  if(dead)return;const c=connected(),s=setup?.snapshot(),w=state(),e=exec(),working=busy||s?.busy||w?.busy,held=pending(e),kind=$('kind').value;
  const on=(id,ok)=>{$(id).disabled=!ok;};
  $('chain').disabled=working||!!session;$('provider').disabled=working||!!session;$('tokens').disabled=working||!!setup;
  on('connect',!working&&wallets.length>0&&!c);on('disconnect',!!session&&!working);on('setup',!!c&&!working&&!setup);
  on('setup-review',!!c&&!!setup&&!working&&!s.pool&&!['unknown','submitting','submitted','confirmed','reverted'].includes(s.stages.at(-1)?.status));
  // A confirmed verifier may advance to the second, explicitly reviewed deployment.
  if(c&&setup&&!working&&!s.pool&&s.verifier&&s.stages.length===1)on('setup-review',true);
  on('setup-check',!!c&&!!setup&&!working);on('setup-save',!!c&&!!setup&&!working);on('setup-download',!!setup&&!working);on('setup-import',!!c&&!working&&!s?.stages?.length);
  $('setup-file').disabled=$('setup-import').disabled;on('open',!!c&&!!s?.pool&&!workspace&&!working);
  on('generate',!!c&&!!workspace&&!working&&!held&&(!w.publicKeyHex||w.locked));on('restore-key',!!c&&!!workspace&&!working&&!held);
  on('export-key',!!c&&!!workspace&&!working&&!w.locked);on('verify-key',!!c&&!!workspace&&!working&&!w.locked);on('lock-key',!!workspace&&!w.locked);
  $('password').disabled=working||!workspace;$('backup-file').disabled=working||!workspace;
  for(const id of ['kind','asset','amount','recipient'])$(id).disabled=working||!workspace||held;
  $('asset-label').hidden=kind==='enroll';$('amount-label').hidden=kind==='enroll';$('recipient-label').hidden=kind!=='withdraw';
  on('refresh',!!c&&!!w?.publicKeyHex&&!working);on('prepare',!!c&&!!w?.publicKeyHex&&!working&&!held&&(kind==='enroll'||units?.asset===$('asset').value));
  on('approve',!!c&&!!w?.action&&!working&&!held&&!w.locked&&w.backupVerified&&!approved&&!e?.recoveryOnly);
  on('action-review',!!c&&!!w?.fields&&!working&&!held&&!e?.recoveryOnly&&(!w.action||approved)&&!['confirmed','reverted'].includes(e?.journal?.status));
  on('clear',!!workspace&&!working&&!held);on('action-check',!!c&&!!e?.journal&&!working);on('action-save',!!c&&!!e?.journal&&!working);on('action-download',!!e?.journal&&!working);
  on('action-import',!!c&&!!workspace&&!working&&!held);on('action-resume',!!c&&!!workspace&&!working&&!held);$('action-file').disabled=$('action-import').disabled;
  const latest=reviewKind==='setup'?s?.quote:e?.quote,valid=!!review&&review===latest&&clock()<review.expiresAt;
  on('consent',!!c&&!working&&valid);on('send',!!c&&!working&&valid&&$('consent').checked);
  const recovery=s?.status==='recover-transaction-hash'?'setup':e?.status==='recover-transaction-hash'?'action':null;
  $('recovery').hidden=!recovery;on('recover',!!c&&!working&&!!recovery);$('hash').disabled=$('recover').disabled;
  $('connection').textContent=c?chain().name+' · '+c.owner:session?'Connection changed. Reconnect on the selected chain.':'Choose a chain and connect your installed EVM wallet.';
  $('setup-summary').textContent=s?(s.pool?'QWallet ready: '+s.pool:s.verifier?'Verifier confirmed. Review QWallet deployment.':'Review verifier deployment.')+(s.saveFailed?' Progress could not be saved. Retry saving before proceeding.':''):'Choose the native asset and any additional supported token contracts before setup.';
  $('setup-review').textContent=s?.verifier?'Review QWallet deployment':'Review verifier deployment';
  $('key-status').textContent=w?.publicKeyHex?(w.locked?'Key locked. Restore your encrypted backup to approve withdrawals.':w.backupVerified?'Backup verified. Key is unlocked in this page only.':'Download and verify your encrypted backup before enrolling.'):'No quantum key loaded.';
  $('account-summary').textContent=w?.account?['Account: '+w.account.accountId,'Enrolled: '+(w.account.registered?'yes':'no'),'Protected balance: '+(units?.asset===w.account.asset?format(w.account.balance,units.decimals)+' '+units.label:w.account.balance+' smallest units'),'Transaction: '+(e?.status||'none')].join('\n'):'Open your QWallet and create or restore a key to load your account.';
  $('cost').textContent=valid?'Maximum reviewed network budget: '+(review.maximumFeeNative||format(review.totalWei||review.maximumFee,18))+' '+chain().gas+'. This includes the safety buffer; your wallet shows the final fee.':'Review a deployment or action for a fresh network-fee budget.';
  $('transaction').textContent=valid?JSON.stringify(review.transaction,null,2):'';
  $('intent').textContent=w?.action?JSON.stringify(w.action,null,2):w?.fields?JSON.stringify(w.fields,null,2):'Prepare an action to review its exact asset, amount and recipient.';
  walletBinding?.render();
  $('amount-unit').textContent=units?'Enter '+units.label+' using up to '+units.decimals+' decimal places. Approve 0 to revoke an existing token allowance.':'Select an asset to load its decimal precision.';
 }
 async function run(fn,message){if(dead||busy)return;busy=true;render();note('Working…');try{await fn();if(message)note(message);}catch(e){note(e?.message||'Step stopped. Review your connection and saved progress.',true);}finally{busy=false;render();}}
 function capture(){const c=connected();ensure(c,'Connect on the selected chain');return {epoch,session,connection:c,setup,workspace};}
 async function live(c){ensure(!dead&&epoch===c.epoch&&session===c.session&&session.current===c.connection,'Connection changed; reconnect');await session.refresh(c.connection);ensure(!dead&&epoch===c.epoch&&session===c.session&&session.current===c.connection,'Connection changed; reconnect');}
 const prefix=()=>{const c=connected();ensure(c,'Connected wallet required');return 'qhooks:qwallet:v1:'+c.chainId+':'+c.owner;};
 function store(key,value){const text=JSON.stringify(value);ensure(text.length<=500000,'Public progress too large');target.localStorage.setItem(key,text);ensure(target.localStorage.getItem(key)===text,'Progress did not persist');}
 const setupSave=j=>store(prefix()+':setup',j),actionKey=()=>{const pool=setup?.snapshot().pool;ensure(address(pool),'Confirm QWallet deployment');return prefix()+':'+pool+':action';};
 const actionSave=j=>store(actionKey(),j);
 function download(value,name,raw=false){if(downloadFile)return downloadFile(value,name,raw);const url=target.URL.createObjectURL(new Blob([raw?value:JSON.stringify(value,null,2)],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download=name;d.body.appendChild(a);a.click();a.remove();target.setTimeout(()=>target.URL.revokeObjectURL(url),30000);}
 async function file(id,limit){const f=$(id).files?.[0];ensure(f&&f.size<=limit,'Select a JSON file smaller than '+limit+' bytes');const text=await f.text();ensure(text.length<=limit,'File too large');return text;}
 async function acquire(c,rev){ensure(target.navigator?.locks,'This browser needs Web Locks support to protect progress across tabs');let done;const ready=new Promise((resolve,reject)=>done={resolve,reject});target.navigator.locks.request('qhooks-qwallet:'+c.chainId+':'+c.owner,{ifAvailable:true},lock=>{if(dead||epoch!==rev||session?.current!==c){done.reject(Error('Connection changed before opening QWallet'));return;}if(!lock){done.reject(Error('This QWallet is open in another tab. Close that session first.'));return;}return new Promise(resolve=>{release=resolve;done.resolve();});}).catch(done.reject);await ready;}
 function disconnect(){epoch++;clearReview();clearSecrets();const oldW=workspace,oldS=setup,oldSession=session;workspace=null;setup=null;session=null;provider=null;approved=false;units=null;oldW?.dispose();oldS?.dispose();oldSession?.dispose();release?.();release=null;render();}
 async function startSetup(tokens,saved=null){const c=capture(),next=await modules.createWalletDeployment({chainId:c.connection.chainId,provider,owner:c.connection.owner,tokens,toolkitText:toolkit,saved,save:setupSave,onChange:render,clock});try{await live(c);setup?.dispose();setup=next;await setup.reconcile();await live(c);$('tokens').value=setup.snapshot().tokens.join('\n');}catch(e){if(setup!==next)next.dispose();throw e;}}
 function assetOptions(){const selected=$('asset').value;$('asset').replaceChildren();for(const [value,label]of [[ZERO,chain().gas+' (native)'],...setup.snapshot().tokens.map(t=>[t,t])]){const option=d.createElement('option');option.value=value;option.textContent=label;$('asset').append(option);}if([ZERO,...setup.snapshot().tokens].includes(selected))$('asset').value=selected;}
 async function readUnits(){const c=capture(),asset=$('asset').value;units=null;let decimals=18;if(asset!==ZERO){ensure(setup.snapshot().tokens.includes(asset),'Asset is outside this QWallet policy');const data=await provider.request({method:'eth_call',params:[{to:asset,data:'0x313ce567'},'latest']});await live(c);ensure(typeof data==='string'&&/^0x[0-9a-f]{64}$/.test(data)&&BigInt(data)<=18n,'This interface supports tokens with 0–18 decimals');decimals=Number(BigInt(data));}await live(c);ensure($('asset').value===asset,'Asset changed');units={asset,decimals,label:asset===ZERO?chain().gas:'tokens'};}
 function setReview(q,kind){clearReview();review=q;reviewKind=kind;quoteTimer=target.setTimeout(()=>{clearReview();render();note('Fee review expired. Request a fresh estimate.');},Math.max(0,q.expiresAt-clock()));}
 const connectRemembered=authorized=>run(async()=>{
  disconnect();const selected=wallets.find(w=>w.uuid===$('provider').value);ensure(selected,'Select an installed wallet');provider=selected.provider;const startingEpoch=epoch;modules??=await loadSetup();ensure(!dead&&epoch===startingEpoch,'Page changed during connection');session=modules.createWalletSession(passiveProvider(provider),connectionChanged);
  try{const selectedSession=session,c=await selectedSession.connect();ensure(provider===authorized.entry.provider&&c.owner===authorized.owner&&c.chainId===authorized.chainId,'Authorized wallet changed');ensure(!dead&&session===selectedSession&&session.current===c,'Connection changed during wallet request');ensure(c.chainId===chain()?.id,'Select '+chain().name+' in your wallet, then reconnect');const captured=capture();await acquire(c,captured.epoch);await live(captured);toolkit??=await loadToolkit();await live(captured);
   const saved=target.localStorage.getItem(prefix()+':setup');if(saved){const j=modules.parseWalletDeployment(saved,c.chainId,c.owner);await startSetup(j.tokens,saved);note('Saved QWallet setup loaded and checked.');}else note('Connected. Choose your asset policy, then prepare setup.');
  }catch(e){disconnect();throw e;}
 });
 $('chain').addEventListener('change',()=>{ensure(!session,'Disconnect before changing chains');render();});
 $('setup').addEventListener('click',()=>run(async()=>{const raw=$('tokens').value.trim(),tokens=raw?raw.split(/[\s,]+/).map(x=>x.toLowerCase()):[];await startSetup(modules.normalizeWalletAssets(chain().id,tokens));await setup.save();},'Asset policy prepared. Every deployment requires its own review and wallet approval.'));
 $('setup-review').addEventListener('click',()=>run(async()=>{const c=capture();clearReview();const q=await setup.review();await live(c);setReview(q,'setup');},'Review the exact deployment and network budget.'));
 $('setup-check').addEventListener('click',()=>run(async()=>{clearReview();await setup.reconcile();},'Deployment receipts checked against the fixed contract runtime.'));
 $('setup-save').addEventListener('click',()=>run(()=>setup.save(),'Public setup progress saved.'));
 $('setup-download').addEventListener('click',()=>{if(setup)download(setup.journal(),'qhooks-'+chain().slug+'-qwallet-setup.json');});
 $('setup-import').addEventListener('click',()=>run(async()=>{ensure(!setup?.journal().stages.length,'Existing deployment progress cannot be replaced');const c=capture(),saved=await file('setup-file',500000);await live(c);const j=modules.parseWalletDeployment(saved,c.connection.chainId,c.connection.owner);await startSetup(j.tokens,saved);await setup.save();},'Imported setup checked against your selected chain and wallet.'));
 $('open').addEventListener('click',()=>run(async()=>{const c=capture();ensure(setup.snapshot().pool&&!workspace,'Confirm both deployments first');const m=await loadWorkspace();await live(c);const next=await m.createWalletWorkspace({chainId:c.connection.chainId,provider,session,tokens:setup.snapshot().tokens,toolkitText:toolkit,deploymentText:JSON.stringify(setup.journal()),save:actionSave,onChange:render,clock});try{await live(c);workspace=next;assetOptions();await readUnits();const saved=target.localStorage.getItem(actionKey());if(saved)await workspace.resume(saved);}catch(e){next.dispose();workspace=null;throw e;}},'QWallet opened. Create or restore your quantum key. Saved action progress is recovery-only.'));
 $('generate').addEventListener('click',()=>keyUI.perform(async()=>{clearReview();$('backup-file').value='';approved=false;await workspace.generate();},'Key created. Enter your backup passphrase, then download the encrypted backup.',{passwordRequired:false}));
 $('export-key').addEventListener('click',()=>keyUI.perform(async password=>{const c=capture();$('password').value='';try{const backup=await workspace.exportBackup(password);await live(c);download(backup,'qhooks-encrypted-quantum-key.json',true);}finally{clearSecrets();}},'Download requested. Choose the saved JSON file and re-enter the same passphrase to verify it.'));
 for(const[id,method]of [['verify-key','verifyBackup'],['restore-key','restore']])$(id).addEventListener('click',()=>keyUI.perform(async password=>{clearReview();approved=false;const c=capture();$('password').value='';try{const backup=await file('backup-file',20000);await live(c);await workspace[method](backup,password);await live(c);}finally{clearSecrets();}},'Quantum backup verified and key available in memory.',{fileRequired:true}));
 $('lock-key').addEventListener('click',()=>{clearReview();clearSecrets();approved=false;workspace?.lock();render();note('Key locked. Public progress remains saved.');});
 $('refresh').addEventListener('click',()=>run(async()=>{await readUnits();await workspace.refresh($('asset').value);},'Account and asset balance refreshed.'));
 function changeAction(){clearReview();approved=false;if(workspace){try{workspace.clearAction();}catch(e){note(e.message,true);}}render();}
 $('kind').addEventListener('change',changeAction);for(const id of ['amount','recipient'])$(id).addEventListener('input',changeAction);
 $('asset').addEventListener('change',()=>run(async()=>{changeAction();await readUnits();}));
 $('prepare').addEventListener('click',()=>run(async()=>{clearReview();approved=false;const kind=$('kind').value,asset=$('asset').value;let amount='';if(kind!=='enroll'){ensure(units?.asset===asset,'Load asset precision first');const entered=$('amount').value.trim();amount=kind==='approve-token'&&entered==='0'?'0':modules.parseDecimalAmount(entered,units.decimals);}await workspace.prepare({kind,asset:kind==='enroll'?'':asset,amount,recipient:kind==='withdraw'?$('recipient').value.trim().toLowerCase():''});},'Action prepared. Enrollment and withdrawals need both key approvals before fee review.'));
 $('approve').addEventListener('click',()=>run(async()=>{clearReview();const c=capture();await workspace.approve();await live(c);approved=true;},'Both keys approved this exact action. Review network costs next.'));
 $('action-review').addEventListener('click',()=>run(async()=>{const c=capture();clearReview();const q=await workspace.review();await live(c);setReview(q,'action');},'Review the exact action and network budget.'));
 $('consent').addEventListener('change',render);
 $('send').addEventListener('click',()=>run(async()=>{const c=capture(),q=review,k=reviewKind;ensure(q&&$('consent').checked&&clock()<q.expiresAt,'Review and accept the current network budget first');clearReview();await (k==='setup'?setup:workspace).submit(q);await live(c);},'Wallet submission recorded. Check the receipt before preparing another action.'));
 $('action-check').addEventListener('click',()=>run(async()=>{clearReview();await workspace.reconcile();},'Receipt and protected-account outcome checked.'));
 $('action-save').addEventListener('click',()=>run(()=>workspace.save(),'Public action progress saved.'));
 $('clear').addEventListener('click',()=>run(async()=>{clearReview();workspace.clearAction();approved=false;},'Action cleared. Your key stays in memory until locked.'));
 $('recover').addEventListener('click',()=>run(async()=>{clearReview();const controller=setup.snapshot().status==='recover-transaction-hash'?setup:workspace;await controller.recover($('hash').value.trim().toLowerCase());},'Exact transaction checked. No duplicate transaction was sent.'));
 $('action-download').addEventListener('click',()=>{if(workspace)download(workspace.exportJournal(),'qhooks-'+chain().slug+'-qwallet-action.json');});
 for(const id of ['action-import','action-resume'])$(id).addEventListener('click',()=>run(async()=>{clearReview();approved=false;const c=capture(),saved=id==='action-import'?await file('action-file',250000):target.localStorage.getItem(actionKey());await live(c);ensure(typeof saved==='string','No saved action progress');await workspace.resume(saved);},'Public action loaded for recovery. It cannot sign or resend.'));
 const params=new URLSearchParams(target.location?.search||'');if(params.getAll('chain').length===1&&launchChains.some(c=>c.id===params.get('chain')))$('chain').value=params.get('chain');
 const discovery=discover(target,entries=>{wallets=[...entries];const selected=$('provider').value;$('provider').replaceChildren();for(const entry of wallets){const option=d.createElement('option');option.value=entry.uuid;option.textContent=entry.name;$('provider').append(option);}if(wallets.some(w=>w.uuid===selected))$('provider').value=selected;render();});
 walletBinding=bindWalletWorkspace({target,connectButton:$('connect'),disconnectButton:$('disconnect'),providerSelect:$('provider'),chainId:()=>chain()?.id,selectChain:id=>{if(!new URLSearchParams(target.location?.search||'').has('chain')&&launchChains.some(c=>c.id===id))$('chain').value=id;},hasSession:()=>!!session,busy:()=>busy,onDisconnect:disconnect,onConnect:connectRemembered,note});
 function dispose(){if(dead)return;walletBinding?.dispose();disconnect();dead=true;discovery.stop();target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);render();return Object.freeze({dispose,snapshot:()=>({connected:!!connected(),setup:setup?.snapshot()||null,wallet:state()||null,busy})});
}
