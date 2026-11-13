// Bonding-curve maths and calldata (curves, 2026-11-12). Pure: no DOM, wallet or network. Shared by the terminal ticket
// (public/qx-curve-market.mjs, qx-terminal-trade.mjs), the worker route (server/curve-market.mjs) and the tests.
// The quote arithmetic is Pons V2's own, in the same integer order (docs.ponsfamily.com/v2 "Getting a quote"), so a quote
// matches what the trade settles at when nothing moves in between.
export const BPS = 10000n;
export const ZERO = '0x0000000000000000000000000000000000000000';
export const SEL = Object.freeze({
  getLaunchedToken: '0x3cf28b5a', getReserves: '0x0902f1ac', sellableTokens: '0x808bcddc', feeBps: '0x24a9d853',
  creatorTaxBps: '0xc1bb8901', realQuoteReserve: '0x4f1f58fd', graduationThreshold: '0x8b0bc501', reservedTokens: '0x15a55347',
  currentSnipeTaxBps: '0xd7e1ef39', totalSupply: '0x18160ddd', decimals: '0x313ce567', symbol: '0x95d89b41', name: '0x06fdde03',
  getTokenInfo: '0xabb1dc44', buy: '0x59a87bc1', sell: '0xd04c6983', exec: '0x2213bc0b', getSlot0: '0xc815641c', getLiquidity: '0xfa6793d5', aggregate3: '0x82ad56cb',
});
// Curve events (topic0). CurveBuy(buyer, recipient, quoteIn, tokensOut, fee, tax); CurveSell(seller, recipient, tokensIn, quoteOut, fee, tax).
// quoteIn is what the buyer paid (fees included); quoteOut is what the seller received (fees already taken).
export const TOPIC = Object.freeze({
  buy: '0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455',
  sell: '0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df',
  launched: '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607',
});
export const PHASES = Object.freeze(['curve', 'graduating', 'pool', 'rescued']);

const strip = h => String(h || '').replace(/^0x/, '');
export const pad = v => (typeof v === 'bigint' || typeof v === 'number' ? BigInt(v).toString(16) : strip(v).toLowerCase()).padStart(64, '0');
export const word = (hex, i) => strip(hex).slice(i * 64, i * 64 + 64);
export const big = w => BigInt('0x' + (w || '0'));
export const addr = w => '0x' + String(w || '').slice(24).toLowerCase();
const int24 = v => { const x = BigInt(v); return (x < 0n ? (1n << 256n) + x : x).toString(16).padStart(64, '0'); };
const ceilDiv = (a, b) => (a + b - 1n) / b;

/// Multicall3 aggregate3 (allowFailure everywhere) for [[target, calldata], …].
export function aggregate3(calls) {
  const items = calls.map(([t, d]) => { const b = String(d).replace(/^0x/, ''), len = b.length / 2; return pad(t) + pad(1n) + pad(0x60n) + pad(BigInt(len)) + b.padEnd(Math.ceil(len / 32) * 64, '0'); });
  let off = calls.length * 32; const heads = items.map(it => { const h = pad(BigInt(off)); off += it.length / 2; return h; });
  return SEL.aggregate3 + pad(0x20n) + pad(BigInt(calls.length)) + heads.join('') + items.join('');
}
export function decodeAggregate3(ret) {
  const h = String(ret || '').replace(/^0x/, ''), base = Number(big(word(h, 0))) / 32, n = Number(big(word(h, base))), out = [];
  for (let i = 0; i < n; i++) {
    const t = base + 1 + Number(big(word(h, base + 1 + i))) / 32, ok = big(word(h, t)) === 1n, d = t + Number(big(word(h, t + 1))) / 32, len = Number(big(word(h, d)));
    out.push(ok ? '0x' + h.slice((d + 1) * 64, (d + 1) * 64 + len * 2) : null);
  }
  return out;
}
/// Pons V2 launch record (getLaunchedToken return data, 15 static words). Null when the token was not launched there.
export function decodeLaunch(hex) {
  const h = strip(hex);
  if (h.length < 15 * 64) return null;
  const w = i => word(h, i);
  if (big(w(14)) !== 1n) return null; // exists
  const phase = Number(big(w(10)));
  const ts = big(w(7)), tickSpacing = Number(ts >= 1n << 255n ? ts - (1n << 256n) : ts);
  return {token: addr(w(0)), curve: addr(w(1)), deployer: addr(w(2)), creatorFeeRecipient: addr(w(3)), pairToken: addr(w(4)),
    threshold: big(w(5)), poolFee: Number(big(w(6))), tickSpacing, creatorTaxBps: Number(big(w(8))), buybackEnabled: big(w(9)) === 1n,
    phaseIndex: phase, phase: PHASES[phase] || 'unknown'};
}

