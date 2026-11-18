import{EXIT_PRESENTATION}from'./qx-exit-presentation.mjs';
// One primary row delegates to the existing market panes; original nodes stay mounted.
export function mountSimpleTokenView({document:doc=globalThis.document,h,onChange=()=>{}}){
 const get=id=>doc.getElementById(id),trades=get('traders'),calls=get('callers'),proof=get('builder'),holders=get('holders'),oldTabs=get('qxt-data-tabs');
 if(!trades||!oldTabs)return;
 const primary={trades:'Trades',holders:'Holders',traders:'Top traders',positions:'Positions'};
 const labels={...primary,news:'Token news',calls:'Calls',proof:'Proof'};
 const sections={trades,holders:trades,traders:trades,positions:trades,news:trades,calls,proof};
 const nav=h('div',{class:'ta-data-nav',role:'tablist','aria-label':'Token data'}),buttons=new Map();
 let current='trades',lastPrimary='trades';
 function select(id,{relay=true}={}){
  if(!sections[id])return;
  current=id;if(Object.hasOwn(primary,id))lastPrimary=id;
  for(const panel of new Set(Object.values(sections)))if(panel)panel.hidden=panel!==sections[id];
  for(const[key,b]of buttons){b.setAttribute('aria-selected',String(key===id));b.tabIndex=key===(Object.hasOwn(primary,id)?id:lastPrimary)?0:-1;}
  sections[id].setAttribute('role',Object.hasOwn(primary,id)?'tabpanel':'region');
  sections[id].setAttribute('aria-labelledby',buttons.get(id)?.id||(id==='calls'?'callers-h':id==='proof'?'builder-h':'traders-h'));
  get('traders-h').textContent=labels[id];trades.dataset.view=id;
  if(sections[id]===trades&&relay)oldTabs.querySelector('[data-pane="'+id+'"]')?.click();
  extra.hidden=sections[id]!==trades;holderMore.hidden=id!=='holders';options.value=Object.hasOwn(primary,id)?'':id;
  onChange(id);
 }
 for(const[id,label]of Object.entries(primary)){
  const b=h('button',{type:'button',role:'tab',id:'ta-tab-'+id,'aria-controls':trades.id},label);
  b.addEventListener('click',()=>select(id));buttons.set(id,b);nav.append(b);
 }
 nav.addEventListener('keydown',e=>{
  const ids=[...buttons.keys()],at=ids.indexOf(Object.hasOwn(primary,current)?current:lastPrimary);
  const i=e.key==='ArrowRight'?(at+1)%ids.length:e.key==='ArrowLeft'?(at+ids.length-1)%ids.length:e.key==='Home'?0:e.key==='End'?ids.length-1:-1;
  if(i<0)return;e.preventDefault();select(ids[i]);buttons.get(ids[i]).focus();
 });
 const metrics=get('qxt-stats');if(metrics){metrics.tabIndex=0;metrics.setAttribute('aria-label','Token metrics');}
 trades.before(nav);oldTabs.classList.add('ta-legacy-tabs');const filters=get('qxt-trade-filters');if(filters)oldTabs.after(filters);
 const extra=h('details',{class:'ta-data-more'},h('summary',{},'Calls, news & proof'));
 const options=h('select',{'aria-label':'More token data'},h('option',{value:''},'Choose a view'));
 for(const[id,label]of[['calls','Calls'],['news','Token news'],['proof','Proof & launch details']])options.append(h('option',{value:id},label));
 options.addEventListener('change',()=>{if(options.value)select(options.value);});extra.append(options);trades.append(extra);
 const holderMore=h('details',{class:'ta-data-more'},h('summary',{},'Holder summary & staking'));if(holders){holders.before(holderMore);holderMore.append(holders);holders.hidden=false;}trades.append(holderMore);
 // Native links such as “Open holders” and “Filter tape” keep the primary row in sync.
 const sync=()=>{const id=oldTabs.querySelector('[data-pane][aria-selected="true"]')?.dataset.pane;if(id&&sections[id]===trades&&id!==current)select(id,{relay:false});};
 const nativeClick=e=>{const id=e.target.closest('[data-pane]')?.dataset.pane;if(id&&sections[id]===trades&&id!==current)select(id,{relay:false});};
 oldTabs.addEventListener('click',nativeClick);const paneObserver=new MutationObserver(sync);paneObserver.observe(oldTabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});
 const fold=(node,label)=>{if(!node)return;const details=h('details',{class:'ta-data-more'},h('summary',{},label));node.before(details);details.append(node);return details;};
 const full=fold(get('qxt-repoproof'),'Full QProof report');fold(get('ta-about'),'Token & launch details');fold(proof?.querySelector('.qxt-workspace-context'),'Data sources & coverage');fold(proof?.querySelector('.qxt-tools'),'Launch tools');
 const alertDetails=h('details',{class:'ta-data-more ta-alert-details'},h('summary',{},EXIT_PRESENTATION.delivery.title));proof?.append(alertDetails);
 const moveAlerts=()=>{const node=get('qxt-trade')?.querySelector(':scope > .ta');if(node&&node.parentElement!==alertDetails)alertDetails.append(node);};
 const observer=new MutationObserver(moveAlerts);if(get('qxt-trade'))observer.observe(get('qxt-trade'),{childList:true});moveAlerts();
 const fullClick=e=>{if(e.target.closest('.ta-proofpop__full')?.tagName==='BUTTON'){select('proof');if(full)full.open=true;}};doc.addEventListener('click',fullClick,true);
 const markets=fold(doc.querySelector('.qxt-feed'),'Your markets');if(markets)proof?.append(markets);
 let chartObserver;
 const foldChartTools=()=>{
  const tools=doc.querySelector('#ta-chart .qxt-chart-tools');if(!tools)return false;
  let details=tools.closest('.ta-chart-more');if(!details){details=fold(tools,'Chart tools & overlays');details.classList.add('ta-chart-more');}
  const legend=doc.querySelector('#ta-chart .qxt-layer-legend'); // ux-pricemc: Price | MC stays on the chart bar
  if(legend&&legend.parentElement!==details)details.insertBefore(legend,tools);
  const complete=!!legend;if(complete)chartObserver?.disconnect();return complete;
 };
 if(!foldChartTools()&&get('ta-chart')){chartObserver=new MutationObserver(foldChartTools);chartObserver.observe(get('ta-chart'),{subtree:true,childList:true});}
 select('trades');return{select,get current(){return current;},dispose(){observer.disconnect();paneObserver.disconnect();chartObserver?.disconnect();oldTabs.removeEventListener('click',nativeClick);doc.removeEventListener('click',fullClick,true);}};
}
