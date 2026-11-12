import {memberWallet,memberWalletKey} from './qx-member-wallet.mjs';
import {readPrivyAppConfig,privyLinkedMethods} from './qx-privy-app-config.mjs';
const KINDS=[['x','X'],['telegram','Telegram'],['discord','Discord'],['farcaster','Farcaster']];
const PENDING='qhooks:member-link:v1';
export function readPendingMemberLink(owner,{storage,now=Date.now()}={}){
 try{const source=storage===undefined?globalThis.sessionStorage:storage,found=JSON.parse(source?.getItem(PENDING)||'null'),wallet=memberWalletKey(owner);return wallet&&memberWalletKey(found?.wallet)===wallet&&KINDS.some(([kind])=>kind===found.kind)&&Number.isFinite(found.at)&&now-found.at<30*60000&&found.at<=now+60000?{...found,wallet}:null;}catch{return null;}
}
const reason=error=>/^[a-z][a-z0-9_]{0,60}$/.test(error?.linkedCode||error?.code||'')?(error.linkedCode||error.code):'linked_accounts_unavailable';
const failure=error=>/last.*(?:account|method)|at least one/i.test(error?.message||'')?'Keep at least one sign-in method on your account.':error?.message||'Linked accounts could not be updated. Try again.';

// Independent of profile drafts: these actions never replace name, bio or picture fields.
export function mountMemberLinkedAccounts(target,{hub,auth,client,document:doc=globalThis.document,getBridge=()=>globalThis.qhooksPrivySignerControls,getLoader=()=>globalThis.qhooksEnsurePrivyControls,readAppConfig=()=>readPrivyAppConfig(),eventTarget=globalThis.window,storage=()=>globalThis.sessionStorage,onPublished=()=>{},stageVisibility=false,beforeLink=()=>{},telegramReady,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),logger=globalThis.console}={}){
 const h=(tag,attrs={},...children)=>{const node=doc.createElement(tag);for(const[key,value]of Object.entries(attrs))if(key==='class')node.className=value;else node.setAttribute(key,value);node.append(...children);return node;};
 const syncButton=h('button',{type:'button',class:'qa-btn','data-account-action':'sync'},'Sync from your sign-in');
 syncButton.addEventListener('click',()=>run(async ctx=>{await ensurePrivy(ctx);status.textContent='Syncing from your sign-in…';const expected=bridge.state?.linked?.some(item=>item.kind==='x')?'x':undefined;await sync(ctx,'POST',expected);status.textContent='Linked accounts are up to date.';},{continueAfterSignIn:true}));
 const section=h('section',{class:'qmp-linked','aria-label':'Linked accounts'}),heading=h('h3',{},'Linked accounts'),help=h('p',{class:'qmp-help'},'Optional. Your profile is complete with or without linked accounts. You choose which verified accounts appear.'),rows=h('div',{class:'qmp-linked-rows'}),status=h('p',{role:'status','aria-live':'polite',class:'qmp-linked-status'});
 section.append(heading,help,syncButton,rows,status);target.append(section);
 const visibilityDraft=new Map();
 let wallet=null,accounts=[],generation=0,busy=false,profileSaving=false,disposed=false,loaded=false,bridge=null,unsubscribe=()=>{},resumeKey='',bridgeLoading=null,configLoading=null,resumeTimer=null,resumeStarted=0,resumeNotice='',methods=privyLinkedMethods(null,{telegramReady});
 const owner=()=>memberWalletKey(hub.snapshot().current?.owner);
 function pending(value){try{if(value===null)storage()?.removeItem(PENDING);else if(value)storage()?.setItem(PENDING,JSON.stringify(value));else{const found=JSON.parse(storage()?.getItem(PENDING)||'null');return found&&typeof found.wallet==='string'&&KINDS.some(([kind])=>kind===found.kind)&&Number.isFinite(found.at)&&Date.now()-found.at<30*60000&&found.at<=Date.now()+60000?found:null;}}catch{}return null;}
 const available=kind=>typeof bridge?.linkAccount==='function'&&(!kind||methods[kind]===true);
 const onUser=()=>{const state=bridge?.state;return state?.authenticated&&state.wallets?.some(value=>memberWalletKey(value)===wallet||memberWallet(wallet)?.family==='solana'&&value===memberWallet(wallet).address);};
 function current(mine,who,connection){connection?.assertCurrent();if(disposed||generation!==mine||wallet!==who||owner()!==who)throw Error('Your wallet changed. Open your own profile to continue.');}
 function render(){
  if(disposed)return;section.hidden=!wallet||owner()!==wallet;const canSync=available()&&typeof bridge.identityToken==='function';syncButton.hidden=!canSync;syncButton.disabled=busy||profileSaving;if(canSync&&!syncButton.parentNode)section.append(syncButton);else if(!canSync)syncButton.remove();
  const button=(kind,action,text,handler)=>{const node=h('button',{type:'button',class:'qa-btn','data-account-kind':kind,'data-account-action':action},text);node.disabled=busy||profileSaving;node.addEventListener('click',()=>profileSaving?undefined:stageVisibility&&action==='visibility'?handler({check(){}}):run(handler,{kind}));return node;};
  rows.replaceChildren(...KINDS.map(([kind,label])=>{
   const found=accounts.filter(account=>account.kind===kind),controls=h('div',{class:'qmp-linked-controls'});
   if(!available(kind))controls.append(h('span',{class:'qmp-linked-soon'},'Opens soon'));
   else if(found.length)for(const account of found){const item=h('div',{class:'qmp-linked-item'}),handle=h('span',{class:'qmp-linked-handle'},(kind==='discord'?'':'@')+account.handle);item.append(handle,
    button(kind,'visibility',account.visible?'Hide':'Show',async context=>{if(stageVisibility){account.visible=!account.visible;visibilityDraft.set(kind+':'+account.id,{kind,id:account.id,visible:account.visible});render();status.textContent='Visibility changed in this draft. Save public profile to apply it.';return;}const result=await client.accountVisibility(context.who,{kind,id:account.id,visible:!account.visible},context.options);context.check();install(result);status.textContent=account.visible?'Account hidden from your profile.':'Account shown on your profile.';}),
    button(kind,'unlink','Unlink',async context=>{await ensurePrivy(context);const linked=bridge.state?.linked;if(!Array.isArray(linked)||linked.some(item=>item.kind===kind&&item.id===account.id))await bridge.unlinkAccount(kind,account.id);context.check();await sync(context,'DELETE');status.textContent=label+' unlinked.';}));controls.append(item);}
   else controls.append(h('span',{class:'qmp-linked-optional'},'Optional'),button(kind,'link','Link',async context=>{if(accounts.some(account=>account.kind===kind)){status.textContent='This account is already linked. Choose Show, Hide or Unlink.';return;}await ensurePrivy(context);beforeLink(context.who);context.check();pending({wallet:context.who,kind,at:Date.now()});if(!bridge.state?.linked?.some(item=>item.kind===kind)){status.textContent='Continue with '+label+' to link your account.';await bridge.linkAccount(kind);context.check();}await sync(context,'POST',kind);status.textContent=label+' linked.';}));
   return h('div',{class:'qmp-linked-row','data-account-row':kind},h('strong',{},label),controls);
  }));
 }
 function draftAccounts(value){return value.map(account=>({...account,...(visibilityDraft.get(account.kind+':'+account.id)||{})}));}
 function install(result){accounts=draftAccounts(result.accounts);loaded=true;render();onPublished(result);}
 async function read(context){const result=await client.readAccounts(context.who,context.options);context.check();accounts=draftAccounts(result.accounts);loaded=true;render();}
 function context(kind){const mine=generation,who=wallet,connection=auth.capture();if(connection.owner!==who)throw Error('Connect the wallet that owns this profile.');return{who,options:{auth:auth.authHeaders(),connection},check:()=>{current(mine,who,connection);if(kind&&!available(kind))throw Error('Opens soon');},connection};}
 async function ensurePrivy(ctx){
  ctx.check();if(!available()||typeof bridge.identityToken!=='function')throw Error('Opens soon');
  if(!onUser()){
   const identity=memberWallet(ctx.who);if(identity?.family!=='evm'||typeof bridge.loginWithWallet!=='function')throw Object.assign(Error('This wallet is not on the same QHooks sign-in as your X account.'),{linkedCode:'wallet_not_on_privy_user'});
   status.textContent='Sign once to connect this wallet to your QHooks account. Free, no transaction.';
   await bridge.loginWithWallet({address:identity.address,signMessage:async text=>{ctx.check();const signature=await ctx.connection.sign(text);ctx.check();return signature;}});ctx.check();
   if(!onUser())throw Object.assign(Error('This wallet is not on the same QHooks sign-in as your X account.'),{linkedCode:'wallet_not_on_privy_user'});
  }
 }
 // A fresh identity token. Right after a page load or an OAuth return Privy may not be ready yet: on a failed or empty
 // first try, wait (≤ 6 s) until it reports ready and signed in, then try exactly once more.
 async function freshProof(ctx){
  let empty=false;const once=async()=>{try{const t=await bridge.identityToken();empty=!(typeof t==='string'&&t);return empty?null:t;}catch{empty=false;return null;}};
  let token=await once();if(token)return token;ctx.check();
  status.textContent='Waiting for your sign-in to be ready…';
  for(let waited=0;waited<6000&&!(bridge.state?.ready&&bridge.state?.authenticated);waited+=200){await wait(200);ctx.check();}
  token=await once();if(token)return token;
  if(empty)throw Object.assign(Error('Your sign-in did not return a proof. Tap Sync from your sign-in again.'),{linkedCode:'no_identity_token'});
  throw Object.assign(Error('QHooks could not get a fresh proof from your sign-in. Tap Sync from your sign-in again.'),{linkedCode:'identity_token_unavailable'});
 }
 async function sync(ctx,method='POST',expectedKind){
  // The shipped Privy getIdentityToken awaits updateUserAndIdToken before returning.
  // Link callbacks can precede that update: retry only this confirmation race, with a fresh proof each time.
  for(let attempt=0;attempt<3;attempt++){
   let identityToken=await freshProof(ctx);ctx.check();
   if(typeof identityToken!=='string'||!identityToken)throw Object.assign(Error('Your sign-in did not return a proof. Tap Sync from your sign-in again.'),{linkedCode:'no_identity_token'});
   try{const result=await client.syncAccounts(ctx.who,{identityToken,...(expectedKind?{expectedKind}:{})},{...ctx.options,method});ctx.check();install(result);pending(null);return result;}
   catch(error){if(error?.linkedCode!=='linked_account_not_shared'||attempt===2)throw error;status.textContent='Waiting for your sign-in to confirm the linked account…';await wait(200*(attempt+1));ctx.check();}
  }
 }
 async function run(action,{resume=false,kind,continueAfterSignIn=false}={}){
  if(disposed||busy||!wallet||owner()!==wallet||!available(kind))return;const mine=generation;busy=true;render();
  try{const ctx=context(kind);await ctx.connection.check();ctx.check();
   if(!auth.boardSession()){
    if(resume)return;status.textContent='Sign in with a free message. This links no account and moves no funds.';await auth.signIn(ctx.connection);ctx.check();ctx.options.auth=auth.authHeaders();await read(ctx);status.textContent='Signed in. Choose an account action when you are ready.';if(!continueAfterSignIn)return;
   }
   ctx.options.auth=auth.authHeaders();if(!loaded)await read(ctx);ctx.check();await action(ctx);
  }catch(error){if(!disposed&&generation===mine){status.replaceChildren(failure(error),' ',h('code',{class:'qmp-linked-code'},reason(error)));logger?.warn?.('[QHooks linked accounts] '+reason(error));}}finally{if(generation===mine){busy=false;render();maybeResume();}}
 }
 function maybeResume(){
  const found=pending();if(disposed||busy||!found||found.wallet!==wallet||owner()!==wallet)return;
  if(!available(found.kind)||!auth.boardSession()||!onUser()){
   status.textContent='Your linked account is waiting for sign-in. Tap Sync from your sign-in when it is ready.';
   if(!resumeNotice){resumeNotice='resume_sign_in_not_ready';logger?.warn?.('[QHooks linked accounts] '+resumeNotice);}
   if(!resumeStarted)resumeStarted=Date.now();
   if(!resumeTimer&&Date.now()-resumeStarted<30000){resumeTimer=setTimeout(()=>{resumeTimer=null;maybeResume();},1000);resumeTimer.unref?.();}return;
  }
  if(resumeTimer){clearTimeout(resumeTimer);resumeTimer=null;}
  const key=found.wallet+':'+found.kind+':'+found.at;if(resumeKey===key)return;resumeKey=key;
  void run(async ctx=>{await sync(ctx,'POST',found.kind);status.textContent='Linked accounts are up to date.';},{resume:true,kind:found.kind});
 }
 function refreshBridge(){const next=getBridge();if(next!==bridge){unsubscribe();unsubscribe=()=>{};bridge=next||null;if(typeof bridge?.subscribe==='function'){const stop=bridge.subscribe(()=>{render();maybeResume();});if(typeof stop==='function')unsubscribe=stop;}}render();maybeResume();}
 async function prepareBridge(mine,who){
  if(disposed||mine!==generation||who!==wallet||owner()!==who)return false;refreshBridge();if(available())return true;const loader=getLoader();if(typeof loader!=='function'){if(pending())status.textContent='Your sign-in is still loading. Reopen your profile, then tap Sync from your sign-in.';return false;}
  if(bridgeLoading?.mine===mine&&bridgeLoading.who===who)return bridgeLoading.promise;
  const operation={mine,who};bridgeLoading=operation;operation.promise=(async()=>{try{await loader();if(disposed||mine!==generation||who!==wallet||owner()!==who)return false;refreshBridge();return available();}catch{status.textContent='Your sign-in could not load. Reopen your profile, then tap Sync from your sign-in.';logger?.warn?.('[QHooks linked accounts] bridge_load_failed');return false;}finally{if(bridgeLoading===operation)bridgeLoading=null;}})();return operation.promise;
 }
 async function loadMethods(mine,who){
  if(configLoading?.mine===mine&&configLoading.who===who)return configLoading.promise;
  const operation={mine,who};configLoading=operation;operation.promise=(async()=>{let config=null;try{config=await readAppConfig();}catch{}if(!disposed&&mine===generation&&who===wallet&&owner()===who){methods=privyLinkedMethods(config,{telegramReady});if(!config){status.textContent='Account linking settings could not load. You can still tap Sync from your sign-in.';logger?.warn?.('[QHooks linked accounts] link_settings_unavailable');}render();maybeResume();}})().finally(()=>{if(configLoading===operation)configLoading=null;});return operation.promise;
 }
 async function loadAccounts(mine,who){if(disposed||mine!==generation||who!==wallet||owner()!==who||!KINDS.some(([kind])=>available(kind))||!auth.boardSession()||loaded||busy)return;busy=true;render();try{const ctx=context();await ctx.connection.check();await read(ctx);}catch(error){if(mine===generation&&!disposed){status.textContent=failure(error);logger?.warn?.('[QHooks linked accounts] '+reason(error));}}finally{if(mine===generation){busy=false;render();maybeResume();}}}
 async function refresh(){const mine=generation,who=wallet;if(!who||owner()!==who||disposed)return;await prepareBridge(mine,who);if(disposed||mine!==generation||who!==wallet||owner()!==who||!available())return;await loadMethods(mine,who);await loadAccounts(mine,who);}
 const ready=()=>{if(wallet&&owner()===wallet&&!disposed)void refresh();};eventTarget?.addEventListener?.('qhooks:privy-loader-ready',ready);eventTarget?.addEventListener?.('qhooks:privy-profile-ready',ready);eventTarget?.addEventListener?.('qhooks:privy-signer-ready',ready);
 const stop=hub.subscribe(()=>{if(owner()!==wallet){if(resumeTimer)clearTimeout(resumeTimer);resumeTimer=null;resumeStarted=0;resumeNotice='';generation++;busy=false;accounts=[];loaded=false;status.textContent='';}render();maybeResume();});
 refreshBridge();
 return{element:section,setSaving(value){profileSaving=!!value;render();},draftVisibility:()=>[...visibilityDraft.values()],restoreVisibility(value){if(!Array.isArray(value)||value.length>100)return;for(const row of value)if(row&&KINDS.some(([kind])=>kind===row.kind)&&typeof row.id==='string'&&row.id.length<=200&&typeof row.visible==='boolean')visibilityDraft.set(row.kind+':'+row.id,{kind:row.kind,id:row.id,visible:row.visible});accounts=draftAccounts(accounts);render();},markSaved(){visibilityDraft.clear();},async setWallet(value){if(resumeTimer)clearTimeout(resumeTimer);resumeTimer=null;resumeStarted=0;resumeNotice='';wallet=memberWalletKey(value);visibilityDraft.clear();generation++;busy=false;accounts=[];loaded=false;resumeKey='';status.textContent='';render();await refresh();},refresh,dispose(){if(resumeTimer)clearTimeout(resumeTimer);disposed=true;generation++;unsubscribe();stop();eventTarget?.removeEventListener?.('qhooks:privy-loader-ready',ready);eventTarget?.removeEventListener?.('qhooks:privy-profile-ready',ready);eventTarget?.removeEventListener?.('qhooks:privy-signer-ready',ready);}};
}
