import {CHART_LAYERS,layerPreferences,layerChart} from './qx-position-core.mjs';
import {markerLabelLayout,markerTapLayout,markerTargetAtPoint} from './qx-marker-labels.mjs';
const short=w=>String(w||'').slice(0,6)+'…'+String(w||'').slice(-4);
export function mountChartLayers({h,chartElement,getOwner,onChange,fetcher=(...a)=>fetch(...a),headersFor=()=>({}),storage=()=>globalThis.localStorage,now=Date.now,viewportWidth=()=>globalThis.innerWidth??chartElement.clientWidth}){
  const legend=h('div',{class:'qxt-layer-legend',role:'group',ariaLabel:'Chart marker layers'}),badges=h('div',{class:'qxt-layer-badges'}),list=h('section',{class:'qxt-layer-list',hidden:true,ariaLabel:'Chart activity'});
  chartElement.before(legend,list);chartElement.append(badges);
  let viewer='',prefs,rows=null,key='',flight=0,lastRead=-Infinity,clusters=[],markers=[],tapTargets=[],chart=null,series=null,bars=[],multiplier=1,returnFocus=null,symbol='',frame=null;
  const badgeNodes=new Map(),labelNodes=new Map(),hitNodes=new Map(),barActivity=new Map();
  function close(){list.hidden=true;list.replaceChildren();returnFocus?.focus();returnFocus=null;}
  function syncViewer(chain){const owner=getOwner(chain)||'guest',next=chain+':'+owner;if(viewer===next)return;
    viewer=next;prefs=layerPreferences(viewer,{storage});clear();
    legend.replaceChildren(...CHART_LAYERS.map(([id,title])=>h('button',{type:'button',class:'qxt-layer-chip','data-layer':id,ariaPressed:String(prefs.enabled[id]),onclick:e=>{prefs.toggle(id);e.currentTarget.setAttribute('aria-pressed',String(prefs.enabled[id]));close();onChange();}},h('span',{class:'qxt-layer-dot','data-layer':id,ariaHidden:'true'}),title)));
  }
  function clear(){rows=null;key='';flight++;lastRead=-Infinity;clusters=[];markers=[];tapTargets=[];barActivity.clear();badges.replaceChildren();badgeNodes.clear();labelNodes.clear();hitNodes.clear();close();}
  const amount=row=>row.quantity!=null&&Number.isFinite(Number(row.quantity))?Number(row.quantity).toLocaleString(undefined,{maximumSignificantDigits:8})+(symbol?' '+symbol:''):'—';
  function open(group,button){returnFocus=button;list.replaceChildren(h('div',{class:'qxt-layer-list-head'},h('strong',{},'Activity · '+new Date(group.time*1000).toLocaleString()),h('button',{type:'button',ariaLabel:'Close chart activity',onclick:close},'×')),
    h('ul',{},...group.rows.map(row=>h('li',{'data-row':row.layer+':'+row.id},h('strong',{class:'qxt-layer-side'},row.title+' · '+(row.side==='call'?'Call':row.side==='buy'?'Buy':'Sell')),h('span',{class:'qxt-layer-wallet'},[row.emoji,row.label||short(row.wallet)].filter(Boolean).join(' ')),h('span',{class:'qxt-layer-amount'},'Amount '+amount(row)),row.text&&row.side==='call'?h('p',{},row.text):'',row.href&&/^\/call\/[a-z0-9%_-]+$/i.test(row.href)?h('a',{href:row.href},'Open call'):'',h('time',{dateTime:new Date(row.at).toISOString()},new Date(row.at).toLocaleTimeString())))));
    list.hidden=false;list.querySelector('button').focus();
  }
  list.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
  function openBar(time,button){const group=barActivity.get(time);if(group)open(group,button||legend.querySelector('button'));}
  function openMarker(marker,button){openBar(marker.time,button||legend.querySelectorAll('button')[CHART_LAYERS.findIndex(([id])=>id===marker.layer)]);}
  function markerClick(event){
    // Canvas clicks need not identify a hovered object. Time selects the entire
    // activity bar, including events represented by its +n badge.
    const time=typeof event.time==='number'?event.time:markers.find(m=>m.id===event.hoveredObjectId)?.time??markerTargetAtPoint(tapTargets,event.point)?.time;
    openBar(time);
  }
  function hitClick(event,button){
    const rect=chartElement.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top};
    // Adjacent 32px targets can overlap when zoomed out; use the tap's actual x
    // to choose its nearest bar instead of whichever button is highest in DOM.
    const keyboard=event.detail===0&&event.clientX===0&&event.clientY===0,target=keyboard?null:markerTargetAtPoint(tapTargets,point);
    openBar(target?.time??button.layerTarget.time,target?hitNodes.get(target.id)||button:button);
  }
  function schedulePlace(){if(frame!=null||typeof requestAnimationFrame!=='function')return;frame=requestAnimationFrame(()=>{frame=null;place();});}
  function placeLabels(width,height){
    const candidates=[],visible=new Set(),groups=new Map(),plotWidth=chart.timeScale().width?.()??width,spacing=chart.timeScale().options?.().barSpacing||12;
    for(const marker of markers){const group=groups.get(marker.group)||[];group.push(marker);groups.set(marker.group,group);}
    for(const marker of markers){
      if(viewportWidth()<768&&marker.layer!=='you')continue;
      const text=marker.text;if(!text)continue;
      const x=chart.timeScale().timeToCoordinate(marker.time),bar=bars.find(b=>b.time===marker.time);if(x==null||x<0||x>plotWidth||!bar)continue;
      const below=marker.position==='belowBar',anchor=series.priceToCoordinate((below?bar.low:bar.high)*multiplier);if(anchor==null)continue;
      let node=labelNodes.get(marker.id);
      if(!node){node=h('button',{type:'button',class:'qxt-layer-label','data-layer':marker.layer,'data-marker':marker.id,onclick:()=>openMarker(node.layerMarker,node)});labelNodes.set(marker.id,node);badges.append(node);}
      node.layerMarker=marker;node.textContent=text;node.style.color=marker.color;node.hidden=false;
      const size=node.getBoundingClientRect(),group=groups.get(marker.group),index=group.indexOf(marker);
      // Keep the label beyond the whole native shape stack, outside this bar's
      // high/low. The chart paints only shapes, so it cannot also paint text.
      const band=8+group.length*(Math.ceil(Math.min(30,Math.max(12,spacing))*.7)+3),offset=band+index*(size.height+3);
      const left=x-size.width/2,top=below?anchor+offset:anchor-offset-size.height;
      candidates.push({id:marker.id,layer:marker.layer,time:marker.time,left,top,right:left+size.width,bottom:top+size.height});
    }
    for(const box of markerLabelLayout(candidates,{width:plotWidth,height})){const node=labelNodes.get(box.id);node.style.left=box.left+'px';node.style.top=box.top+'px';visible.add(box.id);}
    for(const [id,node]of labelNodes)if(!visible.has(id)){node.remove();labelNodes.delete(id);}
  }
  function place(){if(!chart||!series)return;const height=chartElement.clientHeight,width=chartElement.clientWidth,visible=new Set();
    placeLabels(width,height);
    tapTargets=markerTapLayout(markers,bars,{xFor:time=>chart.timeScale().timeToCoordinate(time),yFor:price=>series.priceToCoordinate(price*multiplier),width:chart.timeScale().width?.()??width,height:height-(chart.timeScale().height?.()||0),spacing:chart.timeScale().options?.().barSpacing||12});
    const hits=new Set();
    if(viewportWidth()<768)for(const target of tapTargets){
      let button=hitNodes.get(target.id);
      if(!button){button=h('button',{type:'button',class:'qxt-layer-hit',onclick:event=>hitClick(event,button)});hitNodes.set(target.id,button);badges.append(button);}
      button.layerTarget=target;button.setAttribute('data-time',String(target.time));button.setAttribute('data-side',target.position);button.setAttribute('aria-label','Open '+barActivity.get(target.time).rows.length+' chart events');
      button.style.left=target.left+'px';button.style.top=target.top+'px';button.style.width=(target.right-target.left)+'px';button.style.height=(target.bottom-target.top)+'px';hits.add(target.id);
    }
    for(const [id,button]of hitNodes)if(!hits.has(id)){button.remove();hitNodes.delete(id);}
    for(const group of clusters){const x=chart.timeScale().timeToCoordinate(group.time),bar=bars.find(b=>b.time===group.time);if(x==null||!bar||x<0||x>width-50)continue;
      const y=series.priceToCoordinate((group.position==='belowBar'?bar.low:bar.high)*multiplier);if(y==null)continue;
      let button=badgeNodes.get(group.id);
      if(!button){button=h('button',{type:'button',class:'qxt-layer-more',onclick:()=>openBar(button.layerGroup.time,button)});badgeNodes.set(group.id,button);badges.append(button);}
      button.layerGroup=group;button.textContent='+'+group.hidden;button.setAttribute('aria-label',group.hidden+' more chart events');visible.add(group.id);
      button.setAttribute('data-time',String(group.time));
      button.style.left=Math.max(4,Math.min(width-90,x+12))+'px';button.style.top=Math.max(4,Math.min(height-36,y+(group.position==='belowBar'?44:-70)))+'px';
    }
    for(const [id,button]of badgeNodes)if(!visible.has(id)){button.remove();badgeNodes.delete(id);}
  }
  async function refresh({selection,from,to,force=false}){
    if(!selection?.token)return;syncViewer(selection.chainId);
    const owner=getOwner(selection.chainId),headers=owner?headersFor(selection.chainId,owner):{};
    let account=owner&&new Headers(headers).has('authorization')?(selection.chainId==='solana'?'solana:'+owner:owner):null;
    const next=JSON.stringify([selection.chainId,selection.controller||selection.token,selection.kind,from,to,account]);
    if(next!==key){rows=null;key=next;lastRead=-Infinity;flight++;}
    if(!force&&now()-lastRead<8000)return;lastRead=now();const turn=++flight;
    const q=new URLSearchParams({from:String(from),to:String(to)});if(selection.kind==='external')q.set('kind','token');if(account)q.set('wallet',account);
    try{
      const path='/api/terminal/layers/'+selection.chainId+'/'+(selection.controller||selection.token);
      let r=await fetcher(path+'?'+q,{headers:account?headers:{},cache:'no-store',signal:AbortSignal.timeout(8000)});
      if((r.status===401||r.status===403)&&turn===flight&&next===key){q.delete('wallet');account=null;r=await fetcher(path+'?'+q,{headers:{},cache:'no-store',signal:AbortSignal.timeout(8000)});}
      if(turn!==flight||next!==key)return;
      if(!r.ok){if(r.status===401||r.status===403){rows=null;onChange();}return;}
      const body=await r.json();if(turn!==flight||next!==key||body.wallet!==account||body.chainId!==String(selection.chainId)||body.token!==selection.token)return;
      rows=body.layers;onChange();
    }catch{} // Keep the current window during a transient read failure.
  }
  function render({selection,data,position,chart:activeChart,series:activeSeries,bars:activeBars,tf,k=1,tracked={}}){
    syncViewer(selection.chainId);
    if(chart!==activeChart){chart?.unsubscribeClick?.(markerClick);chart?.timeScale().unsubscribeVisibleLogicalRangeChange?.(schedulePlace);chart=activeChart;chart.subscribeClick?.(markerClick);chart.timeScale().subscribeVisibleLogicalRangeChange?.(schedulePlace);}
    series=activeSeries;bars=activeBars;multiplier=k;symbol=data.meta.symbol||'';
    const owner=getOwner(selection.chainId),same=(a,b)=>selection.chainId==='solana'?a===b:String(a||'').toLowerCase()===String(b||'').toLowerCase();
    const local={you:(position?.markers||[]).map(r=>({...r,layer:'you',wallet:owner,label:'You'})),following:[],smart:[],calls:[],dev:[]};
    for(const t of data.trades||[]){const layer=same(t.trader,data.meta.owner)?'dev':tracked[t.trader]?'following':null;if(!layer||same(t.trader,owner))continue;
      local[layer].push({id:t.tx+':'+t.idx,tx:t.tx,wallet:t.trader,at:t.ts*1000,side:t.buy?'buy':'sell',quantity:t.token,label:tracked[t.trader]||short(t.trader)});
    }
    const merged={};for(const [id]of CHART_LAYERS){const seen=new Set();merged[id]=[...(rows?.[id]||[]),...local[id]].filter(row=>{const id=[row.tx||row.id,row.wallet,row.side].join(':');if(seen.has(id))return false;seen.add(id);return true;}).sort((a,b)=>b.at-a.at).slice(0,200);}
    const result=layerChart(merged,bars,tf,prefs.enabled);clusters=result.clusters;markers=result.markers;barActivity.clear();
    for(const group of result.groups){const bar=barActivity.get(group.time)||{time:group.time,rows:[]};bar.rows.push(...group.rows);barActivity.set(group.time,bar);}
    for(const bar of barActivity.values())bar.rows.sort((a,b)=>a.at-b.at||String(a.id).localeCompare(String(b.id)));
    place();schedulePlace();
    for(const [id]of CHART_LAYERS)chartElement.dataset[id+'Markers']=String(result.markers.filter(m=>m.id.includes(':'+id+':')).length);
    chartElement.dataset.markerShapes=String(result.markers.length);chartElement.dataset.markerOverflow=String(clusters.length);
    return {...result,markers:result.markers.map(marker=>({...marker,text:''})),youEnabled:prefs.enabled.you};
  }
  // Resize and zoom reposition +n buttons using the real series coordinates.
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(place):null;resize?.observe(chartElement);
  chartElement.addEventListener('pointerup',schedulePlace);chartElement.addEventListener('wheel',schedulePlace,{passive:true});
  chartElement.addEventListener('pointermove',event=>{if(event.buttons||event.pointerType==='touch')schedulePlace();},{passive:true});
  globalThis.addEventListener?.('resize',schedulePlace);
  globalThis.document?.fonts?.ready?.then(schedulePlace);
  return {refresh,render,place,clear,get enabled(){return prefs?.enabled;},element:legend};
}
