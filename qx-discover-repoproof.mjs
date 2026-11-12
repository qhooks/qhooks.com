// The inspector's contract report is owned by one exact Discovery record and URL revision.
import {mountRepoProofCheck} from './qx-repoproof.mjs';
const CHAINS=new Set(['1','8453','42161','56','4663','99901']);
const NAMES={'1':'Ethereum','8453':'Base','42161':'Arbitrum One','56':'BNB Chain','4663':'Robinhood Chain'};
const address=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value)&&BigInt(value)>0n?value.toLowerCase():null;
function identity(value,{profile=false}={}){
 const chainId=String(value?.chainId||''),hook=address(profile?value?.hook:value?.address);
 return /^[1-9]\d{0,14}$/.test(chainId)&&Number.isSafeInteger(Number(chainId))&&hook?{chainId,address:hook}:null;
}
const same=(a,b)=>!!a&&!!b&&a.chainId===b.chainId&&a.address===b.address;
export function inspectorProfileMatches(profile,selection){
 const selected=identity(selection),record=identity(profile,{profile:true});
 return same(selected,record)&&(profile.evidence?.chainId==null||String(profile.evidence.chainId)===selected.chainId);
}
export function inspectorProofSubject(profile,selection){
 if(!inspectorProfileMatches(profile,selection))return null;
 const value=identity(selection);return CHAINS.has(value.chainId)?{kind:'contract',...value}:null;
}
const text=value=>value==null||value===''?'Not reported':String(value);
const at=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString().replace('T',' ').replace(/Z$/,' UTC'):'Not reported';
const el=(doc,tag,value,attrs={})=>{const node=doc.createElement(tag);if(value!=null)node.textContent=value;for(const[key,v]of Object.entries(attrs))node.setAttribute(key,String(v));return node;};
export function inspectorDiscoveryContext(profile,selection){
 if(!inspectorProfileMatches(profile,selection))return{matches:false,knownNoCode:false,rows:[]};
 const evidence=profile.evidence||{},known=evidence.status==='ok',permissions=known&&Array.isArray(evidence.permissions?.names)?evidence.permissions.names:null;
 const knownNoCode=known&&(evidence.deployed===false||evidence.codeBytes===0);
 const runtime=knownNoCode?'No deployed code at this block':known&&evidence.deployed===true?'Deployed code observed':'Deployment unavailable';
 return{matches:true,knownNoCode,rows:[
  ['Discovery read',known?'Read succeeded':'Not reported'+(evidence.reason?' · '+evidence.reason:'')],
  ['Chain / block',(NAMES[String(profile.chainId)]||'Chain '+profile.chainId)+' · '+(known&&evidence.block!=null?'block '+evidence.block:'block unavailable')],
  ['Block hash',known?text(evidence.blockHash):'Not reported'],
  ['Read source',known?text(evidence.source):'Not reported'],
  ['Observed',known?at(evidence.observedAt):'Not reported'],
  ['Runtime',runtime+(known&&Number.isSafeInteger(evidence.codeBytes)&&evidence.codeBytes>=0?' · '+evidence.codeBytes+' bytes':'')],
  ['Runtime fingerprint',known?text(evidence.fingerprint):'Not reported'],
  ['Permission bits',permissions?permissions.length?permissions.join(', '):'No enabled permission bits':'Not reported'],
  ['Permission flags',known&&evidence.permissions?.flags!=null?text(evidence.permissions.flags):'Not reported'],
  ['Source record',[profile.verified?.name,profile.verified?.provenance].filter(value=>typeof value==='string'&&value).join(' · ')||'Not reported']
 ]};
}
export function mountInspectorRepoProof(container,{profile,selection,getSelection=()=>selection,revision=selection?.revision??0,document:doc=container?.ownerDocument||globalThis.document,fetcher,mount=mountRepoProofCheck}={}){
 if(!container||!doc)throw TypeError('A hook-inspector report container is required.');
 const element=el(doc,'div',null,{class:'qd-proof-context'}),subject=inspectorProofSubject(profile,selection),context=inspectorDiscoveryContext(profile,selection);
 container.replaceChildren(element);let disposed=false,proof=null;
 if(!context.matches){element.append(el(doc,'p','The returned hook record does not match this chain and address. Refresh the inspector before requesting a contract report.',{class:'qd-note',role:'status'}));}
 else{
  element.append(el(doc,'p','Public contract findings cover this address. Hook behavior, source review and launch admission remain separate checks.',{class:'qd-note'}));
  const details=el(doc,'details'),facts=el(doc,'dl',null,{class:'qd-facts'});details.append(el(doc,'summary','Discovery context for this report'));for(const[label,value]of context.rows){const row=el(doc,'div');row.append(el(doc,'dt',label),el(doc,'dd',value));facts.append(row);}details.append(facts);element.append(details);
  if(!subject)element.append(el(doc,'p','QProof contract checks are not available for this chain. The Discovery evidence and returned routes remain available.',{class:'qd-note',role:'status'}));
  else if(context.knownNoCode)element.append(el(doc,'p','Discovery found no deployed code at this block. Use Refresh live to check for a deployment before requesting a contract report.',{class:'qd-note',role:'status'}));
  else{
   const target=el(doc,'div');element.append(target);
   const getSubject=()=>{if(disposed)return null;const active=getSelection();return same(identity(active),identity(selection))&&(active?.revision===undefined||active.revision===revision)?{...subject,revision}:null;};
   if(getSubject())proof=mount(target,{subject:{...subject,revision},getSubject,document:doc,fetcher});
  }
 }
 return{element,dispose(){disposed=true;proof?.dispose();element.remove();}};
}
