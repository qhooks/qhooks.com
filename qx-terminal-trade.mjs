// Terminal trade ticket: market buys and sells through the launch's live pool and its blocks, amount
// presets, price tolerance, price impact, and buys paid in the native coin where the chain allows.
// Every quote runs through the real pool and hook, so charges are in the number shown. Trades go through the
// platform fee router: 1% per trade, 30% of it back to the trader as cashback they claim here.
import { rpc, livePoolKey, parseUnits, formatUnits, erc20, send, ensureAllowance, connectedAddress, onWalletChange, NATIVE, CHAIN_NAME, h } from '/qx-chain.mjs';
import { quoteSingle, nativeRoute, quoteNative, FEE_BPS, feeSwapCall, viaSwapCall, nativeHops, cashbackOf, referralLink, claimCall } from '/qx-swap.mjs';
import { extraAddress, isLive, setUp } from '/qx-extras.mjs';
import { solAddress, solWallets, connectSol, signSol, onSolChange } from '/qx-solana.mjs';
import { renderRisk as trustRisk } from '/qx-trust.mjs';
import { oneClickPlan, withOneClick, pressGate, silentActive } from '/qx-instant-bridge.mjs';
import { getWalletHub } from '/wallet-hub.mjs';
import { relayWallet } from './qx-relay-wallet.mjs';
import { createFundingRow, fundingAsset, destinationCosts, runCrossChainBuy, retryLanded, recoveryView,
  cashAsset, cashHome, cashSettings, moveProceeds, chainName, readAssetBalance, loadFundingStyle, xchainEnabled } from './qx-xchain-gate.mjs';

const PRESETS = { usd: ['10', '50', '100', '500'], eth: ['0.01', '0.05', '0.1', '0.5'], bnb: ['0.05', '0.1', '0.5', '1'], sol: ['0.1', '0.25', '0.5', '1'] };
const SELL = [25, 50, 75, 100];
const TOL = [['50', '0.5%'], ['100', '1%'], ['300', '3%'], ['1000', '10%']];
/// Amount with at least three significant digits, so small WETH or WBNB cashback never reads as 0.
const small = (v, d) => { let max = 4; while (max < d && v > 0n && formatUnits(v, d, max) === '0') max++; return formatUnits(v, d, Math.min(d, max + 2)); };
const unitClass = sym => /^W?ETH$/.test(sym) ? 'eth' : /^W?BNB$/.test(sym) ? 'bnb' : /^W?SOL$/.test(sym) ? 'sol' : 'usd';
const SOL_MINT = 'So11111111111111111111111111111111111111112', SOL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// Outside tokens (any token, routed by 0x): the chain's coin and its main dollar token as payment.
const XNATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', ZERO = '0x0000000000000000000000000000000000000000';
const STABLE = { '8453': ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 'USDC', 6], '1': ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'USDC', 6],
  '42161': ['0xaf88d065e77c8cc2239327c5edb3a432268e5831', 'USDC', 6], '56': ['0x55d398326f99059ff775485246999027b3197955', 'USDT', 18],
  '4663': ['0x5fc5360d0400a0fd4f2af552add042d716f1d168', 'USDG', 6] };
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem('qhooks:terminal:' + k); localStorage.setItem('qhooks:terminal:' + k, v); } catch {} return null; };

