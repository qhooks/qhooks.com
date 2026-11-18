import {normalizeGlossaryContext,GLOSSARY_CONTEXT_ATTRIBUTE,GLOSSARY_CONTEXT_EVENT} from './qx-glossary-context.mjs';
import {QPROOF_CHECK_COUNT_MEANING} from './qproof-check-meanings.mjs';
// Canonical product-term copy. Per-check QProof meanings remain with its data owner.
export const GLOSSARY=Object.freeze([
 {id:'hooks',label:'Hooks',aliases:['Hooks'],href:'/hooks',text:'Code attached to a supported Uniswap v4 pool that sets extra trading rules, such as fees or launch controls. Each pool uses only the rules enabled for it.'},
 {id:'lab',label:'Lab',aliases:['Lab'],href:'/lab',text:'A builder workspace for supported hook rules and modules. Configure a template, review its output, then use the wallet flow to deploy.'},
 {id:'qproof',label:'QProof',aliases:['QProof'],href:'/qproof',text:'Dated checks from available on-chain and provider evidence. Read the findings, missing checks and observation time. A report is not an audit or a promise that a token is safe to buy or sell.'},
 {id:'qwallets',label:'qWallets',aliases:['qWallets','QWallet'],href:'/qwallets',text:'Wallet contracts whose protected actions require your EVM wallet plus a separate post-quantum key. Keep the key backup. Protection applies only to the actions supported by that contract.'},
 {id:'qlocks',label:'QLocks',aliases:['QLocks'],href:'/qlocks',text:'Tokens held in a contract with a public beneficiary, cliff and release schedule. Check the actual lock and any required notice. An unlocked wallet balance can still be sold.'},
 {id:'qcaster',label:'QCaster',aliases:['QCaster'],href:'/qcaster',text:'QHooks’ AI helper for questions, token-launch ideas and draft configurations. Its draft still needs your review. It does not launch or sign for you.'},
 {"id": "storm-fee", "label": "Storm fee", "aliases": ["Storm fee", "Stormfee"], "href": "/hooks#block-stormFee", "text": "Fees rise when the price swings hard, then fade back down. By default the pool checks its price every 5 minutes, raises the fee with the size of the move up to 3%, and lets it fade back to the floor over an hour."},
 {"id": "sandwich-guard", "label": "Sandwich guard", "aliases": ["Sandwich guard", "Sandwichguard"], "href": "/hooks#block-sandwich", "text": "A trade that pushes the price back toward where the block opened pays for that move, up to 8% by default. Sandwiching someone else's trade loses money."},
 {"id": "standard-start", "label": "Standard start", "aliases": ["Standard start"], "href": "/create", "text": "The default and lowest starting market cap for a launch on that chain. Picking $20K, $50K or a custom start makes trading begin at a higher price."},
 {id:'proof-count',label:'Check counts',aliases:['1/13 score','1/13','All returned checks'],href:'/qproof',text:QPROOF_CHECK_COUNT_MEANING},
].map(term=>Object.freeze({...term,aliases:Object.freeze(term.aliases)})));
export const glossaryTerm=id=>GLOSSARY.find(term=>term.id===id)||null;
export const APPROVED_FEE_TERMS=Object.freeze(['storm-fee','sandwich-guard','standard-start']);
const percent=bps=>Number(bps/100).toLocaleString('en-US',{maximumFractionDigits:2})+'%';
const duration=seconds=>seconds===3600?'an hour':seconds%3600===0?seconds/3600+' hours':seconds%60===0?seconds/60+(seconds===60?' minute':' minutes'):seconds+(seconds===1?' second':' seconds');
const usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
// Generic defaults are the exact approved copy. Configured variants use only
// producer-supplied facts from this scope, never another pool or example data.
export function glossaryText(id,context=null){
 const term=glossaryTerm(id);if(!term)return null;
 const normalized=normalizeGlossaryContext(context),declared=context&&typeof context==='object'?Object.getOwnPropertyDescriptor(context,'kind')?.value:null;
 const ctx=normalized||(['pool','draft'].includes(declared)?{kind:declared,storm:null,sandwich:null,start:null}:null);
 if(!ctx||ctx.kind==='catalog'||!APPROVED_FEE_TERMS.includes(id))return term.text;
 const where=ctx.kind==='draft'?'this draft':'this pool';
 if(id==='storm-fee'){
  const v=ctx.storm;if(!v)return term.text.slice(0,term.text.indexOf('. ')+1)+' Settings for '+where+' are not reported.';
  if(v.enabled===false)return 'Storm fee is off for '+where+'.';
  if(v.enabled!==true||[v.ceilingBps,v.intervalSeconds,v.decaySeconds].some(x=>x===null)){
   const facts=[v.floorBps!==null?'Floor: '+percent(v.floorBps)+'.':null,v.ceilingBps!==null?'Maximum: '+percent(v.ceilingBps)+'.':null,v.intervalSeconds!==null?'Price checks: every '+(v.intervalSeconds===3600?'hour':duration(v.intervalSeconds))+'.':null,v.decaySeconds!==null?'Fade: '+duration(v.decaySeconds)+'.':null].filter(Boolean);
   return term.text.slice(0,term.text.indexOf('. ')+1)+' '+(facts.length?facts.join(' ')+' Other settings are not reported.':'Settings for '+where+' are not reported.');
  }
  if(v.floorBps===0&&v.ceilingBps===300&&v.multiplierBpsPerPricePercent===50&&v.intervalSeconds===300&&v.decaySeconds===3600)return term.text;
  let text=term.text.replace('By default the pool','With these settings the pool').replace('every 5 minutes','every '+(v.intervalSeconds===3600?'hour':duration(v.intervalSeconds))).replace('up to 3%','up to '+percent(v.ceilingBps)).replace('over an hour','over '+duration(v.decaySeconds));
  if(v.floorBps!==null)text=text.replace('back to the floor','back to the '+percent(v.floorBps)+' floor');
  if(v.multiplierBpsPerPricePercent!==null)text=text.replace('raises the fee with the size of the move','raises the fee by '+percent(v.multiplierBpsPerPricePercent)+' for each 1% price move');
  return text;
 }
 if(id==='sandwich-guard'){
  const v=ctx.sandwich;if(!v)return 'Sandwich guard settings for '+where+' are not reported.';
  if(v.enabled===false)return 'Sandwich guard is off for '+where+'.';
  if(v.enabled!==true||v.maxBps===null)return 'Sandwich guard settings for '+where+' are not reported.';
  return v.maxBps===800?term.text:term.text.replace('up to 8% by default','up to '+percent(v.maxBps)+' with these settings');
 }
 const v=ctx.start;if(!v)return term.text.slice(0,term.text.indexOf('. ')+1)+' The selected start for '+where+' is not available.';
 if(v.steps===0)return term.text;
 const prefix=term.text.slice(0,term.text.indexOf('. ')+1);
 if(v.actualUsd===null)return prefix+' The selected start for '+where+' is not available.';
 return prefix+' With these settings, trading starts at approximately '+usd(v.actualUsd)+' market cap.'+(v.standardUsd===null?'':' The standard start for this chain is approximately '+usd(v.standardUsd)+'.');
}

