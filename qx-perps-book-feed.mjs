// /perps order book + trades feed (2026-11-18, ux-perpsws). Public Hyperliquid data only, no keys.
// Client-direct socket (wss://api.hyperliquid.xyz is already in the /perps connect-src, server/perps-csp.mjs).
// - l2Book is subscribed with fast:true: Hyperliquid's default l2Book stream is throttled to one push every ~6-12 s,
//   which is why the book looked frozen; fast pushes about twice a second but carries only the top 5 levels a side, so the
//   default (20-level) stream stays subscribed too and fills the rows below the live top 5 (mergeBooks) - only while that
//   snapshot's levels lie beyond the live top 5 (never a crossed book; a hole is refreshed at once). Because the default stream is ~12 s
//   old, the deep snapshot is also refreshed from the public info endpoint (l2Book, weight 2) when it is older than
//   DEEP_REFRESH_MS (or 1 s when gapped): at most 60 reads/min (measured ~30-45) per open, visible /perps tab, socket
//   mode only, no keys.
// - Only the open market is subscribed; switching markets unsubscribes the old one first.
// - Renders are coalesced: at most one every 250 ms, on an animation frame (<= 4/s).
// - Hidden tab: the market is unsubscribed (socket kept; WebKit logs a console error when a page closes an open socket)
//   and nothing renders; on return it resubscribes and the subscribe snapshot repaints. A close while hidden is not a drop.
// - Heartbeat {"method":"ping"} every 20 s (Hyperliquid drops sockets idle for 60 s); no message for 45 s = dead socket.
// - Reconnect with backoff (1, 2, 4 ... 30 s). Two unplanned drops/failures inside 30 s = fall back to polling the
//   public info endpoint until the socket proves itself again (a fresh book over the socket).
// - Status is "Live" only while socket data is under 30 s old; otherwise "Refreshing".
export const WS_URL = 'wss://api.hyperliquid.xyz/ws';
export const INFO_URL = 'https://api.hyperliquid.xyz/info';
export const DEEP_REFRESH_MS = 2000, DEEP_GAP_MS = 1000, MIN_RENDER_MS = 250, LIVE_MS = 30e3, PING_MS = 20e3, DEAD_MS = 45e3, DROP_WINDOW_MS = 30e3, POLL_MS = 4e3, RETRY_FROM_POLL_MS = 60e3;

export const subs = (coin) => [{ type: 'l2Book', coin, fast: true }, { type: 'l2Book', coin }, { type: 'trades', coin }];
export const FAST_LEVELS = 5;
// Live top levels from the fast stream; deeper levels from the latest full snapshot, only beyond the fast stream's last
// price and only on a side where that snapshot still reaches the live range (else the side is fast-only and gap=true).
export function mergeBooks(fast, deep) {
  if (!fast) return { book: deep, gap: false }; if (!deep) return { book: fast, gap: true };
  const [fb, fa] = fast.levels, [db, da] = deep.levels;
  const lastB = fb.length ? Number(fb[fb.length - 1].px) : Infinity, lastA = fa.length ? Number(fa[fa.length - 1].px) : -Infinity;
  // deeper levels never cross into the live range; a side whose snapshot no longer reaches it (gap) is flagged so the
  // snapshot is refreshed now rather than on the 2 s clock
  const okB = db.length > 0 && Number(db[0].px) >= lastB, okA = da.length > 0 && Number(da[0].px) <= lastA;
  return { book: { ...fast, levels: [[...fb, ...db.filter((l) => Number(l.px) < lastB)], [...fa, ...da.filter((l) => Number(l.px) > lastA)]] }, gap: !okB || !okA };
}

// One socket frame -> {kind:'book'|'trades'|'pong'|'sub'|'error', ...} for this coin, or null.
export function parseMessage(raw, coin) {
  let p; try { p = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!p || typeof p !== 'object') return null;
  if (p.channel === 'pong') return { kind: 'pong' };
  if (p.channel === 'subscriptionResponse') return { kind: 'sub' };
  if (p.channel === 'error') return { kind: 'error', message: String(p.data ?? '') };
  if (p.channel === 'l2Book') return bookFrom(p.data, coin);
  if (p.channel === 'trades' && Array.isArray(p.data)) { const list = p.data.filter((t) => t && t.coin === coin && t.px != null && t.sz != null); return list.length ? { kind: 'trades', list } : null; }
  return null;
}
export function bookFrom(d, coin) {
  if (!d || d.coin !== coin || !Array.isArray(d.levels) || d.levels.length < 2) return null;
  const ok = (l) => l && Number.isFinite(Number(l.px)) && Number.isFinite(Number(l.sz));
  const levels = [d.levels[0].filter(ok), d.levels[1].filter(ok)];
  // fast frames carry at most FAST_LEVELS a side; a deeper frame is the full (default-stream or polled) snapshot
  return { kind: 'book', coin, time: Number(d.time) || 0, levels, deep: levels[0].length > FAST_LEVELS || levels[1].length > FAST_LEVELS };
}

