// Auto-copy (pro terminal E3/E4, 2026-11-10). Your own copy account (QCopyVault, made by the factory 0x6167…472d): only you
// can take money out, at any time. The QHooks keeper copies the wallets you pick, inside the limits you sign on chain,
// through QFeeRouter (1% fee, 30% cashback to you). Opens as /copy?w=<wallet>&chain=<id>, or on 'qhooks:copy-open' {wallet}.
import '/qx-confirm-top.mjs'; // Privy confirms stay on top of this page's sheets
import { connectedAddress, onWalletChange, send, calldata, parseUnits, formatUnits, erc20, ethCall, codeAt, CHAIN_NAME } from '/qx-chain.mjs';
import { authHeaders, signIn, boardSession } from '/qx-board-session.mjs';

export const FACTORY = '0x61674ec746b6d9a25e6d76fe60d33df2f1ee472d';
export const KEEPER = '0x9f57ea4801259f12ad68564615a7ddf5a1c820e5';
const ZERO = '0x' + '0'.repeat(40), KEEPER_BPS = 30;
/// The asset each chain's copy account trades from (the vault's base()): ETH, BNB and HYPE are kept wrapped; USDC as is.
export const BASES = {
  '4663': { token: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', symbol: 'ETH', decimals: 18, native: true, perTrade: '0.01', perDay: '0.04', fund: '0.05' },
  '56': { token: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', symbol: 'BNB', decimals: 18, native: true, perTrade: '0.01', perDay: '0.04', fund: '0.1' },
  '99901': { token: '0xba876237b0f021a6c6d852d6c26e107997cc5e81', symbol: 'HYPE', decimals: 18, native: true, perTrade: '0.5', perDay: '2', fund: '5' },
  '8453': { token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6, native: false, perTrade: '20', perDay: '80', fund: '200' },
  '42161': { token: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6, native: false, perTrade: '20', perDay: '80', fund: '200' }
};
const MANDATE_T = '(address,uint128,uint128,uint128,uint16,uint16,uint64,address,bool)';
const SEL = { create: '0x6388e65f', vaultOf: '0x0709df45', mandate: '0x39b1b96d', paused: '0x5c975abb', setPaused: '0x16c38b3c', approve: '0x095ea7b3' };
const ADDR = /^0x[0-9a-f]{40}$/;
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
  return n;
};
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const says = { sign_in: 'Sign in to save copy settings.', slow_down: 'Too many changes this hour. Try again shortly.', no_vault: 'Open your copy account first.', not_deployed: 'Auto-copy is not on this chain yet.',
  invalid_leader: 'That is not a wallet you can copy.', invalid_amount: 'Check the amounts: per day must be at least per trade.', too_many_leaders: 'You copy 50 wallets on this chain already. Remove one first.' };
const say = e => says[e?.message] || (e?.code === 4001 ? 'Cancelled in your wallet.' : e?.message || 'Something went wrong. Try again.');
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Error(j.error || 'request_failed'); return j;
}
const signedPost = async (path, body) => { if (!boardSession()) await signIn(); return post(path, body); };

/// Calldata the follower signs. Exported for tests.
export function mandateTuple({ perTrade, perDay, total, impactBps, days, qhooksOnly = false, now = Date.now() }) {
  return [KEEPER, perTrade, perDay, total, impactBps, KEEPER_BPS, Math.floor(now / 1000) + days * 86400, ZERO, qhooksOnly];
}
export const createData = (m, leaders) => calldata(SEL.create, [MANDATE_T, 'address[]'], [m, leaders]);
export const createWithTokenData = (m, leaders, token, amount) => calldata('0x8a30982a', [MANDATE_T, 'address[]', 'address', 'uint256'], [m, leaders, token, amount]);
export const configureData = (m, add, remove) => calldata('0x1dedb852', [MANDATE_T, 'address[]', 'address[]'], [m, add, remove]);
export const stopData = (tokens, to) => calldata('0x8ba97368', ['address[]', 'address'], [tokens, to]);
export const setPausedData = p => calldata(SEL.setPaused, ['bool'], [p]);
export const setLeaderData = (who, on) => calldata('0x73bf30ac', ['address', 'bool'], [who, on]);

