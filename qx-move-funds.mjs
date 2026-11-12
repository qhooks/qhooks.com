import {homeFetch, withHomeRails} from './qx-home-currency.mjs';
import {homeSlippage} from './qx-home-core.mjs';
import {tradeError} from './qx-chain-guard.mjs';
import { chainById } from './chains.mjs';
import { quote, summarize, execute, status } from './qx-relay.mjs';
import { relayWallet, relayRpc, relayFees, relayChainId, gasWithHeadroom } from './qx-relay-wallet.mjs';

export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
export const MOVE_CHAINS = Object.freeze([8453, 1, 42161, 56, 4663, 99901, 143].map(id => chainById(id))); // Includes Monad (MON).
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const DASH = '—';
const lower = value => String(value ?? '').toLowerCase();
const same = (a, b) => lower(a) === lower(b);
const fail = (code, message) => Object.assign(new Error(message), { code });
const ownerAddress = owner => {
  if (!ADDRESS.test(owner ?? '') || same(owner, NATIVE_TOKEN)) throw fail('wallet_disconnected', 'Connect your wallet');
  return owner.toLowerCase();
};
const known = n => typeof n === 'number' && Number.isFinite(n);
const decimal = value => (typeof value === 'string' || typeof value === 'number') && /^\d+(?:\.\d+)?$/.test(String(value)) ? String(value) : null;
const usdNumber = value => decimal(value) !== null && Number.isFinite(Number(value)) ? Number(value) : null;
const money = value => known(value) ? '$' + value.toLocaleString('en-US', { maximumFractionDigits: value > 0 && value < .01 ? 6 : 2, minimumFractionDigits: 2 }) : DASH;
const usdText = value => decimal(value) === null ? DASH : '$' + value;