const escape=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const names=GLOSSARY.flatMap(term=>term.aliases.map(name=>({name,term}))).sort((a,b)=>b.name.length-a.name.length);
const pattern=new RegExp('(?<![A-Za-z0-9_])('+names.map(x=>escape(x.name)).join('|')+')(?![A-Za-z0-9_])','gi');
export function glossaryMatches(text,{proofContext=false}={}){
 const value=String(text),matches=[...value.matchAll(pattern)].map(match=>({start:match.index,end:match.index+match[0].length,label:match[0],term:names.find(x=>x.name.toLowerCase()===match[0].toLowerCase()).term}));
 if(proofContext)for(const match of value.matchAll(/(?<![A-Za-z0-9_/.])\d{1,4}\s*\/\s*\d{1,4}(?![A-Za-z0-9_/.])/g))if(!matches.some(x=>match.index<x.end&&match.index+match[0].length>x.start))matches.push({start:match.index,end:match.index+match[0].length,label:match[0],term:glossaryTerm('proof-count')});
 return matches.sort((a,b)=>a.start-b.start);
}
const INSTALLED=Symbol.for('qhooks.glossary.v1');
const OMIT='script,style,pre,code,svg,canvas,textarea,input,select,option,[contenteditable],dialog:not(#qa-menu):not([data-glossary-allow]),[role="dialog"]:not(#qa-menu):not(.ta-proofpop):not([data-glossary-allow]),.qa-tabbar,.qa-nav-links,[data-glossary-ignore],[data-user-content],[data-qx-user-content],.qx-glossary-pop,.qx-glossary-help,.qa-post-body,.tc-post-body,.qxt-feed,.qxt-watchlist,.ta-token-list,.ta-token-name,.ta-token-symbol,#qxt-symbol,#qxt-name,#qxt-av,#qxt-copy,#qxt-feed,.qa-row,.hk-row,[data-key],[data-token],[data-address],[role="log"],[data-token-name],[data-token-symbol]';
const GROUP='section,article,fieldset,details,nav,header,footer,main';
const PROOF_CONTEXT='[data-qproof],.qproof,#qxt-trust,#qxt-proof,.qtr-chip,.qtr-evidence,.ta-proofchip,button.qa-meta__proof.ta-proof,.ta-proofpop,.qa-repoproof,.qx-repoproof';
export function installGlossary({document:doc=globalThis.document,window:win=doc?.defaultView,activeTermIds=APPROVED_FEE_TERMS}={}){
 if(!doc?.body||!win)return null;if(doc[INSTALLED])return doc[INSTALLED];
 const active=new Set(activeTermIds),origins=new WeakMap(),ownedButtons=new WeakMap(),ownedHandles=new Set();
 const matches=(value,options)=>glossaryMatches(value,options).filter(x=>active.has(x.term.id));
 const HARD_OMIT='script,style,pre,code,svg,canvas,textarea,input,select,option,[contenteditable],[data-glossary-ignore],[data-user-content],[data-qx-user-content],.qx-glossary-pop,.qx-glossary-help,.qa-post-body,.tc-post-body,.ta-token-name,.ta-token-symbol,#qxt-symbol,#qxt-name,[data-token-name],[data-token-symbol],[role="log"]';
 const contextFor=button=>{const origin=origins.get(button)||button,scope=origin.closest('['+GLOSSARY_CONTEXT_ATTRIBUTE+']');if(!scope)return null;try{const raw=JSON.parse(scope.getAttribute(GLOSSARY_CONTEXT_ATTRIBUTE));return normalizeGlossaryContext(raw)?raw:{kind:raw?.kind==='draft'?'draft':'pool'};}catch{return {kind:'pool'};}};
 const pop=doc.createElement('div');pop.id='qx-glossary-pop';pop.className='qx-glossary-pop';pop.hidden=true;pop.setAttribute('popover','auto');pop.setAttribute('role','dialog');pop.setAttribute('aria-modal','false');pop.setAttribute('aria-labelledby','qx-glossary-title');pop.dataset.qxOverlayHistory='external';doc.body.append(pop);
 const native=typeof pop.showPopover==='function',groups=new WeakMap(),roots=new Set(),descriptions=new Map(),compact=new Map();let current=null,pinned=false,ignoreFocus=null,hoverTimer,leaveTimer,queued=false,dead=false,closing=false,pointerInPopover=false,pointerGuardTimer;
 const element=(tag,text,className)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
 function position(){if(!current||!current.isConnected){if(current)close();return;}const box=current.getBoundingClientRect(),padding=16,width=pop.offsetWidth,height=pop.offsetHeight;pop.style.left=Math.round(Math.max(padding,Math.min(box.left,win.innerWidth-width-padding)))+'px';const below=box.bottom+8;pop.style.top=Math.round(below+height<=win.innerHeight-padding?below:Math.max(padding,box.top-height-8))+'px';}
 // Native hidePopover can synchronously restore focus. That focus must not reopen a closing popover.
 function close({restore=false}={}){
  if(closing)return;clearTimeout(hoverTimer);clearTimeout(leaveTimer);clearTimeout(pointerGuardTimer);pointerInPopover=false;const old=current;
  const restoreAllowed=restore&&old?.isConnected&&!old.closest('[inert]')&&(!doc.querySelector('dialog[open]')||doc.querySelector('dialog[open]').contains(old));
  closing=true;if(old&&(restoreAllowed||pop.contains(doc.activeElement)))ignoreFocus=old;
  try{
   current=null;pinned=false;if(old){old.setAttribute('aria-expanded','false');old.removeAttribute('aria-describedby');}
   if(native&&pop.matches(':popover-open'))pop.hidePopover();pop.hidden=true;
   if(restoreAllowed)old.focus({preventScroll:true});
  }finally{closing=false;if(ignoreFocus===old&&doc.activeElement!==old)ignoreFocus=null;}
 }

 function render(term,all=false){allTerms=all;
  const title=element('h2',all?'QHooks terms':term.label);title.id='qx-glossary-title';const head=element('div',undefined,'qx-glossary-pop__head'),x=element('button','×','qx-glossary-pop__close');x.type='button';x.setAttribute('aria-label','Close definition');x.addEventListener('click',()=>close({restore:true}));head.append(title,x);pop.replaceChildren(head);
  if(all){const list=element('dl');for(const row of GLOSSARY){list.append(element('dt',row.label),element('dd',glossaryText(row.id,contextFor(current))));}pop.append(list);}
  else{const description=element('p',glossaryText(term.id,contextFor(current)));description.id='qx-glossary-description';pop.append(description);const foot=element('div',undefined,'qx-glossary-pop__foot'),link=element('a','Learn more'),browse=element('button','All terms','qx-glossary-pop__all');link.href=term.href;browse.type='button';browse.addEventListener('click',()=>{pinned=true;current?.removeAttribute('aria-describedby');render(term,true);position();pop.querySelector('button').focus({preventScroll:true});});foot.append(link,browse);pop.append(foot);}
 }
 function open(button,{pin=false,focus=false}={}){if(dead||closing||!button.isConnected)return;const term=glossaryTerm(button.dataset.qxGlossary);if(!term)return;if(current!==button){close();const modal=button.closest('dialog[open]');(modal||doc.body).append(pop);current=button;render(term);}pinned||=pin;clearTimeout(leaveTimer);pop.hidden=false;button.setAttribute('aria-expanded','true');if(pop.querySelector('#qx-glossary-description'))button.setAttribute('aria-describedby','qx-glossary-description');if(native&&!pop.matches(':popover-open'))pop.showPopover();position();if(focus)pop.querySelector('button').focus({preventScroll:true});}
 function help(term,origin){const button=element('button',undefined,'qx-glossary-help');button.type='button';button.dataset.qxGlossary=term.id;origins.set(button,origin);button.setAttribute('aria-label','Explain '+term.label);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',pop.id);button.setAttribute('aria-expanded','false');
  button.addEventListener('pointerenter',event=>{if(event.pointerType!=='mouse')return;clearTimeout(leaveTimer);clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>open(button),180);});
  button.addEventListener('pointerleave',()=>{clearTimeout(hoverTimer);if(!pinned&&doc.activeElement!==button)leaveTimer=setTimeout(()=>close(),180);});
  button.addEventListener('focus',()=>{if(closing||ignoreFocus===button)return;open(button);});button.addEventListener('blur',()=>{if(ignoreFocus===button)ignoreFocus=null;});
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(current===button&&pinned)close({restore:true});else open(button,{pin:true,focus:true});});
  button.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();open(button,{pin:true,focus:true});}});return button;
 }
 function describeCompact(root){
  const selector='.qa-tabbar a,.qa-nav-links a';const links=[...(root.matches(selector)?[root]:[]),...root.querySelectorAll(selector)];
  for(const link of links){const term=matches(link.textContent)[0]?.term;if(!term||compact.has(link))continue;const id='qx-glossary-description-'+term.id;
   if(!descriptions.has(term.id)){const note=element('span',term.text,'qx-glossary-sr');note.id=id;note.dataset.glossaryIgnore='';doc.body.append(note);descriptions.set(term.id,note);}
   const previous={title:link.getAttribute('title'),describedBy:link.getAttribute('aria-describedby'),id};const tokens=(previous.describedBy||'').split(/\s+/).filter(Boolean);if(!tokens.includes(id))tokens.push(id);link.setAttribute('aria-describedby',tokens.join(' '));previous.ours=(previous.title?previous.title+' — ':'')+term.label+': '+term.text;link.title=previous.ours;compact.set(link,previous);
  }
 }
 function annotate(root){
  if(!root?.isConnected||root.nodeType!==1)return;
  describeCompact(root);
  for(const marker of [root,...root.querySelectorAll('[data-glossary-term][data-glossary-owned]')]){
   const term=glossaryTerm(marker.dataset.glossaryTerm);if(!marker.hasAttribute('data-glossary-owned')||!term||!active.has(term.id)||marker.closest(HARD_OMIT))continue;
   const old=ownedButtons.get(marker);if(old?.isConnected&&old.dataset.qxGlossary===term.id)continue;old?.remove();
   const button=help(term,marker),control=marker.closest('a,button,label,summary');(control||marker).after(button);ownedButtons.set(marker,button);ownedHandles.add(button);
   const group=marker.closest('['+GLOSSARY_CONTEXT_ATTRIBUTE+']')||marker.closest(GROUP)||doc.body,seen=groups.get(group)||new Map();groups.set(group,seen);seen.set(term.id,button);
  }
  if(root.matches(OMIT)||root.closest(OMIT))return;
  const nodes=[],walker=doc.createTreeWalker(root,win.NodeFilter.SHOW_TEXT,{acceptNode(node){const parent=node.parentElement;if(!parent||!node.data.trim()||parent.closest(OMIT)||parent.closest('[data-glossary-term]')||!matches(node.data,{proofContext:!!parent.closest(PROOF_CONTEXT)}).length)return win.NodeFilter.FILTER_REJECT;return win.NodeFilter.FILTER_ACCEPT;}});while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){if(!node.isConnected)continue;const parent=node.parentElement,group=parent.closest('['+GLOSSARY_CONTEXT_ATTRIBUTE+']')||parent.closest(GROUP)||doc.body,seen=groups.get(group)||new Map();groups.set(group,seen);const matchesFound=matches(node.data,{proofContext:!!parent.closest(PROOF_CONTEXT)}),fragment=doc.createDocumentFragment(),planned=new Set();let offset=0,changed=false;
   for(const match of matchesFound){if(planned.has(match.term.id)||seen.get(match.term.id)?.isConnected)continue;
    // A ratio elsewhere (dates, prices, allocation) is not a QProof count.
    if(match.term.id==='proof-count'&&!parent.closest(PROOF_CONTEXT)&&!/\b(checks?|qproof|risk)\b/i.test(node.data))continue;
    const control=parent.closest('a,button,label,summary');if(control){if(!control.parentElement||control.closest('.qx-glossary-help'))continue;const button=help(match.term,control);control.after(button);seen.set(match.term.id,button);continue;}
    fragment.append(doc.createTextNode(node.data.slice(offset,match.end)));const button=help(match.term,parent);fragment.append(button);seen.set(match.term.id,button);planned.add(match.term.id);offset=match.end;changed=true;
   }
   if(changed){fragment.append(doc.createTextNode(node.data.slice(offset)));node.replaceWith(fragment);}
  }
 }
 function flush(){queued=false;if(dead)return;for(const b of ownedHandles)if(!b.isConnected||!origins.get(b)?.isConnected){b.remove();ownedHandles.delete(b);}if(current&&(!current.isConnected||!origins.get(current)?.isConnected))close();const work=[...roots];roots.clear();for(const root of work)annotate(root);}
 function schedule(root){if(dead||!root?.isConnected)return;roots.add(root);if(!queued){queued=true;(win.requestIdleCallback||((fn)=>win.setTimeout(fn,32)))(flush,{timeout:120});}}
 let allTerms=false;
 const contextChanged=event=>{if(current&&(event.target.contains?.(origins.get(current))||event.target===origins.get(current))){if(origins.get(current)?.closest('[hidden],[inert]')){close();return;}const controls=[...pop.querySelectorAll('button,a[href]')],focused=controls.indexOf(doc.activeElement),scroll=pop.scrollTop;render(glossaryTerm(current.dataset.qxGlossary),allTerms);pop.scrollTop=scroll;position();if(focused>=0)pop.querySelectorAll('button,a[href]')[focused]?.focus({preventScroll:true});}};
 const observer=new win.MutationObserver(records=>{for(const record of records){if(record.target.parentElement?.closest('.qx-glossary-pop,.qx-glossary-help'))continue;if(record.type==='attributes'){if(record.attributeName===GLOSSARY_CONTEXT_ATTRIBUTE||record.attributeName==='hidden'||record.attributeName==='inert')contextChanged({target:record.target});schedule(record.target);}else if(record.type==='characterData')schedule(record.target.parentElement);else{if(record.removedNodes.length)schedule(record.target);for(const node of record.addedNodes){if(node.nodeType===1)schedule(node);else if(node.nodeType===3)schedule(node.parentElement);}}}});
 pop.addEventListener('pointerenter',()=>clearTimeout(leaveTimer));pop.addEventListener('pointerleave',()=>{if(!pinned&&!pop.contains(doc.activeElement)&&doc.activeElement!==current)leaveTimer=setTimeout(()=>close(),180);});
 pop.addEventListener('toggle',event=>{if(event.newState==='closed'&&current&&(!native||!pop.matches(':popover-open'))){current.setAttribute('aria-expanded','false');current.removeAttribute('aria-describedby');current=null;pinned=false;pop.hidden=true;}});
 const outside=event=>{clearTimeout(pointerGuardTimer);pointerInPopover=!!current&&pop.contains(event.target);if(current&&!pointerInPopover&&!current.contains(event.target))close();};
 const clearPointerGuard=()=>{clearTimeout(pointerGuardTimer);pointerInPopover=false;};
 const pointerEnd=event=>{if(event.type==='pointercancel'){clearPointerGuard();return;}clearTimeout(pointerGuardTimer);pointerGuardTimer=setTimeout(()=>{pointerInPopover=false;if(current&&doc.activeElement!==current&&!pop.contains(doc.activeElement))close();},250);};
 const focusOutside=event=>{if(current&&event.target!==current&&!pop.contains(event.target)&&!pointerInPopover)close();};
 const keydown=event=>{if(event.key==='Escape'&&current){event.preventDefault();event.stopPropagation();close({restore:true});}};
 // Safari focuses the enclosing modal on pointer-down in a button. Retain an
 // in-progress definition tap through its synthesized click. Pointer cancel or
 // a bounded no-click timeout restores ordinary focus exits.
 doc.addEventListener('pointerdown',outside,true);doc.addEventListener('pointerup',pointerEnd,true);doc.addEventListener('pointercancel',pointerEnd,true);doc.addEventListener('click',clearPointerGuard);doc.addEventListener('focusin',focusOutside);win.addEventListener('keydown',keydown,true);win.addEventListener('resize',position);win.addEventListener('scroll',position,{passive:true,capture:true});
 doc.addEventListener(GLOSSARY_CONTEXT_EVENT,contextChanged);annotate(doc.body);observer.observe(doc.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:[GLOSSARY_CONTEXT_ATTRIBUTE,'data-glossary-term','data-glossary-owned','hidden','inert']});
 const api={scan:root=>schedule(root||doc.body),close,dispose(){dead=true;observer.disconnect();doc.removeEventListener(GLOSSARY_CONTEXT_EVENT,contextChanged);close();doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('pointerup',pointerEnd,true);doc.removeEventListener('pointercancel',pointerEnd,true);doc.removeEventListener('click',clearPointerGuard);doc.removeEventListener('focusin',focusOutside);win.removeEventListener('keydown',keydown,true);win.removeEventListener('resize',position);win.removeEventListener('scroll',position,true);pop.remove();for(const [link,previous]of compact){const tokens=(link.getAttribute('aria-describedby')||'').split(/\s+/).filter(x=>x&&x!==previous.id);tokens.length?link.setAttribute('aria-describedby',tokens.join(' ')):link.removeAttribute('aria-describedby');if(link.title===previous.ours)previous.title===null?link.removeAttribute('title'):link.setAttribute('title',previous.title);}for(const note of descriptions.values())note.remove();for(const button of doc.querySelectorAll('.qx-glossary-help'))button.remove();delete doc[INSTALLED];}};doc[INSTALLED]=api;return api;
}
if(typeof document!=='undefined'){const boot=()=>installGlossary();document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}
