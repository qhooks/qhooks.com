// Watch-only portfolio addresses (2026-11-18): public EVM or Solana addresses the owner pastes in so a wallet they
// never connect (a GMGN-managed Solana wallet, a cold wallet) counts in their portfolio total. Read-only by design:
// no signing, no trade controls, private to the owner. Pure helpers only (no DOM, no network) so the server and
// node --test share one validator and one merge.
export const WATCH_LIMIT = 20, WATCH_LABEL_MAX = 24, WATCH_STORE_PREFIX = 'qhooks:portfolio:watch:v1:';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', B58_MAP = new Map([...B58].map((c, i) => [c, i]));
const LABEL_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;
const known = n => typeof n === 'number' && Number.isFinite(n);
const sumKnown = xs => { const v = xs.filter(known); return v.length ? v.reduce((a, b) => a + b, 0) : null; };

// Base58 (Bitcoin alphabet) to bytes; null on any character outside the alphabet.
export function base58Bytes(text) {
 const s = String(text ?? ''); if (!s) return null;
 const bytes = [0];
 for (const ch of s) {
  const v = B58_MAP.get(ch); if (v === undefined) return null;
  let carry = v;
  for (let i = 0; i < bytes.length; i++) { carry += bytes[i] * 58; bytes[i] = carry & 255; carry >>= 8; }
  while (carry) { bytes.push(carry & 255); carry >>= 8; }
 }
 let zeros = 0; while (zeros < s.length && s[zeros] === '1') zeros++;
 const out = bytes.reverse(); while (out.length > 1 && out[0] === 0) out.shift();
 const body = out.length === 1 && out[0] === 0 ? [] : out;
 return Uint8Array.from([...new Array(zeros).fill(0), ...body]);
}
// EVM: 0x + 40 hex, checksum-insensitive, stored lowercase. Solana: base58, 32-44 chars, decodes to exactly 32 bytes.
export function watchAddress(input) {
 if (typeof input !== 'string') return null;
 const s = input.trim();
 if (/^0x[0-9a-f]{40}$/i.test(s)) return {family: 'evm', address: s.toLowerCase()};
 const sol = s.replace(/^solana:/, '');
 if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(sol) && base58Bytes(sol)?.length === 32) return {family: 'solana', address: sol};
 return null;
}
// A short private label ("GMGN"); control and bidi-override characters never render.
export function watchLabel(text) {
 const clean = String(text ?? '').replace(new RegExp(LABEL_CONTROLS.source, 'g'), '').replace(/\s+/g, ' ').trim();
 return [...clean].slice(0, WATCH_LABEL_MAX).join('');
}
export const validWatchLabel = text => text == null || typeof text === 'string' && !LABEL_CONTROLS.test(text) && [...text.trim()].length <= WATCH_LABEL_MAX;
export const watchKey = e => e.family + ':' + e.address;
export const shortAddress = a => String(a).length > 14 ? String(a).slice(0, 6) + '…' + String(a).slice(-4) : String(a);
export const watchName = e => e.label || shortAddress(e.address);
export function watchEntry(value, now = Date.now()) {
 const id = watchAddress(value?.address); if (!id) return null;
 return {...id, label: watchLabel(value?.label), createdAt: known(value?.createdAt) ? value.createdAt : now};
}
// Owner identities compare as family:address. A watched address equal to a connected one is ignored.
export function ownerKeys(owners) {
 return new Set((owners || []).map(o => watchAddress(o)).filter(Boolean).map(watchKey));
}
export function normalizeWatchList(list, {owners = [], now = Date.now()} = {}) {
 const own = ownerKeys(owners), seen = new Set(), out = [];
 for (const raw of Array.isArray(list) ? list : []) {
  const e = watchEntry(raw, now); if (!e) continue;
  const k = watchKey(e); if (seen.has(k) || own.has(k)) continue;
  seen.add(k); out.push(e); if (out.length >= WATCH_LIMIT) break;
 }
 return out;
}
export function addWatch(list, value, {owners = [], now = Date.now()} = {}) {
 const id = watchAddress(value?.address);
 if (!id) return {list, error: 'invalid_address'};
 if (!validWatchLabel(value?.label)) return {list, error: 'invalid_label'};
 if (ownerKeys(owners).has(watchKey(id))) return {list, error: 'own_wallet'};
 if (list.some(e => watchKey(e) === watchKey(id))) return {list, error: 'duplicate'};
 if (list.length >= WATCH_LIMIT) return {list, error: 'limit'};
 return {list: [...list, {...id, label: watchLabel(value.label), createdAt: now}], key: watchKey(id)};
}
export const removeWatch = (list, key) => list.filter(e => watchKey(e) !== key);
export const renameWatch = (list, key, label) => list.map(e => watchKey(e) === key ? {...e, label: watchLabel(label)} : e);
export const WATCH_ERRORS = {invalid_address: 'Paste a public 0x… or Solana address.', invalid_label: 'Use up to 24 characters without control characters.', own_wallet: 'That is your connected wallet.', duplicate: 'Already watched.', limit: 'Up to ' + WATCH_LIMIT + ' watched addresses.'};

