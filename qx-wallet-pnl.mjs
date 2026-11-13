// walletpnl (2026-11-12, Randall: "My balances don't load quickly - I'm in profit on this rooq trade").
// /api/portfolio/evm/<w> gives cost:null to every token bought outside QHooks, so the wallet showed "PnL unknown" for all
// but QHooks launches. This fills the same cost object the portfolio returns for QHooks tokens ({boughtUnits, soldUnits,
// spentQuote, receivedQuote, quoteSymbol, pnlQuote, pnlUsd, approximate:true}) from the wallet's own history on chain:
//  - ETH/WETH the wallet paid in its buy txs is the cost; ETH/WETH it got back in its sells is the proceeds. The QHooks
//    router's trade event and the Pons curve's CurveBuy/CurveSell carry exact amounts; otherwise the tx's value and the
//    WETH the wallet moved (and, for a sell into a native-ETH v4 pool, the pool's ETH out, before any router fee).
//  - The position is costed from the block where the wallet's balance of the token was last zero: the newest 10M-block
//    window first (the public RPC's limit), older windows only while the balance isn't explained yet.
//  - A token that came or went any other way (airdrop, transfer, another quote) keeps cost:null: no made-up basis.
//  - Value: the v4 pool the wallet traded in, read on chain (trackers lag or misprice thin RH tokens: GeckoTerminal had
//    ROOQ at 5x its pool price on 2026-11-12). Pons curve tokens (ungraduated) that the portfolio flagged spam only for
//    a thin tracker pool ("Liquidity below $1,000", e.g. AEON's 56%-fee v4 pool with $4.56 in it) are the launchpad's
//    own: priced from the curve's reserves, unflagged, and counted in the totals again.
// Where it runs: in the browser, against Robinhood Chain's public RPC (already in the page CSP), demand-driven: a wallet
// view reads; nothing polls. The worker can't do it for free (the public RPC answered HTTP 429 to every log and receipt
// read from the worker on the 2026-11-12 edge test, through 25 s of retries; the worker's fallback route is paid).
// Kept per (chain, wallet) on this device with each token's scanned block range, so a repeat view reads only blocks after
// its cursor (at most once a minute per token) plus one batched price read.
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

export const PNL_CHAINS = Object.freeze({
  '4663': Object.freeze({
    rpc: 'https://rpc.mainnet.chain.robinhood.com', span: 10_000_000, quoteSymbol: 'ETH',
    wrapped: '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
    router: '0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff', // QHooks fee router (trade event below)
    pons: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e', // PonsV2LaunchFactory (facts: MKTSEARCH-DELTA.md)
    skip: Object.freeze(['0x5fc5360d0400a0fd4f2af552add042d716f1d168']), // USDG: a dollar, not a position
  }),
});
export const TOPIC = Object.freeze({
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  // QHooks router: (address indexed user, address indexed tokenIn, address indexed tokenOut, amountIn, amountOut, ref, fee).
  // amountIn is what the user paid (fee included), amountOut what the user got.
  routed: '0x245fac6408e23570093e5026dd349414cea3ea645cc618c1d7c70d234be90c21',
  curveBuy: '0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455', // CurveBuy(buyer, recipient, quoteIn, tokensOut, fee, tax)
  curveSell: '0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df', // CurveSell(seller, recipient, tokensIn, quoteOut, fee, tax)
  v4Swap: '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f', // Swap(id, sender, amount0, amount1, …)
});
export const LIMITS = Object.freeze({MAX_TOKENS: 3, MAX_TXS: 12, WORK_MS: 12_000, CALL_MS: 4000, RESCAN_MS: 60_000, MIN_USD: 1, BATCH: 6, BAD_RETRY_MS: 86_400_000, PONS_MS: 600_000, PRICE_MS: 300_000});
const ADDR = /^0x[0-9a-f]{40}$/, ZERO = '0x' + '0'.repeat(40);
const pad = a => '0x' + a.slice(2).padStart(64, '0');
const addrOf = topic => '0x' + String(topic || '').slice(-40).toLowerCase();
const words = data => (String(data || '0x').slice(2).match(/.{64}/g) || []).map(w => BigInt('0x' + w));
const signed = v => v >= 1n << 255n ? v - (1n << 256n) : v;
const hex = n => '0x' + n.toString(16);
const big = s => { try { return BigInt(s ?? 0); } catch { return 0n; } };
const num = (raw, decimals) => Number(raw) / 10 ** decimals;
const known = n => typeof n === 'number' && Number.isFinite(n);

