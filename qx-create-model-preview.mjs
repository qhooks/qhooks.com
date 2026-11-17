// Read-only projection of current canonical form/config values. No provider or wallet calls.
import {chainById} from './chains.mjs';
import {SOL_LAUNCH_CONFIG as C,solLaunchReview} from './qx-sol-launch-config.mjs';
import {solReviewLines,solText} from './qx-sol-launch-values.mjs';
const amount=v=>{try{if(!['string','number','bigint'].includes(typeof v)||typeof v==='string'&&!/^\d+$/.test(v)||typeof v==='number'&&!Number.isSafeInteger(v))return null;const n=BigInt(v);if(n<0n)return null;return solText(n)+' SOL';}catch{return null;}};
export function evmModel({chain,card,baseFee,antiSnipe=false}={}){
 return {chain:chain?.name||'Selected chain',kind:'Pool from launch',state:'Preset preview',facts:[['Supply','Factory preset'],['Base pool fee',Number.isFinite(baseFee)&&baseFee>=0?Number((baseFee/10000).toFixed(4))+'%':'At review'],['Anti-snipe',antiSnipe?'On · selected rules':'Off'],['Graduation','No curve migration']],
  note:'Your token starts in its trading pool.',details:card?.what||'',fee:null};
}
export function solModel({ready=false,cost=null,prepared=null,pending=false}={}){
 const f=solLaunchReview(),lines=solReviewLines();
 const reviewed=!!prepared&&!!cost,launch=reviewed?amount(cost.lamports):null,rent=reviewed?amount(cost.rent):null,network=reviewed?amount(prepared.networkLamports):null;
 const rows=launch&&rent&&network?[['Launch fee',launch],['Rent · upfront estimate',rent],['Network fee · estimate',network]]:null;
 return {chain:'Solana',kind:'Bonding curve',state:ready?'Policy preview':'Preview · launches unavailable',facts:[['Supply',C.totalSupply.toLocaleString('en-US')],['Trading fee',Number(f.steadyFeePercent.toFixed(2))+'%'],['Graduation',C.migrationQuoteThreshold+' SOL'],['Anti-snipe',Number((C.startingFeeBps/100).toFixed(2))+'% → '+Number(f.steadyFeePercent.toFixed(2))+'%']],
  note:'A bonding curve sets the price as people buy and sell. At its reserve target, the token moves to its next trading pool.',details:lines.filter(([k])=>['Anti-snipe','Graduation'].includes(k)).map(([,v])=>v).join(' '),
  fee:rows?{label:pending?'Reviewed estimate':'Launch review',rows,message:'Review these estimates before confirming the transaction in your wallet.'}:{label:'Fees at review',rows:[['Configured launch fee','$'+C.flatLaunchUsd.toFixed(2)+' in SOL']],message:ready?'Review shows the SOL fee, rent and network estimate before wallet confirmation.':'Solana launches open shortly.'}};
}
export function mountCreateModelPreview({before,feeDetails=null,id,document:doc=globalThis.document}={}){
 const el=(tag,attrs={},...kids)=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);n.append(...kids);return n;};
 const root=el('section',{id,class:'qq-model-preview','aria-label':'Launch model preview'}),head=el('header'),chain=el('strong'),state=el('span'),facts=el('dl',{class:'qq-model-facts'}),fees=el('div',{class:'qq-model-fee'}),note=el('details',{class:'qq-model-explanation'}),summary=el('summary',{},'How this launch works'),explain=el('p'),detail=el('p');head.append(chain,state);note.append(summary,explain,detail);root.append(head,facts);before.before(root);if(feeDetails)root.append(feeDetails);else root.append(fees);const feeActions=el('div',{class:'qq-model-fee-actions',hidden:''}),retry=el('button',{type:'button',class:'qq-fee-retry','aria-describedby':'cr5-total'},'Retry fees');let retryAction=null;retry.addEventListener('click',()=>retryAction?.());feeActions.append(retry);if(feeDetails)root.append(feeActions);root.append(note);
 return {element:root,hide(){root.hidden=true;},setFeeStatus(view,onRetry){retryAction=onRetry;feeActions.hidden=view.phase!=='unavailable';retry.disabled=!view.canRetry;},update(model){root.hidden=false;chain.textContent=model.chain+' · '+model.kind;state.textContent=model.state;facts.replaceChildren(...model.facts.map(([k,v])=>el('div',{},el('dt',{},k),el('dd',{},v))));explain.textContent=model.note;detail.textContent=model.details;detail.hidden=!model.details;
  if(model.fee){const f=model.fee;fees.replaceChildren(el('strong',{},f.label),...f.rows.map(([k,v])=>el('div',{},el('span',{},k),el('b',{},v))),el('p',{},f.message));}
 }};
}
// Label the existing chain controls without owning or replacing their click/keyboard behavior.
export function mountChainModelLabels(root){
 if(!root)return;const paint=()=>{for(const b of root.querySelectorAll('[data-chain]')){let label=b.querySelector('.qq-chain-model');if(!label){label=b.ownerDocument.createElement('small');label.className='qq-chain-model';b.append(label);}const id=b.dataset.chain,c=id==='solana'?{native:'SOL'}:chainById(id);label.textContent=id==='solana'?'Curve · SOL':c?'Pool · '+c.native:'Unavailable';}};
 paint();const observer=new MutationObserver(paint);observer.observe(root,{childList:true});return()=>observer.disconnect();
}
