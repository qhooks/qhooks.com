// /qwerty-splitter: JAL's one-tap page (2026-11-13). Optional: collect the QWERTY fees waiting now to his wallet. Then:
// setPayout(QWERTY pool id, splitter) on the clean launch contract 0x34ac. Only the QWERTY creator wallet can sign.
// Before the send button appears the page checks on chain that the splitter has code, that its runtime sha256 is the
// reviewed build, and that every constructor value (shares, wallets, ranges, tokens, cap) reads back as expected.
// After the send it reads the payout back: payout == splitter shows Done. Read-only until JAL taps; nothing auto-sends.
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

export const CHAIN_ID = '4663';
export const FACTORY = '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc';
export const POOL_ID = '0x084a4faeaff8bf8105c72974b33a1aca37cdc4f29bcb27ea7c2512e1f1f12a6f';
export const CREATOR = '0xca04742a4fa7dda1eb02f48bc0fe2be2d8b92c34';
export const SPLITTER = '0x2a5635e0646865ce69a741465ddbbe1badc46304';
export const SPLITTER_SHA256 = '369668c4e5aaf441281af973d27a34b2cfd857022eed1e5de7dc4a1a0f82eca6';
export const RANGE_QWERTY = '0xad17388183c634bfebaaa6cd02dc354d4b5c8b3a';
export const RANGE_QHOOKS = '0xb8dfcb4d17250836b859185bb05b9bbaede6b4a1';
export const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
export const QWERTY = '0xebf69bb14d80e7c68f648fbae6050494923e480f';
export const QHOOKS = '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';
export const MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
export const SHARES = '60% to QHOOKS liquidity · 15% QWERTY liquidity · 15% QWERTY burn · 10% you';
// The pool key: WETH is currency0 (QWERTY's tokenIs0 is false), 1% fee, spacing 200, hook = the launch contract.
export const KEY = Object.freeze({currency0: WETH, currency1: QWERTY, fee: 10000, tickSpacing: 200, hooks: FACTORY});

const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const bytes = h => Uint8Array.from((h.replace(/^0x/, '').match(/../g) || []).map(x => parseInt(x, 16)));
const kec = h => '0x' + hex(keccak_256(bytes(h)));
export const selector = s => '0x' + hex(keccak_256(new TextEncoder().encode(s))).slice(0, 8);
const M256 = (1n << 256n) - 1n;
const word = n => ((BigInt(n) % (1n << 256n) + (1n << 256n)) % (1n << 256n)).toString(16).padStart(64, '0');
const addrWord = a => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const short = a => a.slice(0, 6) + '…' + a.slice(-4);

export const SEL = {
  launchOf: selector('launchOf(bytes32)'), setPayout: selector('setPayout(bytes32,address)'),
  collect: selector('collect((address,address,uint24,int24,address))'), extsload: selector('extsload(bytes32[])'),
};
// Every constructor value of the reviewed deploy (README in work/qwerty-splitter-20261113): name, selector, expected word.
export const EXPECT = [
  ['creator', addrWord(CREATOR)], ['creatorBps', word(1000)], ['buyABps', word(6000)], ['liqBBps', word(1500)], ['burnBBps', word(1500)],
  ['rangeA', addrWord(RANGE_QHOOKS)], ['rangeB', addrWord(RANGE_QWERTY)], ['tokenA', addrWord(QHOOKS)], ['tokenB', addrWord(QWERTY)],
  ['weth', addrWord(WETH)], ['launchB', addrWord(FACTORY)], ['maxBuyPerRun', word(5n * 10n ** 16n)],
].map(([name, want]) => ({name, data: selector(name + '()'), want}));

export const COLLECT_DATA = SEL.collect + addrWord(KEY.currency0) + addrWord(KEY.currency1) + word(KEY.fee) + word(KEY.tickSpacing) + addrWord(KEY.hooks);
export const SET_PAYOUT_DATA = SEL.setPayout + POOL_ID.slice(2) + addrWord(SPLITTER);