/// One tx's effect on the wallet's position in `token`: {paid, got} in quote wei, or null when it can't be costed.
export function classifyTx({tx, receipt, wallet, token, cfg, unitsIn = 0n, unitsOut = 0n}) {
  if (!tx || !receipt || receipt.status === '0x0') return null;
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [], W = wallet, isQuote = a => a === ZERO || a === cfg.wrapped;
  let paid = 0n, got = 0n, how = null;
  for (const l of logs) {
    if (String(l.address).toLowerCase() !== cfg.router || l.topics?.[0] !== TOPIC.routed || addrOf(l.topics[1]) !== W) continue;
    const tokenIn = addrOf(l.topics[2]), tokenOut = addrOf(l.topics[3]), [amountIn = 0n, amountOut = 0n] = words(l.data);
    if (tokenOut === token && isQuote(tokenIn)) { paid += amountIn; how = 'router'; }
    else if (tokenIn === token && isQuote(tokenOut)) { got += amountOut; how = 'router'; }
  }
  if (!how) for (const l of logs) {
    if (addrOf(l.topics?.[2]) !== W) continue;
    if (l.topics?.[0] === TOPIC.curveBuy && unitsIn > 0n) { paid += words(l.data)[0] ?? 0n; how = 'curve'; }
    if (l.topics?.[0] === TOPIC.curveSell && unitsOut > 0n) { got += words(l.data)[1] ?? 0n; how = 'curve'; }
  }
  if (!how && String(tx.from).toLowerCase() === W) {
    let wethOut = 0n, wethIn = 0n, other = false;
    for (const l of logs) {
      if (l.topics?.[0] !== TOPIC.transfer || l.topics.length !== 3) continue;
      const a = String(l.address).toLowerCase(), from = addrOf(l.topics[1]), to = addrOf(l.topics[2]), v = words(l.data)[0] ?? 0n;
      if (a === cfg.wrapped) { if (from === W) wethOut += v; if (to === W) wethIn += v; }
      else if (a !== token && from !== ZERO && to !== ZERO) other = true;
    }
    if (unitsIn > unitsOut) {
      const cost = big(tx.value) + wethOut - wethIn;
      if (cost > 0n) { paid = cost; how = 'tx'; }
    } else if (unitsOut > unitsIn) {
      if (wethIn > wethOut) { got = wethIn - wethOut; how = 'tx'; }
      else if (!other) {
        // A native-ETH v4 pool: ETH is currency0, and nothing but the token moved as an ERC-20, so the pool's positive
        // amount0 is the ETH that left it for this sell (any router fee comes off after; approximate).
        let eth = 0n;
        for (const l of logs) if (l.topics?.[0] === TOPIC.v4Swap) { const [a0 = 0n, a1 = 0n] = words(l.data).map(signed); if (a0 > 0n && a1 < 0n) eth += a0; }
        if (eth > 0n) { got = eth; how = 'pool'; }
      }
    }
  }
  return how ? {paid, got, how, pool: tradedPool(logs, unitsIn - unitsOut, paid > 0n ? paid : got)} : null;
}

/// The v4 pool this trade went through: the Swap whose token side matches the wallet's units (hooks and taxes allowed:
/// ½× to 2×) and whose other side matches the ETH paid or got (±25%). {pm, id, tokenIs0} or null.
export function tradedPool(logs, units, quote) {
  if (!units || quote <= 0n) return null;
  const close = (a, b, lo, hi) => b > 0n && a * 100n >= b * lo && a * 100n <= b * hi, abs = v => v < 0n ? -v : v, u = abs(units);
  let best = null;
  for (const l of logs) {
    if (l.topics?.[0] !== TOPIC.v4Swap || !/^0x[0-9a-f]{64}$/i.test(l.topics[1] || '')) continue;
    const [a0 = 0n, a1 = 0n] = words(l.data).map(signed);
    for (const [tok, q, tokenIs0] of [[a1, a0, false], [a0, a1, true]]) {
      // the swapper's token delta has the wallet's sign (+ on a buy) and the quote delta the other sign
      if ((tok > 0n) !== (units > 0n) || (q > 0n) === (units > 0n) || !close(abs(tok), u, 50n, 200n) || !close(abs(q), quote, 75n, 125n)) continue;
      const miss = abs(abs(q) - quote);
      if (!best || miss < best.miss) best = {pm: String(l.address).toLowerCase(), id: l.topics[1].toLowerCase(), tokenIs0, miss};
    }
  }
  return best && {pm: best.pm, id: best.id, tokenIs0: best.tokenIs0};
}

