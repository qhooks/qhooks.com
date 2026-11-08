import {elysiumPoolKeyId,elysiumSwapPrice} from './qx-elysium-swaps.mjs';
const ADDRESS=/^0x[0-9a-f]{40}$/,HASH=/^0x[0-9a-f]{64}$/,Q=/^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const short=value=>value.slice(0,8)+'…'+value.slice(-6);
const block=value=>{try{return BigInt(value).toLocaleString('en-US');}catch{return 'Unavailable';}};
const time=value=>Number.isSafeInteger(value)?new Date(value).toISOString().replace('T',' ').slice(0,19)+' UTC':'Time unavailable';
const number=value=>new Intl.NumberFormat('en',{maximumSignificantDigits:7}).format(value);

/** Read-only pool activity; only an explicit pool selection/refresh makes a GET. */
export function mountElysiumActivity(container,{client,document:doc=container?.ownerDocument,onTransaction=()=>{},now=Date.now}={}){
 if(!container||!doc||typeof client?.swaps!=='function')throw TypeError('Elysium activity read client required');
 const make=(tag,text,attrs={})=>{const n=doc.createElement(tag);if(text!==null)n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const root=make('section',null,{class:'ey-activity','aria-label':'Selected pool recent swaps'}),heading=make('h3','Recent swaps'),identity=make('code','',{class:'ey-address'}),status=make('p','',{class:'ey-status',role:'status','aria-live':'polite'}),body=make('div'),controls=make('div',null,{class:'ey-activity-controls'});
 const action=(text,fn)=>{const n=make('button',text,{type:'button',class:'ey-text-button'});n.addEventListener('click',fn);controls.append(n);return n;};
 const latest=action('Refresh latest',()=>{if(!loading)return refresh();}),previous=action('Previous 100 blocks',()=>{if(!loading&&data?.window.nextToBlock)return refresh(data.window.nextToBlock);}),close=action('Close',()=>clear());
 root.append(heading,identity,controls,status,body);container.replaceChildren(root);container.hidden=true;
 let dead=false,subject=null,revision=0,controller=null,timer=null,data=null,assets=new Map(),loading=false,error=null;
 const cancel=()=>{revision++;controller?.abort();controller=null;clearTimeout(timer);loading=false;};
 function clear(){cancel();subject=null;data=null;assets=new Map();error=null;container.hidden=true;body.replaceChildren();}
 function name(address){return BigInt(address)===0n?'HYPE':assets.get(address)?.symbol||short(address);}
 function price(row){return elysiumSwapPrice(row.sqrtPriceX96,{decimals0:assets.get(subject.currency0)?.decimals,decimals1:assets.get(subject.currency1)?.decimals});}
 function drawChart(rows){
  const points=[...new Map([...rows].reverse().map(row=>[row.blockNumber,row])).values()].sort((a,b)=>a.blockNumber-b.blockNumber).map(row=>({row,value:price(row)}));
  if(!points.length||points.some(p=>p.value===null))return null;
  const box=make('figure',null,{class:'ey-activity-chart'}),values=points.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values),first=points[0].row.blockNumber,last=points.at(-1).row.blockNumber;
  const svgNode=(tag,attrs={})=>{const n=doc.createElementNS?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  const svg=svgNode('svg',{viewBox:'0 0 600 140',role:'img','aria-label':'Observed '+name(subject.currency0)+' per '+name(subject.currency1)+' at event blocks. No OHLC or USD values.'});
  const xy=points.map(p=>({x:first===last?300:16+(p.row.blockNumber-first)/(last-first)*568,y:hi===lo?70:16+(hi-p.value)/(hi-lo)*108,...p}));
  if(xy.length>1)svg.append(svgNode('polyline',{points:xy.map(p=>p.x+','+p.y).join(' '),fill:'none',stroke:'currentColor','stroke-width':2}));
  for(const p of xy){const dot=svgNode('circle',{cx:p.x,cy:p.y,r:3});const title=svgNode('title');title.textContent='Block '+block(p.row.blockNumber)+' · '+number(p.value)+' '+name(subject.currency0)+' per '+name(subject.currency1);dot.append(title);svg.append(dot);}
  const axis=make('div',null,{class:'ey-activity-axis'});axis.append(make('span','Block '+block(first)),make('span',first===last?'One event block':'Block '+block(last)));
  box.append(make('figcaption','Last observation · '+number(points.at(-1).value)+' '+name(subject.currency0)+' per '+name(subject.currency1)),svg,axis,make('p','Observed range: '+number(lo)+'–'+number(hi)+' '+name(subject.currency0)+' per '+name(subject.currency1)+'. Last returned Swap price per event block; lines connect observations, not candles.',{class:'ey-note'}));return box;
 }
 function render(){
  if(!subject||dead)return;
  heading.textContent='Recent swaps · '+name(subject.currency0)+' / '+name(subject.currency1);identity.textContent=subject.manager+' · '+subject.poolId;
  const previousFocused=doc.activeElement===previous;latest.setAttribute('aria-disabled',String(loading));previous.setAttribute('aria-disabled',String(loading||!data?.window.nextToBlock));previous.disabled=!data?.window.nextToBlock;close.disabled=false;if(previousFocused&&previous.disabled)latest.focus({preventScroll:true});
  status.dataset.state=error?'error':loading?'loading':'ready';
  status.textContent=loading?'Reading this pool…'+(data?' Previous observation remains below.':''):error?error+(data?' Previous observation retained.':' No swap coverage is available.'):data?'Observed '+time(data.observedAt)+(now()-data.observedAt>=60000?' · Older observation; refresh for latest.':''):'';
  if(!data){body.replaceChildren();return;}
  const focused=Array.from(body.querySelectorAll('button')).find(node=>node===doc.activeElement)?.getAttribute('data-swap-key');
  const context=make('p','Blocks '+block(data.window.fromBlock)+'–'+block(data.window.toBlock)+' · '+data.provider.name,{class:'ey-note'}),nodes=[context];
  if(loading||error)nodes.push(make('span','Previous observation',{class:'ey-stale'}));
  if(!data.coverage.completeWindow)nodes.push(make('p','Partial window · '+data.coverage.returnedCount+' of '+data.coverage.receivedCount+' observed logs returned. '+(data.coverage.limitReached?'Provider log limit reached. ':'')+'See coverage limits below.',{class:'ey-stale'}));
  const chart=drawChart(data.swaps);if(chart)nodes.push(chart);
  else if(data.swaps.length)nodes.push(make('p','Price line unavailable: both currency decimals have not been read at this window’s block. Raw amounts remain below.',{class:'ey-note'}));
  if(!data.swaps.length)nodes.push(make('div',data.coverage.completeWindow?'No swap events in this scanned window.'+(data.window.nextToBlock?' Try the previous blocks.':''):'No readable swap events returned. Coverage is partial; this does not establish no activity.',{class:'ey-empty'}));
  else{
   const list=make('ol',null,{class:'ey-swap-list'});
   for(const row of data.swaps){
    const item=make('li'),top=make('div',null,{class:'ey-swap-top'});top.append(make('strong','Block '+block(row.blockNumber)),make('span','Log '+row.logIndex));
    const amounts=make('p');amounts.append(make('span','Currency 0 ('+name(subject.currency0)+'): '),make('code',row.amount0),make('br'),make('span','Currency 1 ('+name(subject.currency1)+'): '),make('code',row.amount1));
    const receipt=make('button','Receipt →',{type:'button',class:'ey-text-button','aria-label':'Track swap transaction '+row.tx,'data-swap-key':row.blockNumber+':'+row.logIndex+':'+row.tx});receipt.addEventListener('click',()=>onTransaction(row.tx));
    item.append(top,amounts,make('p','Router / caller · '+row.caller,{class:'ey-address'}),receipt);list.append(item);
   }nodes.push(list);
  }
  const c=data.coverage;nodes.push(make('p','Returned '+c.returnedCount+' of '+c.receivedCount+' observed logs · '+c.rejectedCount+' rejected · '+c.duplicateCount+' duplicates · '+c.truncatedCount+' omitted by display limits. Limits: 100 blocks, 1,000 logs, 64 events, 8 event blocks.'+(c.limitReached?' Provider log limit reached; coverage may be incomplete.':''),{class:'ey-note'}));
  nodes.push(make('p','Signed amounts are raw token units from the PoolManager event. Caller may be a router. After-swap hook changes are not included. These reads do not provide wallet buys/sells, holders, USD prices or complete history.',{class:'ey-note'}));
  body.replaceChildren(...nodes);
  if(focused)Array.from(body.querySelectorAll('button')).find(node=>node.getAttribute('data-swap-key')===focused)?.focus({preventScroll:true});
 }
 async function metadata(mine,current){
  if(typeof client.assets!=='function')return;
  try{
   const addresses=[subject.currency0,subject.currency1],result=await client.assets(addresses,{blockNumber:current.block.number,signal:controller.signal});
   if(dead||mine!==revision||data!==current)return;
   if(result.chainId!=='99901'||result.block?.number!==current.block.number||result.block.hash!==current.block.hash||!Array.isArray(result.assets)||new Set(result.assets.map(a=>a.address)).size!==result.assets.length||result.assets.some(a=>!addresses.includes(a.address)||a.chainId!=='99901'||a.blockNumber!==current.block.number))return;
   assets=new Map(result.assets.map(a=>[a.address,{symbol:typeof a.symbol==='string'&&a.symbol.length<=64&&!/[\u0000-\u001f\u007f-\u009f]/.test(a.symbol)?a.symbol.trim():null,decimals:Number.isInteger(a.decimals)&&a.decimals>=0&&a.decimals<=36?a.decimals:null}]));render();
  }catch{/* Optional metadata never changes swap-read coverage. */}
 }
 async function refresh(toBlock){
  if(dead||!subject)return;cancel();const mine=revision,own=controller=new AbortController(),target=subject;loading=true;error=null;render();timer=setTimeout(()=>own.abort(),15000);
  try{
   const value=await client.swaps(target.venueId,target.poolId,{...(toBlock?{toBlock}:{}),signal:own.signal});
   if(dead||mine!==revision||own.signal.aborted)return;
   if(value.chainId!=='99901'||value.venue?.id!==target.venueId||value.venue?.manager!==target.manager||value.pool?.manager!==target.manager||value.pool?.poolId!==target.poolId||value.pool?.identity!==target.identity||!Number.isSafeInteger(value.observedAt)||value.observedAt<0||typeof value.provider?.name!=='string'||!Array.isArray(value.swaps)||!Q.test(value.block?.number)||!value.coverage)throw TypeError('The swap observation did not match this pool.');
   data=value;assets=new Map();loading=false;render();if(value.swaps.length)void metadata(mine,value);
  }catch(e){if(dead||mine!==revision)return;error=own.signal.aborted?'The swap read timed out. Refresh to try again.':String(e?.message||'The swap read is unavailable. Refresh to retry.').slice(0,220);}
  finally{if(!dead&&mine===revision){clearTimeout(timer);loading=false;render();}}
 }
 function open(pool,venue){
  if(dead)return Promise.resolve();
  const manager=venue?.manager?.toLowerCase(),id=pool?.poolId?.toLowerCase();
  if(venue?.chainId!=='99901'||venue.protocol!=='uniswap-v4'||pool?.protocol!=='uniswap-v4'||!ADDRESS.test(manager)||!HASH.test(id)||pool.manager?.toLowerCase()!==manager||elysiumPoolKeyId(pool)!==id)throw TypeError('An exact Elysium v4 PoolKey and registered manager are required.');
  clear();subject={...pool,currency0:pool.currency0.toLowerCase(),currency1:pool.currency1.toLowerCase(),venueId:venue.id,manager,poolId:id,identity:'99901:v4:'+manager+':'+id};container.hidden=false;return refresh();
 }
 return Object.freeze({open,refresh,clear,dispose(){if(dead)return;clear();dead=true;root.remove?.();}});
}
