const API = '/api/market/signals';
const EXPLANATION = "Advisory: QHooks reviews every module; holders' signals are shown to reviewers. Signing is free and sends nothing.";

export function formatSignalAmount(weight, decimals, symbol) {
 const value = Number(BigInt(weight)) / 10 ** decimals;
 return (value === 0 ? '0' : value.toLocaleString('en', {minimumSignificantDigits: 2, maximumSignificantDigits: 4})) + ' ' + symbol;
}
export function signalText({key, choice, round, nonce, expires}) {
 return ['QHooks module signal', `Module: ${key}`, `Choice: ${choice}`, 'Chain: 4663', `Round: ${round}`, `Nonce: ${nonce}`, `Expires: ${expires}`].join('\n');
}
const errorText = error => ({
 no_balance: 'This wallet holds none of the signal token',
 nonce_used: 'This signal was already used. Please sign again.',
 wrong_round: 'A new round has started. Reload this page.',
 expired: 'This signature has expired. Please sign again.',
 expiry_too_far: 'Check your device clock, then sign again.',
 unknown_module: 'This module is no longer available.',
 rate_limited: 'Too many attempts. Please try again in an hour.',
 chain_unavailable: 'The balance could not be read. Please try again.',
 signals_off: 'Holder signals are currently unavailable.'
}[error] || 'The signal could not be saved. Please try again.');

