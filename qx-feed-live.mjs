// D4 (2026-11-18): token lists that update while you watch.
// - createPollScheduler: re-reads the visible list every 10 s; 3 unchanged reads in a row back it off to 30 s; any change
//   returns it to 10 s. Nothing runs while the page is hidden or the list is not on screen; visible again resumes the clock.
// - flipMeasure / flipPlay: a re-ranked row slides from its old place to its new one (150 ms, transform only), so the
//   list never jumps; reduced motion skips the slide.
// - markArrived: a new token row gets a brief brass wash where it lands.
// Each row's own "Live · Ns ago" / "Refreshing" label is untouched: it keeps the row's own observation clock (D0).
export const LIVE_POLL = Object.freeze({fastMs: 10000, slowMs: 30000, unchangedLimit: 3});

export function createPollScheduler({poll, isActive = () => true, fastMs = LIVE_POLL.fastMs, slowMs = LIVE_POLL.slowMs, unchangedLimit = LIVE_POLL.unchangedLimit,
  document: doc = globalThis.document, setTimeout: later = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout, now = Date.now} = {}) {
  let timer = null, unchanged = 0, running = false, stopped = false, polls = 0, dueAt = null;
  const visible = () => !doc || doc.visibilityState !== 'hidden' && doc.hidden !== true;
  const delay = () => unchanged >= unchangedLimit ? slowMs : fastMs;
  function clear() { if (timer !== null) { cancel(timer); timer = null; } dueAt = null; }
  function schedule(ms = delay()) { clear(); if (stopped || !visible()) return; dueAt = now() + ms; timer = later(tick, ms); }
  async function tick() {
    timer = null; dueAt = null;
    if (stopped || !visible()) return;
    if (!isActive()) { schedule(fastMs); return; }
    if (running) return;
    running = true; let result = 'error';
    try { polls++; result = await poll(); } catch { result = 'error'; } finally { running = false; }
    if (result === 'changed') unchanged = 0;
    else if (result === 'unchanged' || result === 'error') unchanged++;
    // 'busy' (a full load is running) and 'skip' keep the counter.
    schedule();
  }
  const onVisibility = () => { if (visible()) schedule(delay()); else clear(); };
  doc?.addEventListener?.('visibilitychange', onVisibility);
  schedule(fastMs);
  return {
    // The view changed (tab, chain, window, filters) or a full load just landed: start again at 10 s.
    reset() { unchanged = 0; schedule(fastMs); },
    stop() { stopped = true; clear(); doc?.removeEventListener?.('visibilitychange', onVisibility); },
    get interval() { return delay(); },
    get unchanged() { return unchanged; },
    get polls() { return polls; },
    get scheduled() { return timer !== null; },
    get dueAt() { return dueAt; },
  };
}

// Everything a row shows, so a poll whose rows did not change counts as unchanged even if the bytes did.
export function rowsSignature(data) {
  if (!data || !Array.isArray(data.rows)) return '';
  return JSON.stringify([data.stale === true, data.refreshing === true, data.total ?? null, data.rows]);
}

