import{menuChains}from'./chains.mjs';
import{chainQuickCurrency}from'./qx-quick-buy-plan.mjs';
import{getWalletHub}from'./wallet-hub.mjs';
import{onSolChange}from'./qx-solana.mjs';
import{walletTradingStorage,tradingOwner}from'./qx-trade-settings-context.mjs';
import{quickAmounts,saveQuickAmounts,QUICK_UNITS}from'./qx-trade-settings-store.mjs';
const units=['usd','eth','bnb','hype','sol'];
const node=(tag,attrs={},...children)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!=null)e.setAttribute(k,v);e.append(...children.flat());return e;};
let sheet;
export function openQuickAmountSettings({chainId='4663',opener}={}){
 if(!sheet)sheet=createSheet();sheet.open(chainId,opener);
}
function createSheet(){
 let chain='4663',owner=null,from=null,raw;try{raw=localStorage}catch{}
 const dialog=node('dialog',{class:'qaq-sheet','aria-labelledby':'qaq-title'}),title=node('h2',{id:'qaq-title'},'Trade settings'),close=node('button',{type:'button','aria-label':'Close trade settings'},'×'),scope=node('p',{class:'qaq-scope'}),select=node('select',{'aria-label':'Quick-buy settings network'}),fields=new Map(),status=node('p',{role:'status','aria-live':'polite'}),save=node('button',{type:'submit',class:'qaq-save'},'Save amounts'),form=node('form'),grid=node('div',{class:'qaq-fields'});
 const chains=menuChains().filter(c=>c.id!=='solana');for(const c of chains)select.append(node('option',{value:c.id},c.short||c.name));select.append(node('option',{value:'solana'},'Solana'));
 for(const key of units){const input=node('input',{type:'text',inputmode:'decimal',autocomplete:'off','aria-label':'Quick buy '+QUICK_UNITS[key]});fields.set(key,input);grid.append(node('label',{},node('span',{},QUICK_UNITS[key]),input));}
 form.append(node('label',{},node('span',{},'Network'),select),node('h3',{},'Quick-buy amounts'),node('p',{class:'qaq-help'},'Set one quick-buy amount for this network. Tokens use this currency when their trade route supports it.'),grid,status,save);dialog.append(node('header',{},title,close),scope,form);document.body.append(dialog);
 const paint=()=>{owner=tradingOwner(chain);select.value=chain;const quick=quickAmounts(walletTradingStorage(raw,()=>chain),chain);const currency=chainQuickCurrency(chain);for(const[k,input]of fields){input.value=quick[k];input.closest('label').hidden=k!==currency?.cls;}save.disabled=!currency;scope.textContent=owner?'Saved for '+owner.slice(0,8)+'…'+owner.slice(-4):'Saved on this device until you connect.';status.textContent=currency?'':'Quick buy is unavailable on this network. Open the trade ticket.';};
 const invalidate=()=>{if(dialog.open&&owner!==tradingOwner(chain))dialog.close();document.dispatchEvent(new CustomEvent('qhooks:quick-settings'));};getWalletHub(window).subscribe(invalidate);onSolChange(invalidate);
 select.addEventListener('change',()=>{chain=select.value;paint();});close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>from?.focus?.({preventScroll:true}));
 form.addEventListener('submit',e=>{e.preventDefault();try{if(owner!==tradingOwner(chain))throw Error('Your wallet changed. Reopen trade settings.');saveQuickAmounts(walletTradingStorage(raw,()=>chain),chain,Object.fromEntries([...fields].map(([k,n])=>[k,n.value.trim()])));document.dispatchEvent(new CustomEvent('qhooks:quick-settings'));dialog.close();}catch(error){status.textContent=error.message;}});
 return{open(id,opener){chain=[...select.options].some(o=>o.value===String(id))?String(id):'4663';from=opener;paint();if(!dialog.open)dialog.showModal();close.focus();}};
}
