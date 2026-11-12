// QHooks System A: the home page runtime. The ecosystem front door: the brand line, the hook with the live QHOOKS coin,
// the live ribbon, and four acts (Builders, Callers, Holders, Traders) that show the live product.
// Data, all public and same-origin, all read only while the tab is visible:
//   /api/terminal/feed?chain=all                         launches, at load then every 60 s
//   /api/terminal/market/4663/<QHOOKS>?tf=60             QHOOKS chart, trades, holders, at load then every 20 s
//                                                        (the terminal reads the same URL every 5 s, so the server cache is shared)
//   /api/terminal/market/<chain>/<controller>?tf=60      the two most active other launches, once at load for the ribbon, then
//                                                        again only when the feed shows a newer trade on them
//   /api/community/activity                              calls, at load then every 60 s
//   /api/qhooks/buybacks                                 read by qx-burn-ticker.mjs (every 20 s); this page listens for its result
// Every motion is a real event (a trade, a burn, a call, a launch, a new holder) or the brand line's own loop, which shows
// the latest real card for each word. Nothing is replayed or invented.
import { mountShell } from '/qx-a/shell.mjs';
import { profileUrl } from '/qx-profile-address.mjs';
import { h, icon, RM, fmt, setArt, coin, avatar, keeperAvatar, tokenChip, statStrip, tape, toast, liveLabel, liveChart, bigPrice, changeLine, post, callOutcome, supplyMap, countdown, state, skeletonRows, restart, inView, checks } from '/qx-a/components.mjs';
import '/qx-shell.mjs'; // legacy runtime: wallet copy, get-the-app, proof entry points (its old header code finds no header here)

const QH = '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195', QCHAIN = '4663', QLOGO = '/qhooks-logo.jpg';
const FEED = '/api/terminal/feed?chain=all', CALLS = '/api/community/activity';
const MARKET = (c, a) => `/api/terminal/market/${c}/${a}?tf=60`;
const CHAINS = { '4663': 'Robinhood Chain', '8453': 'Base', '56': 'BNB Chain', '42161': 'Arbitrum', '1': 'Ethereum', '99901': 'Elysium', '143': 'Monad', solana: 'Solana' };
const $ = (s, r = document) => r.querySelector(s);
const lower = (v) => String(v || '').toLowerCase();
const nowS = () => Date.now() / 1000;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const abs = (u) => new URL(u, location.href).href;
// Logos come back as same-origin paths, data: URIs or qhooks.com URLs; keep them on this origin so the CSP allows them.
const logoOf = (u) => { if (typeof u !== 'string' || !u) return null; if (u.startsWith('data:image/') || u.startsWith('/')) return u; try { const x = new URL(u); return x.hostname === 'qhooks.com' ? x.pathname + x.search : null; } catch { return null; } };

/* ================= shell, art, wallet ================= */
setArt({ banner: '/qx-a/img/qhooks-banner.jpg', blur: '/qx-a/img/qhooks-banner-blur.jpg' });
const trigger = document.getElementById('qhc-trigger');
// On home the one gold action is Launch, so the wallet button sits in the header as a secondary button.
if (trigger) trigger.classList.add('qa-btn', 'qa-btn--secondary', 'qa-wallet__btn');
const shell = mountShell({ ribbon: true, wallet: trigger || undefined, logo: QLOGO });
addEventListener('qa:wallet', () => trigger?.click());
{ // one footer: the site directory and the legal line move into the shell footer
  const foot = shell.footer, base = foot?.querySelector('.qa-foot__base');
  const dir = $('[data-a-dir]'), legal = $('[data-a-legal]');
  if (foot && base) { if (dir) foot.insertBefore(dir, base); if (legal) base.after(legal); }
}
const ribbon = shell.ribbon;

/* ================= the hero: the brand line, looping ================= */
// "For the next generation of token builders / callers / holders / traders", resting on "For the next generation."
// It loops so it is never missed (Randall, 2026-11-12). Each word brings its people's live card onto the hook (the stage,
// below), read from the same public data the page already loads; nothing is invented and an unknown card says
// "Refreshing". The slot and the stage have fixed heights, so the page never moves. Reduced motion crossfades the word
// and the card instead of rolling and dropping them. It pauses while the tab is hidden or the hero is scrolled away.
const WORDS = ['builders', 'callers', 'holders', 'traders'];
const CARDS = {}; // word (or 'rest') -> () => card | null; filled in at the end, from the data the loaders keep

/* ================= the stage: the hook holds one live card ================= */
// The gold hook hangs from the top of the screen. Its cord holds a card: the newest launch, the latest call, the latest
// buyback, the latest trades, or the whole floor at rest. The coin on the card is the one on the hook; the light of the
// hero is that token's own art. Real trades tug the cord and lift their size off the coin.
const stageEl = $('[data-hm-stage]'), lightEl = $('[data-hm-light]');
const QART = '/qx-a/img/qhooks-banner-blur.jpg';
const stage = (() => {
  if (!stageEl) return { show() {}, hit() {}, refresh() {}, coin: () => null, key: () => null };
  let cur = null, curKey = null, lightArt = '', li = 0;
  const light = (art) => {
    if (!lightEl || !art || art === lightArt) return; lightArt = art;
    const layers = lightEl.children, on = layers[li], next = layers[(li = 1 - li)];
    if (!next) return;
    next.style.setProperty('background-image', `url("${art}")`);
    next.classList.add('is-on'); on?.classList.remove('is-on');
  };
  const build = (c) => {
    const cn = coin(c.coin || QLOGO, { size: 'md', alt: '' });
    cn.querySelector('img')?.addEventListener('error', (e) => { e.target.src = QLOGO; }, { once: true });
    const body = h('span', { class: 'hm-card__body' },
      h('span', { class: 'hm-card__kick' + (c.kickCls ? ' ' + c.kickCls : '') }, c.kick),
      c.rows ? h('span', { class: 'hm-card__rows' }, c.rows) : h('span', { class: 'hm-card__t' }, c.title, c.coins ? h('span', { class: 'hm-card__coins' }, c.coins) : null),
      !c.rows && c.sub ? h('span', { class: 'hm-card__s' }, c.sub) : null);
    const fig = c.fig ? h('span', { class: 'hm-card__fig ' + (c.figCls || '') }, h('b', null, c.fig), c.figSub ? h('small', null, c.figSub) : null) : null;
    const el = h(c.href ? 'a' : 'div', { class: 'hm-card', href: c.href || null, tabindex: c.href ? '-1' : null, dataset: { k: c.kind || '' } }, body, fig, h('span', { class: 'hm-card__coin' }, cn, c.ava || null));
    el.coin = cn; el.rowsEl = body.querySelector('.hm-card__rows'); el.sig = c.sig || '';
    return el;
  };
  function show(key, instant) {
    curKey = key;
    const c = CARDS[key]?.() || null;
    if (!c) return; // keep what is on the hook until this card's data is in
    const next = build(c);
    const old = stageEl.querySelector('.hm-card.is-on');
    stageEl.append(next);
    if (instant || RM) next.classList.add('is-on', 'no-drop'); else { void next.offsetWidth; next.classList.add('is-on'); }
    if (old) { old.classList.remove('is-on'); old.classList.add('is-off'); setTimeout(() => old.remove(), RM ? 340 : 420); }
    stageEl.querySelectorAll('.hm-card.is-wait').forEach((x) => x !== next && x.remove());
    cur = next; light(c.art);
  }
  // A new trade while the trades card is up: its row slides in at the top of the card that is already on the hook.
  function refresh(key) {
    if (!cur || curKey !== key) return;
    const c = CARDS[key]?.(); if (!c?.rows || !cur.rowsEl) return;
    cur.rowsEl.replaceChildren(...c.rows); if (!RM) c.rows[0]?.classList.add('is-enter');
    light(c.art);
  }
  // A real trade: the coin on the hook rings, the cord tugs, and the trade's size lifts off the coin.
  function hit(side, usd, w) {
    cur?.coin?.pulse?.(side === 'sell' ? -1 : 1);
    if (RM || !(usd >= .01)) return;
    const chip = h('span', { class: 'hm-chip is-' + side }, side === 'burn' ? keeperAvatar() : w ? avatar(w) : null, (side === 'burn' ? 'Buyback ' : side === 'sell' ? '▼ ' : '▲ ') + fmt.usdExact(usd));
    // chips that rise together stack instead of covering each other
    chip.style.setProperty('--i', String(stageEl.querySelectorAll('.hm-chip').length));
    stageEl.append(chip); setTimeout(() => chip.remove(), 1700);
  }
  return { show, refresh, hit, coin: () => cur?.coin || null, key: () => curKey };
})();