// ---------- storage: localStorage per owner (and a guest key), the account copy is authoritative once synced ----------
export const watchStoreKey = owner => WATCH_STORE_PREFIX + (owner || 'guest');
export function readLocalWatch(storage, owner) {
 try {
  const v = JSON.parse(storage?.getItem(watchStoreKey(owner)) || 'null');
  if (v && v.v === 1 && Array.isArray(v.list)) return {v: 1, list: normalizeWatchList(v.list, {owners: owner ? [owner] : []}), dirty: !!v.dirty, removed: Array.isArray(v.removed) ? v.removed.filter(k => typeof k === 'string').slice(0, 100) : []};
 } catch {}
 return {v: 1, list: [], dirty: false, removed: []};
}
export function writeLocalWatch(storage, owner, record) {
 try { if (!storage?.setItem) return false; return storage.setItem(watchStoreKey(owner), JSON.stringify({v: 1, list: record.list, dirty: !!record.dirty, removed: record.removed || []})) !== false; } catch { return false; }
}
// Addresses added before connecting move onto the owner's list once (guest key cleared).
export function adoptGuestWatch(storage, owner) {
 const own = readLocalWatch(storage, owner); if (!owner) return own;
 const guest = readLocalWatch(storage, null); if (!guest.list.length) return own;
 const list = normalizeWatchList([...own.list, ...guest.list], {owners: [owner]}), next = {...own, list, dirty: own.dirty || list.length !== own.list.length};
 if (writeLocalWatch(storage, owner, next)) {
  // An empty guest record also works when removeItem is unavailable.
  writeLocalWatch(storage, null, {list: []}); try { storage?.removeItem(watchStoreKey(null)); } catch {}
 }
 return next;
}
// Server list vs local record. Clean local: the account copy wins. Dirty local (edits made while unsynced): union,
// minus the addresses removed locally, local labels winning; push when that differs from the account copy.
export function reconcileWatch(server, local, {owner} = {}) {
 const remote = normalizeWatchList(server, {owners: owner ? [owner] : []});
 if (!local?.dirty) return {list: remote, push: false};
 const removed = new Set(local.removed || []), mine = new Map(local.list.map(e => [watchKey(e), e]));
 const merged = normalizeWatchList([...local.list, ...remote.filter(e => !removed.has(watchKey(e)) && !mine.has(watchKey(e)))], {owners: owner ? [owner] : []});
 const same = merged.length === remote.length && merged.every((e, i) => watchKey(e) === watchKey(remote[i]) && e.label === remote[i].label);
 return {list: merged, push: !same};
}

