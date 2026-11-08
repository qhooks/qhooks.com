// QHOOKS contributor round page (QLaunchRound). Reads the round over the public RPC; writes go through the visitor's
// own wallet. The round address comes only from /data/qhooks-round.json; query overrides (?round=, ?rpc=) are
// honoured on localhost only, so a shared link can't point at another contract.
import {discoverWallets} from './discover-wallets.mjs';

const $ = id => document.getElementById(id);
const E = 10n ** 18n, SUPPLY = 1_000_000_000n * E;
const SEL = {
  deposit: '0xd0e30db0', withdraw: '0x3ccfd60b', claim: '0x4e71d92d', total: '0x2ddbd13a', participants: '0x6c4470fb',
  minTotal: '0x94a66c8e', start: '0xbe9a6555', end: '0xefbe1c1c',
  launchDeadline: '0x701052f4', launched: '0x8091f3bf', roundCancelled: '0xb8fb33c2', token: '0xfc0c546a',
  tokensBought: '0x732783ac', potAtLaunch: '0x52139129', deposited: '0xcb13cddb',
  settled: '0xe660b066', maxBuy: '0x70db69d6', claimable: '0x402914f5', balanceOf: '0x70a08231',
};
const isAddr = a => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
const addrWord = a => a.slice(2).toLowerCase().padStart(64, '0');
const words = hex => (hex || '0x').slice(2).match(/.{64}/g)?.map(w => BigInt('0x' + w)) || [];

let cfg, provider = null, me = null, state = null, busy = false;

async function loadConfig() {
  const c = await fetch('/data/qhooks-round.json', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null) || {};
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const q = new URLSearchParams(location.search);
  if (local && isAddr(q.get('round'))) c.round = q.get('round');
  if (local && /^http:\/\/127\.0\.0\.1:\d+$/.test(q.get('rpc') || '')) c.rpc = q.get('rpc');
  c.chainId = c.chainId || '4663'; c.chainHex = '0x' + Number(c.chainId).toString(16);
  c.rpc = c.rpc || 'https://rpc.mainnet.chain.robinhood.com';
  c.explorer = c.explorer || 'https://robinhoodchain.blockscout.com';
  // The launch curve: the engine's start value for the whole supply (ETH, in wei) and the share kept out of the pool.
  c.startCapWei = BigInt(c.startCapWei || '1666666666666666752');
  c.reserveBps = BigInt(c.reserveBps ?? 3000);
  return c;
}