// ---- pending LP fees of the launch's locked position, read straight from PoolManager storage (one extsload call) ----
const POOLS_SLOT = 6n;
const toInt24 = w => { const v = BigInt('0x' + w) & 0xffffffn; return Number(v >= 0x800000n ? v - 0x1000000n : v); };
const signedWord = n => word(BigInt(n) < 0n ? (1n << 256n) + BigInt(n) : BigInt(n));
/** The ten storage slots, in order: slot0, feeGrowthGlobal0/1, lower tick outside0/1, upper tick outside0/1, position liquidity, inside0Last/1Last. */
export function feeSlots(poolId, owner, lower, upper) {
  const state = BigInt(kec(poolId.replace(/^0x/, '').padStart(64, '0') + word(POOLS_SLOT)));
  const ticks = state + 4n, positions = state + 6n;
  const tick = t => BigInt(kec(signedWord(t) + word(ticks)));
  const enc24 = t => (BigInt(t) & 0xffffffn).toString(16).padStart(6, '0');
  const posKey = kec(owner.replace(/^0x/, '').toLowerCase() + enc24(lower) + enc24(upper) + '0'.repeat(64));
  const pos = BigInt(kec(posKey.slice(2) + word(positions)));
  const lo = tick(lower), hi = tick(upper);
  return [state, state + 1n, state + 2n, lo + 1n, lo + 2n, hi + 1n, hi + 2n, pos, pos + 1n, pos + 2n].map(s => '0x' + word(s));
}
/** Fees owed to the position, the same arithmetic as v4's Pool.getFeeGrowthInside and Position.update. */
export function pendingFees(values, lower, upper) {
  const v = values.map(x => BigInt(x));
  const tick = toInt24(v[0].toString(16).padStart(64, '0').slice(64 - 46, 64 - 40));
  const [g0, g1, lo0, lo1, hi0, hi1, liq, last0, last1] = v.slice(1);
  const inside = (g, lo, hi) => tick < lower ? (lo - hi) & M256 : tick >= upper ? (hi - lo) & M256 : (g - lo - hi) & M256;
  const owed = (ins, last) => (((ins - last) & M256) * (liq & ((1n << 128n) - 1n))) >> 128n;
  return {tick, liquidity: liq, fee0: owed(inside(g0, lo0, hi0), last0), fee1: owed(inside(g1, lo1, hi1), last1)};
}
const decodeWords = h => (h.slice(2).match(/.{64}/g) || []);
export function decodeLaunch(h) {
  const w = decodeWords(h);
  if (w.length !== 9) throw Error('Incomplete launch read');
  const a = i => '0x' + w[i].slice(24);
  return {token: a(0), startTick: toInt24(w[1].slice(58)), tokenIs0: BigInt('0x' + w[4]) === 1n, creator: a(7), payout: a(8)};
}
export const rangeOf = l => l.tokenIs0 ? [l.startTick, 887200] : [-887200, l.startTick];

async function sha256hex(code) {
  const d = await crypto.subtle.digest('SHA-256', bytes(code));
  return hex(new Uint8Array(d));
}

