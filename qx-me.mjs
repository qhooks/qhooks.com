// My QHooks (/me.html): everything the connected wallet has across the ecosystem, on every chain.
// Launches it created (income waiting, its own share, vesting streams, keys), tokens it holds, stakes and raffle
// entries in marketplace modules, module builder earnings, and terminal cashback and referral rewards.
// Data: /api/account/<w>/launches and /api/terminal/wallet/<w> (the worker's Markets directory and indexer), then
// on-chain reads through the public RPCs. Every button sends the same call as the launch page's own panel.
import { calldata, ethCall, codeAt, words, toAddress, formatUnits, erc20, send, connectedAddress, onWalletChange, rpc, CHAIN_NAME, NATIVE, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { stakeVaultAddress } from '/full-launch/packages/multichain-launch/stake-vault.mjs';
import { modulesAmong, loadModules, allModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';
import { findVests, VEST_SEL } from '/full-launch/packages/multichain-launch/vest.mjs';
import { STOCK_PAIRS } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
import { cashbackOf, claimCall, referralLink } from '/qx-swap.mjs';
import { extraAddress } from '/qx-extras.mjs';
import '/qx-account-wallet.mjs';

const $ = id => document.getElementById(id);
const ZERO = '0x' + '0'.repeat(40);
const BLK = { config: '0x79502c55', release: '0x86d1a69f', creatorQuote: '0xe55e1ce9', creatorToken: '0x483a5f14' };
const STAKE = { staked: '0x98807d84', earned: '0x008cc262', claim: '0x4e71d92d' };
const CTRL = { recoveryEta: '0x1479b3da', phase: '0xb1c9fe6e' };
const PHASE = ['Not started', 'Launch pool', 'Graduated', 'Closed'];
const QUOTES = {
  '8453': [['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 'USDC', 6]], '1': [['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'USDC', 6]],
  '42161': [['0xaf88d065e77c8cc2239327c5edb3a432268e5831', 'USDC', 6]], '56': [['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', 'WBNB', 18]],
  '4663': [['0x0bd7d308f8e1639fab988df18a8011f41eacad73', 'WETH', 18], ...STOCK_PAIRS['4663'].tokens.slice(0, 8).map(([a, s]) => [a, s, 18])]
};
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
function amount(n, d, min = 4) {
  n = BigInt(n); if (n === 0n) return '0';
  for (let x = min; x <= d; x++) if (formatUnits(n, d, x) !== '0') return formatUnits(n, d, Math.min(d, x + (x > min ? 2 : 0)));
  return formatUnits(n, d, d);
}
const both = (q, qa, t, ta) => [qa && amount(qa, q.decimals) + ' ' + q.symbol, ta && amount(ta, t.decimals, 2) + ' ' + t.symbol].filter(Boolean).join(' + ');
const chainTag = c => h('span', { class: 'qa-chain' }, CHAIN_NAME[c] || c);
let seq = 0;

// One button: confirms in the wallet, shows progress in its row, then reloads the page's data.
function action(label, run, { primary = false, disabled = false } = {}) {
  const b = h('button', { type: 'button', class: 'qa-btn' + (primary ? ' qa-btn-primary' : ''), disabled });
  b.textContent = label;
  b.addEventListener('click', async () => {
    const row = b.closest('.qa-row, .qa-launch'), note = row?.querySelector('.qa-status');
    b.disabled = true; const say = t => { if (note) note.textContent = t; };
    try { await run(say); say('Done.'); setTimeout(() => load(true), 600); }
    catch (e) { say(e.message || 'That did not go through.'); b.disabled = false; }
  });
  return b;
}

async function blocksOf(chainId, blocks) {
  const w = words(await ethCall(chainId, blocks, BLK.config));
  const at = k => BLOCK_FIELDS.findIndex(([n]) => n === k);
  const payees = w.slice(BLOCK_FIELDS.length, BLOCK_FIELDS.length + 8).map(toAddress), shares = w.slice(BLOCK_FIELDS.length + 8, BLOCK_FIELDS.length + 16);
  const n = payees.findIndex(p => p === ZERO);
  return { token: toAddress(w[at('token')]), quote: toAddress(w[at('quote')]), payees: n < 0 ? payees : payees.slice(0, n), shares };
}
const metaCache = new Map();
const meta = (c, a) => { const k = c + a; if (!metaCache.has(k)) metaCache.set(k, erc20(c, a).catch(() => ({ symbol: '?', decimals: 18 }))); return metaCache.get(k); };

/// A launch with blocks, opened once: its pair, payees, modules and token metadata.
async function openLaunch(chainId, controller, pool) {
  const blocks = pool?.constructor?.blocks;
  if (!blocks || BigInt(blocks) === 0n) return null;
  const b = await blocksOf(chainId, blocks);
  const [t, q] = await Promise.all([meta(chainId, b.token), meta(chainId, b.quote)]);
  const mods = modulesAmong(b.payees, b.token, b.quote);
  const legacy = stakeVaultAddress(b.token, b.quote), li = b.payees.indexOf(legacy);
  return { chainId, controller, pool, blocks, ...b, t, q, mods, legacy: li >= 0 ? { address: legacy, index: li } : null };
}

async function poolOf(chainId, controller) {
  const r = await fetch(`/api/markets/${chainId}/${controller}`, { cache: 'no-store' }); if (!r.ok) return null;
  return (await r.json()).pool;
}

// ---------- sections ----------
async function launchesSection(me, launches) {
  const rows = [];
  for (const L of launches) {
    const head = h('div', { class: 'qa-launch-head' }, h('div', {}, h('h3', {}, L.name + ' ', h('small', {}, L.symbol)), chainTag(L.chainId)),
      h('div', { class: 'qa-launch-links' }, h('a', { class: 'qa-btn qa-btn-primary', href: '/creator.html#m=' + L.chainId + ':' + L.controller }, 'Dashboard'), h('a', { class: 'qa-btn', href: '/terminal.html#m=' + L.chainId + ':' + L.controller }, 'Trade')));
    const body = h('div', { class: 'qa-launch-body' }), status = h('p', { class: 'qa-status', role: 'status' });
    rows.push(h('article', { class: 'qa-launch' }, head, body, status));
    (async () => {
      const facts = [];
      const [phase, eta] = await Promise.all([ethCall(L.chainId, L.controller, CTRL.phase).then(BigInt).catch(() => null), ethCall(L.chainId, L.controller, CTRL.recoveryEta).then(BigInt).catch(() => 0n)]);
      const X = L.open;
      if (X) {
        const [cq, ct] = (await Promise.all([ethCall(L.chainId, X.blocks, BLK.creatorQuote), ethCall(L.chainId, X.blocks, BLK.creatorToken)])).map(BigInt);
        const mine = X.payees.map((p, i) => p === me ? Number(X.shares[i]) : 0).reduce((a, b) => a + b, 0);
        const vests = findVests(X.payees, [me]), vestBps = vests.reduce((a, v) => a + Number(X.shares[v.index]), 0);
        facts.push(['Waiting to pay out', both(X.q, cq, X.t, ct) || 'nothing yet'], ['Your share', ((mine + vestBps) / 100) + '%' + (vestBps ? ' (' + vestBps / 100 + '% vesting)' : '')],
          ['Modules', X.mods.length || X.legacy ? [...X.mods.map(m => m.module.name), X.legacy ? 'Holder staking' : null].filter(Boolean).join(', ') : 'none']);
        if (cq || ct) body.after(h('div', { class: 'qa-actions' }, action('Pay out to every payee', async s => { s('Confirm the payout in your wallet…'); await send(L.chainId, { to: X.blocks, data: BLK.release }, s); }, { primary: true })));
      }
      facts.push(['Pool', phase == null ? '—' : PHASE[Number(phase)] || '—'], ['Keys', eta ? 'Recovery pending: open the dashboard' : 'Both keys in place']);
      if (L.summary) facts.push(['Holders', String(L.summary.holders ?? '—')], ['24h volume', (L.summary.volume24 ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' ' + (X?.q.symbol || '')]);
      body.replaceChildren(h('dl', { class: 'qa-facts' }, ...facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))));
    })().catch(() => body.replaceChildren(h('p', { class: 'qa-muted' }, 'Could not read this launch right now.')));
  }
  return rows.length ? rows : [h('p', { class: 'qa-empty' }, 'No launches from this wallet yet. ', h('a', { href: '/qtoken-studio.html' }, 'Launch a token'), '.')];
}

function holdingsSection(positions) {
  const held = positions.filter(p => p.balance > 0).sort((a, b) => b.balance * b.price - a.balance * a.price);
  if (!held.length) return [h('p', { class: 'qa-empty' }, 'No QHooks launch tokens in this wallet. ', h('a', { href: '/terminal.html' }, 'Open the terminal'), '.')];
  return [h('div', { class: 'qa-table', role: 'table' },
    h('div', { class: 'qa-tr qa-th', role: 'row' }, ...['Token', 'Chain', 'Holding', 'Value', 'Result'].map(t => h('span', { role: 'columnheader' }, t))),
    ...held.map(p => {
      const value = p.balance * p.price, pnl = p.received + value - p.spent;
      return h('a', { class: 'qa-tr', role: 'row', href: '/terminal.html#m=' + p.chainId + ':' + p.controller },
        h('span', { role: 'cell' }, h('b', {}, p.symbol || '?')), h('span', { role: 'cell' }, CHAIN_NAME[p.chainId] || p.chainId),
        h('span', { role: 'cell' }, p.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })),
        h('span', { role: 'cell' }, value.toLocaleString(undefined, { maximumSignificantDigits: 4 }) + ' ' + (p.quoteSymbol || '')),
        h('span', { role: 'cell', class: pnl >= 0 ? 'qa-up' : 'qa-down' }, (pnl >= 0 ? '+' : '') + pnl.toLocaleString(undefined, { maximumSignificantDigits: 3 }) + ' ' + (p.quoteSymbol || '')));
    }))];
}

