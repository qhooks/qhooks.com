import{pulseStageStatus}from'./qx-pulse-status.mjs';
import {mountDiscoveryNext} from './qx-discovery-next.mjs';
import {PULSE_COLUMNS,pulseRows,createPulseController} from './qx-pulse-core.mjs';
import {createDiscoveryLivenessView} from './qx-discovery-liveness-view.mjs';
export function mountPulseBoard({host,el,makeLoader,makeRow,updateRow,viewModels,context,visible,storage,onTrending,onModels=()=>{},document:doc=globalThis.document,livenessView}={}){
 if(!doc.querySelector('link[href="/qx-pulse-empty.css"]')){const css=doc.createElement('link');css.rel='stylesheet';css.href='/qx-pulse-empty.css';doc.head.append(css);}
 if(!doc.querySelector('link[href="/qx-pulse.css"]')){const css=doc.createElement('link');css.rel='stylesheet';css.href='/qx-pulse.css';doc.head.append(css);}
 const headerView=livenessView||createDiscoveryLivenessView({document:doc}),ownsHeaderView=!livenessView;
 const media=globalThis.matchMedia('(max-width:1099px)'),parts=new Map();let selected='new',enabled=false,ageTimer=null,pressReleaseTimer=null,lastMinute=0;const focusKeys=new Map();
 try{const saved=storage?.getItem('qhooks:discovery:pulse-stage:v1');if(PULSE_COLUMNS.some(([id])=>id===saved))selected=saved;}catch{}
 const button=(label,attrs={})=>el('button',{type:'button',...attrs},label),root=el('section',{class:'qxfd-pulse','aria-label':'Pulse',hidden:''}),toolbar=el('div',{class:'qxp-toolbar'}),nav=el('div',{class:'qxp-tabs',role:'tablist','aria-label':'Pulse stages'}),pause=button('Pause updates',{'aria-pressed':'false',class:'qxp-pause'}),paused=el('span',{class:'qxp-paused',role:'status'}),grid=el('div',{class:'qxp-grid'});
 const quickHost=el('span',{class:'qxp-quick-host'});toolbar.append(nav,quickHost,pause,paused);root.append(toolbar,grid);host.append(root);
 for(const [id,label]of PULSE_COLUMNS){
  const tab=button(label,{role:'tab',id:'qxp-tab-'+id,'aria-controls':'qxp-'+id,'data-pulse-tab':id}),heading=el('h2',{id:'qxp-heading-'+id},label),count=el('span',{class:'qxp-count'}),fresh=el('span',{class:'qxp-fresh',role:'status'}),retry=button('Retry',{class:'qxp-retry',hidden:''}),body=el('tbody'),table=el('table',{class:'qxfd-table','aria-label':label+' tokens'},body),empty=el('p',{class:'qxp-empty',hidden:''}),column=el('section',{id:'qxp-'+id,class:'qxp-column'},el('header',{class:'qxp-head'},heading,count,fresh,retry),table,empty);
  const message=el('span',{class:'qxp-empty-message'}),switchChain=button('Switch chain',{'aria-label':'Switch chain for '+label}),launch=el('a',{href:'/create'},'Launch a token'),actions=el('span',{class:'qxp-empty-actions'},switchChain,launch);
  empty.classList.add('qxp-empty-view');empty.append(message,actions);
  switchChain.addEventListener('click',()=>{const picker=doc.querySelector('#qxt-discover [aria-label="Filter chain"]')||doc.querySelector('select[aria-label="Filter chain"]');if(!picker)return;picker.focus();try{if(picker.showPicker)picker.showPicker();else picker.click();}catch{picker.focus();}});
  const nextSteps=mountDiscoveryNext({document:doc,onTrending});column.append(nextSteps.element);
  const part={nextSteps,id,tab,column,body,table,count,fresh,retry,empty,message,nodes:new Map(),models:[],skeleton:false};parts.set(id,part);nav.append(tab);grid.append(column);
  tab.addEventListener('click',()=>select(id));retry.addEventListener('click',()=>void controller.refreshColumn(id));
 }
 const controller=createPulseController({makeLoader,visible, onChange:()=>paint()});
 function setHold(reason,on){if(!enabled)return;const loaded=[...parts.values()].some(p=>p.models.length);if(on&&!loaded&&reason!=='manual')return;controller.setHold(reason,on);}
 // Keep a touch/mouse target stable through its synthetic click. Applying a queued poll on pointerup
 // can remove that row before the delegated click reaches the discovery root.
 const cancelPressRelease=()=>{clearTimeout(pressReleaseTimer);pressReleaseTimer=null;};
 const releasePress=(delay=0)=>{cancelPressRelease();pressReleaseTimer=setTimeout(()=>{pressReleaseTimer=null;setHold('press',false);},delay);};
 const events=[['pointerenter',e=>{if(e.pointerType==='mouse')setHold('pointer',true)}],['pointerleave',()=>setHold('pointer',false)],['focusin',()=>setHold('focus',true)],['focusout',e=>{if(!grid.contains(e.relatedTarget))setHold('focus',false)}],['pointerdown',()=>{cancelPressRelease();setHold('press',true)}],['pointerup',()=>releasePress(400)],['click',()=>releasePress()],['pointercancel',()=>{cancelPressRelease();setHold('press',false)}]];
 for(const [name,fn]of events)grid.addEventListener(name,fn);
 pause.addEventListener('click',()=>controller.setHold('manual',pause.getAttribute('aria-pressed')!=='true'));
 nav.addEventListener('keydown',e=>{const ids=PULSE_COLUMNS.map(([id])=>id),at=ids.indexOf(selected),next=e.key==='ArrowRight'?(at+1)%ids.length:e.key==='ArrowLeft'?(at+ids.length-1)%ids.length:e.key==='Home'?0:e.key==='End'?ids.length-1:null;if(next===null)return;e.preventDefault();select(ids[next]);parts.get(ids[next]).tab.focus();});
 function select(id){if(!parts.has(id))return;selected=id;try{storage?.setItem('qhooks:discovery:pulse-stage:v1',id);}catch{}configure();}
 function configure(){if(!enabled)return;controller.configure({...context(),mobile:media.matches,selected});paint();}
 const resize=()=>configure();media.addEventListener('change',resize);
 function paintAge(){
  const snapshot=controller.snapshot();
  for(const [id,p]of parts){
   p.unbindHeader=headerView.bind(p.fresh,{get:()=>{const r=controller.snapshot().records[id];return {row:r.data,failed:!enabled||!visible()||p.column.hidden||!!r.error||!!r.loading||pulseStageStatus(r,{stage:id,count:p.models.length}).refreshing};},paint:(label,live)=>{const r=controller.snapshot().records[id];label.setAttribute('aria-live',live.live?'off':'polite');label.textContent=live.live?live.label:r.loading&&!r.data?'':r.data?'Refreshing':r.error?'Unavailable':'';}});
  }
  const manual=!!snapshot.manual;pause.setAttribute('aria-pressed',String(manual));pause.textContent=manual?'Resume updates':'Pause updates';pause.setAttribute('aria-label',pause.textContent);paused.textContent=snapshot.paused&&!manual?'Updates paused':'';
 }
 function paint(){
  const snapshot=controller.snapshot(),ctx=context(),grouped=pulseRows(snapshot.records,ctx);const models=[];
  for(const [id,p]of parts){
   p.tab.setAttribute('aria-selected',String(id===selected));p.tab.tabIndex=id===selected?0:-1;p.column.hidden=media.matches&&id!==selected;p.column.setAttribute('role',media.matches?'tabpanel':'region');p.column.setAttribute('aria-labelledby',(media.matches?'qxp-tab-':'qxp-heading-')+id);
   const record=snapshot.records[id];p.models=viewModels(grouped[id]);if(!media.matches||id===selected)models.push(...p.models);p.count.textContent=record.data?String(p.models.length):'';
   const status=pulseStageStatus(record,{stage:id,count:p.models.length,chain:ctx.chain,filtered:Object.values(ctx.filters||{}).some(Boolean)}),cold=status.kind==='loading';
   if(cold){if(!p.skeleton){for(const n of p.nodes.values()){n.unbindLiveness?.();n.unbindAvatar?.();}p.nodes.clear();p.body.replaceChildren(...Array.from({length:6},()=>el('tr',{class:'qxp-skeleton','aria-hidden':'true'},el('td',{},el('span',{}),el('span',{}),el('span',{})))));p.skeleton=true;}p.empty.hidden=true;}
   else{
    if(p.skeleton){p.body.replaceChildren();p.skeleton=false;}
    const keep=new Set(p.models.map(vm=>vm.key));for(const [key,node]of p.nodes)if(!keep.has(key)){node.unbindLiveness?.();node.unbindAvatar?.();node.tr.remove();p.nodes.delete(key);}
    if(!p.models.some(vm=>vm.key===focusKeys.get(id)))focusKeys.set(id,p.models[0]?.key);
    p.models.forEach((vm,index)=>{let node=p.nodes.get(vm.key);if(!node){node=makeRow(vm);p.nodes.set(vm.key,node);}if(p.body.children[index]!==node.tr)p.body.insertBefore(node.tr,p.body.children[index]||null);updateRow(node,vm,{refreshing:!!record.loading||!!record.error||!!record.data?.stale||status.refreshing});node.open.tabIndex=(focusKeys.has(id)?focusKeys.get(id)===vm.key:index===0)?0:-1;});
    p.empty.hidden=!status.empty;p.message.textContent=status.message;
   }
   p.nextSteps.update({count:p.models.length,loading:cold,failed:!!record.error,filtered:Object.values(ctx.filters||{}).some(Boolean),kind:'feed',compact:!p.models.length});
   if(status.empty)p.nextSteps.element.hidden=true;
   p.retry.hidden=!status.retry;p.retry.disabled=!!snapshot.manual||!!record.loading;p.retry.title=snapshot.manual?'Resume updates to retry this stage.':'';p.table.setAttribute('aria-busy',String(!!record.loading));
  }
  paintAge();onModels(models);
 }
 function tick(){if(!enabled||!visible())return;paintAge();const minute=Math.floor(Date.now()/60000);if(minute!==lastMinute){lastMinute=minute;paint();}}
 return {
  root,quickHost,configure,select,stage:()=>selected,render:paint,
  setActive(value){enabled=!!value;root.hidden=!enabled;if(enabled){configure();ageTimer??=setInterval(tick,1000);}else{cancelPressRelease();controller.setActive(false);clearInterval(ageTimer);ageTimer=null;}headerView.refresh();},
  refreshNext:()=>controller.refreshNext(),
  pollNext:()=>controller.pollNext(),
  getNode:key=>{for(const p of parts.values())if(p.nodes.has(key))return p.nodes.get(key);return null;},
  getModels:()=>[...parts.values()].filter(p=>!media.matches||p.id===selected).flatMap(p=>p.models),
  focusKey(key,tr){for(const p of parts.values())if(p.nodes.get(key)?.tr===tr){focusKeys.set(p.id,key);for(const [k,n]of p.nodes)n.open.tabIndex=k===key?0:-1;return;}},
  focusRow(delta){const p=[...parts.values()].find(p=>p.column.contains(doc.activeElement))||parts.get(selected),list=[...p.nodes.values()];if(!list.length)return;const at=list.findIndex(n=>n.tr.contains(doc.activeElement)),node=list[Math.max(0,Math.min(list.length-1,at<0?0:at+delta))];node.open.focus({preventScroll:true});node.tr.scrollIntoView({block:'nearest'});},
  dispose(){enabled=false;cancelPressRelease();for(const p of parts.values())p.unbindHeader?.();if(ownsHeaderView)headerView.dispose();controller.dispose();clearInterval(ageTimer);media.removeEventListener('change',resize);for(const [name,fn]of events)grid.removeEventListener(name,fn);for(const p of parts.values())for(const n of p.nodes.values()){n.unbindLiveness?.();n.unbindAvatar?.();}root.remove();},
 };
}