/// Pons token getTokenInfo() → {logo, description, links}: (address deployer, string logo, string description,
/// (string twitter, string telegram, string discord, string website, string farcaster) socials). Null when it doesn't decode.
export function decodeTokenInfo(hex) {
  const h = strip(hex);
  try {
    const str = at => { const n = Number(big(h.slice(at * 2, at * 2 + 64))); if (n > 4096) throw Error('long'); const b = h.slice(at * 2 + 64, at * 2 + 64 + n * 2);
      return new TextDecoder().decode(Uint8Array.from(b.match(/../g) || [], x => parseInt(x, 16))).replace(/[\u0000-\u001f]/g, ' ').trim(); };
    const off = i => Number(big(word(h, i)));
    const logo = str(off(1)), description = str(off(2)), s0 = off(3), soc = [0, 1, 2, 3, 4].map(i => str(s0 + Number(big(h.slice((s0 + i * 32) * 2, (s0 + i * 32) * 2 + 64)))));
    const url = v => /^https:\/\/[^\s"'<>]{3,300}$/i.test(v) ? v : null;
    return {logo: logo || null, description: description.slice(0, 600) || null,
      links: {x: url(soc[0]), telegram: url(soc[1]), discord: url(soc[2]), website: url(soc[3]), farcaster: url(soc[4])}};
  } catch { return null; }
}
/// An ipfs:// logo's CID (the only logo form the worker fetches), else null.
export const ipfsCid = v => { const m = /^ipfs:\/\/(?:ipfs\/)?([a-z0-9]{46,100})(\/[\w.-]{1,80})?$/i.exec(String(v || '').trim()); return m ? m[1] + (m[2] || '') : null; };

/// The graduated pool's v4 key (Pons docs "Reconstructing the pool"): token and pair sorted, fee from the record, the hook.
export function poolKeyOf(launch, hook) {
  const a = launch.token.toLowerCase(), b = launch.pairToken.toLowerCase();
  const [currency0, currency1] = BigInt(b) < BigInt(a) ? [b, a] : [a, b];
  return {currency0, currency1, fee: launch.poolFee, tickSpacing: launch.tickSpacing, hooks: hook.toLowerCase()};
}
export const poolIdPreimage = k => '0x' + pad(k.currency0) + pad(k.currency1) + pad(k.fee) + int24(k.tickSpacing) + pad(k.hooks);

/// Constant product in the curve's own integer order (fees are charged outside this step).
export const amountOut = (inAmount, reserveIn, reserveOut) => (inAmount * reserveOut) / (reserveIn + inAmount);
export const amountIn = (outAmount, reserveIn, reserveOut) => (outAmount * reserveIn) / (reserveOut - outAmount) + 1n;

/// The snipe tax the curve will apply (capped so a buyer always nets at least 1% of spend).
export function snipeBpsOf(s, raw = 0n) {
  let snipe = BigInt(raw || 0n);
  if (snipe > 0n) { const max = BPS - BigInt(s.feeBps) - BigInt(s.creatorTaxBps) - 100n; if (snipe > max) snipe = max; }
  return snipe;
}
/// Quote asset in (at the curve) → tokens out. s = {quoteReserve, tokenReserve, sellable, feeBps, creatorTaxBps} (bigints/numbers).
export function quoteBuy(s, quoteIn, rawSnipeBps = 0n) {
  quoteIn = BigInt(quoteIn);
  const qR = BigInt(s.quoteReserve), tR = BigInt(s.tokenReserve), sellable = BigInt(s.sellable);
  const feeBps = BigInt(s.feeBps), taxBps = BigInt(s.creatorTaxBps), snipeBps = snipeBpsOf(s, rawSnipeBps);
  let spent = quoteIn;
  const fee = spent * feeBps / BPS, tax = spent * taxBps / BPS, snipe = spent * snipeBps / BPS;
  let tokensOut = amountOut(spent - fee - tax - snipe, qR, tR), clamped = false;
  if (tokensOut > sellable) {
    clamped = true; tokensOut = sellable;
    const net = amountIn(sellable, qR, tR), grossed = ceilDiv(net * BPS, BPS - feeBps - taxBps - snipeBps);
    spent = grossed < quoteIn ? grossed : quoteIn;
  }
  return {tokensOut, spent, refund: quoteIn - spent, clamped};
}
/// Tokens in → quote asset out (fees come off the output; no snipe tax on sells).
export function quoteSell(s, tokensIn) {
  const gross = amountOut(BigInt(tokensIn), BigInt(s.tokenReserve), BigInt(s.quoteReserve));
  return gross - gross * BigInt(s.feeBps) / BPS - gross * BigInt(s.creatorTaxBps) / BPS;
}
/// The largest quote amount (at the curve) a buy can spend before it would take the curve's last sellable token.
/// A buy above it is clamped by the curve and its refund sent to msg.sender, which the fee-router route cannot take back.
export function maxBuyIn(s, rawSnipeBps = 0n) {
  const sellable = BigInt(s.sellable);
  if (sellable <= 0n) return 0n;
  const keep = BPS - BigInt(s.feeBps) - BigInt(s.creatorTaxBps) - snipeBpsOf(s, rawSnipeBps);
  const net = amountIn(sellable, BigInt(s.quoteReserve), BigInt(s.tokenReserve)) - 2n; // 2 wei under: the fee floors round up net
  return net > 0n && keep > 0n ? net * BPS / keep : 0n;
}

/// curve.buy(quoteIn, minTokensOut, recipient)
export const buyCall = (quoteIn, minTokensOut, recipient) => SEL.buy + pad(BigInt(quoteIn)) + pad(BigInt(minTokensOut)) + pad(recipient);
/// curve.sell(tokensIn, minQuoteOut, recipient)
export const sellCall = (tokensIn, minQuoteOut, recipient) => SEL.sell + pad(BigInt(tokensIn)) + pad(BigInt(minQuoteOut)) + pad(recipient);
/// 0x AllowanceHolder.exec(operator, token, amount, target, data): calls target with data (+ the caller appended), forwarding the value.
export function execCall(operator, token, amount, target, data) {
  const d = strip(data), len = d.length / 2, padded = d.padEnd(Math.ceil(len / 32) * 64, '0');
  return SEL.exec + pad(operator) + pad(token) + pad(BigInt(amount)) + pad(target) + pad(0xa0) + pad(len) + padded;
}

/// The direct curve buy through QFeeRouter.swapVia: the router keeps feeBps of `amountIn` (its 1%, cashback and referral as
/// for every other route), hands the rest to AllowanceHolder.exec → curve.buy(spend, min, recipient = router), then measures
/// what arrived and sends it on to the trader. Returns the 0x-quote-shaped answer the ticket already handles, or {error}.
export function directBuyQuote({state, amountIn, routerFeeBps = 100n, slippageBps = 100, router, allowanceHolder, snipeBps = 0n}) {
  amountIn = BigInt(amountIn);
  if (state.phase !== 'curve') return {error: 'not_on_curve'};
  if (!state.quote?.native) return {error: 'not_native'};
  const spend = amountIn - amountIn * BigInt(routerFeeBps) / BPS;
  const q = quoteBuy(state, spend, snipeBps);
  if (q.clamped) {
    const cap = maxBuyIn(state, snipeBps), routerCap = cap * BPS / (BPS - BigInt(routerFeeBps));
    return {error: 'finishes_curve', maxIn: routerCap > 0n ? routerCap - routerCap / 1000n : 0n};
  }
  if (q.tokensOut <= 0n) return {error: 'too_small'};
  const minOut = q.tokensOut - q.tokensOut * BigInt(slippageBps) / BPS;
  const data = execCall(state.curve, ZERO, 0n, state.curve, buyCall(spend, minOut > 0n ? minOut : 1n, router));
  return {buyAmount: q.tokensOut.toString(), minBuyAmount: (minOut > 0n ? minOut : 1n).toString(), sellAmount: spend.toString(),
    tx: {to: allowanceHolder, data, value: '0x' + spend.toString(16)}, sources: ['Pons curve'], direct: true};
}

/// One CurveBuy/CurveSell log → a trade row (raw units as bigints; the caller prices them).
export function decodeTrade(log) {
  const t0 = String(log?.topics?.[0] || '').toLowerCase(), side = t0 === TOPIC.buy ? 'buy' : t0 === TOPIC.sell ? 'sell' : null;
  if (!side || strip(log.data).length < 256) return null;
  const a = big(word(log.data, 0)), b = big(word(log.data, 1)), fee = big(word(log.data, 2)), tax = big(word(log.data, 3));
  const block = Number(BigInt(log.blockNumber)), index = Number(BigInt(log.logIndex ?? '0x0'));
  // buy: a = quoteIn (paid, fees included), b = tokensOut. sell: a = tokensIn, b = quoteOut (received, fees taken).
  const tokens = side === 'buy' ? b : a, paid = side === 'buy' ? a : b;
  const atCurve = side === 'buy' ? a - fee - tax : b + fee + tax; // the quote that moved the curve (ex fees)
  return {side, block, index, tx: String(log.transactionHash || '').toLowerCase(), tokens, quote: paid, atCurve, fee, tax,
    from: addr(word(log.topics[1], 0)), to: addr(word(log.topics[2], 0))};
}

/// Block → unix seconds from sparse anchors (block numbers with known timestamps), linear between neighbours.
export function timeAt(block, anchors) {
  if (!anchors.length) return null;
  let lo = 0, hi = anchors.length - 1;
  if (block <= anchors[0][0]) return anchors[0][1];
  if (block >= anchors[hi][0]) return anchors[hi][1];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (anchors[mid][0] <= block) lo = mid; else hi = mid; }
  const [b0, t0] = anchors[lo], [b1, t1] = anchors[hi];
  return t0 + (t1 - t0) * (block - b0) / Math.max(1, b1 - b0);
}
/// Anchor blocks to read for a set of trade blocks: each block's bucket edges, at a step that keeps the count ≤ max.
export function anchorBlocks(blocks, head, {step = 2048, max = 360} = {}) {
  if (!blocks.length) return [];
  const lo = Math.min(...blocks), hi = Math.max(...blocks);
  while ((hi - lo) / step > max) step *= 2;
  const out = new Set();
  for (const b of blocks) { const a = Math.floor(b / step) * step; out.add(a); out.add(Math.min(head, a + step)); }
  return [...out].sort((a, b) => a - b);
}

/// Exact-curve observations → OHLCV bars (unit: whatever priceOf returns). Empty intervals are not invented.
export function candlesOf(rows, tf) {
  const bars = new Map();
  for (const r of [...rows].sort((a, b) => a.ts - b.ts || a.block - b.block || a.index - b.index)) {
    if (!Number.isFinite(r.ts) || !(r.price > 0)) continue;
    const time = Math.floor(r.ts / tf) * tf, v = Number.isFinite(r.value) ? r.value : 0, bar = bars.get(time);
    if (!bar) bars.set(time, {time, open: r.price, high: r.price, low: r.price, close: r.price, volume: v});
    else { bar.high = Math.max(bar.high, r.price); bar.low = Math.min(bar.low, r.price); bar.close = r.price; bar.volume += v; }
  }
  return [...bars.values()];
}