async function earnSection(me, opened) {
  const rows = [];
  const call = (c, a, data) => ethCall(c, a, data);
  for (const X of opened) {
    const label = X.t.symbol + ' · ' + (CHAIN_NAME[X.chainId] || X.chainId);
    const stakes = [...X.mods.filter(m => m.module.panel === 'stake').map(m => ({ address: m.address, name: m.module.name })), ...(X.legacy ? [{ address: X.legacy.address, name: 'Holder staking' }] : [])];
    for (const s of stakes) {
      if ((await codeAt(X.chainId, s.address)) === '0x') continue;
      const [st, er] = await Promise.all([call(X.chainId, s.address, calldata(STAKE.staked, ['address'], [me])).then(BigInt), call(X.chainId, s.address, calldata(STAKE.earned, ['address'], [me])).then(words)]);
      if (!st && !er[0] && !er[1]) continue;
      rows.push(h('div', { class: 'qa-row' }, h('div', {}, h('b', {}, 'Staking'), h('span', { class: 'qa-sub' }, label)),
        h('div', {}, h('span', {}, 'Staked ' + amount(st, X.t.decimals, 2) + ' ' + X.t.symbol), h('span', { class: 'qa-sub' }, 'Earned ' + (both(X.q, er[1], X.t, er[0]) || '0'))),
        h('div', { class: 'qa-actions' }, action('Claim', async say => { say('Confirm the claim in your wallet…'); await send(X.chainId, { to: s.address, data: STAKE.claim }, say); }, { primary: true, disabled: !er[0] && !er[1] }),
          h('a', { class: 'qa-btn', href: '/terminal.html#m=' + X.chainId + ':' + X.controller }, 'Stake more')), h('p', { class: 'qa-status', role: 'status' })));
    }
    for (const m of X.mods.filter(x => x.module.panel === 'raffle')) {
      const a = m.address, S = m.module.selectors;
      if ((await codeAt(X.chainId, a)) === '0x') continue;
      const round = BigInt(await call(X.chainId, a, S.currentRound));
      const rs = []; for (let r = round; r >= 0n && r >= round - 7n; r--) rs.push(r);
      const [deps, won] = await Promise.all([Promise.all(rs.map(r => call(X.chainId, a, calldata(S.deposits, ['uint256', 'address'], [r, me])).then(BigInt))), call(X.chainId, a, calldata(S.won, ['address'], [me])).then(words)]);
      const open = deps[0], ended = rs.map((r, i) => [r, deps[i]]).filter(([r, d]) => r < round && d);
      if (!open && !ended.length && !won[0] && !won[1]) continue;
      const btns = [];
      if (won[0] || won[1]) btns.push(action('Claim prize', async say => { say('Confirm the claim in your wallet…'); await send(X.chainId, { to: a, data: S.claim }, say); }, { primary: true }));
      for (const [r, d] of ended) btns.push(action('Withdraw ' + amount(d, X.t.decimals, 2), async say => { say('Confirm in your wallet…'); await send(X.chainId, { to: a, data: calldata(S.withdraw, ['uint256'], [r]) }, say); }));
      rows.push(h('div', { class: 'qa-row' }, h('div', {}, h('b', {}, m.module.name), h('span', { class: 'qa-sub' }, label)),
        h('div', {}, h('span', {}, open ? 'In this round: ' + amount(open, X.t.decimals, 2) + ' ' + X.t.symbol : ended.length ? 'Round ended: your tokens are ready' : 'You won'), h('span', { class: 'qa-sub' }, won[0] || won[1] ? 'Prize ' + both(X.q, won[1], X.t, won[0]) : 'Deposits come back after each round')),
        h('div', { class: 'qa-actions' }, ...btns, h('a', { class: 'qa-btn', href: '/terminal.html#m=' + X.chainId + ':' + X.controller }, 'Open')), h('p', { class: 'qa-status', role: 'status' })));
    }
  }
  return rows;
}

