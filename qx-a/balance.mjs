// The connected wallet's balance in the header, on every page (Randall, 2026-11-12: "My balances take 20 seconds to
// load and need to show total available funds or available funds on selected chain w/symbol at all times at the top").
//  - Shows the balance on the wallet's selected chain with its symbol ("0.0412 ETH"); a tap switches to the total across
//    chains in dollars ("$3,289.87 all chains") and back. The choice is remembered.
//  - Instant: the last-known value for this wallet and chain paints from localStorage before anything loads.
//  - Fresh: ONE eth_getBalance on the selected chain's public RPC (about 0.3 s), on connect, chain switch, a confirmed
//    trade and when the tab comes back into view. No polling; no Alchemy.
//  - The total comes from the account menu's balance read (qx-balances.mjs, cached a minute), started in the background
//    once per connection and reused when it is already cached.
import { chainById } from '/chains.mjs';

const doc = document, PREF = 'qhooks:wallet-connection:v1', KEY = 'qa-bal:v1:', MODE = 'qa-bal-mode', MIN_GAP = 4000;
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const isAddr = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

export function fmtAmount(n) {
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
  if (a >= 0.0001) return Number(n.toPrecision(3)).toString();
  return '<0.0001';
}
export const fmtUsd = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: n >= 1000 ? 0 : 2, maximumFractionDigits: n >= 1000 ? 0 : 2 });

function remembered() {
  try { const p = JSON.parse(get(PREF) || 'null'); return p && isAddr(p.owner) && /^\d+$/.test(String(p.chainId)) ? { owner: p.owner.toLowerCase(), chainId: String(p.chainId) } : null; } catch { return null; }
}

export function mountBalance(end, before) {
  if (!end || end.querySelector('.qa-bal')) return null;
  const btn = doc.createElement('button');
  btn.type = 'button'; btn.className = 'qa-bal'; btn.hidden = true;
  const amt = doc.createElement('b'), sub = doc.createElement('span');
  btn.append(amt, sub);
  (before && before.parentNode === end ? before : end.lastElementChild)?.before(btn);
  // dollarfirst (2026-11-12): the dollar total across chains leads; a stored "chain" choice still wins
  let who = remembered(), mode = get(MODE) === 'chain' ? 'chain' : 'usd', last = 0, seq = 0, totalStarted = '';

  function paint() {
    if (!who) { btn.hidden = true; return; }
    const c = chainById(who.chainId), sym = c?.native || 'ETH';
    const chainVal = get(KEY + who.owner + ':' + who.chainId), usdVal = get(KEY + who.owner + ':usd');
    let main = '', note = '', label = '';
    if (mode === 'usd' && usdVal != null) { main = fmtUsd(Number(usdVal)); note = 'all chains'; label = 'Total on all chains ' + main + '. Tap for ' + (c?.short || 'this chain'); }
    else if (chainVal != null) { main = fmtAmount(Number(chainVal)) + ' ' + sym; note = c?.short || ''; label = 'Balance on ' + (c?.name || 'this chain') + ': ' + main + '. Tap for the total on all chains'; }
    else { main = '… ' + sym; note = c?.short || ''; label = 'Reading your balance on ' + (c?.name || 'this chain'); }
    amt.textContent = main; sub.textContent = note; btn.setAttribute('aria-label', label); btn.title = label;
    btn.dataset.mode = mode; btn.hidden = false;
  }

  async function readChain(force) {
    if (!who) return;
    const now = Date.now(); if (!force && now - last < MIN_GAP) return; last = now;
    const c = chainById(who.chainId), mine = ++seq, target = who;
    if (!c?.rpc) return;
    try {
      const r = await fetch(c.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(6000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [target.owner, 'latest'] }) });
      const j = await r.json(); if (typeof j?.result !== 'string') return;
      const v = Number(BigInt(j.result === '0x' ? 0 : j.result)) / 1e18;
      if (mine !== seq || who !== target) return;
      put(KEY + target.owner + ':' + target.chainId, String(v)); paint();
    } catch { /* keep the last-known value */ }
  }

  async function readTotal(force) {
    if (!who) return;
    const owner = who.owner; if (!force && totalStarted === owner) return; totalStarted = owner;
    try {
      const m = await import('/qx-balances.mjs');
      const cached = m.cachedBalances(owner);
      // only a finished reading: one still in progress has only the chains that answered so far
      if (cached.data && !cached.data.reading && Number.isFinite(cached.data.total)) { put(KEY + owner + ':usd', String(cached.data.total)); paint(); }
      if (cached.fresh && !force) return;
      const d = await m.refreshBalances(owner);
      if (d && Number.isFinite(d.total)) { put(KEY + owner + ':usd', String(d.total)); if (who?.owner === owner) paint(); }
      // a chain that didn't answer in time gets one more read, so the header settles on the full total (the wallet
      // menu does the same); no polling beyond this one retry
      const slow = (d?.rows || []).filter((r) => r.refreshing || r.error).map((r) => chainById(String(r.chainId))).filter(Boolean);
      if (slow.length) setTimeout(() => { if (who?.owner === owner) m.refreshBalances(owner, { chains: slow }).then((d2) => { if (d2 && Number.isFinite(d2.total)) { put(KEY + owner + ':usd', String(d2.total)); if (who?.owner === owner) paint(); } }, () => {}); }, 2500);
    } catch { /* the chain balance still shows */ }
  }

  function use(next, why) {
    const changed = !who || !next || who.owner !== next.owner || who.chainId !== next.chainId;
    who = next; paint();
    if (!who) return;
    if (changed || why === 'trade') readChain(true);
    const idle = globalThis.requestIdleCallback || ((f) => setTimeout(f, 1500));
    if (mode === 'usd') readTotal(why === 'trade'); else idle(() => readTotal(why === 'trade'));
  }

  btn.addEventListener('click', () => {
    mode = mode === 'usd' ? 'chain' : 'usd'; put(MODE, mode); paint();
    if (mode === 'usd' && who && get(KEY + who.owner + ':usd') == null) readTotal(true);
  });

  // instant: the remembered wallet and chain, from the last visit
  if (who) { paint(); readChain(true); if (mode === 'usd') readTotal(false); }
  // the live connection: connect, chain switch, disconnect
  import('/wallet-hub.mjs').then(({ getWalletHub }) => {
    getWalletHub(window).subscribe((s) => {
      const c = s.current;
      if (c && isAddr(c.owner)) use({ owner: c.owner.toLowerCase(), chainId: String(c.chainId) }, 'hub');
      else if (!s.busy && !remembered()) use(null, 'hub');
    });
  }).catch(() => {});
  addEventListener('qhooks:wallet-disconnected', () => use(null, 'off'));
  addEventListener('qhooks:chain-switch', (e) => { if (who && e.detail?.chainId) use({ owner: who.owner, chainId: String(e.detail.chainId) }, 'chain'); });
  doc.addEventListener('qhooks:traded', () => use(who, 'trade'));
  addEventListener('qhooks:traded', () => use(who, 'trade'));
  addEventListener('qhooks:wallet-moved', () => use(who, 'trade')); // walletpos: the terminal saw this wallet trade elsewhere
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') readChain(false); });
  addEventListener('storage', (e) => { if (e.key === PREF) use(remembered(), 'storage'); });
  return btn;
}
