// Presentation-only integration. Existing recipe validation and handoff remain authoritative.
import {launchDraftView} from './crypto-product-ui.mjs';
const chains=Object.freeze([
 ['8453','Base','USDC','ETH'],['4663','Robinhood Chain','WETH','ETH'],
 ['1','Ethereum','USDC','ETH'],['42161','Arbitrum One','USDC','ETH'],
 ['56','BNB Chain','WBNB','BNB'],['5042','Arc','USDC','USDC']
]);
export function bindQTokenDesk({document:d=document,target=window,designer}={}){
 const $=id=>d.getElementById(id),select=$('ql-chain');
 const buttons=[...d.querySelectorAll('[data-qtd-chain]')],listeners=[];
 let dead=false,step=0;
 const listen=(node,type,fn)=>{if(!node)throw Error('Missing desk control');node.addEventListener(type,fn);listeners.push([node,type,fn]);};
 const text=(id,value)=>{const n=$(id);if(n)n.textContent=value;};
 const setStep=(next,focus=false)=>{
  if(dead||designer?.blocked)return;
  step=next;$('qtd-token-panel').hidden=next!==0;$('qtd-rules-panel').hidden=next!==1;
  for(const [id,index]of [['qtd-step-token',0],['qtd-step-rules',1]])$(id).setAttribute('aria-current',next===index?'step':'false');
  if(focus){const heading=$(next===0?'qtd-token-heading':'qtd-rules-heading');heading?.focus?.();}
 };
 function summary(){
  if(dead)return;
  const chain=!designer?.blocked&&chains.find(row=>row[0]===select.value);
  for(const button of buttons)button.setAttribute('aria-pressed',String(!!chain&&button.dataset.qtdChain===chain[0]));
  if(!chain){text('qtd-summary-chain','Choose a supported chain');return;}
  const value=id=>$(id).value;
  const view=launchDraftView({name:value('ql-name'),symbol:value('ql-symbol'),supply:value('ql-supply'),mode:value('ql-mode'),fee:value('ql-fee'),network:chain[1]});
  text('qtd-summary-name',view.name+' ('+view.symbol+')');
  text('qtd-summary-chain',chain[1]);
  text('qtd-summary-supply',value('ql-supply').trim()||'Not set');
  text('qtd-summary-token',(value('ql-token-funding').trim()||'Not set')+' '+view.symbol);
  text('qtd-summary-quote',(value('ql-quote-funding').trim()||'Not set')+' '+chain[2]);
  text('qtd-quote-label','Initial '+chain[2]+' amount');
  text('qtd-summary-note','Initial liquidity uses '+chain[2]+' on '+chain[1]+'. Network gas is paid in '+chain[3]+'.');
  text('qtd-fee-preview',view.fees);
  const icon=$('qtd-summary-chain-icon'),files={'8453':'base','4663':'robinhood','1':'ethereum','42161':'arbitrum','56':'bnb','5042':'arc'};
  if(icon)icon.src='/chain-symbol-icons/'+files[chain[0]]+'.svg';
  // A generic edit notice adds no information beside the live summary. Preserve
  // validation failures and explicit save/import/preview messages unchanged.
  const feedback=$('ql-feedback');
  if(feedback.dataset.error==='false'&&feedback.textContent==='Settings changed. Preview to check your recipe.')feedback.textContent='';
 }
 for(const button of buttons)listen(button,'click',()=>{
  if(dead||designer?.blocked||select.disabled||!chains.some(row=>row[0]===button.dataset.qtdChain))return;
  select.value=button.dataset.qtdChain;select.dispatchEvent(new (target.Event||Event)('change',{bubbles:true}));
 });
 for(const id of ['ql-chain','ql-name','ql-symbol','ql-supply','ql-token-funding','ql-quote-funding','ql-decimals','ql-fee','ql-mode'])for(const type of ['input','change'])listen($(id),type,summary);
 // Use the accepted validator rather than inventing a second launch acceptance path.
 listen($('qtd-next'),'click',()=>{
  if(dead||designer?.blocked||$('ql-preview').disabled)return;
  $('ql-preview').click();
  if(!$('ql-result').hidden&&$('ql-feedback').dataset.error!=='true')setStep(1,true);
  else{
   const feedback=$('ql-feedback');feedback.setAttribute('tabindex','-1');
   feedback.focus?.();feedback.scrollIntoView?.({block:'start',behavior:'auto'});
  }
 });
 listen($('qtd-back'),'click',()=>setStep(0,true));
 listen($('qtd-step-token'),'click',()=>setStep(0,true));
 listen($('qtd-step-rules'),'click',()=>setStep(1,true));
 if(designer?.blocked){for(const id of ['qtd-next','qtd-back','qtd-step-token','qtd-step-rules'])$(id).disabled=true;for(const button of buttons)button.disabled=true;}
 function dispose(){if(dead)return;dead=true;for(const[n,t,fn]of listeners)n.removeEventListener(t,fn);target.removeEventListener('pagehide',dispose);designer?.dispose?.();}
 target.addEventListener('pagehide',dispose);summary();
 return Object.freeze({dispose,get step(){return step;}});
}