// Candidates are local registry addresses plus the canonical stablecoins below. An ERC-20 is
// offered only after symbol() AND decimals() answer on its chain; a balance failure stays unknown.
const STABLES = {
  8453: [['USDC', chainById(8453).usdc], ['USDT', '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2']],
  1: [['USDC', chainById(1).usdc], ['USDT', '0xdac17f958d2ee523a2206206994597c13d831ec7']],
  42161: [['USDC', chainById(42161).usdc], ['USDT', '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9']],
  56: [['USDC', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'], ['USDT', '0x55d398326f99059ff775485246999027b3197955']],
  4663: [['USDG', '0x5fc5360d0400a0fd4f2af552add042d716f1d168']],
  99901: [],
  143: [],
};
export const TOKEN_CANDIDATES = Object.freeze(MOVE_CHAINS.flatMap(chain => [
  { chainId: Number(chain.id), address: NATIVE_TOKEN, symbol: chain.native, decimals: 18, native: true, stable: false },
  ...STABLES[chain.id].map(([symbol, address]) => ({ chainId: Number(chain.id), address, symbol, native: false, stable: true })),
]).map(Object.freeze));

export function parseAmount(text, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw fail('invalid_amount', 'Token decimals could not be read.');
  const s = String(text).trim();
  if (s.length > 100 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) throw fail('invalid_amount', 'Enter an amount using numbers and a decimal point.');
  const [whole, fraction = ''] = s.split('.');
  if (fraction.length > decimals) throw fail('invalid_amount', `Use no more than ${decimals} decimal places.`);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

export function formatAmount(units, decimals) {
  const n = BigInt(units), scale = 10n ** BigInt(decimals);
  if (n < 0n) return '-' + formatAmount(-n, decimals);
  return (n / scale).toString() + (decimals ? ('.' + (n % scale).toString().padStart(decimals, '0')).replace(/\.?0+$/, '') : '');
}

/// For display only: at most 6 decimals (amounts sent to Relay stay exact).
export function displayAmount(units, decimals) {
  const [whole, fraction = ''] = formatAmount(units, decimals).split('.');
  const cut = fraction.slice(0, 6).replace(/0+$/, '');
  return whole === '0' && !cut && BigInt(units) > 0n ? '<0.000001' : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (cut ? '.' + cut : '');
}

function decodeSymbol(hex) {
  if (typeof hex !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('Missing symbol');
  const raw = hex.slice(2);
  let bytes;
  if (raw.length === 64) bytes = raw.replace(/(?:00)+$/, ''); // Older USDT implementations use bytes32.
  else {
    const offset = Number(BigInt('0x' + raw.slice(0, 64))) * 2;
    if (!Number.isSafeInteger(offset) || offset < 64 || offset + 64 > raw.length) throw new Error('Invalid symbol');
    const length = Number(BigInt('0x' + raw.slice(offset, offset + 64)));
    if (!Number.isSafeInteger(length) || length < 1 || length > 32 || offset + 64 + length * 2 > raw.length) throw new Error('Invalid symbol');
    bytes = raw.slice(offset + 64, offset + 64 + length * 2);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes.match(/../g) || [], b => parseInt(b, 16)));
}

function uintResult(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(value)) throw new Error('Missing network result');
  return BigInt(value);
}

export async function nativePrices({ fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  // The site's own price route first: the pages' CSP (connect-src) does not allow api.coingecko.com, so a browser call to it
  // always failed and every funding row read "Could not price this pay asset" (pro terminal X1, 2026-11-10).
  const out = {};
  const timed = async (url, init) => { const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try { return await fetchImpl(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); } };
  try {
    const r = await timed('/api/funding/native-prices?symbols=ETH,BNB,HYPE,MON', { credentials: 'omit', cache: 'no-store' });
    if (r.ok) { const p = (await r.json())?.prices || {}; for (const k of ['ETH', 'BNB', 'HYPE', 'MON']) { const v = usdNumber(p[k]); if (v != null) out[k] = v; } }
  } catch {}
  if (out.ETH != null && out.BNB != null) return out;
  try { // Fallback where a direct call is allowed (tests, Node).
    const response = await timed('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin&vs_currencies=usd', { credentials: 'omit', cache: 'no-store' });
    if (response.ok) { const body = await response.json(); out.ETH ??= usdNumber(body?.ethereum?.usd); out.BNB ??= usdNumber(body?.binancecoin?.usd); }
  } catch {}
  return out;
}

/** Read-only; metadata and balance failures are isolated to the token/chain that failed. */
export async function readMoveBalances(owner, { rpc = relayRpc, fetchImpl, prices, stableOnly = false } = {}) {
  owner = ownerAddress(owner);
  const priceTask = stableOnly ? Promise.resolve({}) : prices ? Promise.resolve(prices) : nativePrices({ fetchImpl });
  const reads = TOKEN_CANDIDATES.filter(t => !stableOnly || t.stable).map(async candidate => {
    const token = { ...candidate };
    if (!token.native) {
      const call = data => rpc(token.chainId, 'eth_call', [{ to: token.address, data }, 'latest']);
      const [sym, dec] = await Promise.all([call('0x95d89b41'), call('0x313ce567')]);
      const symbol = decodeSymbol(sym), decimals = Number(uintResult(dec));
      const acceptable = token.symbol === 'USDT' ? ['USDT', 'USDT0', 'USD₮0'] : [token.symbol];
      if (!acceptable.includes(symbol) || decimals > 36) throw new Error('Token metadata does not match');
      token.decimals = decimals;
    }
    try {
      const result = token.native ? await rpc(token.chainId, 'eth_getBalance', [owner, 'latest'])
        : await rpc(token.chainId, 'eth_call', [{ to: token.address, data: '0x70a08231' + owner.slice(2).padStart(64, '0') }, 'latest']);
      token.balance = uintResult(result);
      token.amount = formatAmount(token.balance, token.decimals);
    } catch { token.balance = null; token.amount = null; }
    return token;
  });
  const [results, rates] = await Promise.all([Promise.allSettled(reads), priceTask]);
  const tokens = results.filter(r => r.status === 'fulfilled').map(r => {
    const t = r.value, rate = t.stable ? 1 : rates[t.symbol];
    return { ...t, usd: t.amount !== null && known(rate) && rate > 0 ? Number(t.amount) * rate : null };
  });
  return { tokens, prices: rates,
    partial: results.some(r => r.status === 'rejected') || tokens.some(t => t.balance === null),
    unpriced: tokens.some(t => t.balance > 0n && t.usd === null) };
}

export async function cashTotal(owner, options = {}) {
  const { tokens } = await readMoveBalances(owner, { ...options, stableOnly: true });
  const cash = tokens.filter(t => t.stable && t.balance !== null);
  const places = Math.max(0, ...cash.map(t => t.decimals));
  const total = cash.reduce((sum, t) => sum + t.balance * 10n ** BigInt(places - t.decimals), 0n);
  return { usd: Number(formatAmount(total, places)), byChain: cash.map(t => ({
    chainId: t.chainId, symbol: t.symbol, amount: Number(t.amount), usd: Number(t.amount),
  })) };
}

function preference(value) {
  if (value == null) return null;
  const p = typeof value === 'object' ? value : { chainId: value };
  return { chainId: relayChainId(p.chainId), token: typeof p.token === 'object' ? p.token?.address ?? p.token?.symbol : p.token };
}

function matches(token, p) {
  return token.chainId === p.chainId && (p.token == null || same(token.address, p.token) ||
    same(token.symbol, p.token) || (token.native && same(p.token, 'native')));
}

export function largestBalance(tokens, excludedChain = null) {
  return tokens.filter(t => t.chainId !== excludedChain && t.balance > 0n).slice().sort((a, b) =>
    (b.usd ?? -1) - (a.usd ?? -1))[0] ?? null;
}

function preferred(tokens, value) {
  const p = preference(value);
  if (!p) return null;
  const choices = tokens.filter(t => matches(t, p));
  const chosen = largestBalance(choices) ?? choices[0];
  if (!chosen) throw fail('unsupported_token', 'That token could not be verified on this chain. Choose another token or refresh balances.');
  return chosen;
}

export function selectMoveRoute(tokens, { from, to, moveBack = false } = {}) {
  const origin = preferred(tokens, from) ?? largestBalance(tokens) ?? tokens.find(t => t.native);
  if (!origin) throw fail('balances_unavailable', 'Balances are not available right now. Try refreshing.');
  const destinationChain = origin.chainId === 8453 ? 1 : 8453;
  const destination = preferred(tokens, to) ?? (moveBack ? largestBalance(tokens, origin.chainId) : null)
    ?? tokens.find(t => t.chainId === destinationChain && t.symbol === 'USDC')
    ?? tokens.find(t => t.chainId === destinationChain && t.native);
  return { from: origin, to: destination };
}

export function promptCounts(q) {
  let transactions = 0, signatures = 0;
  for (const step of q?.steps ?? []) {
    if (!Array.isArray(step.items)) continue;
    const count = step.items.filter(item => !['complete', 'completed'].includes(item?.status) && item?.data).length;
    if (step.kind === 'transaction') transactions += count;
    if (step.kind === 'signature') signatures += count;
  }
  return { transactions, signatures, total: transactions + signatures };
}

export function summaryModel(q) {
  const s = summarize(q), counts = promptCounts(q);
  let out = DASH, minimum = DASH;
  const decimals = s.outToken?.decimals;
  if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 && /^\d+$/.test(s.outAmount ?? '')) {
    out = displayAmount(s.outAmount, decimals);
    if (/^\d+$/.test(q.details?.currencyOut?.minimumAmount ?? '')) minimum = displayAmount(q.details.currencyOut.minimumAmount, decimals);
  }
  const time = usdNumber(s.timeSeconds);
  return { outAmount: out, outSymbol: s.outToken?.symbol ?? DASH,
    arrives: out === DASH ? DASH : out + ' ' + (s.outToken?.symbol ?? DASH), minimum,
    relayFeeUsd: s.relayerFeeUsd ?? DASH, gasFeeUsd: s.gasFeeUsd ?? DASH,
    appFeeUsd: s.appFeeUsd ?? DASH, totalFeeUsd: s.feeTotalUsd ?? DASH,
    feeLine: "No QHooks fee. Relay's fee: " + usdText(s.relayerFeeUsd),
    timeSeconds: time ?? DASH, time: time === null ? DASH : time + ' s',
    prompts: q?.steps?.length ? counts.total : DASH, ...counts };
}

export function maxAmount(token, { quote: q, feePerGas } = {}) {
  if (token?.balance == null) throw fail('balances_unavailable', 'Refresh your balance before using Max.');
  let reserve = 0n;
  if (token.native) {
    reserve = parseAmount(token.symbol === 'BNB' ? '0.002' : '0.0005', 18);
    const first = q?.steps?.filter(step => step.kind === 'transaction').flatMap(step => step.items ?? [])
      .find(item => Number(item?.data?.chainId) === token.chainId)?.data;
    try {
      if (first?.gas != null && BigInt(first.gas) > 0n && feePerGas != null && BigInt(feePerGas) > 0n) {
        reserve = gasWithHeadroom(first.gas) * BigInt(feePerGas);
      }
    } catch { /* Keep the native fallback reserve. */ }
  }
  const units = token.balance > reserve ? token.balance - reserve : 0n;
  return { units, amount: formatAmount(units, token.decimals), reserve };
}

export function oneClickAllowed(plan, q, usd) {
  const counts = promptCounts(q);
  const allTransactions = (q?.steps ?? []).filter(s => s.kind === 'transaction').reduce((n, s) => n + (s.items?.length ?? 0), 0);
  return plan?.silent === true && !plan.ticketConfirm && allTransactions === 1 && counts.transactions === 1 &&
    counts.signatures === 0 && known(usd) && usd > 0 && known(plan.capUsd) && usd < plan.capUsd;
}

/** Check ownership before execute() can call ANY wallet method, including switching networks. */
export function assertSelfQuote(q, owner, route) {
  owner = ownerAddress(owner);
  const details = q?.details, order = q?.protocol?.v2?.orderData;
  const recipients = [details?.sender, details?.recipient, details?.refundRecipient, q?.recipient, q?.refundRecipient,
    ...(order?.output?.payments ?? []).map(p => p?.recipient),
    ...(order?.inputs ?? []).flatMap(input => (input?.refunds ?? []).map(r => r?.recipient))];
  if (!ADDRESS.test(details?.sender ?? '') || !ADDRESS.test(details?.recipient ?? '') ||
      recipients.some(value => value != null && !same(value, owner))) {
    throw fail('relay_recipient_mismatch', 'This quote sends funds or refunds to a different address. Nothing was sent. Get a new quote for your own wallet.');
  }
  for (const step of q?.steps ?? []) for (const item of step.items ?? []) {
    if (item?.data?.from != null && !same(item.data.from, owner)) throw fail('relay_recipient_mismatch', 'This quote uses a different wallet. Nothing was sent. Get a new quote.');
  }
  const app = q?.fees?.app;
  if (['amount', 'amountUsd', 'amountFormatted', 'minimumAmount'].some(key => app?.[key] != null &&
      (decimal(app[key]) === null || /[1-9]/.test(String(app[key]))))) {
    throw fail('relay_app_fee', 'This quote includes an app fee. QHooks moves have no QHooks fee. Get a new quote.');
  }
  if (route) {
    const a = details.currencyIn, b = details.currencyOut;
    if (Number(a?.currency?.chainId) !== route.from.chainId || !same(a?.currency?.address, route.from.address) ||
        Number(b?.currency?.chainId) !== route.to.chainId || !same(b?.currency?.address, route.to.address) ||
        Number(a?.currency?.decimals) !== route.from.decimals || Number(b?.currency?.decimals) !== route.to.decimals ||
        String(a?.amount) !== String(route.amount)) throw fail('relay_route_mismatch', 'The quote no longer matches this move. Get a new quote.');
  }
  return q;
}

export function moveError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  if (code.startsWith('home_')) return tradeError(error);
  if (/recipient_mismatch|route_mismatch|app_fee|wallet_changed|wallet_disconnected|wallet_wrong_chain|wallet_chain_missing|wallet_receipt|wallet_reverted|wallet_send_unknown|invalid_wallet_response|invalid_amount|unsupported_token|balances_unavailable|insufficient_balance|same_route|quote_expired/.test(code)) return error.message;
  if (Number(error?.code) === 4001 || code === 'action_rejected') return 'You cancelled in your wallet. Nothing else will be sent.';
  if (/too_small|insufficient_amount|amount_too_low/.test(code)) return 'This amount is too small for the route. Try a larger amount.';
  if (/no_swap_routes|no_routes|unsupported|invalid_currency/.test(code)) return 'This route is not available for that amount. Try a larger amount or another token.';
  if (/timeout|pending/.test(code)) return 'Your move is still being checked. Check its status before starting another move.';
  if (/refund|fallback/.test(code)) return 'Relay reported a refund instead of arrival. Check your balances and the transaction links.';
  if (code === 'relay_failure') return 'Relay could not complete this move. Check its status and your balances before trying again.';
  if (/insufficient funds/i.test(error?.message ?? '')) return 'Keep enough native coin in your wallet for network gas, or try a smaller amount.';
  if (/invalid_quote|invalid_transaction|invalid_signature|invalid_endpoint/.test(code)) return 'Relay returned an incomplete quote. Get a new quote before moving funds.';
  return 'Relay is not available right now';
}

export async function executeMove(q, wallet, options = {}) {
  assertSelfQuote(q, wallet?.address, options.route);
  return execute(q, wallet, options);
}

export function explorerTx(chainId, hash) {
  const chain = MOVE_CHAINS.find(c => Number(c.id) === Number(chainId));
  return chain && HASH.test(hash ?? '') ? chain.explorer + '/tx/' + hash : null;
}

async function browserHub() {
  const { getWalletHub } = await import('./wallet-hub.mjs');
  return getWalletHub(window);
}

const loadOneClick = () => import('./qx-instant-bridge.mjs').catch(() => null);

// A small injectable controller keeps the real dialog path testable with an offline DOM/RPC fixture.
// No DOM, wallet discovery or network work happens merely by importing this module (cashTotal is read-only).
export function createMoveFunds({ document = globalThis.document, target = globalThis.window,
  rpc = relayRpc, fetchImpl = (...args) => globalThis.fetch(...args), getHub = browserHub,
  walletFactory = relayWallet, loadInstant = loadOneClick, prices,
  signIn = async () => (await import('./qx-board-session.mjs')).signIn(),
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  setRepeat = setInterval, clearRepeat = clearInterval } = {}) {
  let view, hub, opener, debounce, interval, stopWatching;
  let revision = 0, quoteRevision = 0;
  const s = { tokens: [], owner: null, entry: null, from: null, to: null, quote: null, quoteAt: 0,
    busy: false, locked: false, finished: false, loading: false, usingMax: false, maxPasses: 0,
    feePerGas: null, requestId: null, sent: false, links: new Set(), run: null };

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    node.append(...children.flat().filter(c => c != null));
    return node;
  }

  function note(text, error = false) {
    view.note.textContent = text;
    view.note.dataset.error = String(error);
  }

  function build() {
    if (view) return;
    if (!document?.body) throw new Error('Move funds needs a browser document.');
    if (!document.getElementById('qmf-styles')) document.head.append(el('link', { id: 'qmf-styles', rel: 'stylesheet', href: new URL('./qx-move-funds.css', import.meta.url).href }));
    const close = el('button', { type: 'button', class: 'qmf-close', 'aria-label': 'Close move funds', onclick: () => view.dialog.close() }, '×');
    const chainSelect = side => el('select', { id: 'qmf-' + side + '-chain', onchange: () => changeChain(side) },
      MOVE_CHAINS.map(c => el('option', { value: c.id }, c.short || c.name)));
    const fromChain = chainSelect('from'), toChain = chainSelect('to');
    const fromToken = el('select', { id: 'qmf-from-token', onchange: () => changeToken('from') });
    const toToken = el('select', { id: 'qmf-to-token', onchange: () => changeToken('to') });
    const pickers = (side, chain, token) => el('div', { class: 'qmf-pickers' },
      el('label', { htmlFor: 'qmf-' + side + '-chain' }, 'Chain', chain),
      el('label', { htmlFor: 'qmf-' + side + '-token' }, 'Token', token));
    const balance = el('p', { class: 'qmf-balance', id: 'qmf-balance' }, 'Reading your balances…');
    const amount = el('input', { id: 'qmf-amount', type: 'text', inputMode: 'decimal', autoComplete: 'off',
      placeholder: '0.00', maxLength: 100, 'aria-describedby': 'qmf-balance qmf-reserve', oninput: () => { s.usingMax = false; edit(); } });
    const max = el('button', { type: 'button', class: 'qmf-max', onclick: useMax }, 'Max');
    const reserve = el('p', { id: 'qmf-reserve', class: 'qmf-help' });
    const arrives = el('strong', { id: 'qmf-arrives', class: 'qmf-arrives' }, DASH);
    const fee = el('p', { class: 'qmf-fee' }, "No QHooks fee. Relay's fee: —");
    const stats = {};
    const summary = el('dl', { class: 'qmf-stats' }, [
      ['minimum', 'Minimum received'], ['gas', 'Estimated network gas'], ['total', 'Estimated total fees'],
      ['time', 'Estimated time'], ['prompts', 'Wallet prompts'],
    ].map(([key, label]) => el('div', {}, el('dt', {}, label), stats[key] = el('dd', {}, DASH))));
    const noteNode = el('p', { class: 'qmf-notice', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const owner = el('code', { class: 'qmf-owner' });
    const move = el('button', { type: 'submit', class: 'qmf-move', disabled: true }, 'Move funds');
    const refresh = el('button', { type: 'button', class: 'qmf-secondary', onclick: () => { void loadBalances().catch(e => note(moveError(e), true)); } }, 'Refresh balances');
    const connect = el('button', { type: 'button', class: 'qmf-secondary', hidden: true, onclick: () => { view.dialog.close(); hub?.open?.(); } }, 'Connect wallet');
    const signin = el('button', { type: 'button', class: 'qmf-secondary', hidden: true, onclick: async () => {
      if (s.signingIn) return;
      s.signingIn = true; signin.disabled = true;
      try { await signIn(); stillOwner(); s.needsSignIn = false; edit(0); }
      catch (error) { note(moveError(error), true); }
      finally { s.signingIn = false; controls(); }
    } }, 'Sign in to move funds');
    const check = el('button', { type: 'button', class: 'qmf-secondary', hidden: true, onclick: () => { void checkSettlement(); } }, 'Check move status');
    const steps = {};
    const progress = el('ol', { class: 'qmf-progress', hidden: true, 'aria-label': 'Move progress' },
      ['Approve', 'Send', 'Bridging…', 'Arrived'].map((label, i) => steps[i] = el('li', { 'data-state': 'waiting' }, label)));
    const links = el('ul', { class: 'qmf-links', 'aria-label': 'Move transactions', hidden: true });
    const form = el('form', { class: 'qmf-form', onsubmit: e => { e.preventDefault(); void press(); } },
      el('fieldset', { class: 'qmf-route' }, el('legend', {}, 'From'), pickers('from', fromChain, fromToken), balance,
        el('label', { class: 'qmf-amount-label', htmlFor: 'qmf-amount' }, 'Amount'), el('div', { class: 'qmf-amount-row' }, amount, max), reserve),
      el('div', { class: 'qmf-direction', 'aria-hidden': 'true' }, '↓'),
      el('fieldset', { class: 'qmf-route' }, el('legend', {}, 'To'), pickers('to', toChain, toToken),
        el('div', { class: 'qmf-receive' }, el('span', {}, 'You receive · estimated'), arrives)),
      el('div', { class: 'qmf-recipient' }, el('span', {}, 'To your own wallet'), owner),
      el('section', { class: 'qmf-summary', 'aria-label': 'Quote and fees' }, fee, summary),
      progress, links, noteNode, move, el('div', { class: 'qmf-actions' }, refresh, connect, signin, check));
    const dialog = el('dialog', { class: 'qmf-dialog', 'aria-labelledby': 'qmf-title', 'aria-describedby': 'qmf-subtitle' },
      el('header', { class: 'qmf-heading' }, el('div', {}, el('p', { class: 'qmf-eyebrow' }, 'Your funds · your wallet'),
        el('h2', { id: 'qmf-title' }, 'Move to another chain')), close),
      el('p', { id: 'qmf-subtitle', class: 'qmf-subtitle' }, 'Choose where your funds go. Relay connects the chains.'), form);
    view = { dialog, fromChain, toChain, fromToken, toToken, amount, balance, reserve, arrives, fee, stats,
      note: noteNode, owner, move, max, refresh, connect, signin, check, progress, steps, links };
    dialog.addEventListener('close', () => {
      if (dialog.dataset.qxUnder) return; // stepped under a wallet confirm (qx-confirm-top.mjs): keep the move running
      clearTimer(debounce); clearRepeat(interval); quoteRevision++; revision++;
      stopWatching?.(); stopWatching = null;
      if (!s.busy) { s.quote = null; s.loading = false; }
      if (opener?.isConnected) opener.focus();
    });
    // Escape is the dialog's native cancel action. It closes without starting or repeating a move.
    document.body.append(dialog);
  }

  function controls() {
    const disabled = s.busy || s.locked || s.loading || !s.owner;
    for (const n of [view.fromChain, view.toChain, view.fromToken, view.toToken, view.amount, view.max]) n.disabled = disabled;
    view.refresh.disabled = s.busy || s.loading || !s.owner;
    view.connect.hidden = !!s.owner;
    view.signin.hidden = !s.needsSignIn || !s.owner;
    view.signin.disabled = disabled || !!s.signingIn;
    view.move.disabled = disabled || s.finished || !s.quote || now() - s.quoteAt >= 20_000;
    view.move.textContent = s.busy ? 'Moving funds…' : s.locked ? 'Check your move below' : s.finished ? 'Choose your next move' : 'Move funds';
    view.check.hidden = !s.requestId || s.busy || !s.locked;
  }

  function fillPickers() {
    for (const side of ['from', 'to']) {
      const token = s[side];
      if (!token) continue;
      view[side + 'Chain'].value = String(token.chainId);
      const select = view[side + 'Token'];
      select.replaceChildren(...s.tokens.filter(t => t.chainId === token.chainId).map(t => el('option', { value: t.address },
        t.symbol + (side === 'from' ? ' · ' + (t.amount === null ? DASH : Number(t.amount).toLocaleString('en-US', { maximumSignificantDigits: 6 })) : ''))));
      select.value = token.address;
    }
    view.balance.textContent = s.from ? 'Available ' + (s.from.amount ?? DASH) + ' ' + s.from.symbol + ' · ' + money(s.from.usd) : 'Balance unavailable';
    view.owner.textContent = s.owner ?? 'Connect your wallet';
    showReserve();
  }

  function showReserve() {
    if (!s.from?.native || s.from.balance === null) { view.reserve.textContent = ''; return; }
    const m = maxAmount(s.from, { quote: s.quote, feePerGas: s.feePerGas });
    view.reserve.textContent = 'Max keeps ' + formatAmount(m.reserve, 18) + ' ' + s.from.symbol + ' for gas' + (s.quote && s.feePerGas !== null ? '.' : ' until gas is estimated.');
  }

  function paintQuote(q) {
    const model = summaryModel(q);
    view.arrives.textContent = model.arrives;
    view.fee.textContent = model.feeLine;
    view.stats.minimum.textContent = model.minimum === DASH ? DASH : model.minimum + ' ' + model.outSymbol;
    view.stats.gas.textContent = usdText(model.gasFeeUsd);
    view.stats.total.textContent = usdText(model.totalFeeUsd);
    view.stats.time.textContent = model.time;
    view.stats.prompts.textContent = String(model.prompts);
  }

  function edit(delay = 500) {
    clearTimer(debounce); quoteRevision++;
    if (s.finished) { view.progress.hidden = true; view.links.hidden = true; }
    s.quote = null; s.finished = false; s.maxPasses = 0;
    paintQuote(null); showReserve(); controls();
    if (!s.busy && !s.locked && view.dialog.open) {
      note(view.amount.value.trim() ? 'Getting your quote…' : 'Enter an amount to see the fees and what arrives.');
      debounce = setTimer(() => { void getQuote(); }, delay);
    }
  }

  function changeChain(side) {
    const choices = s.tokens.filter(t => t.chainId === Number(view[side + 'Chain'].value));
    s[side] = (side === 'from' ? largestBalance(choices) : choices.find(t => t.symbol === 'USDC')) ?? choices[0];
    if (side === 'from') { view.amount.value = ''; s.usingMax = false; s.feePerGas = null; }
    fillPickers(); edit();
  }

  function changeToken(side) {
    s[side] = s.tokens.find(t => t.chainId === s[side].chainId && same(t.address, view[side + 'Token'].value));
    if (side === 'from') { view.amount.value = ''; s.usingMax = false; s.feePerGas = null; }
    fillPickers(); edit();
  }

  function useMax() {
    try {
      const m = maxAmount(s.from, { quote: s.quote, feePerGas: s.feePerGas });
      s.usingMax = true;
      view.amount.value = m.amount;
      edit();
    } catch (e) { note(moveError(e), true); }
  }

  function routeInput() {
    if (!s.from || !s.to) throw fail('unsupported_token', 'Choose a token on each chain.');
    if (s.from.chainId === s.to.chainId && same(s.from.address, s.to.address)) throw fail('same_route', 'Choose a different destination chain or token.');
    const amount = parseAmount(view.amount.value, s.from.decimals);
    if (amount <= 0n) throw fail('invalid_amount', 'Enter an amount greater than zero.');
    if (s.from.balance === null) throw fail('balances_unavailable', 'Refresh your balance before moving funds.');
    if (amount > s.from.balance) throw fail('insufficient_balance', 'That amount is more than your available balance.');
    return { from: s.from, to: s.to, amount: amount.toString() };
  }

  function stillOwner() {
    const c = hub?.snapshot().current;
    if (!c || !same(c.owner, s.owner) || c.entry?.provider !== s.entry?.provider) throw fail('wallet_changed', 'Your wallet changed. Reconnect it and get a new quote.');
    return c;
  }

  async function quoteFetch(url, init) {
    const controller = new AbortController(), timer = setTimer(() => controller.abort(), 12_000);
    try {
      const body = init?.method === 'POST' && init.body ? JSON.parse(init.body) : null;
      const homeRails = s.homeCurrency || [body?.originChainId, body?.destinationChainId].some(id => Number(id) === 143);
      return homeRails && body ? await homeFetch(s.owner, url, {...init, signal: controller.signal}, fetchImpl)
        : await fetchImpl(url, {...init, signal: controller.signal});
    }
    finally { clearTimer(timer); }
  }

  async function getQuote() {
    if (!view.dialog.open || s.busy || s.locked || s.finished || s.loading || !view.amount.value.trim()) return;
    const ticket = ++quoteRevision;
    s.quote = null; controls();
    try {
      stillOwner();
      const route = routeInput();
      const params = { slippageTolerance: String(s.homeSlippage ?? 100), ...(s.homeCurrency ? {homeCurrency: true} : {}), user: s.owner, recipient: s.owner, refundTo: s.owner, originChainId: route.from.chainId,
        destinationChainId: route.to.chainId, originCurrency: route.from.address, destinationCurrency: route.to.address,
        amount: route.amount, tradeType: 'EXACT_INPUT' };
      const [q, fees] = await Promise.all([
        quote(params, { base: '/api/relay', fetchImpl: quoteFetch }),
        route.from.native ? relayFees(route.from.chainId, { rpc }).catch(() => null) : null,
      ]);
      if (ticket !== quoteRevision || !view.dialog.open || s.busy) return;
      stillOwner(); assertSelfQuote(q, s.owner, route);
      if (!q.steps?.length || promptCounts(q).total === 0) throw fail('invalid_quote', 'Relay returned no wallet actions.');
      s.feePerGas = fees ? BigInt(fees.maxFeePerGas ?? fees.gasPrice) : null;
      const max = maxAmount(route.from, { quote: q, feePerGas: s.feePerGas });
      if (s.usingMax && route.from.native && max.amount !== view.amount.value && s.maxPasses < 2) {
        s.maxPasses++; view.amount.value = max.amount;
        note('Updating Max for this route’s network gas…');
        debounce = setTimer(() => { void getQuote(); }, 500);
        return;
      }
      if (BigInt(route.amount) > max.units) throw fail('insufficient_balance', 'Keep some native coin for gas. Tap Max to update the amount.');
      s.quote = q; s.quoteAt = now(); s.needsSignIn = false;
      paintQuote(q); showReserve();
      note('Ready. The quote refreshes every 20 seconds.');
    } catch (error) {
      if (ticket !== quoteRevision || !view.dialog.open) return;
      s.quote = null; s.needsSignIn = error.code === 'home_sign_in'; paintQuote(null); note(moveError(error), true);
    }
    controls();
  }

  async function loadBalances(options = {}) {
    if (s.busy) return;
    const ticket = ++revision;
    quoteRevision++; clearTimer(debounce); s.quote = null; s.loading = true; controls();
    note('Reading balances across chains…');
    try {
      hub ??= await getHub();
      const current = hub.snapshot().current;
      s.owner = ownerAddress(current?.owner); s.entry = current.entry;
      const report = await readMoveBalances(s.owner, { rpc, fetchImpl, prices });
      if (ticket !== revision || !view.dialog.open) return;
      stillOwner(); s.tokens = report.tokens;
      const retained = side => s[side] && s.tokens.some(t => t.chainId === s[side].chainId && same(t.address, s[side].address))
        ? { chainId: s[side].chainId, token: s[side].address } : undefined;
      const selection = selectMoveRoute(s.tokens, { from: options.from ?? retained('from'),
        to: options.to ?? retained('to'), moveBack: !!options.moveBack });
      s.from = selection.from; s.to = selection.to;
      if (options.amount != null) view.amount.value = String(options.amount);
      fillPickers(); paintQuote(null);
      note((report.partial ? 'Some balances could not be read. You can refresh them. ' : '') +
        (report.unpriced ? 'USD prices: Refreshing. ' : '') + 'Enter an amount to see your quote.');
    } catch (error) {
      if (ticket !== revision) return;
      if (error.code === 'wallet_disconnected' || error.code === 'wallet_changed') s.owner = null;
      note(moveError(error), true);
    } finally {
      if (ticket === revision) {
        s.loading = false; controls();
        if (!s.locked && view.amount.value.trim()) debounce = setTimer(() => { void getQuote(); }, 500);
      }
    }
  }

  function addLink(chainId, hash) {
    const href = explorerTx(chainId, hash);
    if (!href || s.links.has(href)) return;
    s.links.add(href); view.links.hidden = false;
    view.links.append(el('li', {}, el('a', { href, target: '_blank', rel: 'noopener noreferrer' },
      (chainById(chainId)?.short ?? 'Transaction') + ' · ' + hash.slice(0, 8) + '…' + hash.slice(-6) + ' ↗')));
  }

  function progress(index, failed = false) {
    view.progress.hidden = false;
    for (let i = 0; i < 4; i++) {
      view.steps[i].dataset.state = i < index ? 'done' : i === index ? failed ? 'error' : index === 3 ? 'done' : 'active' : 'waiting';
      view.steps[i].setAttribute('aria-current', i === index ? 'step' : 'false');
    }
  }

  async function arrived(result, run) {
    progress(3);
    for (const hash of result.outTxHashes ?? result.txHashes ?? []) addLink(run.route.to.chainId, hash);
    s.locked = false; s.finished = true; s.quote = null;
    note('Arrived on ' + chainById(run.route.to.chainId).name + '. Refreshing your balances…');
    const report = await readMoveBalances(run.owner, { rpc, fetchImpl, prices });
    const after = report.tokens.find(t => t.chainId === run.route.to.chainId && same(t.address, run.route.to.address));
    const before = run.route.to.balance;
    const increase = after?.balance != null && before != null && after.balance > before ? formatAmount(after.balance - before, after.decimals) : null;
    note('Arrived on ' + chainById(run.route.to.chainId).name + '. ' + (increase ? '+' + increase + ' ' + after.symbol + ' in your balance. ' : '') +
      (after?.amount != null ? 'Balance: ' + after.amount + ' ' + after.symbol + '.' : 'Balance is not available yet. Refresh to check it.'));
    const c = hub.snapshot().current;
    if (!c || same(c.owner, run.owner)) {
      s.tokens = report.tokens;
      s.from = report.tokens.find(t => t.chainId === run.route.from.chainId && same(t.address, run.route.from.address)) ?? s.from;
      s.to = after ?? s.to; fillPickers();
    }
  }

  async function press() {
    if (s.busy || s.locked || s.loading || !s.quote) return;
    if (now() - s.quoteAt >= 20_000) { edit(0); return; }
    const q = s.quote;
    let wallet;
    s.busy = true; s.sent = false; s.finished = false; s.requestId = null;
    clearTimer(debounce); quoteRevision++; controls();
    try {
      const current = stillOwner(), route = routeInput();
      assertSelfQuote(q, current.owner, route);
      s.run = { owner: s.owner, route, quote: q, step: null, awaitingReceipt: false, transferSubmitted: false, confirmedTransfer: false };
      s.links.clear(); view.links.replaceChildren(); view.links.hidden = true;
      view.steps[0].textContent = q.steps.some(step => /approv|permit|sign/i.test(step.id) || step.kind === 'signature') ? 'Approve' : 'No approval needed';
      progress(0); note('Confirm this move in your wallet.');
      wallet = await walletFactory({ hub, target, rpc, onSigned: () => { s.sent = true; s.run.transferSubmitted = true; }, onSubmitted: ({ chainId, txHash }) => {
        s.run.awaitingReceipt = true;
        if (s.run.step !== 'approve') s.run.transferSubmitted = true;
        s.sent = true; addLink(chainId, txHash); note('Transaction sent. Waiting for its receipt…');
      } });
      if (!same(wallet.address, s.owner)) throw fail('wallet_changed', 'Your wallet changed. Reconnect it and get a new quote.');
      const instant = await loadInstant().catch(() => null);
      stillOwner();
      if (now() - s.quoteAt >= 20_000) throw fail('quote_expired', 'The quote expired. Refresh it before moving funds.');
      const quotedUsd = usdNumber(q.details?.currencyIn?.amountUsd);
      const localUsd = route.from.stable ? Number(formatAmount(route.amount, route.from.decimals))
        : route.from.usd != null && route.from.balance > 0n ? route.from.usd * Number(route.amount) / Number(route.from.balance) : null;
      const usd = quotedUsd === null ? localUsd : localUsd === null ? quotedUsd : Math.max(quotedUsd, localUsd);
      const run = () => executeMove(q, wallet, { route, fetchImpl, base: '/api/relay', onUpdate: update => {
        s.run.step = update.step;
        s.requestId = update.requestId ?? s.requestId;
        const step = q.steps.find(item => item.id === update.step);
        const chainId = step?.items?.find(item => item.data?.chainId)?.data.chainId ?? route.from.chainId;
        if (update.txHash) { s.sent = true; addLink(chainId, update.txHash); }
        if (update.status === 'submitted') {
          s.sent = true; s.run.awaitingReceipt = false;
          if (update.step !== 'approve') { s.run.transferSubmitted = true; s.run.confirmedTransfer = true; }
        }
        const approving = /approv|permit|sign/i.test(update.step ?? '') || update.status === 'awaiting_signature';
        const index = ['switching_chain', 'awaiting_wallet', 'awaiting_signature'].includes(update.status) ? approving ? 0 : 1 : 2;
        progress(index, ['failure', 'refund', 'refunded', 'fallback', 'timeout'].includes(update.status));
        note(index === 0 ? 'Approve in your wallet to continue.' : index === 1 ? 'Confirm the send in your wallet.' : 'Bridging… Relay is checking arrival.');
      } });
      // Moves are like withdrawals: they always keep the wallet's own confirmation screen (never one-click).
      // wallet-hub can temporarily clear its read session during an intentional switch.
      // relayWallet pins the provider/account and rejects disconnects before every send.
      const result = await (s.homeCurrency || route.from.chainId === 143 || route.to.chainId === 143 ? withHomeRails(s.owner, run, {fetchImpl, currentOwner: () => hub?.snapshot().current?.owner ?? s.owner}) : run());
      await arrived(result, s.run);
    } catch (error) {
      if (error.txHash) { s.sent = true; addLink(error.chainId ?? s.from?.chainId, error.txHash); }
      s.requestId = error.requestId ?? s.requestId;
      // A confirmed revert, or cancelling after only confirmed approvals, can be retried with a
      // fresh quote. Pending transactions and submitted transfers must be checked before another move.
      const safeRetry = error.code === 'wallet_reverted' && !s.run?.confirmedTransfer ||
        Number(error.code) === 4001 && !s.run?.transferSubmitted && !s.run?.awaitingReceipt;
      s.locked = (s.sent || error.mayHaveSubmitted === true) && !safeRetry;
      s.finished = s.sent && safeRetry;
      s.quote = null;
      note(moveError(error), true);
    } finally { wallet?.dispose?.(); s.busy = false; controls(); }
  }

  async function checkSettlement() {
    if (!s.requestId || s.busy) return;
    view.check.disabled = true;
    try {
      const result = await status(s.requestId, { fetchImpl: quoteFetch, base: '/api/relay' });
      if (result.status === 'success') await arrived(result, s.run);
      else if (['refund', 'refunded', 'failure', 'fallback'].includes(result.status)) {
        note('Relay reports ' + result.status + '. Review your transaction links and refresh balances before starting another move.', true);
        s.locked = false; s.quote = null; s.finished = true;
      } else note('Bridging… Relay has not confirmed arrival yet. Check again shortly.');
    } catch (error) { note(moveError(error), true); }
    finally { view.check.disabled = false; controls(); }
  }

  function watchWhileOpen() {
    stopWatching?.();
    stopWatching = hub?.subscribe?.(snapshot => {
      if (!s.owner || s.busy || !view.dialog.open) return;
      if (!snapshot.current || !same(snapshot.current.owner, s.owner) || snapshot.current.entry?.provider !== s.entry?.provider) {
        revision++; quoteRevision++; s.quote = null; s.loading = false; s.owner = null;
        note('Your wallet changed. Reopen Move funds after connecting your wallet.', true); controls();
      }
    });
    clearRepeat(interval);
    interval = setRepeat(() => { if (view.dialog.open && !s.busy && !s.locked) void getQuote(); }, 20_000);
  }

  async function open(options = {}) {
    build();
    if (!view.dialog.open) { opener = document.activeElement; view.dialog.showModal(); }
    if (s.busy || s.locked) { watchWhileOpen(); controls(); return view.dialog; }
    const opening = ++revision; quoteRevision++;
    s.homeCurrency = options.homeCurrency === true; s.homeSlippage = homeSlippage(options.slippageBps || 100);
    s.from = null; s.to = null; s.quote = null; s.feePerGas = null; s.finished = false;
    s.usingMax = false; s.requestId = null; s.run = null; s.owner = null; s.needsSignIn = false;
    view.amount.value = ''; view.progress.hidden = true; view.links.hidden = true; paintQuote(null); controls();
    try { hub ??= await getHub(); }
    catch { note('Connect your wallet to move funds.', true); controls(); return view.dialog; }
    if (opening !== revision || !view.dialog.open) return view.dialog;
    watchWhileOpen();
    await loadBalances(options);
    if (view.dialog.open && !view.amount.disabled) view.amount.focus();
    return view.dialog;
  }

  return { openMoveFunds: open, moveBackOffer: ({ chainId, token, amount }) => open({ from: { chainId, token }, amount, moveBack: true }) };
}

let browserController;
const controller = () => browserController ??= createMoveFunds();
export const openMoveFunds = (options = {}) => controller().openMoveFunds(options);
// amount is in token units (e.g. "0.01" ETH), never a raw wei amount.
export const moveBackOffer = options => controller().moveBackOffer(options);