// At most one flush per minMs, always on an animation frame. schedule() may be called any number of times.
export function createCoalescer(flush, { minMs = MIN_RENDER_MS, now = () => performance.now(), raf = (f) => requestAnimationFrame(f), caf = (id) => cancelAnimationFrame(id), setT = setTimeout, clearT = clearTimeout } = {}) {
  let frame = 0, timer = 0, lastAt = -Infinity, paused = false, dirty = false;
  const run = () => { frame = 0; if (paused || !dirty) return; const t = now(); if (t - lastAt < minMs) return arm(); lastAt = t; dirty = false; flush(); };
  const arm = () => { if (frame || timer || paused) return; const wait = minMs - (now() - lastAt); if (wait > 0) timer = setT(() => { timer = 0; frame = raf(run); }, wait); else frame = raf(run); };
  return {
    schedule() { dirty = true; arm(); },
    pause() { paused = true; if (frame) caf(frame); if (timer) clearT(timer); frame = timer = 0; },
    resume() { paused = false; if (dirty) arm(); },
    get pending() { return dirty; },
  };
}

export function createBookFeed({ onRender, onStatus = () => {}, WebSocketImpl = globalThis.WebSocket, fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now(),
  setT = (...a) => setTimeout(...a), clearT = (id) => clearTimeout(id), setI = (...a) => setInterval(...a), clearI = (id) => clearInterval(id),
  raf, caf, perfNow, doc = globalThis.document, pollMs = POLL_MS, log = () => {} } = {}) {
  let coin = null, ws = null, socketEpoch = 0, activeEpoch = 0, lastSocketData = 0, lastMsg = 0, backoff = 1000, reconnectTimer = 0, retryTimer = 0, pollTimer = 0, heart = 0, statusTimer = 0;
  let lastDeepFetch = -Infinity, deepAt = 0, drops = [], mode = 'socket', disposed = false, status = '', book = null, fastBook = null, deepBook = null, trades = [], intentional = new WeakSet(), failedSockets = new WeakSet();
  const stats = { deepFetches: 0, renders: 0, socketBooks: 0, polls: 0, drops: 0, connects: 0, fallbacks: 0 };
  const hidden = () => !!doc?.hidden;
  const coalesce = createCoalescer(() => { stats.renders++; const t = trades; trades = []; onRender({ coin, book, trades: t, source: mode }); }, { now: perfNow, raf, caf, setT, clearT });
  const setStatus = () => { const s = mode === 'socket' && ws?.readyState === 1 && lastSocketData && now() - lastSocketData < LIVE_MS ? 'Live' : 'Refreshing'; if (s !== status) { status = s; onStatus(s); } };
  const sendSubs = (method, c) => { if (ws?.readyState !== 1 || !c) return; for (const s of subs(c)) ws.send(JSON.stringify({ method, subscription: s })); };
  const post = (body) => fetchImpl(INFO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8e3) }).then((r) => (r.ok ? r.json() : null));
  const takeBook = (b) => {
    if (b.deep) { deepBook = b; deepAt = now(); if (mode === 'poll') fastBook = null; } else fastBook = b;
    const m = mergeBooks(fastBook, deepBook); book = m.book; coalesce.schedule();
    if (mode === 'socket' && !hidden() && (m.gap ? now() - lastDeepFetch >= DEEP_GAP_MS : now() - lastDeepFetch >= DEEP_REFRESH_MS && now() - deepAt >= DEEP_REFRESH_MS)) refreshDeep();
  };
  function refreshDeep() {
    lastDeepFetch = now(); stats.deepFetches++; const c = coin;
    post({ type: 'l2Book', coin: c }).then((d) => { const b = bookFrom(d, c); if (b && c === coin && b.deep) { deepBook = b; deepAt = now(); book = mergeBooks(fastBook, deepBook).book; coalesce.schedule(); } }).catch(() => {});
  }
  const takeTrades = (list) => { trades.push(...list); if (trades.length > 200) trades = trades.slice(-200); coalesce.schedule(); };

  function closeSocket() { if (!ws) return; const s = ws; ws = null; activeEpoch = 0; intentional.add(s); try { s.close(); } catch {} }
  function socketDropped(s, epoch) {
    // A heartbeat close also produces a later close event. Count this physical
    // socket once; old connections and intentional shutdown cannot fail a new one.
    if (disposed || ws !== s || activeEpoch !== epoch || intentional.has(s) || failedSockets.has(s)) return;
    failedSockets.add(s); ws = null; activeEpoch = 0;
    if (!hidden()) dropped();
  }
  function dropped() {
    stats.drops++; const t = now(); drops = drops.filter((x) => t - x < DROP_WINDOW_MS); drops.push(t);
    setStatus();
    if (mode === 'socket' && drops.length >= 2) startPolling();
    if (mode === 'poll') { if (!retryTimer) retryTimer = setT(() => { retryTimer = 0; connect(); }, RETRY_FROM_POLL_MS); return; }
    if (!reconnectTimer) { const wait = backoff; backoff = Math.min(backoff * 2, 30e3); reconnectTimer = setT(() => { reconnectTimer = 0; connect(); }, wait); }
  }
  function connect() {
    if (disposed || ws || hidden() || !coin) return;
    const epoch = ++socketEpoch;
    let s; try { s = new WebSocketImpl(WS_URL); } catch { dropped(); return; }
    ws = s; activeEpoch = epoch; stats.connects++;
    s.onopen = () => { if (ws !== s) return; lastMsg = now(); if (!hidden()) sendSubs('subscribe', coin); };
    s.onmessage = (e) => {
      if (ws !== s) return; lastMsg = now(); if (hidden()) return;
      const m = parseMessage(e.data, coin); if (!m) return;
      if (m.kind === 'book') { lastSocketData = now(); stats.socketBooks++; backoff = 1000; if (mode === 'poll' && !m.deep) stopPolling(); takeBook(m); setStatus(); }
      else if (m.kind === 'trades') { lastSocketData = now(); takeTrades(m.list); setStatus(); }
    };
    s.onerror = () => { log('socket error'); };
    s.onclose = () => socketDropped(s, epoch);
  }
  async function pollOnce() {
    if (disposed || hidden() || !coin) return;
    const c = coin; stats.polls++;
    try {
      const [b, t] = await Promise.all([post({ type: 'l2Book', coin: c }), post({ type: 'recentTrades', coin: c })]);
      if (c !== coin || mode !== 'poll') return;
      const parsed = bookFrom(b, c); if (parsed) takeBook(parsed);
      if (Array.isArray(t)) takeTrades(t.filter((x) => x && x.coin === c));
    } catch { log('poll failed'); }
  }
  function startPolling() {
    if (mode === 'poll') return;
    mode = 'poll'; stats.fallbacks++; setStatus(); closeSocket();
    if (reconnectTimer) { clearT(reconnectTimer); reconnectTimer = 0; }
    pollOnce(); pollTimer = setI(pollOnce, pollMs);
    if (!retryTimer) retryTimer = setT(() => { retryTimer = 0; connect(); }, RETRY_FROM_POLL_MS);
  }
  function stopPolling() { mode = 'socket'; drops = []; if (pollTimer) clearI(pollTimer); pollTimer = 0; if (retryTimer) { clearT(retryTimer); retryTimer = 0; } }
  function tick() {
    if (ws?.readyState === 1) { if (now() - lastMsg > DEAD_MS) { const s = ws; socketDropped(s, activeEpoch); try { s.close(); } catch {} } else ws.send(JSON.stringify({ method: 'ping' })); }
  }
  function onVisibility() {
    if (hidden()) { coalesce.pause(); sendSubs('unsubscribe', coin); lastSocketData = 0; if (reconnectTimer) { clearT(reconnectTimer); reconnectTimer = 0; } setStatus(); return; }
    // back: start clean from a fresh snapshot (the subscribe snapshot, or a poll)
    coalesce.resume(); backoff = 1000; fastBook = deepBook = null;
    if (mode === 'poll') pollOnce();
    if (ws) sendSubs('subscribe', coin); else connect();
  }
  heart = setI(tick, PING_MS); statusTimer = setI(setStatus, 5e3);
  doc?.addEventListener?.('visibilitychange', onVisibility);
  return {
    setCoin(next) {
      if (!next || next === coin) return;
      if (coin) sendSubs('unsubscribe', coin);
      coin = next; book = fastBook = deepBook = null; trades = []; lastSocketData = 0; setStatus();
      if (mode === 'poll') pollOnce();
      if (ws) sendSubs('subscribe', coin); else connect();
    },
    get coin() { return coin; }, get mode() { return mode; }, get status() { return status; }, stats,
    _socket: () => ws, _onVisibility: onVisibility, _tick: tick,
    dispose() { disposed = true; closeSocket(); coalesce.pause(); for (const t of [reconnectTimer, retryTimer]) if (t) clearT(t); for (const i of [pollTimer, heart, statusTimer]) if (i) clearI(i); doc?.removeEventListener?.('visibilitychange', onVisibility); },
  };
}
