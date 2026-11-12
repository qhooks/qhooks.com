// QHooks System A: the home page runtime (2026-11-12, the scroll-driven 3D landing). One fixed WebGL stage behind the
// page (qx-a/landing/scene.mjs, three self-hosted, the commercial's hook model) and six pinned chapters that scroll over
// it: the brand line, then Builders, Callers, Holders, Traders, each with one hero object and its live data, then
// "For the next generation." The rest of the page (pulse, contract, places, keys, hooks) follows on the floor.
// Data, all public and same-origin, all read only while the tab is visible:
//   /api/terminal/feed?chain=all                         launches, at load then every 60 s
//   /api/terminal/market/4663/<QHOOKS>?tf=60             QHOOKS price, trades, holders, at load then every 20 s
//                                                        (the terminal reads the same URL every 5 s, so the server cache is shared)
//   /api/terminal/market/<chain>/<controller>?tf=60      the two most active other launches, once at load for the ribbon, then
//                                                        again only when the feed shows a newer trade on them
//   /api/community/activity                              calls, at load then every 60 s
//   /api/qhooks/buybacks                                 read by qx-burn-ticker.mjs (every 20 s); this page listens for its result
// Every motion in the scene beyond the scroll choreography is a real event (a trade, a burn, a call, a launch, a new
// holder). Nothing is replayed or invented. WebGL starts after the first paint; the poster stands in before it and
// stays when there is no WebGL or reduced motion is on.
import { mountShell } from '/qx-a/shell.mjs';
import { profileUrl } from '/qx-profile-address.mjs';
import { fillChainCount } from '/qx-chain-count.mjs';
import { h, icon, RM, fmt, setArt, avatar, keeperAvatar, tokenChip, statStrip, tape, toast, bigPrice, changeLine, post, callOutcome, state, skeletonRows } from '/qx-a/components.mjs';
import '/qx-shell.mjs'; // legacy runtime: wallet copy, get-the-app, proof entry points (its old header code finds no header here)

const QH = '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195', QCHAIN = '4663', QLOGO = '/qhooks-logo.jpg';
const FEED = '/api/terminal/feed?chain=all', CALLS = '/api/community/activity';
const MARKET = (c, a) => `/api/terminal/market/${c}/${a}?tf=60`;
const CHAINS = { '4663': 'Robinhood Chain', '8453': 'Base', '56': 'BNB Chain', '42161': 'Arbitrum', '1': 'Ethereum', '99901': 'Elysium', '143': 'Monad', solana: 'Solana' };
const COIN_ORDER = ['4663', '8453', '56', '42161', '1', '99901', '143', 'solana'];
const COIN_ICONS = ['robinhood', 'base', 'bnb', 'arbitrum', 'ethereum', 'elysium', 'monad', 'solana'].map((n) => `/qx-a/landing/chain-${n}.png`);
const $ = (s, r = document) => r.querySelector(s);
const lower = (v) => String(v || '').toLowerCase();
const nowS = () => Date.now() / 1000;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const abs = (u) => new URL(u, location.href).href;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
// Logos come back as same-origin paths, data: URIs or qhooks.com URLs; keep them on this origin so the CSP allows them.
const logoOf = (u) => { if (typeof u !== 'string' || !u) return null; if (u.startsWith('data:image/') || u.startsWith('/')) return u; try { const x = new URL(u); return x.hostname === 'qhooks.com' ? x.pathname + x.search : null; } catch { return null; } };

/* ================= shell, art, wallet ================= */
setArt({ banner: '/qx-a/img/qhooks-banner.jpg', blur: '/qx-a/img/qhooks-banner-blur.jpg' });
const trigger = document.getElementById('qhc-trigger');
if (trigger) trigger.classList.add('qa-btn', 'qa-btn--secondary', 'qa-wallet__btn');
const shell = mountShell({ ribbon: true, wallet: trigger || undefined, logo: QLOGO, overArt: true });
addEventListener('qa:wallet', () => trigger?.click());
{ // one footer: the site directory and the legal line move into the shell footer
  const foot = shell.footer, base = foot?.querySelector('.qa-foot__base');
  const dir = $('[data-a-dir]'), legal = $('[data-a-legal]');
  if (foot && base) { if (dir) foot.insertBefore(dir, base); if (legal) base.after(legal); }
}
const ribbon = shell.ribbon;
fillChainCount();