export function mountTicket(card, { onTraded = () => {} } = {}) {
  let st = null, side = 'buy', pay = 'quote', tol = store('tol') || '100', current = null, qseq = 0, timer = null, busy = false;
  let priceUsd = null, armedAt = null, armTimer = null, sellCash = false, recovery = null;
  const hub = getWalletHub(window);
  loadFundingStyle();
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Amount', id: 'qxt-amount' });
  const unit = h('span', { class: 'qxt-unit' });
  const balance = h('button', { type: 'button', class: 'qxt-bal', title: 'Use the whole balance' });
  const presets = h('div', { class: 'qxt-presets', role: 'group', ariaLabel: 'Amount presets' });
  const out = h('div', { class: 'qxt-out' }, 'Choose a launch to trade.');
  const go = h('button', { type: 'button', class: 'qxt-go', disabled: true }, 'Buy');
  const sideBtns = ['buy', 'sell'].map(s => h('button', { type: 'button', 'data-side': s, ariaPressed: String(s === side) }, s === 'buy' ? 'Buy' : 'Sell'));
  const sellToCash = h('button', { type: 'button', 'data-side': 'cash', hidden: !xchainEnabled }, 'Sell to cash');
  const paySel = h('select', { ariaLabel: 'Pay with' });
  const tolSel = h('select', { ariaLabel: 'Price tolerance' }, ...TOL.map(([v, t]) => h('option', { value: v, selected: v === tol }, t)));
  const payRow = h('label', { class: 'qxt-pay' }, h('span', {}, 'Pay with'), paySel);

  const cash = h('div', { class: 'qxt-cash' });
  const risk = h('div', { class: 'qxt-risk', hidden: true });
  const followup = h('div');
  const funding = createFundingRow({ h, getPlan: q => tradePlan(current, q), onChange: ({ quote, ready }) => {
    clearArmed(); if (current) current.funding = quote;
    go.disabled = busy || !current || !ready || (st?.safety?.verdict === 'danger' && !risk.querySelector('input')?.checked);
  } });
  card.replaceChildren(
    h('div', { class: 'qxt-side-toggle', role: 'group', ariaLabel: 'Trade side' }, ...sideBtns, sellToCash),
    h('div', { class: 'qxt-row2' }, payRow, h('label', { class: 'qxt-pay' }, h('span', {}, 'Tolerance'), tolSel)),
    risk, h('div', { class: 'qxt-amount' }, amount, unit), h('div', { class: 'qxt-meta' }, balance), presets, out, funding.element, go, status, followup, cashSettings(h), cash);

  const payUnit = () => side === 'sell' ? st.symbol : pay === 'native' ? (st.sol ? 'SOL' : NATIVE[st.chainId]) : st.quoteSymbol;
  const payDecimals = () => side === 'sell' ? st.decimals : pay === 'native' ? (st.sol ? 9 : 18) : st.quoteDecimals;
  async function balances() {
    if (st?.sol) {
      const me = solAddress(); if (!me) return null;
      const [t, q] = await Promise.all([fetch(`/api/terminal/sol/balance/${me}?mint=${st.token}`).then(r => r.json()), fetch(`/api/terminal/sol/balance/${me}?mint=${SOL_USDC}`).then(r => r.json())]);
      return { token: BigInt(t.token || 0), quote: BigInt(q.token || 0), native: BigInt(t.sol || 0) };
    }
    const me = connectedAddress(); if (!me || !st) return null;
    const [t, q, n] = await Promise.all([erc20(st.chainId, st.token, me), st.quote ? erc20(st.chainId, st.quote, me) : { balance: 0n }, rpc(st.chainId, 'eth_getBalance', [me, 'latest'])]);
    return { token: t.balance, quote: q.balance, native: BigInt(n) };
  }
  const spendable = b => side === 'sell' ? b.token : pay === 'native' ? b.native : b.quote;
  const buttonText = () => sellCash ? 'Sell all to cash' : (side === 'buy' ? 'Buy ' : 'Sell ') + (st?.symbol || '');
  function clearArmed() { clearTimeout(armTimer); armedAt = null; go.textContent = buttonText(); }
  function tradeUsd(c) {
    const dollars = sym => unitClass(sym) === 'usd' && /^(USDC|USDT|USDG)$/i.test(sym || '');
    const units = (v, d) => Number(formatUnits(v, d, d).replace(/,/g, ''));
    if (c.side === 'buy' && dollars(payUnit())) return units(c.a, payDecimals());
    const sym = st.ext ? xTokens().outSym : st.quoteSymbol, dec = st.ext ? xTokens().outDec : st.quoteDecimals;
    if (c.side === 'sell' && dollars(sym)) return units(c.got, dec);
    return priceUsd ? units(c.side === 'buy' ? c.got : c.a, st.decimals) * priceUsd : null;
  }
  function tradePlan(c, fundingQuote = c?.funding) {
    const me = connectedAddress(), wallet = hub.snapshot().current;
    const inputUsd = Number(fundingQuote?.details?.currencyIn?.amountUsd);
    const usd = fundingQuote && inputUsd > 0 ? inputUsd : c ? tradeUsd(c) : null;
    return oneClickPlan(me, wallet?.owner?.toLowerCase() === me?.toLowerCase() ? wallet.entry : null, usd);
  }
  function ticketPlan(c) {
    const inputUsd = Number(c.funding?.details?.currencyIn?.amountUsd), usd = inputUsd > 0 ? inputUsd : tradeUsd(c), plan = tradePlan(c);
    if (pressGate({ plan, armedAt, now: Date.now() }) === 'arm') {
      clearArmed(); armedAt = Date.now();
      go.textContent = Number.isFinite(usd) && usd > 0 ? 'Confirm $' + Math.round(usd) : 'Confirm ' + c.side;
      if (recovery) go.disabled = false;
      armTimer = setTimeout(clearArmed, 15000);
      return null;
    }
    clearArmed(); return plan;
  }
  let lastWallet = hub.snapshot().current;
  hub.subscribe(({ current: wallet }) => { if (wallet !== lastWallet) { clearArmed(); lastWallet = wallet; } });
  window.addEventListener('qhooks:trade-prefs', clearArmed);

  async function layout() {
    if (!st) return;
    sideBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
    card.dataset.side = side;
    sellToCash.setAttribute('aria-pressed', String(sellCash));
    payRow.hidden = side === 'sell' || paySel.options.length < 2;
    unit.textContent = payUnit();
    go.textContent = buttonText();
    const list = side === 'sell' ? SELL.map(p => [p + '%', p]) : PRESETS[unitClass(payUnit())].map(v => [v, v]);
    presets.replaceChildren(...list.map(([label, v], i) => h('button', { type: 'button', title: 'Key ' + (i + 1), onclick: () => preset(i) }, label)));
    const b = await balances().catch(() => null);
    balance.textContent = b ? 'Balance ' + formatUnits(spendable(b), payDecimals(), 4) + ' ' + payUnit() : st?.sol ? (solAddress() ? '' : 'Connect a Solana wallet to trade') : connectedAddress() ? '' : 'Connect a wallet to trade';
    balance.disabled = !b;
    refresh();
    showCashback().catch(() => cash.replaceChildren());
  }

  // ---- Outside tokens: 0x routes, 1% platform fee taken by 0x on the coin/dollar side ----
  const xTokens = () => {
    const quoteSide = pay === 'native' || !st.quote ? XNATIVE : st.quote;
    return side === 'buy' ? { sell: quoteSide, buy: st.token, outDec: st.decimals, outSym: st.symbol } : { sell: st.token, buy: quoteSide, outDec: quoteSide === XNATIVE ? 18 : st.quoteDecimals, outSym: quoteSide === XNATIVE ? NATIVE[st.chainId] : st.quoteSymbol };
  };
  // Outside tokens go through our fee router too (swapVia), so they pay the same 30% cashback and 20% referral: the
  // router takes 1% (from the input on a buy, so 0x is quoted for the other 99%) and hands the rest to 0x.
  const xSpend = a => side === 'buy' ? a - a * FEE_BPS / 10000n : a;
  async function fetchXQuote(a) {
    const me = connectedAddress(), { sell, buy } = xTokens();
    const q = new URLSearchParams({ chain: st.chainId, sell, buy, amount: xSpend(a).toString(), taker: me, side, slippageBps: tol, via: 'router' });
    const r = await fetch('/api/terminal/x/quote?' + q, { cache: 'no-store' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error === 'trading_off' ? 'Trading outside tokens is not switched on yet.' : body.error === 'no_route' ? 'No route for this trade right now.' : body.detail || 'No quote right now.');
    return body;
  }
  async function extQuote(mine, a) {
    if (!connectedAddress()) { out.textContent = 'Connect a wallet to get a quote.'; return; }
    try {
      const q = await fetchXQuote(a);
      if (mine !== qseq) return;
      const { outDec, outSym } = xTokens(), cut = v => side === 'sell' ? v - v * FEE_BPS / 10000n : v;
      const got = cut(BigInt(q.buyAmount)), minOut = cut(BigInt(q.minBuyAmount));
      current = { side, pay, a, got, minOut, x: true };
      out.replaceChildren(h('b', {}, '≈ ' + formatUnits(got, outDec, 4) + ' ' + outSym),
        h('span', {}, 'at least ' + formatUnits(minOut, outDec, 4) + (q.sources?.length ? ' · via ' + q.sources.map(s => s.replace(/_/g, ' ')).join(', ') : '')),
        h('span', { class: 'qxt-fee' }, 'Fee 1%, with 30% of it back to you as cashback · routed by 0x'));
      await offerFunding(mine);
    } catch (e) { if (mine === qseq) out.textContent = e.message; }
  }
  async function extSubmit(c) {
    const { chainId, token } = st, s = t => { status.textContent = t; };
      const me = connectedAddress(), b = await balances();
      if (spendable(b) < c.a) throw new Error('Not enough ' + payUnit());
      s('Refreshing the route…');
      const q = await fetchXQuote(c.a); // quotes expire quickly: send the one we just fetched
      const { sell, buy } = xTokens(), router = await extraAddress('feeRouter');
      assertTradeOwner(c);
      if (!(await isLive(chainId, 'feeRouter'))) { s('One-time setup of trading on ' + CHAIN_NAME[chainId] + '…'); await setUp(chainId, 'feeRouter', s); }
      const cut = v => c.side === 'sell' ? v - v * FEE_BPS / 10000n : v, quotedMin = cut(BigInt(q.minBuyAmount));
      const minOut = c.funding && c.minOut > quotedMin ? c.minOut : quotedMin;
      const tin = sell === XNATIVE ? ZERO : sell, tout = buy === XNATIVE ? ZERO : buy;
      assertTradeOwner(c);
      if (tin !== ZERO) await ensureAllowance(chainId, tin, router, c.a, s);
      const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);
      assertTradeOwner(c);
      await send(chainId, { to: router, data: viaSwapCall(q.tx.to, q.tx.data, tin, tout, c.a, minOut, c.side === 'buy', now + 600n), value: tin === ZERO ? c.a : 0n }, s);
      const after = await erc20(chainId, token, me).catch(() => null), moved = after ? (after.balance > b.token ? after.balance - b.token : b.token - after.balance) : null;
      s(moved === null ? 'Trade confirmed. Refresh balances.' : (c.side === 'buy' ? 'Bought ' : 'Sold ') + formatUnits(moved, st.decimals, 4) + ' ' + st.symbol + '.');
      amount.value = ''; document.dispatchEvent(new CustomEvent('qhooks:traded')); try { onTraded({ side: c.side, moved, status: s, ext: true }); } catch {}
  }
  // ---- Solana: Jupiter orders signed in the trader's Solana wallet; 1% referral fee in SOL or USDC ----
  const solMints = () => {
    const quoteSide = pay === 'native' ? SOL_MINT : SOL_USDC;
    return side === 'buy' ? { input: quoteSide, output: st.token, outDec: st.decimals, outSym: st.symbol } : { input: st.token, output: quoteSide, outDec: quoteSide === SOL_MINT ? 9 : 6, outSym: quoteSide === SOL_MINT ? 'SOL' : 'USDC' };
  };
  function solConnectPrompt() {
    const list = solWallets();
    out.replaceChildren(h('span', {}, list.length ? 'Connect a Solana wallet to trade.' : 'No Solana wallet found. Install Phantom, Solflare or Backpack.'),
      ...list.map(w => h('button', { type: 'button', class: 'qxt-mini qxt-solw', onclick: async () => { try { await connectSol(w.name); refresh(); layout(); } catch (e) { status.textContent = e.message; } } },
        ...(w.icon ? [h('img', { src: w.icon, alt: '', width: 16, height: 16 })] : []), w.name)));
  }
  async function fetchSolOrder(a) {
    const { input, output } = solMints();
    const r = await fetch('/api/terminal/sol/order?' + new URLSearchParams({ input, output, amount: a.toString(), taker: solAddress(), slippageBps: tol }), { cache: 'no-store' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error === 'trading_off' ? 'Solana trading is not switched on yet.' : body.error === 'no_route' ? (body.detail ? body.detail.replace(/\.?$/, '.') : 'No route for this trade right now.') : body.detail || 'No quote right now.');
    return body;
  }
  async function solQuote(mine, a) {
    if (!solAddress()) { solConnectPrompt(); return; }
    try {
      const o = await fetchSolOrder(a);
      if (mine !== qseq) return;
      const { outDec, outSym } = solMints(), got = BigInt(o.outAmount), minOut = BigInt(o.minOut);
      current = { side, pay, a, got, minOut, sol: true };
      out.replaceChildren(h('b', {}, '≈ ' + formatUnits(got, outDec, 4) + ' ' + outSym),
        h('span', {}, 'at least ' + formatUnits(minOut, outDec, 4) + (o.priceImpact != null ? ' · impact ' + Math.abs(o.priceImpact).toFixed(2) + '%' : '')),
        h('span', { class: 'qxt-fee' }, 'Fee 1%, routed by Jupiter'));
      go.disabled = busy || (st.safety?.verdict === 'danger' && !risk.querySelector('input')?.checked);
    } catch (e) { if (mine === qseq) out.textContent = e.message; }
  }
  async function solSubmit(c) {
    const s = t => { status.textContent = t; };
    try {
      const b = await balances();
      if (!b) throw new Error('Connect a Solana wallet first');
      if (spendable(b) < c.a) throw new Error('Not enough ' + payUnit());
      s('Refreshing the route…');
      const o = await fetchSolOrder(c.a);
      s('Confirm in your wallet…');
      const signed = await signSol(o.transaction);
      s('Sending…');
      const r = await fetch('/api/terminal/sol/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedTransaction: signed, requestId: o.requestId, lastValidBlockHeight: o.lastValidBlockHeight }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok || x.status !== 'Success') throw new Error('The swap did not land' + (x.error ? ': ' + x.error : ''));
      const after = await balances(), moved = after.token > b.token ? after.token - b.token : b.token - after.token;
      status.replaceChildren((c.side === 'buy' ? 'Bought ' : 'Sold ') + formatUnits(moved, st.decimals, 4) + ' ' + st.symbol + '. ', h('a', { href: 'https://solscan.io/tx/' + x.signature, target: '_blank', rel: 'noopener' }, 'View ↗'));
      amount.value = ''; document.dispatchEvent(new CustomEvent('qhooks:traded')); onTraded({ side: c.side, moved, status: s, ext: true });
    } catch (e) { s(e.message || 'The trade did not go through'); }
    busy = false; layout();
  }
  onSolChange(() => { if (st?.sol) { layout(); refresh(); } });

  function renderRisk() {
    const v = st?.ext ? st.safety : null;
    risk.dataset.key = '';
    risk.hidden = !v; if (!v) return;
    const flags = (v.flags || []).slice(0, 4);
    risk.className = 'qxt-risk ' + v.verdict;
    const title = { ok: 'No known risks found', caution: 'Trade with care', danger: 'High risk: this token may not be sellable', unknown: 'No safety scan for this token' }[v.verdict] || 'Safety unknown';
    risk.replaceChildren(h('b', {}, title), ...(flags.length ? [h('ul', {}, ...flags.map(f => h('li', {}, f)))] : []),
      ...(v.verdict === 'danger' ? [h('label', {}, h('input', { type: 'checkbox', onchange: () => { if (current) go.disabled = busy || !risk.querySelector('input').checked || (funding.required && !funding.quote); } }), ' I understand and still want to trade')] : []),
      h('a', { href: 'https://repoproof.online/proof?q=' + encodeURIComponent(st.token), target: '_blank', rel: 'noopener' }, 'Full check on RepoProof ↗'));
  }

  /// Claimable cashback and referral rewards on this chain, in the quote token and in the native coin, plus the
  /// trader's own referral link (20% of the fee on every trade by people who arrive through it).
  async function showCashback() {
    const me = connectedAddress(); if (!st || (!me && !st.ext)) { cash.replaceChildren(); return; }
    if (st.sol) { cash.replaceChildren(h('p', {}, h('em', {}, 'Solana: 1% fee via Jupiter. Cashback and referral rewards apply to EVM trades.'))); return; }
    const link = h('button', { type: 'button', class: 'qxt-mini qxt-reflink' }, 'Copy your referral link · earn 20% of their fees');
    link.addEventListener('click', async () => { try { await navigator.clipboard.writeText(referralLink(me)); link.textContent = 'Copied: you earn 20% of their fees'; } catch { link.textContent = referralLink(me); } });
    if (!(await isLive(st.chainId, 'feeRouter'))) { cash.replaceChildren(h('p', {}, link)); return; }
    const router = await extraAddress('feeRouter'), Z = '0x0000000000000000000000000000000000000000';
    const [q, n] = await Promise.all([cashbackOf(st.chainId, router, me, st.quote), cashbackOf(st.chainId, router, me, Z)]);
    const items = [[st.quote, q, st.quoteDecimals, st.quoteSymbol], [Z, n, 18, NATIVE[st.chainId]]].filter(x => x[1] > 0n);
    cash.replaceChildren(...items.map(([cur, v, d, sym]) => {
      const b = h('button', { type: 'button', class: 'qxt-mini' }, 'Claim');
      b.addEventListener('click', async () => { if (busy) return; b.disabled = true; try { await send(st.chainId, { to: router, data: claimCall(cur) }, t => { status.textContent = t; }); status.textContent = 'Rewards claimed.'; await showCashback(); document.dispatchEvent(new CustomEvent('qhooks:rewards-claimed')); } catch (e) { status.textContent = e.message; b.disabled = false; } });
      return h('p', {}, h('em', {}, 'Rewards'), h('span', {}, small(v, d) + ' ' + sym), b);
    }), h('p', {}, link));
  }

  async function preset(i) {
    if (!st || busy) return;
    clearArmed();
    if (side === 'sell') {
      const b = await balances(); if (!b) { status.textContent = 'Connect a wallet first.'; return; }
      amount.value = formatUnits(b.token * BigInt(SELL[i]) / 100n, st.decimals, st.decimals).replace(/,/g, '');
    } else amount.value = PRESETS[unitClass(payUnit())][i];
    refresh();
  }

  function refresh() {
    if (busy) return;
    clearArmed();
    clearTimeout(timer); current = null; go.disabled = true; qseq++;
    funding.clear(); recovery = null; followup.replaceChildren();
    out.textContent = amount.value ? (st?.ext ? 'Finding the best route…' : 'Quoting through the pool…') : 'Enter an amount or pick a preset.';
    timer = setTimeout(quote, 300);
  }
  async function quote() {
    if (!st) return;
    const mine = ++qseq; let a;
    try { a = parseUnits(amount.value, payDecimals()); if (a <= 0n) throw 0; } catch { out.textContent = 'Enter an amount or pick a preset.'; return; }
    out.textContent = st.ext ? 'Finding the best route…' : 'Quoting through the pool…';
    if (st.sol) return solQuote(mine, a);
    if (st.ext) return extQuote(mine, a);
    try {
      const { chainId, key, token, quote: qt } = st;
      let got, route = null, ref;
      // Buys pay the fee out of the input, sells out of the output.
      const spend = side === 'buy' ? a - a * FEE_BPS / 10000n : a;
      if (side === 'buy' && pay === 'native') { route = await quoteNative(chainId, key, token, qt, spend, st.symbol); got = route.out; }
      else {
        const zeroForOne = key.currency0 === (side === 'buy' ? qt : token);
        const small = spend / 1000n > 0n ? spend / 1000n : 1n;
        [got, ref] = await Promise.all([quoteSingle(chainId, key, zeroForOne, spend), quoteSingle(chainId, key, zeroForOne, small).catch(() => null)]);
        // Impact against a trade a thousandth the size; flat charges cancel out of the ratio.
        if (ref) ref = Number(got * small * 10000n / (ref * spend)) / 10000;
      }
      if (side === 'sell') got -= got * FEE_BPS / 10000n;
      if (mine !== qseq) return;
      const minOut = got * (10000n - BigInt(tol)) / 10000n;
      const outDec = side === 'buy' ? st.decimals : st.quoteDecimals, outSym = side === 'buy' ? st.symbol : st.quoteSymbol;
      current = { side, pay, a, got, minOut, route };
      out.replaceChildren(h('b', {}, '≈ ' + formatUnits(got, outDec, 4) + ' ' + outSym),
        h('span', {}, 'at least ' + formatUnits(minOut, outDec, 4) + (ref != null ? ' · impact ' + Math.max(0, (1 - ref) * 100).toFixed(2) + '%' : '') + ' · block charges included'),
        h('span', { class: 'qxt-fee' }, 'Fee 1%, with 30% of it back to you as cashback'),
        ...(route ? [h('span', {}, route.label)] : []));
      go.disabled = !connectedAddress() || busy;
      if (!connectedAddress()) status.textContent = 'Connect a wallet to trade.';
      await offerFunding(mine);
    } catch (e) { if (mine === qseq) out.textContent = /revert|execution/i.test(e.message || '') ? 'The pool refuses this trade right now (its rules may be closed to it).' : e.message || 'No quote for this amount'; }
  }

  async function poolSubmit(c) {
        const { chainId, key, token, quote: qt } = st, router = await extraAddress('feeRouter');
        const me = connectedAddress(), b = await balances();
        if (spendable(b) < c.a) throw new Error('Not enough ' + payUnit());
        const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp), deadline = now + 1200n;
        const s = t => { status.textContent = t; };
        assertTradeOwner(c);
        if (!(await isLive(chainId, 'feeRouter'))) { s('One-time setup of trading on ' + CHAIN_NAME[chainId] + '…'); await setUp(chainId, 'feeRouter', s); }
        if (c.side === 'buy' && c.pay === 'native') {
          const { hops, wrap } = nativeHops(chainId, key, qt, c.route);
          assertTradeOwner(c);
          await send(chainId, { to: router, data: feeSwapCall(chainId, hops, c.a, c.minOut, wrap, true, deadline), value: c.a }, s);
        } else {
          const tin = c.side === 'buy' ? qt : token;
          await ensureAllowance(chainId, tin, router, c.a, s);
          assertTradeOwner(c);
          await send(chainId, { to: router, data: feeSwapCall(chainId, [{ key, zeroForOne: key.currency0 === tin }], c.a, c.minOut, null, c.side === 'buy', deadline) }, s);
        }
        const after = await erc20(chainId, token, me).catch(() => null), moved = after ? (after.balance > b.token ? after.balance - b.token : b.token - after.balance) : null;
        status.textContent = moved === null ? 'Trade confirmed. Refresh balances.' : (c.side === 'buy' ? 'Bought ' : 'Sold ') + formatUnits(moved, st.decimals, 4) + ' ' + st.symbol + '.';
        amount.value = ''; document.dispatchEvent(new CustomEvent('qhooks:traded')); try { onTraded({ side: c.side, moved, status: s }); } catch {}
  }

  const payAsset = () => fundingAsset(st.chainId, pay === 'native' ? 'native' : { address: st.quote, decimals: st.quoteDecimals });
  function assertTradeOwner(c) { if (c.owner && connectedAddress()?.toLowerCase() !== c.owner.toLowerCase()) throw new Error('Reconnect the wallet that reviewed this trade.'); }
  async function offerFunding(mine) {
    if (!current || mine !== qseq) return;
    current.owner = connectedAddress();
    if (st.sol || side !== 'buy' || !current.owner) { funding.clear(); go.disabled = busy || !current.owner || (st.safety?.verdict === 'danger' && !risk.querySelector('input')?.checked); return; }
    try {
      const b = await balances();
      if (mine !== qseq) return;
      if (b && spendable(b) >= current.a) { funding.clear(); return; }
      const asset = payAsset(), owner = current.owner, chainId = st.chainId, amountNeeded = current.a;
      await funding.update({ owner, chainId, asset, amountNeeded, balance: b ? spendable(b) : undefined, review: async () => destinationCosts({ owner, chainId, asset, amountNeeded,
        spender: await extraAddress('feeRouter'), setup: await isLive(chainId, 'feeRouter') ? 0 : 1 }) });
    } catch (e) { status.textContent = e.message; go.disabled = true; }
  }
  async function arrivedTrade(c, a) {
    if (connectedAddress()?.toLowerCase() !== c.owner?.toLowerCase()) throw new Error('Reconnect the wallet that funded this trade.');
    if (st.ext) return extSubmit({ ...c, a, minOut: c.minOut * a / c.a });
    const spend = a - a * FEE_BPS / 10000n;
    const route = c.pay === 'native' ? await quoteNative(st.chainId, st.key, st.token, st.quote, spend, st.symbol) : null;
    const got = route ? route.out : await quoteSingle(st.chainId, st.key, st.key.currency0 === st.quote, spend);
    const floor = c.minOut * a / c.a, minOut = got * (10000n - BigInt(tol)) / 10000n;
    return poolSubmit({ ...c, a, got, route, minOut: minOut > floor ? minOut : floor });
  }
  function lock(value) {
    busy = value; funding.setBusy(value);
    for (const el of [amount, paySel, tolSel, balance, sellToCash, ...sideBtns, ...presets.querySelectorAll('button'), ...cash.querySelectorAll('button'), ...followup.querySelectorAll('button')]) el.disabled = value;
    go.disabled = value;
  }
  async function submit() {
    if (!current || busy || !st || go.disabled && !recovery) return;
    const c = current;
    if (!st.sol && c.owner && connectedAddress()?.toLowerCase() !== c.owner.toLowerCase()) { refresh(); return; }
    if (c.funding && !recovery && !funding.fresh()) { status.textContent = 'Refresh funding to review the current fees.'; go.disabled = true; return; }
    const plan = st.sol ? null : ticketPlan(c);
    if (!st.sol && !plan) return;
    if (st.sol) { busy = true; go.disabled = true; return solSubmit(c); }
    lock(true); status.textContent = '';
    const swapArrived = a => { if (plan.silent && !silentActive()) throw new Error('This one-click press expired. Retry the swap from the funds in your wallet.'); return arrivedTrade(c, a); };
    let landed = false, proceeds = null;
    try {
      await withOneClick(plan, async () => {
        if (recovery) { await retryLanded(recovery, { owner: connectedAddress(), swap: swapArrived }); recovery = null; return; }
        if (c.funding) {
          const wallet = await relayWallet();
          try {
            const result = await runCrossChainBuy({ quote: c.funding, wallet, swap: swapArrived,
              onStep: s => { if (s.message) status.textContent = s.message; } });
            if (!result.completed) { recovery = result; landed = true; followup.replaceChildren(recoveryView(h, result, () => submit())); }
          } finally { wallet.dispose(); }
          return;
        }
        const asset = sellCash ? (st.ext ? payAsset() : { address: st.quote, decimals: st.quoteDecimals, symbol: st.quoteSymbol }) : null;
        const before = asset ? await readAssetBalance(c.owner, { chainId: st.chainId, asset }) : 0n;
        await (st.ext ? extSubmit(c) : poolSubmit(c));
        if (asset) { const after = await readAssetBalance(c.owner, { chainId: st.chainId, asset }); if (after > before) proceeds = { chainId: st.chainId, asset, amount: after - before }; }
      });
    } catch (e) { status.textContent = e.message || 'The trade did not go through'; landed = !!recovery; }
    finally { lock(false); if (landed) { go.disabled = true; if (recovery?.retryable === false) for (const el of followup.querySelectorAll('button')) el.disabled = true; } else await layout(); }
    if (xchainEnabled && proceeds && (cashHome() && cashHome() !== Number(proceeds.chainId) || proceeds.asset.symbol !== cashAsset(proceeds.chainId).symbol)) {
      const home = cashHome(), button = h('button', { type: 'button', class: 'qxt-mini' }, home ? 'Move to ' + chainName(home) : 'Move proceeds to cash');
      button.addEventListener('click', () => { void moveProceeds({ ...proceeds, home }).catch(e => { status.textContent = e.message; }); });
      followup.replaceChildren(button);
    }
  }

  document.addEventListener('qhooks:rewards-claimed', () => showCashback().catch(() => cash.replaceChildren()));
  sideBtns.forEach(b => b.addEventListener('click', () => setSide(b.dataset.side)));
  paySel.addEventListener('change', () => { if (busy) return; clearArmed(); pay = paySel.value; amount.value = ''; layout(); });
  tolSel.addEventListener('change', () => { tol = tolSel.value; store('tol', tol); refresh(); });
  amount.addEventListener('input', refresh);
  amount.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) submit(); } });
  balance.addEventListener('click', async () => { clearArmed(); const b = await balances(); if (b) { amount.value = formatUnits(spendable(b), payDecimals(), payDecimals()).replace(/,/g, ''); refresh(); } });
  go.addEventListener('click', submit);
  onWalletChange(() => { clearArmed(); if (!busy) layout(); });

  sellToCash.addEventListener('click', async () => {
    if (!st || busy) return;
    clearArmed(); sellCash = true; side = 'sell'; pay = st.quote ? 'quote' : 'native'; paySel.value = pay;
    await layout(); await preset(3);
    const symbol = st.sol ? 'USDC' : st.quoteSymbol || NATIVE[st.chainId];
    status.textContent = st.sol || !['1', '8453', '42161', '56', '4663'].includes(String(st.chainId)) || symbol === cashAsset(st.chainId).symbol ? 'Sell your whole position for ' + symbol + '.' :
      'This pool sells to ' + symbol + '. Cash conversion is available in Move funds after the sale.';
  });

  function setSide(s) { if (busy || side === s && !sellCash) return; clearArmed(); sellCash = false; side = s; amount.value = ''; layout(); }

  return {
    async setPool(pool, meta) {
      if (busy) return;
      qseq++;
      sellCash = false; funding.clear(); recovery = null; followup.replaceChildren();
      clearArmed(); priceUsd = null;
      st = null; current = null; amount.value = ''; status.textContent = ''; go.disabled = true; out.textContent = 'Loading the pool…';
      const c = pool.constructor, quoteToken = c.quote, token = c.currency0 === quoteToken ? c.currency1 : c.currency0;
      // Simple launches carry their pool key; Studio launches read it from their controller.
      const [key, t, q] = await Promise.all([pool.kind === 'qhooks-simple-launch' && pool.key ? pool.key : livePoolKey(pool.chainId, pool.controller), erc20(pool.chainId, token), erc20(pool.chainId, quoteToken)]);
      st = { chainId: pool.chainId, key, token, quote: quoteToken, symbol: t.symbol || meta?.symbol || 'token', decimals: t.decimals, quoteSymbol: q.symbol, quoteDecimals: q.decimals };
      const native = nativeRoute(pool.chainId, quoteToken);
      paySel.replaceChildren(h('option', { value: 'quote' }, q.symbol), ...(native ? [h('option', { value: 'native' }, NATIVE[pool.chainId])] : []));
      // Wrapped-native launches default to paying in the coin people actually hold.
      pay = native?.wrap || native?.stock ? 'native' : 'quote'; paySel.value = pay;
      // QHooks launches: verified creator, copy warning, RepoProof verdict and on-chain facts (qx-trust.mjs).
      renderRisk(); trustRisk(risk, pool).catch(() => {}); await layout();
    },
    /// Any token, traded through 0x: { chainId, address, symbol, decimals, safety }.
    async setExternal(t) {
      if (busy) return;
      qseq++;
      sellCash = false; funding.clear(); recovery = null; followup.replaceChildren();
      clearArmed(); priceUsd = null;
      st = null; current = null; amount.value = ''; status.textContent = ''; go.disabled = true; out.textContent = 'Loading the token…';
      if (t.chainId === 'solana') {
        st = { ext: true, sol: true, chainId: 'solana', token: t.address, symbol: t.symbol || 'token', decimals: Number(t.decimals ?? 6), quote: SOL_USDC, quoteSymbol: 'USDC', quoteDecimals: 6, safety: t.safety || null };
        paySel.replaceChildren(h('option', { value: 'native' }, 'SOL'), h('option', { value: 'quote' }, 'USDC'));
        pay = 'native'; paySel.value = pay;
        renderRisk(); await layout(); return;
      }
      const meta = t.decimals == null ? await erc20(t.chainId, t.address).catch(() => ({ decimals: 18 })) : { decimals: t.decimals };
      const [qa, qs, qd] = STABLE[t.chainId] || [null, null, null];
      st = { ext: true, chainId: t.chainId, token: t.address, symbol: t.symbol || 'token', decimals: Number(meta.decimals ?? 18), quote: qa, quoteSymbol: qs, quoteDecimals: qd, safety: t.safety || null };
      paySel.replaceChildren(h('option', { value: 'native' }, NATIVE[t.chainId]), ...(qa ? [h('option', { value: 'quote' }, qs)] : []));
      pay = 'native'; paySel.value = pay;
      renderRisk(); await layout();
    },
    setSafety(v) { if (st?.ext) { st.safety = v; renderRisk(); } },
    // The market poll updates this every few seconds; a price tick must not disarm a pending "Confirm $X".
    setPriceUsd(p) { const v = Number(p); priceUsd = Number.isFinite(v) && v > 0 ? v : null; },
    setSide, preset, submit,
    /// Instant buy from the feed: sets the amount in the given unit class and sends once quoted.
    async quickBuy(cls, value) {
      if (!st || busy) return;
      clearArmed();
      side = 'buy'; sellCash = false;
      const native = nativeRoute(st.chainId, st.quote);
      // Any-token tickets with no stable quote (Robinhood Chain) pay in the native coin, their only option.
      pay = st.ext && !st.quote ? 'native' : unitClass(st.quoteSymbol) === cls ? 'quote' : native && unitClass(NATIVE[st.chainId]) === cls ? 'native' : 'quote';
      paySel.value = pay; amount.value = value;
      await layout(); clearTimeout(timer); await quote();
      if (current) await submit();
    },
    get unitClass() { return st ? unitClass(pay === 'native' ? NATIVE[st.chainId] : st.quoteSymbol) : null; }
  };
}
export { unitClass };