// ---------- merge: the owner's merged portfolio plus each watched address's own report ----------
const CHAIN_NOTE = {balances_unavailable: 'Refreshing balances', prices_unavailable: 'Refreshing prices', prices_refreshing: 'Refreshing prices', index_unavailable: 'Refreshing QHooks positions', metadata_unavailable: 'Refreshing token details', token_limit: 'more tokens may be held', metadata_limit: 'some balances have unknown units'};
export function watchedNotes(entry, report, {error = false, chainName = c => c.name || c.chainId} = {}) {
 const who = 'Watch-only ' + watchName(entry);
 if (!report) return [who + ' · ' + (entry.family === 'solana' ? 'Solana' : 'EVM chains') + ': Refreshing balances'];
 const notes = [];
 for (const c of report.chains || []) {
  const name = chainName(c), code = c.error;
  if (code) notes.push(who + ' · ' + name + ': ' + (CHAIN_NOTE[code] || 'Refreshing data'));
  else if (c.balancesRefreshing) notes.push(who + ' · ' + name + ': Refreshing balances');
  else if (c.pricesRefreshing) notes.push(who + ' · ' + name + ': Refreshing prices');
 }
 if (error && !notes.length) notes.push(who + ': Refreshing');
 return notes;
}
// merge: the page's own mergePortfolios (one report → rows, totals, allocation). Own reports go through it unchanged;
// every watched report is merged on its own so its rows keep their address and its partial state stays its own.
// Result chains stay the owner's (per-chain notes, natives and follow-up reads are the owner's); watched chains
// carry their state in result.watch.entries.
export function mergeWithWatched(ownReports, watched, {merge, owners = [], chainName} = {}) {
 const base = merge(ownReports), own = ownerKeys([...owners, ...ownReports.map(r => r?.address)]), seen = new Set(), active = [];
 for (const w of watched || []) { const k = watchKey(w.entry); if (own.has(k) || seen.has(k)) continue; seen.add(k); active.push(w); }
 const ownValue = base.valueUsd, ownPartial = !!base.partial;
 if (!active.length) return {...base, watch: {count: 0, ownValueUsd: ownValue, ownPartial, valueUsd: null, entries: []}};
 const entries = [], rows = [...base.rows], parts = ownReports.length ? [base] : [];
 for (const w of active) {
  const key = watchKey(w.entry), report = w.report && Array.isArray(w.report.chains) ? w.report : null;
  const m = report ? merge([report]) : null;
  if (m) { parts.push(m); for (const r of m.rows) rows.push({...r, watch: {key, label: w.entry.label, address: w.entry.address, family: w.entry.family}}); }
  entries.push({key, label: w.entry.label, address: w.entry.address, family: w.entry.family, valueUsd: m?.valueUsd ?? null,
   partial: !m || !!m.partial || !!w.error, state: !m ? 'refreshing' : m.partial || w.error ? 'partial' : 'ready', notes: watchedNotes(w.entry, report, {error: !!w.error, chainName})});
 }
 rows.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1) || String(a.symbol || a.address).localeCompare(String(b.symbol || b.address)));
 const valueUsd = sumKnown(parts.map(p => p.valueUsd)), change24Usd = sumKnown(parts.map(p => p.change24Usd)), coveredUsd = sumKnown(parts.map(p => p.coveredUsd));
 const prior = known(coveredUsd) && known(change24Usd) ? coveredUsd - change24Usd : null;
 // One allocation slot per chain, however many addresses hold on it.
 const slots = new Map();
 for (const p of parts) for (const c of p.allocation || []) { const s = slots.get(c.chainId); if (!s) slots.set(c.chainId, {...c}); else s.valueUsd = sumKnown([s.valueUsd, c.valueUsd]); }
 const allocation = [...slots.values()].sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
 const clocks = parts.map(p => p.at), at = clocks.length && clocks.every(known) ? Math.min(...clocks) : null;
 return {...base, rows, valueUsd, change24Usd, coveredUsd, change24: prior > 0 ? change24Usd / prior : null, allocation,
  top: rows.filter(r => !r.spam && r.valueUsd > 0).slice(0, 5), at, partial: ownPartial || entries.some(e => e.partial),
  watch: {count: active.length, ownValueUsd: ownValue, ownPartial, valueUsd: sumKnown(entries.map(e => e.valueUsd)), entries}};
}
export const isWatchRow = row => !!row?.watch;