async function builderSection(me, opened) {
  const mine = allModules().filter(m => m.builder === me);
  if (!mine.length) return null;
  const rows = [];
  for (const X of opened) for (const f of X.mods.filter(x => x.module.builder === me)) {
    if ((await codeAt(X.chainId, f.address)) === '0x') continue;
    const p = words(await ethCall(X.chainId, f.address, f.module.selectors.builderPending));
    rows.push(h('div', { class: 'qa-row' }, h('div', {}, h('b', {}, f.module.name), h('span', { class: 'qa-sub' }, X.t.symbol + ' · ' + (CHAIN_NAME[X.chainId] || X.chainId))),
      h('div', {}, h('span', {}, 'Owed to you: ' + (both(X.q, p[1], X.t, p[0]) || '0')), h('span', { class: 'qa-sub' }, 'Your share: ' + f.module.builderBps / 100 + '% of what it receives')),
      h('div', { class: 'qa-actions' }, action('Collect', async say => { say('Confirm in your wallet…'); await send(X.chainId, { to: f.address, data: f.module.selectors.claimBuilder }, say); }, { primary: true, disabled: !p[0] && !p[1] })), h('p', { class: 'qa-status', role: 'status' })));
  }
  return [h('p', { class: 'qa-muted' }, 'Modules you built: ' + mine.map(m => m.name).join(', ') + '. Shown for launches you created or hold.'), ...rows];
}