let st = null, root = null, statusEl = null;
const status = t => { if (statusEl) statusEl.textContent = t; };

async function load(chainId) {
  const me = connectedAddress(), b = BASES[chainId];
  const s = { chainId, me, base: b, live: false, vault: null, mandate: null, paused: false, leaders: [], fills: [], holdings: [], baseBal: 0n, offPause: false };
  s.live = ((await codeAt(chainId, FACTORY).catch(() => '0x')) || '0x').length > 2;
  if (!me) return s;
  const api = await fetch('/api/copy?owner=' + me, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  s.leaders = (api?.leaders || []).filter(l => l.chainId === chainId);
  s.fills = (api?.fills || []).filter(f => f.chainId === chainId);
  s.offPause = !!api?.vaults?.find(v => v.chainId === chainId)?.paused;
  if (!s.live) return s;
  const v = '0x' + (await ethCall(chainId, FACTORY, SEL.vaultOf + me.slice(2).padStart(64, '0'))).slice(-40);
  if (((await codeAt(chainId, v)) || '0x').length <= 2) return s;
  s.vault = v;
  const [m, p] = await Promise.all([ethCall(chainId, v, SEL.mandate), ethCall(chainId, v, SEL.paused)]);
  const w = i => BigInt('0x' + m.slice(2 + 64 * i, 2 + 64 * (i + 1)));
  s.mandate = { perTrade: w(1), perDay: w(2), total: w(3), impactBps: Number(w(4)), expiry: Number(w(6)), qhooksOnly: w(8) === 1n };
  s.paused = BigInt(p) === 1n;
  s.baseBal = (await erc20(chainId, b.token, v)).balance + (b.native ? BigInt(await fetchBalance(chainId, v)) : 0n);
  const tokens = [...new Set(s.fills.map(f => f.token))];
  const read = (await Promise.all(tokens.map(t => erc20(chainId, t, v).then(x => ({ token: t, ...x })).catch(() => null)))).filter(Boolean);
  s.symbols = Object.fromEntries(read.map(x => [x.token, x.symbol]));
  s.holdings = read.filter(x => x.balance > 0n);
  // Register the vault here once it exists (idempotent; needs the free sign-in only the first time).
  if (!api?.vaults?.some(x => x.chainId === chainId && x.vault === v) && boardSession()) post('/api/copy/vault', { chainId }).catch(() => {});
  return s;
}
const fetchBalance = (chainId, a) => import('/qx-chain.mjs').then(m => m.rpc(chainId, 'eth_getBalance', [a, 'latest']));

function amountIn(label, value, hint) {
  const input = el('input', { class: 'qpo-in', inputmode: 'decimal', autocomplete: 'off', value });
  return [el('label', {}, label, input, hint ? el('small', { class: 'qpo-note' }, hint) : null), input];
}

function openForm(s, leader) {
  const b = s.base;
  const [fundL, fund] = amountIn('Put in (' + b.symbol + ')', b.fund, 'Moves from your wallet into your copy account. Take it out any time.');
  const [ptL, pt] = amountIn('Most per copied trade (' + b.symbol + ')', b.perTrade);
  const [pdL, pd] = amountIn('Most per day (' + b.symbol + ')', b.perDay);
  const [totL, tot] = amountIn('Most in total (' + b.symbol + ')', String(Number(b.fund) * 3), 'Counts every copied buy, including buys made with sale proceeds. Raise it any time.');
  const imp = el('select', { class: 'qpo-in' }, ...[[500, '5%'], [1000, '10%'], [1500, '15%'], [2500, '25%']].map(([v, t]) => el('option', { value: v, selected: v === 1500 }, t)));
  const days = el('select', { class: 'qpo-in' }, ...[[30, '30 days'], [90, '90 days'], [365, '1 year']].map(([v, t]) => el('option', { value: v, selected: v === 365 }, t)));
  const only = el('input', { type: 'checkbox' });
  const who = el('input', { class: 'qpo-in', value: leader || '', placeholder: '0x… wallet to copy', autocomplete: 'off', spellcheck: 'false' });
  const go = el('button', { type: 'button', class: 'qpo-btn qpo-primary' }, 'Open copy account');
  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      const w = who.value.trim().toLowerCase(); if (!ADDR.test(w) || w === s.me) throw Error('invalid_leader');
      const m = mandateTuple({ perTrade: parseUnits(pt.value, b.decimals), perDay: parseUnits(pd.value, b.decimals), total: parseUnits(tot.value, b.decimals), impactBps: Number(imp.value), days: Number(days.value), qhooksOnly: only.checked });
      if (m[1] === 0n || m[2] < m[1] || m[3] < m[2]) throw Error('invalid_amount');
      const amount = parseUnits(fund.value || '0', b.decimals);
      if (b.native) await send(s.chainId, { to: FACTORY, data: createData(m, [w]), value: amount }, status);
      else {
        // USDC chains: a one-time approval for exactly this amount, then the account is made and funded in one transaction.
        await send(s.chainId, { to: b.token, data: calldata(SEL.approve, ['address', 'uint256'], [FACTORY, amount]) }, status);
        await send(s.chainId, { to: FACTORY, data: createWithTokenData(m, [w], b.token, amount) }, status);
      }
      status('Copy account open. Saving your copy settings…');
      await signedPost('/api/copy/vault', { chainId: s.chainId });
      await signedPost('/api/copy/leader', { chainId: s.chainId, leader: w, perTrade: m[1].toString(), perDay: m[2].toString(), sells: 'mirror', maxMoveBps: 500 });
      status('Copying ' + short(w) + '. New trades by that wallet are copied within seconds.');
      await refresh();
    } catch (e) { status(say(e)); go.disabled = false; }
  });
  return el('section', { class: 'qpo-form', 'aria-label': 'Open your copy account' },
    el('h2', { class: 'qcp-h' }, 'Open your copy account'),
    el('p', { class: 'qpo-note' }, 'Your own account on ' + CHAIN_NAME[s.chainId] + '. Only you can take money out. The QHooks keeper can only make copy trades inside the limits below, and it can never move funds anywhere else.'),
    el('label', {}, 'Wallet to copy', who), fundL, ptL, pdL, totL,
    el('label', {}, 'Max price impact per trade', imp),
    el('label', {}, 'Copying stops on its own after', days),
    el('label', { class: 'qcp-check' }, only, ' QHooks launches only'),
    el('p', { class: 'qpo-note' }, 'Each copy pays the 1% QHooks fee (30% comes back to you as cashback) and a 0.3% keeper fee. Copies too small for that fee to cover the network fee are skipped. ' + (b.native ? 'One signature.' : 'Two signatures: approve, then open.')),
    go);
}