async function rpc(method, params) {
  const r = await fetch(cfg.rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
}
const read = (to, data) => rpc('eth_call', [{to, data}, 'latest']);
const one = async (name, arg = '') => words(await read(cfg.round, SEL[name] + arg))[0] ?? 0n;

function eth(w, digits = 4) {
  const whole = w / E, frac = (w % E).toString().padStart(18, '0').slice(0, digits).replace(/0+$/, '');
  return whole.toLocaleString('en-US') + (frac ? '.' + frac : '') + ' ETH';
}
const pct = t => (Number(t * 1_000_000n / SUPPLY) / 10_000).toFixed(2) + '%';
const tokens = w => (w / E).toLocaleString('en-US');
const when = t => new Date(Number(t) * 1000).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'}) + ' your time';
function parseEth(s) {
  if (!/^\d*\.?\d*$/.test(s) || !s || s === '.') return null;
  const [a, b = ''] = s.split('.'); if (b.length > 18) return null;
  return BigInt(a || '0') * E + BigInt((b + '0'.repeat(18)).slice(0, 18));
}
// Tokens a first buy of `pot` gets from the single-sided pool: pool × pot / (pot + pool's start value), less ~0.25%
// for fees and tick rounding (measured on the Robinhood rehearsal: 0.5 ETH → 209.49M).
const buyOf = pot => pot > state.maxBuy ? state.maxBuy : pot;
function curveTokens(pot) {
  if (pot <= 0n) return 0n;
  const pool = SUPPLY * (10_000n - cfg.reserveBps) / 10_000n, poolStart = cfg.startCapWei * (10_000n - cfg.reserveBps) / 10_000n;
  return pool * pot / (pot + poolStart) * 9976n / 10_000n;
}

async function readRound() {
  const names = ['total', 'participants', 'minTotal', 'maxBuy', 'start', 'end', 'launchDeadline', 'launched', 'roundCancelled', 'tokensBought', 'potAtLaunch'];
  const vals = await Promise.all(names.map(n => one(n)));
  const s = Object.fromEntries(names.map((n, i) => [n, vals[i]]));
  s.now = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
  return s;
}

function phase(s) {
  if (s.launched) return ['Launched', 'live', 'QHOOKS has launched and the round\'s ETH was its first buy. Claim your QHOOKS.'];
  if (s.roundCancelled) return ['Cancelled', 'cancelled', s.total < s.minTotal && s.now >= s.end ? 'The round closed below its minimum. Everyone can take their ETH back.' : 'The round was called off or the launch did not happen in time. Everyone can take their ETH back.'];
  if (s.now >= s.end) return ['Closed, launching soon', 'waiting', 'The round has closed. At launch, all of its ETH is the first buy, in the launch transaction itself.'];
  if (s.now < s.start) return ['Opens soon', 'waiting', 'The round opens at ' + when(s.start) + '.'];
  return ['Open', 'live', 'Open until ' + when(s.end) + '. You can take your ETH back in full until then.'];
}

function render() {
  const s = state; if (!s) return;
  const [label, tone, line] = phase(s);
  $('cr-state').textContent = label; $('cr-state').dataset.tone = tone; $('cr-status-line').textContent = line;
  $('cr-raised').textContent = eth(s.launched ? s.potAtLaunch : s.total, 3);
  $('cr-raised-of').textContent = 'group buy ' + eth(s.maxBuy, 3) + ' · minimum ' + eth(s.minTotal, 3);
  const pot = s.launched ? s.potAtLaunch : s.total;
  $('cr-price').textContent = s.launched ? pct(s.tokensBought) : pot ? 'about ' + pct(curveTokens(buyOf(pot))) : 'about ' + pct(curveTokens(s.maxBuy)) + ' at ' + eth(s.maxBuy, 2);
  $('cr-people').textContent = String(s.participants); $('cr-people-of').textContent = 'wallets in';
  const open = s.now < s.end;
  $('cr-when-label').textContent = s.now < s.start ? 'Opens' : open ? 'Closes' : 'Launch deadline';
  $('cr-when').textContent = when(s.now < s.start ? s.start : open ? s.end : s.launchDeadline);
  $('cr-when-sub').textContent = open ? '' : s.launched || s.roundCancelled ? 'no longer needed' : 'full refunds if no launch by then';
  $('cr-bar-fill').parentElement.hidden = true;
  $('cr-deposit-panel').hidden = !(open && s.now >= s.start && !s.roundCancelled && !s.launched);
  $('cr-deposit-go').disabled = busy || !me;
  preview(); renderMine();
}

function renderMine() {
  const m = state?.mine, s = state;
  $('cr-mine').hidden = !m; $('cr-actions').hidden = !m;
  if (!me || !m) return;
  // Say plainly which wallet is connected and whether it is the one that sent ETH to the round.
  $('cr-who').textContent = 'Connected: ' + (walletName ? walletName + ' · ' : '') + short(me) + (m.deposited > 0n ? ' · this wallet sent ' + eth(m.deposited) + ' to the round.' : ' · this wallet didn’t send to the round. If you sent from another wallet, connect that one.');
  $('cr-dep').textContent = eth(m.deposited);
  const pot = s.launched ? s.potAtLaunch : s.total;
  let t = 0n, sub = '';
  if (s.launched) { t = s.potAtLaunch ? s.tokensBought * m.deposited / s.potAtLaunch : 0n; sub = m.settled ? 'claimed' : 'claimable now'; }
  else if (!s.roundCancelled && m.deposited && pot) { t = curveTokens(buyOf(pot)) * m.deposited / pot; sub = 'about, if it launched with ' + eth(pot, 3) + ' in' + (pot > s.maxBuy ? '; about ' + eth((pot - s.maxBuy) * m.deposited / pot) + ' comes back' : ''); }
  $('cr-tokens').textContent = tokens(t) + (t ? ' (' + pct(t) + ')' : ''); $('cr-tokens-sub').textContent = sub;
  $('cr-refund').textContent = eth(m.claimEth);
  $('cr-claim').hidden = !(m.claimTokens > 0n);
  $('cr-claim-refund').hidden = !(m.claimTokens === 0n && m.claimEth > 0n);
  $('cr-unwrap').hidden = true;
  $('cr-cancel').hidden = !(m.deposited > 0n && s.now < s.end && !s.roundCancelled && !s.launched);
  for (const id of ['cr-claim', 'cr-claim-refund', 'cr-cancel']) $(id).disabled = busy;
}
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
function preview() {
  const s = state, amt = parseEth($('cr-amount').value.trim());
  if (!s) return;
  if (!amt) { $('cr-preview').textContent = 'Everyone\'s ETH together is the first buy at launch. You get your share of what it buys.'; return; }
  const mine = (state.mine?.deposited || 0n) + amt, pot = s.total + amt;
  let text = 'About ' + pct(curveTokens(buyOf(pot)) * mine / pot) + ' of the supply for your ' + eth(mine) + ', if the round launched with ' + eth(pot, 3) + ' in it.';
  if (pot > s.maxBuy) text += ' The group buy stops at ' + eth(s.maxBuy, 2) + ', so about ' + eth((pot - s.maxBuy) * mine / pot) + ' of yours would come back.';
  $('cr-preview').textContent = text;
}

async function readMine() {
  if (!me || !state) return;
  const a = addrWord(me);
  const [deposited, settled, c] = await Promise.all([one('deposited', a), one('settled', a), read(cfg.round, SEL.claimable + a)]);
  const [claimTokens = 0n, claimEth = 0n] = words(c);
  state.mine = {deposited, settled: settled === 1n, claimTokens, claimEth};
}

async function refresh() {
  if (!cfg.round) return;
  try { state = {...await readRound(), mine: state?.mine}; await readMine(); render(); }
  catch (e) { $('cr-status-line').textContent = 'Couldn\u2019t load the round. Refresh to try again.'; }
}

async function ensureChain() {
  const id = await provider.request({method: 'eth_chainId'});
  if (id?.toLowerCase() === cfg.chainHex) return;
  try { await provider.request({method: 'wallet_switchEthereumChain', params: [{chainId: cfg.chainHex}]}); }
  catch (e) {
    if (e?.code !== 4902) throw e;
    await provider.request({method: 'wallet_addEthereumChain', params: [{chainId: cfg.chainHex, chainName: 'Robinhood Chain', nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18}, rpcUrls: [cfg.rpc], blockExplorerUrls: [cfg.explorer]}]});
  }
}

