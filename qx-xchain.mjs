// Funding delivers only to the owner. The existing ticket/order adapter sends the second leg.
// Amounts at the public seams are raw bigint units; Move funds alone takes decimal strings.
import { chainById } from './chains.mjs';
import { quote as relayQuote, summarize, execute } from './qx-relay.mjs';
import { relayRpc, relayFees } from './qx-relay-wallet.mjs';
import { MOVE_CHAINS, TOKEN_CANDIDATES, NATIVE_TOKEN, readMoveBalances, formatAmount, displayAmount,
  assertSelfQuote, promptCounts, maxAmount, openMoveFunds, moveBackOffer } from './qx-move-funds.mjs';

const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const error = (code, message) => Object.assign(new Error(message), { code });
const positive = value => { const n = BigInt(value); if (n <= 0n) throw error('invalid_amount', 'Enter a positive amount.'); return n; };
const min = (a, b) => a < b ? a : b;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export const chainName = id => chainById(id)?.name ?? String(id);
const supported = id => MOVE_CHAINS.some(c => Number(c.id) === Number(id));
const wrapped = MOVE_CHAINS.filter(c => c.wrappedNative).map(c => ({ chainId: Number(c.id),
  address: c.wrappedNative, symbol: 'W' + c.native, decimals: 18, native: false, stable: false }));
const RELAY_DEPOSIT = '0x4cd00e387622c35bddb9b4c962c136462338bc31';

