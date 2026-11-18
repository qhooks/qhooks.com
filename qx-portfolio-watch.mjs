// Watch-only addresses on /portfolio (2026-11-18). The page keeps its own reads, merge and rows; this module adds:
//  - "Add address" inside the Wallets disclosure (paste a public 0x… or Solana address, optional label, max 20);
//  - one existing /api/portfolio/<family>/<address> read per watched address, only after the page itself reads the
//    connected wallet (same cadence and visibility gating), deduped by the shared reader and a 20 s floor per address;
//  - merged totals with "incl. N watched", read-only rows tagged "Watch-only · <label>", per-address partial notes;
//  - the header keeps the connected wallet's own total (watched value stays on this page).
// Storage and sync: qx-portfolio-watch-core.mjs createWatchStore (localStorage per owner, account copy via the
// owner's existing sign-in session, server/portfolio-watch.mjs).
import {createWatchStore, mergeWithWatched, watchKey, watchName, shortAddress, WATCH_ERRORS, WATCH_LIMIT, WATCH_LABEL_MAX} from './qx-portfolio-watch-core.mjs';
const GAP = 20000;
const defaultSession = () => import('/qx-board-session.mjs');
export function mountWatchOnly({h, reader, storage, document = globalThis.document, target = globalThis, fetchImpl = globalThis.fetch,
 owner, solOwner = () => null, active, renderRow, chainName, getChain = () => 'all', marketKey, onChange = () => {}, now = Date.now,
 loadSession = defaultSession, headers} = {}) {
 let session = null, sessionFlight = null, lastMerged = null, disposed = false, adding = false, renaming = null, message = '';
 const ensureSession = () => sessionFlight ??= Promise.resolve().then(loadSession).then(m => { session = m; render(); return m; }, () => null);
 const authHeaders = headers || (() => { try { const s = session?.boardSession?.(); return s && s.wallet === owner() ? session.authHeaders() : null; } catch { return null; } });
 const store = createWatchStore({storage, fetchImpl: (...a) => fetchImpl(...a), headers: authHeaders, owners: () => [solOwner()], now});
 const errors = new Map(), started = new Map();
 const panel = h('div', {class: 'pf-watch', role: 'group', 'aria-label': 'Watch-only addresses'});
 const list = () => active() ? store.snapshot().list : [];

 // ---------- reads ----------
 function refresh({only = null} = {}) {
  if (disposed || !active() || document?.visibilityState && document.visibilityState !== 'visible') return;
  for (const e of list()) {
   const key = watchKey(e); if (only && !only.includes(key)) continue;
   if (started.has(key) && now() - started.get(key) < GAP) continue;
   started.set(key, now());
   reader.read(e.family, e.address, {purpose: 'portfolio'}).then(() => { errors.delete(key); }, () => { errors.set(key, true); }).finally(() => { if (!disposed) onChange(); });
  }
 }
 // The page's own read of the connected wallet is the cadence: one watched read per address per page refresh.
 const stopReader = reader.subscribe(({family, owner: who}) => {
  if (disposed || !active()) return;
  const mine = family === 'evm' ? owner() : solOwner(); if (who && who === mine) refresh();
 });

 // ---------- merge (called by the page in place of its own merge) ----------
 function merge(reports, mergeOwn) {
  if (!active()) { lastMerged = null; return mergeOwn(reports); }
  const watched = list().map(entry => ({entry, report: reader.cached(entry.family, entry.address)?.report || null, error: errors.has(watchKey(entry))}));
  lastMerged = mergeWithWatched(reports, watched, {merge: mergeOwn, owners: [owner(), solOwner()].filter(Boolean), chainName});
  return lastMerged;
 }
 // The header shows the connected wallet's own total; this page's list total carries the watched addresses.
 const headerTotal = event => {
  const d = event?.detail, m = lastMerged;
  if (disposed || !d || d.watchOwnOnly || !m?.watch?.count || d.owner !== owner() || d.valueUsd !== m.valueUsd || !Number.isFinite(m.watch.ownValueUsd)) return;
  queueMicrotask(() => target.dispatchEvent?.(new CustomEvent('qhooks:portfolio-total', {detail: {...d, valueUsd: m.watch.ownValueUsd, partial: m.watch.ownPartial, watchOwnOnly: true}})));
 };
 target.addEventListener?.('qhooks:portfolio-total', headerTotal);

 // ---------- holdings rows ----------
 function rows(shown, renderOwn, {natives = {}} = {}) {
  const own = shown.filter(r => !r.watch), watched = shown.filter(r => r.watch);
  const nodes = own.length ? renderOwn(own) : [];
  paintIncl();
  if (!watched.length) return nodes;
  // Watched rows sit in value order among the owner's rows (the owner's renderer and grouping stay as they are).
  const v = r => typeof r?.valueUsd === 'number' && Number.isFinite(r.valueUsd) ? r.valueUsd : -1;
  const byKey = new Map(own.map(r => [marketKey(r.chainId, r.address), v(r)]));
  const nodeValue = n => n.dataset?.key ? byKey.get(n.dataset.key) ?? -1 : Math.max(-1, ...[...(n.querySelectorAll?.('[data-key]') || [])].map(c => byKey.get(c.dataset.key) ?? -1));
  const extra = watched.map(r => {
   const node = renderRow(r, {h, natives, readonly: true, mine: false, owner: null, chain: getChain()});
   node.dataset.key = 'w:' + r.watch.key + ':' + marketKey(r.chainId, r.address);
   node.classList?.add('is-watch');
   // No trade, sell or signing control on a watched row, whatever the renderer offers.
   for (const c of node.querySelectorAll?.('.pf-holding__actions button, .pf-holding__actions a, .pf-holding__sell, .pf-holding__trade') || []) c.remove();
   node.querySelector?.('.pf-holding__name')?.append(h('span', {class: 'pf6-tag pf-watch-tag', title: r.watch.address}, 'Watch-only · ' + watchName(r.watch)));
   return {node, value: v(r)};
  }).sort((a, b) => b.value - a.value);
  const out = [];
  for (const n of nodes) { const value = nodeValue(n); while (extra.length && extra[0].value > value) out.push(extra.shift().node); out.push(n); }
  return out.concat(extra.map(x => x.node));
 }
 // ---------- header line and per-address notes ----------
 function paintIncl(current = null) {
  const label = document?.getElementById('qp-value-label'); if (!label?.parentNode) return;
  let incl = document.getElementById('qp-watch-incl');
  if (!incl) { incl = h('span', {id: 'qp-watch-incl', class: 'pf-watch-incl', hidden: true}); label.after(incl); }
  const m = current || lastMerged, chain = getChain();
  const n = !m?.watch?.count ? 0 : chain === 'all' ? m.watch.count : new Set(m.rows.filter(r => r.watch && r.chainId === chain).map(r => r.watch.key)).size;
  incl.hidden = !n; incl.textContent = n ? 'incl. ' + n + ' watched' : '';
 }
 function paint(current) {
  paintIncl(current);
  const notes = (current?.watch?.entries || []).flatMap(e => e.notes), box = document?.getElementById('qp-notes');
  if (!notes.length || !box) return;
  box.append(...notes.map(t => h('p', {class: 'pf-watch-note'}, t)));
  const more = document.getElementById('qp-more'), sep = document.getElementById('qp-more-sep');
  if (more?.hidden) { more.hidden = false; more.textContent = 'Partial · details'; }
  if (sep) sep.hidden = false;
 }

 // ---------- Wallets disclosure: list, add, rename, remove ----------
 const button = (label, onclick, attrs = {}) => h('button', {type: 'button', class: 'qa-btn qa-btn--quiet', onclick, ...attrs}, label);
 function render() {
  if (disposed) return;
  if (!active()) { panel.hidden = true; panel.replaceChildren(); return; }
  panel.hidden = false;
  const s = store.snapshot(), signed = !!authHeaders()?.authorization;
  const where = s.sync === 'account' ? 'Saved to your account' : s.sync === 'syncing' ? 'Saving…' : s.sync === 'error' ? 'This browser · Refreshing account copy' : 'This browser only';
  const items = s.list.map(e => {
   const key = watchKey(e);
   if (renaming === key) {
    const input = h('input', {type: 'text', class: 'pf-watch__input', value: e.label, maxLength: WATCH_LABEL_MAX * 2, 'aria-label': 'Label for ' + shortAddress(e.address), placeholder: 'Label'});
    const save = () => { const r = store.rename(key, input.value); if (r.error) { message = WATCH_ERRORS[r.error]; render(); return; } renaming = null; render(); onChange(); };
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } if (ev.key === 'Escape') { renaming = null; render(); } });
    queueMicrotask(() => input.focus?.());
    return h('li', {class: 'pf-watch__item is-editing'}, input, button('Save', save), button('Cancel', () => { renaming = null; render(); }));
   }
   return h('li', {class: 'pf-watch__item', 'data-watch': key},
    h('span', {class: 'pf-watch__name'}, h('b', {}, e.label || (e.family === 'solana' ? 'Solana' : 'EVM')), h('span', {title: e.address}, shortAddress(e.address))),
    button('Rename', () => { renaming = key; render(); }, {'aria-label': 'Rename ' + watchName(e)}),
    button('Remove', () => { store.remove(key); errors.delete(key); started.delete(key); message = 'Removed ' + watchName(e) + '.'; render(); onChange(); }, {'aria-label': 'Remove ' + watchName(e)}));
  });
  const status = h('p', {class: 'pf-watch__msg', role: 'status', 'aria-live': 'polite'}, message);
  let form = null;
  if (adding) {
   const address = h('input', {type: 'text', class: 'pf-watch__input', name: 'address', autocomplete: 'off', spellcheck: false, autocapitalize: 'off', placeholder: '0x… or Solana address', 'aria-label': 'Public address', oninput: () => { message = ''; status.textContent = ''; }});
   const label = h('input', {type: 'text', class: 'pf-watch__input pf-watch__input--label', name: 'label', maxLength: WATCH_LABEL_MAX * 2, autocomplete: 'off', placeholder: 'Label (optional)', 'aria-label': 'Label'});
   form = h('form', {class: 'pf-watch__add', novalidate: true, onsubmit: ev => {
    ev.preventDefault();
    const r = store.add({address: address.value, label: label.value});
    if (r.error) { status.textContent = message = WATCH_ERRORS[r.error]; address.focus?.(); return; }
    adding = false; message = 'Watching ' + (label.value.trim() || shortAddress(address.value.trim())) + ' · read only.'; render(); onChange(); refresh({only: [r.key]});
   }}, address, label, h('div', {class: 'pf-watch__row'}, h('button', {type: 'submit', class: 'qa-btn qa-btn--primary'}, 'Save'), button('Cancel', () => { adding = false; message = ''; render(); })));
   queueMicrotask(() => address.focus?.());
  }
  const full = s.list.length >= WATCH_LIMIT;
  panel.replaceChildren(
   h('p', {class: 'pf-watch__h'}, h('b', {}, 'Watch-only'), h('span', {}, s.list.length + '/' + WATCH_LIMIT + ' · ' + where)),
   ...(items.length ? [h('ul', {class: 'pf-watch__list'}, ...items)] : [h('p', {class: 'pf-watch__empty'}, 'Add a wallet you never connect here. Its holdings count in your total, read only.')]),
   ...(form ? [form] : [button('Add address', () => { adding = true; message = ''; render(); }, {class: 'qa-btn pf-watch__open', disabled: full, 'data-watch-add': ''})]),
   ...(!signed && s.list.length && session?.signIn ? [button('Save to account', async ev => {
    const b = ev.currentTarget; b.disabled = true;
    try { await session.signIn(); await store.sync(); message = ''; } catch { message = 'Sign-in was cancelled. The list stays in this browser.'; }
    render();
   }, {class: 'qa-btn qa-btn--quiet pf-watch__sync', title: 'One free signature syncs this list across your devices'})] : []),
   status);
  const summary = panel.closest?.('details')?.querySelector?.('summary');
  if (summary) summary.textContent = s.list.length ? 'Wallets · ' + s.list.length + ' watched' : 'Wallets';
 }
 let listed = '';
 const stopStore = store.subscribe(s => { render(); const keys = s.list.map(watchKey).join(','); if (keys !== listed) { listed = keys; if (!disposed) onChange(); } });
 return {
  panel, merge, rows, paint, refresh, store,
  // The connected owner changed (or the page left view mode): load that owner's list and read it.
  ownerChanged() {
   errors.clear(); started.clear(); renaming = null; adding = false; message = '';
   if (!active()) { lastMerged = null; render(); return Promise.resolve(); }
   // The list shows from this browser at once; the account copy follows when the session module is ready.
   const task = store.load(owner()).then(() => ensureSession()).then(() => store.sync()).then(() => { if (!disposed) { render(); refresh(); } });
   render(); return task;
  },
  dispose() { disposed = true; stopReader(); stopStore(); target.removeEventListener?.('qhooks:portfolio-total', headerTotal); }
 };
}
