// QHooks System A: the ecosystem feed behind the shell's live ribbon and its token search.
// Real public data only:
//   /api/terminal/feed?chain=all   every QHooks launch with its 24h numbers; a new trade shows up as a change in a
//                                  market's buy or sell count (the side is exact; the size only when it was one trade)
//   /api/community/activity        calls (news: a new call, or the latest one on first view)
//   /api/qhooks/buybacks           QHOOKS buyback burns (news: a new burn), read again only after the next buyback time
//   /qx-drop-banner.mjs            the launch-week drop line, while its window runs
// Requests run only while the tab is visible and someone is using it (a tap, a key, a scroll in the last 2 minutes).
// An idle or hidden tab makes no requests. Answers are cached in localStorage and shared by every page and tab, so
// moving between pages does not refetch: at most one feed read per 25 s, activity per 3 min, buybacks per buyback run.
import { fmt } from './components.mjs';

const ECO = 'qa:eco:v1', CALLS = 'qa:calls:v1', BURNS = 'qa:burns:v1';
const ECO_TTL = 25e3, CALLS_TTL = 180e3, IDLE = 120e3;
const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const mem = {};
const cached = (k) => read(k) || mem[k] || null;
const inflight = {};
async function getJSON(url) {
  const r = await fetch(url, { credentials: 'omit', headers: { accept: 'application/json' } });
  if (!r.ok) throw Error(String(r.status));
  return r.json();
}
function load(key, ttl, url, shape) {
  const c = cached(key);
  if (c && Date.now() - c.at < ttl) return Promise.resolve(c);
  if (inflight[key]) return inflight[key];
  inflight[key] = getJSON(url).then((j) => { const v = { at: Date.now(), ...shape(j) }; mem[key] = v; write(key, v); return v; })
    .catch(() => c).finally(() => { delete inflight[key]; });
  return inflight[key];
}

/* ---------- the QHooks launches (also the shell's token search) ---------- */
const num = (v) => (Number.isFinite(+v) ? +v : null);
// Token art from the feed: same-origin paths or inline images only (the site's CSP allows no other hosts for this).
const art = (u) => { if (typeof u !== 'string' || !u) return null; if (/^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)) return u; const p = u.replace(/^https:\/\/(www\.)?qhooks\.com(?=\/)/, ''); return p.startsWith('/') && !p.startsWith('//') ? p : null; };
export function loadEco(maxAge = ECO_TTL) {
  return load(ECO, maxAge, '/api/terminal/feed?chain=all', (j) => ({
    m: (j?.markets || []).filter((m) => m && m.chainId && m.controller && m.symbol).map((m) => {
      const s = m.summary || {};
      return { c: String(m.chainId), k: m.controller, t: m.token, s: m.symbol, n: m.name || '', i: art(m.logo || m.profileImage), live: !!m.live,
        ch: num(s.change24), v: num(s.volume24Usd), tr: num(s.trades24), b: num(s.buys24), se: num(s.sells24), lt: num(s.lastTradeAt), at: num(m.listedAt) };
    }),
  }));
}
const loadCalls = () => load(CALLS, CALLS_TTL, '/api/community/activity', (j) => ({
  c: (j?.calls || []).filter((c) => c?.id && c.author && c.board?.symbol).slice(0, 12).map((c) => ({ id: c.id, w: c.author, s: c.board.symbol, ch: String(c.board.chainId || ''), a: c.board.address, at: num(c.createdAt) })),
}));
function loadBurns() {
  const c = cached(BURNS);
  // The buyback runs on a cooldown; there is nothing new to read before its next time.
  const due = !c || (c.next ? Date.now() / 1e3 > c.next + 30 : Date.now() - c.at > 15 * 60e3);
  return load(BURNS, due ? 0 : Infinity, '/api/qhooks/buybacks', (j) => ({
    next: num(j?.rules?.nextAt), total: j?.burns?.qhooksBurnedWei || null,
    r: (j?.burns?.recent || []).slice(0, 8).map((b) => ({ tx: b.tx, at: num(b.at), wei: b.burnedWei })),
  }));
}
const tokens = (wei) => { try { const n = BigInt(wei); return Number(n / 10n ** 12n) / 1e6; } catch { return null; } };
const tokAmt = (n) => (n == null ? '' : n >= 1 ? fmt.tok(n) : n >= .01 ? n.toFixed(2) : n > 0 ? '<0.01' : '0');
const market = (m) => '/terminal#m=' + m.c + ':' + m.k;
const ago = (sec) => fmt.age(Date.now() / 1e3 - sec);