/// ETH per token from a v4 pool's slot0 word (extsload): sqrtPriceX96 is the low 160 bits; price = token1 per token0.
export function poolPrice(word, tokenIs0, decimals) {
  const sqrtP = Number(big(word) & ((1n << 160n) - 1n));
  if (!(sqrtP > 0)) return null;
  const raw = (sqrtP / 2 ** 96) ** 2; // token1 per token0, raw units
  const p = tokenIs0 ? raw * 10 ** (decimals - 18) : 1 / (raw * 10 ** (18 - decimals));
  return Number.isFinite(p) && p > 0 ? p : null;
}
const slot0Key = id => '0x' + [...keccak_256(Uint8Array.from((id.slice(2) + '6'.padStart(64, '0')).match(/../g).map(h => parseInt(h, 16))))].map(b => b.toString(16).padStart(2, '0')).join('');

/// Current ETH price for each token whose trade pool is known (one extsload per token, batched).
export async function poolPrices({tokens, state, rpc, now = Date.now}) {
  const live = tokens.filter(t => state[t.address]?.pool && Number.isInteger(t.decimals));
  if (!live.length) return false;
  const r = await rpc(live.map(t => ['eth_call', [{to: state[t.address].pool.pm, data: '0x1e2eaeaf' + slot0Key(state[t.address].pool.id).slice(2)}, 'latest']]));
  live.forEach((t, i) => { const p = poolPrice(String(r[i] || '0x').slice(0, 66), state[t.address].pool.tokenIs0, t.decimals); if (p) state[t.address].px = {eth: p, at: now()}; });
  return true;
}

/// The cost object for a held token from its finished state, valued at the portfolio's own price.
export function costFromState(s, token, quoteUsd, quoteSymbol) {
  if (!s || s.bad || s.prior !== '0' || (s.pending || []).length || !Number.isInteger(token?.decimals)) return null;
  // The answer's balance must be the one this history explains: an answer read before (or after) the latest trade the
  // chain shows would pair the wrong amount with the basis. Within a millionth, for rounding.
  const held = big(token.balance), net = big(s.bought) - big(s.sold), gap = held > net ? held - net : net - held;
  if (net <= 0n || gap * 1_000_000n > net) return null;
  const spentQuote = num(big(s.spent), 18), receivedQuote = num(big(s.received), 18);
  const boughtUnits = num(big(s.bought), token.decimals), soldUnits = num(big(s.sold), token.decimals);
  if (!(boughtUnits > 0) || !(spentQuote > 0)) return null;
  const valueQuote = known(token.valueUsd) && known(quoteUsd) && quoteUsd > 0 ? token.valueUsd / quoteUsd : null;
  const pnlQuote = valueQuote === null ? null : receivedQuote + valueQuote - spentQuote;
  return {boughtUnits, soldUnits, spentQuote, receivedQuote, quoteSymbol, pnlQuote,
    pnlUsd: pnlQuote === null ? null : pnlQuote * quoteUsd, approximate: true, source: 'chain'}; // source: worked out here, not indexed
}