function leaderRow(s, l) {
  const b = s.base;
  const [ptL, pt] = amountIn('Per trade', formatUnits(BigInt(l.perTrade), b.decimals, 6));
  const [pdL, pd] = amountIn('Per day', formatUnits(BigInt(l.perDay), b.decimals, 6));
  const sells = el('select', { class: 'qpo-in' }, ...[['mirror', 'Copy their sells'], ['tpsl', 'Only my take-profit and stop'], ['off', 'Never sell for me']].map(([v, t]) => el('option', { value: v, selected: l.sells === v }, t)));
  const move = el('select', { class: 'qpo-in' }, ...[[300, '3%'], [500, '5%'], [1000, '10%'], [2000, '20%']].map(([v, t]) => el('option', { value: v, selected: l.maxMoveBps === v }, t)));
  const [tpL, tp] = amountIn('Take profit at + %', String(l.tpPct || ''), '0 or empty for none');
  const [slL, sl] = amountIn('Stop at − %', String(l.slPct || ''), '0 or empty for none');
  const on = el('input', { type: 'checkbox', checked: l.on });
  const save = el('button', { type: 'button', class: 'qpo-btn' }, 'Save');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await signedPost('/api/copy/leader', { chainId: s.chainId, leader: l.leader, perTrade: parseUnits(pt.value, b.decimals).toString(), perDay: parseUnits(pd.value, b.decimals).toString(), sells: sells.value, maxMoveBps: Number(move.value), tpPct: Math.round(Number(tp.value) || 0), slPct: Math.round(Number(sl.value) || 0), on: on.checked });
      status('Saved for ' + short(l.leader) + '.');
    } catch (e) { status(say(e)); }
    save.disabled = false;
  });
  const remove = el('button', { type: 'button', class: 'qpo-btn' }, 'Stop copying');
  remove.addEventListener('click', async () => {
    remove.disabled = true;
    try { await send(s.chainId, { to: s.vault, data: setLeaderData(l.leader, false) }, status); await signedPost('/api/copy/leader', { chainId: s.chainId, leader: l.leader, perTrade: l.perTrade, perDay: l.perDay, sells: l.sells, maxMoveBps: l.maxMoveBps, on: false }); status('No longer copying ' + short(l.leader) + '.'); await refresh(); }
    catch (e) { status(say(e)); remove.disabled = false; }
  });
  return el('li', { class: 'qcp-leader' },
    el('div', { class: 'qcp-who' }, el('a', { href: '/wallets?w=' + l.leader, class: 'qpo-link' }, short(l.leader)), el('label', { class: 'qcp-check' }, on, ' On')),
    el('div', { class: 'qcp-grid' }, ptL, pdL), el('label', {}, 'Sells', sells), el('label', {}, 'Skip a buy if the price has moved more than', move), el('div', { class: 'qcp-grid' }, tpL, slL),
    el('div', { class: 'qpo-acts' }, save, remove));
}

