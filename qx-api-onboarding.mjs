const CHAINS=Object.freeze({'8453':'Base','4663':'Robinhood Chain','1':'Ethereum','42161':'Arbitrum One','56':'BNB Chain'});
const ZERO='0x'+'0'.repeat(40);
export function tradingExample({chain='8453',route='rewards',referrer=ZERO}={}){
 if(!Object.hasOwn(CHAINS,chain)||!['rewards','direct'].includes(route)||!/^0x[0-9a-f]{40}$/i.test(referrer))throw TypeError('Choose a supported chain, route and EVM referral wallet.');
 const fee=route==='rewards';
 return `import { createClient, withSlippage } from 'https://qhooks.com/sdk/qhooks.mjs';

const q = createClient();
const me = YOUR_CONNECTED_EVM_WALLET;
const pools = await q.pools({ chain: '${chain}' });
const pool = pools.find(p => p.router?.routable === true && String(p.chainId) === '${chain}');
if (!pool) throw new Error('No routable listed pool on ${CHAINS[chain]}. Choose another chain or list your launch.');
if (pool.quote.decimals == null) throw new Error('Quote-token decimals are unavailable.');
const amountIn = 20n * 10n ** BigInt(pool.quote.decimals);
const zeroForOne = pool.key.currency0.toLowerCase() === pool.quote.address.toLowerCase();
${fee?`const routerFee = amountIn * 100n / 10000n;
const quoteAmount = amountIn - routerFee;`:`const quoteAmount = amountIn;`}
const { amountOut } = await q.quote({ pool, zeroForOne, amountIn: quoteAmount, trader: me });
const minOut = withSlippage(amountOut, 100); // 1% price tolerance
const tx = ${fee?`await q.prepareFeeRouterSwap({
  pool, zeroForOne, amountIn, minOut, feeOnInput: true, feeBps: 100,
  referrer: '${referrer.toLowerCase()}'
});
// Review ERC-20 approval to tx.to before this swap.`:`q.universalRouterSwap({ pool, zeroForOne, amountIn, minOut });
// Review ERC-20 approval to Permit2, then Permit2 approval to tx.to.`}
// Review chain, input, minOut, approvals and gas with the user.
// Requote immediately before submission; the SDK returns { to, data, value }.
// Submit only through the user's wallet after their approval.
console.log(tx);`;
}
export function mountApiOnboarding(root,{document:doc=document,fetcher=fetch}={}){
 const h=(tag,attrs={},...kids)=>{const el=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))k==='class'?el.className=v:el.setAttribute(k,v);el.append(...kids);return el;};
 const chain=h('select',{id:'api-try-chain'},...Object.entries(CHAINS).map(([id,name])=>h('option',{value:id},name)));
 const route=h('select',{id:'api-try-route'},h('option',{value:'rewards'},'QHooks rewards route'),h('option',{value:'direct'},'Direct Uniswap route'));
 const ref=h('input',{id:'api-try-ref',placeholder:'0x… optional partner wallet',maxlength:'42',autocomplete:'off'});
 const code=h('code'),pre=h('pre',{class:'api-code'},code),note=h('p',{class:'api-route-note'}),status=h('p',{role:'status','aria-live':'polite'}),result=h('div',{class:'api-pool-result'});
 const copy=h('button',{type:'button',class:'qa-btn'},'Copy trading example'),read=h('button',{type:'button',class:'qa-btn'},'Read listed pools');
 let revision=0,controller=null;
 function render(){revision++;controller?.abort();read.disabled=false;result.replaceChildren();status.textContent='';try{code.textContent=tradingExample({chain:chain.value,route:route.value,referrer:route.value==='rewards'?(ref.value.trim()||ZERO):ZERO});copy.disabled=false;}catch(error){code.textContent=error.message;copy.disabled=true;}
  ref.disabled=route.value==='direct';note.textContent=route.value==='rewards'?'1% router fee with cashback and referral accounting. The buy quote uses the input remaining after that fee. Pool and hook charges are included in the quote.':'Direct routing has no QHooks terminal fee or terminal rewards. The pool’s LP, protocol and configured hook charges still apply.';
 }
 for(const input of [chain,route,ref])input.addEventListener(input===ref?'input':'change',render);
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code.textContent);status.textContent='Example copied. Replace the connected-wallet placeholder in your app.';}catch{status.textContent='Copy the example from the code block.';}});
 read.addEventListener('click',async()=>{
  const mine=++revision;controller?.abort();controller=new AbortController();read.disabled=true;status.textContent='Reading listed pools…';
  try{const response=await fetcher('/api/v1/pools?chain='+chain.value,{cache:'no-store',signal:controller.signal});const body=await response.json();if(mine!==revision)return;if(!response.ok||!Array.isArray(body.pools))throw Error('The pool directory did not answer.');
   const pools=body.pools.filter(pool=>String(pool.chainId)===chain.value);result.replaceChildren(...(pools.length?pools.slice(0,6).map(pool=>h('div',{class:'api-pool'},h('strong',{},pool.name||pool.symbol||'Listed pool'),h('code',{},pool.id||pool.poolId||pool.controller||pool.key?.hooks||''))):[h('p',{},'No listed QHooks pools on '+CHAINS[chain.value]+' right now. Choose another chain or list a launch.'),h('a',{href:'/create'},'Create a market →')]));status.textContent=pools.length?'Read '+pools.length+' listed pools. Pick a routable pool in your integration.':'The API answered successfully; this chain has no listed pools.';
  }catch(error){if(mine===revision&&error.name!=='AbortError')status.textContent=error.message+' Use Read listed pools to retry.';}finally{if(mine===revision)read.disabled=false;}
 });
 root.replaceChildren(h('div',{class:'api-fields'},h('label',{for:'api-try-chain'},'Chain',chain),h('label',{for:'api-try-route'},'Trading route',route),h('label',{for:'api-try-ref'},'Referral wallet',ref)),note,h('div',{class:'qa-actions'},read,copy),status,result,pre);
 chain.value='8453';render();return{chain,route,ref,read,code,render};
}
const root=globalThis.document?.getElementById('api-onboarding');
if(root){
 const initialHash=globalThis.location?.hash;
 mountApiOnboarding(root);
 // The synchronous example adds height above documentation sections after native hash navigation.
 let target;try{target=initialHash&&document.getElementById(decodeURIComponent(initialHash.slice(1)));}catch{}
 const backNavigation=globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type==='back_forward';
 if(!backNavigation&&target?.tagName==='SECTION'&&globalThis.requestAnimationFrame)requestAnimationFrame(()=>{
  if(location.hash===initialHash&&!root.contains(document.activeElement))target.scrollIntoView({block:'start',behavior:'instant'});
 });
}