async function sendTx(data, value, statusEl, label) {
  busy = true; render();
  try {
    await ensureChain();
    statusEl.textContent = label + ': confirm in your wallet…';
    // Same fee rule as the rest of the site (qx-chain.mjs): twice the base fee plus the wallet's tip.
    const tx = {from: me, to: cfg.round, data, value: '0x' + value.toString(16)};
    const [block, tip] = await Promise.all([rpc('eth_getBlockByNumber', ['latest', false]), provider.request({method: 'eth_maxPriorityFeePerGas'}).catch(() => '0x0')]);
    if (block?.baseFeePerGas) { const t = BigInt(tip || 0); tx.maxPriorityFeePerGas = '0x' + t.toString(16); tx.maxFeePerGas = '0x' + (BigInt(block.baseFeePerGas) * 2n + t).toString(16); }
    const hash = await provider.request({method: 'eth_sendTransaction', params: [tx]});
    statusEl.textContent = label + ': waiting for the network…';
    let r; for (let i = 0; i < 120 && !(r = await rpc('eth_getTransactionReceipt', [hash])); i++) await new Promise(s => setTimeout(s, 1000));
    statusEl.textContent = !r ? label + ': sent, still waiting. Check ' + cfg.explorer + '/tx/' + hash : r.status === '0x1' ? label + ': done.' : label + ': the network refused it. Nothing moved.';
  } catch (e) { statusEl.textContent = label + ': ' + (e?.code === 4001 ? 'cancelled in the wallet.' : e?.message || 'failed.'); }
  busy = false; await refresh();
}

