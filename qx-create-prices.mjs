// Read-only adapter for the same ETH/USD and BNB/USD reads as qx-balances.mjs.
// Keep its feed addresses, decimals and one-day freshness ceiling unchanged.
// These public RPCs are already permitted by the site's wallet CSP.
import {chainById} from './chains.mjs';
const FEEDS={ETH:['8453','0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70'],BNB:['56','0x0567f2323251f0aab15c8dfb1967e4e8a7d42aee']};
export async function readCreateNativeUSD(symbol,{fetcher=globalThis.fetch,now=Date.now,timers=globalThis}={}){
 // HYPE (Elysium) has no Chainlink feed here: the site's own price route (server/native-prices.mjs, CoinGecko, cached).
 if(symbol==='HYPE'||symbol==='SOL')return readSitePrice(symbol,{fetcher,timers});
 const feed=FEEDS[symbol];if(!feed)return null;
 const controller=new AbortController(),timer=timers.setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetcher(chainById(feed[0]).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:feed[1],data:'0xfeaf968c'},'latest']}),signal:controller.signal});
  if(!response.ok)return null;const body=await response.json(),raw=body.result;
  if(body.error||typeof raw!=='string'||!/^0x[0-9a-f]{320}$/i.test(raw))return null;
  const answer=BigInt('0x'+raw.slice(66,130)),updated=Number(BigInt('0x'+raw.slice(194,258))),at=now()/1000;
  if(answer<=0n||answer>=(1n<<255n)||!Number.isSafeInteger(updated)||updated<=0||updated>at||at-updated>86400)return null;
  const value=Number(answer)/1e8;return Number.isFinite(value)&&value>0?value:null;
 }catch{return null;}finally{timers.clearTimeout(timer);}
}
async function readSitePrice(symbol,{fetcher,timers}){
 const controller=new AbortController(),timer=timers.setTimeout(()=>controller.abort(),8000);
 try{const r=await fetcher('/api/funding/native-prices?symbols='+symbol,{signal:controller.signal});if(!r.ok)return null;
  const v=Number((await r.json())?.prices?.[symbol]);return Number.isFinite(v)&&v>0?v:null;}
 catch{return null;}finally{timers.clearTimeout(timer);}
}
