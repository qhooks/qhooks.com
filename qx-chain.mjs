// Shared chain plumbing for the Trade page's extra panels (Buy with ETH, limit orders, team locks):
// public-RPC reads, a small ABI codec, the pool's live key, and wallet sends with chain switching.
import { chainMap } from '/chains.mjs';
import { silentActive } from '/qx-instant-bridge.mjs';
// Every built chain from the registry (chains.mjs); pages decide which ones to show.
export const RPC = chainMap(c => c.rpc);
export const CHAIN_NAME = chainMap(c => c.name);
export const NATIVE = chainMap(c => c.native);
export const QUOTER = chainMap(c => c.contracts.quoter);
export const MANAGER = chainMap(c => c.contracts.manager);

// ---- ABI codec: address, bool, uint<N>, int<N>, bytes32, bytes, string, T[], tuples "(a,b)". ----
const W = 64;
const pad = h => h.padStart(W, '0');
function splitTypes(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const isArray = t => t.endsWith('[]');
const isTuple = t => t.startsWith('(');
const tupleTypes = t => splitTypes(t.slice(1, -1));
function dynamic(t) { return t === 'bytes' || t === 'string' || isArray(t) || (isTuple(t) && tupleTypes(t).some(dynamic)); }
// Head size in bytes: static tuples sit inline, so they take one word per member.
function headSize(t) { return !dynamic(t) && isTuple(t) ? tupleTypes(t).reduce((n, x) => n + headSize(x), 0) : 32; }
function word(t, v) {
  if (t === 'address') { const h = String(v).toLowerCase().replace(/^0x/, ''); if (!/^[0-9a-f]{40}$/.test(h)) throw new TypeError('Bad address'); return pad(h); }
  if (t === 'bool') return pad(v ? '1' : '0');
  if (t === 'bytes32') { const h = String(v).replace(/^0x/, ''); if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new TypeError('Bad bytes32'); return h.toLowerCase(); }
  const m = /^(u?)int(\d*)$/.exec(t); if (!m) throw new TypeError('Unsupported type ' + t);
  let n = BigInt(v); const bits = BigInt(m[2] || 256);
  if (m[1]) { if (n < 0n || n >= 1n << bits) throw new RangeError(t + ' out of range'); }
  else { if (n < -(1n << (bits - 1n)) || n >= 1n << (bits - 1n)) throw new RangeError(t + ' out of range'); if (n < 0n) n = (1n << 256n) + n; }
  return pad(n.toString(16));
}
function encodeOne(t, v) {
  if (t === 'bytes' || t === 'string') {
    const hex = t === 'string' ? Array.from(new TextEncoder().encode(v), b => b.toString(16).padStart(2, '0')).join('') : String(v).replace(/^0x/, '');
    return pad((hex.length / 2).toString(16)) + hex.padEnd(Math.ceil(hex.length / W) * W, '0');
  }
  if (isArray(t)) return pad(v.length.toString(16)) + encodeList(v.map(() => t.slice(0, -2)), v);
  if (isTuple(t)) return encodeList(tupleTypes(t), v);
  return word(t, v);
}
function encodeList(types, values) {
  if (types.length !== values.length) throw new TypeError('ABI arity');
  const heads = [], tails = []; let offset = types.reduce((n, t) => n + headSize(t), 0);
  types.forEach((t, i) => {
    const enc = encodeOne(t, values[i]);
    if (dynamic(t)) { heads.push(pad(offset.toString(16))); tails.push(enc); offset += enc.length / 2; } else heads.push(enc);
  });
  return heads.join('') + tails.join('');
}
export const abi = (types, values) => '0x' + encodeList(types, values);
export const calldata = (selector, types = [], values = []) => selector + encodeList(types, values);
// Decoding of static heads plus one level of dynamic arrays of static words, which is all the panels read.
export const words = hex => { const h = hex.replace(/^0x/, ''); return Array.from({ length: h.length / W }, (_, i) => BigInt('0x' + h.slice(i * W, (i + 1) * W))); };
export const toAddress = n => '0x' + BigInt(n).toString(16).padStart(40, '0');
export function uintArray(hex, at = 0) {
  const w = words(hex), start = Number(w[at] / 32n), len = Number(w[start]);
  return w.slice(start + 1, start + 1 + len);
}

// ---- Reads ----
export async function rpc(chainId, method, params) {
  const r = await fetch(RPC[chainId], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message || 'RPC error'); return j.result;
}
export const ethCall = (chainId, to, data, from) => rpc(chainId, 'eth_call', [{ to, data, ...(from ? { from } : {}) }, 'latest']);
export const codeAt = (chainId, a) => rpc(chainId, 'eth_getCode', [a, 'latest']);
export async function erc20(chainId, token, owner) {
  const [bal, dec, sym] = await Promise.all([
    owner ? ethCall(chainId, token, calldata('0x70a08231', ['address'], [owner])) : '0x0',
    ethCall(chainId, token, '0x313ce567'), ethCall(chainId, token, '0x95d89b41')]);
  return { balance: BigInt(bal), decimals: Number(BigInt(dec)), symbol: decodeString(sym) };
}
export function decodeString(hex) {
  try { const w = words(hex); const len = Number(w[1]); const h = hex.slice(2 + 128, 2 + 128 + len * 2); return new TextDecoder().decode(Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16))); } catch { return ''; }
}

