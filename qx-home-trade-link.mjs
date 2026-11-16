import{chainById}from'./chains.mjs';
import{launchQuick}from'./qx-terminal-feed-core.mjs';
export function homeTradeLink(m,{storage}={}){
 let quick={};try{quick=JSON.parse(storage?.getItem('qhooks:terminal:quick')||'{}')}catch{}
 const q=launchQuick(m,quick),chain=String(m.chainId),token=chain==='solana'?m.token:String(m.controller||m.token||'').toLowerCase();
 if(!(chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token||''):/^\d+$/.test(chain)&&/^0x[0-9a-f]{40}$/.test(token)))return null;
 const amount=/^\d{1,18}(?:\.\d{1,18})?$/.test(q.value)&&Number(q.value)>0?q.value:({eth:'0.01',bnb:'0.05',hype:'0.1',usd:'10'})[q.cls];
 const native=chainById(chain)?.native,matchingNative=!!native&&['eth','bnb','hype'].includes(q.cls)&&q.unit===native&&!q.stock;
 // The existing legacy amt contract always selects native payment. A dollar quick
 // amount must never be reinterpreted as ETH/SOL. Other quotes open their own ticket.
 const route={[chain==='solana'?'t':'m']:chain+':'+token,...matchingNative?{side:'buy',amt:amount}:{}};
 return {href:'/terminal#'+new URLSearchParams(route).toString(),label:(matchingNative?'Buy ':'Trade ')+(m.symbol||'token'),amount:matchingNative?amount:null,unit:q.unit};
}