export function fundingAsset(chainId, asset) {
  if (!supported(chainId)) throw error('unsupported_chain', 'Cross-chain funding supports Ethereum, Base, Arbitrum, BNB and Robinhood Chain.');
  const value = typeof asset === 'object' ? asset?.address : asset;
  const token = [...TOKEN_CANDIDATES, ...wrapped].find(t => Number(t.chainId) === Number(chainId) &&
    (same(t.address, value) || same(t.symbol, value) || (t.native && ['native', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'].includes(String(value).toLowerCase()))));
  if (!token) throw error('unsupported_token', 'Cross-chain funding is not available for this pay asset.');
  const decimals = typeof asset === 'object' ? asset.decimals : token.decimals ?? (Number(chainId) === 56 ? 18 : 6);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw error('invalid_amount', 'Token decimals are unavailable.');
  return { ...token, decimals, chainId: Number(chainId) };
}

export async function readAssetBalance(owner, { chainId, asset }, { rpc = relayRpc } = {}) {
  const token = typeof asset === 'object' ? asset : fundingAsset(chainId, asset);
  if (!/^0x[0-9a-f]{40}$/i.test(owner ?? '')) throw error('wallet_disconnected', 'Connect your wallet.');
  return BigInt(await rpc(chainId, token.native || same(token.address, NATIVE_TOKEN) ? 'eth_getBalance' : 'eth_call',
    token.native || same(token.address, NATIVE_TOKEN) ? [owner, 'latest'] :
      [{ to: token.address, data: '0x70a08231' + owner.slice(2).padStart(64, '0') }, 'latest']));
}

export async function readFundingBalances(owner, { rpc = relayRpc, ...options } = {}) {
  const report = await readMoveBalances(owner, { rpc, ...options });
  const extra = await Promise.allSettled(wrapped.map(async token => {
    const balance = await readAssetBalance(owner, { chainId: token.chainId, asset: token }, { rpc });
    const amount = formatAmount(balance, token.decimals), rate = report.prices?.[token.symbol.slice(1)];
    return { ...token, balance, amount, usd: Number.isFinite(rate) ? Number(amount) * rate : null };
  }));
  return { ...report, tokens: [...report.tokens, ...extra.filter(r => r.status === 'fulfilled').map(r => r.value)] };
}

export async function fundingOptions(owner, { chainId, asset, amountNeeded, readBalances = readFundingBalances }) {
  const target = fundingAsset(chainId, asset), needed = positive(amountNeeded);
  const report = await readBalances(owner), tokens = Array.isArray(report) ? report : report.tokens;
  const rate = target.stable ? 1 : report.prices?.[target.symbol.replace(/^W/, '')] ??
    tokens.filter(t => t.symbol === target.symbol && t.balance > 0n && Number.isFinite(t.usd))
      .map(t => t.usd / Number(formatAmount(t.balance, t.decimals)))[0];
  const requiredUsd = Number(formatAmount((needed * 1005n + 999n) / 1000n, target.decimals)) * rate;
  if (!Number.isFinite(requiredUsd) || requiredUsd <= 0) throw error('price_unavailable', 'Could not price this pay asset. Refresh funding options.');
  return tokens.filter(t => supported(t.chainId) && Number(t.chainId) !== Number(chainId) && t.balance > 0n &&
    Number.isFinite(t.usd) && t.usd >= requiredUsd).slice().sort((a, b) => b.usd - a.usd);
}

// An unfunded swap cannot always be simulated. Use a disclosed gas budget at the current gas price;
// adapters with an exact estimate can supply estimatedGasCost instead. Actual send() still estimates gas.
export async function destinationCosts({ owner, chainId, asset, spender, amountNeeded, setup = 0, gasUnits = 650000n }, { rpc = relayRpc } = {}) {
  const token = fundingAsset(chainId, asset);
  const [fees, allowance] = await Promise.all([
    relayFees(chainId, {rpc}),
    token.native ? positive(amountNeeded) : rpc(chainId, 'eth_call', [{ to: token.address,
      data: '0xdd62ed3e' + owner.slice(2).padStart(64, '0') + spender.slice(2).padStart(64, '0') }, 'latest']).then(BigInt),
  ]);
  const gasPrice = BigInt(fees.maxFeePerGas ?? fees.gasPrice);
  if (gasPrice <= 0n) throw error('gas_unavailable', 'Could not estimate destination gas. Refresh the quote.');
  const approvals = allowance < positive(amountNeeded) ? 1 : 0;
  return { approvals, setup, estimatedGasCost: ((BigInt(gasUnits) + BigInt(approvals) * 100000n + BigInt(setup) * 3000000n) * 13n + 9n) / 10n * gasPrice };
}

export async function planFunding({ from, to, amountNeeded, owner, nativeBalance, estimatedGasCost }, {
  readBalance = readAssetBalance, estimateGas = async chainId => 650000n * BigInt(await relayRpc(chainId, 'eth_gasPrice', [])),
} = {}) {
  const origin = fundingAsset(from.chainId, from.asset ?? from), asset = fundingAsset(to.chainId, to.asset);
  if (origin.chainId === asset.chainId) throw error('same_route', 'Choose another chain to fund this trade.');
  if (!/^0x[0-9a-f]{40}$/i.test(owner ?? '') || same(owner, NATIVE_TOKEN)) throw error('wallet_disconnected', 'Connect your wallet.');
  let topupGas = false;
  const needed = positive(amountNeeded), buffered = (needed * 1005n + 999n) / 1000n;
  let deliveryAmount = buffered;
  if (asset.native && estimatedGasCost != null) {
    const balance = BigInt(nativeBalance ?? await readBalance(owner, {chainId: asset.chainId, asset})), cost = BigInt(estimatedGasCost);
    if (cost <= 0n || balance < 0n) throw error('gas_unavailable', 'Could not estimate destination gas.');
    const shortfall = cost - balance - (buffered - needed);
    if (shortfall > 0n) deliveryAmount += shortfall;
  }
  if (!asset.native) {
    const [balance, cost] = await Promise.all([
      nativeBalance ?? readBalance(owner, { chainId: asset.chainId, asset: fundingAsset(asset.chainId, 'native') }),
      estimatedGasCost ?? estimateGas(asset.chainId),
    ]);
    if (BigInt(cost) <= 0n || BigInt(balance) < 0n) throw error('gas_unavailable', 'Could not estimate destination gas.');
    topupGas = BigInt(balance) < 2n * BigInt(cost);
  }
  return { user: owner, recipient: owner, refundTo: owner, originChainId: origin.chainId, destinationChainId: asset.chainId,
    originCurrency: origin.address, destinationCurrency: asset.address,
    amount: deliveryAmount.toString(), tradeType: 'EXACT_OUTPUT', topupGas };
}

export function assertFundingQuote(q, { owner, from, to, amountNeeded, deliveryAmount }) {
  assertSelfQuote(q, owner);
  const input = q.details?.currencyIn, output = q.details?.currencyOut;
  const a = fundingAsset(from.chainId, from.asset ?? from), b = fundingAsset(to.chainId, to.asset);
  if (Number(input?.currency?.chainId) !== a.chainId || !same(input?.currency?.address, a.address) ||
      Number(output?.currency?.chainId) !== b.chainId || !same(output?.currency?.address, b.address) ||
      Number(input?.currency?.decimals) !== a.decimals || Number(output?.currency?.decimals) !== b.decimals ||
      positive(output?.amount) !== (deliveryAmount ?? (positive(amountNeeded) * 1005n + 999n) / 1000n)) {
    throw error('relay_route_mismatch', 'Relay returned a different funding route or amount. Refresh the quote.');
  }
  // No hook/router calls on the destination via Relay: the user sends the swap after delivery.
  if ((q.steps ?? []).some(s => (s.items ?? []).some(i => i?.data &&
      Number(i.data.chainId ?? i.data.sign?.domain?.chainId ?? s.chainId) !== a.chainId))) {
    throw error('relay_route_mismatch', 'Relay must only deliver the pay asset; the swap stays in your wallet.');
  }
  for (const step of q.steps ?? []) for (const item of step.items ?? []) {
    if (step.kind !== 'transaction' || !item.data || ['complete', 'completed'].includes(item.status)) continue;
    const tx = item.data, data = String(tx.data ?? ''), selector = data.slice(0, 10).toLowerCase();
    const words = data.slice(10).match(/.{64}/g) ?? [], address = index => '0x' + (words[index] ?? '').slice(24);
    const deposit = same(tx.to, RELAY_DEPOSIT) && same(address(0), owner) &&
      (a.native ? selector === '0x49290c1c' && data.length === 138 && BigInt(tx.value) === positive(input.amount) :
        selector === '0xe8017952' && data.length === 266 && same(address(1), a.address) && BigInt('0x' + words[2]) === positive(input.amount) && BigInt(tx.value) === 0n);
    const approval = !a.native && same(tx.to, a.address) && selector === '0x095ea7b3' && data.length === 138 &&
      same(address(0), RELAY_DEPOSIT) && BigInt(tx.value) === 0n;
    if (!deposit && !approval) throw error('relay_route_mismatch', 'Relay returned an unfamiliar deposit or approval. Nothing was sent; refresh the funding quote.');
  }
  const fees = summarize(q);
  if (fees.feeTotalUsd === null || fees.appFeeUsd === null || Number(fees.appFeeUsd) !== 0 || !promptCounts(q).total) {
    throw error('relay_fee_unknown', 'Relay fees or wallet steps are unavailable. Refresh the quote before funding.');
  }
  return q;
}

export async function requestFunding(input, { quote = relayQuote, now = Date.now, ...adapters } = {}) {
  const params = await planFunding(input, adapters), q = await quote(params);
  const context = { ...input, to: { chainId: Number(input.to.chainId), asset: fundingAsset(input.to.chainId, input.to.asset) },
    amountNeeded: positive(input.amountNeeded), deliveryAmount: BigInt(params.amount), quotedAt: now() };
  assertFundingQuote(q, context);
  const source = { ...fundingAsset(input.from.chainId, input.from.asset ?? input.from), ...input.from };
  const gas = (q.steps ?? []).flatMap(s => s.items ?? []).find(i => i?.data?.maxFeePerGas)?.data;
  if (source.balance == null || positive(q.details.currencyIn.amount) > maxAmount(source, { quote: q, feePerGas: gas?.maxFeePerGas }).units) {
    throw error('insufficient_balance', 'This funding source cannot cover the quote and its gas reserve. Choose another balance.');
  }
  return { ...q, funding: context };
}

export function fundingPrompts(q, { silent = false, approvals = 0, setup = 0, action = 'swap' } = {}) {
  const relay = promptCounts(q), total = relay.total + approvals + setup + 1;
  const steps = ['Relay' + (relay.total > 1 ? ` (${relay.total})` : ''), ...(setup ? ['setup'] : []),
    ...(approvals ? ['approval'] : []), 'then ' + action];
  return { total: silent ? 0 : total, transactions: relay.transactions + approvals + setup + 1,
    signatures: relay.signatures, text: silent ? 'No wallet prompts' : `${total} prompts: ${steps.join(', ')}` };
}

const emit = (fn, value) => { try { const result = fn?.(value); result?.catch?.(() => {}); } catch {} };
export async function runCrossChainBuy({ quote, wallet, readBalance = readAssetBalance, swap, onStep,
  execute: executeRelay = execute, sleep = pause, now = Date.now, pollMs = 1500, timeoutMs = 180000 }) {
  const context = quote?.funding;
  if (!context || !same(wallet?.address, context.owner)) throw error('wallet_changed', 'Your wallet changed. Refresh the funding quote.');
  assertFundingQuote(quote, context); // Before even a wallet network switch.
  if (now() - context.quotedAt > 30000 || now() < context.quotedAt) throw error('quote_expired', 'Funding quote expired. Refresh it before buying.');
  if (!(timeoutMs > 0 && timeoutMs <= 180000 && pollMs > 0)) throw error('invalid_options', 'Arrival polling must finish within three minutes.');
  const { owner, to: { chainId, asset }, amountNeeded } = context;
  const before = BigInt(await readBalance(owner, { chainId, asset }));
  emit(onStep, { step: 'relay', message: '1/2 · Delivering ' + asset.symbol + ' to your wallet on ' + chainName(chainId) + '…' });
  // A submitted-but-unconfirmed Relay leg must not start a new delivery or swap automatically.
  await executeRelay(quote, wallet, { onUpdate: update => emit(onStep, { step: 'relay', ...update }) });
  emit(onStep, { step: 'arrival', message: '1/2 · Waiting for your destination balance…' });
  const deadline = now() + timeoutMs;
  let arrived = 0n, timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(error('arrival_pending',
    'Arrival is still being checked. Check your wallet on ' + chainName(chainId) + ' before starting another delivery.')), timeoutMs); });
  try {
    while (now() < deadline) {
      try { const balance = BigInt(await Promise.race([readBalance(owner, { chainId, asset }), timeout])); arrived = balance > before ? balance - before : 0n; }
      catch (e) { if (e.code === 'arrival_pending') throw e; }
      if (arrived > 0n) break;
      await Promise.race([sleep(Math.min(pollMs, Math.max(0, deadline - now()))), timeout]);
    }
    if (!arrived) throw error('arrival_pending', 'Arrival is still being checked. Check your wallet on ' + chainName(chainId) + ' before starting another delivery.');
  } finally { clearTimeout(timer); }
  const amount = min(arrived, positive(amountNeeded));
  emit(onStep, { step: 'swap', amount, message: '2/2 · Using the amount that arrived…' });
  try {
    const result = await swap(amount);
    emit(onStep, { step: 'complete', amount });
    return { landed: true, completed: true, chainId, asset, amount: arrived, spent: amount, result };
  } catch (cause) {
    const result = { landed: true, completed: false, chainId, asset, amount: arrived, spendAmount: amount, owner,
      origin: context.from, error: cause, retryable: !cause?.mayHaveSubmitted && !/pending|receipt_unknown|send_unknown/.test(String(cause?.code ?? '') + ' ' + String(cause?.message ?? '').toLowerCase()) };
    emit(onStep, { step: 'landed', ...result });
    return result;
  }
}

export const runFundedOrder = ({ setup, place, ...options }) => runCrossChainBuy({ ...options,
  swap: async amount => { await setup(); return place(amount); } });

export async function retryLanded(result, { owner, readBalance = readAssetBalance, swap }) {
  if (result.retryable === false) throw error('swap_pending', 'Check the pending swap in your wallet before trying another trade.');
  if (!same(owner, result.owner)) throw error('wallet_changed', 'Reconnect the wallet that received these funds.');
  const balance = BigInt(await readBalance(owner, result));
  const amount = min(balance, min(positive(result.amount), positive(result.spendAmount)));
  if (!amount) throw error('insufficient_balance', 'These funds are no longer available in this wallet.');
  return swap(amount); // An explicit retry never repeats Relay.
}

export function cashAsset(chainId) {
  const symbol = Number(chainId) === 56 ? 'USDT' : Number(chainId) === 4663 ? 'USDG' : 'USDC';
  return fundingAsset(chainId, symbol);
}
const storage = () => { try { return globalThis.localStorage; } catch { return null; } };
export function cashHome(store = storage()) {
  try { const value = Number(store?.getItem('qhooks:cash:home')); return supported(value) ? value : null; } catch { return null; }
}
export function cashSettings(h, store = storage()) {
  const select = h('select', { ariaLabel: 'Cash home' }, h('option', { value: '' }, 'Off (stay on the same chain)'),
    ...MOVE_CHAINS.map(c => h('option', { value: c.id }, c.name)));
  select.value = String(cashHome(store) ?? '');
  select.addEventListener('change', () => { try { if (select.value) store?.setItem('qhooks:cash:home', select.value); else store?.removeItem('qhooks:cash:home'); } catch {} });
  return h('details', { class: 'qxc-settings' }, h('summary', {}, 'Keep my balance in USDC'), h('label', {}, 'After a sale, offer to move it to ', select,
    h('small', {}, 'USDT on BNB Chain, USDG on Robinhood Chain. Nothing moves without your press.')));
}

export function moveProceeds({ chainId, asset, amount, home = cashHome() }, open = openMoveFunds) {
  const destination = cashAsset(home ?? chainId);
  return open({ from: { chainId, token: asset.address }, amount: formatAmount(amount, asset.decimals),
    ...(home || !same(asset.address, destination.address) ? { to: { chainId: home ?? Number(chainId), token: destination.address } } : {}) });
}

export function offerMoveBack({ chainId, asset, amount, origin }, { moveBack = moveBackOffer, open = openMoveFunds } = {}) {
  const options = { chainId, token: asset.address, amount: formatAmount(amount, asset.decimals) };
  // moveBackOffer has no destination parameter. Use the existing prefilled dialog for an exact origin.
  return origin ? open({ from: { chainId, token: asset.address }, to: { chainId: origin.chainId, token: origin.address }, amount: options.amount }) : moveBack(options);
}

export async function cancelWithRefund({ owner, chainId, asset, origin, cancel, readBalance = readAssetBalance, offer }) {
  const before = BigInt(await readBalance(owner, { chainId, asset }));
  await cancel();
  const after = BigInt(await readBalance(owner, { chainId, asset })), amount = after > before ? after - before : 0n;
  if (amount > 0n && origin) offer({ chainId, asset, amount, origin });
  return amount;
}

const originKey = (owner, chainId, id) => `qhooks:funded-order:${owner.toLowerCase()}:${chainId}:${id}`;
export function orderOrigin(owner, chainId, id, origin, store = storage()) {
  try {
    const key = originKey(owner, chainId, id);
    if (origin !== undefined) { store?.setItem(key, JSON.stringify({ chainId: Number(origin.chainId), address: origin.address })); return origin; }
    const value = JSON.parse(store?.getItem(key) ?? 'null');
    return value && supported(value.chainId) && /^0x[0-9a-f]{40}$/i.test(value.address) ? value : null;
  } catch { return null; }
}

export function recoveryView(h, result, retry) {
  const button = h('button', { type: 'button', class: 'qxt-mini', disabled: result.retryable === false }, 'Retry');
  button.addEventListener('click', retry);
  const back = h('button', { type: 'button', class: 'qxt-mini' }, 'Move back');
  back.addEventListener('click', () => { void offerMoveBack(result).catch(e => { note.textContent = e.message; }); });
  const note = h('span', {}, 'Your ' + formatAmount(result.amount, result.asset.decimals) + ' ' + result.asset.symbol +
    ' arrived on ' + chainName(result.chainId) + (result.retryable === false ? '. Check the pending swap in your wallet before retrying or moving these funds. ' : ' and is in your wallet there. ') + (result.error?.message ?? ''));
  if (result.retryable === false) back.disabled = true;
  return h('div', { class: 'qxc-recovery', role: 'status' }, note, button, back);
}

export function loadFundingStyle(document = globalThis.document) {
  if (!document?.getElementById('qxc-style')) {
    const link = document.createElement('link'); link.id = 'qxc-style'; link.rel = 'stylesheet'; link.href = '/qx-xchain.css'; document.head.append(link);
  }
}

// Compact shared row. Revision checks discard quotes for an edited amount, source, chain or wallet.
export function createFundingRow({ h, onChange = () => {}, action = 'swap', getPlan = () => ({}),
  readBalance = readAssetBalance, options = fundingOptions, request = requestFunding, now = Date.now }) {
  let revision = 0, input = null, active = null, required = false, busy = false;
  const select = h('select', { ariaLabel: 'Funding source' }), line = h('span'), detail = h('span'), prompts = h('span');
  const reload = h('button', { type: 'button', class: 'qxt-mini' }, 'Refresh funding');
  const element = h('div', { class: 'qxc-funding', hidden: true }, h('b', {}, action === 'order' ? 'Fund this order from another chain' : 'Pay from another chain'), select, line, detail, prompts, reload);
  function notify() { onChange({ quote: active, required, ready: !required || !!active }); }
  function clear() { revision++; active = null; input = null; required = false; element.hidden = true; notify(); }
  async function pick(mine) {
    active = null; notify();
    line.textContent = 'Getting Relay fees…'; detail.textContent = ''; prompts.textContent = '';
    try {
      const from = input.choices[Number(select.value)];
      const quote = await request({ ...input, from, to: { chainId: input.chainId, asset: input.asset }, estimatedGasCost: input.costs.estimatedGasCost });
      if (mine !== revision) return;
      active = quote;
      const summary = summarize(quote), prefix = action === 'order' ? 'Fund from ' : 'Pay with ';
      select.options[select.selectedIndex].textContent = prefix + displayAmount(summary.inAmount, from.decimals) + ' ' + from.symbol + ' on ' + chainName(from.chainId);
      // Plain line first; the provider breakdown stays in the hover detail.
      line.textContent = `Moving cost ≈ $${summary.feeTotalUsd} · arrives in about ${summary.timeSeconds ?? 20} s · a little extra ${chainById(input.chainId).native} is kept for gas.`;
      line.title = `Bridge provider: Relay · its fee $${summary.relayerFeeUsd} · network gas $${summary.gasFeeUsd} · no QHooks fee`;
      detail.textContent = `Includes a 0.5% buffer; anything unused stays in your wallet. Gas kept on ${chainById(input.chainId).name}: about ${formatAmount(input.costs.estimatedGasCost, 18)} ${chainById(input.chainId).native}.`;
      prompts.textContent = fundingPrompts(quote, { ...input.costs, ...getPlan(quote), action }).text + ' · Your wallet may also ask to switch networks.';
    } catch (e) { if (mine !== revision) return; line.textContent = e.message; }
    notify();
  }
  async function update(next) {
    const mine = ++revision; input = next; active = null; required = true; notify();
    element.hidden = false; select.replaceChildren(); line.textContent = 'Reading funding balances…'; detail.textContent = ''; prompts.textContent = '';
    try {
      const balance = next.balance ?? await readBalance(next.owner, { chainId: next.chainId, asset: next.asset });
      if (mine !== revision) return;
      if (BigInt(balance) >= positive(next.amountNeeded)) { required = false; element.hidden = true; notify(); return; }
      const [choices, costs] = await Promise.all([options(next.owner, next), next.review()]);
      if (mine !== revision) return;
      input = { ...next, choices, costs };
      select.replaceChildren(...choices.map((t, i) => h('option', { value: String(i) }, `${displayAmount(t.balance, t.decimals)} ${t.symbol} on ${chainName(t.chainId)}`)));
      if (!choices.length) throw error('insufficient_balance', 'No other-chain balance can cover this amount.');
      select.value = '0'; await pick(mine);
    } catch (e) { if (mine === revision) { line.textContent = e.message; notify(); } }
  }
  select.addEventListener('change', () => { if (!busy) void pick(++revision); });
  reload.addEventListener('click', () => { if (!busy && input) void update(input); });
  return { element, update, clear, get quote() { return active; }, get required() { return required; },
    fresh() { return active && now() - active.funding.quotedAt <= 30000; },
    setBusy(value) { busy = value; select.disabled = value; reload.disabled = value; } };
}
