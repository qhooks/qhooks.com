// Creator dashboard (/creator#m=<chain>:<controller>): one launch, everything a creator acts on. The header and
// tables come from the terminal's index (/api/terminal/market); the panels below are the launch page's own panels
// (rules and pots, terms and graduation, keys and recovery, staking, modules, vesting, team locks), opened by the
// same qhooks:pool event the terminal sends, so every button here is the code the launch page already runs.
import { ethCall, words, toAddress, formatUnits, erc20, send, connectedAddress, onWalletChange, CHAIN_NAME, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import '/qx-account-wallet.mjs';

const $ = id => document.getElementById(id);
const BLK = { config: '0x79502c55', release: '0x86d1a69f', creatorQuote: '0xe55e1ce9', creatorToken: '0x483a5f14' };
const ZERO = '0x' + '0'.repeat(40);
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const num = (n, d = 4) => Number(n || 0).toLocaleString(undefined, { maximumSignificantDigits: d });
function amount(n, d, min = 4) {
  n = BigInt(n); if (n === 0n) return '0';
  for (let x = min; x <= d; x++) if (formatUnits(n, d, x) !== '0') return formatUnits(n, d, Math.min(d, x + (x > min ? 2 : 0)));
  return formatUnits(n, d, d);
}
let state = null, seq = 0;

async function pick() {
  const me = connectedAddress(), box = $('qc-pick');
  $('qc-launch').hidden = true; box.hidden = false;
  if (!me) { box.replaceChildren(h('h2', {}, 'Your launch dashboard'), h('p', {}, 'Connect the wallet that created a launch to open its dashboard, or open one from My QHooks.'), h('button', { type: 'button', class: 'qx-btn qx-btn-primary', 'data-qa-connect': '' }, 'Connect wallet')); return; }
  const r = await fetch('/api/account/' + me + '/launches', { cache: 'no-store' }).then(x => x.ok ? x.json() : { launches: [] }).catch(() => ({ launches: [] }));
  const list = r.launches || [];
  box.replaceChildren(h('h2', {}, 'Pick a launch'), list.length
    ? h('div', { class: 'qc-picklist' }, ...list.map(L => h('a', { class: 'qc-pickrow', href: '#m=' + L.chainId + ':' + L.controller }, h('b', {}, L.name), h('span', {}, L.symbol + ' · ' + (CHAIN_NAME[L.chainId] || L.chainId)))))
    : h('p', {}, 'This wallet has not created a launch yet. ', h('a', { href: '/qtoken-studio' }, 'Launch a token'), '.'));
}

async function open(chainId, controller) {
  const mine = ++seq;
  $('qc-pick').hidden = true; $('qc-launch').hidden = false;
  $('qc-title').textContent = 'Loading…'; $('qc-stats').replaceChildren(); $('qc-tables').replaceChildren(); $('qc-pay').replaceChildren();
  const r = await fetch(`/api/markets/${chainId}/${controller}`, { cache: 'no-store' });
  if (mine !== seq) return;
  if (!r.ok) { $('qc-title').textContent = 'This launch is not listed'; $('qc-sub').textContent = 'List it from its Trade page, then open its dashboard again.'; return; }
  const pool = (await r.json()).pool;
  window.__qhooksPool = pool;
  document.dispatchEvent(new CustomEvent('qhooks:pool', { detail: pool }));
  state = { chainId, controller, pool };
  $('qc-trade').href = '/terminal#m=' + chainId + ':' + controller;
  await Promise.all([market(mine), payouts(mine)]);
}

async function market(mine) {
  const { chainId, controller } = state;
  const r = await fetch(`/api/terminal/market/${chainId}/${controller}?tf=60`, { cache: 'no-store' }).then(x => x.ok ? x.json() : null).catch(() => null);
  if (mine !== seq || !r) return;
  const m = r.meta, s = r.summary || {}, me = connectedAddress(), q = m.quoteSymbol;
  state.meta = m;
  $('qc-title').replaceChildren(m.name + ' ', h('span', { class: 'qc-sym' }, m.symbol));
  $('qc-sub').replaceChildren(h('span', { class: 'qa-chain' }, CHAIN_NAME[chainId] || chainId), ' Created by ', h('a', { href: '/profile#' + (m.owner || ''), title: 'Creator profile' }, h('code', {}, short(m.owner || ''))),
    me && m.owner === me ? h('span', { class: 'qc-you' }, 'you') : me ? h('span', { class: 'qc-not' }, 'not this wallet: actions that need the creator will ask for it') : null);
  const tile = (k, v, sub) => h('div', { class: 'qa-tile' }, h('span', {}, k), h('b', {}, v), sub ? h('small', {}, sub) : null);
  $('qc-stats').replaceChildren(tile('Price', num(s.price) + ' ' + q, s.change24 ? (s.change24 >= 0 ? '+' : '') + (s.change24 * 100).toFixed(1) + '% in 24h' : null),
    tile('Market cap', num(s.mcap) + ' ' + q), tile('24h volume', num(s.volume24) + ' ' + q, (s.buys24 || 0) + ' buys · ' + (s.sells24 || 0) + ' sells'),
    tile('Holders', String(s.holders ?? '—'), s.top10 ? 'top 10 hold ' + (s.top10 * 100).toFixed(1) + '%' : null), tile('Burned', num(s.burned) + ' ' + m.symbol), tile('Team locked', num(s.locked) + ' ' + m.symbol));
  const table = (title, head, rows) => h('section', { class: 'qc-table' }, h('h3', {}, title), rows.length ? h('div', { class: 'qa-table', role: 'table' },
    h('div', { class: 'qa-tr qa-th', role: 'row' }, ...head.map(t => h('span', { role: 'columnheader' }, t))), ...rows) : h('p', { class: 'qa-empty' }, 'No trades yet.'));
  const supply = Number(s.supply) || 0;
  $('qc-tables').replaceChildren(
    table('Top holders', ['Wallet', 'Holds', 'Share'], (r.holders || []).slice(0, 8).map(x => h('div', { class: 'qa-tr', role: 'row' }, h('span', { role: 'cell' }, h('code', {}, short(x.holder)), x.holder === m.owner ? ' (creator)' : ''), h('span', { role: 'cell' }, num(x.units)), h('span', { role: 'cell' }, supply ? (x.units / supply * 100).toFixed(2) + '%' : '—')))),
    table('Top traders', ['Wallet', 'Volume', 'Holds'], (r.traders || []).slice(0, 8).map(x => h('div', { class: 'qa-tr', role: 'row' }, h('span', { role: 'cell' }, h('code', {}, short(x.trader))), h('span', { role: 'cell' }, num(x.spent + x.received) + ' ' + q), h('span', { role: 'cell' }, num(x.balance))))));
}

async function payouts(mine) {
  const { chainId, pool } = state, blocks = pool.constructor.blocks;
  if (!blocks || BigInt(blocks) === 0n) { $('qc-pay').replaceChildren(h('p', { class: 'qa-muted' }, 'This launch has no launch blocks, so it has no revenue split. Its creator LP fees are claimed with both keys from Studio.')); return; }
  const w = words(await ethCall(chainId, blocks, BLK.config));
  const at = k => BLOCK_FIELDS.findIndex(([n]) => n === k);
  const [t, q] = await Promise.all([erc20(chainId, toAddress(w[at('token')])), erc20(chainId, toAddress(w[at('quote')]))]);
  const payees = w.slice(BLOCK_FIELDS.length, BLOCK_FIELDS.length + 8).map(toAddress), shares = w.slice(BLOCK_FIELDS.length + 8, BLOCK_FIELDS.length + 16);
  const [cq, ct] = (await Promise.all([ethCall(chainId, blocks, BLK.creatorQuote), ethCall(chainId, blocks, BLK.creatorToken)])).map(BigInt);
  if (mine !== seq) return;
  const both = (a, b) => [a && amount(a, q.decimals) + ' ' + q.symbol, b && amount(b, t.decimals, 2) + ' ' + t.symbol].filter(Boolean).join(' + ') || 'nothing yet';
  const status = h('p', { class: 'qa-status', role: 'status' });
  const btn = h('button', { type: 'button', class: 'qa-btn qa-btn-primary', disabled: !cq && !ct }, 'Pay out to every payee');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { await send(chainId, { to: blocks, data: BLK.release }, t => { status.textContent = t; }); status.textContent = 'Paid out.'; await payouts(seq); }
    catch (e) { status.textContent = e.message || 'That did not go through.'; btn.disabled = false; }
  });
  const me = connectedAddress();
  const split = payees.map((p, i) => [p, shares[i]]).filter(([p]) => p !== ZERO).map(([p, s]) => h('li', {}, h('b', {}, (Number(s) / 100) + '%'), ' ', h('code', {}, short(p)), p === me ? ' (you)' : ''));
  $('qc-pay').replaceChildren(h('div', { class: 'qc-pay-row' }, h('div', {}, h('span', {}, 'Waiting in the launch'), h('b', {}, both(cq, ct))), btn), status,
    h('details', { class: 'qc-split' }, h('summary', {}, 'Revenue split (' + split.length + ' payee' + (split.length === 1 ? '' : 's') + ')'), h('ul', {}, ...split),
      h('p', { class: 'qa-muted' }, 'Fixed at launch. Anyone can pay it out; each payee receives its share directly. Modules and vesting streams below show what they did with theirs.')));
}

function route() {
  const m = location.hash.match(/m=(\d+):(0x[0-9a-fA-F]{40})/);
  if (m) open(m[1], m[2].toLowerCase()).catch(() => { $('qc-title').textContent = 'Could not open this launch right now'; });
  else pick();
}
window.addEventListener('hashchange', route);
onWalletChange(() => { if (state && location.hash.includes('m=')) { market(seq); payouts(seq).catch(() => {}); } else if (!location.hash.includes('m=')) pick(); });
route();
