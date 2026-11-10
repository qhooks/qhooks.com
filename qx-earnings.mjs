// Shared My QHooks earnings and claim controls. Each page owns its refresh callback.
import { calldata, ethCall, codeAt, words, toAddress, formatUnits, erc20, send, CHAIN_NAME, NATIVE, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { stakeVaultAddress } from '/full-launch/packages/multichain-launch/stake-vault.mjs';
import { modulesAmong, loadModules, allModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';
import { findVests, VEST_SEL } from '/full-launch/packages/multichain-launch/vest.mjs';
import { STOCK_PAIRS } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
import { chainMap, visibleChains } from '/chains.mjs';
import { cashbackOf, claimCall, referralLink } from '/qx-swap.mjs';
import { extraAddress } from '/qx-extras.mjs';
import {connectedAddress} from '/qx-chain.mjs';
import {readEvmRewardSnapshot,sameRewardOwner} from '/qx-reward-state.mjs';

const ZERO = '0x' + '0'.repeat(40);
const BLK = { config: '0x79502c55', release: '0x86d1a69f', creatorQuote: '0xe55e1ce9', creatorToken: '0x483a5f14' };
const STAKE = { staked: '0x98807d84', earned: '0x008cc262', claim: '0x4e71d92d' };
const CTRL = { recoveryEta: '0x1479b3da', phase: '0xb1c9fe6e' };
const PHASE = ['Not started', 'Launch pool', 'Graduated', 'Closed'];
// From the registry (chains.mjs): each chain's launch quote (Robinhood also its most-traded stock pairs).
const QUOTES = chainMap(c => c.id === '4663'
  ? [[c.quote.address, c.quote.symbol, c.quote.decimals], ...STOCK_PAIRS['4663'].tokens.slice(0, 8).map(([a, s]) => [a, s, 18])]
  : [[c.quote.address, c.quote.symbol, c.quote.decimals]], visibleChains());
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
function amount(n, d, min = 4) {
  n = BigInt(n); if (n === 0n) return '0';
  for (let x = min; x <= d; x++) if (formatUnits(n, d, x) !== '0') return formatUnits(n, d, Math.min(d, x + (x > min ? 2 : 0)));
  return formatUnits(n, d, d);
}
const both = (q, qa, t, ta) => [qa && amount(qa, q.decimals) + ' ' + q.symbol, ta && amount(ta, t.decimals, 2) + ' ' + t.symbol].filter(Boolean).join(' + ');
const chainTag = c => h('span', { class: 'qa-chain' }, CHAIN_NAME[c] || c);

// One button: confirms in the wallet, shows progress in its row, then reloads the page's data.
export function action(label, run, { primary = false, disabled = false, refresh = () => {} } = {}) {
  const b = h('button', { type: 'button', class: 'qa-btn' + (primary ? ' qa-btn-primary' : ''), disabled });
  b.textContent = label;
  b.addEventListener('click', async () => {
    const row = b.closest('.qa-row, .qa-launch'), note = row?.querySelector('.qa-status');
    b.disabled = true; const say = t => { if (note) note.textContent = t; };
    try { await run(say); say('Done.'); setTimeout(() => refresh(), 600); }
    catch (e) { say(e.message || 'That did not go through.'); b.disabled = false; }
  });
  return b;
}

const sharedAction = action;

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
  let legacy = stakeVaultAddress(b.token, b.quote), li = b.payees.indexOf(legacy);
  // Simple launches create their vault with a plain CREATE: find it among the payees by its token() and quote().
  for (let i = 1; li < 0 && i < b.payees.length; i++) {
    if (mods.some(m => m.address === b.payees[i]) || !BigInt(b.shares[i] || 0)) continue;
    try { const [vt, vq] = await Promise.all([ethCall(chainId, b.payees[i], '0xfc0c546a'), ethCall(chainId, b.payees[i], '0x999b93af')]);
      if (toAddress(vt) === b.token && toAddress(vq) === b.quote) { legacy = b.payees[i]; li = i; } } catch {}
  }
  return { chainId, controller, pool, blocks, ...b, t, q, mods, legacy: li >= 0 ? { address: legacy, index: li } : null };
}

async function poolOf(chainId, controller) {
  const r = await fetch(`/api/markets/${chainId}/${controller}`, { cache: 'no-store' }); if (!r.ok) return null;
  return (await r.json()).pool;
}

// ---------- sections ----------
export async function launchesSection(me, launches, refresh = () => {}) {
  const action = (label, run, options = {}) => sharedAction(label, run, {...options, refresh});
  const rows = [];
  for (const L of launches) {
    const head = h('div', { class: 'qa-launch-head' }, h('div', {}, h('h3', {}, L.name + ' ', h('small', {}, L.symbol)), chainTag(L.chainId)),
      h('div', { class: 'qa-launch-links' }, h('a', { class: 'qa-btn qa-btn-primary', href: '/creator#m=' + L.chainId + ':' + L.controller }, 'Dashboard'), h('a', { class: 'qa-btn', href: '/terminal#m=' + L.chainId + ':' + L.controller }, 'Trade')));
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
  return rows.length ? rows : [h('p', { class: 'qa-empty' }, 'No launches from this wallet yet. ', h('a', { href: '/create' }, 'Launch a token'), '.')];
}

export async function earnSection(me, opened, refresh = () => {}) {
  const action = (label, run, options = {}) => sharedAction(label, run, {...options, refresh});
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
          h('a', { class: 'qa-btn', href: '/terminal#m=' + X.chainId + ':' + X.controller }, 'Stake more')), h('p', { class: 'qa-status', role: 'status' })));
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
        h('div', { class: 'qa-actions' }, ...btns, h('a', { class: 'qa-btn', href: '/terminal#m=' + X.chainId + ':' + X.controller }, 'Open')), h('p', { class: 'qa-status', role: 'status' })));
    }
  }
  return rows;
}

