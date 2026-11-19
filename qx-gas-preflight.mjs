// G4 (2026-11-18, Randall: sells "aren't going through"; 0.0000012 ETH on Robinhood Chain, a swap needs more).
// One shared gas preflight before every buy, sell, approve and unwrap on an EVM chain. Read-only: it never prepares,
// signs or sends, and never changes an amount, a quote or the route. need = gas units × gas price × 1.5, compared with
// the wallet's native balance. Gas units come from eth_estimateGas when the caller has the exact transaction; otherwise
// (or when estimation fails) from a conservative per-action default, and the need is then shown as "≈". The gas price
// is eth_gasPrice; if that read fails too, a conservative per-chain default (also "≈").
import {chainById} from './chains.mjs';
export const GAS_UNITS = Object.freeze({swap: 400000n, sell: 400000n, buy: 400000n, approve: 80000n, unwrap: 60000n});
// Conservative gas prices (wei) for when eth_gasPrice can't be read.
export const FALLBACK_GAS_PRICE = Object.freeze({'4663': 50_000_000n, '8453': 50_000_000n, '42161': 100_000_000n, '1': 20_000_000_000n, '56': 3_000_000_000n, '99901': 1_000_000_000n, '143': 100_000_000_000n});
const DEFAULT_PRICE = 1_000_000_000n;
export function nativeOf(chainId) {
  const c = chainById(String(chainId));
  return {symbol: c?.native || 'ETH', name: c?.name || 'this network', id: String(chainId)};
}
// A short, readable native amount: 0.0000195 → "0.00002", 0.0123 → "0.0123".
export function formatNative(wei, decimals = 18) {
  const v = Number(wei) / 10 ** decimals;
  if (!(v > 0) || !Number.isFinite(v)) return '0';
  const d = Math.min(18, Math.max(0, 1 - Math.floor(Math.log10(v))));
  return (Math.ceil(v * 10 ** d) / 10 ** d).toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
export function gasMessage({chainId, needWei, approx = true}) {
  const n = nativeOf(chainId);
  return 'Not enough ' + n.symbol + ' on ' + n.name + ' for gas (need ' + (approx ? '≈' : '') + formatNative(needWei) + ' ' + n.symbol + ')';
}
const big = v => { try { return BigInt(v); } catch { return null; } };
export async function gasPreflight({chainId, owner, action = 'swap', tx = null, rpc, extraWei = 0n}) {
  const id = String(chainId);
  if (!/^\d+$/.test(id) || !/^0x[0-9a-fA-F]{40}$/.test(String(owner || '')) || typeof rpc !== 'function') return {ok: true, skipped: true};
  const balance = big(await rpc(id, 'eth_getBalance', [owner, 'latest']).catch(() => null));
  if (balance === null) return {ok: true, skipped: true, reason: 'balance_unread'}; // never block on a read we couldn't make
  let approx = false, units = null, price = big(await rpc(id, 'eth_gasPrice', []).catch(() => null));
  if (!price || price <= 0n) { price = FALLBACK_GAS_PRICE[id] ?? DEFAULT_PRICE; approx = true; }
  if (tx) units = big(await rpc(id, 'eth_estimateGas', [{from: owner, ...tx, value: tx.value != null ? '0x' + BigInt(tx.value).toString(16) : undefined}]).catch(() => null));
  if (!units || units <= 0n) { units = GAS_UNITS[action] ?? GAS_UNITS.swap; approx = true; }
  const needWei = (units * price * 3n + 1n) / 2n, have = balance - (big(extraWei) || 0n);
  const ok = have >= needWei;
  return {ok, approx, needWei, haveWei: balance, units, gasPriceWei: price, chainId: id, ...nativeOf(id), message: ok ? '' : gasMessage({chainId: id, needWei, approx})};
}
// "Add gas": QHooks' own Move dialog (Relay) can deliver native gas to every Move chain, to the wallet's own address.
// Outside a Move chain, or if Move can't load, LI.FI's Jumper with the destination prefilled (LI.FI widget URL params:
// toChain, toToken, toAddress; 4663 is listed by li.quest/v1/chains).
export const MOVE_GAS_CHAINS = Object.freeze(['8453', '1', '42161', '56', '4663', '99901', '143']);
export function addGasLink({chainId, owner}) {
  const q = new URLSearchParams({toChain: String(chainId), toToken: '0x0000000000000000000000000000000000000000'});
  if (/^0x[0-9a-fA-F]{40}$/.test(String(owner || ''))) q.set('toAddress', owner);
  return 'https://jumper.xyz/?' + q.toString();
}
export async function openAddGas({chainId, owner, loadMove = () => import('/qx-move-funds.mjs'), open = url => globalThis.open?.(url, '_blank', 'noopener')}) {
  if (MOVE_GAS_CHAINS.includes(String(chainId))) {
    try { const m = await loadMove(); if (m?.openMoveFunds) { await m.openMoveFunds({to: {chainId: Number(chainId), token: 'native'}}); return 'move'; } } catch {}
  }
  open(addGasLink({chainId, owner}));
  return 'external';
}
// The note under a blocked action: the message and a one-tap "Add gas".
export function gasNote(h, result, {owner, onAddGas = openAddGas} = {}) {
  const add = h('a', {class: 'qx-gas-add', href: addGasLink({chainId: result.chainId, owner}), target: '_blank', rel: 'noopener'}, 'Add gas');
  add.addEventListener?.('click', e => { e.preventDefault?.(); void onAddGas({chainId: result.chainId, owner}); });
  return h('p', {class: 'qx-gas-note', role: 'status'}, result.message + ' ', add);
}
// The gate a trade/unwrap button uses. context() gives {chainId, owner, action, extraWei} for the action on screen (null
// when there is none, e.g. Solana or no wallet). check() reads, and when short disables `button` and shows the note in
// `box`; nothing ever opens a wallet prompt. While short, any attempt to re-enable the button is turned back, and the
// balance is re-read on recheck() (wallet change, trade, focus) and every 30 s while visible, at most 20 times.
export function createGasGate({h, button, box, context, rpc, preflight = gasPreflight, onAddGas = openAddGas, onOk = () => {}, schedule = setTimeout, unschedule = clearTimeout, visible = () => globalThis.document?.visibilityState !== 'hidden', MutationObserver: MO = globalThis.MutationObserver}) {
  let short = null, seq = 0, timer = null, polls = 0, applying = false, checkedKey = '', checkedAt = 0;
  const keyOf = c => c ? c.chainId + ':' + String(c.owner).toLowerCase() + ':' + c.action : '';
  const clear = () => { short = null; if (box) { box.hidden = true; box.replaceChildren?.(); } unschedule(timer); timer = null; polls = 0; };
  const hold = () => { if (short && button && !button.disabled) { applying = true; button.disabled = true; applying = false; } };
  const poll = () => { unschedule(timer); timer = null; if (!short || polls >= 20) return; timer = schedule(() => { timer = null; if (visible()) { polls++; void check(); } else poll(); }, 30000); };
  async function check() {
    const c = context(), mine = ++seq;
    if (!c) { clear(); checkedKey = ''; return true; }
    checkedKey = keyOf(c); checkedAt = Date.now();
    const r = await preflight({...c, rpc});
    if (mine !== seq) return !short;
    if (r.ok) { const was = !!short; clear(); if (was) onOk(); return true; }
    short = {...r, key: keyOf(c)};
    if (box) { box.replaceChildren(gasNote(h, r, {owner: c.owner, onAddGas})); box.hidden = false; }
    hold(); poll(); return false;
  }
  // An action that becomes available (button enabled) for a chain/owner/side not checked in the last 15 s is checked.
  const observer = MO && button ? new MO(() => { if (applying) return; const c = context(); if (short && keyOf(c) !== short.key) { clear(); void check(); return; } hold();
    if (!short && !button.disabled && c && (keyOf(c) !== checkedKey || Date.now() - checkedAt > 15000)) void check(); }) : null;
  observer?.observe(button, {attributes: true, attributeFilter: ['disabled']});
  return {check, recheck: () => { polls = 0; return check(); }, short: () => short, dispose() { seq++; unschedule(timer); observer?.disconnect(); }};
}
