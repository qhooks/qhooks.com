// Portfolio v6 (2026-11-13, Randall: "i like where you're going with the portfolio idea"): the data behind the header
// PnL and the Holding / Closed / Created / Staked & locked tabs. Pure functions only (qx-portfolio.mjs paints).
// Rule: every figure comes from a reading the site already makes. A figure that can't be computed is null, and the page
// shows "Refreshing" while it is read or leaves it out. Nothing here estimates, fills in or rounds up a missing number.
import {isTestToken} from './qx-test-tokens.mjs';

const known = n => typeof n === 'number' && Number.isFinite(n);
const sum = xs => { const k = xs.filter(known); return k.length ? k.reduce((a, b) => a + b, 0) : null; };
const EVM = /^0x[0-9a-f]{40}$/i;

// The chain's coin and its wrapped form are cash; they carry no PnL and no sell buttons (walletpos rule).
// `wrapped` maps chainId -> wrapped native address (chains.mjs); `nativeSymbols` lets a quote priced in the chain's own
// coin (ETH/WETH, HYPE/WHYPE, BNB/WBNB, MON/WMON) borrow the native price the portfolio reading already carries.
export const quoteIsNative = (quoteSymbol, nativeSymbol) => {
  const q = String(quoteSymbol || '').toUpperCase(), n = String(nativeSymbol || '').toUpperCase();
  return !!q && !!n && (q === n || q === 'W' + n);
};

// The quote's USD price for one row's cost: the ratio the reading itself used (pnlUsd / pnlQuote), else the chain's
// native price when the quote is that coin. Otherwise unknown.
export function quoteUsdOf(cost, native = null) {
  if (!cost) return null;
  if (known(cost.quoteUsd) && cost.quoteUsd > 0) return cost.quoteUsd;
  if (known(cost.pnlUsd) && known(cost.pnlQuote) && cost.pnlQuote !== 0) { const r = cost.pnlUsd / cost.pnlQuote; if (r > 0) return r; }
  if (native && quoteIsNative(cost.quoteSymbol, native.symbol) && known(native.priceUsd) && native.priceUsd > 0) return native.priceUsd;
  return null;
}

// One holding's cost split, from the same cost object the row already shows (bought/sold units, spent/received quote,
// pnlQuote = received + value - spent). Average cost method, as wallet-tracking's walletStats uses:
//   avg = spent / bought; realized = received - min(sold, bought) * avg; unrealized = pnl - realized.
// Avg entry in USD values the quote at today's quote price, so it is marked approximate (the row already says ≈).
export function rowCost(row, native = null) {
  const c = row?.cost, out = {avgEntryUsd: null, realizedUsd: null, unrealizedUsd: null, pnlUsd: null, pnlPct: null, approximate: true};
  if (!c || row.native === true) return out;
  const bought = Number(c.boughtUnits), sold = Number(c.soldUnits) || 0, spent = Number(c.spentQuote), received = Number(c.receivedQuote) || 0;
  const q = quoteUsdOf(c, native);
  if (known(c.pnlUsd)) out.pnlUsd = c.pnlUsd;
  if (!(bought > 0) || !(spent > 0)) return out;
  const avg = spent / bought;
  if (q) {
    out.avgEntryUsd = avg * q;
    out.realizedUsd = (received - Math.min(sold, bought) * avg) * q;
    if (known(c.unrealizedQuote)) out.unrealizedUsd = c.unrealizedQuote * q;
    else if (known(c.pnlQuote)) out.unrealizedUsd = (c.pnlQuote - (received - Math.min(sold, bought) * avg)) * q;
    if (known(out.pnlUsd)) out.pnlPct = (known(c.unrealizedQuote) && c.remainingCostQuote > 0) ? c.unrealizedQuote / c.remainingCostQuote : out.pnlUsd / (spent * q);
  }
  return out;
}

// Rows that count toward PnL: not spam, not cash, not a test token.
export const isTestRow = r => !!r && (isTestToken(r.chainId, r.address) || (!!r.qhooks?.controller && isTestToken(r.qhooks.chainId || r.chainId, r.qhooks.controller)));