function accountView(s, leader) {
  const b = s.base, m = s.mandate, off = s.paused || s.offPause;
  const nodes = [];
  nodes.push(el('section', { class: 'qpo-form', 'aria-label': 'Your copy account' },
    el('div', { class: 'qcp-top' }, el('h2', { class: 'qcp-h' }, 'Your copy account'), el('span', { class: 'qcp-pill' + (off ? ' is-off' : '') }, off ? 'Paused' : 'Copying')),
    el('dl', { class: 'qcp-dl' },
      el('dt', {}, 'Account'), el('dd', {}, short(s.vault)),
      el('dt', {}, 'Ready to copy with'), el('dd', {}, formatUnits(s.baseBal, b.decimals, 6) + ' ' + b.symbol),
      el('dt', {}, 'Holding'), el('dd', {}, s.holdings.length ? s.holdings.map(h => formatUnits(h.balance, h.decimals, 4) + ' ' + h.symbol).join(', ') : 'Nothing yet'),
      el('dt', {}, 'Limits'), el('dd', {}, formatUnits(m.perTrade, b.decimals, 6) + ' per trade · ' + formatUnits(m.perDay, b.decimals, 6) + ' per day · ' + formatUnits(m.total, b.decimals, 6) + ' in total'),
      el('dt', {}, 'Ends'), el('dd', {}, new Date(m.expiry * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))),
    actions(s, off)));
  const add = el('input', { class: 'qpo-in', value: leader && !s.leaders.some(l => l.leader === leader && l.on) ? leader : '', placeholder: '0x… wallet to copy', autocomplete: 'off', spellcheck: 'false' });
  const addBtn = el('button', { type: 'button', class: 'qpo-btn qpo-primary' }, 'Copy this wallet');
  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    try {
      const w = add.value.trim().toLowerCase(); if (!ADDR.test(w) || w === s.me) throw Error('invalid_leader');
      await send(s.chainId, { to: s.vault, data: setLeaderData(w, true) }, status);
      await signedPost('/api/copy/leader', { chainId: s.chainId, leader: w, perTrade: m.perTrade.toString(), perDay: m.perDay.toString(), sells: 'mirror', maxMoveBps: 500 });
      status('Copying ' + short(w) + '.'); await refresh();
    } catch (e) { status(say(e)); addBtn.disabled = false; }
  });
  nodes.push(el('section', { class: 'qcp-leaders', 'aria-label': 'Wallets you copy' }, el('h3', {}, 'Wallets you copy'),
    el('div', { class: 'qcp-add' }, add, addBtn),
    s.leaders.length ? el('ul', { class: 'qpo-orders' }, s.leaders.map(l => leaderRow(s, l))) : el('p', { class: 'qpo-note' }, 'None yet.')));
  return nodes;
}

