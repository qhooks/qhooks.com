// An injected guided panel. The owner supplies draft reads/writes and state
// notifications; this module never discovers wallet/key controls or runs steps.
import {ASSISTED_RECIPES, createAssistedIntent, validateAssistedIntent,
 previewAssistedLaunch, applyAssistedLaunch, assistedDraftFingerprint} from './qx-assisted-launch-core.mjs';
import {presetRules,CREATE_STYLES} from './qx-create-plan.mjs';
import {mountAssistedLanguageInput} from './qx-assisted-language-input.mjs';
const styleName=id=>CREATE_STYLES.find(style=>style.id===id)?.name||id;
const groupedSupply=value=>{const[whole,fraction]=String(value).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?'.'+fraction:'');};

const CSS=`
.qha-panel{position:relative}.qha-panel .qha-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.qha-panel .qha-head h2{margin:0}
.qha-panel .qha-beta{font:500 10px var(--qx-mono,monospace);color:var(--qx-muted,#aaa);border:1px solid var(--qx-line-2,#444);border-radius:4px;padding:2px 5px;line-height:1.5}
.qha-panel .qha-intro{max-width:66ch;color:var(--qx-muted,#aaa);font-size:13px}.qha-panel .qha-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:10px;margin:18px 0}
.qha-panel button.qha-choice{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;text-align:left;white-space:normal;min-height:110px;padding:14px;gap:8px;height:auto}
.qha-panel .qha-choice strong{font-size:14px;font-weight:600}.qha-panel .qha-choice span{font-size:12px;line-height:1.55;color:var(--qx-muted,#aaa)}.qha-panel .qha-choice[aria-pressed="true"]{border-color:var(--qx-brass,#cab17a);background:var(--qx-panel-2,#252729)}
.qha-panel .qha-choice em{font:500 10px var(--qx-mono,monospace);font-style:normal;color:var(--qx-brass,#cab17a)}
.qha-panel .qha-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:14px;margin:16px 0}.qha-panel .qha-options input{min-height:44px}
.qha-panel button{min-height:44px}.qha-panel button:focus-visible,.qha-panel input:focus-visible,.qha-panel summary:focus-visible{outline:2px solid var(--qx-brass,#cab17a);outline-offset:3px}
.qha-panel .qha-review{border-top:1px solid var(--qx-line-2,#444);margin-top:20px;padding-top:18px;min-width:0}.qha-panel .qha-review h3{margin:0 0 6px;scroll-margin-top:110px;font-size:18px}
.qha-panel .qha-stamp{font:11px var(--qx-mono,monospace);color:var(--qx-brass,#cab17a);margin-bottom:14px}.qha-panel .qha-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px 28px}
.qha-panel .qha-list{padding-left:18px;margin:8px 0 16px}.qha-panel .qha-list li{font-size:12px;line-height:1.65;margin-bottom:8px;overflow-wrap:anywhere}
.qha-panel .qha-subtitle{font-size:12px;font-weight:600;margin:16px 0 8px}.qha-panel .qha-facts{margin:0}.qha-panel .qha-fact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:10px;padding:8px 0;border-bottom:1px solid var(--qx-line,#333);font-size:12px}
.qha-panel .qha-fact dt{color:var(--qx-muted,#aaa)}.qha-panel .qha-fact dd{margin:0;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.qha-panel .qha-small{font-size:12px;line-height:1.65;color:var(--qx-muted,#aaa);overflow-wrap:anywhere}.qha-panel .qha-action{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0 0}
.qha-panel .qha-status{font-size:12px;line-height:1.65;overflow-wrap:anywhere}.qha-panel .qha-status[data-error="true"]{color:var(--qx-error,#e8a89a)}.qha-panel .qha-status:empty{display:none}
.qha-panel [hidden]{display:none!important}
.qha-panel .qha-language{padding:14px 0 18px;border-bottom:1px solid var(--qx-line,#333);margin-bottom:18px}.qha-panel .qha-language textarea{margin-top:7px}
`;

