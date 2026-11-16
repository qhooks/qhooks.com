import {h,connectedAddress,onWalletChange} from './qx-chain.mjs';
import {createCreatorIncomeReader} from './qx-creator-income.mjs';
const $=id=>document.getElementById(id),reader=createCreatorIncomeReader(),short=a=>String(a||'').slice(0,6)+'…'+String(a||'').slice(-4);
const known=n=>typeof n==='number'&&Number.isFinite(n),count=n=>known(n)?n.toLocaleString(undefined,{maximumFractionDigits:2}):'—',money=n=>known(n)?'$'+n.toLocaleString(undefined,{maximumFractionDigits:2}):'—';
export function incomeUnits(raw,decimals){
  if(raw==null||!Number.isInteger(decimals))return '—';const n=BigInt(raw),scale=10n**BigInt(decimals),whole=n/scale,part=(n%scale).toString().padStart(decimals,'0'),digits=part.slice(0,Math.min(6,decimals)).replace(/0+$/,'');
  if(n&&whole===0n&&!digits)return '<'+(decimals?'0.'+'0'.repeat(Math.min(6,decimals)-1)+'1':'1');
  return whole.toLocaleString()+(digits?'.'+digits:'');
}
const amount=(asset,raw)=>incomeUnits(raw,asset.decimals)+' '+asset.symbol;
let generation=0,timer=null,current=null,postKey=null;
const status=(id,message)=>$(id)?.replaceChildren(h('p',{class:'qcd-muted',role:'status'},message));
function metrics(data){
  const m=data.metrics,values=[['Holders',count(m.holders),'Holding this token'],['24h volume',known(m.volume24Usd)?money(m.volume24Usd):known(m.volume24)?count(m.volume24)+' '+(m.quoteSymbol||'quote'):'—','Recorded trading volume'],['Burned',count(m.burned),data.symbol],['Team locked',count(m.locked),data.symbol]];
  $('qc-stats')?.replaceChildren(...values.map(([label,value,note])=>h('div',{class:'qa-tile qcd-metric'},h('span',{},label),h('b',{},value),h('small',{},note))));
  const stamp=$('qc-data-age');if(stamp){stamp.title=data.asOf?new Date(data.asOf).toLocaleString():'';stamp.textContent=(data.status==='ready'?'Updated ':'Refreshing · last record ')+(data.asOf?new Date(data.asOf).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'pending');}
}
function income(data){
  const me=String(connectedAddress()||'').toLowerCase(),box=$('qc-income-body');if(!box)return;
  const rows=data.currencies.map(a=>h('div',{class:'qcd-income-asset'},h('h3',{},a.symbol),h('dl',{},...['earned','paid','pending'].flatMap(k=>[h('dt',{},k==='earned'?'Earned':k==='paid'?'Paid out':'Pending payout'),h('dd',{},amount(a,a[k]))]))));
  const priorDetails=box.querySelector('details'),expanded=!!priorDetails?.open,focused=priorDetails?.contains(document.activeElement);
  const split=h('div',{class:'qcd-split-rows'},...data.payees.map(p=>h('div',{class:'qcd-split-row'},h('div',{},h('code',{},short(p.address)),p.address===me?h('span',{class:'qcd-you'},'you'):null,h('small',{},(p.bps/100)+'%')),h('span',{},...data.currencies.map(a=>h('small',{},amount(a,a.payees.find(v=>v.address===p.address)?.pending)))))));
  box.replaceChildren(h('p',{class:'qcd-muted'},'All payees, separated by asset. '+(data.complete?'Confirmed release history is complete.':data.status+'. Lifetime earned stays blank until the history is complete.')),h('div',{class:'qcd-income-grid'},...rows),h('details',{},h('summary',{},'Who receives the pending payout'),split),h('p',{class:'qcd-caption'},(data.stale?'Refreshing · last good ':'')+'Block '+data.block.toLocaleString()+' · '+new Date(data.timestamp).toLocaleString()));
  const detail=box.querySelector('details');if(detail){detail.open=expanded;if(focused)detail.querySelector('summary')?.focus();}
  const b=data.buyback,pot=data.currencies.find(a=>a.address===current?.incomeSource?.quote);if(b&&pot){const share=b.enabled?BigInt(b.shareBps||0):0n;$('qc-buyback')?.replaceChildren(...[h('h3',{},'Buyback status'),h('p',{class:'qcd-flow-value'},share===0n?'Not configured':b.pot==null?'Refreshing':amount(pot,b.pot)+' in the buyback pot'),share>0n&&b.last&&b.last!=='0'?h('p',{class:'qcd-muted'},'Last buyback '+new Date(Number(b.last)*1000).toLocaleString()):null].filter(Boolean));}
}
async function flows(data,id){
  const box=$('qc-splitter-flows');if(!box)return;
  if(!data.splitter){box.replaceChildren(h('p',{class:'qcd-muted'},'Burn totals are shown above. This launch has no registered splitter feed.'));return;}
  try{const r=await fetch(data.splitter.stats,{cache:'no-store'});if(!r.ok)throw Error();const feed=await r.json();if(id!==generation)return;
    const t=feed.totals,unit=v=>feed.placeholder?'—':(feed.totalsStatus==='partial'?'≥ ':'')+amount(v,v.raw);
    box.replaceChildren(h('p',{class:'qcd-muted',role:'status'},feed.status),h('div',{class:'qcd-flow-grid'},...[['Bought and burned',t.boughtAndBurned],['Buybacks',t.buybacks],['Sent to '+feed.symbol+' liquidity',t.liquidityQuote],['Token liquidity',t.liquidityToken],['Paid to creator',t.creatorQuote],['Creator token share',t.creatorToken]].map(([label,value])=>h('div',{},h('span',{},label),h('b',{},unit(value))))),h('p',{class:'qcd-caption'},'From indexed splitter events. Liquidity figures show transfers to the range.'),h('a',{class:'qa-link',href:data.splitter.page},'Open live activity →'));
    if(!data.incomeSource){const last=(feed.events||[]).find(e=>e.kind==='buyback'),any=BigInt(t.buybacks.raw)>0n||BigInt(t.boughtAndBurned.raw)>0n;status('qc-buyback',feed.placeholder?'Loading buyback history…':last?'Last recorded buyback: block '+last.block.toLocaleString():any?'Buybacks recorded in the cumulative totals.':feed.totalsStatus==='known'?'No buyback event recorded.':'Loading buyback history…');}
  }catch{if(id===generation)status('qc-splitter-flows','Splitter activity is refreshing.');}
}
function post(data){
  const me=String(connectedAddress()||'').toLowerCase(),key=[data.chainId,data.controller,data.name,data.symbol,data.token,me].join(':');if(key===postKey)return;postKey=key;
  const ref=/^0x[0-9a-f]{40}$/.test(me)?'?ref='+me:'',url='https://qhooks.com/l/'+data.chainId+'/'+data.controller+ref;
  const draft=data.name+' ($'+data.symbol+') is live on QHooks.\n\n'+url+'\n\nContract: '+data.token,actions=h('div',{class:'qcd-post-actions'}),note=h('p',{class:'qcd-caption',role:'status'}),fallback=h('textarea',{rows:6,'aria-label':'Launch draft to copy'});fallback.hidden=true;fallback.value=draft;
  const copy=h('button',{type:'button',class:'qa-btn qa-btn--secondary'},'Copy draft');copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(draft);note.textContent='Draft copied.';}catch{fallback.hidden=false;fallback.focus();fallback.select();note.textContent='Select and copy your draft.';}});
  actions.append(h('a',{class:'qa-btn qa-btn--primary',href:'https://x.com/intent/post?'+new URLSearchParams({text:draft}),target:'_blank',rel:'noopener noreferrer'},'Draft on X ↗'),h('a',{class:'qa-btn qa-btn--secondary',href:'https://t.me/share/url?'+new URLSearchParams({url,text:data.name+' ($'+data.symbol+')'}),target:'_blank',rel:'noopener noreferrer'},'Telegram ↗'),copy);
  const card=h('a',{class:'qa-btn qa-btn--secondary',href:'/share/launch/'+data.chainId+'/'+data.controller+ref},'Make a share card ↗');card.hidden=true;actions.append(card);
  const id=generation;void fetch(card.href,{method:'HEAD',cache:'no-store'}).then(r=>{if(id===generation&&r.ok)card.hidden=false;}).catch(()=>{});
  $('qc-post-body')?.replaceChildren(h('p',{class:'qcd-muted'},'Start with the launch details, then add your story.'),actions,note,fallback);
}
async function refresh(id=generation){
  clearTimeout(timer);if(document.hidden)return;const m=location.hash.match(/m=(\d+):(0x[0-9a-f]{40})/i);if(!m)return;
  try{const r=await fetch('/api/creator/'+m[1]+'/'+m[2].toLowerCase()+'/overview',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();if(id!==generation)return;current=data;metrics(data);post(data);void flows(data,id);
    if(data.incomeSource){const value=await reader.read(data.incomeSource);if(id===generation&&value)income(value);}
    else if(data.splitter)status('qc-income-body','Creator payments are recorded in the splitter activity below.');
    else{status('qc-income-body','Launch-block income is not indexed for this launch. Open the payout panel below.');status('qc-buyback','No indexed buyback feed for this launch.');}
  }catch{if(id===generation)status('qc-income-body','Income is refreshing. Try Refresh, or open the payout panel below.');}
  finally{if(id===generation&&!document.hidden)timer=setTimeout(()=>refresh(id),30000);}
}
function route(){generation++;clearTimeout(timer);current=null;postKey=null;status('qc-income-body','Reading launch income…');status('qc-splitter-flows','Reading recorded flows…');status('qc-buyback','Reading buyback status…');void refresh(generation);}
document.getElementById('qc-refresh-data')?.addEventListener('click',()=>{postKey=null;document.dispatchEvent(new CustomEvent('qhooks:creator-refresh'));void refresh(generation);});
window.addEventListener('hashchange',route);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else void refresh(generation);});onWalletChange(()=>{if(current)post(current);});route();