function actions(s, off) {
  const b = s.base;
  const pause = el('button', { type: 'button', class: 'qpo-btn' }, off ? 'Resume' : 'Pause');
  pause.addEventListener('click', async () => {
    pause.disabled = true;
    try {
      // Paused here at once; the on-chain switch is your own transaction, so no copy can go through even if this site is down.
      await signedPost('/api/copy/pause', { chainId: s.chainId, paused: !off }).catch(() => {});
      await send(s.chainId, { to: s.vault, data: setPausedData(!off) }, status);
      status(off ? 'Copying again.' : 'Paused. Nothing is copied until you resume.'); await refresh();
    } catch (e) { status(say(e)); pause.disabled = false; }
  });
  const [fundL, fund] = amountIn('Add ' + b.symbol, '');
  const addFunds = el('button', { type: 'button', class: 'qpo-btn' }, 'Add');
  addFunds.addEventListener('click', async () => {
    addFunds.disabled = true;
    try {
      const a = parseUnits(fund.value, b.decimals); if (a === 0n) throw Error('Enter an amount');
      await send(s.chainId, b.native ? { to: s.vault, data: '0x', value: a } : { to: b.token, data: calldata('0xa9059cbb', ['address', 'uint256'], [s.vault, a]) }, status);
      status('Added.'); await refresh();
    } catch (e) { status(say(e)); addFunds.disabled = false; }
  });
  const stop = el('button', { type: 'button', class: 'qpo-btn qcp-stop' }, 'Stop and withdraw everything');
  stop.addEventListener('click', async () => {
    stop.disabled = true;
    try {
      const tokens = [b.native ? ZERO : b.token, ...s.holdings.map(h => h.token)];
      await send(s.chainId, { to: s.vault, data: stopData(tokens, s.me) }, status);
      await signedPost('/api/copy/pause', { chainId: s.chainId, paused: true }).catch(() => {});
      status('Stopped. Everything in your copy account is back in your wallet.'); await refresh();
    } catch (e) { status(say(e)); stop.disabled = false; }
  });
  return el('div', { class: 'qcp-actions' }, el('div', { class: 'qcp-add' }, fundL, addFunds), el('div', { class: 'qpo-acts' }, pause, stop),
    el('p', { class: 'qpo-note' }, 'Stop sends all ' + b.symbol + ' and every token in the account to your wallet in one transaction.'));
}

const SIDE = { buy: 'Bought', sell: 'Sold' }, WHY = { take_profit: 'take profit', stop_loss: 'stop', daily_limit: 'daily limit reached', moved_since_leader: 'price moved too far after their trade', vault_empty: 'account empty', too_small_for_gas: 'too small to cover gas',
  per_trade: 'over your per-trade limit', daily_cap: 'over your daily limit', budget: 'over your total limit', price_impact: 'price impact too high', leader: 'wallet not on your list', not_a_qhooks_launch: 'not a QHooks launch', launch_rules_running: 'launch rules still running', off: 'paused or ended' };