function connect() {
  const box = $('cr-wallets'); box.hidden = false; box.textContent = 'Looking for wallets…';
  const found = [];
  const d = discoverWallets(window, list => {
    found.splice(0, found.length, ...list); box.textContent = '';
    for (const w of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cr-button'; b.textContent = w.name;
      b.onclick = async () => { d.stop(); walletName = w.name; await use(w.provider); };
      box.append(b);
    }
  });
  setTimeout(async () => {
    if (found.length) return;
    if (window.ethereum?.request) { d.stop(); await use(window.ethereum); }
    else box.textContent = 'No browser wallet found. On a phone, open this page inside your wallet app’s browser (MetaMask, Rabby, Coinbase Wallet). QHooks email wallets and WalletConnect don’t work on this page yet.';
  }, 600);
}
let walletName = '';
async function use(p) {
  provider = p; $('cr-wallets').hidden = true;
  try {
    const [a] = await provider.request({method: 'eth_requestAccounts'});
    me = a; $('cr-connect').textContent = short(a);
    provider.on?.('accountsChanged', x => { me = x?.[0] || null; refresh(); });
    await refresh();
  } catch (e) { $('cr-who').textContent = 'Wallet: ' + (e?.message || 'not connected'); }
}

async function main() {
  cfg = await loadConfig();
  if (!cfg.round) {
    $('cr-state').textContent = 'Not open yet'; $('cr-state').dataset.tone = 'waiting';
    $('cr-status-line').textContent = 'The round contract is not published yet. This page will show it once it is.';
    $('cr-deposit-panel').hidden = true; $('cr-connect').disabled = true; return;
  }
  const link = document.createElement('a'); link.href = cfg.explorer + '/address/' + cfg.round; link.textContent = 'Round contract ' + cfg.round; link.rel = 'noopener';
  $('cr-contract').append(link);
  $('cr-send-address').textContent = cfg.round;
  $('cr-send').hidden = false;
  $('cr-copy').onclick = async () => { try { await navigator.clipboard.writeText(cfg.round); $('cr-copy').textContent = 'Copied'; } catch { $('cr-copy').textContent = 'Copy failed'; } setTimeout(() => { $('cr-copy').textContent = 'Copy address'; }, 1500); };
  $('cr-connect').onclick = connect;
  $('cr-amount').oninput = preview;
  $('cr-deposit').onsubmit = e => {
    e.preventDefault(); const amt = parseEth($('cr-amount').value.trim());
    if (!amt) { $('cr-deposit-status').textContent = 'Enter an amount in ETH.'; return; }
    sendTx(SEL.deposit, amt, $('cr-deposit-status'), 'Put in ' + eth(amt));
  };
  $('cr-claim').onclick = () => sendTx(SEL.claim, 0n, $('cr-action-status'), 'Claim QHOOKS');
  $('cr-claim-refund').onclick = () => sendTx(SEL.claim, 0n, $('cr-action-status'), 'Take ETH back');
  $('cr-cancel').onclick = () => { if (confirm('Take your whole deposit back and leave the round?')) sendTx(SEL.withdraw, 0n, $('cr-action-status'), 'Take ETH back'); };
  await refresh();
  setInterval(() => { if (!busy) refresh(); }, 15000);
}
main();
