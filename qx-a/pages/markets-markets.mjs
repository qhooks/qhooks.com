// Markets in System A: the shell, a band of live launches, and live numbers on every directory row.
// The directory search, paging, validation and Open market flow stay in /qx-market-browser.mjs; this fills each row's
// price, 24h change, market cap and last trade from the public launch feed, matched by chain and controller.
import { laneShell, visiblePoll } from './markets-shell.mjs';
import { launchFeed, coinEl, priceText, capText, changeText, tick, ageClock } from './markets-live.mjs';
import { chainById } from '/chains.mjs';
import {marketQuoteState,createMarketQuoteLookup} from '/qx-market-quote-state.mjs';
import {priceDigits} from '/qx-price.mjs';

laneShell({ active: 'trade' });
const $ = (id) => document.getElementById(id);
const make = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k)); return n; };
let feed = new Map(), prev = new Map(), lastRows=[], feedFailed=false, feedSettled=false, dead=false, pollFlight=null;
const lookup=createMarketQuoteLookup(),results=$('qm-results');
const quoteControl=make('div','mkm-quote-reading'),quoteStatus=make('span'),quoteRetry=make('button',null,'Refresh quotes');quoteRetry.type='button';quoteStatus.setAttribute('role','status');quoteStatus.setAttribute('aria-live','polite');quoteControl.append(quoteStatus,quoteRetry);results.before(quoteControl);
const descriptors=()=>[...results.querySelectorAll('[data-market]')].map(card=>{const [chainId,controller]=card.dataset.market.split(':');return {chainId,controller,token:card.dataset.token||controller};});
const ageLabel=ms=>{const s=Math.max(0,Math.floor(ms/1000));return s<60?s+'s':s<3600?Math.floor(s/60)+'m':Math.floor(s/3600)+'h';};
const priceLabel=view=>view?.usable?(view.unit==='USD'?'$':'')+priceDigits(view.value)+(view.unit==='USD'?'':' '+view.unit):'—';
function views(card,cache){
 const key=card.dataset.market.toLowerCase(),observed=marketQuoteState(feed.get(key)),direct=observed?.token===card.dataset.token?.toLowerCase()?observed:null,retained=marketQuoteState(cache.get(key)),usable=[direct,retained].filter(v=>v?.usable).sort((a,b)=>(b.quoteAt||0)-(a.quoteAt||0));
 return {direct,retained,quote:usable[0]||null};
}
function cachedViews(){return new Map(lookup.cached(descriptors()).map(row=>[String(row.chainId)+':'+String(row.controller||row.address).toLowerCase(),row]));}
function fillRows() {
 if(dead)return;
 // Off-screen feed rows must not evict the visible lookup's admission leases.
 if(!feedFailed)lookup.seed(descriptors().map(row=>{const observed=feed.get(row.chainId+':'+row.controller.toLowerCase());return marketQuoteState(observed)?.token===row.token.toLowerCase()?observed:null;}).filter(Boolean));
 const cache=cachedViews();let missing=0;
 for (const card of results.querySelectorAll('[data-market]')) {
  const {direct,retained,quote}=views(card,cache),k=card.dataset.market,px=card.querySelector('.mk-card__px');
  tick(px,priceLabel(quote),quote?.value,prev.get(k));if(quote)prev.set(k,quote.value);
  px.title=quote?String(quote.value)+' '+quote.unit+' · observed '+new Date(quote.quoteAt).toISOString():'No recent price observation is available.';
  const change=[direct,retained].filter(v=>Number.isFinite(v?.change24)).sort((a,b)=>(b.changeAt||0)-(a.changeAt||0))[0]?.change24??null,chg=card.querySelector('.mk-card__chg');chg.textContent=changeText(change);chg.className='mk-card__chg '+(change>0?'qa-up':change<0?'qa-down':'qa-muted');
  const cap=direct?.marketCapUsd??retained?.marketCapUsd??null;card.querySelector('.mk-card__mc').textContent='MC '+capText(cap);
  const age=card.querySelector('.mk-card__age');age.removeAttribute('data-ts');age.textContent=quote?'Updated '+ageLabel(quote.age)+' ago':'Quote unavailable';
  card.classList.toggle('has-live',!!quote);card.classList.toggle('has-quote-error',!!quote?.quoteReadFailed||feedFailed);
  if(!quote)missing++;
 }
 const readFailed=feedFailed||[...cache.values()].some(row=>row.quoteReadFailed);
 quoteStatus.textContent=readFailed?'Could not update quotes. Retained observations keep their original age.':missing?missing+' market'+(missing===1?'':'s')+' without a recent quote.':'Quotes show their original observation age.';
}
async function readMissing({force=false}={}){
 if(dead||!feedSettled||document.hidden)return;const rows=descriptors().filter(row=>{const direct=marketQuoteState(feed.get(row.chainId+':'+row.controller.toLowerCase()));return feedFailed||!direct?.usable||direct.token!==row.token.toLowerCase();});
 if(!rows.length){fillRows();return;}quoteRetry.disabled=true;
 try{await lookup.read(rows,{force});}finally{if(!dead){quoteRetry.disabled=false;fillRows();}}
}

