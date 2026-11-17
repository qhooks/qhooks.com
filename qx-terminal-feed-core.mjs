import{fundFor}from'./qx-fund-catalog.mjs';
import{quickBuyPlan}from'./qx-quick-buy-plan.mjs';
import{priceLabel,observedAge}from'./qx-price-presentation.mjs';
import{createFeedPriceCache}from'./qx-feed-price-cache.mjs';
import {assetPriceFields,priceState,priceObservation} from './qx-price-state.mjs';
import {priceDigits} from './qx-price.mjs'; // one price format sitewide (2026-11-12)
import {tokenAvatar,tokenAvatarSources,avatarImage} from './qx-token-avatar.mjs';
// Discover's data contract and presentation helpers. No DOM, wallet calls or currency estimates.
import {WINDOWS,DISCOVERY_TABS,lifecycle,filterDiscovery} from './qx-discovery-model.mjs';
import { stockPair } from './full-launch/packages/multichain-launch/stock-pairs.mjs';
import { chainById } from './chains.mjs';
import { DIRECT_CHAINS } from './qx-elysium-direct.mjs';
import {safetyChecked,plainMarketError} from './qx-terminal-data.mjs';
import {officialLogo} from './qx-official.mjs';
import {discoveryCandidate,rankDiscovery,compareHotNow} from './qx-discovery-rank.mjs';

export const DASH = '—';
// Chip order (Randall, 2026-11-09): "sol-rh-bnb-Elysium-eth-base-arb".
export const CHAINS = [
  ['all', 'All', null], ['solana', 'Solana', 'solana'], ['4663', 'Robinhood', 'robinhood'], ['56', 'BNB', 'bnb'],
  ['99901', 'Elysium', 'elysium'], ['1', 'Ethereum', 'ethereum'], ['8453', 'Base', 'base'], ['42161', 'Arbitrum', 'arbitrum'],
  ['143', 'Monad', 'monad'],
];
export const TABS = [...DISCOVERY_TABS,['funds','Funds']];
export function feedSourceLabel(source){
 if(typeof source!=='string')return '';
 if(/^dex\s*screener (boosted(?:\/promoted)? tokens|boosts|promoted tokens)$/i.test(source))return 'Boosted tokens · DexScreener';
 if(/^geckoterminal trending pools(?: · prices from dex\s*screener)?$/i.test(source))return 'Trending pools · GeckoTerminal'+(/prices from dex\s*screener/i.test(source)?' · prices from DexScreener':'');
 return source;
}
export const SORT_KEYS = ['hot', 'price', 'm5', 'm15', 'h1', 'h6', 'h12', 'h24', 'd7', 'move', 'volume', 'liquidity', 'mcap', 'txns', 'makers', 'holders'];
export const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegative = value => number(value) !== null && value >= 0 ? value : null;
const trim = value => value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');