// JSON-RPC over the chain's public endpoint. Batches of at most LIMITS.BATCH calls. The public RPC rate-limits bursts with
// HTTP 429, so a 429 is retried after a growing pause while the pass has time (WORK_MS); then the pass stops and the
// next view continues from what was kept.
const PAUSES = [500, 900, 1400, 2000, 2600, 3200, 3800];
function rpcClient(url, fetchImpl, deadline) {
  let id = 0;
  const post = async part => {
    for (let attempt = 0; ; attempt++) {
      const left = deadline - Date.now();
      if (left < 150) throw new Error('budget');
      // qhooksPublicOnly: the page's RPC fallback (qx-rpc-fallback.mjs) would send this through the site relay, which
      // reads via the Worker's paid route; this pass stays on the free endpoint and retries itself.
      let r, text = '', limited = false;
      try {
        r = await fetchImpl(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(part), signal: AbortSignal.timeout(Math.min(left, LIMITS.CALL_MS)), qhooksPublicOnly: true});
        text = r.ok ? await r.text() : (await r.body?.cancel().catch(() => {}), '');
        limited = r.status === 429 || /"code":\s*429/.test(text.slice(0, 200));
      } catch (e) {
        // a blocked response (the endpoint's intermittent "Access-Control-Allow-Origin: *,*") or a timeout: retry like a 429
        if (e?.name === 'AbortError' && deadline - Date.now() < 150) throw e;
        limited = true; r = {ok: false, status: 0};
      }
      const pause = PAUSES[Math.min(attempt, PAUSES.length - 1)] + Math.floor(Math.random() * 250);
      if (limited && deadline - Date.now() > pause + 400) { await new Promise(res => setTimeout(res, pause)); continue; }
      if (!r.ok || limited) throw new Error('rpc_' + (limited ? 'limited' : r.status));
      return JSON.parse(text);
    }
  };
  return async calls => {
    const out = [];
    for (let i = 0; i < calls.length; i += LIMITS.BATCH) {
      const part = calls.slice(i, i + LIMITS.BATCH).map(([method, params]) => ({jsonrpc: '2.0', id: ++id, method, params}));
      const j = await post(part), byId = new Map((Array.isArray(j) ? j : [j]).map(x => [x?.id, x]));
      for (const c of part) { const x = byId.get(c.id); if (!x || x.error || !Object.hasOwn(x, 'result')) throw new Error('rpc_error'); out.push(x.result); }
    }
    return out;
  };
}

const fresh = () => ({lo: null, hi: null, prior: null, bought: '0', sold: '0', spent: '0', received: '0', pending: [], bad: false, at: 0});
const merge = (pending, logs, wallet) => {
  const byTx = new Map(pending.map(p => [p.tx, {...p}]));
  for (const l of logs) {
    const tx = l.transactionHash, from = addrOf(l.topics?.[1]), to = addrOf(l.topics?.[2]), v = words(l.data)[0] ?? 0n;
    if (!tx || (from !== wallet && to !== wallet)) continue;
    const p = byTx.get(tx) || {tx, b: parseInt(l.blockNumber, 16), i: '0', o: '0'};
    if (to === wallet) p.i = (big(p.i) + v).toString();
    if (from === wallet) p.o = (big(p.o) + v).toString();
    byTx.set(tx, p);
  }
  return [...byTx.values()];
};
const net = (logs, wallet) => logs.reduce((n, l) => { const v = words(l.data)[0] ?? 0n; return n + (addrOf(l.topics?.[2]) === wallet ? v : 0n) - (addrOf(l.topics?.[1]) === wallet ? v : 0n); }, 0n);