export async function startSignals({document = globalThis.document, fetchImpl = globalThis.fetch.bind(globalThis),
 loadWallet = () => import('/qx-account-wallet.mjs'), loadChain = () => import('/qx-chain.mjs'),
 Observer = globalThis.MutationObserver} = {}) {
 let config;
 try {
  const r = await fetchImpl(API + '/config', {cache: 'no-store'});
  if (!r.ok) return;
  config = await r.json();
 } catch { return; }
 if (config?.enabled !== true) return;
 const main = document.querySelector('main'); if (!main) return;
 let connection = document.getElementById('qt-connection');
 if (!connection) {
  connection = document.createElement('p'); connection.id = 'qt-connection'; connection.className = 'sr-only';
  connection.setAttribute('aria-live', 'polite'); main.prepend(connection);
 }
 let chain;
 try { await loadWallet(); chain = await loadChain(); } catch { return; }
 const {connectedAddress, signMessage} = chain;
 const blocks = new Map(); let queued = false, sequence = 0, stopped = false;
 const observers = [];
 const node = (tag, className, text) => {
  const n = document.createElement(tag); if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
 };
 const schedule = () => {
  if (queued || stopped) return; queued = true;
  queueMicrotask(() => { queued = false; if (!stopped) void refresh(); });
 };
 function paint(state, totals, mine) {
  state.yes.textContent = 'Yes · ' + formatSignalAmount(totals.yes, config.decimals, config.symbol);
  state.no.textContent = 'No · ' + formatSignalAmount(totals.no, config.decimals, config.symbol);
  state.count.textContent = totals.signers + (totals.signers === 1 ? ' signer' : ' signers');
  const sum = BigInt(totals.yes) + BigInt(totals.no);
  const percent = sum ? Number(BigInt(totals.yes) * 10000n / sum) / 100 : 0;
  state.barYes.style.width = percent + '%'; state.barNo.style.width = (sum ? 100 - percent : 0) + '%';
  state.bar.setAttribute('aria-label', sum ? `Yes ${percent}%, no ${100 - percent}% of signalled balance` : 'No signals yet');
  state.mine.textContent = mine ? 'Your signal: ' + mine : connectedAddress() ? 'You have not signalled this round.' : 'Connect your wallet to signal.';
  for (const b of state.buttons) b.setAttribute('aria-pressed', String(b.dataset.choice === mine));
 }
 async function refresh() {
  const run = ++sequence, signer = connectedAddress(), states = [...blocks.values()];
  for (let i = 0; i < states.length; i += 50) {
   const batch = states.slice(i, i + 50), keys = [...new Set(batch.map(s => s.key))];
   try {
    const query = new URLSearchParams({keys: keys.join(',')}); if (signer) query.set('signer', signer);
    const r = await fetchImpl(API + '?' + query, {cache: 'no-store'}), body = await r.json();
    if (!r.ok) throw new Error(body.error);
    if (stopped || run !== sequence || signer !== connectedAddress()) return;
    for (const s of batch) {
     if (blocks.get(s.host) !== s) continue;
     paint(s, body.totals[s.key], body.mine?.[s.key]);
     if (s.status.textContent === 'Loading signals…' || s.refreshFailed) s.status.textContent = '';
     s.refreshFailed = false;
    }
   } catch {
    if (stopped || run !== sequence) return;
    for (const s of batch) if (!s.busy) { s.status.textContent = 'Signals could not load. Please try again.'; s.refreshFailed = true; }
   }
  }
 }
 async function submit(state, choice) {
  if (state.busy) return;
  if (!connectedAddress()) { document.getElementById('qhc-trigger')?.click(); state.status.textContent = 'Connect a wallet to signal.'; return; }
  state.busy = true; state.buttons.forEach(b => { b.disabled = true; });
  let signing = true;
  try {
   const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
   const expires = new Date(Date.now() + 86400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
   const message = signalText({key: state.key, choice, round: config.round, nonce, expires});
   state.status.textContent = 'Confirm the free signature in your wallet…';
   const signature = await signMessage(message); signing = false;
   state.status.textContent = 'Saving signal…';
   const r = await fetchImpl(API, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message, signature})});
   const result = await r.json();
   if (!r.ok) { state.status.textContent = errorText(result.error); return; }
   state.status.textContent = 'Signal saved.'; await refresh();
  } catch (e) {
   const cancelled = e?.code === 4001 || e?.code === 'ACTION_REJECTED' || /reject|denied|cancel/i.test(e?.message || '');
   state.status.textContent = signing ? (cancelled ? 'Signing was cancelled' : 'Could not sign. Please try again.') : 'The signal could not be saved. Please try again.';
  } finally { state.busy = false; state.buttons.forEach(b => { b.disabled = false; }); }
 }
 function attach(host, key) {
  const previous = blocks.get(host);
  if (previous?.key === key && previous.root.parentNode === host) return false;
  previous?.root.remove();
  const root = node('section', 'mk-signal'); root.setAttribute('aria-label', 'Holder signal');
  const heading = node(host.tagName === 'ARTICLE' ? 'h4' : 'h3', 'mk-signal-title', 'Holder signal');
  const mode = node('p', 'mk-signal-mode', config.mode === 'snapshot' ? 'Snapshot at block ' + config.snapshotBlock : 'Balance when signed');
  const values = node('div', 'mk-signal-values'), yes = node('span', '', 'Yes · —'), no = node('span', '', 'No · —'); values.append(yes, no);
  const bar = node('div', 'mk-signal-bar'), barYes = node('span', 'mk-signal-yes'), barNo = node('span', 'mk-signal-no');
  bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', 'Loading signal shares'); bar.append(barYes, barNo);
  const count = node('p', 'mk-signal-count', 'Loading signer count…'), mine = node('p', 'mk-signal-mine');
  const actions = node('div', 'mk-signal-actions');
  const status = node('p', 'mk-signal-status', 'Loading signals…'); status.setAttribute('role', 'status');
  const state = {host, key, root, yes, no, bar, barYes, barNo, count, mine, status, buttons: [], busy: false};
  for (const choice of ['yes', 'no']) {
   const button = node('button', 'mk-signal-button', 'Signal ' + choice); button.type = 'button'; button.dataset.choice = choice;
   button.setAttribute('aria-pressed', 'false'); button.addEventListener('click', () => void submit(state, choice));
   state.buttons.push(button); actions.append(button);
  }
  root.append(heading, mode, values, bar, count, mine, actions, status, node('p', 'mk-signal-note', EXPLANATION));
  blocks.set(host, state); host.append(root); return true;
 }
 const observe = (target, callback, options) => {
  const observer = new Observer(callback); observer.observe(target, options); observers.push(observer);
 };
 const grid = document.getElementById('mk-modules');
 if (grid) {
  try {
   const r = await fetchImpl('/market/modules.json', {cache: 'no-store'}); if (!r.ok) throw new Error();
   const list = await r.json(), ids = new Map(list.modules.map(m => [m.slug, m.id]));
   const scan = () => {
    let changed = false;
    for (const [host, state] of blocks) if (!grid.contains(host)) { blocks.delete(host); state.root.remove(); changed = true; }
    for (const card of grid.querySelectorAll('article.mk-card[id^="module-"]')) {
     const id = ids.get(card.id.slice(7)); if (id !== undefined) changed = attach(card, 'm:' + id) || changed;
    }
    if (changed) schedule();
   };
   observe(grid, scan, {childList: true}); scan();
  } catch { /* The module list can be retried by reloading the page. */ }
 }
 const receipt = document.getElementById('mk-receipt');
 if (receipt) {
  const scan = () => {
   const row = [...receipt.querySelectorAll('dl.mk-facts div')].find(n => n.querySelector('dt')?.textContent === 'Receipt');
   const id = row?.querySelector('dd')?.textContent;
   if (receipt.hidden || !/^[0-9a-f]{24}$/.test(id || '')) {
    const state = blocks.get(receipt); if (state) { blocks.delete(receipt); state.root.remove(); } return;
   }
   if (attach(receipt, 's:' + id)) schedule();
  };
  observe(receipt, scan, {childList: true, attributes: true, attributeFilter: ['hidden']}); scan();
 }
 observe(connection, () => {
  for (const state of blocks.values()) {
   state.mine.textContent = ''; state.buttons.forEach(b => b.setAttribute('aria-pressed', 'false'));
  }
  schedule();
 }, {childList: true, characterData: true, subtree: true});
 return {refresh, stop() { stopped = true; sequence++; observers.forEach(o => o.disconnect()); }};
}

if (typeof document !== 'undefined') void startSignals();