/** One read of everything the page shows, all at one block. */
export async function readSplitState(rpc) {
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!/^0x[0-9a-f]+$/i.test(block?.number)) throw Error('Incomplete block read');
  const tag = block.number, call = (to, data) => rpc('eth_call', [{to, data}, tag]);
  const [code, launchHex, ...cfg] = await Promise.all([rpc('eth_getCode', [SPLITTER, tag]), call(FACTORY, SEL.launchOf + POOL_ID.slice(2)),
    ...EXPECT.map(e => call(SPLITTER, e.data).catch(() => '0x'))]);
  const launch = decodeLaunch(launchHex);
  if (!same(launch.token, QWERTY)) throw Error('Wrong launch read');
  let splitter = 'missing', mismatch = [];
  if (/^0x(?:[0-9a-f]{2})+$/i.test(code)) {
    mismatch = EXPECT.filter((e, i) => String(cfg[i]).slice(2).toLowerCase() !== e.want).map(e => e.name);
    if (await sha256hex(code) !== SPLITTER_SHA256) mismatch.unshift('code');
    splitter = mismatch.length ? 'mismatch' : 'ok';
  }
  let pending = null;
  try {
    const [lower, upper] = rangeOf(launch), slots = feeSlots(POOL_ID, FACTORY, lower, upper);
    const data = SEL.extsload + word(32) + word(slots.length) + slots.map(s => s.slice(2)).join('');
    const out = decodeWords(await call(MANAGER, data));
    if (out.length !== slots.length + 2 || BigInt('0x' + out[1]) !== BigInt(slots.length)) throw Error('Incomplete fee read');
    const f = pendingFees(out.slice(2).map(w => '0x' + w), lower, upper);
    pending = {weth: f.fee0, qwerty: f.fee1};
  } catch { pending = null; }
  return {block: tag, splitter, mismatch, creator: launch.creator, payout: launch.payout, done: same(launch.payout, SPLITTER), pending};
}

export function stepView(state, owner) {
  if (!state) return {text: 'Refreshing', buttons: []};
  if (!same(state.creator, CREATOR)) return {text: 'The QWERTY creator role moved to another wallet. This page is for ' + short(CREATOR) + ' only. Nothing to sign here.', buttons: []};
  if (state.splitter === 'mismatch') return {text: 'The splitter on chain does not match the reviewed one. Do not sign. Ask QHooks to check it.', buttons: []};
  if (state.done && state.splitter === 'ok') return {text: 'Done. QWERTY fees now go to the splitter: ' + SHARES + '.', buttons: [], done: true};
  if (!owner) return {text: 'Connect the QWERTY creator wallet (' + short(CREATOR) + ') above.', buttons: []};
  if (!same(owner, CREATOR)) return {text: 'Only the QWERTY creator wallet ' + short(CREATOR) + ' can sign this. You are connected as ' + short(owner) + '. Switch wallets above.', buttons: []};
  const buttons = [];
  const anyPending = !state.pending || state.pending.weth > 0n || state.pending.qwerty > 0n;
  if (same(state.payout, CREATOR) && anyPending) buttons.push('collect');
  if (state.splitter === 'ok') buttons.push('point');
  const text = state.splitter === 'ok' ? 'Ready. The splitter checked out on chain.' : 'The splitter is not set up on Robinhood Chain yet. You can collect now; the send-to-splitter step opens once it is set up.';
  return {text, buttons};
}

export const fmtUnits = (v, decimals = 18, places = 4) => {
  const s = (BigInt(v) * 10n ** BigInt(places) / 10n ** BigInt(decimals)).toString().padStart(places + 1, '0');
  const cut = s.length - places;
  const whole = s.slice(0, cut).replace(/\B(?=(\d{3})+(?!\d))/g, ','), frac = places ? s.slice(cut).replace(/0+$/, '') : '';
  return frac ? whole + '.' + frac : whole;
};

