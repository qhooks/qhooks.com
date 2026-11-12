import {requireBannerHash} from './qx-token-banner.mjs';
// Sale-first launches (QSaleLaunch): calldata, decoding and the plain-language plan, shared by /create, the sale page,
// the terminal banner and tests. No network and no wallet here.
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';
import {abiEncode} from './full-launch/packages/launchpad/abi-encode.mjs';
import {chainById} from './chains.mjs';
import {assertStartPrice,impliedStartCap,START_PRICE_HOLD} from './qx-guided-start-core.mjs';

export const SALE_TOKENS = 500_000_000n * 10n ** 18n;
export const SUPPLY = 1_000_000_000n * 10n ** 18n;
export const MIN_RAISE = 10n ** 12n;
export const MIN_PRICE = 1000n, MAX_PRICE = 10n ** 27n;
export const META_LIMIT = 4096;
export const STATES = ['upcoming', 'live', 'closed', 'failed', 'settled'];
export const WINDOWS = [[3600, '1 hour'], [6 * 3600, '6 hours'], [24 * 3600, '24 hours'], [3 * 86400, '3 days'], [7 * 86400, '7 days']];
export const START_MULTIPLES = [2, 4, 10];

const enc = new TextEncoder();
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const sel = sig => '0x' + hex(keccak_256(enc.encode(sig))).slice(0, 8);
export const topic = sig => '0x' + hex(keccak_256(enc.encode(sig)));
const PARAMS = '(string,string,string,uint8,uint24,bytes32,uint128,uint128,uint128,uint128,uint64,uint64)';
export const SEL = {
  createSale: sel('createSale(' + PARAMS + ')'),
  commit: sel('commit(uint256)'), settle: sel('settle(uint256)'), claim: sel('claim(uint256,address)'), refund: sel('refund(uint256,address)'),
  stateOf: sel('stateOf(uint256)'), priceNow: sel('priceNow(uint256)'), clearPrice: sel('clearPrice(uint256)'), allocation: sel('allocation(uint256,address)'),
  saleOf: sel('saleOf(uint256)'), saleCount: sel('saleCount()'), launchFee: sel('chain()'), predictToken: sel('predictToken(address,bytes32)')
};
export const SALE_CREATED = topic('SaleCreated(uint256,address,address,string,string,string,uint8,uint24,uint128,uint128,uint128,uint128,uint128,uint64,uint64)');

const word = v => BigInt(v).toString(16).padStart(64, '0');
const addrWord = a => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

/// The chain's QSaleLaunch address (chains.mjs saleLaunch), or null.
export function saleAddress(chainId) {
  const a = chainById(String(chainId))?.saleLaunch?.address;
  return typeof a === 'string' && /^0x[0-9a-f]{40}$/.test(a) ? a : null;
}

