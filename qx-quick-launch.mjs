// Quick launch and launch-idea cards on /create. An extra path beside the guided flow, which it never changes.
// One transaction: QSimpleLaunch.launch with the card's preset. The person types name and ticker and picks an image.
import {checkTicker,assertTickerFree,TickerTaken,tickerBlockNodes} from '/qx-ticker-guard.mjs';
import {chainById} from './chains.mjs';
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {CREATE_EXECUTION_ENABLED,CREATE_EXECUTION_HOLD} from './qx-create-release.mjs';
import {readCreateNativeUSD} from './qx-create-prices.mjs';
import {launchError} from './qx-create-plan.mjs';
import {quoteNextChain,recheckNextChain} from './full-launch/packages/multichain/fees.mjs';
import {ideaCards,ideaCard,visibleGroups,quickFactory,encodeQuickLaunch,validateQuick,launchFeeWei,quickCost,ethText,launchedToken,marketPath,randomSalt,PLANNING_GAS,META_LIMIT} from './qx-quick-launch-core.mjs';

const $=id=>document.getElementById('qq-'+id),hub=getWalletHub(window),LAST='qhooks:create:quick:v1';
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k in n)n[k]=v;else n.setAttribute(k,v);}n.append(...kids.filter(x=>x!=null));return n;};
const SVG='http://www.w3.org/2000/svg';
// Line icons per block, drawn in currentColor. Each icon carries the block's name for screen readers and on hover.
const PATHS={
 antiSnipe:'M12 3l7 3v5c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z',walletCap:'M4 7h14a2 2 0 012 2v8a2 2 0 01-2 2H4zM4 7l11-3v3M16 13h2',
 cooldown:'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',sandwich:'M4 8h16M4 12h16M4 16h16',exitClock:'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9',
 stormFee:'M3 15l4-6 4 4 4-8 6 10',sessionFee:'M12 3v2M12 19v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M3 12h2M19 12h2M12 8a4 4 0 100 8 4 4 0 000-8z',
 tax:'M6 18L18 6M7.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM16.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',referrals:'M9 15l6-6M8 11l-2 2a3 3 0 004 4l2-2M16 13l2-2a3 3 0 00-4-4l-2 2',
 autoBurn:'M12 3c1 3 5 5 5 10a5 5 0 01-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z',buyback:'M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M18 3v4h-4M6 21v-4h4',
 king:'M4 18h16M5 18l-1-10 5 4 3-6 3 6 5-4-1 10',clockPot:'M9 3h6M12 8v5M12 6a7 7 0 100 14 7 7 0 000-14z',points:'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z'};