/* ================= the chapters: scroll drives the stage ================= */
// P in [0, 6): the chapter index plus how far it has scrolled. The scene smooths it; the DOM lands each chapter's word
// and live slab the first time it is reached.
const chapters = [...document.querySelectorAll('.l3-ch')];
const stageEl = $('[data-l3-stage]'), glCanvas = $('[data-l3-gl]');
let scene = null, P = 0, scrollRaf = 0, stageOn = true;
function measure() {
  const vh = innerHeight, y = scrollY;
  let p = 0, endY = 0;
  chapters.forEach((sec, i) => {
    const top = sec.offsetTop, hgt = sec.offsetHeight, u = clamp((y - top) / Math.max(1, hgt - vh));
    if (y >= top - vh * .5) sec.classList.add('is-in');
    if (y >= top || i === 0) p = i + u;
    endY = top + hgt;
    if (sec.dataset.ch === 'builders') sec.querySelectorAll('[data-l3-blocks] a').forEach((a, k) => a.classList.toggle('is-on', y >= top && u > .3 + k * .085));
  });
  P = p;
  // portrait: each chapter's object band (the grid's free row above the words), relative to its pinned inner, for the scene
  // (fractions of the canvas, which starts under the header and ribbon, not of the viewport). Both orientations: on phones
  // the band is the free row above the words; on desktop it is the right column, less any slab that sits in it (Traders).
  if (scene) { const cr = glCanvas.getBoundingClientRect(), cw = Math.max(1, cr.width), ch = Math.max(1, cr.height);
    scene.setBands(chapters.map((sec) => { const inner = sec.querySelector('.l3-ch__in'), band = sec.querySelector('.l3-ch__band'); if (!inner || !band) return { top: .1, bottom: .4, left: .5, right: 1 };
      const ir = inner.getBoundingClientRect(), br = band.getBoundingClientRect(); let bottom = br.bottom;
      for (const el of sec.querySelectorAll('.l3-ch__foot, .l3-close')) { const fr = el.getBoundingClientRect(); if (fr.height && fr.left < br.right - 8 && fr.right > br.left + 8 && fr.top > br.top) bottom = Math.min(bottom, fr.top); }
      return { top: (br.top - ir.top - cr.top) / ch, bottom: (bottom - ir.top - cr.top) / ch, left: (br.left - cr.left) / cw, right: (br.right - cr.left) / cw }; })); }
  // the stage fades as the close chapter ends; the floor takes over
  const o = clamp(1 - (y - (endY - vh * 1.05)) / (vh * .45));
  stageEl?.style.setProperty('--l3-stage-o', o.toFixed(3));
  const want = o > 0 && !document.hidden;
  if (scene) { scene.setProgress(P); if (want !== stageOn) { stageOn = want; want ? scene.resume() : scene.pause(); } if (!want) scene.pause(); }
}
const onScroll = () => { if (scrollRaf) return; scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; measure(); }); };
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) scene?.pause(); else onScroll(); });
measure();
chapters[0]?.classList.add('is-in');

// WebGL after the first paint: the text never waits on it. No WebGL, reduced motion or Save-Data keep the poster.
const canGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
if (glCanvas && !RM && !navigator.connection?.saveData && canGL()) {
  const start = () => import('/qx-a/landing/scene.mjs').then(async ({ mountScene }) => {
    await (document.fonts?.load?.('900 100px "Mona Sans"') || Promise.resolve()).catch(() => {});
    scene = await mountScene(glCanvas, { icons: COIN_ICONS, logo: QLOGO });
    document.body.classList.add('l3-live'); globalThis.__l3 = scene;
    measure(); scene.setProgress(P); pushCall(); if (Pm.burned != null) scene.setBurned(Pm.burned, fmt.tok);
    sceneQ.splice(0).filter((q) => q.name === 'setBurned' || Date.now() - q.at < 180000).forEach((q, i) => setTimeout(() => scene[q.name]?.(...q.args), 400 + i * 420));
  }).catch((e) => { console.warn('landing scene', e?.message || e); });
  if (document.readyState === 'complete') requestAnimationFrame(() => setTimeout(start, 60)); else addEventListener('load', () => requestAnimationFrame(() => setTimeout(start, 60)), { once: true });
}