function historyView(s) {
  const b = s.base;
  if (!s.fills.length) return el('p', { class: 'qpo-note' }, 'Copies show here as they happen.');
  return el('ul', { class: 'qpo-orders' }, s.fills.slice(0, 30).map(f => {
    const when = new Date(f.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const what = f.status === 'skipped' || f.status === 'failed' ? 'Skipped' + (f.reason ? ': ' + (WHY[f.reason] || f.reason.replace(/_/g, ' ')) : '')
      : (f.status === 'sent' ? 'Sending' : SIDE[f.side]) + (f.side === 'buy' && f.amountIn ? ' with ' + formatUnits(BigInt(f.amountIn), b.decimals, 6) + ' ' + b.symbol : f.side === 'sell' && f.amountOut && f.status === 'filled' ? ' for ' + formatUnits(BigInt(f.amountOut), b.decimals, 6) + ' ' + b.symbol : '') + (WHY[f.reason] ? ' (' + WHY[f.reason] + ')' : '');
    return el('li', { class: 'qpo-order' }, el('div', {}, el('b', {}, what), el('small', {}, (s.symbols?.[f.token] || short(f.token)) + (f.leader ? ' · copying ' + short(f.leader) : '') + ' · ' + when)),
      f.tx ? el('a', { class: 'qpo-link', href: explorer(s.chainId, f.tx), target: '_blank', rel: 'noopener' }, 'Transaction ↗') : null);
  }));
}
const explorer = (id, tx) => ({ '4663': 'https://robinhoodchain.blockscout.com/tx/', '8453': 'https://basescan.org/tx/', '56': 'https://bscscan.com/tx/', '42161': 'https://arbiscan.io/tx/', '99901': 'https://explorer.elysium.kinetiq.xyz/tx/' }[id] || '#') + tx;

function render(leader) {
  const s = st; root.replaceChildren();
  const pick = el('select', { class: 'qpo-in', 'aria-label': 'Chain' }, ...Object.keys(BASES).map(id => el('option', { value: id, selected: id === s.chainId }, CHAIN_NAME[id])));
  pick.addEventListener('change', () => { const u = new URL(location.href); u.searchParams.set('chain', pick.value); history.replaceState(null, '', u); open(pick.value, leader); });
  root.append(el('div', { class: 'qcp-chain' }, el('label', {}, 'Chain', pick)));
  if (!s.me) { root.append(el('p', { class: 'qpo-note' }, 'Connect your wallet to set up auto-copy.')); return; }
  if (!s.live) { root.append(el('p', { class: 'qpo-note' }, 'Auto-copy is not on ' + CHAIN_NAME[s.chainId] + ' yet.')); return; }
  if (!s.vault) root.append(openForm(s, leader)); else root.append(...accountView(s, leader));
  root.append(el('section', { class: 'qpo-mine' }, el('h3', {}, 'Recent copies'), historyView(s)));
}
let current = { chainId: '4663', leader: '' };
async function open(chainId, leader, keep = false) {
  current = { chainId, leader };
  if (!keep) status('Refreshing…');
  try { st = await load(chainId); if (!keep) status(''); } catch { st = { chainId, me: connectedAddress(), base: BASES[chainId], live: false, leaders: [], fills: [] }; status('Refreshing. Try again in a moment.'); }
  render(leader);
}
/// After an action: redraw and keep the action's own message on screen.
const refresh = () => open(current.chainId, current.leader, true);

const node = document.getElementById('qcp-root');
if (node) {
  import('/qx-account-wallet.mjs').catch(() => {});
  root = node; statusEl = document.getElementById('qcp-status');
  const q = new URLSearchParams(location.search), w = String(q.get('w') || '').toLowerCase(), c = String(q.get('chain') || '4663');
  open(BASES[c] ? c : '4663', ADDR.test(w) ? w : '');
  onWalletChange?.(() => open(current.chainId, current.leader));
}
window.addEventListener('qhooks:copy-open', e => { const w = String(e.detail?.wallet || '').toLowerCase(); location.href = '/copy' + (ADDR.test(w) ? '?w=' + w : ''); });