/// Coin amount typed by a person ("0.5") to wei.
export function toWei(text, decimals = 18) {
  const s = String(text ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(s)) throw new TypeError('Enter an amount like 0.5');
  const [w, f = ''] = s.split('.');
  if (f.length > decimals) throw new TypeError('Too many decimals.');
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
export function fromWei(v, digits = 6) {
  const n = BigInt(v), w = n / 10n ** 18n, f = (n % 10n ** 18n).toString().padStart(18, '0').slice(0, digits).replace(/0+$/, '');
  return w.toString() + (f ? '.' + f : '');
}

/// Plain inputs → QSaleLaunch.SaleParams. Fixed: `raise` is the most it raises (all 500M sale tokens sold), at one price.
/// Falling: `raise` is what selling every sale token at the floor would raise; the price starts at `multiple` × the floor,
/// so the most it can raise is multiple × raise.
export function salePrices({style = 'fixed', raise, pricePerMillion, multiple = 4}) {
  const mult = style === 'falling' ? BigInt(multiple) : 1n;
  if (style === 'falling' && !START_MULTIPLES.includes(Number(multiple))) throw new TypeError('Pick a starting price.');
  const typed = pricePerMillion !== undefined;
  const floorPrice = typed ? toWei(pricePerMillion) / (10n ** 6n * mult) : toWei(raise) * 10n ** 18n / SALE_TOKENS;
  const price = typed ? toWei(pricePerMillion) / 10n ** 6n : floorPrice * mult;
  if (floorPrice < MIN_PRICE) throw new TypeError('The price is too small for a 500M token sale.');
  if (price > MAX_PRICE) throw new TypeError('The price is too large.');
  return {price, floorPrice: style === 'falling' ? floorPrice : 0n, hardCap: SALE_TOKENS * price / 10n ** 18n};
}

// QSaleLaunch takes native coin (18 decimals). A factory's tier quote may have 6 or 18 decimals;
// readFactoryStart converts that quote to USD before it reaches this native-coin conversion.
export function salePriceForCap({capUsd, paymentUsd}) {
  if (!(capUsd > 0) || !Number.isFinite(capUsd) || !(paymentUsd > 0) || !Number.isFinite(paymentUsd)) throw new TypeError(START_PRICE_HOLD);
  const raw = Math.round(capUsd / paymentUsd * 1e9);
  if (!Number.isFinite(raw)) throw new TypeError(START_PRICE_HOLD);
  const price = BigInt(raw);
  if (price < MIN_PRICE || price > MAX_PRICE) throw new TypeError(START_PRICE_HOLD);
  assertStartPrice({price, totalSupply: SUPPLY, quoteDecimals: 18, quoteUsd: paymentUsd, selectedCapUsd: capUsd});
  return price;
}
export const impliedSaleCap = (price, paymentUsd, totalSupply = SUPPLY) => impliedStartCap({price, totalSupply, quoteDecimals: 18, quoteUsd: paymentUsd});
export function saleCapText(price, paymentUsd, totalSupply = SUPPLY) {
  try {
    const cap = impliedSaleCap(price, paymentUsd, totalSupply);
    if (!Number.isFinite(cap) || !(cap > 0)) throw Error();
    return '≈ $' + new Intl.NumberFormat('en-US', {maximumFractionDigits: 2}).format(cap) + ' market cap at this price';
  } catch { return 'No market cap to show yet.'; }
}
// Read the price that will actually be signed, not just the form's plan.
export function assertSaleStart({data, selectedCapUsd, paymentUsd}) {
  try {
    if (typeof data !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(data) || data.slice(0, 10) !== SEL.createSale) throw Error();
    const body = data.slice(10), at = i => { const h = body.slice(i * 64, (i + 1) * 64); if (h.length !== 64) throw Error(); return BigInt('0x' + h); };
    if (at(0) !== 32n) throw Error();
    const mode = at(4), price = at(7), floor = at(8);
    if (mode > 1n || price < MIN_PRICE || price > MAX_PRICE || (mode === 0n ? floor !== 0n : floor < MIN_PRICE || floor > price)) throw Error();
    return assertStartPrice({price, totalSupply: SUPPLY, quoteDecimals: 18, quoteUsd: paymentUsd, selectedCapUsd});
  } catch { throw new TypeError(START_PRICE_HOLD); }
}

export function planSale({name, symbol, image = '', banner = '', description = '', style = 'fixed', raise, pricePerMillion, minimum, window = 86400, walletCap = '', multiple = 4, fee = 10000, salt, start = 0}) {
  const n = String(name ?? '').trim(), s = String(symbol ?? '').trim().toUpperCase();
  if (!n || new TextEncoder().encode(n).length > 64) throw new TypeError('Enter a token name (up to 64 characters).');
  if (!/^[A-Z0-9]{1,10}$/.test(s)) throw new TypeError('Enter a ticker of 1–10 letters or digits.');
  if (!image) throw new TypeError('Add an image for your token.');
  requireBannerHash(banner);
  const minWei = toWei(minimum), {price, floorPrice, hardCap} = salePrices({style, raise, pricePerMillion, multiple});
  if (minWei < MIN_RAISE) throw new TypeError('Set a minimum above zero.');
  if (minWei > hardCap) throw new TypeError('The minimum can’t be more than the sale can raise.');
  const cap = String(walletCap ?? '').trim() ? toWei(walletCap) : 0n;
  if (cap !== 0n && cap * 10n < minWei / 10n) throw new TypeError('That wallet limit is very low; raise it or leave it empty.');
  if (!WINDOWS.some(([w]) => w === Number(window))) throw new TypeError('Pick how long the sale runs.');
  const meta = JSON.stringify({image,banner, ...(description ? {description: String(description).slice(0, 280)} : {}), launchedFrom: 'qhooks.com', sale: style});
  if (enc.encode(meta).length > META_LIMIT) throw new TypeError('The image is too large to store. Try a simpler one.');
  if (!/^0x[0-9a-f]{64}$/.test(salt || '')) throw new TypeError('Missing salt.');
  return {name: n, symbol: s, meta, mode: style === 'falling' ? 1 : 0, fee, salt, price, floorPrice: style === 'falling' ? floorPrice : 0n,
    softCap: minWei, walletCap: cap, start: BigInt(start), duration: BigInt(window), hardCap};
}

export function encodeCreateSale(p) {
  const tuple = abiEncode(['string', 'string', 'string', 'uint8', 'uint24', 'bytes32', 'uint128', 'uint128', 'uint128', 'uint128', 'uint64', 'uint64'],
    [p.name, p.symbol, p.meta, String(p.mode), String(p.fee), p.salt, String(p.price), String(p.floorPrice), String(p.softCap), String(p.walletCap), String(p.start), String(p.duration)]);
  return SEL.createSale + word(32) + tuple.slice(2);
}
export const encodeCommit = id => SEL.commit + word(id);
export const encodeSettle = id => SEL.settle + word(id);
export const encodeClaim = (id, who) => SEL.claim + word(id) + addrWord(who);
export const encodeRefund = (id, who) => SEL.refund + word(id) + addrWord(who);
export const encodeAllocation = (id, who) => SEL.allocation + word(id) + addrWord(who);

const W = h => Array.from({length: Math.floor((h.length - 2) / 64)}, (_, i) => BigInt('0x' + h.slice(2 + i * 64, 66 + i * 64)));
const A = n => '0x' + BigInt(n).toString(16).padStart(40, '0');
function str(h, at) {
  const o = 2 + at * 2, n = Number(BigInt('0x' + h.slice(o, o + 64)));
  return new TextDecoder().decode(Uint8Array.from((h.slice(o + 64, o + 64 + n * 2).match(/../g) || []).map(x => parseInt(x, 16))));
}
/// saleOf(uint256) return data → the sale record.
export function decodeSale(h) {
  const w = W(h), base = Number(w[0]), f = w.slice(base / 32);
  const at = i => base + Number(f[i]);
  return {creator: A(f[0]), payout: A(f[1]), mode: Number(f[2]), style: Number(f[2]) === 1 ? 'falling' : 'fixed', fee: Number(f[3]), settled: f[4] === 1n, failed: f[5] === 1n,
    tokenIs0: f[6] === 1n, start: Number(f[7]), end: Number(f[8]), price: f[9], floorPrice: f[10], softCap: f[11], walletCap: f[12], raised: f[13], clearPrice: f[14],
    sold: f[15], buyers: Number(f[16]), token: A(f[17]), salt: '0x' + f[18].toString(16).padStart(64, '0'), poolId: '0x' + f[19].toString(16).padStart(64, '0'),
    name: str(h, at(20)), symbol: str(h, at(21))};
}

/// Price at a moment (seconds), as the contract computes it.
export function priceAt(s, t) {
  if (s.mode === 0 || t <= s.start) return BigInt(s.price);
  if (t >= s.end) return BigInt(s.floorPrice);
  return BigInt(s.price) - (BigInt(s.price) - BigInt(s.floorPrice)) * BigInt(t - s.start) / BigInt(s.end - s.start);
}
export const capAt = (s, t) => (SALE_TOKENS * priceAt(s, t) + 10n ** 18n - 1n) / 10n ** 18n;
export function stateAt(s, t) {
  if (s.settled) return 'settled';
  if (s.failed) return 'failed';
  if (t < s.start) return 'upcoming';
  if (t >= s.end || BigInt(s.raised) >= capAt(s, t)) return 'closed';
  return 'live';
}
export function clearAt(s) {
  if (s.settled) return BigInt(s.clearPrice);
  const filled = (BigInt(s.raised) * 10n ** 18n + SALE_TOKENS - 1n) / SALE_TOKENS;
  return filled > BigInt(s.floorPrice) ? filled : BigInt(s.floorPrice);
}
export const tokensFor = (coin, price) => BigInt(price) === 0n ? 0n : BigInt(coin) * 10n ** 18n / BigInt(price);
/// After close: what happens next, in plain words.
export function outcome(s, t) {
  const st = stateAt(s, t);
  if (st === 'closed') return BigInt(s.raised) >= BigInt(s.softCap) ? 'ready' : 'refund';
  return st;
}
export function timeText(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 86400) return Math.floor(s / 86400) + 'd ' + Math.floor(s % 86400 / 3600) + 'h';
  if (s >= 3600) return Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm';
  if (s >= 60) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return s + 's';
}
export function compact(tokens) {
  const n = Number(BigInt(tokens) / 10n ** 18n);
  return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
}
/// The sale id and token from createSale's receipt.
export function parseSaleCreated(receipt, address) {
  const log = (receipt?.logs || []).find(l => l.address?.toLowerCase() === address.toLowerCase() && l.topics?.[0] === SALE_CREATED);
  if (!log) return null;
  return {saleId: Number(BigInt(log.topics[1])), creator: A(BigInt(log.topics[2])), token: A(BigInt(log.topics[3]))};
}
export const saleLink = (chainId, id) => '/sale.html?chain=' + chainId + '&id=' + id;
export function randomSalt() {
  const b = new Uint8Array(32); globalThis.crypto.getRandomValues(b); return '0x' + hex(b);
}

/// EIP-1559 fee fields from the chain (as one-tap launches send them): priority = the chain's suggestion, max = 2 × base + priority.
export async function feeFields(rpc) {
  try {
    const [tip, block] = await Promise.all([rpc('eth_maxPriorityFeePerGas', []).catch(() => '0x0'), rpc('eth_getBlockByNumber', ['latest', false])]);
    const prio = BigInt(tip || '0x0'), base = BigInt(block?.baseFeePerGas || '0x0');
    if (!block?.baseFeePerGas) return {};
    return {maxPriorityFeePerGas: '0x' + prio.toString(16), maxFeePerGas: '0x' + (base * 2n + prio).toString(16)};
  } catch { return {}; }
}