/* ================= data helpers ================= */
async function getJSON(url, ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: ctl.signal }); if (!r.ok) throw Error(String(r.status)); return await r.json(); }
  finally { clearTimeout(t); }
}
// Runs fn now (when the tab is visible) and then every ms while it stays visible. A hidden tab makes no requests.
function poll(fn, ms) {
  let last = 0, timer = 0, busy = false;
  const run = async () => { if (busy || document.hidden) return; busy = true; last = Date.now(); try { await fn(); } catch {} finally { busy = false; } };
  const loop = () => { clearTimeout(timer); timer = setTimeout(async () => { await run(); loop(); }, ms); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last >= ms) { run(); loop(); } });
  run(); loop();
  return { now: run };
}
// A server read can come back from cache first and fresh a moment later, so a burn or trade that is new to this page can
// still be minutes old. Only events from the last few minutes hit the scene, tug the hook or toast; older ones only
// join the tapes.
const isNews = (ts) => nowS() - (num(ts) || 0) < 180;
// A changed figure flashes; a plain integer counts up (or down) to its new value over 700 ms.
const flash = (el, text) => {
  if (!el) return; const old = el.textContent;
  if (old && old !== text && !RM) { el.classList.add('is-tick'); setTimeout(() => el.classList.remove('is-tick'), 60); }
  const a = /^\d[\d,]*$/.test(old) ? +old.replace(/,/g, '') : NaN, b = /^\d[\d,]*$/.test(text) ? +text.replace(/,/g, '') : NaN;
  if (RM || !Number.isFinite(a) || !Number.isFinite(b) || a === b) { el.textContent = text; return; }
  const t0 = performance.now(), fmtN = (v) => (text.includes(',') ? Math.round(v).toLocaleString('en-US') : String(Math.round(v)));
  const step = (now) => { const u = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - u, 3); el.textContent = u < 1 ? fmtN(a + (b - a) * e) : text; if (u < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
};
// Scene events that arrive before the scene is up wait for it (only recent ones are replayed; nothing older than 3 min).
const sceneQ = [];
const sceneCall = (name, ...args) => { if (scene) scene[name]?.(...args); else sceneQ.push({ name, args, at: Date.now() }); };
const count = (key, v) => { document.querySelectorAll(`[data-hm-count="${key}"]`).forEach((s) => { if (v != null) flash(s, String(v)); }); };
const chainName = (c) => CHAINS[String(c)] || 'Chain ' + c;
const chainDot = (c) => { const d = h('span', { class: 'qa-chain-dot' }); if (String(c) !== '4663') { d.style.setProperty('background', 'var(--qa-gold)'); d.style.setProperty('box-shadow', '0 0 9px var(--qa-gold)'); } return d; };
const pctCls = (x) => (x > .0005 ? 'qa-up' : x < -.0005 ? 'qa-down' : 'qa-muted');
const coinIndex = (chainId) => COIN_ORDER.indexOf(String(chainId));

/* ================= state ================= */
const H = {}, T = {};
const S = { feed: null, markets: [], q: null, qSum: null, rate: null, qTrades: [], seenTrades: new Set(), holders: new Set(), burns: null, seenBurns: new Set(), calls: [], seenCalls: new Set(), seenLaunch: new Set(), other: new Map() };
let calls = []; // the call posts on screen, each with update() for the live price
const qPrice = () => num(S.qSum?.priceUsd) ?? num(S.markets.find((m) => lower(m.token) === QH)?.summary?.priceUsd);

/* ================= pulse strip ================= */
const Pm = { launches: null, trades: null, vol: null, burned: null, holders: null };
const dash = (v, f) => (v == null ? '—' : f(v));
const pulse = statStrip([
  { label: 'Live launches', value: () => dash(Pm.launches, String) },
  { label: 'Trades 24h', value: () => dash(Pm.trades, (v) => v.toLocaleString('en-US')) },
  { label: 'Volume 24h', value: () => dash(Pm.vol, fmt.usd) },
  { label: 'QHOOKS burned', value: () => dash(Pm.burned, fmt.tok) },
  { label: 'QHOOKS holders', value: () => dash(Pm.holders, (v) => v.toLocaleString('en-US')) },
]);
$('[data-hm-pulse]')?.append(pulse.el);

/* ================= the QHOOKS tag in the hero ================= */
const tagPrice = bigPrice($('[data-hv-qp]') || h('span'));
const tagChange = $('[data-hv-qc]');
// The digits flash only when a newer market read moves the price, never when the first read replaces the feed's figure.
function paintTag(sum, live = false) {
  const p = num(sum?.priceUsd); if (p == null) return;
  tagPrice.set(p, live && S.tagPrev != null ? Math.sign(p - S.tagPrev) : 0); S.tagPrev = p;
  const c = num(sum?.change24); if (tagChange && c != null) { tagChange.textContent = fmt.pct(c); tagChange.dataset.dir = String(Math.sign(Math.round(c * 1000))); tagChange.setAttribute('aria-label', '24-hour change ' + fmt.pct(c)); }
}

/* ================= Builders: the newest launches ================= */
const launchBox = $('[data-hm-launches]');
launchBox?.append(skeletonRows(3));
const launchRows = new Map();
const key = (m) => String(m.chainId) + ':' + lower(m.controller || m.token);
function launchHref(m) { return lower(m.token) === QH ? '/terminal#t=' + QCHAIN + ':' + QH : '/terminal#m=' + encodeURIComponent(String(m.chainId)) + ':' + encodeURIComponent(lower(m.controller)); }
function iconFor(m, cls = 'hm-icon') {
  const src = logoOf(m.logo) || (lower(m.token) === QH ? QLOGO : null), el = h('span', { class: cls, 'aria-hidden': 'true' });
  if (src) { const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }); img.addEventListener('error', () => { img.remove(); el.textContent = String(m.symbol || '?').slice(0, 1); }, { once: true }); el.append(img); }
  else el.textContent = String(m.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase();
  return el;
}
function launchSub(m) {
  const parts = [chainName(m.chainId)], at = num(m.launchedAt) || (num(m.listedAt) ? m.listedAt / 1000 : null);
  if (at) parts.push(fmt.age(nowS() - at) + ' ago');
  const t = num(m.summary?.trades24); if (t != null) parts.push(t + (t === 1 ? ' trade' : ' trades'));
  return parts.join(' · ');
}
function launchRow(m, enter) {
  const s = m.summary || {}, v = h('span', { class: 'hm-tick' }, num(s.mcapUsd) != null ? fmt.usd(s.mcapUsd) : '—');
  const ch = h('small', { class: 'hm-tick ' + pctCls(num(s.change24) ?? 0) }, num(s.change24) != null ? fmt.pct(s.change24) : '');
  const sub = h('span', { class: 'qa-row__s' }, launchSub(m));
  const el = h('a', { class: 'qa-row hm-launch-row' + (enter && !RM ? ' is-enter' : ''), href: launchHref(m), title: m.name || m.symbol },
    iconFor(m), h('span', { class: 'qa-row__main' }, h('span', { class: 'qa-row__t' }, m.symbol || m.name || 'Token'), sub), h('span', { class: 'qa-row__v' }, v, ch));
  return { el, v, ch, sub };
}
function drawLaunches(fresh = new Set()) {
  if (!launchBox) return;
  const live = S.markets.filter((m) => m.live);
  if (!live.length) { launchBox.replaceChildren(state('loading', { title: 'Refreshing launches' })); return; }
  const rows = [...live].sort((a, b) => (b.listedAt || 0) - (a.listedAt || 0)).slice(0, 3);
  if (!launchBox.dataset.drawn || fresh.size) {
    launchRows.clear();
    launchBox.replaceChildren(h('div', { class: 'qa-list hm-launches' }, rows.map((m) => { const r = launchRow(m, fresh.has(key(m))); launchRows.set(key(m), r); return r.el; })));
    launchBox.dataset.drawn = '1'; return;
  }
  for (const m of rows) {
    const r = launchRows.get(key(m)); if (!r) continue; const s = m.summary || {};
    flash(r.v, num(s.mcapUsd) != null ? fmt.usd(s.mcapUsd) : '—');
    r.ch.className = 'hm-tick ' + pctCls(num(s.change24) ?? 0); flash(r.ch, num(s.change24) != null ? fmt.pct(s.change24) : '');
    r.sub.textContent = launchSub(m);
  }
}
async function loadFeed() {
  const body = await getJSON(FEED);
  if (!Array.isArray(body?.markets)) throw Error('feed');
  const first = !S.feed; S.feed = body;
  const seen = new Set(), markets = body.markets.filter((m) => { const k = key(m); if (seen.has(k)) return false; seen.add(k); return true; });
  const fresh = new Set();
  for (const m of markets) if (m.live && !S.seenLaunch.has(key(m))) { if (!first) fresh.add(key(m)); S.seenLaunch.add(key(m)); }
  // other launches that traded since we last looked: read their trades for the ribbon and the scene
  for (const m of markets) {
    const o = S.other.get(key(m)), lt = num(m.summary?.lastTradeAt);
    if (o && lt && lt > o.lastTradeAt) { o.lastTradeAt = lt; readOther(m, true); }
  }
  S.markets = markets;
  const live = markets.filter((m) => m.live);
  Pm.launches = live.length;
  Pm.trades = live.reduce((a, m) => a + (num(m.summary?.trades24) || 0), 0);
  Pm.vol = live.reduce((a, m) => a + (num(m.summary?.volume24Usd) || 0), 0);
  const qm = markets.find((m) => lower(m.token) === QH); if (qm && Pm.holders == null) Pm.holders = num(qm.summary?.holders);
  pulse.update(!first); count('launches', live.length);
  drawLaunches(fresh);
  if (!S.q && qm) paintTag(qm.summary);
  for (const k of fresh) {
    const m = markets.find((x) => key(x) === k); if (!m) continue;
    ribbon?.news({ kind: 'launch', label: 'New launch', text: `${m.symbol} on ${chainName(m.chainId)}`, img: logoOf(m.logo) ? abs(logoOf(m.logo)) : undefined });
    sceneCall('hit', 'buy', num(m.summary?.volume24Usd) || 1); sceneCall('coin', coinIndex(m.chainId));
  }
  if (first) {
    // the ribbon starts with the two most active other launches' latest trades
    const others = live.filter((m) => lower(m.token) !== QH && /^0x[0-9a-f]{40}$/i.test(String(m.controller)) && (num(m.summary?.trades24) || 0) > 0)
      .sort((a, b) => (b.summary.trades24 || 0) - (a.summary.trades24 || 0)).slice(0, 2);
    for (const m of others) { S.other.set(key(m), { lastTradeAt: num(m.summary?.lastTradeAt) || 0, seen: new Set() }); readOther(m, false); }
    const newest = [...live].sort((a, b) => (b.listedAt || 0) - (a.listedAt || 0))[0];
    if (newest) setTimeout(() => ribbon?.news({ kind: 'launch', label: 'Newest launch', text: `${newest.symbol} on ${chainName(newest.chainId)} · ${fmt.age(nowS() - (num(newest.launchedAt) || newest.listedAt / 1000))} ago`, img: logoOf(newest.logo) ? abs(logoOf(newest.logo)) : undefined }), 2600);
  }
}
async function readOther(m, live) {
  const o = S.other.get(key(m)); if (!o) return;
  try {
    const body = await getJSON(MARKET(m.chainId, lower(m.controller)));
    const list = (Array.isArray(body?.trades) ? body.trades : []).filter((t) => (num(t?.valueUsd) || 0) >= .01 && t.id);
    const add = list.filter((t) => !o.seen.has(t.id)).slice(0, live ? 12 : 6).reverse();
    list.forEach((t) => o.seen.add(t.id));
    const img = logoOf(m.logo) ? abs(logoOf(m.logo)) : undefined;
    for (const t of add) ribbonTrade({ symbol: m.symbol, img, side: t.buy ? 'buy' : 'sell', usd: t.valueUsd, w: t.trader, ts: t.ts }, !live);
    add.filter((t) => isNews(t.ts)).forEach((t, i) => setTimeout(() => { sceneCall('hit', t.buy ? 'buy' : 'sell', num(t.valueUsd) || 0); sceneCall('coin', coinIndex(m.chainId)); }, RM ? 0 : i * 420));
  } catch {}
}