const brand = (() => {
  const line = $('[data-hm-line]'), slot = line && $('[data-hm-slot]', line);
  if (!line || !slot) return { refresh() {} };
  const HOLD = 2800, REST = 3200, ROLL = RM ? 320 : 560;
  let k = 0, timer = 0, running = false, inViewNow = true, key = 'builders';
  const showWord = (w) => {
    const old = $('.hm-slot__w.is-on', slot), next = h('span', { class: 'hm-slot__w' }, w + '.');
    next.dataset.hmWord = '';
    slot.append(next);
    void next.offsetWidth;
    next.classList.add('is-on');
    if (old) { old.classList.remove('is-on'); old.classList.add('is-off'); old.removeAttribute('data-hm-word'); setTimeout(() => old.remove(), ROLL + 60); }
  };
  const step = () => {
    k = (k + 1) % (WORDS.length + 1);
    const resting = k === WORDS.length;
    key = resting ? 'rest' : WORDS[k];
    line.classList.toggle('is-rest', resting);
    if (!resting) showWord(WORDS[k]);
    stage.show(key, false);
    timer = setTimeout(tick, resting ? REST : HOLD);
  };
  function tick() { if (running) step(); }
  const sync = () => {
    const want = !document.hidden && inViewNow;
    if (want && !running) { running = true; clearTimeout(timer); timer = setTimeout(tick, HOLD); }
    else if (!want && running) { running = false; clearTimeout(timer); }
  };
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(([e]) => { inViewNow = e.isIntersecting; sync(); }, { threshold: 0.15 }).observe(line);
  (document.fonts?.ready || Promise.resolve()).then(() => { stage.show(key, true); sync(); });
  // data arrived: fill the card for the current word if it is still waiting for it
  return { refresh() { if (!stageEl?.querySelector('.hm-card.is-on:not(.is-wait)')) stage.show(key, true); } };
})();

/* ================= the hook: real trades tug the cord ================= */
const rig = $('[data-hm-rig]'), coinWrap = $('[data-hm-coin]');
const heroEl = $('.hm-hero'), tagEl = $('[data-hm-tag]'), copyEl = $('.hm-copy');
const BEND_X = .52, BEND_Y = .97; // where the cord leaves the hook, as a share of the hook image (matches .hm-bob)
let pivotToCoin = 0;
// Positions come from layout offsets (never the transformed boxes), so a swing in progress never skews them.
// Wide screens: the hook keeps its place on the right and the card hangs under it, beside the actions, when there is room
// for a full card there. Otherwise (phone, tablet, small laptops) the card sits in the flow under the brand line and the
// hook moves over the card's coin.
const xIn = (el) => { let x = 0; for (let e = el; e && e !== heroEl; e = e.offsetParent) x += e.offsetLeft; return x; };
const yIn = (el) => { let y = 0; for (let e = el; e && e !== heroEl; e = e.offsetParent) y += e.offsetTop; return y; };
function hang() {
  if (!rig || !heroEl || !stageEl || !copyEl || !coinWrap) return;
  const card = stageEl.querySelector('.hm-card'), cb = card?.querySelector('.hm-card__coin');
  if (!card || !cb) return;
  ['--hm-stage-l', '--hm-stage-t', '--hm-stage-w'].forEach((p) => stageEl.style.removeProperty(p));
  stageEl.classList.remove('is-hung'); heroEl.style.removeProperty('min-height'); rig.style.removeProperty('--hm-rig-l');
  const rw = rig.offsetWidth, rh = rig.offsetHeight, fromRight = card.offsetWidth - (cb.offsetLeft + cb.offsetWidth / 2), coinTop = cb.offsetTop;
  if (innerWidth >= 1100) {
    const bx = rig.offsetLeft + rw * BEND_X, by = rig.offsetTop + rh * BEND_Y, right = bx + fromRight;
    const blockers = [...document.querySelectorAll('.hm-actions > *, .hm-tag__coin, .hm-tag__read')].filter((e) => e.offsetWidth);
    const clear = Math.max(0, ...blockers.map((e) => xIn(e) + e.offsetWidth)) + 40, w = Math.min(560, Math.floor(right - clear));
    if (w >= 430) {
      const brand = $('[data-hm-line]'), top = Math.max(Math.round(by + 44 - coinTop), brand ? yIn(brand) + brand.offsetHeight + 18 : 0);
      stageEl.classList.add('is-hung');
      stageEl.style.setProperty('--hm-stage-w', w + 'px');
      stageEl.style.setProperty('--hm-stage-l', Math.round(right - w - copyEl.offsetLeft) + 'px');
      stageEl.style.setProperty('--hm-stage-t', Math.round(top - copyEl.offsetTop) + 'px');
      coinWrap.style.setProperty('--hm-cord', Math.round(top + coinTop - by + 3) + 'px');
      pivotToCoin = top + coinTop - rig.offsetTop;
      heroEl.style.setProperty('min-height', Math.round(top + stageEl.offsetHeight + 56) + 'px');
      return;
    }
  }
  const sx = xIn(stageEl), sy = yIn(stageEl), cx = sx + card.offsetWidth - fromRight;
  rig.style.setProperty('--hm-rig-l', Math.round(cx - rw * BEND_X) + 'px');
  const by = rig.offsetTop + rh * BEND_Y;
  coinWrap.style.setProperty('--hm-cord', Math.max(12, Math.round(sy + coinTop - by + 3)) + 'px');
  pivotToCoin = sy + coinTop - rig.offsetTop;
}
if (heroEl) { new ResizeObserver(() => hang()).observe(heroEl); document.fonts?.ready.then(hang); hang(); }
let spring = null;
function tug(side, usd = 0, w = null) {
  stage.hit(side, usd, w);
  if (RM || !rig) return;
  const k = Math.min(1, .35 + Math.log10(1 + usd) / 3.2);
  spring = { t0: performance.now(), a: (side === 'sell' ? -1.1 : side === 'burn' ? .7 : 1.6) * k, y: (side === 'sell' ? -5 : side === 'burn' ? 3 : 10) * k };
  requestAnimationFrame(swing);
}
// The hook turns about the top of the screen; the card follows the end of the cord, so the two never part.
function swing(now) {
  if (!spring) return;
  const t = (now - spring.t0) / 1000, e = Math.exp(-t * 3.4), a = spring.a * e * Math.cos(t * 8.5), y = spring.y * e * Math.cos(t * 11);
  rig.style.setProperty('--hm-swing', a.toFixed(3) + 'deg');
  coinWrap?.style.setProperty('--hm-tug', y.toFixed(2) + 'px');
  stageEl?.style.setProperty('--hm-tug', y.toFixed(2) + 'px');
  stageEl?.style.setProperty('--hm-card-x', (-pivotToCoin * Math.sin(a * Math.PI / 180)).toFixed(2) + 'px');
  if (t < 2.4) requestAnimationFrame(swing);
  else { rig.style.removeProperty('--hm-swing'); coinWrap?.style.removeProperty('--hm-tug'); stageEl?.style.removeProperty('--hm-tug'); stageEl?.style.removeProperty('--hm-card-x'); spring = null; }
}
const tagPrice = bigPrice($('[data-hv-qp]') || h('span'));
const tagChange = $('[data-hv-qc]');

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
// still be minutes old. Only events from the last few minutes tug the hook, rise off the coin or toast; older ones only
// join the tapes.
const isNews = (ts) => nowS() - (num(ts) || 0) < 180;
const flash = (el, text) => { if (!el) return; if (el.textContent && el.textContent !== text && !RM) { el.classList.add('is-tick'); setTimeout(() => el.classList.remove('is-tick'), 60); } el.textContent = text; };
const count = (key, v) => { const s = $(`[data-hm-count="${key}"]`); if (s && v != null) flash(s, String(v)); };
const chainName = (c) => CHAINS[String(c)] || 'Chain ' + c;
const chainDot = (c) => { const d = h('span', { class: 'qa-chain-dot' }); if (String(c) !== '4663') { d.style.setProperty('background', 'var(--qa-gold)'); d.style.setProperty('box-shadow', '0 0 9px var(--qa-gold)'); } return d; };
const pctCls = (x) => (x > .0005 ? 'qa-up' : x < -.0005 ? 'qa-down' : 'qa-muted');

