import {memberWallet} from './qx-member-wallet.mjs';

const SESSION_KEY='qhooks:trader-session:v1';
const CHAINS={'1':'Ethereum','56':'BNB Chain','8453':'Base','42161':'Arbitrum','4663':'Robinhood Chain','99901':'Elysium',solana:'Solana'};
const messages={sign_in:'Sign in with this wallet to continue.',wrong_origin:'Open QHooks directly to change your settings.',slow_down:'Too many changes. Try again shortly.',own_wallet:'This is your own wallet.',invalid_follow:'Choose a full wallet address.',push_off:'Web push is off. The site owner must configure push keys.',no_subscription:'Enable web push in this browser, then try again.',alerts_unavailable:'Alert settings are unavailable. Try again shortly.',traders_unavailable:'Trading records are unavailable. Try Refresh.',invalid_thesis:'Keep your thesis to one line, without other addresses or contact details.'};
const key=value=>memberWallet(value,{allowBareSolana:true})?.key||null;
export const traderTime=value=>Number(value)>1e12?Number(value):Number(value)*1000;
export function traderCountdown(round,now=Date.now()){
 const start=traderTime(round?.start),end=traderTime(round?.end);
 if(!Number.isFinite(start)||!Number.isFinite(end))return'Round times unavailable';
 if(now>=end)return'Round ended';
 const pending=now<start,seconds=Math.max(0,Math.ceil(((pending?start:end)-now)/1000));
 const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
 return(pending?'Starts in ':'Ends in ')+(days?days+'d ':'')+hours+'h '+minutes+'m '+rest+'s';
}
export const traderUsd=value=>value==null||!Number.isFinite(Number(value))?'—':(Number(value)<0?'−$':'$')+Math.abs(Number(value)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const percent=value=>value==null||!Number.isFinite(Number(value))?'—':Number(value).toFixed(2)+'%';
const short=value=>value?String(value).replace(/^solana:/,'').slice(0,6)+'…'+String(value).slice(-4):'—';
const date=value=>Number.isFinite(traderTime(value))?new Date(traderTime(value)).toLocaleString(): 'Time unavailable';
const tone=value=>Number(value)>0?'qa-up':Number(value)<0?'qa-down':'';

export function createTradersClient({fetcher=(...args)=>globalThis.fetch(...args),headers=()=>({})}={}){
 async function request(path,options={}){
  const response=await fetcher(path,{cache:'no-store',credentials:'omit',redirect:'error',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...headers(),...options.headers}});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(Error(messages[body?.error]||body?.message||'Trading records are unavailable. Try Refresh.'),{status:response.status,code:body?.error,retryAfter:body?.retryAfter});
  if(!body||typeof body!=='object')throw Error('The trading response was incomplete. Try Refresh.');
  return body;
 }
 return{request,feed:({filter='all',wallet}={})=>request('/api/traders/feed?'+new URLSearchParams({filter,...(wallet?{wallet}:{})})),profile:wallet=>request('/api/traders/profile?'+new URLSearchParams({wallet})),saveProfile:publicTrades=>request('/api/traders/profile',{method:'PUT',body:JSON.stringify({publicTrades})}),leaderboard:window=>request('/api/traders/leaderboard?'+new URLSearchParams({window})),competition:()=>request('/api/traders/competition'),config:()=>request('/api/traders/config'),follows:()=>request('/api/wallets/follows'),follow:(wallet,on)=>request('/api/wallets/follow',{method:'POST',body:JSON.stringify({wallet,on})}),alertStatus:()=>request('/api/traders/alerts/status'),pushSubscriptions:()=>request('/api/traders/alerts/push'),testAlert:()=>request('/api/traders/alerts/test',{method:'POST'}),push:subscription=>request('/api/traders/alerts/push',{method:'POST',body:JSON.stringify({subscription})})};
}