export function compact(value) {
  const n = number(value);
  if (n === null) return DASH;
  const a = Math.abs(n);
  for (const [scale, suffix] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (a >= scale) return trim((n / scale).toFixed(1)) + suffix;
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function price(value) {
  const n = nonnegative(value);
  if (n === null) return DASH;
  if (!n) return '0';
  return priceDigits(n) ?? DASH; // the site's one price format (qx-price.mjs)
}

export function money(value, { unit = 'USD', precise = false } = {}) {
  if (nonnegative(value) === null) return DASH;
  const text = precise ? price(value) : compact(value);
  return unit === 'USD' ? '$' + text : text + ' ' + (unit || DASH);
}

export function percent(value) {
  const n = number(value);
  if (n === null) return DASH;
  const p = Number((n * 100).toFixed(2)) || 0;
  // Moves of 1,000% and up read as +2.2K% so the column never truncates.
  const a = Math.abs(p), body = a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toLocaleString('en-US', { maximumFractionDigits: a >= 100 ? 1 : 2 });
  return (p > 0 ? '+' : p < 0 ? '-' : '') + body + '%';
}

export function timestamp(value) {
  if (typeof value === 'string' && value.trim() && !/^\d+(\.\d+)?$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const n = nonnegative(value);
  return n === null || n === 0 ? null : n < 1e12 ? n * 1000 : n;
}

export function age(value, now = Date.now()) {
  const at = timestamp(value);
  if (at === null || !Number.isFinite(now)) return DASH;
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return seconds + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
  return Math.floor(seconds / 86400) + 'd';
}

export function safetyLabel(safety) {
  const labels = { ok: 'No flags', warn: 'Caution', danger: 'Danger' };
  if (!safety || !Object.hasOwn(labels, safety.flag) || safety.flag==='ok'&&!safetyChecked(safety)) return { flag: null, label: 'Not checked', title: 'Not checked' };
  const reasons = Array.isArray(safety.reasons) ? safety.reasons.filter(x => typeof x === 'string' && x.trim()) : [];
  return { flag: safety.flag, label: labels[safety.flag], title: [labels[safety.flag], ...reasons].join(' · ') };
}

export const externalQuick=(chainId,address,quick={})=>quickBuyPlan({chainId,token:address,kind:'external'},quick);
export const launchQuick=(market,quick={})=>quickBuyPlan({chainId:market.chainId,token:market.token,kind:'launch'},quick);

export function launchRow(market) {
  const s = market.summary || {};
  return {
    chainId: String(market.chainId), pool: market.controller, dex: 'QHooks', launch: market,
    token: { address: market.token, symbol: market.symbol, name: market.name, profileImage:market.profileImage,launchImage:market.launchImage,logo: tokenAvatar(market).src || officialLogo(market.chainId, market.token) },
    quote: { symbol: market.quoteSymbol }, createdAt: market.launchedAt,
    priceUsd: s.priceUsd ?? null,priceAt:s.priceAt??market.priceAt??market.observedAt??(s.lastTradeAt?s.lastTradeAt*1000:null),priceSource:s.priceSource,pricePoolId:s.pricePoolId,priceSourceVersion:s.priceSourceVersion,pricesRefreshing:s.pricesRefreshing, volumeUsd: { h24: s.volume24Usd ?? null }, liquidityUsd: s.liquidityUsd ?? null,
    marketCapUsd: s.mcapUsd ?? null, fdvUsd: s.fdvUsd ?? null,
    quoteAmounts: { price: s.price, volume: s.volume24, liquidity: s.liquidity, mcap: s.mcap, unit: market.quoteSymbol },
    change: { m5: null, h1: null, h6: null, h24: s.change24 ?? null },
    txns: { h24: { buys: s.buys24 ?? null, sells: s.sells24 ?? null } }, makers: { h24: null }, safety: null,
  };
}

export function searchRow(hit) {
  return { chainId: String(hit.chainId), pool: '', token: hit, createdAt: hit.createdAt ?? null,
    priceUsd: hit.priceUsd ?? null,priceAt:hit.priceAt??hit.observedAt,priceSource:hit.priceSource,pricePoolId:hit.pricePoolId,priceSourceVersion:hit.priceSourceVersion, change: { h24: hit.change24 ?? null },
    holdersCount:hit.holdersCount??hit.holderCount,holdersAt:hit.holdersAt??hit.observedAt,holdersScope:hit.holdersScope,volumeUsd: { h24: hit.volume24Usd ?? null }, liquidityUsd: hit.liquidityUsd ?? null,
    marketCapUsd: hit.mcapUsd ?? null, fdvUsd: hit.fdvUsd ?? null, safety: null };
}

export function rowKey(row) {
  const address = row.launch?.controller || row.token?.address || '';
  return String(row.chainId) + ':' + (String(row.chainId) === 'solana' ? address : address.toLowerCase()) + ':' + (row.pool || '');
}

export function knownHolderCount(row){const candidates=[row.holdersCount,row.holderCount,typeof row.holders==='number'?row.holders:null,row.launch?.summary?.holders];return candidates.find(n=>Number.isSafeInteger(n)&&n>=0)??null;}

export function rowViewModel(row, { now = Date.now(), quick = {}, window = 'h24' } = {}) {
  const original=row;const chainId = String(row.chainId), rawToken=row.token||{}, fund=fundFor(chainId,rawToken.address), token=fund?{...rawToken,...fund}:rawToken;
  row=assetPriceFields(row,{chainId,token:token.address,at:row.observedAt,now});
  if(priceState(original.capAt,now).usable)row={...row,marketCapUsd:original.marketCapUsd,fdvUsd:original.fdvUsd};
  if(!priceState(row.priceAt,now).usable&&row.quoteAmounts)row={...row,quoteAmounts:{...row.quoteAmounts,price:null,mcap:null}};
  const chain = CHAINS.find(([id]) => id === chainId);
  // Zero means the provider doesn't know the cap: fall back to FDV (tagged), else a dash.
  const known = value => nonnegative(value) > 0 ? value : null;
  const cap = known(row.marketCapUsd) ?? known(row.fdvUsd);
  const buys = nonnegative(row.txns?.h24?.buys), sells = nonnegative(row.txns?.h24?.sells);
  const numeric = {
    ...Object.fromEntries(WINDOWS.map(([key])=>[key,number(row.change?.[key])])),move:number(row.change?.[window]),price: nonnegative(row.priceUsd), m5: number(row.change?.m5), h1: number(row.change?.h1), h6: number(row.change?.h6), h24: number(row.change?.h24),
    holders:knownHolderCount(row),volume: nonnegative(row.volumeUsd?.h24), liquidity: nonnegative(row.liquidityUsd), mcap: cap,
    txns: buys !== null && sells !== null ? buys + sells : null, makers: nonnegative(row.makers?.h24),
  };
  const quote = row.quoteAmounts;
  const displayMoney = (key, precise = false) => numeric[key] !== null ? money(numeric[key], { precise }) :
    quote?.unit && Number(quote[key]) > 0 ? money(quote[key], { unit: quote.unit, precise }) : DASH; // no "0 WETH" cap for an untraded launch (quoteusd)
  const capValue=displayMoney('mcap'),capKind=known(row.marketCapUsd)===null&&known(row.fdvUsd)!==null?'FDV':'';
  const symbol = typeof token.symbol === 'string' && token.symbol.trim() ? token.symbol : '?';
  const address = typeof token.address === 'string' ? token.address : '';
  return {
    key: rowKey(row), row, fund, window, capAt:row.capAt,capLabel:priceLabel(Object.hasOwn(row,'capAt')?row.capAt:row.observedAt,{now,refreshing:!!row.capsRefreshing,cached:!!row.capsCached}),capsRefreshing:!!row.capsRefreshing,priceAt:row.priceAt,priceLabel:priceLabel(row.priceAt,{now,refreshing:!!row.pricesRefreshing,cached:!!row.pricesCached}),holderAge:observedAge(Object.hasOwn(row,'holdersAt')?row.holdersAt:row.observedAt,now),priceRefreshing:!!row.pricesRefreshing, chainId, chainName: chain?.[1] || chainId, chainIcon: chain?.[2], address,
    lifecycle:lifecycle(row),move:percent(numeric.move),symbol, name: typeof token.name === 'string' ? token.name : '', logo: safeLogo(token.logo) || safeLogo(officialLogo(chainId, address)),
    avatarSources:tokenAvatarSources({...row.launch,...row,...token},[officialLogo(chainId,address)]),
    letter: symbol.replace(/^\$/, '').slice(0, 1).toUpperCase() || '?', age: age(row.createdAt, now),
    price: displayMoney('price', true), m5: percent(numeric.m5), h1: percent(numeric.h1), h6: percent(numeric.h6), h24: percent(numeric.h24),
    holders:compact(numeric.holders),volume: displayMoney('volume'), liquidity: displayMoney('liquidity'), mcap: capValue,
    capKind,capCaption:capValue===DASH?'syncing':capKind,
    buys: compact(buys), sells: compact(sells), makers: compact(numeric.makers), numeric,
    // A paid DexScreener boost says so (server/market-freshness.mjs stamps the boosts fallback's rows).
    boosted: !row.launch && (row.provenance?.discoverySource === 'dexscreener_token_boosts'||row.provenance?.promoted===true),
    safety: safetyLabel(row.safety), quick: row.launch ? launchQuick(row.launch, quick) : externalQuick(chainId, address, quick),
  };
}

export function safeLogo(url) {
  if (typeof url !== 'string') return null;
  return avatarImage(url);
}

export function sortRows(rows, sort = {}) {
  if (!SORT_KEYS.includes(sort.key)) return [...rows];
  if(sort.key==='hot')return [...rows].sort((a,b)=>(sort.direction==='asc'?-1:1)*compareHotNow(a.row,b.row,{window:a.window||'h24'}));
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = number(a.numeric[sort.key]), y = number(b.numeric[sort.key]);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return (x - y) * sign;
  });
}

export function preferences(storage) {
  const read = key => { try { return storage?.getItem('qxt:discover:' + key); } catch { return null; } };
  let sort;
  try { sort = JSON.parse(read('sort')); } catch {}
  return {
    // First open: Trending (main, 2026-11-12 walk: the server's All Gainers list is DexScreener boosts and too few of them
    // rank, so Gainers opened thin and fell back to browser reads). Was Gainers (Randall, 2026-11-09). A saved choice wins.
    tab: ['launches', ...TABS.map(([id]) => id)].includes(read('tab')) ? read('tab') : 'trending',
    chain: CHAINS.some(([id]) => id === read('chain')) ? read('chain') : 'all',
    sort: SORT_KEYS.includes(sort?.key) ? { key: sort.key, direction: sort.direction === 'asc' ? 'asc' : 'desc' } : { key: null, direction: 'desc' },
  };
}

export function savePreference(storage, key, value) {
  try { storage?.setItem('qxt:discover:' + key, typeof value === 'string' ? value : JSON.stringify(value)); } catch {}
}

export const hasTokenHash = hash => /^#(?:t|m|pool)=/.test(hash || '');

// One in-flight request per selection. A late response must never replace a newer tab's rows.
// The server list and the visitor's own browser read (qx-browser-market.mjs) race: the browser read starts once the
// server has not answered with a full, current list within browserDelay (or at once when the server fails), and
// whichever answers first paints. Server rows stay first once both are in (dedupe by chain + token). The last good
// list per view is kept on the device, so a reload paints it at once and a failed refresh keeps it ("Refreshing…").
export function createFeedLoader({ fetcher, changed, timeout = 12000, serverTimeout = 12000, browserDelay = 2500, browser = null, storage = null, minRows = 12, cacheRead = null, cacheWrite = null, priceCache = null }) {
  let generation = 0, active = null, pendingKey = null, pendingPromise = null;
  const cache = new Map(),prices=priceCache||createFeedPriceCache({storage});
  function cancel() { generation++; active?.abort(); active = null; pendingKey = pendingPromise = null; }
  const usable = rows => (Array.isArray(rows) ? rows : []).filter(r => r && r.token && typeof r.token.address === 'string' && CHAINS.some(([id]) => id !== 'all' && id === String(r.chainId)));
  // A server-filtered list (discofeed) is the whole answer for its filters, however short: never top it up or re-floor it.
  const full = (data,chain,filters) => {
    if(!data||data.stale===true)return false;
    if(data.tab==='trending'&&data.selectionPolicy?.id==='liquid-momentum-v1')return data.selectionPolicy.receivedSetFiltered===true&&data.filtered===true&&data.coverage?.degraded===false&&data.status!=='unavailable'&&!data.error&&data.refreshing!==true;
    if(data.filtered===true&&data.coverage?.degraded!==true&&data.status!=='unavailable'&&!data.error&&(data.rows.length===0?data.refreshing!==true:filterParams(filters).length>0))return true;
    const rows=data.rows.filter(discoveryCandidate);
    if(rows.length<minRows)return false;
    if(chain!=='all')return true;
    const chains=new Map();for(const r of rows)chains.set(String(r.chainId),(chains.get(String(r.chainId))||0)+1);
    return [...chains.values()].filter(n=>n>=3).length>=3;
  };
  // The server's discovery feed has no Elysium list (400 invalid_query, polled every 30 s): read it in the browser only.
  const SERVER_SKIP = new Set(['99901']);
  // Gainers/Losers rank the whole received set by the window's move; dust (under $10k liquidity or 24 h volume) can't top it.
  const FLOOR = 10000;
  const MOVERS = ['gainers', 'losers'];
  function rankRows(rows, tab, window) {
    const move = r => { const v = r.change?.[window]; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
    const ok = r => !r.launch ? (Number(r.liquidityUsd) >= FLOOR && Number(r.volumeUsd?.h24) >= FLOOR) : true;
    return rows.filter(r => move(r) !== null && (tab === 'gainers' ? move(r) > 0 : move(r) < 0) && ok(r))
      .sort((a, b) => tab === 'gainers' ? move(b) - move(a) : move(a) - move(b));
  }
  function ranked(data, tab, window) {
    if (!data || !MOVERS.includes(tab) || data.filtered === true) return data;
    const rows = rankRows(data.rows, tab, window);
    return rows.length ? { ...data, rows } : data;
  }
  // Filters travel to the server (it filters the whole pool before its top-N cut); only the set ones are sent.
  const filterParams = filters => Object.entries(filters || {}).filter(([k, v]) => ['liquidityMin','liquidityMax','capMin','capMax','volumeMin','transactionsMin','ageMinHours','ageMaxHours','venue','hasSocials'].includes(k) && v !== '' && v != null).sort(([a], [b]) => (a < b ? -1 : 1));
  async function serverRead(tab, chain, window, parent, filters) {
    if (SERVER_SKIP.has(String(chain))) return null;
    const controller = new AbortController(), abort = () => controller.abort(), timer = setTimeout(abort, serverTimeout);
    parent.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetcher('/api/terminal/market/feed?' + new URLSearchParams([['tab', tab], ['chain', chain], ['window', window], ...filterParams(filters)]), { cache: 'no-store', signal: controller.signal });
      const body = await response.json();
      if (!response.ok || body?.version !== 1 || !Array.isArray(body.rows)) return null;
      return { ...body, rows: usable(body.rows) };
    } catch { return null; } finally { clearTimeout(timer); parent.removeEventListener('abort', abort); }
  }
  function merged(server, own, tab, chain, window, filters = {}) {
    const extra = filterDiscovery(usable(own?.rows),{tab,window,filters:Object.fromEntries(filterParams(filters))});
    if (!extra.length) return server?.rows.length ? server : null;
    const seen = new Map(), rows = [];
    for (const r of [...(server?.rows || []), ...extra]) {
      const k = String(r.chainId) + ':' + (String(r.chainId) === 'solana' ? r.token.address : r.token.address.toLowerCase());
      if (!seen.has(k)) { seen.set(k,rows.length); rows.push(r); }
      else {
        const i=seen.get(k),a=rows[i],newer=r.stale!==true&&(a.stale===true||(r.observedAt||0)>(a.observedAt||0))?r:a;
        rows[i]={...newer,provenance:{...newer.provenance,...(a.provenance?.promoted===true||r.provenance?.promoted===true?{promoted:true}:{})}};
      }
    }
    const serverFresh = server && server.rows.length && server.stale !== true;
    const ordered=tab==='trending'?rankDiscovery(rows,{window,chain,filters,limit:chain==='all'?100:Infinity}):rows;
    return { version: 1, ...(server || {}), tab, chain, window, rows:ordered, total:ordered.length, pool:rows.filter(discoveryCandidate).length, browser: true, status: undefined, error: undefined, fallback: undefined,
      source: [server?.rows.length ? feedSourceLabel(server.source) : null, ...String(own.source || '').split(' · ')].filter((v, i, all) => v && !all.slice(0, i).some(p => p && p.includes(v))).join(' · ') || null,
      observedAt: serverFresh ? server.observedAt : own.observedAt, stale: serverFresh ? !!server.stale : false };
  }
  function load(tab, chain,window='h24', filters = {}) {
    const fkey = filterParams(filters).map(([k, v]) => k + '=' + v).join('&'),key=tab+':'+chain+':'+window+(fkey?':'+fkey:'');
    if(pendingKey===key&&pendingPromise)return pendingPromise;
    cancel();const mine=generation,snapshot=Object.fromEntries(filterParams(filters));pendingKey=key;
    const task=Promise.resolve().then(()=>runLoad(tab,chain,window,snapshot,mine,key));pendingPromise=task;
    void task.finally(()=>{if(pendingPromise===task){pendingKey=pendingPromise=null;}}).catch(()=>{});return task;
  }
  async function runLoad(tab,chain,window,filters,mine,key) {
    if(mine!==generation)return;
    const controller = new AbortController();
    active = controller;
    const retainedData=cache.get(key)||cacheRead?.(storage,key)||null,retained=prices.reconcile(retainedData?{...retainedData,cached:true}:null);
    changed({ key, loading: true, data: retained, error: null });
    const timer = setTimeout(() => controller.abort(), timeout);
    let server = null, serverDone = false, own = null, ownRun = null, early, settled = false;
    const live = () => mine === generation && !settled;
    const partialKey=r=>String(r.chainId)+':'+(r.chainId==='solana'?r.token.address:r.token.address.toLowerCase());
    const partialOrder=new Map((retained?.rows||[]).map((r,i)=>[partialKey(r),i]));
    const stablePartial=data=>{if(!data?.rows)return data;for(const r of data.rows){const id=partialKey(r);if(!partialOrder.has(id))partialOrder.set(id,partialOrder.size);}return {...data,rows:[...data.rows].sort((a,b)=>partialOrder.get(partialKey(a))-partialOrder.get(partialKey(b)))};};
    const paintPartial = () => { const data = stablePartial(ranked(merged(server, own, tab, chain, window,filters), tab, window)); if (live() && data?.rows.length) changed({ key, loading: true, data, error: null }); };
    const startOwn = () => {
      if (!browser) return Promise.resolve();
      return ownRun ||= browser({ tab, chain, window, filters, signal: controller.signal, onPartial: d => {
        if(!live())return;
        d=prices.reconcile(d);own = {...d,rows:merged(own,d,tab,chain,window,filters)?.rows||[]};
        paintPartial();
      } }).catch(() => null).then(d => { own = prices.reconcile(d) || own; if (!serverDone) paintPartial(); });
    };
    try {
      if (browser) early = setTimeout(() => { if (!serverDone) void startOwn(); }, browserDelay);
      server = prices.reconcile(await serverRead(tab, chain, window, controller.signal, filters)); serverDone = true;
      if (!live()) return;
      // Movers count as full only when enough rows survive the ranking (the server's All list is mostly unranked boosts).
      const enough = d => full(d,chain,filters) && (d.filtered === true || !MOVERS.includes(tab) || rankRows(d.rows, tab, window).length >= minRows);
      if (browser && !enough(server)) {
        // Paint whatever the server had while the browser read finishes.
        if (server?.rows.length) paintPartial();
        await startOwn();
        if (!live()) return;
      }
      let data = ranked(enough(server) ? server : merged(server, own, tab, chain, window,filters), tab, window);
      // A provider limit can make one refresh much thinner than the last good list: keep those rows behind the new ones
      // and say "Refreshing…" (stale) until a full read lands, instead of shrinking the list on screen.
      if (data?.rows.length && data.filtered !== true && retained?.rows?.length && data.rows.length < retained.rows.length / 2) {
        const seen = new Set(data.rows.map(r => String(r.chainId) + ':' + String(r.token.address).toLowerCase()));
        data = { ...data, rows: [...data.rows, ...retained.rows.filter(r => r?.token?.address && !seen.has(String(r.chainId) + ':' + String(r.token.address).toLowerCase()))], stale: true };
      }
      // A valid 200-empty received set is not a fetch failure. Keep its partial
      // coverage/refresh flags; existing fallback and retained rows still win.
      const emptyRead=!data?.rows.length&&!retained?.rows?.length&&server?.rows.length===0&&!server.error&&server.status!=='unavailable';
      if(emptyRead)data=server;
      // An empty server-filtered answer is the answer (nothing matches), not a failed read.
      if (!data?.rows.length && data?.filtered !== true && !emptyRead) {
        if (retained?.rows?.length) { changed({ key, loading: false, data: { ...retained, stale: true }, error: null }); return; }
        throw new Error(plainMarketError());
      }
      cache.set(key, data); cacheWrite?.(storage, key, data);
      changed({ key, loading: false, data, error: null });
    } catch (error) {
      if (!live()) return;
      changed({ key, loading: false, data: retained, error: error.name === 'AbortError' ? 'Feed request timed out. Try again.' : plainMarketError() });
    } finally {
      settled = true;
      controller.abort();
      clearTimeout(timer); clearTimeout(early);
      if (mine === generation) active = null;
    }
  }
  return { load, cancel };
}