export function mountAssistedLaunchPanel({document=globalThis.document,getDraft,getContext=()=>({}),onApply,subscribe,language=null,id='qha'}={}){
 if(!document?.createElement||typeof getDraft!=='function'||typeof onApply!=='function'||typeof getContext!=='function')throw new TypeError('Supply a document, draft reader, context reader and explicit draft-apply callback.');
 if(!/^[a-z][a-z0-9-]{0,48}$/.test(id))throw new TypeError('Use a short panel id.');
 if(!document.getElementById('qha-panel-style')){const style=document.createElement('style');style.id='qha-panel-style';style.textContent=CSS;document.head.append(style);}
 const listeners=new Set();
 const h=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){
  if(k==='class')n.className=v;else if(k in n)n[k]=v;else n.setAttribute(k,v);
 }n.append(...children.filter(c=>c!==null&&c!==undefined));return n;};
 const listen=(n,type,fn)=>{n.addEventListener(type,fn);const remove=()=>{n.removeEventListener(type,fn);listeners.delete(remove);};listeners.add(remove);return remove;};
 const status=h('p',{class:'qha-status',role:'status','aria-live':'polite','aria-atomic':'true'});
 const say=(text,error=false)=>{status.textContent=text;status.setAttribute('data-error',String(error));};
 let selected='minimal',reviewed=null,destroyed=false,applying=false,unsubscribe=null,lastIssue='',languageInput=null;
 const optionListeners=[];
 const values=new Map(ASSISTED_RECIPES.map(r=>{const p=presetRules(r.style),all={guardMinutes:p.antiSnipe,stakersPercent:p.stakers,referralsPercent:p.referrals};return[r.id,Object.fromEntries(r.options.map(k=>[k,all[k]]))];}));
 const options=h('div',{class:'qha-options'}),choiceNodes=[];
 const heading=h('h2',{id:id+'-title'},'Assisted launch');
 const element=h('section',{id,class:'qha-panel qxc-panel','aria-labelledby':heading.id},
  h('div',{class:'qha-head'},heading,h('span',{class:'qha-beta'},'Beta')),
  h('p',{class:'qha-intro'},'Choose what your launch should do. Review one supported recipe, then apply it to your draft. You can keep customizing afterward.'));
 const choices=h('div',{class:'qha-choices',role:'group','aria-label':'Launch goal'});
 for(const recipe of ASSISTED_RECIPES){
  const button=h('button',{type:'button',class:'qha-choice','data-recipe':recipe.id,'aria-pressed':String(recipe.id===selected)},
   h('strong',{},recipe.title),recipe.id==='minimal'?h('em',{},'Fewest rules'):null,h('span',{},recipe.summary));
  listen(button,'click',()=>{if(destroyed||applying)return;languageInput?.cancel();selected=recipe.id;clearReview();drawOptions();say('');refresh();});
  choiceNodes.push(button);choices.append(button);
 }
 const prepare=h('button',{type:'button',class:'qxc-primary','data-action':'review'},'Review recipe');
 const reviewSlot=h('div',{class:'qha-review',hidden:true}),apply=h('button',{type:'button',class:'qxc-primary','data-action':'apply',disabled:true},'Apply to draft');
 const languageSlot=h('div');element.append(languageSlot,choices,options,h('div',{class:'qha-action'},prepare),reviewSlot,status);
 function clearReview(){reviewed=null;reviewSlot.hidden=true;reviewSlot.replaceChildren();apply.disabled=true;}
 function read(){return {config:getDraft(),context:getContext()||{}};}
 function intent(config){return createAssistedIntent(selected,config,values.get(selected));}
 function drawOptions(){
  optionListeners.splice(0).forEach(remove=>remove());
  options.replaceChildren();
  const recipe=ASSISTED_RECIPES.find(r=>r.id===selected);
  const settings={guardMinutes:['Opening guard · minutes','1','10080','1'],stakersPercent:['Stakers’ share of payee income · %','0','100','0.01'],referralsPercent:['Referrers’ share of block charges · %','0','62.5','0.01']};
  for(const key of recipe.options){
   const[label,min,max,step]=settings[key],input=h('input',{id:id+'-'+key,type:'number',min,max,step,value:String(values.get(selected)[key]),'data-option':key,inputMode:key==='guardMinutes'?'numeric':'decimal'});
   optionListeners.push(listen(input,'input',()=>{if(destroyed||applying)return;languageInput?.cancel();values.get(selected)[key]=input.value;clearReview();say('');refresh();}));
   options.append(h('label',{htmlFor:input.id},label,input));
  }
  options.hidden=!recipe.options.length;
 }
 const fact=(label,value)=>h('div',{class:'qha-fact'},h('dt',{},label),h('dd',{},String(value)));
 const list=items=>h('ul',{class:'qha-list'},...items.map(text=>h('li',{},text)));
 function drawReview(p){
  const r=p.review,fees=r.poolFees,rev=r.revenue;
  const title=h('h3',{id:id+'-review-title',tabIndex:-1},p.recipe.title);
  const behavior=h('div',{},h('p',{class:'qha-subtitle'},'How trading works'),list(r.behavior));
  const costs=h('div',{},h('p',{class:'qha-subtitle'},'Fees and starting liquidity'),h('dl',{class:'qha-facts'},
   fact('Source-pool fees',fees.totalPercent+'% per swap'),fact('Creator pool fee',fees.creatorPercent+'% → '+fees.creatorRecipient),fact('Protocol pool fee',fees.protocolPercent+'% → QHooks'),
   fact('QHooks terminal routing',r.routeFee.percent+'% on that route'),fact('Platform launch fee',r.costs.platformAmount+' '+r.costs.native),fact('Starting liquidity',r.liquidity.amount+' '+r.liquidity.unit),fact('Network gas','Refreshed in launch review')),
   h('p',{class:'qha-small'},(r.revenue.hasCharges?'Block charges above are additional to the source-pool fees. ':'No block charges are selected. ')+r.routeFee.detail+' '+r.costs.networkDetail));
  if(rev.hasCharges)costs.append(h('p',{class:'qha-subtitle'},Number(rev.referrerOfChargesPercent)>0?'Block charges · with a credited referrer':'Where block charges go'),h('dl',{class:'qha-facts'},
   fact('Buyback pot',rev.buybackOfChargesPercent+'% of charges'),fact('Credited referrer',rev.referrerOfChargesPercent+'% of charges'),
   fact('Staking vault',rev.stakersOfChargesPercent+'% of charges'),fact('Creator · '+rev.creator,rev.creatorOfChargesPercent+'% of charges')),
   h('p',{class:'qha-small'},rev.payeesOfChargesPercent+'% of charges remains as payee income. Stakers receive '+rev.stakersOfPayeesPercent+'% of that remainder; your wallet receives the rest.'+(Number(rev.referrerOfChargesPercent)>0?' Referral rewards apply only to trades with an eligible credited referrer. Without an eligible credited referrer, that share remains in payee income.':'')));
  const retained=h('div',{},h('p',{class:'qha-subtitle'},'Your token and allocations'),h('dl',{class:'qha-facts'},
   fact('Supply',groupedSupply(r.supply.total)),fact('Pool share',r.supply.poolPercent+'%'),fact('Supply allocations',r.supply.allocations.length?'Keep '+r.supply.allocations.length+' existing allocations':'No team reserve')));
  if(r.supply.allocations.length)retained.append(h('details',{},h('summary',{},'View retained allocation details'),list(r.supply.allocations.map(a=>a.label+' · '+a.pct+'% → '+a.wallet+' · cliff '+a.cliff+'s · vesting '+a.duration+'s · sell notice '+a.notice+'s'))));
  const changes=h('div',{},h('p',{class:'qha-subtitle'},'Changes to this draft'));
  if(p.changes.length)changes.append(list(p.changes.map(c=>c.label+': '+(c.key==='style'?styleName(c.before):c.before)+' → '+(c.key==='style'?styleName(c.after):c.after))));
  else changes.append(h('p',{class:'qha-small'},'Your draft already uses these rules.'));
  const controls=h('details',{},h('summary',{},'Creator controls and key requirements'),list([...r.controls,...r.keys]));
  const next=h('p',{class:'qha-small'},p.missingFields.length?'Next, enter your token '+p.missingFields.map(k=>k==='symbol'?'ticker':k).join(' and ')+', then continue to the key and cost review.':r.nextStep);
  reviewSlot.replaceChildren(title,h('p',{class:'qha-stamp'},r.chain.name+' · '+(p.proposedConfig.symbol||'Your token')),h('div',{class:'qha-columns'},behavior,costs),retained,changes,
   h('p',{class:'qha-small'},'Protected creator actions require your launch wallet and matching second key. Block settings and payee shares are fixed at launch.'),controls,next,h('div',{class:'qha-action'},apply));
  reviewSlot.hidden=false;apply.disabled=false;title.focus?.();
 }
 function refresh(){
  if(destroyed)return;
  languageInput?.refresh();
  let issue='';
  try{
   const {config,context}=read();
   if(!applying&&reviewed&&assistedDraftFingerprint(config,context)!==reviewed.draftFingerprint){clearReview();say('Your draft or wallet changed. Review this recipe again.');}
   const result=validateAssistedIntent(intent(config),config,context);if(!result.ok)issue=result.issues[0].message;
  }catch(error){issue=error.message;}
  const disabled=applying||!!issue;
  prepare.disabled=disabled;apply.disabled=disabled||!reviewed;
  // A malformed option must remain editable. Only active execution/recovery
  // disables editing; correcting an input should not require remounting.
  let locked=applying;try{const c=getContext()||{};locked||=c.busy===true||c.hasRecord===true;}catch{locked=true;}
  for(const button of choiceNodes){button.disabled=locked;button.setAttribute('aria-pressed',String(button.getAttribute('data-recipe')===selected));}
  for(const input of options.querySelectorAll('input'))input.disabled=locked;
  if(!applying){if(issue){clearReview();say(issue,true);}else if(lastIssue)say('');lastIssue=issue;}
 }
 listen(prepare,'click',()=>{
  if(destroyed||applying)return;
  try{const {config,context}=read();reviewed=previewAssistedLaunch(intent(config),config,context);drawReview(reviewed);say('Review the rules, charges and changes below. Apply only when they match your plan.');refresh();}
  catch(error){clearReview();say(error.message,true);refresh();}
 });
 listen(apply,'click',async()=>{
  if(destroyed||applying||!reviewed)return;
  let p=reviewed;
  try{
   const {config,context}=read(),next=applyAssistedLaunch(p,config,context);
   applying=true;refresh();await onApply(next,p);
   if(destroyed)return;
   const current=getDraft(),ctx=getContext()||{};
   if(assistedDraftFingerprint(current,ctx)!==assistedDraftFingerprint(next,ctx))throw Error('The draft changed before the recipe was applied. Review the current settings.');
   clearReview();say('Applied to your draft. Continue to the key and cost review, or keep customizing.');
  }catch(error){if(!destroyed){clearReview();say(error.message,true);}}
  finally{applying=false;if(!destroyed)refresh();}
 });
 drawOptions();refresh();
 if(language){
  languageInput=mountAssistedLanguageInput({document,getDraft,getContext,fetcher:language.fetcher,id:id+'-request',onInvalidate:clearReview,onRecommendation:({suggestion,preview})=>{
   if(destroyed||applying)return;selected=suggestion.recipeId;values.set(selected,{...suggestion.options});clearReview();drawOptions();reviewed=preview;drawReview(preview);say('Review the suggested rules and charges, then apply them to your draft.');refresh();
  }});
  languageSlot.append(languageInput.element);
 }
 if(subscribe){if(typeof subscribe!=='function')throw new TypeError('Subscribe must return an optional cleanup function.');unsubscribe=subscribe(refresh);}
 return {element,refresh,destroy(){if(destroyed)return;destroyed=true;languageInput?.destroy();reviewed=null;prepare.disabled=true;apply.disabled=true;for(const button of choiceNodes)button.disabled=true;for(const input of options.querySelectorAll('input'))input.disabled=true;Array.from(listeners).forEach(remove=>remove());if(typeof unsubscribe==='function')unsubscribe();element.remove?.();}};
}