// ---------- store: local first, account copy when the owner's sign-in session is present ----------
// headers(): the owner's existing community/trader session header ({authorization}) or null. No session: the list
// lives in this browser only and syncs up the first time one is present. Never prompts for a signature itself.
export function createWatchStore({storage, fetchImpl = (...a) => globalThis.fetch(...a), headers = () => null, owners = () => [], now = Date.now} = {}) {
 // Keep this session's edits even if browser storage is absent, full or blocked.
 const memory = new Map(), local = {
  getItem(key) { if (memory.has(key)) return memory.get(key); try { return storage?.getItem(key) ?? null; } catch { return null; } },
  setItem(key, value) { memory.set(key, value); try { if (!storage?.setItem) return false; storage.setItem(key, value); return true; } catch { return false; } },
  removeItem(key) { memory.set(key, null); try { storage?.removeItem(key); } catch {} }
 };
 let owner = null, record = {v: 1, list: [], dirty: false, removed: []}, sync = 'local', flight = null, generation = 0, revision = 0, loaded = false, guestOwner = null;
 const identities = () => [owner, ...owners()].filter(Boolean);
 const listeners = new Set(), emit = () => { for (const fn of listeners) try { fn(snapshot()); } catch {} };
 const snapshot = () => ({owner, list: record.list.map(e => ({...e})), sync, dirty: record.dirty});
 const save = () => writeLocalWatch(local, owner, record);
 const finishGuest = () => {
  if (guestOwner !== owner) return;
  writeLocalWatch(storage, null, {list: []}); try { storage?.removeItem(watchStoreKey(null)); } catch {}
  guestOwner = null;
 };
 async function call(method, body) {
  const auth = headers(); if (!auth?.authorization) return null;
  const expectedOwner = owner;
  const r = await fetchImpl('/api/portfolio/watch', {method, cache: 'no-store', headers: {...auth, ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (r.status === 401) return null;
  const v = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(v?.addresses)) throw Error(v?.stage || v?.error || 'watch_unavailable');
  if (v.owner && watchAddress(v.owner)?.address !== expectedOwner) throw Error('watch_owner_changed');
  return v.addresses;
 }
 async function push(mine) {
  const edit = revision;
  const stored = await call('PUT', {addresses: record.list}); if (mine !== generation) return;
  if (stored === null) { sync = 'local'; return; }
  if (edit !== revision) return; // A later local edit still needs its own save.
  record = {...record, list: normalizeWatchList(stored, {owners: identities(), now: now()}), dirty: false, removed: []}; save(); finishGuest(); sync = 'account';
 }
 async function pull(mine) {
  try {
   do {
    const server = await call('GET'); if (mine !== generation) return;
    if (server === null) { sync = 'local'; return; }
    const {list, push: needs} = reconcileWatch(server, record, {owner});
    record = {...record, list}; save();
    if (needs) await push(mine); else { record = {...record, dirty: false, removed: []}; save(); finishGuest(); sync = 'account'; }
   } while (mine === generation && record.dirty && sync !== 'local');
  } catch { if (mine === generation) sync = 'error'; }
 }
 const syncNow = () => {
  if (!owner) return Promise.resolve(); if (flight) return flight;
  const mine = generation; sync = 'syncing';
  const task = Promise.resolve().then(() => { if (mine === generation) return pull(mine); }).finally(() => { if (flight === task) flight = null; emit(); });
  flight = task; emit(); return task;
 };
 function change(next, removedKey) {
  revision++;
  record = {...record, list: next, dirty: true, removed: removedKey ? [...new Set([...(record.removed || []), removedKey])] : record.removed}; save(); emit();
  if (owner && headers()?.authorization) return syncNow();
  return Promise.resolve();
 }
 return {
  snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  load(nextOwner) {
   const next = watchAddress(nextOwner)?.address || null;
   if (loaded && next === owner) return syncNow();
   loaded = true; generation++; flight = null; owner = next;
   const guest = owner && readLocalWatch(local, null);
   record = owner ? adoptGuestWatch(local, owner) : readLocalWatch(local, null);
   if (guest?.list.length) { guestOwner = owner; memory.set(watchStoreKey(null), null); }
   sync = 'local'; emit();
   return syncNow();
  },
  sync: syncNow,
  add(value) { const r = addWatch(record.list, value, {owners: identities(), now: now()}); if (r.error) return {error: r.error}; void change(r.list); return {key: r.key}; },
  remove(key) { void change(removeWatch(record.list, key), key); },
  rename(key, label) { if (!validWatchLabel(label)) return {error: 'invalid_label'}; void change(renameWatch(record.list, key, label)); return {}; },
  get flight() { return flight; }
 };
}
