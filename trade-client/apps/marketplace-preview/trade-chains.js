// Fixed six-chain boundary, including Arc native/ERC20 paired receipt checks.
import {bindTradePage} from './trade-remembered-page.mjs';
bindTradePage({
 loadClient:async()=>Object.assign({},...await Promise.all([
  import('/full-launch/prototypes/qwallet/client/wallet-session.mjs'),
  import('/full-launch/packages/multichain-launch/dependencies.mjs')
 ])),
 loadSwap:async()=>{const m=await import('/full-launch/packages/multichain-swap/connected-chains.mjs');return m.createConnectedSwap;},
 loadArtifacts:async()=>Object.fromEntries(await Promise.all([
  ['toolkitText','toolkit.json',1000000],['metadataText','metadata.json',100000],['policyText','dependencies.json',100000]
 ].map(async([key,name,limit])=>{const r=await fetch('/full-launch/'+name,{redirect:'error',cache:'no-store'});if(!r.ok)throw Error('Trade configuration unavailable');const text=await r.text();if(text.length>limit)throw Error('Trade configuration too large');return [key,text];})))
});