const reduced = win => { try { return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export function flipMeasure(nodes) {
  const tops = new Map();
  for (const [key, node] of nodes) if (node.tr?.isConnected) tops.set(key, node.tr.getBoundingClientRect().top);
  return tops;
}
// Rows that moved slide from where they were; rows far off screen just land (no work for 100 rows nobody sees).
export function flipPlay(nodes, before, {duration = 150, window: win = globalThis, viewport = win?.innerHeight || 1000} = {}) {
  if (reduced(win)) return 0;
  let moved = 0;
  for (const [key, node] of nodes) {
    const tr = node.tr, was = before.get(key);
    if (was === undefined || !tr?.isConnected) continue;
    const top = tr.getBoundingClientRect().top, dy = was - top;
    if (Math.abs(dy) < 1 || (top > viewport + 200 && was > viewport + 200) || (top < -200 && was < -200)) continue;
    moved++;
    try {
      tr.getAnimations?.().forEach(a => { if (a.id === 'qxfd-move') a.cancel(); });
      const a = tr.animate?.([{transform: `translateY(${dy}px)`}, {transform: 'translateY(0)'}], {duration, easing: 'cubic-bezier(.2,.7,.2,1)'});
      if (a) a.id = 'qxfd-move';
    } catch {}
  }
  return moved;
}
export function markArrived(tr, {setTimeout: later = globalThis.setTimeout, ms = 1400} = {}) {
  if (!tr) return;
  tr.classList.remove('qxfd-arrived'); void tr.offsetWidth; tr.classList.add('qxfd-arrived');
  clearTimeout(tr.__qxArrive); tr.__qxArrive = later(() => tr.classList.remove('qxfd-arrived'), ms);
}
export function installLiveStyles(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('qxfd-live-style')) return;
  const style = doc.createElement('style'); style.id = 'qxfd-live-style';
  style.textContent = '@keyframes qxfd-arrive{from{background:color-mix(in srgb,var(--qx-brass,#b8945a) 26%,transparent)}to{background:transparent}}'
    + '.qxfd-table tbody tr.qxfd-arrived>td{animation:qxfd-arrive 1.4s ease-out}'
    + '.qxfd-table tbody tr.qxfd-arrived>td:first-child{box-shadow:inset 2px 0 var(--qx-brass,#b8945a)}'
    + '@media(prefers-reduced-motion:reduce){.qxfd-table tbody tr.qxfd-arrived>td{animation:none}}'
    // S1 "N new" pill: fixed, so showing it moves nothing.
    + '.qxfd-new-pill{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + var(--qa-nav-h,64px) + 10px);transform:translateX(-50%);z-index:40;min-height:32px;padding:6px 14px;border:1px solid var(--qx-brass,#b8945a);border-radius:4px;background:var(--qx-panel,#111);color:var(--qx-text,#f4f1e9);font:600 12px/1.2 inherit;letter-spacing:.02em;cursor:pointer}'
    + '.qxfd-new-pill[hidden]{display:none}@media(pointer:coarse){.qxfd-new-pill{min-height:40px}}';
  doc.head.append(style);
}

// S1 (2026-11-18, jitter): which rows a render shows, in which order.
// A user render (tab, sort, filters, reveal) shows `fresh` as is. A background render keeps the rows already on screen:
// while held, or within minGapMs of the last re-rank, they stay in their places (rows that left the list keep their last
// values); otherwise they take the fresh order. New keys never enter on a background render: they are counted in
// `waiting` for the "N new" pill. retryAt asks for one more background render when a held-back re-rank becomes due.
export function planRowOrder({fresh = [], domKeys = [], background = false, held = false, now = Date.now(), lastReorderAt = 0, minGapMs = 10000, known = () => null} = {}) {
  if (!background) return {rows: fresh, reordered: false, waiting: 0, retryAt: null};
  const onScreen = new Set(domKeys), byKey = new Map(fresh.map(vm => [vm.key, vm]));
  const waiting = fresh.filter(vm => !onScreen.has(vm.key)).length;
  const next = fresh.filter(vm => onScreen.has(vm.key)).map(vm => vm.key);
  const differs = next.length !== domKeys.length || next.some((k, i) => k !== domKeys[i]);
  if (!differs) return {rows: next.map(k => byKey.get(k)), reordered: false, waiting, retryAt: null};
  if (held || now - lastReorderAt < minGapMs) {
    const rows = domKeys.map(k => byKey.get(k) || known(k)).filter(Boolean);
    return {rows, reordered: false, waiting, retryAt: held ? now + minGapMs : lastReorderAt + minGapMs};
  }
  return {rows: next.map(k => byKey.get(k)), reordered: true, waiting, retryAt: null};
}
// Holds that end `afterMs` after their reason ends (pointer leaves, finger lifts, scrolling stops, focus leaves).
export function createHoldTimers({hold, afterMs = 3000, setTimeout: later = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout} = {}) {
  const timers = new Map();
  return {
    on(reason) { cancel(timers.get(reason)); timers.delete(reason); hold(reason, true); },
    off(reason) { cancel(timers.get(reason)); timers.set(reason, later(() => { timers.delete(reason); hold(reason, false); }, afterMs)); },
  };
}
