// Public profile for any wallet (/profile.html#0x<wallet>): the launches it created on QHooks (with the modules they pay
// and where to trade them), what it holds of QHooks launches, its badges and its recent community-board posts. Read-only: /api/account/<w>/launches (the Markets directory, the same source My QHooks
// uses) plus public RPC reads of each launch's blocks contract; holdings from the terminal index (/api/terminal/wallet/<w>);
// posts and post badges from the boards (/api/community/wallet/<w>). Nothing here connects or signs.
// Verified X handles and copy warnings come from the trust layer (/qx-trust.mjs, /api/trust/*). Until that is live the
// import fails and the profile simply shows no badges.
import { chainMap } from '/chains.mjs';
import { ethCall, words, toAddress, erc20, CHAIN_NAME, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { stakeVaultAddress } from '/full-launch/packages/multichain-launch/stake-vault.mjs';
import { modulesAmong, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';
import { priceText, moveText, qualityText, callLabelPills, boardPath, boardIcon } from '/qx-board-rows.mjs';

const $ = id => document.getElementById(id);
// Board pieces (badges, post lines) share the boards' stylesheet.
if (!document.querySelector('link[href="/qx-board.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/qx-board.css' }));
const ZERO = '0x' + '0'.repeat(40);
const CONFIG = '0x79502c55', PHASE_SEL = '0xb1c9fe6e';
const PHASE = ['Not started', 'Launch pool', 'Graduated', 'Closed'];
const EXPLORER = chainMap(c => c.explorer);
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
        L.live ? h('a', { class: 'qa-btn', href: '/board.html#m=' + L.chainId + ':' + L.controller }, 'Board') : null,
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
  $('qp-title').replaceChildren('Profiles on ', h('span', { class: 'qx-serif' }, 'QHooks.'));
  $('qp-addr').hidden = true; $('qp-explorers').hidden = true; $('qp-verified').replaceChildren(); $('qp-avatar').removeAttribute('style'); $('qp-avatar').classList.remove('is-set');
  $('qp-tiles').replaceChildren();
  $('qp-root').replaceChildren(h('div', { class: 'qa-pick' }, h('h2', {}, message || 'Whose launches?'),
    h('p', {}, 'Paste any wallet above to see the launches it created, what it holds and what it posted on QHooks boards.')));
  document.title = 'Profiles | QHooks';
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
  document.title = short(who) + ' | Profile | QHooks';
  $('qp-root').replaceChildren(h('p', { class: 'qa-loading' }, 'Reading this wallet’s launches…'));
  const get = u => fetch(u, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  const [acct, , held, social, caller] = await Promise.all([get('/api/account/' + who + '/launches'), loadModules().catch(() => null), get('/api/terminal/wallet/' + who), get('/api/community/wallet/' + who), get('/api/community/caller/' + who)]);
  if (mine !== seq) return;
  if (!acct) { $('qp-root').replaceChildren(h('p', { class: 'qa-empty' }, 'The launch directory did not answer. Try again in a moment.')); return; }
  const launches = acct.launches || [];
  const chains = [...new Set(launches.map(L => L.chainId))];
  const ex = (chains.length ? chains : ['8453']).filter(c => EXPLORER[c]);
  $('qp-explorers').replaceChildren('Wallet on ', ...ex.flatMap((c, i) => [i ? ' · ' : '', h('a', { href: EXPLORER[c] + '/address/' + who, target: '_blank', rel: 'noopener noreferrer' }, (CHAIN_NAME[c] || c) + ' ↗')]));
  $('qp-explorers').hidden = false;
  const first = launches.reduce((m, L) => Math.min(m, L.listedAt || Infinity), Infinity);
  const holdings = (held?.positions || []).filter(p => p.balance > 0).sort((a, b) => b.balance * b.price - a.balance * a.price);
  const posts = social?.posts || [];
  $('qp-tiles').replaceChildren(tile('Launches', String(launches.length), launches.length ? launches.filter(L => L.live).length + ' listed now' : 'created by this wallet'),
    tile('Holding', String(holdings.length), holdings.length === 1 ? 'QHooks launch' : 'QHooks launches'),
    tile('Board posts', String(posts.length >= 20 ? '20+' : posts.length), social?.boards ? 'on ' + social.boards + ' board' + (social.boards === 1 ? '' : 's') : 'none yet'),
    tile('First launch', launches.length ? day(first) : '—'));
  const extra = [badgeSection(launches, social), callsSection(caller, social?.callStats), holdingsSection(holdings), postsSection(posts)].filter(Boolean);
  if (!launches.length) {
    $('qp-root').replaceChildren(...extra, h('section', { class: 'qa-section' }, h('div', { class: 'qa-section-head' }, h('h2', {}, 'Launches')),
      h('p', { class: 'qa-empty' }, 'No launches from this wallet. Launches show up here once they are listed on QHooks Markets; only the wallet that created a launch counts as its creator.')));
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
  $('qp-root').replaceChildren(...extra, h('section', { class: 'qa-section', 'aria-labelledby': 'qp-launches-h' },
    h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-launches-h' }, 'Launches'), h('p', {}, 'Newest first. Each launch’s rules are fixed at launch and readable on chain; the terminal shows them before you trade.')),
    ...cards));
}

// ---- Holdings, badges and board posts (any wallet) ----
const sym = s => '$' + String(s || '?').replace(/^\$/, '');
const amount = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : n >= 1 ? n.toFixed(2).replace(/\.?0+$/, '') : n.toPrecision(3);
function badgeSection(launches, social) {
  const b = social?.badges || {}, pill = (cls, text, href, title) => h('a', { class: 'qb-badge ' + cls, href, title }, text);
  const key = boardPath;
  const pills = [
    ...launches.filter(L => L.live).map(L => pill('is-creator', 'Creator of ' + sym(L.symbol), '/terminal.html#m=' + L.chainId + ':' + L.controller, 'Created this launch')),
    ...(b.early || []).map(x => pill('is-early', 'Early buyer of ' + sym(x.symbol), key(x), 'Among the first 25 buyers, as stamped on a board post')),
    ...(b.staker || []).map(x => pill('is-staker', 'Staker of ' + sym(x.symbol), key(x), 'Had tokens staked when posting')),
    ...(b.holder || []).map(x => pill('is-holder', 'Holder of ' + sym(x.symbol), key(x), 'Held the token when posting'))];
  if (!pills.length) return null;
  return h('section', { class: 'qa-section', 'aria-labelledby': 'qp-badges-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-badges-h' }, 'Badges'),
    h('p', {}, 'Read from the chain: launches this wallet created, and what it held when it posted on a board.')), h('div', { class: 'qb-badgeset' }, ...pills));
}
function holdingsSection(rows) {
  if (!rows.length) return null;
  return h('section', { class: 'qa-section', 'aria-labelledby': 'qp-hold-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-hold-h' }, 'Holdings'),
    h('p', {}, 'QHooks launches this wallet holds, from the terminal’s index of each launch. Other tokens aren’t listed.')),
    h('div', { class: 'qa-table' }, h('div', { class: 'qa-tr qa-th' }, h('span', {}, 'Token'), h('span', {}, 'Chain'), h('span', {}, 'Balance'), h('span', {}, 'Value'), h('span', {}, '')),
      ...rows.map(p => h('div', { class: 'qa-tr' }, h('span', {}, h('a', { href: '/terminal.html#m=' + p.chainId + ':' + p.controller }, sym(p.symbol))), h('span', {}, CHAIN_NAME[p.chainId] || p.chainId),
        h('span', {}, amount(p.balance)), h('span', {}, p.price ? '≈ ' + amount(p.balance * p.price) + ' ' + (p.quoteSymbol || '') : '—'),
        h('span', {}, h('a', { href: '/board.html#m=' + p.chainId + ':' + p.controller }, 'Board'))))));
}
function callsSection(caller, fallbackStats) {
  const stats = caller?.stats || fallbackStats, calls = caller?.calls || [];
  const line = stats ? numCalls(stats.calls) + (stats.calls === 1 ? ' call · ' : ' calls · ') + numCalls(stats.counted) + ' counted · ' + (stats.hitRate == null ? '—' : Math.round(stats.hitRate * 100) + '%') + ' hit · median move ' + qualityText(stats.quality) : 'The call record didn’t answer. Try again in a moment.';
  return h('section', { class: 'qa-section', 'aria-labelledby': 'qp-calls-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-calls-h' }, 'Calls'), h('p', { class: 'qb-call-stats' }, line)),
    ...(calls.length ? calls.map(p => {
      const c = p.call || {}, b = p.board || {}, labels = callLabelPills({ ...c, boardKind: b.kind }), change = moveText(c.price24h, c.price), direction = c.price24h == null ? '' : Number(c.price24h) > Number(c.price) ? ' is-up' : Number(c.price24h) < Number(c.price) ? ' is-down' : '';
      return h('article', { class: 'qb-callline' }, h('div', { class: 'qb-postline-head' }, h('a', { class: 'qb-board-name', href: boardPath(b) }, b.kind === 'token' ? boardIcon(b) : null, sym(b.symbol)),
        h('time', { datetime: new Date(c.at || p.createdAt).toISOString() }, day(c.at || p.createdAt))),
        h('div', { class: 'qb-callline-prices' }, h('span', {}, priceText(c.price) + ' → ' + priceText(c.priceNow) + ' ' + (c.quoteSymbol || '')), h('span', { class: 'qb-call-result' + direction }, '24 h ' + change)),
        labels.length ? h('div', { class: 'qb-call-labels' }, ...labels) : null,
        p.text ? h('p', { class: 'qb-call-thesis' }, p.text) : null);
    }) : [h('p', { class: 'qa-empty' }, caller ? 'No calls from this wallet yet.' : 'Calls couldn’t be read just now.')]));
}
const numCalls = n => Number(n || 0).toLocaleString();
function postsSection(posts) {
  if (!posts.length) return null;
  const when = ms => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return h('section', { class: 'qa-section', 'aria-labelledby': 'qp-posts-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-posts-h' }, 'Recent posts'), h('p', {}, 'On QHooks community boards, newest first.')),
    ...posts.slice(0, 8).map(p => h('a', { class: 'qb-postline', href: boardPath(p.board) },
      h('span', { class: 'qb-postline-head' }, p.board.kind === 'token' ? boardIcon(p.board) : null, h('b', {}, sym(p.board.symbol)), p.kind === 'call' ? 'Call' : p.kind === 'announcement' ? 'Announcement' : p.replyTo ? 'Reply' : 'Post', ' · ', when(p.createdAt)),
      h('p', {}, p.text || ''))));
}

$('qp-find').addEventListener('submit', e => { e.preventDefault(); const v = $('qp-input').value.trim(); if (ADDR.test(v)) location.hash = v.toLowerCase(); else $('qp-hint').textContent = 'Enter a full wallet address: 0x and 40 hex characters.'; });
const copy = (text, btn, done) => navigator.clipboard?.writeText(text).then(() => { const t = btn.textContent; btn.textContent = done; setTimeout(() => btn.textContent = t, 1400); });
$('qp-copy').addEventListener('click', e => copy($('qp-full').textContent, e.currentTarget, 'Copied'));
$('qp-share').addEventListener('click', e => copy(location.origin + '/profile.html#' + $('qp-full').textContent, e.currentTarget, 'Link copied'));
addEventListener('hashchange', load);
load();
