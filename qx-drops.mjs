// "Claim drops" card (2026-11-08) on /me (under Your rewards) and the QHOOKS token page. Reads
// /api/drops/account?wallet=…; claims every claimable drop on a chain in one claimMany transaction. Shows only what
// the distributor already holds for the wallet, with a per-day history. Until a chain's distributor is live it says so
// and promises nothing.
import {claimManyData} from './qdrops-core.mjs';

const SOURCE = {launch: 'Launch-week drop', weekly: 'Weekly drop', holders: 'Holder drop', stakers: 'Staker drop', callouts: 'Callout reward', referrals: 'Referral top-up'};
const LAUNCH = 'Launch-week drop: 1,000,000 QHOOKS to holders and stakers. The list publishes after Nov 14, 00:00 UTC, and claims open 24 hours later.';
const NOT_LIVE = 'Drops start once the distributor is live. Until then unlocked tokens stay in the QHooks Safe.';

export function units(wei, decimals = 18) {
  let n; try { n = BigInt(wei || 0); } catch { n = 0n; }
  if (n <= 0n) return '0';
  const s = n.toString().padStart(decimals + 1, '0'), whole = s.slice(0, -decimals) || '0', frac = s.slice(-decimals).replace(/0+$/, '');
  if (whole !== '0') return (Number(whole) >= 1000 ? Number(whole).toLocaleString('en-US') : whole) + (Number(whole) < 1000 && frac ? '.' + frac.slice(0, 2) : '');
  const lead = frac.match(/^0*/)[0].length;
  return lead >= 8 ? '< 0.00000001' : '0.' + frac.slice(0, lead + 2).replace(/0+$/, '');
}
const dayText = d => { try { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'}); } catch { return d; } };

/// Page model from the account API.
export function dropsModel(d) {
  if (d?.status !== 'live') return {live: false, chains: [], anyClaimable: false};
  const chains = (d.chains || []).map(c => {
    const sym = t => c.tokens.find(x => x.address === t) || {symbol: '?', decimals: 18};
    const claimable = [], items = [];
    for (const k of c.claims || []) {
      if (k.claimed == null) continue; // couldn't read the chain: say nothing rather than guess
      const left = BigInt(k.cumulative) - BigInt(k.claimed);
      if (left <= 0n) continue;
      const t = sym(k.token);
      claimable.push({token: k.token, text: units(left, t.decimals) + ' ' + t.symbol});
      items.push({account: d.wallet, token: k.token, cumulative: k.cumulative, proof: k.proof});
    }
    const history = (c.history || []).map(h => { const t = sym(h.token); return {epoch: h.epoch, day: dayText(h.day), text: units(h.amount, t.decimals) + ' ' + t.symbol + ' · ' + (SOURCE[h.source] || h.source)}; });
    return {chainId: c.chainId, name: c.name, contract: c.contract, epoch: c.activeEpoch, claimable, items, history, next: c.nextEpoch ? dayText(c.nextEpoch.day) : null};
  });
  return {live: true, chains, anyClaimable: chains.some(c => c.claimable.length)};
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export function renderDrops(root, d, {now = Date.now(), wallet = null, onClaim = null} = {}) {
  const m = dropsModel(d); root.replaceChildren();
  if (!m.live) { root.append(el('p', 'qdr-note', NOT_LIVE)); return m; }
  // Until the first list is active: the launch-week drop line (Randall approved the 1M drop, 2026-11-09).
  const anyActive = (d.chains || []).some(c => (c.activeEpoch || 0) > 0 || (c.epochs || []).some(e => e.status === 'active'));
  if (!anyActive) root.append(el('p', 'qdr-launch', LAUNCH));
  if (!wallet) { root.append(el('p', 'qdr-note', 'Connect your EVM wallet to see your drops.')); return m; }
  const shown = m.chains.filter(c => c.claimable.length || c.history.length || c.next);
  if (!shown.length) root.append(el('p', 'qdr-note', 'No drops for this wallet yet. Hold or stake QHOOKS, or make calls people follow, to earn them.'));
  for (const c of shown) {
    const card = el('div', 'qdr-chain');
    card.append(el('h4', 'qdr-chain-h', c.name));
    if (c.claimable.length) {
      const list = el('ul', 'qdr-claim'); for (const x of c.claimable) list.append(el('li', null, x.text));
      const btn = el('button', 'qa-btn qa-btn-primary qdr-btn', 'Claim'), say = el('p', 'qa-status'); btn.type = 'button'; say.setAttribute('role', 'status');
      btn.addEventListener('click', async () => {
        if (!onClaim) return; btn.disabled = true;
        try { await onClaim(c, s => { say.textContent = s; }); say.textContent = 'Claimed.'; } catch (e) { say.textContent = e?.message || 'The claim did not go through.'; btn.disabled = false; }
      });
      const acts = el('div', 'qa-actions'); acts.append(btn);
      card.append(el('p', 'qdr-k', 'Claimable now'), list, acts, say);
    } else card.append(el('p', 'qdr-note', 'Nothing to claim right now.'));
    if (c.next) card.append(el('p', 'qdr-note', 'The ' + c.next + ' list is in its 24-hour safety hold.'));
    if (c.history.length) {
      const h = el('ul', 'qdr-hist'); for (const x of c.history.slice(0, 30)) { const li = el('li'); li.append(el('span', 'qdr-day', x.day), el('span', null, x.text)); h.append(li); }
      card.append(el('p', 'qdr-k', 'History'), h);
    }
    if (c.epoch) { const a = el('a', 'qdr-link', 'Check the public list'); a.href = '/api/drops/epoch/' + c.chainId + '/' + c.epoch + '.json'; a.rel = 'noopener'; card.append(a); }
    root.append(card);
  }
  root.append(el('p', 'qdr-live', 'Live · ' + Math.max(0, Math.round((now - (d.observedAt || now)) / 1000)) + 's ago'));
  return m;
}

function disconnectedDrops(root) {
  const connect = el('button', 'qa-btn', 'Connect wallet');
  connect.type = 'button'; connect.setAttribute('data-qa-connect', '');
  root.replaceChildren(el('p', 'qdr-note', 'Connect your EVM wallet to see your drops.'), connect);
}

export async function mountDrops(root, {chain = null} = {}) {
  const {connectedAddress, onWalletChange, send} = await import('/qx-chain.mjs');
  const onClaim = async (c, status) => { await send(c.chainId, {to: c.contract, data: claimManyData(c.items)}, status); await load(); };
  let last = null, lastWallet = null, revision = 0;
  async function load() {
    const me = connectedAddress(), mine = ++revision;
    if (!me) { last = null; lastWallet = null; disconnectedDrops(root); return; }
    if (lastWallet !== me) { last = null; lastWallet = me; }
    if (!last) root.replaceChildren(el('p', 'qdr-note', 'Reading your drops…'));
    try {
      const r = await fetch('/api/drops/account?wallet=' + me);
      if (!r.ok) throw Error(String(r.status));
      const d = await r.json();
      if (mine !== revision || connectedAddress() !== me) return;
      d.wallet = me; last = d;
      renderDrops(root, d, {wallet: me, onClaim});
    } catch {
      if (mine !== revision || connectedAddress() !== me) return;
      if (!last) {
        const retry = el('button', 'qa-btn', 'Retry drops'); retry.type = 'button';
        retry.addEventListener('click', () => load());
        root.replaceChildren(el('p', 'qdr-note', 'Your drops could not be read. Try again.'), retry);
      }
    }
  }
  onWalletChange?.(() => { last = null; void load(); });
  setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60000);
  await load();
}
if (typeof document !== 'undefined') { const root = document.getElementById('qdr-panel'); if (root) mountDrops(root); }