/// Advances each token's state by one step of chain reads. Mutates `state` (token → state); returns true if it changed.
/// Steps commit only when every read they need answered, so a 429 or the budget never leaves half a range behind.
export async function advance({cfg, wallet, tokens, state, rpc, now = Date.now}) {
  let changed = false;
  const [head] = await rpc([['eth_blockNumber', []]]), B = parseInt(head, 16);
  if (!Number.isSafeInteger(B) || B <= 0) return false;
  const plan = [];
  for (const t of tokens) {
    const s = state[t.address] ||= fresh();
    if (s.bad && now() - s.at < LIMITS.BAD_RETRY_MS) continue;
    if (s.bad) Object.assign(s, fresh());
    if (s.hi === null) plan.push({t, s, kind: 'first', lo: Math.max(0, B - cfg.span + 1), hi: B});
    else {
      if (B > s.hi && now() - s.at >= LIMITS.RESCAN_MS) plan.push({t, s, kind: 'forward', lo: s.hi + 1, hi: Math.min(B, s.hi + cfg.span)});
      if (s.prior !== '0' && s.lo > 0) plan.push({t, s, kind: 'back', lo: Math.max(0, s.lo - cfg.span), hi: s.lo - 1});
    }
  }
  const calls = [];
  for (const p of plan) {
    p.at = calls.length;
    calls.push(['eth_getLogs', [{address: p.t.address, topics: [TOPIC.transfer, null, pad(wallet)], fromBlock: hex(p.lo), toBlock: hex(p.hi)}]],
      ['eth_getLogs', [{address: p.t.address, topics: [TOPIC.transfer, pad(wallet)], fromBlock: hex(p.lo), toBlock: hex(p.hi)}]]);
    if (p.kind === 'first') calls.push(['eth_call', [{to: p.t.address, data: '0x70a08231' + pad(wallet).slice(2)}, hex(p.hi)]]);
  }
  if (calls.length) {
    const res = await rpc(calls);
    for (const p of plan) {
      const logs = [...res[p.at], ...res[p.at + 1]], s = p.s, n = net(logs, wallet);
      s.pending = merge(s.pending, logs, wallet);
      if (p.kind === 'first') { s.lo = p.lo; s.hi = p.hi; s.prior = (big(res[p.at + 2]) - n).toString(); }
      else if (p.kind === 'forward') s.hi = p.hi;
      else { s.lo = p.lo; s.prior = (big(s.prior) - n).toString(); }
      if (big(s.prior) < 0n || (s.lo === 0 && s.prior !== '0')) s.bad = true; // rebasing, fee-on-transfer or a mint we can't see
      s.at = now(); changed = true;
    }
  }
  // Price the txs: at most MAX_TXS per view, the rest on the next one.
  const work = tokens.flatMap(t => { const s = state[t.address]; return s && !s.bad ? s.pending.map(p => ({t, s, p})) : []; }).slice(0, LIMITS.MAX_TXS);
  if (work.length) {
    // the ranges above are already merged into the state: a failed price read keeps them (changed) for the next view
    let res;
    try { res = await rpc(work.flatMap(({p}) => [['eth_getTransactionByHash', [p.tx]], ['eth_getTransactionReceipt', [p.tx]]])); }
    catch (e) { if (changed) return changed; throw e; }
    work.forEach(({t, s, p}, i) => {
      const unitsIn = big(p.i), unitsOut = big(p.o);
      const c = classifyTx({tx: res[2 * i], receipt: res[2 * i + 1], wallet, token: t.address, cfg, unitsIn, unitsOut});
      s.pending = s.pending.filter(x => x.tx !== p.tx);
      if (!c) { s.bad = true; s.at = now(); changed = true; return; }
      s.bought = (big(s.bought) + unitsIn).toString(); s.sold = (big(s.sold) + unitsOut).toString();
      s.spent = (big(s.spent) + c.paid).toString(); s.received = (big(s.received) + c.got).toString();
      if (c.pool && (!s.poolBlock || p.b >= s.poolBlock)) { s.pool = c.pool; s.poolBlock = p.b; } // the newest trade's pool
      changed = true;
    });
  }
  return changed;
}

// Pons V2: getLaunchedToken(token) → a static 15-word record (token, curve, …, phase at word 10, exists at word 14). The
// record is kept for PONS_MS; the curve's reserves (its price) are read on every pass that runs.
export async function ponsCurves({cfg, tokens, state, rpc, now = Date.now}) {
  const pons = state.pons ||= {};
  const ask = tokens.filter(t => !pons[t.address] || now() - pons[t.address].at >= LIMITS.PONS_MS);
  if (ask.length) {
    const recs = await rpc(ask.map(t => ['eth_call', [{to: cfg.pons, data: '0x3cf28b5a' + pad(t.address).slice(2)}, 'latest']]));
    ask.forEach((t, i) => {
      const w = String(recs[i] || '0x').slice(2).match(/.{64}/g) || [];
      const ok = w.length >= 15 && BigInt('0x' + w[14]) === 1n && '0x' + w[0].slice(24) === t.address;
      pons[t.address] = {curve: ok ? '0x' + w[1].slice(24) : null, graduated: ok ? BigInt('0x' + w[10]) !== 0n : null, price: null, reserve: null, at: now()};
    });
  }
  const live = tokens.filter(t => pons[t.address]?.curve && !pons[t.address].graduated);
  if (live.length) {
    // getReserves() → (quoteReserve incl. the virtual reserve, tokenReserve); realQuoteReserve() → ETH really in the curve
    const r = await rpc(live.flatMap(t => [['eth_call', [{to: pons[t.address].curve, data: '0x0902f1ac'}, 'latest']], ['eth_call', [{to: pons[t.address].curve, data: '0x4f1f58fd'}, 'latest']]]));
    live.forEach((t, i) => {
      const [q = 0n, k = 0n] = words(r[2 * i]), real = words(r[2 * i + 1])[0] ?? 0n, p = pons[t.address];
      if (q > 0n && k > 0n) { p.price = Number(q) / Number(k); p.reserve = num(real, 18); p.priced = now(); }
    });
  }
  return ask.length > 0 || live.length > 0;
}