export function mountSplitter({document: doc, hub, io, pollMs = 60000}) {
  const root = doc.getElementById('qws-root');
  let state, reading = false, busy = false, message = '', stopped = false, lastTx = null;
  const el = (tag, attrs = {}, ...kids) => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'onclick') n.addEventListener('click', v); else n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.flat().filter(k => k != null)); return n;
  };
  const btn = (text, onclick, key) => el('button', {type: 'button', class: 'qtx-mini qas-go', 'data-act': key, disabled: busy || reading, onclick}, text);
  function render() {
    if (stopped) return;
    root.setAttribute('aria-busy', String(reading || busy));
    if (!state) { root.replaceChildren(el('p', {role: 'status'}, message || 'Refreshing')); return; }
    const owner = hub.snapshot().current?.owner, view = stepView(state, owner);
    const pend = state.pending ? fmtUnits(state.pending.weth, 18, 6) + ' WETH · ' + fmtUnits(state.pending.qwerty, 18, 0) + ' QWERTY' : 'Refreshing';
    const facts = el('dl', {class: 'qws-facts'},
      el('dt', {}, 'Fees go to'), el('dd', {}, state.done ? 'The splitter · ' + SPLITTER : same(state.payout, CREATOR) ? 'Creator wallet · ' + CREATOR : state.payout),
      el('dt', {}, 'Waiting now'), el('dd', {}, pend),
      el('dt', {}, 'Split'), el('dd', {}, SHARES),
      el('dt', {}, 'Splitter'), el('dd', {}, state.splitter === 'ok' ? SPLITTER + ' · checked' : state.splitter === 'missing' ? 'Not set up yet' : SPLITTER + ' · does not match'));
    const kids = [el('p', {class: 'qhlm-state', role: 'status'}, reading ? 'Refreshing' : view.text), facts];
    if (view.buttons.includes('collect')) kids.push(el('section', {class: 'qws-step', 'data-step': 'collect'},
      el('h3', {}, 'Optional · Collect fees waiting now'), el('p', {}, 'Sends the fees waiting now to your wallet first. Skip it and they go through the splitter.'),
      btn('Collect to my wallet', () => send('collect'), 'collect')));
    if (view.buttons.includes('point')) kids.push(el('section', {class: 'qws-step', 'data-step': 'point'},
      el('h3', {}, 'Send QWERTY fees to the splitter'), el('p', {}, SHARES + '. You can point your fees back to your wallet later.'),
      btn('Send fees to the splitter', () => send('point'), 'point')));
    if (lastTx) kids.push(el('p', {class: 'qhlm-address'}, 'Last transaction · ' + lastTx));
    root.replaceChildren(el('section', {class: 'qws-card', 'aria-labelledby': 'qws-h'}, el('h2', {id: 'qws-h'}, 'QWERTY fees'), ...kids),
      el('p', {class: 'qas-status', role: 'status', 'aria-live': 'polite'}, message));
  }
  async function refresh() {
    if (reading || stopped || busy) return;
    reading = true; render();
    try { io.begin?.(); state = await readSplitState(io.rpc); if (message === 'Could not read the network. Reload to try again.') message = ''; }
    catch { message = 'Could not read the network. Reload to try again.'; }
    finally { reading = false; render(); }
  }
  async function send(action) {
    if (busy || reading || stopped || !state) return;
    let conn = hub.snapshot().current;
    if (!stepView(state, conn?.owner).buttons.includes(action)) return;
    let walletOpened = false;
    busy = true; message = 'Preparing your wallet…'; render();
    try {
      const originalOwner = conn.owner;
      if (String(conn.chainId) !== CHAIN_ID) conn = await hub.switchChain(CHAIN_ID);
      if (!same(conn?.owner, originalOwner) || String(conn?.chainId) !== CHAIN_ID) throw Error('Your wallet changed. Try again.');
      const provider = conn.entry?.provider;
      const assertContext = () => {
        const current = hub.snapshot().current;
        if (stopped || !provider?.request || current?.entry?.provider !== provider || !same(current?.owner, originalOwner) || String(current?.chainId) !== CHAIN_ID)
          throw Error('Your wallet changed. Try again.');
        return current;
      };
      conn = assertContext();
      io.begin?.(); state = await readSplitState(io.rpc);
      conn = assertContext();
      if (!stepView(state, conn.owner).buttons.includes(action)) throw Error('This step changed. Review it and try again.');
      const tx = {chainId: '0x' + Number(CHAIN_ID).toString(16), from: originalOwner, to: FACTORY, value: '0x0', data: action === 'collect' ? COLLECT_DATA : SET_PAYOUT_DATA};
      io.begin?.();
      await io.rpc('eth_call', [tx, 'latest']);
      assertContext();
      const estimate = await io.estimate(tx);
      assertContext();
      tx.gas = '0x' + (BigInt(estimate) * 13n / 10n).toString(16);
      // Explicit EIP-1559 fees (the /range page's pattern): base fee x2 plus the wallet's tip, so no wallet guesses a tip above the cap.
      const b = await io.rpc('eth_getBlockByNumber', ['latest', false]).catch(() => null);
      assertContext();
      const tip = BigInt(await provider.request({method: 'eth_maxPriorityFeePerGas'}).catch(() => '0x0'));
      assertContext();
      if (b?.baseFeePerGas) { tx.maxPriorityFeePerGas = '0x' + tip.toString(16); tx.maxFeePerGas = '0x' + (BigInt(b.baseFeePerGas) * 2n + tip).toString(16); }
      const accounts = await provider.request({method: 'eth_accounts'});
      assertContext();
      if (!Array.isArray(accounts) || !same(accounts[0], originalOwner)) throw Error('Your wallet changed. Try again.');
      const providerChain = await provider.request({method: 'eth_chainId'});
      assertContext();
      if (!/^0x[0-9a-f]+$/i.test(providerChain) || BigInt(providerChain) !== BigInt(CHAIN_ID)) throw Error('Your wallet changed. Try again.');
      message = 'Confirm in your wallet'; render(); walletOpened = true;
      assertContext();
      const hash = await provider.request({method: 'eth_sendTransaction', params: [tx]});
      lastTx = hash; message = 'Sent. Waiting for the network…'; render();
      let receipt;
      for (let i = 0; i < 90 && !receipt && !stopped; i++) {
        io.begin?.(); receipt = await io.rpc('eth_getTransactionReceipt', [hash]).catch(() => null);
        if (!receipt) await new Promise(r => setTimeout(r, 2000));
      }
      if (!receipt) throw Error('Still pending. Check your wallet activity, then refresh.');
      if (BigInt(receipt.status) !== 1n) throw Error('The transaction did not complete. Check your wallet activity.');
      message = action === 'collect' ? 'Collected to your wallet.' : 'Confirmed. Checking the result…';
    } catch (e) {
      message = !walletOpened ? (e.message || 'Could not prepare this step.') + ' Nothing was sent.'
        : /reject|denied|cancel/i.test(e.message || '') || e.code === 4001 ? 'Cancelled in your wallet. Nothing was sent.'
        : (e.message || 'Could not confirm this step.') + ' Check your wallet activity, then refresh.';
    } finally {
      busy = false; await refresh();
      if (action === 'point' && stepView(state, hub.snapshot().current?.owner).done) message = 'Done. Read back on chain: your fees now go to the splitter.';
      render();
    }
  }
  const unsubscribe = hub.subscribe(() => render());
  const ready = refresh();
  const timer = pollMs ? setInterval(() => { if (doc.visibilityState !== 'hidden' && !state?.done) refresh(); }, pollMs) : null;
  return {ready, refresh, getState: () => state, dispose() { stopped = true; if (timer) clearInterval(timer); unsubscribe?.(); }};
}

if (typeof document !== 'undefined' && document.getElementById('qws-root')) {
  Promise.all([import('./wallet-hub-fresh.mjs'), import('./qx-taps.mjs'), import('./chains.mjs')]).then(([wallet, reads, chains]) => {
    const client = reads.createReadClient();
    const estimate = async tx => {
      const response = await client.request(chains.chainById(CHAIN_ID).rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_estimateGas', params: [tx]})});
      if (!response.ok) throw Error('Could not estimate network gas.');
      const result = await response.json();
      if (result.error || !/^0x[0-9a-f]+$/i.test(result.result)) throw Error('This transaction would not complete right now.');
      return result.result;
    };
    mountSplitter({document, hub: wallet.getWalletHub(window), io: {...client, rpc: (method, params) => client.rpc(CHAIN_ID, method, params), estimate}});
  }).catch(() => { document.getElementById('qws-root').textContent = 'Could not load this page. Reload to try again.'; });
}
