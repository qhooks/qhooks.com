import {installOverlayDismissal} from './qx-overlays.mjs';
import {renderQProofSummary,readQProofPresentation,normalizeQProofChecks,ensureQProofStyles,qproofReadParams,safeQProofUrl,renderQProofHolders,renderQProofHooks,renderQProofAutonomo} from './qproof-view.mjs';

// Display only. The server supplies every verdict and its reason.
export function mountProofPopover({document:doc=globalThis.document,window:win=doc.defaultView,chip,desktop,h,readChecks,renderRow,report,refresh,reduceMotion=false}){
 ensureQProofStyles(doc);
 const scrim=h('div',{class:'qa-scrim ta-proofscrim',hidden:true});
 const pop=h('div',{class:'ta-proofpop',id:'ta-proofpop',role:'dialog','aria-modal':'true','aria-labelledby':'ta-proofpop-h',hidden:true});
 chip.setAttribute('aria-haspopup','dialog');chip.setAttribute('aria-controls',pop.id);chip.setAttribute('aria-expanded','false');doc.body.append(scrim,pop);
 let shown=false,disposed=false,generation=0,renderedOwner=null,flight=null;
 const owner=installOverlayDismissal({document:doc,window:win}).registerCustom(pop,{isOpen:()=>shown,close:()=>{close();return true;},opener:()=>chip});
 const identity=state=>{
  if(typeof state.ownerKey==='string'&&state.ownerKey)return state.ownerKey;
  const subject=state.snapshot?.subject??state.snapshot?.report?.subject;
  return subject?.address?String(subject.chainId??subject.chain??'')+':'+subject.address:String(state.link||'');
 };
 function section(id,title,rows,collapsed=false){
  if(!rows.length)return null;const list=h('ul',{class:'ta-pcs'},rows.map(renderRow));
  return collapsed?h('details',{class:'ta-proof-section','data-proof-section':id},h('summary',null,title+' ('+rows.length+')'),list):h('section',{class:'ta-proof-section','aria-label':title},h('h3',null,title+' ('+rows.length+')'),list);
 }
 // One Holders section: the native holder ranking when the report has it, else the server's top 5 rows.
 // Insider, sniper and bundle shares ride on whichever is shown.
 function holderSection(p){
  const signals=[['Insiders',p.keyNumbers.insiderPct],['Snipers',p.keyNumbers.sniperPct],['Bundled',p.keyNumbers.bundlePct]];
  const percentage=n=>n===null?'Not reported':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)+'%';
  const signalLine=()=>signals.some(([,n])=>n!==null)?h('p',{class:'qp-holder-signals'},signals.map(([label,n])=>h('span',null,label+' '+percentage(n)))):null;
  const ranking=renderQProofHolders(h,p,{extra:signalLine});if(ranking)return ranking;
  if(!p.holders.length&&!signals.some(([,n])=>n!==null))return null;
  const rows=p.holders.slice(0,5).map(row=>h('li',{class:'qp-holder'},
   h('div',null,row.url?h('a',{class:'qp-holder__address',href:row.url,title:row.address},row.address.slice(0,6)+'…'+row.address.slice(-4)):h('span',{class:'qp-holder__address',title:row.address},row.address.slice(0,6)+'…'+row.address.slice(-4)),row.label?h('span',{class:'qp-holder__label'},row.label):null),
   h('b',null,percentage(row.pct))));
  return h('section',{class:'ta-proof-section qp-holders qp-holders--reported','aria-label':'Holders'},h('h3',null,'Holders'),rows.length?h('ul',{class:'qp-holder-list'},rows):null,signalLine());
 }
 function requestRefresh(){
  if(disposed||!refresh)return Promise.resolve(false);
  const key=identity(readChecks());if(shown&&key!==renderedOwner)render();if(flight?.key===key){flight.generation=generation;return flight.promise;}
  const token={key,generation,promise:null};flight=token;
  // The existing reader owns transport, cached_only mode, abort and subject checks.
  try{token.promise=Promise.resolve(refresh());}catch{token.promise=Promise.resolve(false);}
  token.promise=token.promise.catch(()=>false).finally(()=>{
   if(flight===token)flight=null;
   if(!disposed&&shown&&token.generation===generation&&identity(readChecks())===key)render();
  });
  if(shown)render();return token.promise;
 }
 function render(){
  if(disposed)return;
  const state=readChecks(),key=identity(state),sameOwner=key===renderedOwner;
  if(!sameOwner){renderedOwner=key;generation++;}
  const hadFocus=pop.contains(doc.activeElement),action=doc.activeElement?.dataset?.proofAction,opened=new Set(sameOwner?[...pop.querySelectorAll('[data-proof-section][open]')].map(n=>n.dataset.proofSection):[]);
  const {list=[],link='',legend='',snapshot=null}=state,p=readQProofPresentation(snapshot);
  const fallback=p.checks.length?p.checks:[...p.verdict.flags,...p.notChecked.map(value=>{const c=value&&typeof value==='object'?value:{};return{...c,level:'incomplete',title:c.title||'Not checked',why:c.reason};})];
  const rows=normalizeQProofChecks(list.length?list:fallback),summary=renderQProofSummary(h,p,{onRefresh:refresh?requestRefresh:null,refreshing:flight?.key===key});
  const x=h('button',{type:'button',class:'qa-btn ta-proofpop__x','aria-label':'Close checks'},h('span',{'aria-hidden':'true'},'×'));x.addEventListener('click',()=>owner.requestClose('close'));
  const href=safeQProofUrl(link||p.links.report),full=href?h('a',{class:'qa-btn qa-btn--secondary qa-btn--sm ta-proofpop__full',href},'Full report'):h('button',{type:'button',class:'qa-btn qa-btn--secondary qa-btn--sm ta-proofpop__full'},'Full report');
  if(!href)full.addEventListener('click',()=>{close();report?.scrollIntoView({block:'start',behavior:reduceMotion?'auto':'smooth'});});
  pop.replaceChildren(...[h('header',{class:'ta-proofpop__head'},h('h2',{id:'ta-proofpop-h'},'QProof'),x),summary.bar,summary.strip,summary.fee,
   section('danger','Red flags',rows.filter(c=>c.level==='danger')),section('watch','Watch',rows.filter(c=>c.level==='watch')),
   renderQProofHooks(h,p),holderSection(p),renderQProofAutonomo(h,p),
   section('passed','Passed',rows.filter(c=>c.level==='clear'),true),section('not-checked','Not checked',rows.filter(c=>c.level==='incomplete'),true),section('notes','Notes',rows.filter(c=>c.level==='info'),true),
   legend?h('details',{class:'ta-proof-method','data-proof-section':'method'},h('summary',null,'How QProof works'),h('p',null,legend)):null,
   h('footer',{class:'ta-proofpop__foot'},h('a',{class:'ta-proofpop__how',href:'/qproof'},'How QProof works'),full)].filter(Boolean));
  for(const n of pop.querySelectorAll('[data-proof-section]'))if(opened.has(n.dataset.proofSection))n.open=true;
  if(shown&&hadFocus)(action==='refresh'?pop.querySelector('[data-proof-action="refresh"]'):x)?.focus({preventScroll:true});
 }
 function resize(){if(!shown)return;pop.classList.toggle('qa-sheet',!desktop.matches);pop.classList.toggle('is-pop',desktop.matches);scrim.hidden=false;pop.style.removeProperty('left');pop.style.removeProperty('top');}
 function open(){if(disposed||shown)return;render();shown=true;pop.hidden=false;resize();chip.setAttribute('aria-expanded','true');owner.sync();
  autonomoOnce(readChecks().snapshot);
  if(refresh&&!qproofReadParams(doc.location?.search??win.location?.search??'').cached_only&&readQProofPresentation(readChecks().snapshot).freshness.stale===true)void requestRefresh();
 }
 // AUTONOMO: the first sheet open of a stored report with no partner section asks the server once;
 // the section shows on the next view. Fire-and-forget; never blocks or changes the sheet.
 const askedAutonomo=new Set();
 function autonomoOnce(snap){
  try{
   const sub=snap?.subject??snap?.report?.subject,chain=sub?.chain,address=String(sub?.address||'').toLowerCase();
   if(snap?.autonomoOpen!==true||snap?.autonomo||!['robinhood','base'].includes(chain)||!/^0x[0-9a-f]{40}$/.test(address))return;
   const key=chain+':'+address;if(askedAutonomo.has(key))return;askedAutonomo.add(key);
   void win.fetch?.('/api/qproof/autonomo/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chain,address}),credentials:'same-origin'}).catch(()=>{});
  }catch{}
 }
 function close(){if(!shown)return;shown=false;generation++;pop.hidden=true;scrim.hidden=true;chip.setAttribute('aria-expanded','false');owner.sync();}
 const toggle=event=>{event.stopPropagation();shown?close():open();};chip.addEventListener('click',toggle);win.addEventListener('resize',resize);win.addEventListener('hashchange',close);
 return{open,close,render,element:pop,dispose(){if(disposed)return;close();disposed=true;generation++;owner.dispose();chip.removeEventListener('click',toggle);win.removeEventListener('resize',resize);win.removeEventListener('hashchange',close);pop.remove();scrim.remove();}};
}