// Totals as the portfolio computes them (inner portfolioTotals): non-spam assets with a value; the 24h change on those
// with a 24h price.
export function portfolioTotals(chains) {
  const byChain = {}, changes = []; let any = false, total = 0, covered = 0;
  for (const c of chains) {
    let ok = false, value = 0;
    for (const a of [c.native, ...(c.tokens || []).filter(t => !t.spam)]) {
      if (!a) continue;
      if (a.valueUsd !== null && a.valueUsd !== undefined) { ok = true; value += a.valueUsd; }
      if (a.valueUsd === 0 || a.balance === '0') continue;
      if (known(a.valueUsd) && known(a.change24) && a.change24 > -1) { changes.push(a.valueUsd - a.valueUsd / (1 + a.change24)); covered += a.valueUsd; }
    }
    if (ok) { any = true; total += value; }
    byChain[c.chainId] = ok ? value : null;
  }
  return {valueUsd: any ? total : null, change24Usd: changes.length ? changes.reduce((a, b) => a + b, 0) : null, change24CoveredUsd: changes.length ? covered : null, byChain};
}

const THIN = 'Liquidity below $1,000';
/// Applies a wallet's kept state to a portfolio chain in place: costs for finished tokens; curve prices for Pons tokens.
/// Returns true if anything in the chain changed (the caller recomputes totals).
export function applyState(chain, cfg, state, now = Date.now) {
  let touched = false;
  const quoteUsd = known(chain.native?.priceUsd) ? chain.native.priceUsd : null;
  for (const t of chain.tokens || []) {
    const p = state.pons?.[t.address];
    if (p?.curve && !p.graduated && known(p.price) && now() - (p.priced || 0) < LIMITS.PONS_MS && quoteUsd && t.spam && t.spamReason === THIN) {
      t.priceUsd = p.price * quoteUsd; t.valueUsd = known(t.units) ? t.units * t.priceUsd : t.valueUsd;
      t.liquidityUsd = known(p.reserve) ? p.reserve * quoteUsd : t.liquidityUsd;
      t.spam = false; t.spamReason = null; t.venue = {kind: 'pons-curve', curve: p.curve}; touched = true;
    }
    const s = state.tokens?.[t.address];
    if (!t.qhooks && s?.px && known(s.px.eth) && now() - s.px.at < LIMITS.PRICE_MS && quoteUsd && known(t.units)) {
      // the pool the wallet traded in, read on chain this pass: trackers lag or misprice thin RH tokens (GeckoTerminal had
      // ROOQ at 5× its pool price on 2026-11-12)
      t.priceUsd = s.px.eth * quoteUsd; t.valueUsd = t.units * t.priceUsd; t.priceSource = 'pool'; touched = true;
    }
    if (!t.qhooks && (t.cost == null || t.cost.source === 'chain')) {
      // re-derived on every apply: a new trade pending its price clears an earlier basis instead of leaving it wrong
      const cost = costFromState(s, t, quoteUsd, cfg.quoteSymbol);
      if (cost || t.cost) { t.cost = cost; touched = true; }
    }
  }
  return touched;
}

/// Tokens worth a cost basis this view: held outside tokens with a value, most valuable first.
export function candidates(chain, cfg) {
  return (chain.tokens || []).filter(t => ADDR.test(t.address || '') && !t.qhooks && (t.cost == null || t.cost.source === 'chain') && t.address !== cfg.wrapped && !cfg.skip.includes(t.address)
    && big(t.balance) > 0n && Number.isInteger(t.decimals) && (known(t.valueUsd) ? t.valueUsd >= LIMITS.MIN_USD : false))
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}

