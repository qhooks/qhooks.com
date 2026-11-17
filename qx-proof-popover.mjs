import {installOverlayDismissal} from './qx-overlays.mjs';
import {renderQProofSummary,readQProofPresentation,ensureQProofStyles} from './qproof-view.mjs';

// Display only. The server supplies every verdict and its reason.
export function mountProofPopover({document:doc=globalThis.document,window:win=doc.defaultView,chip,desktop,h,readChecks,renderRow,report,refresh,reduceMotion=false}){
 ensureQProofStyles(doc);
 const scrim=h('div',{class:'qa-scrim ta-proofscrim',hidden:true});
 const pop=h('div',{class:'ta-proofpop',id:'ta-proofpop',role:'dialog','aria-modal':'true','aria-labelledby':'ta-proofpop-h',hidden:true});
 chip.setAttribute('aria-haspopup','dialog');chip.setAttribute('aria-controls',pop.id);chip.setAttribute('aria-expanded','false');doc.body.append(scrim,pop);
 let shown=false;
 const owner=installOverlayDismissal({document:doc,window:win}).registerCustom(pop,{isOpen:()=>shown,close:()=>{close();return true;},opener:()=>chip});
 function section(id,title,rows,collapsed=false){
  if(!rows.length)return null;const list=h('ul',{class:'ta-pcs'},rows.map(renderRow));
  return collapsed?h('details',{class:'ta-proof-section','data-proof-section':id},h('summary',null,title+' ('+rows.length+')'),list):h('section',{class:'ta-proof-section','aria-label':title},h('h3',null,title+' ('+rows.length+')'),list);
 }
 function render(){
  const hadFocus=pop.contains(doc.activeElement),action=doc.activeElement?.dataset?.proofAction,opened=new Set([...pop.querySelectorAll('[data-proof-section][open]')].map(n=>n.dataset.proofSection));
  const {list=[],link='',legend='',snapshot=null}=readChecks(),p=readQProofPresentation(snapshot),summary=renderQProofSummary(h,p,{onRefresh:refresh?()=>refresh():null});
  const x=h('button',{type:'button',class:'qa-btn ta-proofpop__x','aria-label':'Close checks'},h('span',{'aria-hidden':'true'},'×'));x.addEventListener('click',()=>owner.requestClose('close'));
  const full=link?h('a',{class:'qa-btn qa-btn--secondary qa-btn--sm ta-proofpop__full',href:link},'Full report'):h('button',{type:'button',class:'qa-btn qa-btn--secondary qa-btn--sm ta-proofpop__full'},'Full report');
  if(!link)full.addEventListener('click',()=>{close();report?.scrollIntoView({block:'start',behavior:reduceMotion?'auto':'smooth'});});
  pop.replaceChildren(...[h('header',{class:'ta-proofpop__head'},h('h2',{id:'ta-proofpop-h'},'QProof'),x),summary.bar,summary.strip,summary.fee,
   section('danger','Red flags',list.filter(c=>c.st==='danger')),section('watch','Watch',list.filter(c=>c.st==='caution'||c.st==='watch')),
   section('passed','Passed',list.filter(c=>c.st==='clear'),true),section('not-checked','Not checked',list.filter(c=>c.st==='unknown'||c.st==='incomplete'),true),section('notes','Notes',list.filter(c=>c.st==='info'),true),
   legend?h('details',{class:'ta-proof-method','data-proof-section':'method'},h('summary',null,'How QProof works'),h('p',null,legend)):null,
   h('footer',{class:'ta-proofpop__foot'},h('a',{class:'ta-proofpop__how',href:'/qproof'},'How QProof works'),full)].filter(Boolean));
  for(const n of pop.querySelectorAll('[data-proof-section]'))if(opened.has(n.dataset.proofSection))n.open=true;
  if(shown&&hadFocus)(action==='refresh'?pop.querySelector('[data-proof-action="refresh"]'):x)?.focus({preventScroll:true});
 }
 function resize(){if(!shown)return;pop.classList.toggle('qa-sheet',!desktop.matches);pop.classList.toggle('is-pop',desktop.matches);scrim.hidden=false;pop.style.removeProperty('left');pop.style.removeProperty('top');}
 function open(){if(shown)return;render();shown=true;pop.hidden=false;resize();chip.setAttribute('aria-expanded','true');owner.sync();}
 function close(){if(!shown)return;shown=false;pop.hidden=true;scrim.hidden=true;chip.setAttribute('aria-expanded','false');owner.sync();}
 const toggle=event=>{event.stopPropagation();shown?close():open();};chip.addEventListener('click',toggle);win.addEventListener('resize',resize);win.addEventListener('hashchange',close);
 return{open,close,render,element:pop,dispose(){close();owner.dispose();chip.removeEventListener('click',toggle);win.removeEventListener('resize',resize);win.removeEventListener('hashchange',close);pop.remove();scrim.remove();}};
}