/// The pool a launch currently trades in: the graduated destination once it holds liquidity, else the source.
export async function livePoolKey(chainId, controller) {
  const read = async sel => words(await ethCall(chainId, controller, sel));
  let w = await read('0xb269681d'); // destination()
  if (w[9] === 0n) w = await read('0x67e828bf'); // source()
  const toInt24 = n => (n >= 1n << 255n ? n - (1n << 256n) : n);
  return { currency0: toAddress(w[0]), currency1: toAddress(w[1]), fee: Number(w[2]), tickSpacing: Number(toInt24(w[3])), hooks: toAddress(w[4]) };
}
export const keyTuple = k => [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks];
export const KEY_T = '(address,address,uint24,int24,address)';

/// What selling one whole token returns right now, through the pool and its hook (fees and charges included).
export async function spotQuote(chainId, key, token, decimals, from) {
  const zeroForOne = key.currency0 === token;
  const r = await ethCall(chainId, QUOTER[chainId], calldata('0xaa9d21cb', [`(${KEY_T},bool,uint128,bytes)`], [[keyTuple(key), zeroForOne, 10n ** BigInt(decimals), '0x']]), from);
  return BigInt(r.slice(0, 66));
}
export function sqrtBig(n) { if (n < 2n) return n; let x = n, y = (x + 1n) >> 1n; while (y < x) { x = y; y = (x + n / x) >> 1n; } return x; }