// Closed: positions the wallet traded on QHooks markets and no longer holds, from /api/wallets/card/<w>?window=all
// (walletStats: average-cost realized PnL per market). Positions the portfolio still lists are left to Holding.
export function closedPositions(card, rows = []) {
  if (!card || card.version !== 1 || !Array.isArray(card.positions)) return null;
  const held = new Set(rows.flatMap(r => [String(r.chainId) + ':' + String(r.address || '').toLowerCase(), r.qhooks?.controller ? String(r.qhooks.chainId || r.chainId) + ':' + String(r.qhooks.controller).toLowerCase() : null]).filter(Boolean));
  return card.positions
    .filter(p => p && Number(p.held) <= 0 && Number(p.trades) > 0 && EVM.test(String(p.controller || '')) && p.chainId != null)
    .filter(p => !held.has(String(p.chainId) + ':' + String(p.controller).toLowerCase()))
    .map(p => ({chainId: String(p.chainId), controller: String(p.controller).toLowerCase(), symbol: p.symbol || null, quoteSymbol: p.quoteSymbol || null,
      realizedUsd: known(p.realizedUsd) ? p.realizedUsd : null, trades: Number(p.trades), lastAt: Number(p.lastAt) || null,
      test: isTestToken(p.chainId, p.controller)}))
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
}

// The header PnL. `today` is the reading's own 24h move on what is held (change24Usd, the figure the page has always
// shown "over 24 hours"). `all` sums the per-holding PnL every row shows plus the realized PnL of closed positions.
// 7 days has no source that agrees with the rows (no 7-day cost history; the wallet card's 7d covers indexed QHooks
// trades only), so it is never computed here.
export function pnlSummary({rows = [], natives = {}, closed = null, change24Usd = null, partial = false} = {}) {
  const counted = rows.filter(r => !r.spam && r.native !== true && !isTestRow(r) && r.cost);
  const splits = counted.map(r => rowCost(r, natives[r.chainId] || null));
  const closedReal = closed ? sum(closed.filter(p => !p.test).map(p => p.realizedUsd)) : null;
  const open = sum(splits.map(s => s.pnlUsd));
  const all = open === null && closedReal === null ? null : (open ?? 0) + (closedReal ?? 0);
  const realizedOpen = sum(splits.map(s => s.realizedUsd));
  const realized = realizedOpen === null && closedReal === null ? null : (realizedOpen ?? 0) + (closedReal ?? 0);
  return {
    today: known(change24Usd) && !partial ? change24Usd : null,
    all, allCovered: splits.filter(s => known(s.pnlUsd)).length, allCounted: counted.length, closedIncluded: closedReal !== null,
    realized, unrealized: sum(splits.map(s => s.unrealizedUsd)),
  };
}

// Filters: chain, Hide dust (the old "Hide small balances": under $1, unpriced rows stay), Hide test tokens
// (qx-test-tokens.mjs), Show spam, search.
export function filterRows(rows, {search = '', chain = 'all', hideSmall = true, hideTest = true, showSpam = false} = {}) {
  const q = String(search || '').trim().toLowerCase();
  return rows.filter(r => (showSpam || !r.spam) && (chain === 'all' || r.chainId === chain)
    && (!hideSmall || r.valueUsd === null || r.valueUsd === undefined || r.valueUsd >= 1)
    && (!hideTest || !isTestRow(r))
    && (!q || [r.symbol, r.name, r.address, r.chainName].some(v => String(v || '').toLowerCase().includes(q))));
}

// Sell 50% / Sell 100%: the terminal's existing prefill link (qx-tg-prefill.mjs parseTerminalHash: side=sell&pct=N&wallet=)
// opens the token with the sell ticket filled from the live balance. The ticket's own quote, slippage profile, fees and
// confirm button do the rest; nothing is sent from this page.
export const openHref = r => '/terminal#' + (r.qhooks ? 'm=' + (r.qhooks.chainId || r.chainId) + ':' + r.qhooks.controller : 't=' + r.chainId + ':' + r.address);
export function sellHref(r, pct, wallet) {
  if (![50, 100].includes(pct) || !EVM.test(String(wallet || '')) || !r || r.native === true || r.spam) return null;
  if (r.chainId === 'solana') return null; // Solana sells keep the Trade button (the prefill wallet check is EVM-only here)
  return openHref(r) + '&side=sell&pct=' + pct + '&wallet=' + String(wallet).toLowerCase();
}

