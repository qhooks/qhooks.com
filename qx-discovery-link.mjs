// Shareable discovery views (D5, 2026-11-18): /terminal?tab=trending&chain=4663&window=6h[&view=pulse].
// A link sets tab/chain/window/layout for that visit only (localStorage is not written); chip changes rewrite the
// query with history.replaceState so the address bar is always the view on screen. Pure helpers plus one sync call.
const CHAIN_ALIASES={sol:'solana',rh:'4663',robinhood:'4663',bsc:'56',bnb:'56',eth:'1',ethereum:'1',base:'8453',arb:'42161',arbitrum:'42161',monad:'143',elysium:'99901',ely:'99901'};
const WINDOW_ALIASES={'7d':'d7','1w':'d7',w1:'d7','24h':'h24','1d':'h24'};
const lower=v=>String(v??'').trim().toLowerCase();
/** Parse a query string. Unknown or invalid values are ignored (never guessed). Returns only the fields the link set. */
export function readDiscoveryLink(search,{tabs=[],chains=[],windows=[]}={}){
 let params;try{params=new URLSearchParams(search||'');}catch{return {};}
 const out={},tab=lower(params.get('tab')),chain=lower(params.get('chain')),window=lower(params.get('window')),view=lower(params.get('view'));
 if(tab&&tabs.includes(tab))out.tab=tab;
 if(chain){const hit=chains.find(([id,,slug])=>lower(id)===chain||slug&&lower(slug)===chain)||chains.find(([id])=>id===CHAIN_ALIASES[chain]);if(hit)out.chain=hit[0];}
 if(window){const hit=windows.find(([key,label])=>key===window||lower(label)===window)||windows.find(([key])=>key===WINDOW_ALIASES[window]);if(hit)out.window=hit[0];}
 if(view==='pulse'||view==='list')out.layout=view;
 return out;
}
/** The canonical query for a view, keeping every unrelated parameter. Window is written as its label (6h). */
export function discoveryLinkSearch(search,{tab,chain,window,layout},{windows=[]}={}){
 const params=new URLSearchParams(search||'');
 if(tab)params.set('tab',tab);if(chain)params.set('chain',String(chain));
 const label=windows.find(([key])=>key===window)?.[1];if(label)params.set('window',label);
 if(layout==='pulse')params.set('view','pulse');else params.delete('view');
 // The older ?discover= entry point is consumed on load; the explicit view replaces it.
 params.delete('discover');
 const text=params.toString();return text?'?'+text:'';
}
/** Rewrite the address bar to the view (no history entry, hash kept). Returns true when it changed. */
export function syncDiscoveryLink(view,{location:loc=globalThis.location,history:hist=globalThis.history,windows=[]}={}){
 if(!loc||!hist?.replaceState)return false;
 // A token page is open (#t=chain:token or #m=chain:controller): its URL belongs to the token view, so the list's chips never rewrite it
 // (rewriting it turned a token reload into a full navigation that cancelled in-flight reads, 2026-11-18).
 if(/(^#|&)[tm]=/.test(String(loc.hash||'')))return false;
 const next=discoveryLinkSearch(loc.search,view,{windows});
 if(next===loc.search)return false;
 try{hist.replaceState(hist.state,'',loc.pathname+next+loc.hash);return true;}catch{return false;}
}