async function vestSection(me, opened) {
  const rows = [];
  for (const X of opened) for (const v of findVests(X.payees, [me])) {
    if ((await codeAt(X.chainId, v.address)) === '0x') { rows.push(h('div', { class: 'qa-row' }, h('div', {}, h('b', {}, 'Vesting over ' + (v.days >= 365 ? 'a year' : v.days + ' days')), h('span', { class: 'qa-sub' }, X.t.symbol + ' · ' + CHAIN_NAME[X.chainId])), h('div', {}, h('span', {}, 'Not opened yet'), h('span', { class: 'qa-sub' }, 'Open it from the dashboard')), h('div', { class: 'qa-actions' }, h('a', { class: 'qa-btn', href: '/creator.html#m=' + X.chainId + ':' + X.controller }, 'Dashboard')))); continue; }
    const [sq, st] = await Promise.all([X.quote, X.token].map(c => ethCall(X.chainId, v.address, calldata(VEST_SEL.status, ['address'], [c])).then(words)));
    rows.push(h('div', { class: 'qa-row' }, h('div', {}, h('b', {}, 'Vesting over ' + (v.days >= 365 ? 'a year' : v.days + ' days')), h('span', { class: 'qa-sub' }, X.t.symbol + ' · ' + CHAIN_NAME[X.chainId])),
      h('div', {}, h('span', {}, 'Ready: ' + (both(X.q, sq[0], X.t, st[0]) || '0')), h('span', { class: 'qa-sub' }, 'Still vesting: ' + (both(X.q, sq[1], X.t, st[1]) || '0'))),
      h('div', { class: 'qa-actions' }, action('Send to me', async say => { say('Confirm in your wallet…'); await send(X.chainId, { to: v.address, data: calldata(VEST_SEL.claimMany, ['address[]'], [[X.quote, X.token]]) }, say); }, { primary: true, disabled: !sq[0] && !st[0] && !sq[3] && !st[3] })), h('p', { class: 'qa-status', role: 'status' })));
  }
  return rows;
}

