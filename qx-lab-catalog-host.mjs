import {mountLabCatalog} from './qx-lab-catalog.mjs';
import {mountPreparedDeploymentCheck} from './qx-lab-deployed-check.mjs';
import {listCatalogTemplates} from './qx-lab-catalog-core.mjs';
import {createCatalogRawDraftStore} from './qx-lab-catalog-drafts.mjs';

// A preparation manifest is deliberately separate from a deployment receipt.
// Pool hooks and stand-alone revenue modules have different identities.
export function catalogReviewManifest(prepared) {
  if(prepared?.kind!=='qhooks-prepared-catalogue-template'||prepared.executionEnabled!==false||!prepared.plan?.txs?.length||!prepared.checks?.length)throw Error('Prepare the current template first.');
  const isPool=!!prepared.artifact.hook,address=prepared.plan.addresses[isPool?'hook':'module'];
  if(!address||prepared.checks.some(check=>!check.to||!/^0x(?:[0-9a-f]{2})+$/i.test(check.data)||!/^0x(?:[0-9a-f]{64})+$/i.test(check.expectedReturn)))throw Error('The exact contract checks are incomplete.');
  return structuredClone({kind:isPool?'qhooks-pool-preparation':'qhooks-revenue-module-preparation',schemaVersion:1,
    sourceVersion:prepared.sourceVersion,chainId:prepared.request.chainId,projectName:prepared.request.projectName,
    template:prepared.request.template,buildHash:prepared.buildHash,address,request:prepared.request,
    artifactInput:prepared.artifactInput,artifact:prepared.artifact,inputs:prepared.inputs,
    transactions:prepared.plan.txs,addresses:prepared.plan.addresses,checks:prepared.checks,
    requiredLiveChecks:prepared.requiredLiveChecks,executionEnabled:false,receipts:[],verification:null});
}

export function mountCatalogReview(container,{document:doc=container.ownerDocument,draftStore=createCatalogRawDraftStore({catalog:listCatalogTemplates()}),draftStoreForChain=catalog=>createCatalogRawDraftStore({catalog})}={}) {
  let current=null,comparison=null;
  const el=(tag,text,attrs={})=>{const node=doc.createElement(tag);if(text!=null)node.textContent=text;for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  const result=el('section',null,{class:'qlc-review','aria-label':'Prepared template review',hidden:''});
  const clear=()=>{comparison?.dispose();comparison=null;current=null;result.hidden=true;result.replaceChildren();};
  function download(){if(!current)return;const url=URL.createObjectURL(new Blob([JSON.stringify(current,null,2)+'\n'],{type:'application/json'}));const a=el('a','',{href:url,download:'qhooks-'+current.kind.replace('qhooks-','')+'.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function show(prepared){
    comparison?.dispose();comparison=null;current=catalogReviewManifest(prepared);result.replaceChildren();result.hidden=false;
    result.append(el('h3',current.projectName),el('p',(current.kind==='qhooks-pool-preparation'?'Hook and empty pool':'Revenue module')+' · '+prepared.artifact.chain.name),el('p',current.address,{class:'qlc-address'}));
    result.append(el('p','Download the exact build and transaction plan. Gas, selected currencies and live contract dependencies still need verification before signing.'));
    const transactions=el('ol',null,{class:'qlc-review-transactions'});
    for(const tx of current.transactions){const item=el('li');item.append(el('strong',tx.label),el('p','To '+tx.to,{class:'qlc-address'}));const details=el('details');details.append(el('summary','Exact transaction data'),el('pre',tx.data));item.append(details);transactions.append(item);}
    result.append(transactions);
    const checks=el('details');checks.append(el('summary',`${current.checks.length} exact contract checks`));
    for(const check of current.checks){const row=el('div',null,{class:'qlc-check'});row.append(el('strong',check.read+(check.arguments.length?' · '+check.arguments.join(', '):'')),el('p',(check.phase==='after-initialize'?'After pool initialization':'After deployment')+' · Target '+check.to,{class:'qlc-address'}),el('code',check.data),el('pre',check.expectedReturn));checks.append(row);}
    result.append(checks);
    const required=el('details');required.append(el('summary','Checks required before deployment'));const list=el('ul');for(const check of current.requiredLiveChecks.filter(c=>c.required))list.append(el('li',check.requirement||check.kind.replaceAll('-',' ')));required.append(list);result.append(required);
    const button=el('button','Download build & review',{type:'button',class:'workspace-button qlc-primary'});button.addEventListener('click',download);result.append(button);
    comparison=mountPreparedDeploymentCheck(result,prepared,{document:doc});
  }
  const picker=mountLabCatalog({container,onPrepared:show,onInvalidate:clear,document:doc,draftStore,draftStoreForChain});
  container.append(result);
  return {picker,clear,getManifest:()=>current?structuredClone(current):null,destroy(){comparison?.dispose();picker.destroy();result.remove();}};
}

const target=globalThis.document?.getElementById('qx-lab-catalog');
if(target)mountCatalogReview(target);
