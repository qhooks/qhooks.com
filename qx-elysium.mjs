import {createElysiumClient} from './sdk/elysium.mjs';
import {createElysiumTracker} from './qx-elysium-tracker.mjs';
import {mountElysiumActivity} from './qx-elysium-activity.mjs';

const ZERO='0x'+'0'.repeat(40),ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i,QUANTITY=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const short=value=>typeof value==='string'?value.slice(0,8)+'…'+value.slice(-6):'—';
const decimal=value=>{try{if(typeof value==='string'&&QUANTITY.test(value))return BigInt(value).toLocaleString('en-US');if(Number.isSafeInteger(value)&&value>=0)return value.toLocaleString('en-US');}catch{}return '—';};
const observed=value=>{try{if(!Number.isSafeInteger(value)||value<0)return 'Observation time refreshing';return new Intl.DateTimeFormat('en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC'}).format(new Date(value))+' UTC';}catch{return 'Observation time refreshing';}};
const label=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2');
const generationLabel=venue=>({'kleos-v5-current':'v5 · current','kleos-v5-earlier':'v5 · earlier','kleos-classic-v3':'Classic · v3','boxa-v4':'v4 · HYPE','boxa-v4-pair-v2':'v4 · pair launches','boxa-v3-legacy':'Earlier · v3','elyspump-v3':'Launchpad v3 · v4 pools'})[venue.id]||venue.name;
const groupLabel=group=>({kleos:'Kleos',boxa:'BOXA',elyspump:'ElysPump'})[group]||group;
const providerLabel=data=>typeof data?.provider?.name==='string'?data.provider.name.slice(0,120):'Source refreshing';
const sourceAddress=venue=>venue?.protocol==='uniswap-v4'?venue.manager:venue?.factory;
const feeLabel=fee=>!Number.isInteger(fee)?'—':fee&0x800000?'Dynamic':(fee/10000).toLocaleString('en-US',{maximumFractionDigits:4})+'%';
const validTime=data=>Number.isSafeInteger(data?.observedAt)&&data.observedAt>=0;