async function rewardsSection(me) {
  const router = await extraAddress('feeRouter');
  const found = (await Promise.all(Object.keys(QUOTES).map(async c => {
    try {
      if ((await codeAt(c, router)) === '0x') return [];
      const cur = [[ZERO, NATIVE[c], 18], ...QUOTES[c]];
      const vals = await Promise.all(cur.map(([a]) => cashbackOf(c, router, me, a).catch(() => 0n)));
      return cur.map(([a, sym, d], i) => ({ c, a, sym, d, v: vals[i] })).filter(x => x.v > 0n);
    } catch { return []; }
  }))).flat();
  const rows = found.map(x => h('div', { class: 'qa-row' }, h('div', {}, h('b', {}, 'Cashback and referrals'), h('span', { class: 'qa-sub' }, CHAIN_NAME[x.c])),
    h('div', {}, h('span', {}, amount(x.v, x.d) + ' ' + x.sym), h('span', { class: 'qa-sub' }, 'From your terminal trades and your referral link')),
    h('div', { class: 'qa-actions' }, action('Claim', async say => { await send(x.c, { to: router, data: claimCall(x.a) }, say); }, { primary: true })), h('p', { class: 'qa-status', role: 'status' })));
  const link = referralLink(me), copy = h('button', { type: 'button', class: 'qa-btn' }, 'Copy link');
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select the link'; } });
  return { rows, ref: h('div', { class: 'qa-ref' }, h('span', {}, 'Your referral link earns 20% of the trading fee on every terminal trade it brings: ', h('code', {}, 'qhooks.com/terminal.html?ref=' + short(me))), copy) };
}