/* ---------- the ribbon ---------- */
export function startLive(rib) {
  let prev = null, seenCalls = null, seenBurns = null, timer = 0, lastUse = Date.now(), running = false, first = true;
  const use = () => { lastUse = Date.now(); if (!running && !document.hidden) tick(); };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) addEventListener(ev, use, { passive: true, capture: true });
  addEventListener('pointermove', () => { lastUse = Date.now(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) use(); });

  async function tick() {
    clearTimeout(timer); timer = 0;
    if (document.hidden || Date.now() - lastUse > IDLE) { running = false; return; } // idle or hidden: no requests until someone is back
    running = true;
    const [eco, calls, burns] = await Promise.all([loadEco(), loadCalls(), loadBurns()]);
    paint(eco, calls, burns);
    timer = setTimeout(tick, ECO_TTL + Math.random() * 3e3);
  }

  function paint(eco, calls, burns) {
    const markets = (eco?.m || []).filter((m) => m.live);
    if (first) {
      first = false;
      // The resting list: every QHooks launch that traded today, busiest first, then the burn total.
      const rest = markets.filter((m) => m.tr > 0).sort((a, b) => (b.v || 0) - (a.v || 0))
        .map((m) => ({ symbol: m.s, img: m.i, side: (m.ch || 0) >= 0 ? 'buy' : 'sell', change: m.ch, label: m.v != null ? fmt.usd(m.v) + ' 24h' : null, href: market(m) }));
      const burned = burns?.total ? tokens(burns.total) : null;
      if (burned) rest.push({ symbol: 'QHOOKS', side: 'burn', label: fmt.tok(burned) + ' burned', href: '/qhooks-token' });
      if (rest.length) rib.set(rest);
      // News on arrival: the launch-week line while it runs, then the latest call and the latest burn (with their age).
      const lastBurn = burns?.r?.[0], lastCall = calls?.c?.[0];
      import('/qx-drop-banner.mjs').then(({ bannerText }) => bannerText?.(Date.now())).catch(() => null).then((b) => {
        if (b) rib.news({ kind: 'drop', label: 'Launch-week drop', text: b.text.replace(/^Launch-week drop: /, '').replace(/\.$/, ''), href: '/qhooks-token#qdr-h', hold: 4600 });
        if (lastCall) rib.news({ kind: 'call', label: 'Call', text: fmt.short(lastCall.w) + ' called $' + lastCall.s + (lastCall.at ? ' · ' + ago(lastCall.at / 1e3) + ' ago' : ''), w: lastCall.w, href: '/community#callers' });
        if (lastBurn?.at && Date.now() / 1e3 - lastBurn.at < 3600) rib.news({ kind: 'burn', label: 'Buyback', text: 'burned ' + tokAmt(tokens(lastBurn.wei)) + ' QHOOKS · ' + ago(lastBurn.at) + ' ago', href: '/qhooks-token' });
      });
    } else if (prev) {
      // New trades since the last read: the buy or sell count moved. Size only when exactly one trade happened.
      for (const m of markets) {
        const p = prev.get(m.c + m.k);
        if (!p) { if (m.at && Date.now() - m.at < 864e5) rib.news({ kind: 'launch', label: 'New launch', text: '$' + m.s + (m.n ? ' · ' + m.n : ''), img: m.i, href: market(m) }); continue; }
        const db = (m.b ?? 0) - (p.b ?? 0), ds = (m.se ?? 0) - (p.se ?? 0), one = (m.tr ?? 0) - (p.tr ?? 0) === 1, dv = (m.v ?? 0) - (p.v ?? 0);
        if (db > 0) rib.push({ symbol: m.s, img: m.i, side: 'buy', label: db > 1 ? db + ' buys' : 'Buy', usd: one && ds <= 0 && dv > 0 ? dv : null, href: market(m) });
        if (ds > 0) rib.push({ symbol: m.s, img: m.i, side: 'sell', label: ds > 1 ? ds + ' sells' : 'Sell', usd: one && db <= 0 && dv > 0 ? dv : null, href: market(m) });
      }
    }
    prev = new Map(markets.map((m) => [m.c + m.k, m]));
    // New calls and new burns since the last read.
    const callIds = new Set((calls?.c || []).map((c) => c.id)), burnTx = new Set((burns?.r || []).map((b) => b.tx));
    if (seenCalls) for (const c of calls?.c || []) if (!seenCalls.has(c.id)) rib.news({ kind: 'call', label: 'New call', text: fmt.short(c.w) + ' called $' + c.s, w: c.w, href: '/community#callers' });
    if (seenBurns) for (const b of burns?.r || []) if (!seenBurns.has(b.tx)) {
      rib.news({ kind: 'burn', label: 'Buyback', text: 'burned ' + tokAmt(tokens(b.wei)) + ' QHOOKS', href: '/qhooks-token' });
      rib.push({ symbol: 'QHOOKS', side: 'burn', label: 'Burned ' + tokAmt(tokens(b.wei)), href: '/qhooks-token' });
    }
    seenCalls = callIds; seenBurns = burnTx;
  }
  tick();
}