/* ================= state ================= */
const H = {}, T = {};
const S = { feed: null, markets: [], q: null, qSum: null, rate: null, series: [], qTrades: [], seenTrades: new Set(), holders: new Set(), burns: null, seenBurns: new Set(), calls: [], seenCalls: new Set(), seenLaunch: new Set(), other: new Map(), recent: [] };
let calls = []; // the call posts on screen, each with update() for the live price
const qPrice = () => num(S.qSum?.priceUsd) ?? num(S.markets.find((m) => lower(m.token) === QH)?.summary?.priceUsd);

/* ================= pulse strip ================= */
const P = { launches: null, trades: null, vol: null, burned: null, holders: null };
const dash = (v, f) => (v == null ? '—' : f(v));
const pulse = statStrip([
  { label: 'Live launches', value: () => dash(P.launches, String) },
  { label: 'Trades 24h', value: () => dash(P.trades, (v) => v.toLocaleString('en-US')) },
  { label: 'Volume 24h', value: () => dash(P.vol, fmt.usd) },
  { label: 'QHOOKS burned', value: () => dash(P.burned, fmt.tok) },
  { label: 'QHOOKS holders', value: () => dash(P.holders, (v) => v.toLocaleString('en-US')) },
]);
$('[data-hm-pulse]')?.append(pulse.el);