export async function builderSection(me, opened, refresh = () => {}) {
  const action = (label, run, options = {}) => sharedAction(label, run, {...options, refresh});
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

export async function vestSection(me, opened, refresh = () => {}) {
  const action = (label, run, options = {}) => sharedAction(label, run, {...options, refresh});
  const rows = [];
  for (const X of opened) for (const v of findVests(X.payees, [me])) {
    if ((await codeAt(X.chainId, v.address)) === '0x') { rows.push(h('div', { class: 'qa-row' }, h('div', {}, h('b', {}, 'Vesting over ' + (v.days >= 365 ? 'a year' : v.days + ' days')), h('span', { class: 'qa-sub' }, X.t.symbol + ' · ' + CHAIN_NAME[X.chainId])), h('div', {}, h('span', {}, 'Not opened yet'), h('span', { class: 'qa-sub' }, 'Open it from the dashboard')), h('div', { class: 'qa-actions' }, h('a', { class: 'qa-btn', href: '/creator#m=' + X.chainId + ':' + X.controller }, 'Dashboard')))); continue; }
    const [sq, st] = await Promise.all([X.quote, X.token].map(c => ethCall(X.chainId, v.address, calldata(VEST_SEL.status, ['address'], [c])).then(words)));
    rows.push(h('div', { class: 'qa-row' }, h('div', {}, h('b', {}, 'Vesting over ' + (v.days >= 365 ? 'a year' : v.days + ' days')), h('span', { class: 'qa-sub' }, X.t.symbol + ' · ' + CHAIN_NAME[X.chainId])),
      h('div', {}, h('span', {}, 'Ready: ' + (both(X.q, sq[0], X.t, st[0]) || '0')), h('span', { class: 'qa-sub' }, 'Still vesting: ' + (both(X.q, sq[1], X.t, st[1]) || '0'))),
      h('div', { class: 'qa-actions' }, action('Send to me', async say => { say('Confirm in your wallet…'); await send(X.chainId, { to: v.address, data: calldata(VEST_SEL.claimMany, ['address[]'], [[X.quote, X.token]]) }, say); }, { primary: true, disabled: !sq[0] && !st[0] && !sq[3] && !st[3] })), h('p', { class: 'qa-status', role: 'status' })));
  }
  return rows;
}

export async function rewardsSection(me, refresh = () => {}) {
  const action = (label, run, options = {}) => sharedAction(label, run, {...options, refresh});
  const router = await extraAddress('feeRouter');
  const routers = Object.fromEntries(await Promise.all(Object.keys(QUOTES).map(async id => [id, await extraAddress('feeRouter', id)])));
  const snapshot=await readEvmRewardSnapshot(me,{quotes:QUOTES,native:NATIVE,router:id=>routers[id],codeAt,cashbackOf});
  const rows=snapshot.claimable.map(x=>h('div',{class:'qa-row'},h('div',{},h('b',{},'Available to claim'),h('span',{class:'qa-sub'},CHAIN_NAME[x.chainId]||x.chainId)),
    h('div',{},h('span',{},amount(x.amount,x.decimals)+' '+x.symbol),h('span',{class:'qa-sub'},'Cashback and referral credits in this asset')),
    h('div',{class:'qa-actions'},action('Claim',async say=>{
      if(!sameRewardOwner(connectedAddress(),me))throw Error('Reconnect the wallet that owns these rewards.');
      say('Confirm the claim in your wallet. Network gas is paid on '+(CHAIN_NAME[x.chainId]||x.chainId)+'.');
      await send(x.chainId,{to:x.router||router,data:claimCall(x.address)},say);
    },{primary:true})),h('p',{class:'qa-status',role:'status'})));
  const unavailable=snapshot.balances.filter(row=>row.status==='unavailable');
  const coverage=h('div',{class:'qa-reward-coverage'},h('p',{class:'qa-muted'},unavailable.length
    ?'Some balances could not be read: '+unavailable.slice(0,4).map(row=>(CHAIN_NAME[row.chainId]||row.chainId)+' '+row.symbol).join(', ')+(unavailable.length>4?' and '+(unavailable.length-4)+' more.':'.')
    :'Checked '+new Date(snapshot.observedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'. EVM claims use network gas in your wallet.'),
    h('button',{type:'button',class:'qa-btn',onclick:refresh},'Refresh reward balances'));
  const link=referralLink(me),copy=h('button',{type:'button',class:'qa-btn'},'Copy referral link'),status=h('p',{class:'qa-status',role:'status','aria-live':'polite'});
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link);status.textContent='Referral link copied. Token-specific calls carry their own trade link.';}catch{status.replaceChildren('Copy your link: ',h('a',{href:link},link));}});
  const ref=h('div',{class:'qa-ref'},h('span',{},'Bring traders. Earn 20% of the trading fee from eligible referred trades. They get 30% cashback.'),h('code',{},link),copy,status);
  return{rows,partial:snapshot.partial,snapshot,coverage,ref};
}

