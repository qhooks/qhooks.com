import {assistedDraftFingerprint} from './qx-assisted-launch-core.mjs';
import {validateLanguageRequest,reviewLanguageSuggestion} from './qx-assisted-language.mjs';
export function mountAssistedLanguageInput({document=globalThis.document,getDraft,getContext=()=>({}),onRecommendation,onInvalidate=()=>{},fetcher=globalThis.fetch,id='qha-language'}={}){
 if(!document?.createElement||typeof getDraft!=='function'||typeof onRecommendation!=='function'||typeof fetcher!=='function')throw new TypeError('Supply the current public draft, recommendation callback and language transport.');
 const listeners=[],h=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k in n)n[k]=v;else n.setAttribute(k,v);}n.append(...children);return n;};
 const text=h('textarea',{id,maxLength:1600,rows:3,placeholder:'Protect the opening for 20 minutes, with no ongoing buy or sell tax.','data-language':'request'});
 const submit=h('button',{type:'button',class:'qxc-primary','data-language':'suggest'},'Suggest a recipe');
 const status=h('p',{role:'status','aria-live':'polite',class:'qha-status','data-language':'status'});
 const element=h('div',{class:'qha-language',hidden:true},h('label',{htmlFor:id},'Describe your launch rules',text),
  h('p',{class:'qha-small'},'Only this request and the selected chain are sent for interpretation.'),h('div',{class:'qha-action'},submit),status);
 let available=false,destroyed=false,pending=null,sequence=0;
 const listen=(node,event,fn)=>{node.addEventListener(event,fn);listeners.push(()=>node.removeEventListener(event,fn));};
 const say=(message,error=false)=>{status.textContent=message;status.setAttribute('data-error',String(error));};
 function cancel(message=''){
  sequence++;pending?.controller.abort();pending=null;if(destroyed)return;say(message);onInvalidate();refresh();
 }
 function refresh(){
  if(destroyed)return;
  const ctx=getContext()||{};
  if(pending){try{if(assistedDraftFingerprint(getDraft(),ctx)!==pending.fingerprint){cancel('Your draft or wallet changed. Ask for a fresh recipe.');return;}}catch{cancel('Review the current chain and draft before asking for a recipe.');return;}}
  submit.disabled=!available||!!pending||ctx.busy===true||ctx.hasRecord===true;text.disabled=ctx.busy===true||ctx.hasRecord===true;
  submit.textContent=pending?'Reading your rules…':'Suggest a recipe';
 }
 listen(text,'input',()=>cancel());
 listen(submit,'click',async()=>{
  if(destroyed||pending||!available)return;
  let timer,activeSequence=null;
  try{
   const config=getDraft(),context=getContext()||{};if(context.busy||context.hasRecord)throw Error('Finish or resume the existing launch first.');
   const input=validateLanguageRequest({version:1,text:text.value,chainId:config.chainId}),fingerprint=assistedDraftFingerprint(config,context),controller=new AbortController(),current=++sequence;
   activeSequence=current;pending={fingerprint,controller};onInvalidate();refresh();say('Reading your rules…');
   timer=setTimeout(()=>controller.abort(),35000);
   const response=await fetcher('/api/launch/assist',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(input),signal:controller.signal});
   if(destroyed||current!==sequence)return;
   if(!response.ok)throw Error('A matching recipe could not be prepared. Refine the request or choose a guided recipe.');
   const body=await response.text();if(body.length>16000)throw Error('The suggestion could not be read. Try a shorter request.');const result=JSON.parse(body);
   if(destroyed||current!==sequence)return;
   if(!pending||fingerprint!==assistedDraftFingerprint(getDraft(),getContext()||{})){cancel('Your draft or wallet changed. Ask for a fresh recipe.');return;}
   if(result.version!==1)throw Error('Refresh to load the current launch planner.');
   const reviewed=reviewLanguageSuggestion(result.suggestion,{text:input.text,config:getDraft(),context:getContext()||{}});
   pending=null;
   if(reviewed.preview){onRecommendation(reviewed);say('Suggested from your request. Review every rule and charge before applying.');}
   else say(reviewed.suggestion.question);
  }catch(error){if(!destroyed&&(activeSequence===null||activeSequence===sequence)){const aborted=pending?.controller.signal.aborted;pending=null;say(aborted?'The request stopped. Try again or choose a guided recipe.':error.message,true);}}
  finally{clearTimeout(timer);if(!destroyed)refresh();}
 });
 const ready=(async()=>{
  try{const r=await fetcher('/api/launch/assist',{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store'});const c=await r.json();if(!destroyed&&r.ok&&c.version===1&&c.available===true){available=true;element.hidden=false;refresh();}}
  catch{}return available;
 })();
 refresh();
 return {element,ready,refresh,cancel,destroy(){if(destroyed)return;destroyed=true;sequence++;pending?.controller.abort();pending=null;listeners.forEach(remove=>remove());element.remove?.();}};
}