// A separate purpose-bound session. Existing Solana profile-edit tokens are never reused.
export function traderSignInMessage({wallet,id,origin,issuedAt,expiresAt}){return ['QHooks public trading sign-in v1','Domain: '+new URL(origin).host,'Wallet: '+wallet,'Scope: public trading profile, follows and buy alerts','Nonce: '+id,'Issued: '+new Date(issuedAt).toISOString(),'Expires: '+new Date(expiresAt).toISOString(),'Signing allows this browser to manage public trade visibility, follows and alerts for 7 days. It does not authorize trades, transfers or rewards.'].join('\n');}
export function createTraderSolanaSession({getConnection,capture,fetcher=(...args)=>globalThis.fetch(...args),storage=()=>localStorage,now=Date.now,origin=()=>globalThis.location?.origin||'https://qhooks.com'}={}){
 let memory=null;
 const owner=()=>key(getConnection()?.owner);
 const valid=value=>value&&value.wallet===owner()&&value.wallet?.startsWith('solana:')&&/^tp1_[0-9a-f]{64}$/.test(value.token||'')&&Number.isFinite(value.expiresAt)&&value.expiresAt>now();
 function boardSession(){try{const saved=JSON.parse(storage().getItem(SESSION_KEY)||'null');if(valid(saved))return saved;}catch{}return valid(memory)?memory:null;}
 const authHeaders=()=>{const session=boardSession();return session?{authorization:'Bearer '+session.token}:{};};
 async function signIn(){
  const connection=capture();await connection.check();const wallet=key(connection.owner);
  if(!wallet?.startsWith('solana:'))throw Error('Connect a Solana wallet with message signing.');
  const post=async(path,body)=>{connection.assertCurrent();const response=await fetcher('/api/traders/session'+path,{method:'POST',credentials:'omit',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),value=await response.json().catch(()=>null);await connection.check();if(!response.ok)throw Error(messages[value?.error]||'Trading sign-in is unavailable. Try again.');return value;};
  const challenge=await post('/message',{wallet});
  if(challenge?.wallet!==wallet||!/^([0-9a-f]{48})$/.test(challenge?.id||'')||!Number.isFinite(challenge.issuedAt)||Math.abs(challenge.issuedAt-now())>300000||challenge.expiresAt!==challenge.issuedAt+300000||challenge.expiresAt<=now()||challenge.message!==traderSignInMessage({...challenge,origin:origin()}))throw Error('The sign-in message did not match this trading profile.');
  const signature=await connection.sign(challenge.message);await connection.check();
  const session=await post('',{message:challenge.message,signature});
  if(!valid(session)||session.expiresAt>now()+7*86400000+300000)throw Error('The sign-in response did not match this wallet.');
  connection.assertCurrent();memory=session;try{storage().setItem(SESSION_KEY,JSON.stringify(session));}catch{}return session;
 }
 return{boardSession,authHeaders,signIn};
}

export function mountTraders(target,{client=createTradersClient(),auth,hub,solHub,profile=false,competition=false,document:doc=globalThis.document,events=globalThis.window,timers=globalThis,now=Date.now,pollMs=15000}={}){
 const h=(tag,attrs={},...kids)=>{const node=doc.createElement(tag);for(const[name,value]of Object.entries(attrs)){if(value==null)continue;if(name==='class')node.className=value;else node.setAttribute(name,String(value));}for(const child of kids.flat())if(child!=null)node.append(child.nodeType?child:String(child));return node;};
 const button=(text,click,attrs={})=>{const node=h('button',{type:'button',class:'qa-btn',...attrs},text);node.addEventListener('click',click);return node;};
 let disposed=false,tab='feed',filter='all',windowKey='7d',generation=0,refreshTimer,countdownTimer,profileWallet=null,round=null,following=new Set(),busy=false;
 const title=h('h2',{id:profile?'qp-trading-title':'qx-traders-title'},profile?'Trading profile':'Trading records');
 const status=h('p',{class:'qa-empty qt-status',role:'status','aria-live':'polite'}),body=h('div',{class:'qt-panel',role:'tabpanel'}),controls=h('div',{class:'qt-account'}),tabs=h('div',{class:'qt-tabs',role:'tablist','aria-label':profile?'Trading profile views':'Trading views'}),filters=h('div',{class:'qt-filters'}),refresh=button('Refresh',()=>void load());
 const header=h('div',{class:'qa-section-head'},h('div',{},title,h('p',{},profile?'Terminal trades shared by this wallet.':'Public terminal trades, real PnL and trading rounds.')),refresh);
 target.classList.add('qa-section','qt-workspace');target.setAttribute('aria-labelledby',title.id);target.replaceChildren(header,controls,tabs,filters,status,body);
 const selectedOwner=()=>key(auth?.owner?.());
 const session=()=>auth?.boardSession?.();
 async function signedIn(){const owner=selectedOwner(),family=auth?.family?.();if(!owner){auth?.connect?.();throw Error('Connect a wallet, then try again.');}if(!session())await auth.signIn();if(selectedOwner()!==owner||auth?.family?.()!==family)throw Error('Your wallet changed. Review this setting again.');if(!session())throw Error('Sign in with this wallet to continue.');return owner;}
 async function follows(){if(!session()){following=new Set();return;}try{const result=await client.follows();following=new Set((result.follows||[]).map(row=>key(row.wallet)).filter(Boolean));}catch{following=new Set();}}
 async function toggleFollow(wallet,node){
  node.disabled=true;
  try{await signedIn();await client.follow(wallet,!following.has(wallet));await follows();node.textContent=following.has(wallet)?'Following':'Follow trader';node.setAttribute('aria-pressed',String(following.has(wallet)));status.textContent='Following list saved.';}
  catch(error){status.textContent=error.message;}finally{node.disabled=false;}
 }
 function traderName(row,{follow=true}={}){
  const wallet=key(row.wallet),name=h('div',{class:'qt-trader'},h('a',{href:'/profile#'+encodeURIComponent(wallet||row.wallet||'')},row.name||short(wallet)),h('code',{title:wallet||''},wallet?short(wallet):'Wallet unavailable'));
  if(follow&&wallet&&wallet!==selectedOwner()){const control=button(following.has(wallet)?'Following':'Follow trader',()=>void toggleFollow(wallet,control),{'aria-pressed':following.has(wallet)});name.append(control);}return name;
 }
 function fact(label,value,cls=''){return h('div',{},h('dt',{},label),h('dd',{class:cls},value));}
 function feedRows(rows){
  if(!rows.length)return h('p',{class:'qa-empty'},filter==='following'?'No public terminal trades from the traders you follow.':'No shared terminal trades in this view yet.');
  return h('ol',{class:'qt-feed'},...rows.map(row=>{
   const chain=CHAINS[row.chainId]||String(row.chainId||'Chain unavailable'),token=String(row.token||''),href='/terminal#t='+encodeURIComponent(String(row.chainId))+':'+encodeURIComponent(token);
   const card=h('li',{class:'qa-launch qt-trade'},h('div',{class:'qt-row-head'},traderName(row),h('span',{class:'qt-side '+(row.side==='buy'?'qa-up':'qa-down')},row.side==='buy'?'Buy':'Sell')),
    h('a',{class:'qt-token',href},row.symbol||short(token)),h('span',{class:'qa-chain'},chain),h('dl',{class:'qa-facts qt-facts'},fact('Size',traderUsd(row.usd)),fact('Market cap at entry',traderUsd(row.marketCapUsd))),h('time',{datetime:Number.isFinite(traderTime(row.at))?new Date(traderTime(row.at)).toISOString():''},date(row.at)));
   if(row.thesis&&row.side==='buy')card.append(h('p',{class:'qt-thesis'},row.thesis));return card;
  }));
 }
 function standings(rows,{competition=false}={}){
  if(!rows.length)return h('p',{class:'qa-empty'},competition?'No wallets meet this round’s entry requirements yet.':'No public traders have five recorded trades in this window yet.');
  return h('ol',{class:'qt-standings'},...rows.map((row,index)=>h('li',{class:'qt-standing'},h('span',{class:'qt-rank','aria-label':'Rank '+(row.rank||index+1)},String(row.rank||index+1).padStart(2,'0')),traderName(row),h('dl',{class:'qt-metrics'},fact('PnL USD',traderUsd(row.pnlUsd),tone(row.pnlUsd)),fact('PnL %',percent(row.pnlPct),tone(row.pnlPct)),fact('Trades',row.trades??'—'),fact('Win rate',row.winRate==null?'—':percent(Number(row.winRate)*100))))));
 }
 function renderFilters(){
  filters.replaceChildren();
  const values=tab==='feed'?[['all','All'],['following','Following']]:tab==='leaderboard'?[['7d','7d'],['30d','30d'],['all','All time']]:[];
  for(const[id,label]of values){const node=button(label,async()=>{if(tab==='feed'&&id==='following'&&!session()){try{await signedIn();await follows();}catch(error){status.textContent=error.message;return;}}if(tab==='feed')filter=id;else windowKey=id;renderFilters();void load();},{'aria-pressed':(tab==='feed'?filter:windowKey)===id});filters.append(node);}
 }
 const tabNames=profile?[['feed','Feed']]:[['feed','Feed'],['leaderboard','Leaderboard'],...(competition?[['competition','Competition']]:[])];
 const tabButtons=tabNames.map(([id,label])=>{const node=button(label,()=>selectTab(id),{role:'tab',id:(profile?'qp':'qx')+'-traders-tab-'+id,'aria-controls':(profile?'qp':'qx')+'-traders-panel'});node.addEventListener('keydown',event=>{let index=tabButtons.indexOf(node);if(event.key==='ArrowRight')index=(index+1)%tabButtons.length;else if(event.key==='ArrowLeft')index=(index+tabButtons.length-1)%tabButtons.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabButtons.length-1;else return;event.preventDefault();tabButtons[index].focus();selectTab(tabNames[index][0]);});return node;});tabs.append(...tabButtons);body.id=(profile?'qp':'qx')+'-traders-panel';
 function selectTab(value){if(value!==tab){body.replaceChildren();timers.clearInterval(countdownTimer);}tab=value;for(let i=0;i<tabButtons.length;i++){const active=tabNames[i][0]===value;tabButtons[i].setAttribute('aria-selected',String(active));tabButtons[i].setAttribute('tabindex',active?'0':'-1');}body.setAttribute('aria-labelledby',(profile?'qp':'qx')+'-traders-tab-'+value);renderFilters();void load();}
 function accountControls(){
  controls.replaceChildren();const owner=selectedOwner(),mine=!profile||owner&&owner===profileWallet;
  if(profile&&!profileWallet)return;
  const walletLine=h('p',{class:'qt-wallet-label'},profile&&!mine?'Connect this profile’s wallet to change its trading visibility.':owner?'Settings for '+owner:'Share your terminal trading record only when you choose.');
  const accountButtons=h('div',{class:'qa-actions'});
  if(auth?.selectFamily){for(const[family,label]of[['evm','EVM wallet'],['solana','Solana wallet']])accountButtons.append(button(label,()=>{auth.selectFamily(family);accountControls();void load();},{'aria-pressed':auth.family()===family}));}
  const connect=button(owner?'Sign in to manage':'Connect wallet',async()=>{try{if(!owner){auth?.connect?.();return;}await signedIn();status.textContent='Signed in. Review your sharing setting below.';accountControls();await load();}catch(error){status.textContent=error.message;}});
  accountButtons.append(connect);
  if(owner)accountButtons.append(h('a',{class:'qa-btn',href:'/profile#'+encodeURIComponent(owner)},'My public profile'));
  controls.append(walletLine,accountButtons);
  if(auth?.family?.()==='solana'&&!owner&&solHub){const snapshot=solHub.snapshot(),select=h('select',{'aria-label':'Solana wallet'});for(const wallet of snapshot.wallets)select.append(h('option',{value:wallet.id},wallet.name));const solConnect=button('Connect Solana wallet',async()=>{try{await solHub.connect(select.value);accountControls();void load();}catch(error){status.textContent=error.message;}});solConnect.disabled=!snapshot.wallets.length||snapshot.busy;controls.append(h('div',{class:'qa-actions'},select,solConnect));}
  if(!owner||!mine)return;
  const checkbox=h('input',{type:'checkbox',id:(profile?'qp':'qx')+'-public-trades'}),save=button('Save sharing',async()=>{save.disabled=true;try{await signedIn();if(selectedOwner()!==owner)throw Error('Your wallet changed. Review this setting again.');await client.saveProfile(checkbox.checked);status.textContent=checkbox.checked?'Your terminal trades are public.':'Your terminal trades are private.';void load();}catch(error){status.textContent=error.message;}finally{save.disabled=false;}});
  controls.append(h('label',{class:'qt-opt-in',for:checkbox.id},checkbox,'Show my terminal trades and PnL publicly'),h('p',{class:'qt-help'},'Off by default. Sharing includes terminal buys and sells on every chain, your trade size, entry market cap and any buy thesis. Turning it off hides your trading record and removes you from rankings.'),save);
  checkbox.disabled=true;save.disabled=true;const expected=owner;client.profile(owner).then(value=>{if(!disposed&&selectedOwner()===expected&&checkbox.isConnected){checkbox.checked=value.publicTrades===true;checkbox.disabled=false;save.disabled=false;}}).catch(error=>{if(checkbox.isConnected){checkbox.disabled=true;save.disabled=true;status.textContent=error.message;}});
  if(!profile)void alerts(controls,owner);
 }
 async function alerts(host,owner){
  const alertBox=h('div',{class:'qt-alerts'},h('h3',{},'Buy alerts')),note=h('p',{class:'qt-help',role:'status','aria-live':'polite'},'Reading alert settings…'),actions=h('div',{class:'qa-actions'});
  host.append(alertBox);alertBox.append(note,actions,h('p',{class:'qt-help'},'On iPhone, add QHooks to your Home Screen first, then enable alerts from there.'));
  try{const config=await client.alertStatus();if(disposed||selectedOwner()!==owner||!alertBox.isConnected)return;note.textContent=config.pushEnabled?(config.note||'Buy alerts follow your synced trader list. Up to 30 alerts per hour.'):'Web push is off. Buy alerts go to your linked Telegram until push is turned on. Link @qhooks_bot below.';
   const supported=!!globalThis.navigator?.serviceWorker&&!!globalThis.PushManager&&!!globalThis.Notification;
   const current=()=>!disposed&&selectedOwner()===owner&&alertBox.isConnected;
   const signedOwner=()=>current()&&key(session()?.wallet)===owner;
   async function activeSubscription(){
    if(!config.pushEnabled||!supported||!signedOwner()||globalThis.Notification.permission!=='granted')return null;
    const registration=await globalThis.navigator.serviceWorker.getRegistration('/sw.js'),subscription=await registration?.pushManager.getSubscription();
    return signedOwner()&&subscription&&(!subscription.expirationTime||subscription.expirationTime>now())?subscription:null;
   }
   const testAlert=button('Send me a test alert',async()=>{
    if(testAlert.disabled)return;testAlert.disabled=true;
    try{
     if(!await activeSubscription()){testAlert.hidden=true;throw Error('Enable web push in this browser, then try again.');}
     const result=await client.testAlert();if(!current())return;
     note.textContent=result.sent>0?'Sent. Check your phone.':'The test alert could not be sent. Enable web push and try again.';
     if(result.failed)await updateTestButton();
    }catch(error){if(current()){note.textContent=error.code==='slow_down'?'Three test alerts an hour. Try again in '+Math.max(1,Math.ceil((Number(error.retryAfter)||3600)/60))+' minutes.':error.message;if(['no_subscription','push_off','sign_in'].includes(error.code))testAlert.hidden=true;}}
    finally{testAlert.disabled=false;}
   });testAlert.hidden=true;
   async function updateTestButton(){
    testAlert.hidden=true;
    try{const subscription=await activeSubscription();if(!subscription)return;const stored=await client.pushSubscriptions();if(signedOwner())testAlert.hidden=!(stored.endpoints||[]).includes(subscription.endpoint);}catch{}
   }
   const enable=button('Enable web push',async()=>{enable.disabled=true;try{await signedIn();if(!supported)throw Error('Web push is unavailable in this browser. On iPhone, install QHooks on your home screen first.');const permission=await globalThis.Notification.requestPermission();if(permission!=='granted')throw Error('Notifications were not enabled. You can change this in browser settings.');if(!current())return;await globalThis.navigator.serviceWorker.register('/sw.js');const ready=await globalThis.navigator.serviceWorker.ready,bytes=Uint8Array.from(atob(String(config.publicKey).replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0)),subscription=await ready.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});if(!signedOwner())throw Error('Your wallet changed. Review alert settings again.');await client.push(subscription.toJSON());if(current()){note.textContent='Web push enabled for buys by the traders you follow.';await updateTestButton();}}catch(error){if(current())note.textContent=error.message;}finally{enable.disabled=!config.pushEnabled||!supported;}});
   enable.disabled=!config.pushEnabled||!supported;actions.append(enable,testAlert,h('a',{class:'qa-btn',href:'https://t.me/qhooks_bot',target:'_blank',rel:'noopener noreferrer'},'Link Telegram with @qhooks_bot'));
   if(config.pushEnabled&&!supported)note.textContent+=' Web push is unavailable in this browser. On iPhone, install QHooks on your home screen first.';
   await updateTestButton();
  }catch(error){note.textContent=error.message;}
 }
 function renderCompetition(value){
  round=value.round;if(!round){body.replaceChildren(h('p',{class:'qa-empty'},'No round is scheduled. Check back for the next trading competition.'));return;}
  const clock=h('p',{class:'qt-countdown'}),rules=Array.isArray(round.rules)?round.rules:[round.rules].filter(Boolean),prize=typeof round.prize==='object'?Object.values(round.prize).join(' · '):round.prize;
  const summary=h('div',{class:'qt-round'},h('div',{},h('p',{class:'qt-kicker'},'Trading competition'),h('h3',{},round.name),clock,h('p',{},date(round.start)+' — '+date(round.end))),h('div',{class:'qt-prize'},h('span',{},'Prize'),h('strong',{},prize||'To be announced')));
  clock.textContent=traderCountdown(round,now());timers.clearInterval(countdownTimer);countdownTimer=timers.setInterval(()=>{if(!disposed)clock.textContent=traderCountdown(round,now());},1000);
  const info=h('div',{class:'qt-round-info'},h('section',{},h('h4',{},'How to enter'),h('p',{},'Trade outside tokens in the terminal. Opt in to a public trading profile.'),h('a',{class:'qa-btn qa-btn-primary',href:'/terminal'},'Open terminal')),h('section',{},h('h4',{},'Eligibility'),h('p',{},'All chains. Tokens launched on QHooks never count.'),h('p',{},'At least '+(round.minTrades??5)+' trades and '+traderUsd(round.minVolumeUsd??0)+' in terminal volume during this round.')),h('section',{},h('h4',{},'Rules'),h('p',{},'Ranked by real PnL from eligible terminal trades. Buys and sells with no market risk are excluded. Wallets sharing a funder cluster cannot both rank.'),...rules.map(text=>h('p',{},text))));
  const excluded=h('section',{class:'qt-excluded'},h('h4',{},'Excluded wallets'));
  if(value.excluded?.length)excluded.append(h('ul',{},...value.excluded.map(row=>h('li',{},h('a',{href:'/profile#'+encodeURIComponent(row.wallet)},row.name||short(row.wallet)),h('span',{},({self_trade:'Matching buys and sells had no market risk.',same_funder_cluster:'Shares a funding cluster with another ranked wallet.',lineage_unchecked:'Funding checks are incomplete.',price_unavailable:'A required USD price is unavailable.',incomplete_trade_basis:'A recorded sale has no verified entry cost.'})[row.reason]||row.reason||'Does not meet this round’s rules.')))));else excluded.append(h('p',{class:'qa-empty'},'No exclusions recorded for this round.'));
  body.replaceChildren(summary,value.refreshing&&!value.rows?.length?h('p',{class:'qa-empty'},'Refreshing standings…'):standings(value.rows||[],{competition:true}),info,excluded);
 }
 function schedule(){timers.clearTimeout(refreshTimer);if(!disposed&&!doc.hidden)refreshTimer=timers.setTimeout(()=>void load(),pollMs);}
 async function load(){
  if(disposed||doc.hidden)return;const mine=++generation;busy=true;refresh.disabled=true;status.textContent='Refreshing…';body.setAttribute('aria-busy','true');
  let pendingProjection=false,computedAt=null;
  try{
   if(profile){const candidate=key(decodeURIComponent(events.location?.hash?.slice(1)||''));if(candidate!==profileWallet){profileWallet=candidate;body.replaceChildren();accountControls();}if(!candidate){body.replaceChildren(h('p',{class:'qa-empty'},'Look up a wallet to read its shared terminal trades.'));status.textContent='';return;}
    const value=await client.profile(candidate);pendingProjection=!!value.refreshing;computedAt=value.refreshedAt||value.computedAt;if(mine!==generation||disposed)return;if(!value.publicTrades){body.replaceChildren(h('p',{class:'qa-empty'},'This wallet does not share its terminal trading record.'));status.textContent='';return;}
    await follows();const feed=await client.feed({filter,wallet:candidate});if(mine!==generation||disposed)return;const pnl=value.pnl,summary=pnl?h('dl',{class:'qt-metrics qt-profile-pnl'},fact('PnL USD',traderUsd(pnl.pnlUsd),tone(pnl.pnlUsd)),fact('PnL %',percent(pnl.pnlPct)),fact('Trades',pnl.trades??value.trades??'—'),fact('Win rate',pnl.winRate==null?'—':percent(Number(pnl.winRate)*100))):null;body.replaceChildren(...[summary,feedRows(feed.trades||[])].filter(Boolean));
   }else if(tab==='feed'){await follows();const value=await client.feed({filter});if(mine!==generation||disposed)return;body.replaceChildren(feedRows(value.trades||[]));}
   else if(tab==='leaderboard'){const value=await client.leaderboard(windowKey);pendingProjection=!!value.refreshing;computedAt=value.refreshedAt||value.computedAt;if(mine!==generation||disposed)return;body.replaceChildren(h('p',{class:'qt-ranking-note'},'Ranked by real PnL, not followers.'),h('p',{class:'qt-help'},'Realized + unrealized PnL in USD. Trading fees included; network fees and rewards excluded. At least 5 trades in the selected window. A dash means a USD price is unavailable.'),value.refreshing&&!value.rows?.length?h('p',{class:'qa-empty'},'Refreshing leaderboard…'):standings(value.rows||[]));}
   else{const value=await client.competition();pendingProjection=!!value.refreshing;computedAt=value.refreshedAt||value.computedAt;if(mine!==generation||disposed)return;renderCompetition(value);}
   status.textContent=pendingProjection?'Refreshing trading records…'+(computedAt?' Last completed '+new Date(computedAt).toLocaleTimeString()+'.':''):'Updated '+new Date(computedAt||now()).toLocaleTimeString();
  }catch(error){if(mine===generation)status.textContent=error.message+' Your current view stays here. Use Refresh to retry.';}
  finally{if(mine===generation){busy=false;refresh.disabled=false;body.setAttribute('aria-busy','false');schedule();}}
 }
 const onVisibility=()=>{if(doc.hidden){generation++;timers.clearTimeout(refreshTimer);busy=false;refresh.disabled=false;body.setAttribute('aria-busy','false');}else void load();};
 const onHash=()=>{if(profile)void load();else if(['#competition','#leaderboard','#trading-feed'].includes(events.location?.hash)){selectTab(events.location.hash==='#competition'?(competition?'competition':'leaderboard'):events.location.hash==='#leaderboard'?'leaderboard':'feed');target.scrollIntoView?.({block:'start'});}};
 let initialized=false;const onWallet=()=>{if(!initialized)return;generation++;accountControls();void load();};
 doc.addEventListener('visibilitychange',onVisibility);events?.addEventListener?.('hashchange',onHash);events?.addEventListener?.('storage',onWallet);const offHub=hub?.subscribe?.(onWallet),offSol=solHub?.subscribe?.(()=>{if(auth?.family?.()==='solana')onWallet();});
 initialized=true;accountControls();selectTab(!profile&&events.location?.hash==='#competition'?(competition?'competition':'leaderboard'):!profile&&events.location?.hash==='#leaderboard'?'leaderboard':'feed');if(!profile&&['#competition','#leaderboard','#trading-feed'].includes(events.location?.hash))target.scrollIntoView?.({block:'start'});
 return{refresh:load,selectTab,get state(){return{tab,filter,windowKey,profileWallet,busy};},dispose(){disposed=true;generation++;timers.clearTimeout(refreshTimer);timers.clearInterval(countdownTimer);offHub?.();offSol?.();doc.removeEventListener('visibilitychange',onVisibility);events?.removeEventListener?.('hashchange',onHash);events?.removeEventListener?.('storage',onWallet);}};
}

