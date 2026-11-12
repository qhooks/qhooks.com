import {listCatalogTemplates,normalizeCatalogRequest,verifyCatalogBuild} from './qx-lab-catalog-core.mjs';
import {catalogChain} from './qx-lab-catalog-chains.mjs';
let catalogMountId=0;

function fields(template,chainId='8453'){
  const definition=listCatalogTemplates(chainId).templates.find(t=>t.id===template);
  if(!definition)throw Error('Choose a supported template.');
  return definition.fields;
}
function publicFieldValue(field,value){
  if(field.type==='boolean')return value===true;
  if(['array','tuple'].includes(field.type)||['ranges','addresses','amounts'].includes(field.type)){
    if(Array.isArray(value)||value&&typeof value==='object')return JSON.stringify(value,null,2);
    return value===undefined?'':String(value);
  }
  return value===undefined?'':String(value);
}
function jsonFieldHelp(field){
  const units=new Set();let integers=false;
  const visit=f=>{if(f.units)units.add(f.units);if(f.type==='integer')integers=true;if(f.items)visit(f.items);for(const child of f.fields??[])visit(child);};
  if(field.items)visit(field.items);for(const child of field.fields??[])visit(child);
  const size=field.minItems===undefined?'':field.minItems===field.maxItems?` Exactly ${field.minItems} item${field.minItems===1?'':'s'}.`:` ${field.minItems}–${field.maxItems} items.`;
  return `Positional JSON ${field.abiType}.${integers?' Use decimal strings for integers.':''}${size} ${[...units].join(' · ')}`.trim();
}