const KEY = 'qhooks:wallet-pnl:v1:';
const defaultStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
function loadState(storage, k) {
  try { const s = JSON.parse(storage?.getItem(KEY + k) || 'null'); return s && s.v === 1 ? s : {v: 1, tokens: {}, pons: {}}; } catch { return {v: 1, tokens: {}, pons: {}}; }
}
function saveState(storage, k, s) { try { storage?.setItem(KEY + k, JSON.stringify(s)); } catch { /* private browsing: no kept state */ } }
const plainFetch = (...args) => globalThis.fetch(...args);

/// Outside-token costs for portfolio reports (/api/portfolio/evm answers) on this device.
///  - apply(report): fills costs and chain prices from what this device already knows (sync, no reads); true if changed.
///  - refresh(report): one demand-driven pass of chain reads (bounded: MAX_TOKENS tokens, MAX_TXS txs, workMs), then
///    apply; resolves true if the report changed. One pass per wallet at a time; a second caller shares it.
export function createOutsideCosts({fetchImpl = plainFetch, storage = defaultStorage(), now = Date.now, chains = PNL_CHAINS, workMs = LIMITS.WORK_MS} = {}) {
  const flights = new Map();
  const wallet = report => String(report?.address || '').toLowerCase();
  function apply(report) {
    const w = wallet(report);
    if (!ADDR.test(w) || !Array.isArray(report?.chains)) return false;
    let touched = false;
    for (const chain of report.chains) {
      const cfg = chains[String(chain.chainId)];
      if (cfg && Array.isArray(chain.tokens) && applyState(chain, cfg, loadState(storage, String(chain.chainId) + ':' + w), now)) touched = true;
    }
    if (touched) report.totals = portfolioTotals(report.chains);
    return touched;
  }
  async function pass(report, w) {
    let any = false;
    for (const chain of report.chains) {
      const cfg = chains[String(chain.chainId)];
      if (!cfg || !Array.isArray(chain.tokens)) continue;
      const k = String(chain.chainId) + ':' + w, state = loadState(storage, k);
      const due = candidates(chain, cfg).filter(t => {
        const s = state.tokens[t.address];
        if (!s) return true;
        if (s.bad) return now() - (s.at || 0) >= LIMITS.BAD_RETRY_MS;
        return s.pending?.length || s.prior !== '0' || now() - (s.at || 0) >= LIMITS.RESCAN_MS;
      }).slice(0, LIMITS.MAX_TOKENS);
      const thin = chain.tokens.filter(t => t.spam && t.spamReason === THIN && !t.qhooks && ADDR.test(t.address || '') && big(t.balance) > 0n).slice(0, LIMITS.MAX_TOKENS);
      const held = candidates(chain, cfg).filter(t => state.tokens[t.address]?.pool || due.includes(t)).slice(0, LIMITS.MAX_TOKENS * 2);
      if (!due.length && !thin.length && !held.length) continue;
      const rpc = rpcClient(cfg.rpc, fetchImpl, Date.now() + workMs);
      let changed = false;
      try { if (due.length) changed = await advance({cfg, wallet: w, tokens: due, state: state.tokens, rpc, now}) || changed; } catch {}
      try { if (thin.length) changed = await ponsCurves({cfg, tokens: thin, state, rpc, now}) || changed; } catch {}
      try { changed = await poolPrices({tokens: held, state: state.tokens, rpc, now}) || changed; } catch {}
      if (changed) { saveState(storage, k, state); any = true; }
    }
    return any;
  }
  async function refresh(report) {
    const w = wallet(report);
    if (!ADDR.test(w) || !Array.isArray(report?.chains)) return false;
    if (!flights.has(w)) flights.set(w, pass(report, w).catch(() => false).finally(() => flights.delete(w)));
    await flights.get(w);
    return apply(report);
  }
  return {apply, refresh};
}
let shared = null;
/// The page's one instance (wallet view, portfolio page and holdings panel share its passes and its kept state).
export const outsideCosts = () => shared ||= createOutsideCosts();