// ---- Units ----
export function parseUnits(text, decimals) {
  const s = String(text).trim(); if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') throw new TypeError('Enter an amount');
  const [i, f = ''] = s.split('.'); if (f.length > decimals) throw new TypeError('Too many decimals');
  return BigInt(i || '0') * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
export function formatUnits(n, decimals, max = 6) {
  const neg = n < 0n; if (neg) n = -n; const base = 10n ** BigInt(decimals);
  const i = n / base; let f = (n % base).toString().padStart(decimals, '0').slice(0, max).replace(/0+$/, '');
  return (neg ? '-' : '') + i.toLocaleString('en-US') + (f ? '.' + f : '');
}

// ---- Wallet ----
const announced = new Map();
try {
  window.addEventListener('eip6963:announceProvider', e => { const p = e.detail; if (p?.info?.uuid && p.provider) announced.set(p.info.uuid, p); });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
} catch {}
// Trade shows its wallet in #qt-connection, Studio in #ql-connection ("Base · 0x…").
const connectionLine = () => document.getElementById('qt-connection') || document.getElementById('ql-connection');
/// The address the page connected, read from its status line.
export function connectedAddress() {
  const m = (connectionLine()?.textContent || '').match(/0x[0-9a-fA-F]{40}/);
  return m ? m[0].toLowerCase() : null;
}
/// Calls `cb` when the page's connected address changes.
export function onWalletChange(cb) {
  let last = connectedAddress();
  const el = connectionLine(); if (!el) return;
  new MutationObserver(() => { const now = connectedAddress(); if (now !== last) { last = now; cb(now); } }).observe(el, { childList: true, subtree: true, characterData: true });
}
async function providerFor(address) {
  const list = [...announced.values()].map(p => p.provider);
  if (window.ethereum && !list.includes(window.ethereum)) list.push(window.ethereum);
  for (const p of list) {
    try { const accts = await p.request({ method: 'eth_accounts' }); if (accts.map(a => a.toLowerCase()).includes(address)) return p; } catch {}
  }
  throw new Error('Connect the same wallet in the Your wallet panel first');
}
/// Switches the wallet to `chainId` when it is elsewhere. Wallets report a network change as a new connection,
/// so the page is told first (qhooks:chain-switch) and can rejoin the same wallet afterwards.
async function onChain(p,chainId,onStatus=()=>{},assertContext=()=>{}){
  const hexChain = '0x' + Number(chainId).toString(16);
  const activeChain=await p.request({method:'eth_chainId'});assertContext();
  if(activeChain.toLowerCase()===hexChain)return;
  onStatus((silentActive() ? 'Switching to ' : 'Switching your wallet to ') + CHAIN_NAME[chainId] + '…');
  window.dispatchEvent(new CustomEvent('qhooks:chain-switch', { detail: { chainId: String(chainId) } }));
  assertContext();await p.request({method:'wallet_switchEthereumChain',params:[{chainId:hexChain}]});assertContext();
}
/// Sends one transaction from the connected wallet on the pool's chain and waits for its receipt.
export async function send(chainId,tx,onStatus=()=>{},assertContext=()=>{}){
  assertContext();const from=connectedAddress();if(!from)throw Error('Connect your wallet first');
  const assert=()=>{assertContext();if(connectedAddress()!==from)throw Error('Your wallet changed. Review this action again.');};assert();
  const p=await providerFor(from);assert();
  await onChain(p,chainId,onStatus,assert);assert();
  // Explicit EIP-1559 fees (twice the base fee plus the wallet's tip) so no wallet pairs a tip above its own cap.
  const fees = {};
  try {
    const [block, tip] = await Promise.all([rpc(chainId, 'eth_getBlockByNumber', ['latest', false]), p.request({ method: 'eth_maxPriorityFeePerGas' }).catch(() => '0x0')]);
    if (block?.baseFeePerGas) { const t = BigInt(tip || 0); fees.maxPriorityFeePerGas = '0x' + t.toString(16); fees.maxFeePerGas = '0x' + (BigInt(block.baseFeePerGas) * 2n + t).toString(16); }
  } catch {}
  assert();
  // Hooks whose cost depends on the block (decaying fees, clocks, per-block caps) can outrun a wallet's own
  // estimate, so the gas limit carries 30% headroom over a fresh estimate. Unused gas is not charged.
  const value = '0x' + BigInt(tx.value || 0).toString(16);
  try { const est = BigInt(await rpc(chainId, 'eth_estimateGas', [{ from, to: tx.to, data: tx.data, value }])); fees.gas = '0x' + (est * 13n / 10n).toString(16); } catch {}
  assert();onStatus(silentActive() ? 'Sending…' : 'Confirm in your wallet…');
  assert();const hash = await p.request({ method: 'eth_sendTransaction', params: [{ from, to: tx.to, data: tx.data, value, ...fees }] });
  onStatus('Waiting for the transaction…');
  for (let i = 0; i < 180; i++) {
    const r = await rpc(chainId, 'eth_getTransactionReceipt', [hash]).catch(() => null);
    if (r) { if (r.status !== '0x1') throw new Error('The transaction reverted'); return r; }
    await new Promise(res => setTimeout(res, 2000));
  }
  throw new Error('Still pending. Check your wallet activity');
}
/// Signs EIP-712 typed data with the connected wallet on `chainId` (switching the wallet's chain first).
export async function signTypedData(chainId, typed) {
  const from = connectedAddress(); if (!from) throw new Error('Connect your wallet first');
  const p = await providerFor(from), hexChain = '0x' + Number(chainId).toString(16);
  await onChain(p, chainId);
  return p.request({ method: 'eth_signTypedData_v4', params: [from, JSON.stringify(typed)] });
}
/// Signs a plain-text message (EIP-191 personal_sign) with the connected wallet: no transaction, no fee, no network switch.
const messageHex=text=>'0x'+Array.from(new TextEncoder().encode(text),b=>b.toString(16).padStart(2,'0')).join('');
// Hub pages use the hub's existing provider, without a second discovery or
// permission path. The same embedded/phone facade still owns signing behavior.
export function captureMessageWallet(getConnection) {
  const captured=getConnection?.(),from=captured?.owner?.toLowerCase(),provider=captured?.entry?.provider,chain=String(captured?.chainId||'');
  if(!/^0x[0-9a-f]{40}$/.test(from||'')||!provider?.request||!/^\d+$/.test(chain))throw Error('Connect a wallet first');
  const changed=()=>Error('Your wallet changed. Review and sign in again.');
  function assertCurrent(){const current=getConnection();if(current?.owner?.toLowerCase()!==from||current?.entry?.provider!==provider||String(current?.chainId)!==chain)throw changed();}
  async function check(){assertCurrent();const[accounts,id]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);assertCurrent();if(accounts?.[0]?.toLowerCase()!==from||BigInt(id).toString()!==chain)throw changed();}
  return Object.freeze({owner:from,assertCurrent,check,async sign(text){await check();const signature=await provider.request({method:'personal_sign',params:[messageHex(text),from]});await check();return signature;}});
}
export async function signMessage(text,{getConnection}={}) {
  if(getConnection)return captureMessageWallet(getConnection).sign(text);
  const from=connectedAddress();if(!from)throw Error('Connect your wallet first');
  const p=await providerFor(from);return p.request({method:'personal_sign',params:[messageHex(text),from]});
}
/// Approves `spender` for exactly `amount` when the current allowance is lower.
export async function ensureAllowance(chainId,token,spender,amount,onStatus,assertContext=()=>{}){
  assertContext();const owner=connectedAddress();if(!owner)throw Error('Connect your wallet first');
  const assert=()=>{assertContext();if(connectedAddress()!==owner)throw Error('Your wallet changed. Review this action again.');};assert();
  const current = BigInt(await ethCall(chainId, token, calldata('0xdd62ed3e', ['address', 'address'], [owner, spender])));
  assert();if(current>=amount)return;
  onStatus?.(silentActive() ? 'Approving…' : 'Approve the token in your wallet…');
  await send(chainId, { to: token, data: calldata('0x095ea7b3', ['address', 'uint256'], [spender, amount]) },onStatus,assert);assert();
}

// ---- Small DOM helper shared by the panels ----
export const h = (t, a = {}, ...k) => { const n = document.createElement(t); for (const [key, v] of Object.entries(a)) { if (key === 'class') n.className = v; else if (key.startsWith('on')) n.addEventListener(key.slice(2), v); else if (key in n) n[key] = v; else n.setAttribute(key, v); } n.append(...k.flat().filter(x => x != null && x !== false)); return n; };