/* ================= Builders: launches ================= */
const launchBox = $('[data-hm-launches]');
launchBox?.append(skeletonRows(4));
const launchRows = new Map();
function launchHref(m) { return lower(m.token) === QH ? '/terminal#t=' + QCHAIN + ':' + QH : '/terminal#m=' + encodeURIComponent(String(m.chainId)) + ':' + encodeURIComponent(lower(m.controller)); }
function iconFor(m, cls = 'hm-icon') {
  const src = logoOf(m.logo) || (lower(m.token) === QH ? QLOGO : null), el = h('span', { class: cls, 'aria-hidden': 'true' });
  if (src) { const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }); img.addEventListener('error', () => { img.remove(); el.textContent = String(m.symbol || '?').slice(0, 1); }, { once: true }); el.append(img); }
  else el.textContent = String(m.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase();
  return el;
}
function launchSub(m) {
  const parts = [chainName(m.chainId)], at = num(m.launchedAt) || (num(m.listedAt) ? m.listedAt / 1000 : null);
  if (at) parts.push(fmt.age(nowS() - at));
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
function featureBlock(m) {
  const s = m.summary || {}, banner = logoOf(m.profileBanner), at = num(m.launchedAt) || (num(m.listedAt) ? m.listedAt / 1000 : null);
  const art = banner ? h('div', { class: 'hm-feature__art' }, h('div', { class: 'hm-feature__glow', style: { '--hm-art': `url("${abs(banner)}")` } }), h('img', { src: banner, alt: '', decoding: 'async' })) : null;
  const c = coin(logoOf(m.logo) || (lower(m.token) === QH ? QLOGO : '/qx-a/img/qhooks-icon.jpg'), { size: 'md', alt: '' });
  return h('a', { class: 'hm-feature' + (art ? '' : ' hm-feature--plain'), href: launchHref(m), 'aria-label': (m.symbol || 'Token') + ', newest launch' }, art,
    h('div', { class: 'hm-feature__id' }, c, h('div', null, h('span', { class: 'hm-feature__kick' }, 'Newest launch'), h('div', { class: 'hm-feature__sym' }, m.symbol || m.name)),
      h('div', { class: 'hm-feature__v' }, h('b', null, num(s.mcapUsd) != null ? fmt.usd(s.mcapUsd) : '—'), num(s.change24) != null ? h('small', { class: pctCls(s.change24) }, fmt.pct(s.change24)) : null)),
    h('p', { class: 'hm-feature__meta' }, h('span', null, chainDot(m.chainId), chainName(m.chainId)), at ? h('span', null, 'Launched ' + fmt.age(nowS() - at) + ' ago') : null, num(s.holders) != null ? h('span', null, s.holders + ' holders') : null));
}
function drawLaunches(fresh = new Set()) {
  if (!launchBox) return;
  const live = S.markets.filter((m) => m.live);
  if (!live.length) { launchBox.replaceChildren(state('loading', { title: 'Refreshing launches' })); return; }
  const byNew = [...live].sort((a, b) => (b.listedAt || 0) - (a.listedAt || 0));
  const feat = byNew[0]; // the newest launch, on its own banner when it has one
  const rest = byNew.filter((m) => m !== feat).slice(0, 6);
  if (!launchBox.dataset.drawn) {
    launchRows.clear();
    const list = h('div', { class: 'qa-list hm-launches' }, rest.map((m) => { const r = launchRow(m); launchRows.set(key(m), r); return r.el; }));
    launchBox.replaceChildren(featureBlock(feat), h('div', { class: 'hm-live-h' }, h('b', null, 'Newest launches'), h('a', { class: 'qa-link', href: '/markets' }, 'Browse markets')), list);
    launchBox.dataset.drawn = '1'; launchBox.dataset.feat = key(feat); return;
  }
  // refresh in place: values tick, a new launch drops in at the top
  if (fresh.size) { launchBox.dataset.drawn = ''; drawLaunches(); for (const k of fresh) { const r = launchRows.get(k); if (r && !RM) restart(r.el, 'is-enter'); } return; }
  for (const m of rest) {
    const r = launchRows.get(key(m)); if (!r) continue; const s = m.summary || {};
    flash(r.v, num(s.mcapUsd) != null ? fmt.usd(s.mcapUsd) : '—');
    r.ch.className = 'hm-tick ' + pctCls(num(s.change24) ?? 0); flash(r.ch, num(s.change24) != null ? fmt.pct(s.change24) : '');
    r.sub.textContent = launchSub(m);
  }
}
const key = (m) => String(m.chainId) + ':' + lower(m.controller || m.token);

async function loadFeed() {
  const body = await getJSON(FEED);
  if (!Array.isArray(body?.markets)) throw Error('feed');
  const first = !S.feed; S.feed = body;
  const seen = new Set(), markets = body.markets.filter((m) => { const k = key(m); if (seen.has(k)) return false; seen.add(k); return true; });
  const fresh = new Set();
  for (const m of markets) if (m.live && !S.seenLaunch.has(key(m))) { if (!first) fresh.add(key(m)); S.seenLaunch.add(key(m)); }
  // other launches that traded since we last looked: read their trades for the ribbon
  for (const m of markets) {
    const o = S.other.get(key(m)), lt = num(m.summary?.lastTradeAt);
    if (o && lt && lt > o.lastTradeAt) { o.lastTradeAt = lt; readOther(m, true); }
  }
  S.markets = markets;
  const live = markets.filter((m) => m.live);
  P.launches = live.length;
  P.trades = live.reduce((a, m) => a + (num(m.summary?.trades24) || 0), 0);
  P.vol = live.reduce((a, m) => a + (num(m.summary?.volume24Usd) || 0), 0);
  const qm = markets.find((m) => lower(m.token) === QH); if (qm && P.holders == null) P.holders = num(qm.summary?.holders);
  pulse.update(!first); count('launches', live.length);
  if (first) { brand.refresh(); loadProofs().catch(() => {}); }
  drawLaunches(fresh);
  if (!S.q && qm) paintTag(qm.summary);
  for (const k of fresh) { const m = markets.find((x) => key(x) === k); if (m) ribbon?.news({ kind: 'launch', label: 'New launch', text: `${m.symbol} on ${chainName(m.chainId)}`, img: logoOf(m.logo) ? abs(logoOf(m.logo)) : undefined }); }
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
    add.forEach((t) => noteTrade(t, m));
    if (live) { stage.refresh('traders'); add.filter((t) => isNews(t.ts)).forEach((t, i) => setTimeout(() => tug(t.buy ? 'buy' : 'sell', num(t.valueUsd) || 0, t.trader), RM ? 0 : i * 420)); } else brand.refresh();
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

/* ================= Traders: QHOOKS live ================= */
const tradeBox = $('[data-hm-trade]'), tradeSide = $('[data-hm-trade-side]');
function buildTraders() {
  if (!tradeBox || T.el) return;
  const id = h('div', { class: 'hm-trade-id' }, coin(QLOGO, { size: 'sm', alt: '' }), h('b', null, 'QHOOKS'), h('p', { class: 'qa-meta' }, h('span', null, chainDot(QCHAIN), 'Robinhood Chain'), h('a', { class: 'qa-meta__proof', href: '/proof' }, 'QProof')));
  T.price = bigPrice(); T.change = changeLine(); T.live = liveLabel();
  const canvas = h('canvas', { 'aria-label': 'QHOOKS price, last 24 hours', role: 'img' });
  T.wrap = h('div', { class: 'qa-chart__wrap' }, canvas);
  T.chartBox = h('div', { class: 'qa-chart hm-trade-chart' }, T.live.el, T.wrap);
  T.stats = statStrip([
    { label: 'Market cap', value: () => dash(num(S.qSum?.mcapUsd), fmt.usd) },
    { label: 'Volume 24h', value: () => dash(num(S.qSum?.volume24Usd), fmt.usd) },
    { label: 'Buys / sells 24h', value: () => (S.qSum ? `${S.qSum.buys24 ?? 0} / ${S.qSum.sells24 ?? 0}` : '—'), bar: () => [S.qSum?.buys24 || 1, S.qSum?.sells24 || 1] },
    { label: 'Traders 24h', value: () => dash(num(S.qSum?.traders24), String) },
    { label: 'Top 10 hold', value: () => dash(num(S.qSum?.top10), (v) => (v * 100).toFixed(1) + '%') },
  ]);
  T.stats.el.classList.add('hm-trade-stats');
  T.el = h('div', null, id, h('div', { class: 'hm-trade-px' }, T.price.el, T.change.el), T.chartBox, T.stats.el);
  tradeBox.replaceChildren(T.el);
  T.tape = tape({ rows: 8 });
  tradeSide?.replaceChildren(h('div', { class: 'hm-live-h' }, h('b', null, 'Trades'), h('span', null, 'QHOOKS, newest first')), T.tape.el, h('a', { class: 'qa-link hm-call-go', href: '/terminal#t=' + QCHAIN + ':' + QH }, 'Trade here for 40% back →'));
  T.chart = liveChart(canvas, {
    series: () => S.series,
    getLive: () => ({ ts: nowS(), price: qPrice() || (S.series.length ? S.series[S.series.length - 1][1] : 0) }),
    marks: () => S.qTrades.slice(0, 80).map((t) => ({ ts: t.ts, price: t.priceUsd, kind: t.buy ? 'buy' : 'sell', usd: t.valueUsd })),
  });
}
if (tradeBox) tradeBox.append(skeletonRows(3));
const toRow = (t) => ({ ts: t.ts, b: t.buy ? 1 : 0, usd: num(t.valueUsd) || 0, tok: num(t.token) || 0, w: t.trader, id: t.id });
// The digits flash only when a newer market read moves the price, never when the first read replaces the feed's figure.
function paintTag(sum, live = false) {
  const p = num(sum?.priceUsd); if (p == null) return;
  tagPrice.set(p, live && S.tagPrev != null ? Math.sign(p - S.tagPrev) : 0); S.tagPrev = p;
  const c = num(sum?.change24); if (tagChange && c != null) { tagChange.textContent = fmt.pct(c); tagChange.dataset.dir = String(Math.sign(Math.round(c * 1000))); tagChange.setAttribute('aria-label', '24-hour change ' + fmt.pct(c)); }
}
function paintTraders(prev) {
  buildTraders(); const sum = S.qSum; if (!sum) return;
  const p = qPrice(); if (p != null) T.price.set(p, prev != null && p !== prev ? Math.sign(p - prev) : 0);
  const c = num(sum.change24); if (c != null) T.change.set(c, { label: '24h' });
  T.stats.update(prev != null);
  count('traders', num(sum.traders24));
  count('holders', num(sum.holders));
  P.holders = num(sum.holders) ?? P.holders; pulse.update(prev != null);
  paintTag(sum, prev != null);
  calls.forEach((x) => x.update());
}
let traderTapeShown = false;
function showTape() {
  if (traderTapeShown || !T.tape) return; traderTapeShown = true;
  const rows = S.qTrades.filter((t) => (num(t.valueUsd) || 0) >= .01).slice(0, 8).map(toRow);
  if (RM) { T.tape.render(rows); T.tape.ages(nowS()); return; }
  // the latest real trades lay themselves down, oldest first, when the act comes into view
  rows.reverse().forEach((r, i) => setTimeout(() => { T.tape.push(r); T.tape.ages(nowS()); }, 160 * i));
}
async function loadQ() {
  const body = await getJSON(MARKET(QCHAIN, QH), 15000);
  if (!body?.summary) throw Error('market');
  const first = !S.q, prev = first ? null : qPrice();
  S.q = body; S.qSum = body.summary;
  const pr = num(body.summary.price), pu = num(body.summary.priceUsd); if (pr && pu) S.rate = pu / pr;
  const trades = (Array.isArray(body.trades) ? body.trades : []).filter((t) => t?.id && num(t.ts) && num(t.priceUsd));
  const shown = (t) => (num(t.valueUsd) || 0) >= .01; // dust (under a cent) stays on the chart, not in the tape or ribbon
  if (first) {
    const candles = (Array.isArray(body.candles) ? body.candles : []).filter((c) => num(Number(c?.close)) && num(Number(c?.time)));
    S.series = S.rate ? candles.map((c) => [Number(c.time), Number(c.close) * S.rate]) : trades.map((t) => [t.ts, t.priceUsd]).reverse();
    S.qTrades = trades; trades.forEach((t) => { S.seenTrades.add(t.id); noteTrade(t); });
    brand.refresh();
    (body.holders || []).forEach((x) => { if (!x.excludedFromHolderCount) S.holders.add(lower(x.holder)); });
    paintTraders(null); drawHolders();
    const lastTs = trades[0]?.ts; if (lastTs) T.live.setLast(Math.max(0, Date.now() - lastTs * 1000));
    if (tradeSide) inView(tradeSide, showTape, .15);
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
  const side = t.buy ? 'buy' : 'sell', usd = num(t.valueUsd) || 0, from = S.series.length ? S.series[S.series.length - 1][1] : t.priceUsd;
  S.series.push([t.ts, t.priceUsd]);
  T.chart?.trade({ from, to: t.priceUsd, side, usd }); T.live?.hit();
  noteTrade(t); stage.refresh('traders');
  if (usd >= .01) T.tape?.push(toRow(t));
  paintTraders(prev);
  if (usd >= .01) ribbon?.push({ symbol: 'QHOOKS', img: abs(QLOGO), side, usd, w: t.trader });
  if (!isNews(t.ts)) return;
  tug(side, usd, t.trader);
  const who = lower(t.trader);
  if (t.buy && !before.has(who) && S.holders.has(who)) {
    toast({ kind: 'holder', title: h('span', null, h('b', null, 'New holder'), ' · ' + fmt.tok(num(t.token) || 0) + ' QHOOKS'), body: `${fmt.short(t.trader)} bought ${fmt.usdExact(usd)}`, ava: avatar(t.trader) });
    ribbon?.news({ kind: 'holder', label: 'New holder', text: `${fmt.short(t.trader)} bought ${fmt.usdExact(usd)} of QHOOKS`, w: t.trader });
  } else if (t.buy && usd >= 100) ribbon?.news({ kind: 'buy', label: 'Big buy', text: `${fmt.short(t.trader)} bought ${fmt.usdExact(usd)} of QHOOKS`, w: t.trader });
}
setInterval(() => { const n = nowS(); T.tape?.ages(n); H.tape?.ages(n); }, 1000);

/* ================= Holders: burns, the next buyback, the supply ================= */
// A buyback row: the QHOOKS it burned, what it spent, its age. Same row as the trades tape, burn wash.
function burnTape(rows = 6) {
  const el = h('ol', { class: 'qa-tape hm-burn-tape', 'aria-live': 'off' });
  const row = (r, enter) => { const age = h('span', { class: 'qa-trow__age' }); age.dataset.ts = r.ts;
    return h('li', { class: 'qa-trow is-burn' + (enter && !RM ? ' is-enter' : ''), style: { '--w': Math.min(100, 8 + 14 * Math.log10(1 + r.tok)).toFixed(1) + '%' }, 'aria-label': 'Buyback burned ' + fmt.tok(r.tok) + ' QHOOKS' },
      icon('flame', 'qa-glyph'), h('span', { class: 'qa-trow__usd' }, fmt.tok(r.tok)), h('span', { class: 'qa-trow__amt' }, r.usd ? fmt.usdExact(r.usd) : ''), h('span', { class: 'qa-trow__who' }, keeperAvatar(), h('span', null, 'Buyback')), age); };
  return { el, render(list) { el.replaceChildren(...list.slice(0, rows).map((r) => row(r))); }, push(r) { el.prepend(row(r, true)); while (el.children.length > rows) el.lastElementChild.remove(); }, ages(n) { el.querySelectorAll('[data-ts]').forEach((x) => (x.textContent = fmt.age(n - +x.dataset.ts))); } };
}
const holdBox = $('[data-hm-holders]');
function buildHolders() {
  if (!holdBox || H.el) return;
  H.cd = countdown({ label: 'until the next buyback', total: 900 });
  H.fig = h('div', { class: 'qa-figures' }, [['burned', 'QHOOKS burned'], ['burns', 'buybacks'], ['holders', 'holders']].map(([k, l]) => h('div', null, h('b', { class: 'hm-tick', dataset: { f: k } }, '—'), h('span', null, l))));
  H.supply = h('div', { class: 'hm-supply' });
  H.tape = burnTape();
  H.cdLabel = H.cd.querySelector('span');
  H.el = h('div', null, h('div', { class: 'hm-hold-top' }, H.cd, H.fig), H.supply, h('div', { class: 'hm-burns' }, h('div', { class: 'hm-live-h' }, h('b', null, 'Buybacks'), h('span', null, 'QHOOKS burned, newest first')), H.tape.el, h('a', { class: 'qa-link hm-call-go', href: '/qhooks-token#qx-buybacks' }, 'Every burn →')));
  holdBox.replaceChildren(H.el);
}
if (holdBox) holdBox.append(skeletonRows(3));
const wethUsd = () => num(S.qTrades.find((t) => num(t.quoteUsd))?.quoteUsd) ?? null;
const units = (wei) => { try { return Number(BigInt(wei || 0)) / 1e18; } catch { return 0; } };
const burnRow = (b) => { const eth = units(b.spentWei), px = wethUsd(); return { ts: b.at, b: 0, bb: 1, usd: px ? eth * px : 0, tok: units(b.burnedWei), id: b.tx }; };
let supplyKey = '';
function drawHolders(update = false) {
  if (!S.burns && !S.qSum) return;
  buildHolders();
  const fig = (k, v) => flash(H.fig.querySelector(`[data-f="${k}"]`), v);
  const dead = S.burns?.dead?.balanceWei ? units(S.burns.dead.balanceWei) : num(S.qSum?.burned);
  if (dead != null) { fig('burned', fmt.tok(dead)); P.burned = dead; }
  if (num(S.burns?.burns?.count) != null) fig('burns', S.burns.burns.count.toLocaleString('en-US'));
  if (num(S.qSum?.holders) != null) fig('holders', String(S.qSum.holders));
  pulse.update(update);
  // supply: from the market's labelled holders and summary
  const s = S.qSum, list = S.q?.holders || [];
  if (s && num(s.supply) != null) {
    const burned = num(s.burned) || 0, total = s.supply + burned;
    const sumL = (re) => list.filter((x) => re.test(String(x.label || ''))).reduce((a, x) => a + (num(x.units) || 0), 0);
    const locked = sumL(/QLocks|Locked/i), staked = sumL(/Stakers/i), pool = sumL(/^Pool$/i);
    const platform = list.filter((x) => x.excludedFromHolderCount && !/QLocks|Locked|Stakers|^Pool$|Burn/i.test(String(x.label || ''))).reduce((a, x) => a + (num(x.units) || 0), 0);
    const top = list.filter((x) => !x.excludedFromHolderCount).slice(0, 10).reduce((a, x) => a + (num(x.units) || 0), 0);
    const rest = Math.max(0, total - locked - staked - pool - burned - platform - top);
    const parts = [['locked', 'Locked in QLocks', locked], ['staked', 'Stakers vault', staked], ['pool', 'In the pool', pool], ['top', 'Top 10 wallets', top], ['rest', 'Everyone else', rest], ['platform', 'Platform and engines', platform], ['burned', 'Burned', burned]]
      .filter((p) => p[2] > 0).map(([k, label, v]) => ({ key: k, label, share: v / total * 100 }));
    const sk = parts.map((p) => p.key + p.share.toFixed(1)).join();
    if (sk !== supplyKey) {
      supplyKey = sk;
      H.supply.replaceChildren(h('div', { class: 'hm-live-h' }, h('b', null, 'QHOOKS supply'), h('span', null, fmt.tok(total) + ' total')),
        supplyMap(parts, { locked: 'var(--qa-gold)', staked: 'var(--qa-gold-hi)', pool: 'var(--qa-gold-lo)', burned: 'var(--qa-fire)', top: 'color-mix(in srgb, var(--qa-tx) 52%, transparent)', rest: 'var(--qa-rule-2)', platform: 'color-mix(in srgb, var(--qa-tx) 24%, transparent)' }));
    }
  }
  // the burns tape needs the WETH price from the trades
  if (S.burns && !H.burnsDrawn && wethUsd()) {
    H.burnsDrawn = true;
    // every burn in this read counts as seen (not only the six on screen), so the next read toasts only newer ones
    const all = S.burns.burns?.recent || [], recent = all.slice(0, 6);
    all.forEach((b) => { S.seenBurns.add(b.tx); S.lastBurnAt = Math.max(S.lastBurnAt || 0, num(b.at) || 0); });
    H.tape.render(recent.map(burnRow)); H.tape.ages(nowS());
    recent.slice(0, 4).forEach((b) => { const r = burnRow(b); ribbonTrade({ symbol: 'QHOOKS', img: abs(QLOGO), side: 'burn', usd: r.usd, w: null, ts: b.at }, true); });
  }
}
// The burn ticker module reads /api/qhooks/buybacks; it hands each result to this page.
function onBuybacks(e) {
  const { data, fetchedAt } = e.detail || {}; if (!data) return;
  const firstBurns = !S.burns; S.burns = data; S.bbAt = fetchedAt || Date.now();
  if (!firstBurns && H.burnsDrawn) {
    const fresh = (data.burns?.recent || []).filter((b) => b.tx && !S.seenBurns.has(b.tx) && (num(b.at) || 0) > (S.lastBurnAt || 0)).reverse();
    for (const b of fresh) {
      S.seenBurns.add(b.tx); S.lastBurnAt = Math.max(S.lastBurnAt || 0, num(b.at) || 0); const r = burnRow(b);
      H.tape.push(r);
      if (!isNews(b.at)) continue;
      tug('burn', r.usd);
      ribbon?.push({ symbol: 'QHOOKS', img: abs(QLOGO), side: 'burn', usd: r.usd });
      toast({ kind: 'burn', title: h('span', null, h('b', null, 'Buyback'), ' · burned'), body: `${fmt.tok(r.tok)} QHOOKS for ${fmt.usdExact(r.usd)}`, ava: keeperAvatar() });
    }
  }
  drawHolders(!firstBurns);
  if (firstBurns) brand.refresh();
}
document.addEventListener('qx:buybacks', onBuybacks);
if (globalThis.__qxBuybacks) onBuybacks({ detail: globalThis.__qxBuybacks });
setInterval(() => {
  const d = S.burns, r = d?.rules; if (!H.cd || !r) return;
  if (!r.everRun) { H.cd.set(0); H.cd.querySelector('b').textContent = r.ready ? 'Ready' : 'Soon'; if (H.cdLabel) H.cdLabel.textContent = 'first buyback'; return; }
  const chainNow = (d.blockTime || S.bbAt / 1000) + (Date.now() - S.bbAt) / 1000, left = Math.max(0, (r.nextAt || 0) - chainNow);
  H.cd.set(left); if (H.cdLabel) H.cdLabel.textContent = left > 0 ? 'until the next buyback' : 'next buyback';
}, 1000);

/* ================= Callers: real calls, Called -> Now ================= */
const callBox = $('[data-hm-calls]');
callBox?.append(skeletonRows(2));
function boardLogo(b) {
  if (!b) return null; if (lower(b.address) === QH) return QLOGO;
  const m = S.markets.find((x) => lower(x.token) === lower(b.address) || lower(x.controller) === lower(b.controller || b.address));
  return logoOf(m?.logo);
}
function callPost(c, enter) {
  const sym = c.board?.symbol || c.board?.name || 'token', isQ = lower(c.board?.address) === QH;
  // The feed's priceNow can be in the pool's quote unit while the call price is in USD (a WETH price against a USD call
  // reads as -100%). Show the outcome only for QHOOKS (live USD price) or when the two prices are plausibly the same unit.
  const pn = num(c.call?.priceNow), sameUnit = pn != null && pn / c.call.price > 1e-3 && pn / c.call.price < 1e3;
  const nowP = () => (isQ ? qPrice() : null) ?? (sameUnit ? pn : null);
  const out = isQ || sameUnit ? callOutcome({ callPrice: c.call.price, nowPrice: nowP() ?? c.call.price }) : null;
  const p = post({ w: c.author, name: fmt.short(c.author), age: fmt.age((Date.now() - c.createdAt) / 1000), what: h('span', null, 'called', tokenChip('$' + sym, boardLogo(c.board))), text: c.text, media: out ? [out] : [], enter });
  const href = c.links?.path || (c.id ? '/call/' + c.id : null);
  if (href) p.querySelector('.qa-post__body').append(h('a', { class: 'hm-call-go', href }, 'Open the call →'));
  // The caller's face and name open their profile (components.post draws them as plain text).
  const prof = profileUrl({ wallet: c.author }), label = 'Open profile of ' + fmt.short(c.author), ava = p.querySelector(':scope > .qa-ava'), nm = p.querySelector('.qa-post__name');
  if (ava) { const link = h('a', { class: 'cx-face', href: prof, 'aria-label': label }); ava.replaceWith(link); link.append(ava); }
  if (nm) nm.replaceWith(h('a', { class: 'qa-post__name cx-who__link', href: prof, title: 'Open profile', 'aria-label': label }, h('span', { class: 'cx-who__t' }, nm.textContent), h('span', { class: 'cx-who__chev', 'aria-hidden': 'true' }, '›')));
  return { el: p, update: () => { const v = nowP(); if (out && v != null) out.update(v); } };
}
async function loadCalls() {
  const body = await getJSON(CALLS);
  const list = (Array.isArray(body?.calls) ? body.calls : []).filter((c) => c?.kind === 'call' && !c.folded && num(c.call?.price) && c.author).sort((a, b) => b.createdAt - a.createdAt);
  const first = !S.callsLoaded; S.callsLoaded = true;
  S.latestCall = list[0] || null; if (first) brand.refresh();
  count('calls', list.length);
  if (!callBox) return;
  if (!list.length) { callBox.replaceChildren(state('empty', { title: 'No calls yet', body: 'Make the first call on a token and build your record.', action: 'Make a call', onAction: () => location.assign('/community#make-a-call') })); return; }
  const fresh = first ? [] : list.filter((c) => !S.seenCalls.has(c.id));
  list.forEach((c) => S.seenCalls.add(c.id));
  if (first || fresh.length) {
    calls = list.slice(0, 3).map((c) => callPost(c, fresh.some((f) => f.id === c.id)));
    callBox.replaceChildren(h('div', { class: 'hm-live-h' }, h('b', null, 'Latest calls'), h('a', { class: 'qa-link', href: '/community#callers' }, 'Every caller')), h('div', { class: 'qa-feed hm-calls' }, calls.map((x) => x.el)));
  }
  for (const c of fresh) {
    const sym = c.board?.symbol || 'token';
    toast({ kind: 'call', title: h('span', null, h('b', null, 'Call'), ' · ' + fmt.short(c.author)), body: `Called $${sym} at ${fmt.price(c.call.price)}`, ava: avatar(c.author) });
    ribbon?.news({ kind: 'call', label: 'New call', text: `${fmt.short(c.author)} called $${sym}`, w: c.author });
  }
  if (first && list[0]) {
    const c = list[0], isQ = lower(c.board?.address) === QH, now = (isQ ? qPrice() : null) ?? num(c.call.priceNow);
    if (now) setTimeout(() => ribbon?.news({ kind: 'call', label: 'Latest call', text: `${fmt.short(c.author)} called $${c.board?.symbol || 'token'} · ${fmt.mult(now / c.call.price)} since`, w: c.author }), 9000);
  }
}

/* ================= Proof: the real pre-buy checks of the most traded launches ================= */
// Cached RepoProof reports through /api/repoproof/check (GET reads the cache; it never starts a new run).
const proofBox = $('[data-hm-proofs]');
proofBox?.append(skeletonRows(3));
const LEVEL = { clear: 'qa-up', caution: 'hm-warn', danger: 'qa-down' };
const RANK = { danger: 0, caution: 1, unknown: 2, clear: 3 };
const when = (v) => { const t = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(t) ? t : null; };
function proofCard(m, r) {
  const rep = r.report, c = rep.counts || {};
  const total = ['danger', 'caution', 'clear', 'unknown'].reduce((a, k) => a + (num(c[k]) || 0), 0);
  const top = [...rep.checks].filter((k) => k?.title).sort((a, b) => (RANK[a.status] ?? 2) - (RANK[b.status] ?? 2)).slice(0, 4);
  const at = when(r.checkedAt);
  const full = typeof rep.url === 'string' && /^https:\/\/repoproof\.online\//.test(rep.url) ? h('a', { class: 'hm-call-go', href: rep.url, target: '_blank', rel: 'noopener' }, 'Full report →') : null;
  return h('article', { class: 'hm-proof-card' },
    h('a', { class: 'hm-proof-card__id', href: launchHref(m) }, iconFor(m), h('span', null, h('b', null, m.symbol || m.name || 'Token'), h('small', null, chainName(m.chainId) + (at ? ' · checked ' + fmt.age((Date.now() - at) / 1000) + ' ago' : '')))),
    h('p', { class: 'hm-proof-card__lv ' + (LEVEL[rep.level] || 'qa-muted') }, h('span', { class: 'hm-proof-card__dot', 'aria-hidden': 'true' }), h('b', null, rep.headline || 'Checked'), total ? h('small', null, `${num(c.clear) || 0} of ${total} clear`) : null),
    checks(top.map((k) => ({ status: k.status, title: k.title }))),
    full);
}
async function loadProofs() {
  if (!proofBox || !S.markets.length) return;
  const picks = S.markets.filter((m) => m.live && /^0x[0-9a-f]{40}$/i.test(String(m.token)) && /^\d+$/.test(String(m.chainId)))
    .sort((a, b) => (num(b.summary?.trades24) || 0) - (num(a.summary?.trades24) || 0)).slice(0, 3);
  const got = await Promise.all(picks.map((m) => getJSON('/api/repoproof/check?' + new URLSearchParams({ kind: 'token', chainId: String(m.chainId), address: lower(m.token) }))
    .then((r) => ({ m, r }), () => ({ m, r: null }))));
  const ready = got.filter((x) => x.r?.state === 'ready' && x.r.report && Array.isArray(x.r.report.checks));
  if (!ready.length) { proofBox.replaceChildren(state('empty', { title: 'No checks yet', body: 'Open a token in the terminal to check it.', action: 'Open the terminal', onAction: () => location.assign('/terminal') })); return; }
  proofBox.replaceChildren(h('div', { class: 'hm-live-h' }, h('b', null, 'Latest checks'), h('span', null, 'Most traded')), h('div', { class: 'hm-proofs' }, ready.map(({ m, r }) => proofCard(m, r))));
}

/* ================= the cards on the hook: one per brand-line word ================= */
// Every card is read from what the loaders above already hold. A card with no data yet returns null and the hook keeps
// what it has. The QHOOKS outcome on a call is shown only when both prices are USD (see callPost).
const artOf = (m) => (!m ? null : lower(m.token) === QH ? QART : logoOf(m.profileBanner) || logoOf(m.logo));
const marketOf = (a) => (a ? S.markets.find((x) => lower(x.token) === lower(a) || lower(x.controller) === lower(a)) : null);
// The latest trades from every launch this page reads (QHOOKS live, the two most active others), newest first.
function noteTrade(t, m) {
  const usd = num(t?.valueUsd) || 0; if (usd < .01 || !num(t?.ts)) return;
  const isQ = !m || lower(m.token) === QH, id = t.id || t.trader + ':' + t.ts + ':' + usd;
  if (S.recent.some((r) => r.id === id)) return;
  S.recent.push({ id, ts: t.ts, side: t.buy ? 'buy' : 'sell', usd, w: t.trader, sym: isQ ? 'QHOOKS' : m.symbol || 'Token',
    img: isQ ? QLOGO : logoOf(m.logo), art: isQ ? QART : artOf(m), href: isQ ? '/terminal#t=' + QCHAIN + ':' + QH : launchHref(m) });
  S.recent.sort((a, b) => b.ts - a.ts); S.recent.length = Math.min(S.recent.length, 12);
}
const tradeRow = (r) => h('span', { class: 'hm-card__row is-' + r.side }, h('b', null, (r.side === 'sell' ? '▼ ' : '▲ ') + fmt.usdExact(r.usd)), tokenChip(r.sym, r.img), h('time', null, fmt.age(nowS() - r.ts)));
CARDS.builders = () => {
  const m = S.markets.filter((x) => x.live).sort((a, b) => (b.listedAt || 0) - (a.listedAt || 0))[0];
  if (!m) return null;
  const at = num(m.launchedAt) || (num(m.listedAt) ? m.listedAt / 1000 : null), t = num(m.summary?.trades24);
  return { kind: 'launch', art: artOf(m), coin: logoOf(m.logo) || (lower(m.token) === QH ? QLOGO : null), href: launchHref(m),
    kick: 'Newest launch', title: m.symbol || m.name || 'Token',
    sub: [chainName(m.chainId), at ? fmt.age(nowS() - at) + ' ago' : null, t != null ? t + (t === 1 ? ' trade' : ' trades') : null].filter(Boolean).join(' · ') };
};
CARDS.callers = () => {
  const c = S.latestCall; if (!c) return null;
  const sym = c.board?.symbol || c.board?.name || 'token', isQ = lower(c.board?.address) === QH, m = marketOf(c.board?.address);
  const now = isQ && c.call?.quoteSymbol === 'USD' ? qPrice() : null, x = now && c.call?.price ? now / c.call.price : null;
  const ago = num(c.createdAt) ? fmt.age((Date.now() - c.createdAt) / 1000) + ' ago' : null;
  return { kind: 'call', art: isQ ? QART : artOf(m) || boardLogo(c.board), coin: boardLogo(c.board), ava: avatar(c.author), href: c.links?.path || (c.id ? '/call/' + c.id : '/community#callers'),
    kick: 'Latest call', title: '$' + sym,
    sub: [fmt.short(c.author), num(c.call?.price) ? 'at ' + fmt.price(c.call.price) : null, ago].filter(Boolean).join(' · '),
    fig: x ? fmt.mult(x) : null, figCls: x ? pctCls(x - 1) : '', figSub: x ? 'since' : null };
};
CARDS.holders = () => {
  const b = S.burns?.burns?.recent?.[0], tok = b ? units(b.burnedWei) : 0;
  const tail = [P.burned != null ? fmt.tok(P.burned) + ' total' : null, P.holders != null ? P.holders.toLocaleString('en-US') + ' holders' : null];
  if (b && tok > 0) return { kind: 'burn', art: QART, coin: QLOGO, href: '/qhooks-token#qx-buybacks', kick: 'Buyback', kickCls: 'is-fire',
    title: fmt.tok(tok) + ' QHOOKS burned', sub: [num(b.at) ? fmt.age(nowS() - b.at) + ' ago' : null, ...tail].filter(Boolean).join(' · ') };
  if (P.holders == null && P.burned == null) return null;
  return { kind: 'burn', art: QART, coin: QLOGO, href: '/qhooks-token', kick: 'Holders', title: P.holders != null ? P.holders.toLocaleString('en-US') + ' holders' : fmt.tok(P.burned) + ' burned', sub: tail.filter(Boolean).join(' · ') };
};
CARDS.traders = () => {
  const rows = S.recent.slice(0, 3); if (!rows.length) return null;
  return { kind: 'trades', art: rows[0].art, coin: rows[0].img, href: rows[0].href, kick: 'Latest trades', kickCls: 'is-buy', rows: rows.map(tradeRow) };
};
CARDS.rest = () => {
  if (P.launches == null) return null;
  const live = S.markets.filter((m) => m.live).sort((a, b) => (num(b.summary?.trades24) || 0) - (num(a.summary?.trades24) || 0)).slice(0, 6);
  const tail = [P.trades != null ? P.trades.toLocaleString('en-US') + ' trades' : null, P.vol != null ? fmt.usd(P.vol) + ' volume' : null].filter(Boolean).join(' · ');
  return { kind: 'rest', art: QART, coin: QLOGO, href: '/markets', kick: 'Live now', title: P.launches + ' live launches', coins: live.map((m) => iconFor(m, 'hm-card__mini')),
    sub: tail ? tail + ' in 24h' : null };
};

/* ================= start ================= */
poll(loadFeed, 60000);
poll(loadQ, 20000);
poll(loadCalls, 60000);
// the feed, market and calls come back in any order; the call outcomes use the live QHOOKS price once it is known