/* ================= ribbon ================= */
const pendingRibbon = [];
let ribbonFlushT = 0;
// At load the latest trades from every source are gathered and then laid down oldest first; after that, each arrives as it happens.
function ribbonTrade(t, initial) {
  if (!ribbon) return;
  if (initial) { pendingRibbon.push(t); clearTimeout(ribbonFlushT); ribbonFlushT = setTimeout(flushRibbon, 900); return; }
  ribbon.push(t);
}
function flushRibbon() { pendingRibbon.sort((a, b) => (a.ts || 0) - (b.ts || 0)).splice(0).forEach((t) => ribbon.push(t)); }

/* ================= Traders: the QHOOKS tape; Holders: the live price ================= */
const tradeBox = $('[data-hm-trade]'), priceBox = $('[data-hm-price]');
if (tradeBox) tradeBox.append(skeletonRows(3));
function buildTraders() {
  if (!tradeBox || T.tape) return;
  T.tape = tape({ rows: 4 });
  tradeBox.replaceChildren(T.tape.el, h('a', { class: 'qa-link hm-call-go', href: '/terminal#t=' + QCHAIN + ':' + QH }, 'Trade QHOOKS →'));
  if (priceBox && !T.price) { T.price = bigPrice(); T.change = changeLine(); priceBox.replaceChildren(h('span', { class: 'l3-price__k' }, 'QHOOKS · Robinhood Chain · live'), T.price.el, T.change.el); }
}
const toRow = (t) => ({ ts: t.ts, b: t.buy ? 1 : 0, usd: num(t.valueUsd) || 0, tok: num(t.token) || 0, w: t.trader, id: t.id });
function paintTraders(prev) {
  buildTraders(); const sum = S.qSum; if (!sum) return;
  const p = qPrice(); if (p != null && T.price) T.price.set(p, prev != null && p !== prev ? Math.sign(p - prev) : 0);
  const c = num(sum.change24); if (c != null && T.change) T.change.set(c, { label: '24h' });
  count('traders', num(sum.traders24));
  count('holders', num(sum.holders));
  Pm.holders = num(sum.holders) ?? Pm.holders; pulse.update(prev != null);
  paintTag(sum, prev != null);
  calls.forEach((x) => x.update());
  pushCall();
}
let traderTapeShown = false;
function showTape() {
  if (traderTapeShown || !T.tape) return; traderTapeShown = true;
  const rows = S.qTrades.filter((t) => (num(t.valueUsd) || 0) >= .01).slice(0, 4).map(toRow);
  T.tape.render(rows); T.tape.ages(nowS());
}
async function loadQ() {
  const body = await getJSON(MARKET(QCHAIN, QH), 15000);
  if (!body?.summary) throw Error('market');
  const first = !S.q, prev = first ? null : qPrice();
  S.q = body; S.qSum = body.summary;
  const pr = num(body.summary.price), pu = num(body.summary.priceUsd); if (pr && pu) S.rate = pu / pr;
  const trades = (Array.isArray(body.trades) ? body.trades : []).filter((t) => t?.id && num(t.ts) && num(t.priceUsd));
  const shown = (t) => (num(t.valueUsd) || 0) >= .01; // dust (under a cent) stays off the tape and the ribbon
  if (first) {
    S.qTrades = trades; trades.forEach((t) => S.seenTrades.add(t.id));
    (body.holders || []).forEach((x) => { if (!x.excludedFromHolderCount) S.holders.add(lower(x.holder)); });
    paintTraders(null); drawHolders(); showTape();
    // trades from the last few minutes hit the scene once it is up, oldest first
    trades.filter(isNews).slice(0, 6).reverse().forEach((t, i) => setTimeout(() => { sceneCall('hit', t.buy ? 'buy' : 'sell', num(t.valueUsd) || 0); sceneCall('coin', 0); }, i * 420));
    trades.filter(shown).slice(0, 12).forEach((t) => ribbonTrade({ symbol: 'QHOOKS', img: abs(QLOGO), side: t.buy ? 'buy' : 'sell', usd: t.valueUsd, w: t.trader, ts: t.ts }, true));
    return;
  }
  // new trades since the last read, oldest first
  const fresh = trades.filter((t) => !S.seenTrades.has(t.id)).reverse();
  const before = new Set(S.holders);
  (body.holders || []).forEach((x) => { if (!x.excludedFromHolderCount) S.holders.add(lower(x.holder)); });
  S.qTrades = trades;
  fresh.forEach((t, i) => setTimeout(() => onTrade(t, prev, before), RM ? 0 : i * 420));
  if (!fresh.length) paintTraders(prev);
  drawHolders(true);
}
function onTrade(t, prev, before) {
  S.seenTrades.add(t.id);
  const side = t.buy ? 'buy' : 'sell', usd = num(t.valueUsd) || 0;
  if (usd >= .01) T.tape?.push(toRow(t));
  paintTraders(prev);
  if (usd >= .01) ribbon?.push({ symbol: 'QHOOKS', img: abs(QLOGO), side, usd, w: t.trader });
  if (!isNews(t.ts)) return;
  sceneCall('hit', side, usd); sceneCall('coin', 0);
  const who = lower(t.trader);
  if (t.buy && !before.has(who) && S.holders.has(who)) {
    toast({ kind: 'holder', title: h('span', null, h('b', null, 'New holder'), ' · ' + fmt.tok(num(t.token) || 0) + ' QHOOKS'), body: `${fmt.short(t.trader)} bought ${fmt.usdExact(usd)}`, ava: avatar(t.trader) });
    ribbon?.news({ kind: 'holder', label: 'New holder', text: `${fmt.short(t.trader)} bought ${fmt.usdExact(usd)} of QHOOKS`, w: t.trader });
  } else if (t.buy && usd >= 100) ribbon?.news({ kind: 'buy', label: 'Big buy', text: `${fmt.short(t.trader)} bought ${fmt.usdExact(usd)} of QHOOKS`, w: t.trader });
}
setInterval(() => { const n = nowS(); T.tape?.ages(n); H.tape?.ages(n); }, 1000);