async function boot(){
 const target=document.getElementById('qx-traders')||document.getElementById('qp-trading');if(!target)return;
 try{
  const[{getWalletHub},sessions,{createSolanaProfileWallet}]=await Promise.all([import('./wallet-hub.mjs'),import('./qx-board-session.mjs'),import('./qx-solana-profile-wallet.mjs')]);
  const hub=getWalletHub(window),solHub=createSolanaProfileWallet(window),evm=sessions.createBoardSession({getConnection:()=>hub.snapshot().current}),sol=createTraderSolanaSession({getConnection:()=>solHub.snapshot().current,capture:()=>solHub.capture()});let family='evm';
  const auth={family:()=>family,selectFamily:value=>{family=value;},owner:()=>family==='solana'?solHub.snapshot().current?.owner:hub.snapshot().current?.owner,boardSession:()=>family==='solana'?sol.boardSession():evm.boardSession(),authHeaders:()=>family==='solana'?sol.authHeaders():evm.authHeaders(),signIn:()=>family==='solana'?sol.signIn():evm.signIn(),connect:()=>family==='solana'?target.querySelector('select')?.focus():hub.open()};
  const client=createTradersClient({headers:auth.authHeaders});
  // The competition tab and links appear only when the Worker turns it on (QHOOKS_TRADER_COMPETITION).
  const competition=await client.config().then(c=>!!c?.competition).catch(()=>false);
  // The competition link is not in the HTML at all (a [hidden] attribute loses to .qx-link's display rule); add it only when it's on.
  if(competition){const feed=document.querySelector('.cx-actions a[href="#trading-feed"]');if(feed&&!document.querySelector('.cx-actions a[href="#competition"]')){const a=document.createElement('a');a.className='qx-link';a.href='#competition';a.textContent='Trading competition →';feed.after(a);}}
  const mounted=mountTraders(target,{client,auth,hub,solHub,profile:target.id==='qp-trading',competition});addEventListener('pagehide',()=>{mounted.dispose();solHub.dispose();},{once:true});
 }catch{target.replaceChildren(Object.assign(document.createElement('p'),{className:'qa-empty',textContent:'Trading records could not load. Reload this page to retry.'}));}
}
if(typeof document!=='undefined')void boot();
