import {profileUrl} from './qx-profile-address.mjs';
import {chainById} from './chains.mjs';
import {copyReviewHref} from './qx-copy-review-core.mjs';
import {followedWallet,normalizeFollowedTrade} from './qx-followed-wallets-core.mjs';
import {createTradersClient,createTraderSolanaSession} from './qx-traders.mjs';
const short=w=>String(w||'').replace(/^solana:/,'').slice(0,6)+'…'+String(w||'').slice(-4);
const quantity=n=>Number(n).toLocaleString('en-US',{maximumSignificantDigits:6});
export function mountFollowedWallets(root,{client,auth,hub,solHub,document:doc=globalThis.document,events=globalThis,timers=globalThis,notifications=globalThis,pollMs=60000,now=Date.now}={}){
 const h=(tag,attrs={},...children)=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!=null)n.setAttribute(k,String(v));for(const c of children.flat())if(c!=null)n.append(c.nodeType?c:String(c));return n;};
 const button=(text,fn,attrs={})=>{const b=h('button',{type:'button',class:'fw-button',...attrs},text);b.addEventListener('click',fn);return b;};
 const status=h('p',{class:'fw-status',role:'status','aria-live':'polite'}),account=h('div',{class:'fw-account'}),follows=h('section',{'aria-label':'Followed wallets',class:'fw-follows'}),feed=h('section',{'aria-label':'Followed wallet activity',class:'fw-feed'}),delivery=h('section',{'aria-label':'Alert delivery',class:'fw-delivery'});
 const manageTitle=h('summary',{},'Wallets & alerts'),manage=h('details',{class:'fw-manage'},manageTitle,follows);manage.open=!!doc.defaultView?.matchMedia?.('(min-width:900px)').matches;
 root.replaceChildren(account,status,h('div',{class:'fw-columns'},manage,feed),delivery);
 let disposed=false,paused=false,generation=0,timer=null,offset=0,privateOwner=null,list=[],preferences=[],configuration={},busy=null,failures=0,nextPollAt=0,settingsReady=false,activityOff=false,privateSession=null;
 const owner=()=>followedWallet(auth.owner?.()),session=()=>auth.boardSession?.(),signed=()=>owner()&&followedWallet(session()?.wallet)===owner();
 const sessionKey=()=>JSON.stringify([owner(),session()?.wallet,session()?.token,session()?.expiresAt]);
 const current=(who,seq)=>!disposed&&!paused&&owner()===who&&generation===seq;
 async function sign(){const who=owner();if(!who){auth.connect?.();throw Error('Connect a wallet first.');}if(!signed())await auth.signIn();if(owner()!==who||!signed())throw Error('Wallet changed. Sign in again.');return who;}
 const fail=e=>{status.textContent=e?.code==='following_off'?'Wallet activity is unavailable right now.':e?.message||'Refreshing. Try again.';};
 function controls(){
  account.replaceChildren();const family=h('select',{'aria-label':'Wallet family'},h('option',{value:'evm'},'EVM wallet'),h('option',{value:'solana'},'Solana wallet'));family.value=auth.family?.()||'evm';
  family.addEventListener('change',()=>{auth.selectFamily(family.value);offset=0;void reset();});
  const action=button(owner()?'Sign in':'Connect wallet',async()=>{try{await sign();await reset({manual:true});}catch(e){fail(e);}});action.hidden=signed()||family.value==='solana'&&!owner();
  account.append(family,action,h('p',{class:'fw-owner'},owner()?short(owner()):'Your private follow list'));
  if(family.value==='solana'&&!owner()&&solHub){const snap=solHub.snapshot(),pick=h('select',{'aria-label':'Solana wallet'},...snap.wallets.map(w=>h('option',{value:w.id},w.name))),connect=button('Connect Solana wallet',async()=>{try{await solHub.connect(pick.value);await reset();}catch(e){fail(e);}});connect.disabled=!snap.wallets.length||snap.busy;account.append(pick,connect);}
 }
 function renderFollows(){
  manageTitle.textContent='Wallets & alerts'+(list.length?' · '+list.length:'');
  follows.replaceChildren(h('h2',{},'Follow a wallet'));
  if(!signed()){follows.append(h('p',{},'Sign in to save your follow list and alert choices.'));return;}
  const address=h('input',{'aria-label':'Wallet address',placeholder:'EVM or Solana address',autocomplete:'off',spellcheck:'false',required:''}),label=h('input',{'aria-label':'Wallet label',placeholder:'Label (optional)',maxlength:'24'}),add=h('button',{type:'submit',class:'fw-button'},'Follow'),form=h('form',{class:'fw-add'},address,label,add);
  form.addEventListener('submit',async e=>{e.preventDefault();const wallet=followedWallet(address.value);if(!wallet){fail(Error('Enter a full EVM or Solana wallet address.'));address.focus();return;}add.disabled=true;try{const who=await sign();await client.request('/api/wallets/follow',{method:'POST',body:JSON.stringify({wallet,label:label.value,on:true,notifications:false})});if(owner()===who){status.textContent='Wallet followed. Alerts are off until you choose them.';await reset();}}catch(error){fail(error);}finally{add.disabled=false;}});
  follows.append(form,h('p',{class:'fw-help'},'A follow does not authorize trades. Choose alerts for each wallet.'));
  const ul=h('ul',{class:'fw-wallet-list'});
  for(const f of list){
   const row=h('li',{'data-wallet':f.wallet}),pref=preferences.find(p=>p.wallet===f.wallet),title=h('div',{class:'fw-wallet-name'},h('b',{},f.label||short(f.wallet)),h('small',{},f.wallet.startsWith('solana:')?'Solana · '+short(f.wallet):'EVM · '+short(f.wallet))),mode=h('select',{'aria-label':'Alerts for '+(f.label||short(f.wallet))});
   for(const [value,text]of[['','Choose alerts'],['off','Alerts off'],['buy','Buys'],['first','First buys'],['sell','Sells'],['all','Buys + sells']]){const option=h('option',{value},text);option.disabled=!value||!configuration.activityAlerts&&['sell','all'].includes(value);mode.append(option);}mode.value=pref?.mode||'';
   const push=h('input',{type:'checkbox','aria-label':'Browser alerts for '+short(f.wallet)}),telegram=h('input',{type:'checkbox','aria-label':'Telegram alerts for '+short(f.wallet)});push.checked=pref?.push==null?true:!!pref.push;telegram.checked=pref?.telegram==null?configuration.telegramAvailable!==false:!!pref.telegram;telegram.disabled=configuration.telegramAvailable===false;
   const save=button('Save alerts',async()=>{save.disabled=true;try{if(!mode.value)throw Error('Choose an alert mode first.');const who=await sign();await client.request('/api/traders/alerts/following',{method:'POST',body:JSON.stringify({wallet:f.wallet,mode:mode.value,push:push.checked,telegram:telegram.checked})});if(owner()===who){status.textContent='Alert choices saved.';await loadSettings();}}catch(e){fail(e);}finally{save.disabled=false;}});
   const remove=button('Unfollow',async()=>{try{const who=await sign();await client.follow(f.wallet,false);if(owner()===who)await reset();}catch(e){fail(e);}},{class:'fw-button fw-quiet'});
   row.append(title,h('div',{class:'fw-pref'},mode,h('label',{},push,' Browser'),h('label',{},telegram,' Telegram'),save),h('div',{class:'fw-row-actions'},h('a',{href:profileUrl({wallet:f.wallet})},'Wallet profile'),h('a',{href:copyReviewHref(f.wallet)},'Copy'),remove));ul.append(row);
  }
  follows.append(ul);if(!list.length)follows.append(h('p',{class:'fw-help'},'Follow a wallet to see its indexed activity here.'));
 }
 function renderFeed(data){
  feed.replaceChildren(h('div',{class:'fw-section-head'},h('h2',{},'Followed wallets'),button('Refresh',()=>void (async()=>{if(signed())await loadSettings();await loadFeed({manual:true});})().catch(fail))));
  if(!data){feed.append(h('p',{class:'fw-help'},activityOff?'Wallet activity is unavailable right now.':signed()?'Refreshing':'Sign in to see your followed wallets.'));return;}
  const ul=h('ul',{class:'fw-trades'}),names=new Map(list.map(f=>[f.wallet,f.label||short(f.wallet)]));
  for(const raw of (data.trades||[]).slice(0,40)){const t=normalizeFollowedTrade(raw);if(!t)continue;const row=h('li',{'data-trade':t.id}),identity=h('div',{class:'fw-trade-identity'},h('a',{href:profileUrl({wallet:t.wallet})},names.get(t.wallet)||short(t.wallet)),h('strong',{class:t.side==='buy'?'fw-buy':'fw-sell'},t.side==='buy'?'bought':'sold'),h('b',{},t.symbol));
   row.append(identity,h('p',{class:'fw-size'},quantity(t.quantity)+' '+t.symbol+(typeof t.usd==='number'?' · $'+t.usd.toLocaleString('en-US',{maximumFractionDigits:2}):'')),h('p',{class:'fw-help'},(t.chainId==='solana'?'Solana':chainById(t.chainId)?.short||chainById(t.chainId)?.name||t.chainId)+' · '+Math.max(0,Math.floor((now()-t.at)/60000))+'m ago · '+t.source),h('div',{class:'fw-row-actions'},h('a',{class:'fw-proof',href:t.proof,title:'Check this token with QProof; no verdict is assumed'},'QProof →'),h('a',{class:'fw-button',href:t.buy,'aria-label':'Review buying '+t.symbol},'Buy')));ul.append(row);
  }
  feed.append(ul);if(!data.trades?.length)feed.append(h('p',{class:'fw-help'},'No recent indexed trades for these wallets. Missing history is unknown.'));
  feed.append(h('p',{class:'fw-help'},data.refreshing?'Some indexed sources are refreshing.':'Latest indexed activity · older trades may be omitted.'));
  if(data.nextOffset!=null)feed.append(button('Next followed wallets',()=>{offset=data.nextOffset;void loadFeed();}));if(offset)feed.append(button('First followed wallets',()=>{offset=0;void loadFeed();}));
 }
 async function loadFeed({manual=false}={}){
  timers.clearTimeout(timer);if(manual)activityOff=false;if(disposed||paused||doc.hidden||busy===generation)return;if(!signed()){list=[];preferences=[];controls();renderFollows();renderFeed();return;}if(activityOff)return;if(!manual&&now()<nextPollAt){timer=timers.setTimeout(()=>void loadFeed(),nextPollAt-now());return;}const who=owner(),seq=generation;busy=seq;let delay=Math.max(60000,pollMs);
  try{const data=await client.request('/api/wallets/followed-activity?'+new URLSearchParams({offset}));if(current(who,seq)&&data.owner===who){failures=data.refreshing?Math.min(4,failures+1):0;delay=Math.min(600000,Math.max(60000,pollMs)*2**failures);renderFeed(data);}}catch(e){if(current(who,seq)){if(e?.code==='following_off'){activityOff=true;failures=0;nextPollAt=0;status.textContent='';renderFeed();}else{failures=Math.min(4,failures+1);delay=Math.min(600000,Math.max(Math.max(60000,pollMs)*2**failures,Number(e.retryAfter||0)*1000));fail(e);}}}finally{if(busy===seq)busy=null;if(current(who,seq)&&!activityOff){nextPollAt=now()+delay;if(!doc.hidden)timer=timers.setTimeout(()=>void loadFeed(),delay);}}
 }
 async function loadSettings(){
  const who=owner(),seq=generation;const [saved,prefs]=await Promise.all([client.follows(),client.request('/api/traders/alerts/following')]);if(!current(who,seq))return;
  list=(saved.follows||[]).filter(f=>f.kind!=='token');preferences=prefs.preferences||[];configuration={...configuration,...prefs};settingsReady=true;renderFollows();renderDelivery();
 }
 async function enablePush(){
  const who=await sign(),config=await client.alertStatus();if(owner()!==who)return;
  if(!config.pushEnabled)throw Error('Browser alerts are unavailable. Telegram remains available for linked wallets.');
  const n=notifications;if(!n.navigator?.serviceWorker||!n.PushManager||!n.Notification)throw Error('This browser does not support push. On iPhone, add QHooks to your Home Screen first.');
  const permission=await n.Notification.requestPermission();if(permission!=='granted')throw Error('Notifications were not enabled.');if(owner()!==who)return;
  await n.navigator.serviceWorker.register('/sw.js');const registration=await n.navigator.serviceWorker.ready;
  const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((config.publicKey.length+3)%4)),c=>c.charCodeAt(0));
  const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});if(owner()!==who)return;
  await client.push(subscription.toJSON());if(owner()===who)status.textContent='Browser alerts enabled for this wallet. Choose wallets above.';
 }
 function renderDelivery(){delivery.replaceChildren(h('h2',{},'Alert delivery'),h('p',{class:'fw-help'},configuration.telegramAvailable===false?'Browser alerts need notification permission. Telegram linking is unavailable for this wallet.':'Choose each wallet’s alerts above. Browser alerts need notification permission. Telegram alerts use your linked @qhooks_bot wallet.'),h('div',{class:'fw-row-actions'},button('Enable browser alerts',()=>void enablePush().catch(fail)),...(configuration.telegramAvailable===false?[]:[h('a',{class:'fw-button',href:'https://t.me/qhooks_bot',target:'_blank',rel:'noopener noreferrer'},'Link Telegram')])));}
 async function reset({retry=false,manual=false}={}){
  if(disposed||paused)return;if(retry&&now()<nextPollAt){if(!doc.hidden)timer=timers.setTimeout(()=>void reset({retry:true}),nextPollAt-now());return;}if(doc.hidden)return;
  const nextSession=sessionKey();if(manual||nextSession!==privateSession){activityOff=false;privateSession=nextSession;}
  generation++;if(!retry){failures=0;nextPollAt=0;}settingsReady=false;privateOwner=owner();list=[];preferences=[];busy=null;timers.clearTimeout(timer);controls();renderFollows();renderFeed();renderDelivery();
  if(!signed())return;
  try{await loadSettings();await loadFeed();}catch(e){fail(e);failures=Math.min(4,failures+1);const delay=Math.min(600000,60000*2**failures);nextPollAt=now()+delay;if(!doc.hidden)timer=timers.setTimeout(()=>void reset({retry:true}),delay);}
 }
 const changed=()=>{if(owner()!==privateOwner||sessionKey()!==privateSession)void reset();},visibility=()=>{if(doc.hidden)timers.clearTimeout(timer);else if(!settingsReady)void reset({retry:true});else void loadFeed();};
 const offHub=hub?.subscribe?.(changed),offSol=solHub?.subscribe?.(changed);doc.addEventListener('visibilitychange',visibility);
 const hide=event=>{if(event.persisted){paused=true;generation++;timers.clearTimeout(timer);}else dispose();},show=event=>{if(event.persisted&&!disposed){paused=false;void reset();}};
 const dispose=()=>{disposed=true;generation++;timers.clearTimeout(timer);offHub?.();offSol?.();doc.removeEventListener('visibilitychange',visibility);events.removeEventListener?.('pagehide',hide);events.removeEventListener?.('pageshow',show);};events.addEventListener?.('pagehide',hide);events.addEventListener?.('pageshow',show);void reset();
 return {refresh:()=>reset({manual:true}),dispose,get state(){return {owner:privateOwner,follows:list.length,disposed};}};
}
export async function createTrackingContext(){
 const [{getWalletHub},sessions,{createSolanaProfileWallet},{laneShell}]=await Promise.all([import('./wallet-hub.mjs'),import('./qx-board-session.mjs'),import('./qx-solana-profile-wallet.mjs'),import('./qx-a/pages/markets-shell.mjs')]);

 const hub=getWalletHub(window),solHub=createSolanaProfileWallet(window),evm=sessions.createBoardSession({getConnection:()=>hub.snapshot().current}),sol=createTraderSolanaSession({getConnection:()=>solHub.snapshot().current,capture:()=>solHub.capture()});let family='evm';
 const auth={family:()=>family,selectFamily:v=>{family=v;},owner:()=>family==='solana'?solHub.snapshot().current?.owner:hub.snapshot().current?.owner,boardSession:()=>family==='solana'?sol.boardSession():evm.boardSession(),authHeaders:()=>family==='solana'?sol.authHeaders():evm.authHeaders(),signIn:()=>family==='solana'?sol.signIn():evm.signIn(),connect:()=>hub.open()};
 const client=createTradersClient({headers:auth.authHeaders});return {client,auth,hub,solHub,laneShell};
}
export async function bootFollowedWallets(){
 const root=document.getElementById('followed-wallets');if(!root)return;const {client,auth,hub,solHub,laneShell}=await createTrackingContext();laneShell({active:'trade',title:'Following',art:false});mountFollowedWallets(root,{client,auth,hub,solHub});addEventListener('pagehide',event=>{if(!event.persisted)solHub.dispose();});
}