function icon(block){const s=document.createElementNS(SVG,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');
 const p=document.createElementNS(SVG,'path');p.setAttribute('d',PATHS[block.id]||'M12 12h.01');s.append(p);return el('span',{class:'qq-icon',title:block.name,role:'img','aria-label':block.name},s);}

const QUICK_CHAIN='4663';
let taken=null,tickerRun=0,tickerTimer=0;
let costError='',chainId=null,group='all',pick=null,image='',cost=null,costRun=0,busy=false,usd=null,feeRead=new Map();
const chainSelect=document.getElementById('qc-chainId');
const currentChain=()=>chainSelect?.value||new URLSearchParams(location.search).get('chain')||'4663';
const note=(text,error=false)=>{$('message').textContent=text;$('message').dataset.error=String(error);};
// Anti-copycat ticker block: a ticker already launched through QHooks is refused before the wallet opens.
const noteNodes=(nodes,error=true)=>{$('message').replaceChildren(...nodes);$('message').dataset.error=String(error);};
function showTaken(r){taken=r;noteNodes(tickerBlockNodes(r));}
function checkTickerSoon(){clearTimeout(tickerTimer);const run=++tickerRun;tickerTimer=setTimeout(async()=>{
 const symbol=$('symbol').value.trim(),owner=hub.snapshot().current?.owner||'';if(!pick||!symbol){taken=null;renderQuick();return;}
 const r=await checkTicker({symbol,chainId,creator:owner});if(run!==tickerRun)return;
 if(!r.available)showTaken(r);else if(taken){taken=null;note('');}renderQuick();},350);}

function renderIdeas(){
 chainId=currentChain();const own=ideaCards(chainId),offChain=!own.length,cards=offChain?ideaCards(QUICK_CHAIN):own,groups=visibleGroups(cards),c=chainById(chainId);
 if(!groups.some(([id])=>id===group))group='all';
 $('chips').replaceChildren(...groups.map(([id,label])=>{const b=el('button',{type:'button','aria-pressed':String(id===group),'data-group':id},label);b.addEventListener('click',()=>{group=id;renderIdeas();});return b;}));
 $('chips').hidden=!cards.length;
 $('cards').replaceChildren(...cards.map(card=>{
  const btn=el('button',{type:'button',class:'qq-launch-card','data-launch':card.id},'Launch this');btn.addEventListener('click',()=>launchCard(card.id));
  const blocks=card.blocks.length?el('div',{class:'qq-blocks'},...card.blocks.map(icon)):el('div',{class:'qq-blocks qq-blocks-none'},el('span',{},'No extra rules'));
  return el('article',{class:'qq-card','data-card':card.id,'data-group':card.group,hidden:group!=='all'&&card.group!==group},
   el('h3',{},card.name),el('p',{class:'qq-what'},card.what),el('p',{class:'qq-why'},card.why),blocks,btn);
 }));
 // Off Robinhood Chain the cards stay visible (lead, 2026-11-08); "Launch this" switches the chain first.
 $('none').hidden=!offChain;$('use-robinhood').hidden=true;$('open').hidden=false;
 if(offChain)$('none-text').textContent='One-tap launches run on Robinhood Chain';
 if(pick&&!ideaCard(chainId,pick.id)){pick=null;$('quick').hidden=true;}
}

// A card picked while another chain is selected: switch the page to Robinhood Chain, then open that card.
function launchCard(id){
 if(!ideaCards(currentChain()).length&&chainSelect){chainSelect.value=QUICK_CHAIN;chainSelect.dispatchEvent(new Event('change'));}
 openQuick(id,{scroll:true});
}

function openQuick(id,{scroll=false}={}){
 const card=ideaCard(chainId,id)||ideaCard(chainId,'fair');if(!card)return;pick=card;$('quick').hidden=false;
 $('style-name').textContent=card.name;$('style-line').textContent=card.what;
 $('style-blocks').replaceChildren(...card.blocks.map(icon));
 for(const a of document.querySelectorAll('#qq-cards [data-launch]'))a.setAttribute('aria-pressed',String(a.dataset.launch===card.id));
 if(!$('done').hidden){$('done').hidden=true;$('launch').hidden=false;$('name').value='';$('symbol').value='';note('');}
 cost=null;renderQuick();void refreshCost();
 if(scroll){$('quick').scrollIntoView({block:'start',behavior:'auto'});$('name').focus({preventScroll:true});}
}

function fields(){return {name:$('name').value,symbol:$('symbol').value,image};}
function renderQuick(){
 if(!pick)return;const c=chainById(chainId),conn=hub.snapshot().current;
 let ready=true;try{validateQuick(fields());}catch{ready=false;}
 const box=$('cost');
 if(!cost)box.replaceChildren(el('p',{class:'qq-total'},'Loading…'),...(costError?[el('p',{class:'qxc-fine'},costError)]:[]));
 else{const line=(k,v)=>el('div',{class:'qxc-summary-line'},el('span',{},k),el('b',{class:'qxc-number'},v));
  const dollars=usd?' · about $'+(Number(BigInt(cost.totalWei))/1e18*usd).toFixed(2):'';
  box.replaceChildren(el('p',{class:'qq-total qxc-number'},ethText(cost.totalWei)+' '+c.native+dollars),
   line('Launch fee',ethText(cost.feeWei)+' '+c.native),line('Network gas · up to',ethText(cost.networkWei)+' '+c.native),
   ...(cost.live&&!cost.quote.funded?[el('p',{class:'qxc-fine qq-short','data-error':'true'},'Add '+ethText(BigInt(cost.quote.requiredBalance)-BigInt(cost.quote.balance))+' '+c.native+' on '+c.name+' to launch.')]:[]),el('p',{class:'qxc-fine'},cost.live?'Priced for this launch from your wallet’s estimate. One transaction, one confirmation.':'Planning estimate. Connect a wallet for this launch’s own estimate. One transaction, one confirmation.'));}
 const b=$('launch');
 b.textContent=busy?'Launching…':!conn?'Connect wallet':conn.chainId!==chainId?'Switch to '+c.short+' and launch':'Launch for '+(cost?ethText(cost.totalWei)+' '+c.native:'…');
 b.disabled=busy||!!taken||!!conn&&conn.chainId===chainId&&(!ready||!cost||cost.live&&!cost.quote.funded);
}

async function rpc(method,params){const c=chainById(chainId);const r=await fetch(c.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const j=await r.json();if(j.error||typeof j.result!=='string')throw Error(j.error?.message||'RPC error');return j.result;}
async function readFee(){
 if(!feeRead.has(chainId))feeRead.set(chainId,rpc('eth_call',[{to:quickFactory(chainId),data:'0xc763e5a1'},'latest']).then(r=>launchFeeWei(r,chainId)).catch(()=>{feeRead.delete(chainId);return launchFeeWei(null,chainId);}));
 return feeRead.get(chainId);
}
// Cost shown before any wallet prompt. With a connected wallet on the right chain and valid fields, the guided flow's
// own fee quote (quoteNextChain: wallet estimate +25%, 2 x base fee + tip, review caps) prices this exact transaction,
// and that quoted transaction is what gets sent after a recheck. Otherwise: planning gas x the public gas price.
const walletRequest=conn=>(method,params)=>conn.entry.provider.request({method,params});
async function refreshCost(){
 if(!pick)return null;const run=++costRun,style=pick.style,snipe=pick.snipe;
 try{
  const conn=hub.snapshot().current,fee=await readFee();let next=null;
  if(conn&&conn.chainId===chainId){let f=null;try{f=fields();validateQuick(f);}catch{f=null;}
   if(f){const salt=randomSalt(),data=encodeQuickLaunch({...f,style,snipe,salt}),call={to:quickFactory(chainId),data,value:'0x'+fee.toString(16)};
    const quote=await quoteNextChain({chainId,request:walletRequest(conn),owner:conn.owner,call});
    next={...quickCost({feeWei:fee,gas:quote.gas,gasPriceWei:BigInt(quote.transaction.maxFeePerGas)}),live:true,quote,owner:conn.owner,key:JSON.stringify([f,style,snipe])};}}
  if(!next){const price=await rpc('eth_gasPrice',[]);next={...quickCost({feeWei:fee,gas:Math.ceil(PLANNING_GAS[style]*1.25),gasPriceWei:2n*BigInt(price)}),live:false};}
  if(run!==costRun)return cost;cost=next;
 }catch(e){if(run===costRun){cost=null;costError=/insufficient|exceeds balance/i.test(String(e?.message))?launchError(e):/review limit/i.test(String(e?.message))?launchError(e):'Reading network fees. Trying again in a few seconds.';clearTimeout(costTimer);costTimer=setTimeout(()=>void refreshCost(),10000);}}
 if(run===costRun){if(cost)costError='';renderQuick();}return cost;
}
let costTimer=null;const costSoon=()=>{clearTimeout(costTimer);costTimer=setTimeout(()=>void refreshCost(),400);};

// Downscale the picked image to a small square JPEG that fits inside the token's on-chain meta (4 KB).
async function thumbnail(file){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Choose a PNG, JPEG or WebP image.');
 if(file.size>8e6)throw Error('Choose an image under 8 MB.');
 const bitmap=await createImageBitmap(file);const side=Math.min(bitmap.width,bitmap.height);
 for(const [px,q] of [[96,.82],[80,.78],[64,.74],[64,.6],[48,.6]]){
  const canvas=el('canvas',{width:px,height:px}),ctx=canvas.getContext('2d');ctx.fillStyle='#fbf9f4';ctx.fillRect(0,0,px,px);
  ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,px,px);
  const url=canvas.toDataURL('image/jpeg',q);if(url.length<=META_LIMIT-200)return url;
 }
 throw Error('That image is too detailed to store. Try a simpler one.');
}

const rememberLast=v=>{try{localStorage.setItem(LAST,JSON.stringify(v));}catch{/* the receipt is still shown on this page */}};
function showDone(token,hash){
 const c=chainById(chainId);$('done').hidden=false;$('launch').hidden=true;$('done-name').textContent=$('name').value.trim()+' ('+$('symbol').value.trim().toUpperCase()+') · '+c.name;
 $('token').textContent=token;$('open-market').href=marketPath(chainId,token);$('tx').href=c.explorer+'/tx/'+hash;$('done').focus?.();
}
async function receipt(provider,hash){
 for(let i=0;i<240;i++){
  const r=await provider.request({method:'eth_getTransactionReceipt',params:[hash]}).catch(()=>null);
  if(r)return r;await new Promise(res=>setTimeout(res,i<20?750:2000));
 }
 throw Error('The network took too long to confirm. Your transaction may still land; check it with the link below.');
}
async function launch(){
 if(busy||!pick)return;if(!CREATE_EXECUTION_ENABLED){note(CREATE_EXECUTION_HOLD,true);return;}
 let conn=hub.snapshot().current;if(!conn){hub.open();return;}
 let f;try{f=fields();validateQuick(f);}catch(e){note(e.message,true);return;}
 try{await assertTickerFree({symbol:f.symbol,chainId,creator:conn.owner});}catch(e){if(e instanceof TickerTaken){showTaken(e.result);renderQuick();return;}throw e;}
 busy=true;note('');renderQuick();
 try{
  if(conn.chainId!==chainId){note('Switching your wallet to '+chainById(chainId).name+'…');conn=await hub.switchChain(chainId);busy=false;await refreshCost();note('Check the cost, then launch.');return;}
  const key=JSON.stringify([f,pick.style,pick.snipe]);
  // The person must have seen the price of this exact transaction before the wallet opens.
  if(!cost?.live||cost.key!==key||cost.owner!==conn.owner){busy=false;await refreshCost();note('Check the cost, then launch.');return;}
  const tx=await recheckNextChain({request:walletRequest(conn),quote:cost.quote}).catch(async e=>{busy=false;await refreshCost();throw e;});
  const factory=quickFactory(chainId),sent={from:conn.owner,to:tx.to,data:tx.data,value:tx.value,gas:tx.gas,maxFeePerGas:tx.maxFeePerGas,maxPriorityFeePerGas:tx.maxPriorityFeePerGas};
  note('Confirm '+ethText(cost.totalWei)+' '+chainById(chainId).native+' or less in your wallet: the launch fee plus network gas.');
  const hash=await conn.entry.provider.request({method:'eth_sendTransaction',params:[sent]});
  rememberLast({chainId,hash,name:f.name.trim(),symbol:f.symbol.trim().toUpperCase(),at:Date.now()});
  $('tx-wait').href=chainById(chainId).explorer+'/tx/'+hash;$('waiting').hidden=false;note('Sent. Waiting for the network to confirm…');
  const r=await receipt(conn.entry.provider,hash);
  if(r.status!=='0x1')throw Error('The network refused this launch. Nothing was created; only network gas was spent.');
  const token=launchedToken(r,factory);if(!token)throw Error('The launch confirmed, but its token could not be read. Open the transaction link to see it.');
  rememberLast({chainId,hash,token,name:f.name.trim(),symbol:f.symbol.trim().toUpperCase(),at:Date.now()});
  $('waiting').hidden=true;note('Your token launched.');showDone(token,hash);
 }catch(e){note(launchError(e),true);}
 finally{busy=false;renderQuick();}
}

function mount(){
 if(!$('ideas'))return;
 renderIdeas();
 chainSelect?.addEventListener('change',()=>{renderIdeas();if(pick)openQuick(pick.id);checkTickerSoon();});
 $('use-robinhood')?.addEventListener('click',()=>{if(!chainSelect)return;chainSelect.value='4663';chainSelect.dispatchEvent(new Event('change'));});
 $('open').addEventListener('click',()=>launchCard(pick?.id||'fair'));
 for(const id of ['name','symbol'])$(id).addEventListener('input',()=>{if(id==='symbol'){$('symbol').value=$('symbol').value.toUpperCase();checkTickerSoon();}renderQuick();costSoon();});
 $('image').addEventListener('change',async()=>{const file=$('image').files?.[0];if(!file)return;
  try{image=await thumbnail(file);$('preview').src=image;$('preview').hidden=false;$('image-status').textContent='Image ready.';}
  catch(e){image='';$('preview').hidden=true;$('image-status').textContent=e.message;}renderQuick();costSoon();});
 $('launch').addEventListener('click',()=>void launch());
 $('change').addEventListener('click',()=>$('ideas').scrollIntoView({block:'start'}));
 hub.subscribe(()=>{renderQuick();if(pick)costSoon();checkTickerSoon();});
 void readCreateNativeUSD('ETH').then(v=>{usd=v;renderQuick();});
 const h=/^#quick(?:-([a-z-]+))?$/.exec(location.hash);if(h)openQuick(h[1]||'fair',{scroll:true});
}
mount();
