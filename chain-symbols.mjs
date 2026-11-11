// Decorative chain marks for reviewed, public chain-selection surfaces only.
// This module never reads a wallet, sends RPC, or changes control values/text.
export const CHAIN_SYMBOLS=Object.freeze([
 Object.freeze({id:'143',name:'Monad',aliases:Object.freeze(['Monad']),icon:'/chain-symbol-icons/monad.svg',kind:'original'}),
 Object.freeze({id:'8453',name:'Base',aliases:Object.freeze(['Base']),icon:'/chain-symbol-icons/base.svg',kind:'official'}),
 Object.freeze({id:'4663',name:'Robinhood Chain',aliases:Object.freeze(['Robinhood Chain','Robinhood']),icon:'/chain-symbol-icons/robinhood.svg',kind:'official'}),
 Object.freeze({id:'1',name:'Ethereum',aliases:Object.freeze(['Ethereum']),icon:'/chain-symbol-icons/ethereum.svg',kind:'official'}),
 Object.freeze({id:'42161',name:'Arbitrum One',aliases:Object.freeze(['Arbitrum One','Arbitrum']),icon:'/chain-symbol-icons/arbitrum.svg',kind:'official'}),
 Object.freeze({id:'56',name:'BNB Chain',aliases:Object.freeze(['BNB Chain','BNB']),icon:'/chain-symbol-icons/bnb.svg',kind:'official'}),
 Object.freeze({id:'5042',name:'Arc',aliases:Object.freeze(['Arc']),icon:'/chain-symbol-icons/arc.svg',kind:'official'}),
 Object.freeze({id:'99801',name:'Elysium Testnet',aliases:Object.freeze(['Elysium Testnet','Elysium']),icon:'/chain-symbol-icons/elysium.svg',kind:'official'})
]);

export const CHAIN_SYMBOL_SURFACES=Object.freeze({
 rich:Object.freeze(['[data-chain] > strong','[data-pool-chain] > strong','.chain-pills > li','h1','h2','h3','.eyebrow','.status','[role="status"]','a','button']),
 selects:Object.freeze(['qw-chain','ql-chain']),
 dynamic:Object.freeze({'data-chain':Object.freeze(['network-title','chain-selected-title']),'data-pool-chain':Object.freeze(['pools-title'])})
});

const byId=new Map(CHAIN_SYMBOLS.map(chain=>[chain.id,chain]));
const aliases=CHAIN_SYMBOLS.flatMap(chain=>chain.aliases.map(alias=>({alias,chain}))).sort((a,b)=>b.alias.length-a.alias.length);
const normalize=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function chainSymbolForId(value){return byId.get(String(value))??null;}

export function chainSymbolForText(value){
 const text=normalize(value);
 for(const {alias,chain} of aliases){
  const mark=escaped(alias);
  if(new RegExp('^(?:Onchain\\s*/\\s*|Network:\\s*|Connected on\\s+)?'+mark+'(?:$|\\s*[·:(])').test(text))return chain;
  if(new RegExp('\\bon\\s+'+mark+'(?:$|\\s*→)').test(text))return chain;
 }
 return null;
}

function icon(d,chain){
 const image=d.createElement('img');
 image.className='chain-symbol';image.src=chain.icon;image.alt='';image.width=24;image.height=24;
 image.setAttribute('aria-hidden','true');image.setAttribute('decoding','async');image.dataset.chainSymbol=chain.id;
 return image;
}

function decorate(d,element,chain){
 if(!element||!chain||element.closest?.('option, select, script, style')||element.querySelector?.(':scope > .chain-symbol'))return false;
 element.classList.add('chain-symbol-label');element.prepend(icon(d,chain));return true;
}

function selectedBadge(d,select){
 let badge=select.nextElementSibling;
 if(!badge?.classList?.contains('chain-select-symbol')){
  badge=d.createElement('span');badge.className='chain-select-symbol';badge.setAttribute('aria-hidden','true');
  select.insertAdjacentElement('afterend',badge);
 }
 const chain=chainSymbolForId(select.value);badge.replaceChildren(...(chain?[icon(d,chain)]:[]));
 if(chain)badge.dataset.selectedChain=chain.id;else delete badge.dataset.selectedChain;
 return badge;
}

export function bindChainSymbols({document:d=globalThis.document}={}){
 if(!d?.createElement||!d?.querySelectorAll)return Object.freeze({refresh(){},dispose(){}});
 const listeners=[];
 const refresh=(root=d)=>{
  for(const selector of CHAIN_SYMBOL_SURFACES.rich)for(const element of root.querySelectorAll(selector)){
   const explicit=element.parentElement?.matches?.('[data-chain]')?element.parentElement.dataset.chain:
    element.parentElement?.matches?.('[data-pool-chain]')?element.parentElement.dataset.poolChain:null;
   decorate(d,element,chainSymbolForId(explicit)||chainSymbolForText(element.textContent));
  }
  for(const id of CHAIN_SYMBOL_SURFACES.selects){const select=d.getElementById(id);if(select)selectedBadge(d,select);}
 };
 refresh();
 for(const id of CHAIN_SYMBOL_SURFACES.selects){const select=d.getElementById(id);if(!select)continue;const update=()=>selectedBadge(d,select);select.addEventListener('change',update);listeners.push([select,'change',update]);}
 for(const [attribute,titleIds] of Object.entries(CHAIN_SYMBOL_SURFACES.dynamic))for(const control of d.querySelectorAll('['+attribute+']')){
  const update=()=>{const chain=chainSymbolForId(control.getAttribute(attribute));for(const id of titleIds)decorate(d,d.getElementById(id),chain);};
  control.addEventListener('click',update);listeners.push([control,'click',update]);
 }
 return Object.freeze({refresh,dispose(){for(const [node,type,listener] of listeners)node.removeEventListener(type,listener);}});
}

if(globalThis.document)bindChainSymbols();