/* ================= Holders: burns and the figures ================= */
function burnTape(rows = 3) {
  const el = h('ol', { class: 'qa-tape l3-burns', 'aria-live': 'off' });
  const row = (r, enter) => { const age = h('span', { class: 'qa-trow__age' }); age.dataset.ts = r.ts;
    return h('li', { class: 'qa-trow is-burn' + (enter && !RM ? ' is-enter' : ''), style: { '--w': Math.min(100, 8 + 14 * Math.log10(1 + r.tok)).toFixed(1) + '%' }, 'aria-label': 'Buyback burned ' + fmt.tok(r.tok) + ' QHOOKS' },
      icon('flame', 'qa-glyph'), h('span', { class: 'qa-trow__usd' }, fmt.tok(r.tok)), h('span', { class: 'qa-trow__amt' }, r.usd ? fmt.usdExact(r.usd) : ''), h('span', { class: 'qa-trow__who' }, keeperAvatar(), h('span', null, 'Buyback')), age); };
  return { el, render(list) { el.replaceChildren(...list.slice(0, rows).map((r) => row(r))); }, push(r) { el.prepend(row(r, true)); while (el.children.length > rows) el.lastElementChild.remove(); }, ages(n) { el.querySelectorAll('[data-ts]').forEach((x) => (x.textContent = fmt.age(n - +x.dataset.ts))); } };
}
const holdBox = $('[data-hm-holders]');
if (holdBox) holdBox.append(skeletonRows(2));
function buildHolders() {
  if (!holdBox || H.el) return;
  H.fig = h('div', { class: 'l3-figs' }, [['burned', 'QHOOKS burned', 'is-fire'], ['burns', 'buybacks', ''], ['holders', 'holders', '']].map(([k, l, c]) => h('div', null, h('b', { class: 'hm-tick ' + c, dataset: { f: k } }, '—'), h('span', null, l))));
  H.tape = burnTape();
  H.el = h('div', null, H.tape.el, H.fig);
  holdBox.replaceChildren(H.el);
}
const wethUsd = () => num(S.qTrades.find((t) => num(t.quoteUsd))?.quoteUsd) ?? null;
const units = (wei) => { try { return Number(BigInt(wei || 0)) / 1e18; } catch { return 0; } };
const burnRow = (b) => { const eth = units(b.spentWei), px = wethUsd(); return { ts: b.at, b: 0, bb: 1, usd: px ? eth * px : 0, tok: units(b.burnedWei), id: b.tx }; };
function drawHolders(update = false) {
  if (!S.burns && !S.qSum) return;
  buildHolders();
  const fig = (k, v) => flash(H.fig.querySelector(`[data-f="${k}"]`), v);
  const dead = S.burns?.dead?.balanceWei ? units(S.burns.dead.balanceWei) : num(S.qSum?.burned);
  if (dead != null) { fig('burned', fmt.tok(dead)); Pm.burned = dead; sceneCall('setBurned', dead, fmt.tok); }
  if (num(S.burns?.burns?.count) != null) fig('burns', S.burns.burns.count.toLocaleString('en-US'));
  if (num(S.qSum?.holders) != null) fig('holders', String(S.qSum.holders));
  pulse.update(update);
  // the burns tape needs the WETH price from the trades
  if (S.burns && !H.burnsDrawn && wethUsd()) {
    H.burnsDrawn = true;
    // every burn in this read counts as seen (not only the three on screen), so the next read toasts only newer ones
    const all = S.burns.burns?.recent || [], recent = all.slice(0, 3);
    all.forEach((b) => { S.seenBurns.add(b.tx); S.lastBurnAt = Math.max(S.lastBurnAt || 0, num(b.at) || 0); });
    H.tape.render(recent.map(burnRow)); H.tape.ages(nowS());
    recent.forEach((b) => { const r = burnRow(b); ribbonTrade({ symbol: 'QHOOKS', img: abs(QLOGO), side: 'burn', usd: r.usd, w: null, ts: b.at }, true); });
  }
}
// The burn ticker module reads /api/qhooks/buybacks; it hands each result to this page.
function onBuybacks(e) {
  const { data } = e.detail || {}; if (!data) return;
  const firstBurns = !S.burns; S.burns = data;
  if (!firstBurns && H.burnsDrawn) {
    const fresh = (data.burns?.recent || []).filter((b) => b.tx && !S.seenBurns.has(b.tx) && (num(b.at) || 0) > (S.lastBurnAt || 0)).reverse();
    for (const b of fresh) {
      S.seenBurns.add(b.tx); S.lastBurnAt = Math.max(S.lastBurnAt || 0, num(b.at) || 0); const r = burnRow(b);
      H.tape.push(r);
      if (!isNews(b.at)) continue;
      sceneCall('burn', r.tok);
      ribbon?.push({ symbol: 'QHOOKS', img: abs(QLOGO), side: 'burn', usd: r.usd });
      toast({ kind: 'burn', title: h('span', null, h('b', null, 'Buyback'), ' · burned'), body: `${fmt.tok(r.tok)} QHOOKS for ${fmt.usdExact(r.usd)}`, ava: keeperAvatar() });
    }
  }
  drawHolders(!firstBurns);
}
document.addEventListener('qx:buybacks', onBuybacks);
if (globalThis.__qxBuybacks) onBuybacks({ detail: globalThis.__qxBuybacks });