// ---------- page ----------
function section(id, title, line, kids) {
  return h('section', { class: 'qa-section', id, 'aria-labelledby': id + '-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: id + '-h' }, title), line ? h('p', {}, line) : null), ...kids);
}
const tile = (k, v, sub) => h('div', { class: 'qa-tile' }, h('span', {}, k), h('b', {}, v), sub ? h('small', {}, sub) : null);

async function load(quiet = false) {
  const me = connectedAddress(), mine = ++seq, root = $('qa-root');
  if (!me) {
    root.replaceChildren(h('div', { class: 'qa-connect' }, h('h2', {}, 'Connect a wallet to see your QHooks'), h('p', {}, 'Launches you created, tokens you hold, stakes, raffle entries, vesting and rewards, on every chain. Reading is free; nothing is sent without your confirmation.'),
      h('button', { type: 'button', class: 'qx-btn qx-btn-primary', 'data-qa-connect': '' }, 'Connect wallet')));
    $('qa-tiles').replaceChildren(); return;
  }
  if (!quiet) root.replaceChildren(h('p', { class: 'qa-loading' }, 'Reading your launches, holdings and rewards on every chain…'));
  await loadModules();
  const [acct, wallet] = await Promise.all([fetch('/api/account/' + me + '/launches', { cache: 'no-store' }).then(r => r.ok ? r.json() : { launches: [] }).catch(() => ({ launches: [] })),
    fetch('/api/terminal/wallet/' + me, { cache: 'no-store' }).then(r => r.ok ? r.json() : { positions: [] }).catch(() => ({ positions: [] }))]);
  if (mine !== seq) return;
  const launches = acct.launches || [], positions = wallet.positions || [];
  const keys = new Map();
  for (const L of launches) keys.set(L.chainId + ':' + L.controller, L.pool);
  for (const p of positions) if (!keys.has(p.chainId + ':' + p.controller)) keys.set(p.chainId + ':' + p.controller, null);
  const opened = (await Promise.all([...keys].map(async ([k, pool]) => {
    const [c, ctrl] = k.split(':');
    try { return await openLaunch(c, ctrl, pool || await poolOf(c, ctrl)); } catch { return null; }
  }))).filter(Boolean);
  for (const L of launches) L.open = opened.find(x => x.chainId === L.chainId && x.controller === L.controller) || null;
  const [earn, built, vests, rewards] = await Promise.all([earnSection(me, opened).catch(() => []), builderSection(me, opened).catch(() => null), vestSection(me, opened).catch(() => []), rewardsSection(me).catch(() => ({ rows: [], ref: null }))]);
  if (mine !== seq) return;
  const value = positions.reduce((s, p) => s + p.balance * p.price, 0), held = positions.filter(p => p.balance > 0).length;
  $('qa-tiles').replaceChildren(tile('Launches', String(launches.length), launches.length ? 'created by you' : 'none yet'), tile('Tokens held', String(held), held ? 'QHooks launches' : '—'),
    tile('Earning', String(earn.length + vests.length), 'stakes, raffles, vesting'), tile('To claim', String(rewards.rows.length + earn.filter(r => r.querySelector('.qa-btn-primary:not([disabled])')).length), 'rewards and payouts'));
  root.replaceChildren(...[
    section('qa-launches', 'Your launches', 'Income waiting in each launch, your share of it, and where its keys stand. The dashboard has everything for one launch.', await launchesSection(me, launches)),
    section('qa-earn', 'Earning', 'Stakes and raffle entries in the modules of the launches you hold.', earn.length ? earn : [h('p', { class: 'qa-empty' }, 'No stakes or raffle entries yet. Launches that pay holders show a Staking or Modules tab in the terminal.')]),
    vests.length ? section('qa-vest', 'Vesting streams', 'Your share of a launch, reaching you evenly over time.', vests) : null,
    section('qa-rewards', 'Rewards', 'Terminal trades earn 30% of their fee back; referrals earn 20%. One balance per currency, per chain.', [...(rewards.rows.length ? rewards.rows : [h('p', { class: 'qa-empty' }, 'Nothing to claim right now.')]), rewards.ref]),
    built ? section('qa-built', 'Modules you built', 'Your builder share of modules in the marketplace.', built) : null,
    section('qa-holdings', 'Holdings', 'Launch tokens in this wallet, from the terminal\'s index (value at the last trade price).', holdingsSection(positions)),
    section('qa-keys', 'Wallet and keys', null, [h('p', { class: 'qa-muted' }, 'Connected: ' + me + '. Each launch\'s two keys (this wallet and its post-quantum key) are on its dashboard under Keys: rotate them, or start or cancel a recovery. QHooks never sees your post-quantum key or its passphrase.'),
      h('div', { class: 'qa-actions' }, h('a', { class: 'qa-btn qa-btn-primary', href: '/profile.html#' + me }, 'Your public profile →'), h('a', { class: 'qa-btn', href: '/qwallets.html' }, 'qWallets'), h('button', { type: 'button', class: 'qa-btn', 'data-qa-connect': '' }, 'Wallet details'))])].filter(Boolean));
}

onWalletChange(() => load());
load();
