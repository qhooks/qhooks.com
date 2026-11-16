import {installOverlayDismissal} from './qx-overlays.mjs';

// The terminal owns the checks and links. This adapter owns only their existing view.
export function mountProofPopover({document:doc=globalThis.document,window:win=doc.defaultView,chip,desktop,h,readChecks,renderRow,report,reduceMotion=false}){
 const scrim=h('div',{class:'qa-scrim ta-proofscrim',hidden:true});
 const pop=h('div',{class:'ta-proofpop',id:'ta-proofpop',role:'dialog','aria-modal':'true','aria-labelledby':'ta-proofpop-h',hidden:true});
 chip.setAttribute('aria-haspopup','dialog');chip.setAttribute('aria-controls',pop.id);chip.setAttribute('aria-expanded','false');doc.body.append(scrim,pop);
 let shown=false;
 const owner=installOverlayDismissal({document:doc,window:win}).registerCustom(pop,{isOpen:()=>shown,close:()=>{close();return true;},opener:()=>chip});
 function render(){
  const hadFocus=pop.contains(doc.activeElement),notesOpen=pop.querySelector('.ta-pcs-notes')?.open;
  const {list,link}=readChecks(),scored=list.filter(c=>c.st!=='info'),notes=list.filter(c=>c.st==='info');
  const passed=scored.filter(c=>c.st==='clear').length,look=scored.filter(c=>c.st==='danger'||c.st==='caution').length,unchecked=scored.filter(c=>c.st==='unknown').length;
  const x=h('button',{type:'button',class:'qa-btn qa-btn--icon ta-proofpop__x','aria-label':'Close checks'},h('span',{'aria-hidden':'true'},'×'));
  x.addEventListener('click',()=>owner.requestClose('close'));
  const full=link?h('a',{class:'qa-btn qa-btn--secondary qa-btn--sm ta-proofpop__full',href:link},'Full report'):h('button',{type:'button',class:'qa-btn qa-btn--secondary qa-btn--sm ta-proofpop__full'},'Full report');
  if(!link)full.addEventListener('click',()=>{close();report?.scrollIntoView({block:'start',behavior:reduceMotion?'auto':'smooth'});});
  pop.replaceChildren(...[
   desktop.matches?null:h('span',{class:'qa-sheet__grip','aria-hidden':'true'}),
   h('header',{class:'ta-proofpop__head'},h('div',null,h('h2',{id:'ta-proofpop-h'},'Proof checks'),h('p',null,scored.length?passed+' of '+scored.length+' passed'+(look?' · '+look+' to look at':'')+(unchecked?' · '+unchecked+' not checked':''):'Refreshing…')),x),
   scored.length?h('ul',{class:'ta-pcs'},scored.map(renderRow)):null,
   notes.length?h('details',{class:'ta-pcs-notes'},h('summary',null,notes.length+(notes.length===1?' note':' notes')),h('ul',{class:'ta-pcs'},notes.map(renderRow))):null,
   h('footer',{class:'ta-proofpop__foot'},h('a',{class:'ta-proofpop__how',href:'/qproof'},'How QProof works · Check any token'),full)
  ].filter(Boolean));
  if(notesOpen&&pop.querySelector('.ta-pcs-notes'))pop.querySelector('.ta-pcs-notes').open=true;
  if(shown&&hadFocus)x.focus({preventScroll:true});
 }
 function place(){
  if(!desktop.matches){pop.style.removeProperty('top');pop.style.removeProperty('left');return;}
  const rect=chip.getBoundingClientRect(),width=pop.offsetWidth||400;
  pop.style.top=Math.round(rect.bottom+win.scrollY+10)+'px';
  pop.style.left=Math.round(Math.max(16,Math.min(rect.left+win.scrollX,win.scrollX+doc.documentElement.clientWidth-width-16)))+'px';
 }
 function resize(){if(!shown)return;pop.classList.toggle('qa-sheet',!desktop.matches);pop.classList.toggle('is-pop',desktop.matches);scrim.hidden=desktop.matches;place();}
 function open(){if(shown)return;render();shown=true;pop.hidden=false;resize();chip.setAttribute('aria-expanded','true');owner.sync();}
 function close(){if(!shown)return;shown=false;pop.hidden=true;scrim.hidden=true;chip.setAttribute('aria-expanded','false');owner.sync();}
 const toggle=event=>{event.stopPropagation();shown?close():open();};chip.addEventListener('click',toggle);
 win.addEventListener('resize',resize);win.addEventListener('hashchange',close);
 return {open,close,render,element:pop,dispose(){close();owner.dispose();chip.removeEventListener('click',toggle);win.removeEventListener('resize',resize);win.removeEventListener('hashchange',close);pop.remove();scrim.remove();}};
}
