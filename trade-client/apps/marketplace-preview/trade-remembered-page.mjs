// Page composition is pure at idle. Wallet and fixed swap modules load on user action.
import {loadLaunchGeneration,launchGenerationForConstructor,selectLaunchGeneration} from '/full-launch/packages/multichain-launch/artifact.mjs';
import {discoverConnectedWallets as discoverWallets,passiveProvider,bindWalletWorkspace} from './wallet-hub.mjs';
import {launchChain} from './chain-catalog.mjs';
import {bindSwapPanel} from './swap-page.mjs';
import {readSwapPoolPackage} from '../../packages/multichain-swap/pool-package.mjs';
import {readTradePoolLink,tradePoolLink,readRecentPools,rememberTradePool,poolIdentity} from './trade-pool-links.mjs';

export function bindTradePage({document:d=document,target=window,loadClient,loadArtifacts,loadSwap,discover=discoverWallets,clock=Date.now,downloadFile}={}){
 const ids=['pool-file','import','recent','open','provider','connect','disconnect','token-name','symbol','chain','chain-icon','token-address','controller','quote-asset','share','copy','status','connection'];
 const $=id=>d.getElementById('qt-'+id),ensure=(ok,m)=>{if(!ok)throw Error(m);};for(const id of ids)ensure($(id),'Missing trade page control: '+id);
 let walletBinding=null;
 let wallets=[],pools=[],pool=null,provider=null,session=null,client=null,artifacts=null,context=null,panel=null,busy=false,dead=false,epoch=0;
 const listeners=[];const listen=(element,type,fn)=>{element.addEventListener(type,fn);listeners.push([element,type,fn]);};
 const note=(text,error=false)=>{if(!dead){$('status').textContent=text;$('status').dataset.error=String(error);}};
 function render(){
  if(dead)return;const working=busy||panel?.snapshot().busy,chosen=!!pool;
  for(const id of ['pool-file','import','recent','open'])$(id).disabled=working||!!session;
  $('open').disabled||=pools.length===0;$('provider').disabled=working||!!session;
  $('connect').disabled=working||!chosen||!!session||wallets.length===0;$('disconnect').disabled=working||!session;
  $('copy').disabled=!chosen;$('share').value=pool?new URL(tradePoolLink(JSON.stringify(pool)),target.location.href).href:'';
  const c=pool?.constructor,token=c?(c.currency0===c.quote?c.currency1:c.currency0):null;
  $('token-name').textContent=pool?.tokenFields.tokenName||'Choose a token';$('symbol').textContent=pool?.tokenFields.symbol||'QHooks';
  $('chain').textContent=pool?launchChain(pool.chainId).name:'EVM';$('chain').dataset.chainId=pool?.chainId||'';
  $('chain-icon').hidden=!pool;if(pool)$('chain-icon').src='/chain-symbol-icons/'+launchChain(pool.chainId).slug+'.svg';
  $('token-address').textContent=token||'Open a token’s trade link or choose a recent launch.';$('controller').textContent=pool?.controller||'—';
  $('quote-asset').textContent=context?context.quoteSymbol+' · '+c.quote:c?c.quote:'—';
  $('connection').textContent=context?launchChain(context.chainId).name+' · '+context.owner:session?'Wallet changed. Disconnect and reconnect.':'Connect your wallet when you are ready to trade.';
  panel?.render();walletBinding?.render();
 }
 function resetConnection(){
  epoch++;context=null;const old=session;session=null;provider=null;panel?.reset();old?.dispose();render();
 }
 function invalidate(selected){if(dead||session!==selected)return;epoch++;context=null;panel?.reset();render();note('Wallet changed. Disconnect and reconnect to continue.');}
 function live(revision,selected,current,selectedPool){ensure(!dead&&epoch===revision&&session===selected&&selected.current===current&&pool===selectedPool,'Wallet or selected pool changed');}
 async function run(fn){if(dead||busy)return;busy=true;render();try{await fn();}catch(error){note(error?.message||'Trade setup stopped.',true);}finally{busy=false;render();}}
 function recent(){
  pools=readRecentPools(target.localStorage);$('recent').replaceChildren();
  if(!pools.length){const o=d.createElement('option');o.value='';o.textContent='No recent pools yet';$('recent').append(o);}
  for(const p of pools){const o=d.createElement('option');o.value=poolIdentity(p);o.textContent=p.tokenFields.symbol+' · '+launchChain(p.chainId).name+' · '+p.controller.slice(0,8)+'…';$('recent').append(o);}
 }
 function choose(next,{remember=false}={}){
  ensure(!session&&!panel?.snapshot().swap,'Disconnect before choosing another pool');pool=next;render();try{target.__qhooksPool=pool;d.dispatchEvent(new CustomEvent('qhooks:pool',{detail:pool}));}catch{}
  if(remember){rememberTradePool(target.localStorage,JSON.stringify(pool));recent();}
  note('Pool selected. Connect on '+launchChain(pool.chainId).name+' to get a quote.');
 }
 panel=bindSwapPanel({document:d,target,connection:()=>context,loadSwap,clock,downloadFile});
 listen($('import'),'click',()=>run(async()=>{
  const revision=epoch,f=$('pool-file').files?.[0];ensure(f&&f.size>0&&f.size<=20000,'Select a public pool JSON file smaller than 20 KB');const text=await f.text();
  ensure(!dead&&epoch===revision&&!session,'Page changed while reading the pool');choose(readSwapPoolPackage(text),{remember:true});$('pool-file').value='';
 }));
 listen($('open'),'click',()=>run(async()=>{const next=pools.find(p=>poolIdentity(p)===$('recent').value);ensure(next,'Choose a recent pool');choose(next);}));
 const connectRemembered=authorized=>run(async()=>{
  ensure(pool&&!session,'Choose a pool first');const selectedPool=pool,rev=epoch,entry=wallets.find(w=>w.uuid===$('provider').value);ensure(entry,'Select an installed EVM wallet');
  const loaded=client||await loadClient();ensure(!dead&&epoch===rev&&pool===selectedPool&&!session,'Page changed');client=loaded;provider=entry.provider;
  const selected=client.createWalletSession(passiveProvider(provider),()=>invalidate(selected));session=selected;
  try{
   const current=await selected.connect();ensure(provider===authorized.entry.provider&&current.owner===authorized.owner&&current.chainId===authorized.chainId,'Authorized wallet changed');ensure(!dead&&session===selected&&current===selected.current&&pool===selectedPool,'Wallet connection changed');
   ensure(current.chainId===pool.chainId,'Select '+launchChain(pool.chainId).name+' in your wallet, then reconnect');const revision=epoch;
   const texts=artifacts||await loadArtifacts();live(revision,selected,current,selectedPool);artifacts=texts;
   // Each pool trades against the toolkit generation it launched with.
   const generation=launchGenerationForConstructor(selectedPool.constructor),genTexts=generation==='blocks'?(selectLaunchGeneration('blocks'),{toolkitText:artifacts.toolkitText,metadataText:artifacts.metadataText}):await loadLaunchGeneration(generation);live(revision,selected,current,selectedPool);
   const {profile}=await client.createLaunchDependencies({chainId:pool.chainId,policyText:artifacts.policyText,quote:pool.constructor.quote});live(revision,selected,current,selectedPool);
   ensure(profile.chainId===pool.chainId&&profile.quote.address===pool.constructor.quote&&profile.contracts.PoolManager.address===pool.constructor.manager,'Pool quote or manager differs from this chain’s supported contracts');
   await selected.refresh(current);live(revision,selected,current,selectedPool);
   context=Object.freeze({provider,session:selected,chainId:pool.chainId,owner:current.owner,controller:pool.controller,launch:{chainId:pool.chainId,nonce:pool.nonce,constructor:pool.constructor},token:pool.constructor.currency0===pool.constructor.quote?pool.constructor.currency1:pool.constructor.currency0,tokenFields:pool.tokenFields,quoteDecimals:profile.quote.decimals,quoteSymbol:profile.quote.symbol,nativeSymbol:launchChain(pool.chainId).gas,policyText:artifacts.policyText,toolkitText:genTexts.toolkitText,metadataText:genTexts.metadataText});
   note('Connected. Enter an amount and prepare your quote.');
  }catch(error){if(session===selected)resetConnection();else selected.dispose();throw error;}
 });
 listen($('copy'),'click',()=>run(async()=>{ensure(pool&&target.navigator?.clipboard?.writeText,'Select and copy the trade link below');await target.navigator.clipboard.writeText($('share').value);note('Trade link copied. It contains public pool details only.');}));
 function readHash(){
  if(dead||target.location.hash==='#trade-workspace')return;resetConnection();pool=null;
  try{if(target.location.hash)choose(readTradePoolLink(target.location.hash));else note('Open a token trade link, or select a recent launch.');}catch(error){note(error.message,true);}render();
 }
 listen(target,'hashchange',readHash);
 const discovery=discover(target,entries=>{wallets=[...entries];const value=$('provider').value;$('provider').replaceChildren();for(const w of wallets){const o=d.createElement('option');o.value=w.uuid;o.textContent=w.name;$('provider').append(o);}if(wallets.some(w=>w.uuid===value))$('provider').value=value;render();});
 try{recent();}catch(error){note(error.message,true);}if(target.location.hash)readHash();
 walletBinding=bindWalletWorkspace({target,connectButton:$('connect'),disconnectButton:$('disconnect'),providerSelect:$('provider'),chainId:()=>pool?.chainId,hasSession:()=>!!session,busy:()=>busy||!!panel?.snapshot().busy,onDisconnect:resetConnection,onConnect:connectRemembered,note});
 function dispose(){if(dead)return;walletBinding?.dispose();resetConnection();dead=true;panel.dispose();discovery.stop();for(const [element,type,fn]of listeners)element.removeEventListener(type,fn);}
 listen(target,'pagehide',dispose);render();return Object.freeze({dispose,snapshot:()=>({pool,connected:!!context,busy,swap:panel.snapshot().swap})});
}