export function section(id, title, line, kids) {
  return h('section', { class: 'qa-section', id, 'aria-labelledby': id + '-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: id + '-h' }, title), line ? h('p', {}, line) : null), ...kids);
}

export async function loadEarnings(me, {refresh = () => {}, includeRewards = true} = {}) {
  await loadModules();
  let partial = false;const coverage={};
  const read = async (url,key) => { try { const r = await fetch(url, {cache: 'no-store'}); if (!r.ok) throw Error('unavailable');const value=await r.json();if(!Array.isArray(value[key]))throw Error('Invalid account response');coverage[key]='checked';return value; } catch { partial = true;coverage[key]='unavailable';return {}; } };
  const [acct, wallet] = await Promise.all([read('/api/account/' + me + '/launches','launches'), read('/api/terminal/wallet/' + me,'positions')]);
  const launches = acct.launches || [], positions = wallet.positions || [];
  const keys = new Map();
  for (const L of launches) keys.set(L.chainId + ':' + L.controller, L.pool);
  for (const p of positions) if (!keys.has(p.chainId + ':' + p.controller)) keys.set(p.chainId + ':' + p.controller, null);
  const opened = (await Promise.all([...keys].map(async ([k, pool]) => {
    const [c, ctrl] = k.split(':');
    try { return await openLaunch(c, ctrl, pool || await poolOf(c, ctrl)); } catch { partial = true; return null; }
  }))).filter(Boolean);
  for (const L of launches) L.open = opened.find(x => x.chainId === L.chainId && x.controller === L.controller) || null;
  const [earn, built, vests, rewards] = await Promise.all([earnSection(me, opened, refresh).catch(() => { partial = true; return []; }), builderSection(me, opened, refresh).catch(() => { partial = true; return null; }), vestSection(me, opened, refresh).catch(() => { partial = true; return []; }), includeRewards ? rewardsSection(me, refresh).catch(() => { partial = true; return { rows: [], ref: null, partial:true }; }) : Promise.resolve({rows:[],ref:null,partial:false,skipped:true})]);
  return {launches, positions, earn, vests, rewards, built, opened, coverage, partial: partial || rewards.partial === true};
}

export async function renderEarnings(me, {launches, earn, vests, rewards, built,coverage,partial}, {refresh = () => {}, rewardsId = 'qa-rewards', includeRewards = true} = {}) {
  return [
    section('qa-launches', 'Your launches', 'Income waiting in each launch, your share of it, and where its keys stand. The dashboard has everything for one launch.', coverage?.launches==='unavailable'?[h('p',{class:'qa-empty'},'Your launches could not be read. Refresh the account to retry.')]:await launchesSection(me, launches, refresh)),
    section('qa-earn', 'Earning', 'Stakes and raffle entries in the modules of the launches you hold.', earn.length ? earn : [h('p', { class: 'qa-empty' }, partial?'Some income reads are unavailable. Refresh the account to check again.':'No stakes or raffle entries yet. Launches that pay holders show a Staking or Modules tab in the terminal.')]),
    vests.length ? section('qa-vest', 'Vesting streams', 'Your share of a launch, reaching you evenly over time.', vests) : null,
    includeRewards ? section(rewardsId, 'Rewards', 'Terminal trades earn 30% of their fee back; referrals earn 20%. One balance per currency, per chain.', [...(rewards.rows.length ? rewards.rows : [h('p', { class: 'qa-empty' }, rewards.partial?'Reward balances are partly unavailable. Refresh to retry.':'No claimable balance in the checked assets yet.')]), rewards.coverage, rewards.ref].filter(Boolean)) : null,
    built ? section('qa-built', 'Modules you built', 'Your builder share of modules in the marketplace.', built) : null
  ].filter(Boolean);
}
