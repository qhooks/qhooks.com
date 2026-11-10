import {chainById} from './chains.mjs';
const mounts=new WeakMap(),ADDRESS=/^0x[0-9a-f]{40}$/i;
const amount=(raw,decimals)=>{
 if(!/^\d+$/.test(String(raw))||!Number.isInteger(decimals)||decimals<0||decimals>36)return null;
 const digits=String(raw).replace(/^0+(?=\d)/,'').padStart(decimals+1,'0'),whole=decimals?digits.slice(0,-decimals):digits,frac=decimals?digits.slice(-decimals):'';
 const lead=frac.match(/^0*/)[0].length,shown=frac.slice(0,Math.max(4,lead+3)).replace(/0+$/,'');
 return BigInt(whole).toLocaleString('en-US')+(shown?'.'+shown:'');
};
export function timeAgo(ts,now=Date.now()) {
 const seconds=Math.max(0,Math.floor(now/1000-Number(ts)));
 if(!Number.isFinite(seconds))return '—';
 return seconds<60?'just now':seconds<3600?Math.floor(seconds/60)+'m ago':seconds<86400?Math.floor(seconds/3600)+'h ago':Math.floor(seconds/86400)+'d ago';
}
export function recapturePanelView(data,meta,chain,now=Date.now()) {
 if(!chain?.arbRecapture?.executor||data?.error||!meta||String(data?.chainId)!==String(meta.chainId)||data.token?.toLowerCase()!==meta.token?.toLowerCase()||
  ![chain.arbRecapture,...(chain.arbRecaptureMore||[])].some(x=>x?.executor?.toLowerCase()===data.executor?.toLowerCase())||!/^\d+$/.test(data.totals?.burned||'')||BigInt(data.totals.burned)===0n||!data.recent?.length)return null;
 const decimals=Number(meta.decimals),burned=amount(data.totals.burned,decimals);if(burned===null)return null;
 const quotes=new Map(),add=(a,s,d)=>{if(ADDRESS.test(a||''))quotes.set(a.toLowerCase(),{symbol:s,decimals:Number(d)});};
 add(chain.quote?.address,chain.quote?.symbol,chain.quote?.decimals);
 add(chain.wrappedNative,'W'+chain.native,18);add(chain.usdc,'USDC',6);
 add(typeof meta.quote==='string'?meta.quote:meta.quote?.address,meta.quoteSymbol||meta.quote?.symbol||chain.quote?.symbol,meta.quoteDecimals??chain.quote?.decimals);
 const recaptured=[];
 for(const[currency,raw]of Object.entries(data.totals.recaptured||{})) {
  if(!ADDRESS.test(currency)||!/^\d+$/.test(raw)||BigInt(raw)===0n)continue;
  const quote=quotes.get(currency.toLowerCase());
  recaptured.push(quote?amount(raw,quote.decimals)+' '+quote.symbol:raw+' raw units ('+currency.slice(0,6)+'…'+currency.slice(-4)+')');
 }
 if(!recaptured.length)return null;
 const symbol=meta.symbol||'token';
 return {summary:'Burned from arbitrage: '+burned+' '+symbol+' · Recaptured: '+recaptured.join(' + ')+' · last '+timeAgo(data.recent[0].ts,now),
  disclosure:"When this token's price drifts apart between pools, a shared QHooks contract brings it back in line and uses the difference to buy and burn "+symbol+'. 10% of it covers whoever runs it. The launch’s tax and LP fee are paid as on any trade.'};
}
export function renderRecapturePanel(root,view) {
 const open=root.querySelector('details')?.open||false;root.replaceChildren();root.hidden=!view;if(!view)return;
 const doc=root.ownerDocument,el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const details=el('details');details.open=open;details.append(el('summary','How it works'),el('p',view.disclosure));
 root.append(el('h3','Arb recapture'),el('p',view.summary,'qxr-totals'),details);
}
// Idempotent per token render. A changed/cleared selection aborts old reads so a
// slow response cannot place the previous token's totals in the current view.
export function mountRecapturePanel(anchor,meta,{fetchImpl=globalThis.fetch,chain=chainById(meta?.chainId),now=Date.now}={}) {
 if(!anchor)return Promise.resolve();
 const previous=mounts.get(anchor),key=meta&&chain?.arbRecapture?.executor?meta.chainId+':'+meta.token?.toLowerCase():null;
 if(!key){previous?.controller.abort();previous?.root.remove();mounts.delete(anchor);return Promise.resolve();}
 if(previous?.key===key&&now()-previous.at<60000)return previous.promise;
 previous?.controller.abort();
 const doc=anchor.ownerDocument,root=previous?.key===key?previous.root:doc.createElement('section');
 if(previous?.key!==key){previous?.root.remove();root.className='qxr-panel';root.hidden=true;root.setAttribute('aria-label','Arb recapture');anchor.after(root);}
 if(!doc.getElementById('qx-recapture-style')){const link=doc.createElement('link');link.id='qx-recapture-style';link.rel='stylesheet';link.href='/qx-recapture-panel.css';doc.head.append(link);}
 const controller=new AbortController(),record={key,at:now(),root,controller,promise:null};mounts.set(anchor,record);
 record.promise=(async()=>{
  try {
   const response=await fetchImpl('/api/v1/recapture/'+encodeURIComponent(meta.chainId)+'/'+encodeURIComponent(meta.token),{signal:controller.signal});
   const data=await response.json();if(mounts.get(anchor)!==record)return;
   // A failed refresh keeps whatever is already shown (first load stays hidden); only a good answer re-renders.
   if(response.ok)renderRecapturePanel(root,recapturePanelView(data,meta,chain,now()));
  }catch{}
 })();return record.promise;
}