/* ================= Callers: the latest real call, its outcome in the scene ================= */
const callBox = $('[data-hm-calls]');
callBox?.append(skeletonRows(1));
function boardLogo(b) {
  if (!b) return null; if (lower(b.address) === QH) return QLOGO;
  const m = S.markets.find((x) => lower(x.token) === lower(b.address) || lower(x.controller) === lower(b.controller || b.address));
  return logoOf(m?.logo);
}
// The feed's priceNow can be in the pool's quote unit while the call price is in USD (a WETH price against a USD call
// reads as -100%). Show the outcome only for QHOOKS (live USD price) or when the two prices are plausibly the same unit.
function callNow(c) {
  const isQ = lower(c.board?.address) === QH, pn = num(c.call?.priceNow), sameUnit = pn != null && pn / c.call.price > 1e-3 && pn / c.call.price < 1e3;
  return (isQ ? qPrice() : null) ?? (sameUnit ? pn : null);
}
function callPost(c, enter) {
  const sym = c.board?.symbol || c.board?.name || 'token';
  const nowP = () => callNow(c);
  const out = nowP() != null ? callOutcome({ callPrice: c.call.price, nowPrice: nowP() }) : null;
  const p = post({ w: c.author, name: fmt.short(c.author), age: fmt.age((Date.now() - c.createdAt) / 1000), what: h('span', null, 'called', tokenChip('$' + sym, boardLogo(c.board))), text: c.text, media: out ? [out] : [], enter });
  const href = c.links?.path || (c.id ? '/call/' + c.id : null);
  if (href) p.querySelector('.qa-post__body').append(h('a', { class: 'hm-call-go', href }, 'Open the call →'));
  // The caller's face and name open their profile (components.post draws them as plain text).
  const prof = profileUrl({ wallet: c.author }), label = 'Open profile of ' + fmt.short(c.author), ava = p.querySelector(':scope > .qa-ava'), nm = p.querySelector('.qa-post__name');
  if (ava) { const link = h('a', { class: 'cx-face', href: prof, 'aria-label': label }); ava.replaceWith(link); link.append(ava); }
  if (nm) nm.replaceWith(h('a', { class: 'qa-post__name cx-who__link', href: prof, title: 'Open profile', 'aria-label': label }, h('span', { class: 'cx-who__t' }, nm.textContent), h('span', { class: 'cx-who__chev', 'aria-hidden': 'true' }, '›')));
  return { el: p, update: () => { const v = nowP(); if (out && v != null) out.update(v); } };
}
// The scene's extruded figure: the latest call that has a real outcome (the same unit on both sides), its real move.
// The 3D caption never sets a wallet address: the caller's profile name when they have one, otherwise just the time.
const callerNames = new Map(); // wallet -> name ('' when the profile has none); the public profile read, once per wallet
function callerName(w) {
  const k = lower(w); if (!/^0x[0-9a-f]{40}$/.test(k)) return '';
  if (!callerNames.has(k)) { callerNames.set(k, ''); getJSON('/api/community/profile/' + k).then((b) => { const n = String(b?.profile?.name || '').trim(); if (n) { callerNames.set(k, n.slice(0, 24)); pushCall(); } }).catch(() => {}); }
  return callerNames.get(k) || '';
}
function pushCall() {
  if (!scene) return;
  const c = S.calls.find((x) => callNow(x) != null); if (!c) { scene.setCall({ pct: null, label: '' }); return; }
  const now = callNow(c), pct = (now / c.call.price - 1) * 100, who = callerName(c.author);
  scene.setCall({ pct, label: `$${c.board?.symbol || 'token'} · called ${who ? 'by ' + who + ' · ' : ''}${fmt.age((Date.now() - c.createdAt) / 1000)} ago` });
}
async function loadCalls() {
  const body = await getJSON(CALLS);
  const list = (Array.isArray(body?.calls) ? body.calls : []).filter((c) => c?.kind === 'call' && !c.folded && num(c.call?.price) && c.author).sort((a, b) => b.createdAt - a.createdAt);
  const first = !S.callsLoaded; S.callsLoaded = true;
  S.calls = list;
  count('calls', list.length);
  pushCall();
  if (!callBox) return;
  if (!list.length) { callBox.replaceChildren(state('empty', { title: 'No calls yet', body: 'Make the first call on a token and build your record.', action: 'Make a call', onAction: () => location.assign('/community#make-a-call') })); return; }
  const fresh = first ? [] : list.filter((c) => !S.seenCalls.has(c.id));
  list.forEach((c) => S.seenCalls.add(c.id));
  if (first || fresh.length) {
    calls = list.slice(0, 1).map((c) => callPost(c, fresh.some((f) => f.id === c.id)));
    callBox.replaceChildren(h('div', { class: 'qa-feed hm-calls' }, calls.map((x) => x.el)));
  }
  for (const c of fresh) {
    const sym = c.board?.symbol || 'token';
    sceneCall('call');
    toast({ kind: 'call', title: h('span', null, h('b', null, 'Call'), ' · ' + fmt.short(c.author)), body: `Called $${sym} at ${fmt.price(c.call.price)}`, ava: avatar(c.author) });
    ribbon?.news({ kind: 'call', label: 'New call', text: `${fmt.short(c.author)} called $${sym}`, w: c.author });
  }
  if (first && list[0]) {
    const c = list[0], now = callNow(c);
    if (now) setTimeout(() => ribbon?.news({ kind: 'call', label: 'Latest call', text: `${fmt.short(c.author)} called $${c.board?.symbol || 'token'} · ${fmt.mult(now / c.call.price)} since`, w: c.author }), 9000);
  }
}

/* ================= start ================= */
poll(loadFeed, 60000);
poll(loadQ, 20000);
poll(loadCalls, 60000);
// the feed, market and calls come back in any order; the call outcomes use the live QHOOKS price once it is known
