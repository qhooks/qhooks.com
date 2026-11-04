// Public creator profile (/profile.html#0x<wallet>): the launches a wallet created on QHooks, the modules they pay,
// and where to trade them. Read-only: /api/account/<w>/launches (the Markets directory, the same source My QHooks
// uses) plus public RPC reads of each launch's blocks contract. Nothing here connects or signs.
// Verified X handles and copy warnings come from the trust layer (/qx-trust.mjs, /api/trust/*). Until that is live the
// import fails and the profile simply shows no badges.
import { ethCall, words, toAddress, erc20, CHAIN_NAME, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { stakeVaultAddress } from '/full-launch/packages/multichain-launch/stake-vault.mjs';
import { modulesAmong, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';

const $ = id => document.getElementById(id);
const ZERO = '0x' + '0'.repeat(40);
const CONFIG = '0x79502c55', PHASE_SEL = '0xb1c9fe6e';
const PHASE = ['Not started', 'Launch pool', 'Graduated', 'Closed'];
const EXPLORER = { '8453': 'https://basescan.org', '1': 'https://etherscan.io', '42161': 'https://arbiscan.io', '56': 'https://bscscan.com', '4663': 'https://robinhoodchain.blockscout.com' };
const ADDR = /^0x[0-9a-fA-F]{40}$/;
let seq = 0;

const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const day = s => { const d = new Date((s > 1e12 ? s : s * 1000)); return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
const tile = (k, v, sub) => h('div', { class: 'qa-tile' }, h('span', {}, k), h('b', {}, v), sub ? h('small', {}, sub) : null);

// A deterministic mark from the address: two brass/sage stops and an angle, no external service.
function paintAvatar(el, w) {
  const n = BigInt(w), hue = Number(n % 50n) + 25, hue2 = Number((n >> 8n) % 60n) + 90, ang = Number((n >> 16n) % 360n);
  el.style.background = `conic-gradient(from ${ang}deg, hsl(${hue} 48% 58%), hsl(${hue2} 22% 42%), hsl(${hue} 30% 22%), hsl(${hue} 48% 58%))`;
}

async function blocksOf(chainId, blocks) {
  const w = words(await ethCall(chainId, blocks, CONFIG));
  const at = k => BLOCK_FIELDS.findIndex(([n]) => n === k);
  const payees = w.slice(BLOCK_FIELDS.length, BLOCK_FIELDS.length + 8).map(toAddress);
  const n = payees.findIndex(p => p === ZERO);
  return { token: toAddress(w[at('token')]), quote: toAddress(w[at('quote')]), payees: n < 0 ? payees : payees.slice(0, n) };
}

async function launchCard(L, T) {
  const link = '/terminal.html#m=' + L.chainId + ':' + L.controller;
  const facts = h('dl', { class: 'qa-facts' }, h('div', {}, h('dt', {}, 'Reading'), h('dd', {}, 'on chain…')));
  const card = h('article', { class: 'qa-launch qp-launch' },
    h('div', { class: 'qa-launch-head' },
      h('div', {}, h('h3', {}, L.name + ' ', h('small', {}, L.symbol)),
        h('span', { class: 'qa-chain' }, CHAIN_NAME[L.chainId] || L.chainId), h('span', { class: 'qp-state' + (L.live ? '' : ' is-off') }, L.live ? 'Listed' : 'No longer listed'),
        h('span', { class: 'qp-date' }, 'Listed ' + day(L.listedAt)), ...(T ? [T.badge, T.copy].filter(Boolean) : [])),
      h('div', { class: 'qa-launch-links' }, h('a', { class: 'qa-btn qa-btn-primary', href: link }, 'Trade'),
        EXPLORER[L.chainId] ? h('a', { class: 'qa-btn', href: EXPLORER[L.chainId] + '/address/' + L.token, target: '_blank', rel: 'noopener noreferrer' }, 'Token ↗') : null)),
    facts);
  (async () => {
    const rows = [];
    const phase = await ethCall(L.chainId, L.controller, PHASE_SEL).then(BigInt).catch(() => null);
    rows.push(['Pool', phase == null ? '—' : PHASE[Number(phase)] || '—']);
    const blocks = L.pool?.constructor?.blocks;
    if (blocks && BigInt(blocks) !== 0n) {
      const b = await blocksOf(L.chainId, blocks);
      const [q] = await Promise.all([erc20(L.chainId, b.quote).catch(() => ({ symbol: '?' }))]);
      const mods = modulesAmong(b.payees, b.token, b.quote).map(m => m.module.name);
      if (b.payees.includes(stakeVaultAddress(b.token, b.quote))) mods.push('Holder staking');
      rows.push(['Paired with', q.symbol], ['Modules', mods.length ? mods.join(', ') : 'none'], ['Payees', String(b.payees.length)]);
    } else rows.push(['Modules', 'none']);
    if (L.summary) rows.push(['Holders', String(L.summary.holders ?? '—')]);
    facts.replaceChildren(...rows.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));
  })().catch(() => facts.replaceChildren(h('div', {}, h('dt', {}, 'On chain'), h('dd', {}, 'Could not read this launch right now.'))));
  return card;
}

function showLookup(message) {
  $('qp-title').replaceChildren('Creators on ', h('span', { class: 'qx-serif' }, 'QHooks.'));
  $('qp-addr').hidden = true; $('qp-explorers').hidden = true; $('qp-verified').replaceChildren(); $('qp-avatar').removeAttribute('style'); $('qp-avatar').classList.remove('is-set');
  $('qp-tiles').replaceChildren();
  $('qp-root').replaceChildren(h('div', { class: 'qa-pick' }, h('h2', {}, message || 'Whose launches?'),
    h('p', {}, 'Paste a creator’s wallet above to see every launch it created on QHooks.')));
  document.title = 'Creator profiles | QHooks';
}

async function load() {
  const w = decodeURIComponent(location.hash.slice(1)).trim(), mine = ++seq;
  if (!w) return showLookup();
  if (!ADDR.test(w)) return showLookup('That is not a wallet address.');
  const who = w.toLowerCase();
  $('qp-input').value = who;
  $('qp-title').replaceChildren(h('span', { class: 'qp-mono' }, short(who)));
  $('qp-full').textContent = who; $('qp-addr').hidden = false; $('qp-verified').replaceChildren();
  paintAvatar($('qp-avatar'), who); $('qp-avatar').classList.add('is-set');
  document.title = short(who) + ' | Creator profile | QHooks';
  $('qp-root').replaceChildren(h('p', { class: 'qa-loading' }, 'Reading this wallet’s launches…'));
  const [acct] = await Promise.all([fetch('/api/account/' + who + '/launches', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null), loadModules().catch(() => null)]);
  if (mine !== seq) return;
  if (!acct) { $('qp-root').replaceChildren(h('p', { class: 'qa-empty' }, 'The launch directory did not answer. Try again in a moment.')); return; }
  const launches = acct.launches || [];
  const chains = [...new Set(launches.map(L => L.chainId))];
  const ex = (chains.length ? chains : ['8453']).filter(c => EXPLORER[c]);
  $('qp-explorers').replaceChildren('Wallet on ', ...ex.flatMap((c, i) => [i ? ' · ' : '', h('a', { href: EXPLORER[c] + '/address/' + who, target: '_blank', rel: 'noopener noreferrer' }, (CHAIN_NAME[c] || c) + ' ↗')]));
  $('qp-explorers').hidden = false;
  const first = launches.reduce((m, L) => Math.min(m, L.listedAt || Infinity), Infinity);
  $('qp-tiles').replaceChildren(tile('Launches', String(launches.length), launches.filter(L => L.live).length + ' listed now'),
    tile('Chains', String(chains.length), chains.map(c => CHAIN_NAME[c] || c).join(', ') || '—'),
    tile('First launch', launches.length ? day(first) : '—'));
  if (!launches.length) {
    $('qp-root').replaceChildren(h('div', { class: 'qa-pick' }, h('h2', {}, 'No launches from this wallet yet.'),
      h('p', {}, 'Launches show up here once they are listed on QHooks Markets. Only the wallet that created a launch counts as its creator.'),
      h('a', { class: 'qa-btn qa-btn-primary', href: '/qtoken-studio.html' }, 'Launch a token')));
    return;
  }
  // Trust layer: verified X handles (per launch, signed by this wallet) and copy-of labels.
  const trust = await import('/qx-trust.mjs').catch(() => null), T = new Map();
  if (trust) try {
    const [tv, list] = await Promise.all([fetch('/api/trust/creator/' + who, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null), trust.trustList()]);
    const seen = new Set(), badges = [];
    for (const v of tv?.launches || []) {
      const k = v.chainId + ':' + String(v.controller).toLowerCase();
      T.set(k, { badge: trust.badge(v, { compact: true }) });
      if (v.handle && !seen.has(v.handle)) { seen.add(v.handle); const b = trust.badge(v); if (b) badges.push(b); }
    }
    for (const L of launches) { const k = L.chainId + ':' + L.controller.toLowerCase(), c = list?.[k]?.copyOf; if (c) T.set(k, { ...(T.get(k) || {}), copy: trust.copyLabel(c, { compact: true }) }); }
    if (mine === seq) $('qp-verified').replaceChildren(...badges);
  } catch { /* labels only */ }
  const cards = await Promise.all(launches.map(L => launchCard(L, T.get(L.chainId + ':' + L.controller.toLowerCase()))));
  if (mine !== seq) return;
  $('qp-root').replaceChildren(h('section', { class: 'qa-section', 'aria-labelledby': 'qp-launches-h' },
    h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-launches-h' }, 'Launches'), h('p', {}, 'Newest first. Each launch’s rules are fixed at launch and readable on chain; the terminal shows them before you trade.')),
    ...cards));
}

$('qp-find').addEventListener('submit', e => { e.preventDefault(); const v = $('qp-input').value.trim(); if (ADDR.test(v)) location.hash = v.toLowerCase(); else $('qp-hint').textContent = 'Enter a full wallet address: 0x and 40 hex characters.'; });
const copy = (text, btn, done) => navigator.clipboard?.writeText(text).then(() => { const t = btn.textContent; btn.textContent = done; setTimeout(() => btn.textContent = t, 1400); });
$('qp-copy').addEventListener('click', e => copy($('qp-full').textContent, e.currentTarget, 'Copied'));
$('qp-share').addEventListener('click', e => copy(location.origin + '/profile.html#' + $('qp-full').textContent, e.currentTarget, 'Link copied'));
addEventListener('hashchange', load);
load();