// Staked & locked: QHOOKS flexible stake (vault.staked) and QStakeLock timed locks (readTimedLocks), valued at the QHOOKS
// price the portfolio reading carries. Terms: 1 = 1 week, 2 = 2 weeks, 3 = 30 days (qx-trade-stakelock.mjs).
export const TERM_SEC = {1: 7 * 86400, 2: 14 * 86400, 3: 30 * 86400};
export const TERM_LABEL = {1: '1 week', 2: '2 weeks', 3: '30 days'};
export function stakedRows({staked = null, locks = null, priceUsd = null, now = Date.now() / 1000} = {}) {
  const px = known(priceUsd) && priceUsd > 0 ? priceUsd : null, out = [];
  const units = v => Number(BigInt(v)) / 1e18;
  if (staked !== null && staked !== undefined && BigInt(staked) > 0n) {
    const amount = units(staked); out.push({kind: 'staked', amount, valueUsd: px ? amount * px : null, end: null, progress: null, term: null});
  }
  for (const l of locks || []) {
    const amount = units(l.amount), end = Number(l.end), span = TERM_SEC[l.term] || null;
    const progress = span && end ? Math.max(0, Math.min(1, 1 - (end - now) / span)) : null;
    out.push({kind: 'locked', id: String(l.id), amount, valueUsd: px ? amount * px : null, end, term: l.term, progress, ended: end <= now});
  }
  return out;
}

// Created: the wallet's launches (/api/account/<w>/launches), real first, test launches last, each with its creator fees
// waiting in the launch's blocks (creatorQuote, read on chain by qx-earnings.mjs launchIncome).
export function createdUsd(income, natives = {}) {
  if (!income || !known(income.quoteAmount)) return null;
  const n = natives[income.chainId];
  return n && quoteIsNative(income.quoteSymbol, n.symbol) && known(n.priceUsd) && n.priceUsd > 0 ? income.quoteAmount * n.priceUsd : null;
}
export function creatorFeesUsd(incomes, natives = {}) { return sum((incomes || []).map(i => createdUsd(i, natives))); }

export function ago(sec, now = Date.now() / 1000) {
  if (!known(sec) || sec <= 0) return null;
  const d = Math.max(0, now - sec);
  if (d < 3600) return Math.max(1, Math.round(d / 60)) + 'm ago';
  if (d < 86400) return Math.round(d / 3600) + 'h ago';
  return Math.round(d / 86400) + 'd ago';
}

// /portfolio?wallet=0x… shows any wallet's public holdings read-only (no connection, no signing, no sell or claim buttons).
export function viewWallet(search) {
  try { const p = new URLSearchParams(String(search || '')); const w = p.get('wallet') || p.get('address'); return EVM.test(String(w || '')) ? String(w).toLowerCase() : null; }
  catch { return null; }
}

// Small prices on a row: the site's zero-count subscript ($0.0₄2641), from four leading zeros (the site's priceDigits starts
// at five), so a phone row's "avg ≈" fits without an ellipsis. Four significant digits; the same number, written shorter.
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
export function smallPrice(n) {
  if (!known(n) || n <= 0) return '—';
  if (n >= 1) return '$' + n.toLocaleString('en-US', {maximumFractionDigits: 2});
  const zeros = Math.floor(-Math.log10(n)); // zeros right after the decimal point
  if (zeros < 4) return '$' + Number(n.toPrecision(4)).toString();
  let z = zeros, scaled = Math.round(n * 10 ** (z + 4)); if (scaled >= 10000) { z -= 1; scaled = Math.round(n * 10 ** (z + 4)); }
  if (z < 4) return '$' + Number(n.toPrecision(4)).toString();
  const digits = String(scaled).slice(0, 4).replace(/0+$/, '') || '0';
  return '$0.0' + String(z).split('').map(d => SUBS[d]).join('') + digits;
}