/* the band: live launches by 24h volume, scrolling; their prices tick in place */
let bandKey = '';
function paintBand(rows) {
  const band = $('mkm-band'); if (!band) return;
  const live = rows.map(row=>{const state=marketQuoteState(row);return {...row,...state,change:state?.change24??null,volUsd:state?.volume24Usd??null};}).filter((r) => r.live && r.priceUsd != null).sort((a, b) => (b.volUsd || 0) - (a.volUsd || 0));
  if (!live.length) { band.hidden = true; return; }
  const key = live.map((r) => r.key).join(',');
  if (key !== bandKey) {
    bandKey = key;
    const track = make('div', 'mkm-band__track');
    for (let copy = 0; copy < 3; copy++) for (const r of live) {
      const a = make('a', 'mkm-band__item', coinEl(r, 'mk-coin mkm-band__coin'), make('b', null, r.symbol), make('span', 'mkm-band__px'), make('span', 'mkm-band__chg'), make('small', null, chainById(r.chainId)?.short || ''));
      a.href = '/terminal.html#m=' + r.chainId + ':' + r.controller; a.dataset.key = r.key;
      if (copy) { a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; }
      track.append(a);
    }
    band.replaceChildren(track); band.hidden = false;
  }
  for (const a of band.querySelectorAll('[data-key]')) {
    const r = live.find((x) => x.key === a.dataset.key); if (!r) continue;
    tick(a.querySelector('.mkm-band__px'), priceText(r.priceUsd), r.priceUsd, a.hasAttribute('aria-hidden') ? null : prev.get('band:' + r.key));
    const c = a.querySelector('.mkm-band__chg'); c.textContent = changeText(r.change); c.className = 'mkm-band__chg ' + (r.change > 0 ? 'qa-up' : r.change < 0 ? 'qa-down' : 'qa-muted');
  }
  for (const r of live) prev.set('band:' + r.key, r.priceUsd);
}

let forceLookup=false;
async function pollQuotes({force=false}={}){
 if(force)forceLookup=true;
 if(pollFlight)return pollFlight;
 pollFlight=(async()=>{try{const rows=await launchFeed();if(dead)return;lastRows=rows;feed=new Map(rows.map(r=>[r.key,r]));feedFailed=false;}catch{feedFailed=true;}finally{feedSettled=true;}
  if(!dead){paintBand(lastRows);fillRows();await readMissing({force:forceLookup});}
 })().finally(()=>{pollFlight=null;forceLookup=false;});return pollFlight;
}
const stopPoll=visiblePoll(pollQuotes,15e3);
const observer=new MutationObserver(()=>{fillRows();if(feedSettled)void readMissing();});observer.observe(results,{childList:true});
// Reuse the existing source-age clock; no extra price poll or expiry timer.
const ageTimer=ageClock(results,{beforePaint(){fillRows();paintBand(lastRows);}});
const wake=()=>{if(!document.hidden){fillRows();paintBand(lastRows);}};document.addEventListener('visibilitychange',wake);
const manual=async()=>{if(quoteRetry.disabled||dead)return;quoteRetry.disabled=true;try{await pollQuotes({force:true});}finally{if(!dead)quoteRetry.disabled=false;}};
quoteRetry.addEventListener('click',manual);$('qm-retry')?.addEventListener('click',manual);
addEventListener('pagehide',()=>{dead=true;stopPoll();observer.disconnect();clearInterval(ageTimer);document.removeEventListener('visibilitychange',wake);});
