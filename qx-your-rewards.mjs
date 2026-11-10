// "Your rewards" on /me (catalyst 7b, 2026-11-08): cashback earned, referral earnings and staking payouts for the
// connected wallet, from /api/qhooks/rewards (on-chain events plus what is claimable now), and a share card with the
// wallet's referral link. Only amounts that already exist on chain: no estimates, rates or projections.
const NAMES = {'1': 'Ethereum', '8453': 'Base', '4663': 'Robinhood Chain'};

/// Wei string → short decimal text ("0", "0.0003", "642.84").
export function units(wei, decimals = 18) {
  let n; try { n = BigInt(wei || 0); } catch { n = 0n; }
  if (n === 0n) return '0';
  const s = n.toString().padStart(decimals + 1, '0'), whole = s.slice(0, -decimals) || '0', frac = s.slice(-decimals).replace(/0+$/, '');
  if (whole !== '0') return Number(whole) >= 1000 ? Number(whole).toLocaleString('en-US') : whole + (frac ? '.' + frac.slice(0, 2) : '');
  const lead = frac.match(/^0*/)[0].length;
  return lead >= 8 ? '< 0.00000001' : '0.' + frac.slice(0, lead + 2).replace(/0+$/, '');
}
/// The page model: one line per chain and currency with a non-zero amount; empty lists mean zero.
export function rewardsModel(d) {
  const cashback = [], referral = [];
  for (const c of d?.chains || []) for (const x of c.currencies || []) {
    const where = NAMES[c.chainId] || c.name;
    if (BigInt(x.cashbackEarnedWei || 0) > 0n) cashback.push(units(x.cashbackEarnedWei, x.decimals) + ' ' + x.symbol + ' · ' + where);
    if (BigInt(x.referralEarnedWei || 0) > 0n) referral.push(units(x.referralEarnedWei, x.decimals) + ' ' + x.symbol + ' · ' + where);
  }
  const s = d?.staking, pair = (t, q) => [BigInt(t || 0) > 0n && units(t) + ' ' + s.token, BigInt(q || 0) > 0n && units(q) + ' ' + s.quote].filter(Boolean).join(' + ');
  const paid = s ? pair(s.paidTokenWei, s.paidQuoteWei) : '', pending = s ? pair(s.pendingTokenWei, s.pendingQuoteWei) : '';
  const claimable = (d?.chains || []).some(c => (c.currencies || []).some(x => BigInt(x.claimableWei || 0) > 0n));
  const partial = (d?.partial || []).map(id => id === 'staking' ? 'staking' : NAMES[id] || id);
  return {cashback, referral, paid, pending, claimable, partial, link: d?.referralLink || ''};
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function tile(title, lines, zero, note) {
  const t = el('div', 'qyr-tile'); t.append(el('h4', null, title));
  if (!lines.length) t.append(el('p', 'qyr-amt', '0'));
  else { const ul = el('ul', 'qyr-lines'); for (const l of lines) ul.append(el('li', 'qyr-amt', l)); t.append(ul); }
  if (note) t.append(el('p', 'qyr-note', note)); else if (!lines.length) t.append(el('p', 'qyr-note', zero));
  return t;
}
function shareCard(link) {
  const card = el('div', 'qyr-share'), face = el('div', 'qyr-share-face');
  const logo = el('img'); logo.src = '/qhooks-logo.jpg'; logo.alt = ''; logo.width = 40; logo.height = 40;
  face.append(logo, el('p', 'qyr-share-k', 'Trade on QHooks with my link'), el('code', 'qyr-share-link', link.replace(/^https:\/\//, '')));
  const copy = el('button', 'qa-btn qa-btn-primary', 'Copy link'), share = el('button', 'qa-btn', 'Share'), say = el('p', 'qa-status');
  copy.type = share.type = 'button'; say.setAttribute('role', 'status');
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); say.textContent = 'Link copied.'; } catch { say.textContent = link; } });
  share.addEventListener('click', async () => {
    if (navigator.share) { try { await navigator.share({title: 'QHooks', text: 'Trade on QHooks with my link', url: link}); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(link); say.textContent = 'Link copied.'; } catch { say.textContent = link; }
  });
  const acts = el('div', 'qa-actions'); acts.append(copy, share);
  card.append(face, acts, say);
  return card;
}
export function renderRewards(root, d, now = Date.now()) {
  const m = rewardsModel(d); root.replaceChildren();
  const grid = el('div', 'qyr-grid');
  grid.append(
    tile('Cashback earned', m.cashback, 'Trade in the terminal to earn cashback.', m.claimable ? 'Claim balances in the cashback card below.' : ''),
    tile('Referral earnings', m.referral, 'Share your link. You earn when wallets you bring trade.'),
    tile('Staking payouts', m.paid ? [m.paid + ' paid'] : [], 'Stake QHOOKS to receive a share of its income.', m.pending ? 'Claimable now: ' + m.pending : ''));
  const live = el('p', 'qyr-live', 'Live · ' + Math.max(0, Math.round((now - (d?.observedAt || now)) / 1000)) + 's ago');
  root.append(grid);
  if (m.partial.length) root.append(el('p', 'qyr-note', 'Refreshing ' + m.partial.join(', ') + '.'));
  if (m.link) root.append(shareCard(m.link));
  root.append(live);
  return m;
}

let seq = 0;
async function load(root, me) {
  const mine = ++seq;
  if (!me) { root.replaceChildren(el('p', 'qyr-note', 'Connect your EVM wallet to see your rewards.')); return; }
  root.replaceChildren(el('p', 'qyr-note', 'Reading your rewards…'));
  for (let i = 0; i < 3; i++) {
    try {
      if (mine !== seq) return;
      const r = await fetch('/api/qhooks/rewards?wallet=' + me);
      if (r.ok) { const d = await r.json(); if (mine !== seq) return; renderRewards(root, d); if (d.partial?.length && i < 2) { await new Promise(x => setTimeout(x, 15000)); continue; } return; }
    } catch {}
    if (mine !== seq) return;
    if (!root.querySelector('.qyr-grid')) root.replaceChildren(el('p', 'qyr-note', 'Refreshing your rewards.'));
    await new Promise(x => setTimeout(x, 4000));
  }
}
export async function mountYourRewards(root) {
  const {connectedAddress, onWalletChange} = await import('/qx-chain.mjs');
  load(root, connectedAddress());
  onWalletChange(a => load(root, a));
}
if (typeof document !== 'undefined') { const root = document.getElementById('qyr-panel'); if (root) mountYourRewards(root); }