/** Actual page seams can be injected by local read-only fixtures; no signer or wallet is accepted. */
export function mountElysiumPage({document:doc=globalThis.document,
 client=createElysiumClient({baseURL:globalThis.location?.origin||'https://qhooks.com'}),
 trackerFactory=createElysiumTracker,storage,now=Date.now,search=globalThis.location?.search||''}={}){
 if(!doc?.getElementById('elysium-app'))throw TypeError('Elysium page required');
 const $=id=>doc.getElementById('ey-'+id),win=doc.defaultView||globalThis,removers=[];
 let dead=false,venues=[],selectedId=null,tracker,activity,initialPoolRead=true;
 const linked={venue:null,to:undefined,hook:null,tx:null},linkErrors=[];
 const channel=()=>({revision:0,controller:null,timer:null,loading:false,error:null,data:null,target:null});
 const network=channel(),catalogue=channel(),pools=channel(),hook=channel(),metadata=channel();
 let assetNames=new Map(),pairLabels=[];
 const make=(tag,text,attrs={})=>{const n=doc.createElement(tag);if(text!==null&&text!==undefined)n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const on=(node,event,fn)=>{node.addEventListener(event,fn);removers.push(()=>node.removeEventListener(event,fn));};
 const text=(id,value)=>{$(id).textContent=value;};
 const state=(id,message,kind='ready')=>{$(id).textContent=message;$(id).dataset.state=kind;};
 function linkError(message){linkErrors.push(message);text('link-errors',linkErrors.join(' '));$('link-errors').hidden=false;}
 try{
  const params=new URLSearchParams(typeof search==='string'?search:'');
  const target=key=>{const values=params.getAll(key);return values.length===1?values[0]:null;};
  if(params.has('venue')){const value=target('venue');if(value&&/^[a-z0-9-]{1,64}$/.test(value))linked.venue=value;else linkError('Invalid pool source in link. Showing the default source.');}
  if(params.has('to')){const value=target('to');if(value&&/^0x(?:0|[1-9a-f][0-9a-f]{0,15})$/.test(value))linked.to=value;else linkError('Invalid block in link. Showing the latest 100 blocks.');}
  if(params.has('venue')&&!linked.venue)linked.to=undefined;
  if(params.has('hook')){const value=target('hook');if(value&&ADDRESS.test(value)&&value.toLowerCase()!==ZERO)linked.hook=value.toLowerCase();else linkError('Invalid hook address in link. Enter a full address to inspect it.');}
  if(params.has('tx')){const value=target('tx');if(value&&HASH.test(value))linked.tx=value.toLowerCase();else linkError('Invalid transaction hash in link. Your saved selection is unchanged.');}
 }catch{linkError('The link inputs could not be read. The tools remain available below.');}
 function cancel(ch){ch.revision++;ch.controller?.abort();ch.controller=null;clearTimeout(ch.timer);ch.loading=false;}
 async function read(ch,readValue,accept,render){
  cancel(ch);const mine=ch.revision,own=ch.controller=new AbortController();ch.loading=true;ch.error=null;render();
  const timer=ch.timer=setTimeout(()=>own.abort(),15000);
  try{const value=await readValue(own.signal);if(dead||mine!==ch.revision||own.signal.aborted)return;accept(value);ch.error=null;}
  catch(error){if(dead||mine!==ch.revision)return;ch.error=error?.code==='provider_rate_limited'?'The data provider is rate limited. Give it a moment, then refresh.':own.signal.aborted?'This read timed out. Refresh to try again.':String(error?.message||'Refreshing. Refresh again in a moment.').slice(0,220);}
  finally{clearTimeout(timer);if(!dead&&mine===ch.revision){ch.loading=false;ch.controller=null;render();}}
 }
 function stale(ch){return !!ch.data&&(!!ch.error||ch.loading||now()-ch.data.observedAt>=60000);}
 function button(title,fn,attrs={}){const node=make('button',title,{type:'button',class:'ey-text-button',...attrs});node.addEventListener('click',fn);return node;}
 function pairName(address){const key=address.toLowerCase();return key===ZERO?'HYPE':assetNames.get(key)?.symbol||short(address);}
 function pairLabel(address){const node=make('span',pairName(address),{class:'ey-pair-asset',title:address});pairLabels.push({address:address.toLowerCase(),node});return node;}
 function patchPairLabels(){
  for(const{address,node}of pairLabels){
   node.textContent=pairName(address);const asset=assetNames.get(address);
   node.setAttribute('title',asset?address+' · symbol reported at block '+decimal(asset.blockNumber)+' · '+observed(asset.observedAt):address);
  }
 }
 function resolveAssets(data){
  cancel(metadata);if(typeof client.assets!=='function')return;
  const addresses=[...new Set([...data.pools].sort((a,b)=>b.blockNumber-a.blockNumber).flatMap(row=>[row.currency0,row.currency1]).map(value=>value.toLowerCase()).filter(value=>value!==ZERO))].slice(0,4);
  if(!addresses.length)return;
  const blockNumber=data.window.toBlock;
  // Metadata is optional decoration on already-painted pools. It never gates actions,
  // replaces a card/button, or serves as an asset identifier.
  void read(metadata,signal=>client.assets(addresses,{blockNumber,signal}),body=>{
   if(pools.data!==data||selectedId!==data.venue.id)return;
   if(!validTime(body)||!QUANTITY.test(body.block?.number)||BigInt(body.block.number)!==BigInt(blockNumber)||!Array.isArray(body.assets)||body.assets.some(asset=>!asset||asset.chainId!=='99901'||!addresses.includes(asset.address)||!QUANTITY.test(asset.blockNumber)||BigInt(asset.blockNumber)!==BigInt(blockNumber))||new Set(body.assets.map(asset=>asset.address)).size!==body.assets.length)throw TypeError('Asset metadata did not match the displayed pool window.');
   const names=new Map();
   for(const asset of body.assets){
    const symbol=typeof asset.symbol==='string'&&asset.symbol.length<=32&&!/[\u0000-\u001f\u007f]/.test(asset.symbol)?asset.symbol.trim():'';
    if(symbol)names.set(asset.address,{...asset,symbol});
   }
   assetNames=names;metadata.data=body;patchPairLabels();
  },()=>{});
 }
 function fact(term,value){const item=make('div'),dt=make('dt',term),dd=make('dd',value);item.append(dt,dd);return item;}
 async function copy(value){try{await win.navigator.clipboard.writeText(value);text('copy-status','Copied '+value);return true;}catch{text('copy-status','Copy did not work here. Select the address or hash to copy it.');return false;}}
 async function copyWindowLink(){
  const data=pools.data;if(!data)return;
  const where=win.location||globalThis.location;let url;
  try{url=new URL(where?.origin||'https://qhooks.com');if(!['https:','http:'].includes(url.protocol))throw Error('Unsupported page origin');url.pathname=where?.pathname||'/elysium';url.search='';url.hash='';url.searchParams.set('venue',data.venue.id);url.searchParams.set('to','0x'+BigInt(data.window.toBlock).toString(16));}catch{text('copy-status','The window link could not be created.');return;}
  const copied=await copy(url.href);if(dead||pools.data!==data)return;
  $('pools-copy').textContent=copied?'Window link copied':'Copy window link';$('window-link').hidden=copied;
  if(!copied)$('window-link').replaceChildren(make('a',url.href,{href:url.href}));
 }

 function renderNetwork(){
  $('network-refresh').disabled=network.loading;
  if(network.data){const data=network.data;text('network-head',decimal(data.heads.latest?.number));$('network-detail').replaceChildren(make('p',providerLabel(data)+'. Parent settlement is not verified by these reads.'));
   const dl=make('dl');for(const key of['latest','safe','finalized'])dl.append(fact('Provider-reported '+key+' head',data.heads[key]?'Block '+decimal(data.heads[key].number):'—'));
   $('network-detail').append(dl);
  }
  if(network.loading)state('network-status',network.data?'Refreshing · previous observation remains below.':'Reading the network…','loading');
  else if(network.error)state('network-status',network.error+(network.data?' Last read '+observed(network.data.observedAt)+'.':' Network head is refreshing.'),'error');
  else if(network.data)state('network-status','Observed '+observed(network.data.observedAt)+' · '+providerLabel(network.data));
 }
 const refreshNetwork=()=>read(network,signal=>client.network({signal}),data=>{if(!validTime(data)||!data.heads?.latest||!QUANTITY.test(data.heads.latest.number))throw TypeError('The network response was incomplete. Refresh to retry.');network.data=data;},renderNetwork);

 function currentVenue(){return venues.find(v=>v.id===selectedId)||null;}
 function fillGenerations(group,preferred){
  const matches=venues.filter(v=>v.venue===group);$('generation').replaceChildren(...matches.map(v=>make('option',generationLabel(v),{value:v.id})));
  selectedId=matches.some(v=>v.id===preferred)?preferred:matches[0]?.id||null;if(selectedId)$('generation').value=selectedId;
 }
 function renderCatalogue(){
  $('venue').disabled=catalogue.loading||!venues.length;$('generation').disabled=catalogue.loading||!venues.length;
  if(catalogue.loading&&!venues.length)state('pools-status','Reading the deployment list…','loading');
  else if(catalogue.error)state('pools-status',catalogue.error+' Refresh to read the deployment list again.','error');
  renderPoolControls();
 }
 function renderPoolControls(){
  const v=currentVenue();$('pools-refresh').disabled=pools.loading||catalogue.loading;$('pools-previous').disabled=pools.loading||!v||pools.data?.venue.id!==v.id||!pools.data?.window.nextToBlock;
  $('pools-copy').disabled=!pools.data;$('pools-copy').textContent='Copy window link';$('window-link').hidden=true;
  text('pools-target',v?'Source: '+v.name+' · '+(v.protocol==='uniswap-v4'?'PoolManager':'Factory')+' '+sourceAddress(v):'Published deployments only. Refresh to load the source list.');
 }
 function poolCard(row){
  const card=make('article',null,{class:'ey-pool'}),top=make('div',null,{class:'ey-pool-top'});
  top.append(make('span',row.protocol==='uniswap-v4'?'UNISWAP V4':'UNISWAP V3',{class:'ey-protocol'}),make('span','Created at block '+decimal(row.blockNumber)));
  const title=make('h3');title.append(pairLabel(row.currency0),make('span','/'),pairLabel(row.currency1));
  const assets=make('dl',null,{class:'ey-assets'});
  for(const[address,i]of[[row.currency0,0],[row.currency1,1]]){const item=fact('Currency '+i,'');item.lastChild.append(make('code',address,{class:'ey-address'}));if(address.toLowerCase()===ZERO)item.lastChild.append(make('span','Native HYPE',{class:'ey-native'}));assets.append(item);}
  const facts=make('dl',null,{class:'ey-facts'});facts.append(fact('LP fee',feeLabel(row.fee)),fact('Tick spacing',String(row.tickSpacing)),fact('Hook',row.hook&&row.hook!==ZERO?short(row.hook):'No hook'));
  const actions=make('div',null,{class:'ey-pool-actions'});
  if(row.protocol==='uniswap-v4'&&activity){const recent=button('Recent swaps →',()=>{try{void activity.open(row,pools.data.venue);$('activity').scrollIntoView?.({behavior:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}catch{linkError('This pool’s exact key could not be confirmed. Refresh the pool window to retry.');}});recent.disabled=pools.loading||pools.data?.venue.id!==selectedId;actions.append(recent);}
  if(row.hook&&row.hook!==ZERO)actions.append(button('Inspect hook →',()=>{const address=row.hook;$('hook-address').value=address;void inspectHook(address);$('hook').scrollIntoView?.({behavior:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});$('hook-address').focus({preventScroll:true});}));
  actions.append(button('Track creation →',()=>{$('tx-hash').value=row.tx;void watchTransaction(row.tx);$('transactions').scrollIntoView?.({behavior:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});$('tx-hash').focus({preventScroll:true});}));
  const detail=make('details',null,{class:'ey-pool-detail'});detail.append(make('summary','Pool key & transaction'));
  const dl=make('dl');for(const[k,v]of[['Pool ID',row.poolId],['Pool address',row.poolAddress],['PoolManager',row.manager],['Factory',row.factory],['Hook address',row.hook],['Creation transaction',row.tx],['Block hash',row.blockHash]])if(v){const item=fact(k,'');item.lastChild.append(make('code',v,{class:'ey-address'}));dl.append(item);}
  detail.append(dl,button('Copy pool identity',()=>void copy(row.identity)));
  card.append(top,title,assets,facts);
  if(row.hook&&row.hook!==ZERO)card.append(make('p','LP fee only. Additional hook charges are not read here.',{class:'ey-note'}));
  card.append(actions,detail);return card;
 }
 function renderPools(){
  renderPoolControls();const data=pools.data,v=currentVenue();
  if(pools.loading)state('pools-status','Reading '+(v?.name||'this deployment')+'…'+(data?' Previous results remain below.':''),'loading');
  else if(pools.error)state('pools-status','Could not refresh '+(v?.name||'this deployment')+'. '+pools.error+(data?' Previous results are retained below.':''),'error');
  else if(data)state('pools-status',data.venue.name+' · '+providerLabel(data)+'. Pool origins are not attributed.');
  if(!data)return;
  $('pools-context').hidden=false;$('pools-context').replaceChildren();
  const title=make('strong',data.pools.length+' pool creation'+(data.pools.length===1?'':'s')+' · blocks '+decimal(data.window.fromBlock)+'–'+decimal(data.window.toBlock));
  $('pools-context').append(title,make('span',observed(data.observedAt)));
  const retained=pools.error||pools.loading||data.venue.id!==selectedId;
  if(retained)$('pools-context').append(make('span','Previous results · '+data.venue.name,{class:'ey-stale'}));
  else if(stale(pools))$('pools-context').append(make('span','Refreshing · tap refresh for the latest',{class:'ey-stale'}));
  pairLabels=[];const rows=[...data.pools].sort((a,b)=>b.blockNumber-a.blockNumber);
  if(rows.length)$('pool-list').replaceChildren(...rows.map(poolCard));
  else{const empty=make('div',null,{class:'ey-empty'});empty.append(make('span','↗',{class:'ey-empty-mark','aria-hidden':'true'}),make('h3','No pool creations in this window.'),make('p','This covers only blocks '+decimal(data.window.fromBlock)+'–'+decimal(data.window.toBlock)+'. Try the previous 100 blocks or another deployment.'));$('pool-list').replaceChildren(empty);}
  if(data.coverage?.rejectedCount>0)$('pools-context').append(make('span',data.coverage.rejectedCount+' log'+(data.coverage.rejectedCount===1?' was':'s were')+' unreadable; coverage is partial.'));
 }
 async function refreshPools(toBlock){
  cancel(metadata);activity?.clear();const v=currentVenue();if(!v)return loadVenues();pools.target=v.id;let painted=null;
  await read(pools,signal=>client.pools(v.id,{...(toBlock?{toBlock}:{}),signal}),data=>{
   if(!validTime(data)||data.venue?.id!==v.id||!Array.isArray(data.pools)||!QUANTITY.test(data.window?.fromBlock)||!QUANTITY.test(data.window?.toBlock)||data.window.nextToBlock!==null&&!QUANTITY.test(data.window.nextToBlock))throw TypeError('The pool response did not match this deployment.');
   if(data.pools.some(row=>!row||!ADDRESS.test(row.currency0)||!ADDRESS.test(row.currency1)||!HASH.test(row.tx)||!Number.isSafeInteger(row.blockNumber)||!Number.isInteger(row.fee)||!Number.isInteger(row.tickSpacing)))throw TypeError('The pool response contained incomplete identities.');
   assetNames=new Map();pools.data=data;painted=data;
  },renderPools);
  if(painted&&!dead&&pools.data===painted&&selectedId===v.id)resolveAssets(painted);
 }
 async function loadVenues(){
  await read(catalogue,signal=>client.venues({signal}),data=>{
   if(!validTime(data)||!Array.isArray(data.venues)||!data.venues.length||data.venues.some(v=>typeof v.id!=='string'||typeof v.venue!=='string'||typeof v.name!=='string'||!['uniswap-v4','uniswap-v3'].includes(v.protocol)||!ADDRESS.test(sourceAddress(v))))throw TypeError('The deployment list was incomplete.');
   venues=data.venues;catalogue.data=data;
   if(initialPoolRead&&linked.venue&&!venues.some(v=>v.id===linked.venue)){linkError('Unknown pool source in link. Showing the default source at the latest 100 blocks.');linked.venue=null;linked.to=undefined;}
   const preferred=selectedId||(initialPoolRead?linked.venue:null)||'kleos-v5-current',v=venues.find(v=>v.id===preferred)||venues[0];
   $('venue').replaceChildren(...[...new Set(venues.map(v=>v.venue))].map(group=>make('option',groupLabel(group),{value:group})));$('venue').value=v.venue;fillGenerations(v.venue,v.id);
  },renderCatalogue);
  if(venues.length&&!catalogue.error&&!dead){const toBlock=initialPoolRead?linked.to:undefined;initialPoolRead=false;void refreshPools(toBlock);}
 }

 function renderHook(){
  $('hook-submit').disabled=hook.loading;const data=hook.data;
  if(hook.loading)state('hook-status','Reading '+hook.target+'…'+(data?' Previous code observation is retained below.':''),'loading');
  else if(hook.error)state('hook-status','Could not inspect '+hook.target+'. '+hook.error+(data?' Previous observation is retained below.':''),'error');
  else if(data)state('hook-status',hook.target&&hook.target!==data.address?'Address changed. Inspect to read it; the previous observation remains below.':'Observed '+observed(data.observedAt)+' · '+providerLabel(data));
  else state('hook-status','Enter an address, or inspect a hook from a pool.');
  if(!data)return;
  const box=$('hook-result');box.replaceChildren();box.dataset.stale=String(stale(hook)||hook.target!==data.address);
  box.append(make('span','Last read · '+data.address,{class:'ey-reading-label'}));
  if(stale(hook)||hook.target!==data.address)box.append(make('span','Previous observation',{class:'ey-stale'}));
  box.append(make('h3',data.codePresent?'Runtime code observed':'No runtime code observed'));
  const metrics=make('div',null,{class:'ey-metric-row'});for(const[k,v]of[['Runtime size',data.runtimeBytes.toLocaleString('en-US')+' bytes'],['Observed block',decimal(data.block.number)]]){const item=make('div');item.append(make('span',k),make('strong',v));metrics.append(item);}box.append(metrics,make('p','Runtime SHA-256'),make('code',data.runtimeSha256,{class:'ey-code-hash'}));
  const enabled=data.permissions.enabled;box.append(make('p',enabled.length?enabled.length+' enabled address callback'+(enabled.length===1?'':'s'):'No callback flags in this address.'));
  if(enabled.length){const chips=make('ul',null,{class:'ey-permissions'});for(const name of enabled)chips.append(make('li',label(name)));box.append(chips);}
  const details=make('details',null,{class:'ey-source'});details.append(make('summary','All callback flags'));const flags=make('ul',null,{class:'ey-flags'});for(const[name,on]of Object.entries(data.permissions.flags)){const item=make('li');item.append(make('span',label(name)),make('b',on?'Enabled':'Not enabled'));flags.append(item);}details.append(flags);box.append(details,make('p',data.codePresent?'Runtime presence and address flags do not verify behavior or safety.':'Flags can be decoded for an undeployed address; they do not establish a deployed hook.'));
 }
 function inspectHook(value=$('hook-address').value){
  const address=value.trim().toLowerCase();hook.target=address;
  if(!ADDRESS.test(address)||address===ZERO){cancel(hook);hook.error='Enter a full nonzero hook contract address.';renderHook();return Promise.resolve();}
  return read(hook,signal=>client.hook(address,{signal}),data=>{
   if(!validTime(data)||data.address!==address||typeof data.codePresent!=='boolean'||!Number.isSafeInteger(data.runtimeBytes)||data.runtimeBytes<0||data.codePresent!==(data.runtimeBytes>0)||!/^[0-9a-f]{64}$/.test(data.runtimeSha256)||!QUANTITY.test(data.block?.number)||!Array.isArray(data.permissions?.enabled)||!data.permissions.flags)throw TypeError('The hook response did not match this address.');
   hook.data=data;
  },renderHook);
 }

 function renderTransaction(view){
  if(dead)return;const box=$('tx-result');box.replaceChildren();box.dataset.stale=String(view.stale);
  box.append(make('h3',view.loading?'Reading the execution receipt…':view.headline),make('p',view.detail));
  if(view.hash)box.append(make('code',view.hash,{class:'ey-tx-hash'}));
  if(view.stale)box.append(make('span','Previous observation',{class:'ey-stale'}));
  if(view.observedAt!==null)box.append(make('p','Observed '+observed(view.observedAt)));
  if(view.provider)box.append(make('p',view.provider.name+' · '+view.rpcFinality));
  if(view.hash)box.append(make('p',view.storagePersistent?'Saved in this browser. Reload to return to this hash.':'This browser is not keeping saved hashes. Keep a copy of this hash.'));
  $('tx-refresh').disabled=!view.canRefresh;$('tx-clear').hidden=!view.hash;
  $('tx-history').hidden=!view.history.length;$('tx-history-list').replaceChildren(...view.history.map(item=>{const node=button(short(item.hash),()=>{$('tx-hash').value=item.hash;void watchTransaction(item.hash);},{'aria-label':'Check transaction '+item.hash});node.append(make('small',item.observedAt===null?'Ready to check':observed(item.observedAt)));return node;}));
 }
 async function watchTransaction(value){try{await tracker.watch(value.trim());}catch(error){const box=$('tx-result');box.replaceChildren(make('h3','Check the transaction hash'),make('p',error.message));}}
 tracker=trackerFactory({onChange:renderTransaction,...(storage===undefined?{}:{storage}),now});const restored=tracker.snapshot();renderTransaction(restored);
 if($('activity')&&typeof client.swaps==='function')activity=mountElysiumActivity($('activity'),{client,document:doc,now,onTransaction:hash=>{$('tx-hash').value=hash;void watchTransaction(hash);$('transactions').scrollIntoView?.({behavior:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});$('tx-hash').focus({preventScroll:true});}});
 if(linked.tx){$('tx-hash').value=linked.tx;void watchTransaction(linked.tx);}
 else if(restored.hash){$('tx-hash').value=restored.hash;void tracker.refresh();}

 on($('network-refresh'),'click',()=>void refreshNetwork());
 on($('pools-form'),'submit',e=>{e.preventDefault();void refreshPools();});
 on($('venue'),'change',()=>{cancel(pools);fillGenerations($('venue').value);void refreshPools();});
 on($('generation'),'change',()=>{cancel(pools);selectedId=$('generation').value;void refreshPools();});
 on($('pools-previous'),'click',()=>{if(pools.data?.venue.id===selectedId&&pools.data.window.nextToBlock)void refreshPools(pools.data.window.nextToBlock);});
 on($('pools-copy'),'click',()=>void copyWindowLink());
 on($('hook-form'),'submit',e=>{e.preventDefault();void inspectHook();});
 on($('hook-address'),'input',()=>{cancel(hook);hook.target=$('hook-address').value.trim().toLowerCase();hook.error=null;renderHook();});
 on($('tx-form'),'submit',e=>{e.preventDefault();void watchTransaction($('tx-hash').value);});
 on($('tx-refresh'),'click',()=>void tracker.refresh());
 on($('tx-clear'),'click',()=>{$('tx-hash').value='';tracker.clear();});
 // The System A shell carries the site nav; the page's own menu button and nav are optional (kept when present).
 const closeMenu=()=>{$('menu')?.setAttribute('aria-expanded','false');doc.querySelector('.site-header')?.classList.remove('is-open');};
 if($('menu')&&$('nav')){
 on($('menu'),'click',()=>{const open=$('menu').getAttribute('aria-expanded')!=='true';$('menu').setAttribute('aria-expanded',String(open));$('menu').setAttribute('aria-label',open?'Close navigation':'Open navigation');doc.querySelector('.site-header')?.classList.toggle('is-open',open);});
 on($('nav'),'click',e=>{if(e.target.closest('a'))closeMenu();});on(doc,'keydown',e=>{if(e.key==='Escape'&&$('menu').getAttribute('aria-expanded')==='true'){closeMenu();$('menu').focus();}});
 }
 function dispose(){if(dead)return;dead=true;for(const ch of[network,catalogue,pools,hook,metadata])cancel(ch);activity?.dispose();tracker.dispose();for(const remove of removers)remove();}
 if(win.addEventListener)on(win,'pagehide',event=>{if(!event.persisted)dispose();});
 void refreshNetwork();void loadVenues();if(linked.hook){$('hook-address').value=linked.hook;void inspectHook(linked.hook);}
 return Object.freeze({refreshNetwork,refreshPools,inspectHook,tracker,dispose});
}
if(globalThis.document?.getElementById('elysium-app'))mountElysiumPage();
