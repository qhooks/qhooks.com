import {getWalletHub} from './wallet-hub.mjs';
import {embeddedWalletProvider,EMBEDDED_RDNS,EMBEDDED_UUID,PHONE_RDNS,PHONE_UUID} from './embedded-wallet-provider.mjs';
import {visibleChains} from './chains.mjs';
// Embedded-wallet networks: the visible chains (public ones; hidden and test chains only with ?chains=all), 2026-11-09.
const launchChains=visibleChains().map(c=>Object.freeze({id:c.id,name:c.name,gas:c.native}));
import './qx-confirm-top.mjs';
import {readPrivyAppConfig,PRIVY_PUBLIC_APP} from './qx-privy-app-config.mjs';
import {solWallets,onSolChange} from './qx-solana.mjs';
import {createSolanaPrivyHandoff} from './qx-solana-privy.mjs';

const DROP_GRACE_MS=1500;
// Progress steps for diagnosing the email wallet on real devices (no addresses, tokens or emails).
const started=Date.now();
function trace(step,detail=''){try{navigator.sendBeacon?.('/api/client-log',JSON.stringify({step,detail:String(detail).slice(0,200)+' +'+(Date.now()-started)+'ms',page:location.pathname}));}catch{}}
const INTENT='qhooks:google-login-intent:v1';
// This marker is UI intent, never authentication. The SDK validates OAuth itself.
function intent(target,mode){
 try{
  if(mode==='save'){target.sessionStorage.setItem(INTENT,String(Date.now()));return true;}
  const saved=target.sessionStorage.getItem(INTENT);target.sessionStorage.removeItem(INTENT);
  const age=Date.now()-Number(saved);return mode==='consume'&&/^\d{13}$/.test(saved||'')&&age>=0&&age<300000;
 }catch{return false;}
}
// In-app browsers (X, Telegram, Instagram, Facebook, Android WebViews, iOS WKWebViews without Safari):
// Google refuses sign-in there ("disallowed_useragent"), so offer email only and say how to open a real browser.
export function inAppBrowser(target=globalThis){
 const ua=String(target.navigator?.userAgent||'');
 const app=/Twitter|TwitterAndroid/i.test(ua)?'X':target.TelegramWebviewProxy||target.Telegram?.WebView||/Telegram/i.test(ua)?'Telegram':/Instagram/i.test(ua)?'Instagram':/FBAN|FBAV|FB_IAB/i.test(ua)?'Facebook':/LinkedInApp/i.test(ua)?'LinkedIn':null;
 const webview=/; wv\)/.test(ua)||/(iPhone|iPad|iPod).*AppleWebKit(?!.*Safari\/)/i.test(ua);
 return app||webview?{app:app||'this app',ios:/iPhone|iPad|iPod/i.test(ua)}:null;
}
// Sign in with X (2026-11-10): offered only while X login is switched on for our Privy app, read from Privy's public app
// settings, so the button never offers a method Privy would refuse. X works inside in-app browsers too (unlike Google).
export async function xLoginEnabled(fetchImpl=globalThis.fetch){
 return(await readPrivyAppConfig(fetchImpl,PRIVY_PUBLIC_APP))?.twitter_oauth===true;
}
export const solanaLoginVisible=config=>config?.solana_wallet_auth===true;
export async function solanaLoginEnabled(fetchImpl=globalThis.fetch){
 return solanaLoginVisible(await readPrivyAppConfig(fetchImpl,PRIVY_PUBLIC_APP));
}
export function solanaWalletLinks(url,origin=new URL(url).origin){
 const page=encodeURIComponent(url),ref=encodeURIComponent(origin);
 return [['Phantom','https://phantom.app/ul/browse/'],['Solflare','https://solflare.com/ul/v1/browse/'],['Backpack','https://backpack.app/ul/v1/browse/']]
  .map(([name,base])=>({name,label:'Open in '+name,href:base+page+'?ref='+ref}));
}
export function loginMethods(inApp,x){return inApp?(x?['email','twitter']:['email']):(x?['email','google','twitter']:['email','google']);}
export function loginLabel(inApp,x){return inApp?(x?'Continue with email or X':'Continue with email'):(x?'Continue with email, Google or X':'Continue with email or Google');}
export function bindWalletLogin({target=window,document:d=document,hub=getWalletHub(target),load=()=>import('/privy/entry.js')}={}){
 const $=id=>d.getElementById('qhc-'+id),button=$('email-login');if(!button)return;
 const bridge=embeddedWalletProvider(target);
 // Any phone wallet through WalletConnect (Privy pairs it: wallet-app list on a phone, QR on desktop).
 const phoneBridge=embeddedWalletProvider(target,{uuid:PHONE_UUID,name:'WalletConnect · phone wallet',rdns:PHONE_RDNS});let wantPhone=false;let sdk=null,loading=null,state={ready:false,authenticated:false,hasWallet:false},wanted=false,hasProvider=false,providerChain=null,wantedChain=null,dead=false,switchTimer=null,dropTimer=null,walletAddress=null,openTimer=null;
 const status=text=>{$('login-status').textContent=text;};
 const inApp=inAppBrowser(target);let xOn=false;target.QHOOKS_LOGIN_METHODS=loginMethods(inApp,false);
 const appConfig=readPrivyAppConfig(target.fetch||globalThis.fetch,target.QHOOKS_PRIVY_APP||PRIVY_PUBLIC_APP);
 const solanaHandoff=createSolanaPrivyHandoff({onError:error=>{status(error?.message||'Could not connect your Solana wallet. Choose it again.');show();}});
 const coarse=!!target.matchMedia?.('(pointer:coarse)').matches;
 let solOn=false,solScanDone=!coarse,solScanTimer=null,solLoading=false;
 const solButton=d.createElement('button');solButton.type='button';solButton.id='qhc-solana-login';solButton.className='qhc-choice';solButton.textContent='Solana wallet';solButton.hidden=true;solButton.style.marginTop='.6rem';
 const solApps=d.createElement('div');solApps.id='qhc-solana-apps';solApps.className='qhc-apps';solApps.hidden=true;
 const renderSolana=()=>{if(dead)return;const links=coarse&&solScanDone&&solWallets().length===0;solButton.hidden=!solOn||!solScanDone||links;solButton.disabled=solLoading||!!loading&&!state.ready;solApps.hidden=!solOn||!links;};
 const stopSolChange=onSolChange(renderSolana);
 const emailNext=button.nextElementSibling,solAnchor=emailNext?.tagName==='P'?emailNext:button;
 solAnchor.after(solButton);solButton.after(solApps);
 // Give Wallet Standard registration 600 ms on a phone before offering wallet-app browsers.
 if(coarse)solScanTimer=target.setTimeout(()=>{solScanDone=true;renderSolana();},600);
 solButton.addEventListener('click',async()=>{
  if(dead||!solOn||solLoading)return;solLoading=true;renderSolana();
  try{await initialize();if(dead)return;wanted=false;wantedChain=null;$('dialog').close();await sdk.loginSolana();}
  catch(error){status(error?.message||'Could not open Solana sign-in. Please try again.');show();}
  finally{solLoading=false;renderSolana();}
 });
 if(inApp&&!$('in-app')){
  const copy=d.createElement('button');copy.type='button';copy.className='qhc-secondary';copy.textContent='Copy link';
  copy.addEventListener('click',async()=>{try{await target.navigator.clipboard.writeText(target.location.href);copy.textContent='Link copied';}catch{copy.textContent=target.location.href;}});
  const note=d.createElement('p');note.id='qhc-in-app';note.className='qhc-in-app';
  const lead=d.createElement('span');lead.id='qhc-in-app-lead';lead.textContent='You\u2019re in '+inApp.app+'\u2019s browser. Sign in with email here, or open in '+(inApp.ios?'Safari':'Chrome')+': tap \u22ef \u2192 Open in browser. ';note.append(lead,copy);
  button.after(note);
 }
 // Phones without a wallet extension: email first, wallet apps folded under a toggle.
 if(target.matchMedia?.('(pointer:coarse)').matches&&!target.ethereum&&!$('more-wallets')){
  const mobile=d.querySelector('#qhc-dialog .qhc-mobile'),choices=$('choices');
  if(mobile||choices){const more=d.createElement('details');more.id='qhc-more-wallets';more.className='qhc-more-wallets';const sum=d.createElement('summary');sum.textContent='I have a wallet app';more.append(sum);(mobile||choices).before(more);if(mobile)more.append(mobile);if(choices)more.append(choices);}
 }
 // newcomerA (2026-11-12): on a token page the sheet follows the token's chain family. Email/Google/X stays first; then
 // EVM wallet apps for an EVM token, Solana wallet apps only for a Solana token; the other family moves under
 // "I have a wallet app" (or to the end of the sheet when there is no expander). Opened from a buy, it reads "Sign in to buy".
 const parked=[];
 const park=(node,parent,before=null)=>{if(!node||!parent||node.parentNode===parent&&node.nextSibling===before)return;if(!parked.some(p=>p.node===node))parked.push({node,parent:node.parentNode,next:node.nextSibling});parent.insertBefore(node,before);};
 const unparkAll=()=>{for(const p of parked.splice(0).reverse())if(p.parent?.isConnected)p.parent.insertBefore(p.node,p.next&&p.next.parentNode===p.parent?p.next:null);};
 const tokenFamily=()=>{const m=/^#(?:m|t)=(solana|\d+):/.exec(String(target.location?.hash||''));return m?(m[1]==='solana'?'solana':'evm'):null;};
 function arrange(){
  if(dead)return;const fam=tokenFamily(),dialog=$('dialog'),more=$('more-wallets'),apps=$('apps'),empty=$('empty');
  if(fam!=='evm'){unparkAll();return;}
  if(more){park(apps,more.parentNode,more);if(apps&&empty)apps.hidden=empty.hidden;park(solButton,more);park(solApps,more);}
  else{const foot=dialog?.querySelector('.qhc-footnote');if(foot){park(solButton,foot.parentNode,foot);park(solApps,foot.parentNode,foot);}}
 }
 let buyTap=0;const BUY_TAP='.qxt-signin,.qxt-go,.qxt-qb,.qa-dock,.qxt-quick,#qxt-ticket,#qxt-trade,#qxt-main';
 d.addEventListener?.('click',e=>{const b=e.isTrusted&&e.target?.closest?.('button,a');if(b&&b.closest(BUY_TAP)&&/\bbuy\b/i.test((b.textContent||'')+' '+(b.title||'')))buyTap=Date.now();},true);
 const titleEl=$('title');let buyMode=false;const MO=target.MutationObserver||globalThis.MutationObserver;
 const paintTitle=()=>{if(!titleEl)return;const want=buyMode&&!hub.snapshot().current?'Sign in to buy':null;if(want&&titleEl.textContent!==want)titleEl.textContent=want;};
 if(titleEl&&MO)new MO(paintTitle).observe(titleEl,{childList:true,characterData:true,subtree:true});
 if($('dialog')&&MO)new MO(()=>{const dlg=$('dialog');if(dlg.open){buyMode=Date.now()-buyTap<2500;arrange();paintTitle();}else if(buyMode){buyMode=false;if(titleEl&&titleEl.textContent==='Sign in to buy')titleEl.textContent=hub.snapshot().current?'Account':'Connect a wallet';}}).observe($('dialog'),{attributes:true,attributeFilter:['open']});
 target.addEventListener?.('hashchange',arrange);
 const show=()=>{if(!dead&&!$('dialog').open)$('dialog').showModal();};
 function render(){button.disabled=!!loading&&!state.ready;button.textContent=!state.authenticated?loginLabel(inApp,xOn):state.hasWallet?'Use my QHooks wallet':'Create my EVM wallet';$('email-logout').hidden=!state.authenticated;const c=hub.snapshot().current;$('email-network').hidden=c?.entry.rdns!==EMBEDDED_RDNS;if(c?.entry.rdns===EMBEDDED_RDNS&&!wantedChain)$('embedded-chain').value=c.chainId;renderSolana();arrange();}
 appConfig.then(config=>{
  if(dead)return;solOn=solanaLoginVisible(config);
  if(solOn)for(const item of solanaWalletLinks(target.location.href,target.location.origin)){
   const link=d.createElement('a');link.className='qhc-choice';link.href=item.href;link.rel='noopener';link.textContent=item.label;
   // Terminal selection can change the hash after load; use the page at the moment the person opens the wallet app.
   link.addEventListener('click',()=>{link.href=solanaWalletLinks(target.location.href,target.location.origin).find(next=>next.name===item.name).href;});
   solApps.append(link);
  }
  xOn=config?.twitter_oauth===true;target.QHOOKS_LOGIN_METHODS=loginMethods(inApp,xOn);
  const lead=$('in-app-lead');if(lead&&xOn)lead.textContent=lead.textContent.replace('Sign in with email here','Sign in with email or X here');render();
 });
 async function connect(){
  if(!wanted||dead||!hasProvider||wantedChain&&providerChain!==wantedChain)return;
  wanted=false;target.clearTimeout(switchTimer);wantedChain=null;status('Connecting your QHooks wallet…');
  try{await hub.connect(EMBEDDED_UUID);intent(target,'clear');trace('connected');status('Connected. No transaction was requested.');$('dialog').close();}catch(e){trace('connect-failed',e?.message);status('Could not connect your QHooks wallet'+(e?.message?' ('+e.message+')':'')+'. Choose it again.');show();}render();
 }
 async function initialize(){
  if(sdk)return sdk;if(loading)return loading;
  status('Loading secure sign-in…');button.disabled=true;
  loading=(async()=>{
   const {mountPrivy}=await load();if(dead)throw Error('Page closed');
   const container=d.createElement('div');container.id='qhooks-privy-root';d.body.append(container);
   let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
   const remembered=hub.preference(),chainId=(remembered?.rdns===EMBEDDED_RDNS?remembered.chainId:null)||new URLSearchParams(target.location.search).get('chain')||remembered?.chainId||'8453';
   trace('mount','chain '+chainId);sdk=mountPrivy({container,chainId,onState:next=>{if(dead)return;trace('state',(next.ready?'ready':'loading')+' auth:'+next.authenticated+' wallet:'+next.hasWallet);const firstReady=!state.ready&&next.ready;state=next;render();if(next.ready){readyResolve();if(firstReady)status('');}void solanaHandoff.update(next);},onWallet:wallet=>{if(dead)return;trace('wallet',wallet?'provider '+(wallet.chainId||''):'none');
    // The SDK drops and re-issues its provider when the wallet changes network. Hold the session briefly so a
    // network switch from any page keeps the same connection instead of signing the wallet out.
    if(!wallet){if(hasProvider&&!dropTimer)dropTimer=target.setTimeout(()=>{dropTimer=null;hasProvider=false;providerChain=null;walletAddress=null;bridge.set(null);render();},DROP_GRACE_MS);return;}
    const address=wallet.address?.toLowerCase()||null,same=hasProvider&&address===walletAddress,prevChain=providerChain;target.clearTimeout(dropTimer);dropTimer=null;
    hasProvider=true;walletAddress=address;providerChain=wallet.chainId?.replace(/^eip155:/,'')||null;
    // The SDK also re-issues the same wallet on the same network (re-renders after sign-in); only a real network change is announced.
    if(same)bridge.swap(wallet.provider,providerChain!==prevChain?providerChain:null);else bridge.set(wallet.provider);void connect();},onPhone:phone=>{if(dead)return;trace('phone',phone?'provider '+(phone.chainId||''):'none');phoneBridge.set(phone?.provider||null);
    if(phone&&wantPhone){wantPhone=false;hub.connect(PHONE_UUID).then(()=>{trace('phone-connected');status('Phone wallet connected. No transaction was requested.');$('dialog').close();}).catch(e=>{status('Could not connect the phone wallet'+(e?.message?' ('+e.message+')':'')+'. Pair it again.');show();});}},onError:message=>{trace('error',message);status(message+' (Privy)');if(wanted)show();}});
   let timer;try{await Promise.race([ready,new Promise((_,reject)=>{timer=target.setTimeout(()=>reject(Error('Sign-in took too long. Please try again.')),30000);})]);}finally{target.clearTimeout(timer);}
   return sdk;
  })().catch(error=>{if(!dead){sdk?.dispose();sdk=null;d.getElementById('qhooks-privy-root')?.remove();state={ready:false,authenticated:false,hasWallet:false};hasProvider=false;providerChain=null;bridge.set(null);}throw error;}).finally(()=>{loading=null;if(!dead)render();});
  return loading;
 }
 // Profiles can prepare the existing SDK for wallet sign-in without opening login or selecting another wallet.
 const ensurePrivyControls=async()=>{if(dead)throw Error('Page closed');await(loading||initialize());if(dead)throw Error('Page closed');return target.qhooksPrivySignerControls||null;};
 target.qhooksEnsurePrivyControls=ensurePrivyControls;
 target.dispatchEvent?.(new CustomEvent('qhooks:privy-loader-ready'));
 async function login(){
  if(dead)return;try{await initialize();wanted=true;wantedChain=null;
   if(!state.authenticated){intent(target,'save');$('dialog').close();sdk.login(loginMethods(inApp,xOn));}
   else if(!state.hasWallet){status('Creating your EVM wallet…');$('dialog').close();await sdk.create();}
   else{trace('open','has provider:'+hasProvider);status('Opening your QHooks wallet…');await connect();
    // Say where it stopped instead of leaving "Opening…" forever.
    if(wanted&&!hasProvider){target.clearTimeout(openTimer);openTimer=target.setTimeout(()=>{if(dead||!wanted||hasProvider)return;status('Your QHooks wallet has not opened yet: signed in '+(state.authenticated?'yes':'no')+', wallet '+(state.hasWallet?'yes':'no')+', wallet connection not received from Privy. Try again, or sign out and sign back in.');show();},12000);}}
  }catch(error){wanted=false;intent(target,'clear');status(error?.message||'Could not open sign-in. You can still connect an existing wallet.');show();}render();
 }
 async function logout(){wanted=false;wantedChain=null;target.clearTimeout(switchTimer);target.clearTimeout(dropTimer);dropTimer=null;intent(target,'clear');hasProvider=false;providerChain=null;walletAddress=null;bridge.revoke();if(hub.snapshot().current?.entry.rdns===EMBEDDED_RDNS)hub.disconnect();try{await sdk?.logout();status('Signed out of your QHooks wallet.');}catch{status('Sign-out could not finish. Please retry.');}render();}
 button.addEventListener('click',login);
 // "Buy crypto with a card" for the email/Google wallet, shown only when the Privy app has card funding switched on.
 const network=d.getElementById('qhc-email-network');
 if(network&&!d.getElementById('qhc-fund')){
  const fund=d.createElement('button');fund.type='button';fund.id='qhc-fund';fund.className='qhc-secondary';fund.textContent='Buy crypto with a card';fund.hidden=true;
  fund.addEventListener('click',async()=>{try{await initialize();$('dialog').close();await sdk.fund(hub.snapshot().current?.chainId||'8453');}catch(e){status(e?.message||'Card purchase could not open. Please try again.');show();}});
  network.append(fund);
  appConfig.then(c=>{if(!dead)fund.hidden=c?.fiat_on_ramp_enabled!==true;});
 }
 const mobile=d.getElementById('qhc-mobile-login');
 if(mobile&&!d.getElementById('qhc-phone-login')){
  const phoneButton=d.createElement('button');phoneButton.type='button';phoneButton.id='qhc-phone-login';phoneButton.className='qhc-choice';phoneButton.textContent='Any phone wallet (WalletConnect)';
  phoneButton.addEventListener('click',async()=>{
   try{wantPhone=true;status('Loading WalletConnect…');await initialize();status('');
    if(phoneBridge.provider&&hub.snapshot().wallets.some(w=>w.uuid===PHONE_UUID)){wantPhone=false;await hub.connect(PHONE_UUID);$('dialog').close();return;}
    $('dialog').close();await sdk.connectPhone();}
   catch(error){wantPhone=false;status(error?.message||'WalletConnect could not open. Please try again.');show();}
  });
  mobile.after(phoneButton);
 }$('email-logout').addEventListener('click',logout);
 for(const c of launchChains){const option=d.createElement('option');option.value=c.id;option.textContent=c.name+' · '+c.gas;$('embedded-chain').append(option);}
 $('embedded-switch').addEventListener('click',async()=>{
  if(dead||wantedChain)return;const id=$('embedded-chain').value;if(!launchChains.some(c=>c.id===id))return;
  wanted=true;wantedChain=id;status('Switching your QHooks wallet network…');
  switchTimer=target.setTimeout(()=>{if(!wantedChain)return;wanted=false;wantedChain=null;status('Network switch did not finish. Choose your wallet again.');show();render();},15000);
  try{await sdk.switchChain(id);if(providerChain===id)await connect();}catch{wanted=false;wantedChain=null;target.clearTimeout(switchTimer);status('Could not switch networks. Choose your wallet again.');show();}render();
 });
 const unsubscribe=hub.subscribe(render),params=new URLSearchParams(target.location.search),returned=params.has('privy_oauth_state')||params.has('privy_oauth_provider');
 if(returned)wanted=intent(target,'consume');
 if(returned||[EMBEDDED_RDNS,PHONE_RDNS].includes(hub.preference()?.rdns))void initialize().then(()=>connect()).catch(error=>{wanted=false;status(error.message);show();});
 function dispose(){if(dead)return;dead=true;wanted=false;target.clearTimeout(switchTimer);target.clearTimeout(dropTimer);target.clearTimeout(openTimer);target.clearTimeout(solScanTimer);stopSolChange();solanaHandoff.dispose();unsubscribe();bridge.dispose();phoneBridge.dispose();sdk?.dispose();if(target.qhooksEnsurePrivyControls===ensurePrivyControls)delete target.qhooksEnsurePrivyControls;target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);return Object.freeze({dispose});
}
if(typeof document!=='undefined')bindWalletLogin();
