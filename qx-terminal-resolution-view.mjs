import{chainById}from'./chains.mjs';
export function createTerminalResolutionView({main,document:doc=globalThis.document,onBrowse=()=>{}}={}){
 const h=(tag,attrs={},...kids)=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);n.append(...kids);return n;};
 const section=h('section',{id:'qxt-resolution',class:'qxt-resolution',role:'region','aria-live':'polite','aria-labelledby':'qxt-resolution-title',hidden:''});
 const label=h('p',{class:'qxt-resolution-label'}),title=h('h1',{id:'qxt-resolution-title',tabindex:'-1'}),message=h('p',{id:'qxt-resolution-message'}),address=h('p',{class:'qxt-resolution-address'}),actions=h('div',{class:'qxt-resolution-actions'});
 const browse=h('button',{type:'button'},'Browse tokens'),retry=h('button',{type:'button'},'Retry'),buy=h('button',{type:'button',disabled:'','aria-describedby':'qxt-resolution-message'},'Buy unavailable');
 let again=null,previousVisibility=null;section.style.visibility='visible';section.style.order='-2';section.style.gridColumn='1 / -1';retry.addEventListener('click',()=>again?.());browse.addEventListener('click',onBrowse);
 actions.append(browse,retry,buy);section.append(label,title,message,address,actions);main.prepend(section);
 return{
  show({state='unavailable',target={},proof=null,retry:run=null}={}){
   if(!doc.querySelector('link[href="/qx-terminal-resolution.css"]')){const css=h('link',{rel:'stylesheet',href:'/qx-terminal-resolution.css'});doc.head.append(css);}
   if(previousVisibility===null)previousVisibility=main.style.visibility;main.style.visibility='hidden';
   again=run;label.textContent=state==='unpriced'?'Token found':state==='loading'?'Token lookup':'Token lookup';
   title.textContent=state==='not_found'?'Token not found':state==='loading'?'Loading token…':state==='unpriced'?(proof?.symbol||'Token on '+(target.chainId==='solana'?'Solana':chainById(target.chainId)?.name||'this chain')):'Unable to load';
   message.textContent=state==='not_found'?'Check the chain and token address, or browse the token list.':state==='loading'?'Checking this token’s market.':state==='unpriced'?'This token exists. Its price or trading route is unavailable. Retry when a market is available.':'Token data could not be loaded. Retry in a moment.';
   const chain=target.chainId==='solana'?'Solana':chainById(target.chainId)?.name||'';
   address.textContent=[chain,target.address||target.controller].filter(Boolean).join(' · ');
   retry.hidden=!run||state==='loading';buy.hidden=state!=='unpriced';
   section.hidden=false;doc.body.classList.add('qxt-resolution-mode');doc.body.dataset.tokenResolution=state;
   doc.dispatchEvent(new CustomEvent('qxt:resolution',{detail:{state}}));
   if(state!=='loading')requestAnimationFrame(()=>{const modal=[...doc.querySelectorAll('dialog[open],[aria-modal="true"]')].some(n=>n.getClientRects().length);if(!modal&&doc.body.dataset.tokenResolution===state)title.focus({preventScroll:true});});
   doc.title=(state==='not_found'?'Token not found':state==='unavailable'?'Unable to load':title.textContent)+' | QHooks';
  },
  clear(){section.hidden=true;if(previousVisibility!==null){main.style.visibility=previousVisibility;previousVisibility=null;}doc.body.classList.remove('qxt-resolution-mode');delete doc.body.dataset.tokenResolution;again=null;},
 };
}