export async function fetchCatalogBuild(request,{signal,fetch:fetcher=globalThis.fetch}={}){
  const response=await fetcher('/api/lab/catalog/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal});
  const body=await response.json();
  if(!response.ok)throw Error((typeof body.error==='string'?body.error:body.error?.message)||'Could not prepare this deployment.');
  return body;
}

// Pure adapter seam for the host's form/draft persistence. All values remain public.
export function catalogRequestFromDraft(template,values,chainId='8453'){
  const catalog=listCatalogTemplates(chainId),configuration={};
  if(!catalog.templates.some(t=>t.id===template))throw Error('Choose a supported template.');
  for(const field of fields(template,chainId)){
    const name=field.name,raw=values[name];
    if(field.type==='boolean'){configuration[name]=raw===true;continue;}
    const value=String(raw??'').trim();
    if(['array','tuple','ranges','addresses','amounts'].includes(field.type)){
      if(Array.isArray(raw)||raw&&typeof raw==='object')configuration[name]=raw;
      else if(name==='beneficiaries'&&value&&!value.startsWith('['))configuration[name]=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      else if(name==='caps'&&raw===undefined&&values.cap0!==undefined)configuration[name]=[String(values.cap0).trim(),String(values.cap1).trim()];
      else try{configuration[name]=JSON.parse(value);}catch{throw Error(name==='ranges'?'Enter liquidity ranges as JSON tick pairs, for example [["-600","600"]].':'Enter '+field.label+' as valid JSON. Use decimal strings for raw amounts.');}
    }else configuration[name]=value;
  }
  return normalizeCatalogRequest({kind:'qhooks-lab-template-request',schemaVersion:1,sourceVersion:catalog.sourceVersion,
    template,chainId:catalog.chainId,projectName:String(values.projectName??'').trim(),configuration});
}

export function mountLabCatalog({container,prepareBuild=fetchCatalogBuild,onPrepared=()=>{},onInvalidate=()=>{},document:doc=container?.ownerDocument,initialDraft=null,draftStore=null,draftStoreForChain=null,chainId='8453'}={}){
  if(!container||!doc)throw new TypeError('A Lab catalogue container is required.');
  let catalog=listCatalogTemplates(chainId);
  const stores=new Map([[chainId,draftStore]]),sessions=new Map();
  const el=(tag,attrs={},...children)=>{
    const node=doc.createElement(tag);
    for(const [key,value]of Object.entries(attrs)){
      if(key==='class')node.className=value;
      else if(key==='text')node.textContent=value;
      else if(key==='value')node.value=value;
      else node.setAttribute(key,String(value));
    }
    for(const child of children)node.append(child);
    return node;
  };
  const st={template:catalog.templates.find(t=>t.id==='rewards/net-flow')?.id??catalog.templates[0].id,drafts:{},revision:0,busy:false,abort:null,destroyed:false,result:null};
  const filterNoteId='qlc-filter-status-'+(++catalogMountId);
  const search=el('input',{type:'search',name:'templateQuery',placeholder:'Name, ID or summary',autocomplete:'off',spellcheck:'false',maxlength:'120'});
  const filterNote=el('p',{id:filterNoteId,class:'qlc-help qlc-summary qlc-filter-status',role:'status','aria-live':'polite','aria-atomic':'true'});
  // Search stays outside the constructor form: Enter never prepares a build.
  const chainPicker=el('select',{name:'catalogChain','aria-label':'Catalogue chain'});
  for(const chain of catalog.chains)chainPicker.append(el('option',{value:chain.id,text:chain.name+(chain.status==='coming'?' · coming':''),...(chain.status==='coming'?{disabled:''}:{})}));
  chainPicker.value=catalog.chainId;
  const filter=el('div',{class:'qlc-template-filter'},el('label',{},'Chain',chainPicker),el('label',{},'Search templates',search),filterNote);
  const draftNote=el('p',{class:'qlc-help qlc-summary qlc-draft-status',role:'status','aria-live':'polite','aria-atomic':'true'});draftNote.hidden=true;
  const recoverDraft=el('button',{type:'button',class:'workspace-button qlc-raw-recover',text:'Download saved form text'});recoverDraft.hidden=true;
  let saveWarning=false;
  function draftHint(text,error=false){
    if(draftNote.textContent===text)return;
    if(saveWarning)draftNote.setAttribute('aria-live','off');
    draftNote.hidden=false;draftNote.textContent=text;if(error)saveWarning=true;
  }
  const saveUnavailable=result=>{
    draftHint(result?.message??'Device save could not finish. Your edits remain in this tab.',true);
    recoverDraft.hidden=typeof draftStore?.recoverRawText!=='function';
  };
  recoverDraft.addEventListener('click',()=>{
    let url;
    try{
      // Include this tab's raw work too; a refused save must not leave its only copy
      // behind when the user downloads recovery text before reloading.
      const recovery={...draftStore.recoverRawText(),tabForm:{kind:'qhooks-lab-catalog-raw-drafts',schemaVersion:1,
        sourceVersion:catalog.sourceVersion,chainId:catalog.chainId,selected:st.template,
        drafts:{...st.drafts,[st.template]:collect()}}};
      url=URL.createObjectURL(new Blob([JSON.stringify(recovery,null,2)+'\n'],{type:'application/json'}));
      const download=el('a',{href:url,download:'qhooks-saved-form-text.json'});doc.body.append(download);download.click();download.remove();
    }catch(error){draftHint(error.message||'Saved form text could not be read. Your edits remain in this tab.',true);}
    finally{if(url)URL.revokeObjectURL(url);}
  });
  const select=el('select',{'aria-label':'Hook or revenue template','aria-describedby':filterNoteId,name:'template'});
  const hooks=el('optgroup',{label:'Pool hooks'}),income=el('optgroup',{label:'Revenue modules'});
  const name=el('input',{name:'projectName',type:'text',maxlength:'120',required:''});
  const availabilityNote=el('p',{class:'qlc-availability',role:'status'});
  const summary=el('p',{class:'qlc-summary'}),configFields=el('div',{class:'qlc-fields'}),effect=el('p',{class:'qlc-effect'});
  const ruleText=el('p',{class:'qlc-rule-text'});
  const ruleDetails=el('details',{class:'qlc-rule-details'},el('summary',{text:'How this rule works'}),ruleText);
  const note=el('p',{class:'qlc-status',role:'status','aria-live':'polite','aria-atomic':'true'});
  const prepare=el('button',{type:'submit',class:'workspace-button qlc-primary',text:'Prepare build'});
  const actionLine=el('span'),exampleReference=el('p',{class:'qlc-help qlc-example-reference'});
  const examples=el('button',{type:'button',class:'workspace-button qlc-examples',text:'Use example values'});
  const form=el('form',{class:'qlc-form'},
    el('label',{},'Choose a hook or revenue module',select),summary,availabilityNote,ruleDetails,
    el('label',{},'Project name',name),configFields,effect,
    el('div',{class:'qlc-actions'},prepare,examples,actionLine),exampleReference,note);
  const section=el('section',{class:'qlc','aria-label':'Configure a hook or revenue module'},
    el('h2',{text:'Build your pool rules'}),el('div',{class:'qlc-form'},filter,...(draftStore||draftStoreForChain?[draftNote,recoverDraft]:[]),form));
  let inputs=new Map();
  const selected=()=>catalog.templates.find(t=>t.id===st.template);
  function renderOptions(){
    if(st.destroyed)return;
    const query=search.value.trim().toLowerCase(),matches=new Set(catalog.templates.filter(t=>[t.name,t.id,t.summary].some(value=>String(value).toLowerCase().includes(query))).map(t=>t.id));
    const retained=!!query&&!matches.has(st.template);
    hooks.replaceChildren();income.replaceChildren();
    for(const template of catalog.templates){
      if(!matches.has(template.id)&&template.id!==st.template)continue;
      (template.kind==='revenue-module'?income:hooks).append(el('option',{value:template.id,...(template.availability.available?{}:{disabled:'',class:'qlc-unavailable'}),text:template.name+(!template.availability.available?' — '+template.availability.reason:'')+(retained&&template.id===st.template?' — current selection':'')}));
    }
    select.replaceChildren(...[hooks,income].filter(group=>group.children.length));select.value=st.template;
    filterNote.textContent=!query?catalog.templates.filter(t=>t.availability.available).length+' of '+catalog.templates.length+' templates available on '+catalogChain(catalog.chainId).name+'.':
      (matches.size?matches.size+' matching template'+(matches.size===1?'':'s')+'.':'No matching templates.')+(retained?' Current selection retained: '+selected().name+'.':'');
  }
  const collect=()=>Object.fromEntries([['projectName',name.value],...Array.from(inputs,([key,node])=>[key,node.getAttribute('type')==='checkbox'?node.checked:node.value])]);
  function persist(){
    if(!draftStore||st.destroyed)return;
    st.drafts[st.template]=collect();
    try{const result=draftStore.save({selected:st.template,drafts:st.drafts});if(result.saved){draftHint('Draft saved on this device.');recoverDraft.hidden=true;}else saveUnavailable(result);}catch{saveUnavailable();}
  }
  const invalidate=reason=>{
    st.revision++;st.abort?.abort();st.abort=null;st.busy=false;st.result=null;
    prepare.disabled=!selected().availability.available;form.removeAttribute('aria-busy');note.textContent='';
    onInvalidate({reason,revision:st.revision,template:st.template,chainId:catalog.chainId});
  };
  const changed=()=>{st.drafts[st.template]=collect();invalidate('configuration');persist();};
  function render(){
    const template=selected(),draft=st.drafts[st.template]??{};
    renderOptions();name.value=draft.projectName??template.name;
    summary.textContent=template.summary;
    const profile=catalogChain(catalog.chainId),availability=template.availability;
    actionLine.textContent=profile.name+' · exact build and transaction plan';
    // The examples keep Base's raw starting price (not a market price), so no human price line is shown for them.
    exampleReference.textContent='';exampleReference.hidden=true;
    availabilityNote.textContent=[availability.reason,...availability.notes].filter(Boolean).join(' ');
    availabilityNote.hidden=!availabilityNote.textContent;
    form.classList.toggle('qlc-unavailable',!availability.available);prepare.disabled=!availability.available;examples.disabled=!availability.available;
    ruleText.textContent=template.help??'';ruleDetails.hidden=!ruleText.textContent;ruleDetails.open=false;
    configFields.replaceChildren();inputs=new Map();
    for(const field of fields(st.template,catalog.chainId)){
      const key=field.name,isJSON=['array','tuple','ranges','addresses','amounts'].includes(field.type),isBool=field.type==='boolean';
      const input=isJSON?el('textarea',{name:key,rows:'3',wrap:'off',required:'',spellcheck:'false'}):
        el('input',{name:key,type:isBool?'checkbox':'text',...(!isBool?{required:'',autocomplete:'off',spellcheck:'false',placeholder:String(field.example??'')}:{}),...(field.type==='integer'&&!String(field.abiType??'').startsWith('int')?{inputmode:'numeric'}:{})});
      const value=draft[key]??field.default;
      if(isBool)input.checked=value===true;else input.value=publicFieldValue(field,value);
      input.addEventListener(isBool?'change':'input',changed);inputs.set(key,input);
      const label=el('label',{class:isJSON||key==='sqrtPriceX96'?'qlc-wide':''},field.label||key,input);
      if(field.units)label.append(el('small',{class:'qlc-unit',text:field.units}));
      if(field.help)label.append(el('small',{class:'qlc-help',text:field.help}));
      if(st.template==='next-wave/external-reference-price-guard-hook'&&['feed0','feed1','sequencerUptimeFeed'].includes(key)){
        const suggestions=key==='sequencerUptimeFeed'?(profile.feeds.sequencer?[profile.feeds.sequencer]:[]):Object.entries(profile.feeds).filter(([name])=>name!=='sequencer').map(([,feed])=>feed);
        label.append(el('small',{class:'qlc-help qlc-feed-suggestions',text:suggestions.length?'Suggested on '+profile.name+': '+suggestions.map(feed=>feed.description+' '+feed.address).join(' · '):key==='sequencerUptimeFeed'?'Use the zero address and zero grace on '+profile.name+'.':'No price feed suggestions on '+profile.name+'.'}));
      }
      if(isJSON)label.append(el('small',{class:'qlc-help',text:jsonFieldHelp(field)}));
      configFields.append(label);
    }
    effect.textContent=template.kind==='revenue-module'
      ?(st.template==='income/qincome-capped-overflow'?'Creates a revenue module for two fixed recipients and two plain ERC20 currencies. Configure it as a payee to receive revenue.':'Creates a revenue module for its configured recipients and two plain ERC20 currencies. Review every raw-unit allocation before configuring it as a payee.')
      :'Creates the hook and initializes an empty pool. Currency addresses must be ordered; review the starting price in raw currency units. Liquidity and any required funding are separate steps.';
  }
  function getRequest(){return catalogRequestFromDraft(st.template,collect(),catalog.chainId);}
  function setDraft(request){
    const draft=normalizeCatalogRequest(request),cfg=draft.configuration;
    if(draft.chainId!==catalog.chainId)switchChain(draft.chainId);
    const values={...cfg,projectName:draft.projectName};
    for(const field of fields(draft.template,catalog.chainId))values[field.name]=field.type==='boolean'?cfg[field.name]:publicFieldValue(field,cfg[field.name]);
    invalidate('restore');st.template=draft.template;st.drafts[st.template]=values;render();persist();
  }
  async function prepareSelection(){
    if(st.destroyed)throw Error('This catalogue is closed.');
    if(st.busy)return null;
    if(!selected().availability.available){note.textContent=selected().availability.reason;return null;}
    let request;
    try{request=getRequest();}catch(error){note.textContent=error.message;return null;}
    st.busy=true;prepare.disabled=true;form.setAttribute('aria-busy','true');
    const revision=st.revision,abort=new AbortController();st.abort=abort;
    note.textContent='Preparing exact constructor and deployment checks…';
    try{
      const response=await prepareBuild(request,{signal:abort.signal});
      if(st.destroyed||revision!==st.revision)return null;
      const verified=await verifyCatalogBuild(response,request,{plan:true});
      if(st.destroyed||revision!==st.revision)return null;
      st.result=verified;
      const first=verified.plan.txs[0],count=verified.plan.txs.length;
      note.textContent=`${count} transaction${count===1?'':'s'} prepared. ${selected().kind==='revenue-module'?'Module':'Hook'} address: ${first.creates}`;
      await onPrepared(verified);
      return st.destroyed||revision!==st.revision?null:verified;
    }catch(error){
      if(!st.destroyed&&revision===st.revision&&error.name!=='AbortError'){st.result=null;note.textContent=error.message||'Could not prepare this deployment.';}
      return null;
    }finally{
      if(!st.destroyed&&revision===st.revision){st.busy=false;st.abort=null;prepare.disabled=!selected().availability.available;form.removeAttribute('aria-busy');}
    }
  }
  search.addEventListener('input',renderOptions);
  select.addEventListener('change',()=>{if(select.value===st.template)return;st.drafts[st.template]=collect();invalidate('template');st.template=select.value;render();persist();});
  name.addEventListener('input',changed);
  form.addEventListener('submit',event=>{event.preventDefault();void prepareSelection();});
  function restoreStore(){
    if(!draftStore)return;
    try{const stored=draftStore.load();if(stored.status==='restored'){st.template=stored.draft.selected;st.drafts=stored.draft.drafts;draftHint(stored.message??'Draft restored from this device. Prepare a fresh review.');}else if(stored.status==='unavailable')saveUnavailable(stored);}catch{saveUnavailable();}
  }
  function switchChain(next){
    const profile=catalogChain(next);
    if(profile.status!=='live'){chainPicker.value=catalog.chainId;return;}
    if(next===catalog.chainId)return;
    st.drafts[st.template]=collect();persist();sessions.set(catalog.chainId,{template:st.template,drafts:st.drafts});
    invalidate('chain');catalog=listCatalogTemplates(next);chainPicker.value=next;
    if(!stores.has(next))stores.set(next,draftStoreForChain?.(catalog)??null);
    draftStore=stores.get(next);const saved=sessions.get(next);
    st.template=saved?.template??st.template;st.drafts=saved?.drafts??{};
    saveWarning=false;draftNote.hidden=true;draftNote.textContent='';draftNote.setAttribute('aria-live','polite');recoverDraft.hidden=true;
    if(!saved)restoreStore();render();
  }
  chainPicker.addEventListener('change',()=>switchChain(chainPicker.value));
  examples.addEventListener('click',()=>{
    if(!selected().availability.available)return;
    const template=selected();st.drafts[st.template]=Object.fromEntries([['projectName',name.value],...template.fields.map(field=>[field.name,publicFieldValue(field,template.exampleConfiguration[field.name])])]);
    invalidate('examples');render();persist();
  });
  restoreStore();
  container.append(section);render();if(initialDraft)setDraft(initialDraft);
  return Object.freeze({getRequest,setDraft,prepare:prepareSelection,getPrepared:()=>st.result,
    destroy(){if(st.destroyed)return;invalidate('destroy');st.destroyed=true;section.remove();}});
}
