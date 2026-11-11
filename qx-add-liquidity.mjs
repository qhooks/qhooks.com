import {keccakHex} from './qdrops-core.mjs';

export const CHAIN_ID = '4663';
export const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
export const LIQUIDITY = '0x2E4fBB8E6341faAB7b2c9d4E1734B4EF74D31Bf9';
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const MIN_AMOUNT = 1000000000000n;
export const DISCLOSURE = "This adds to QHOOKS's permanent liquidity. It can't be withdrawn by anyone, including you, and it doesn't earn you LP fees. 20% goes to the buy floor and 80% into ranges around the price, added over the next runs.";
export const EXCLUDED_SENDERS = Object.freeze([
  '0x2b1Cf7c4071A98A59709166DFA73C7acb7E83E71',
  '0xb85E67cf7728572033A9d36aEe3218DadF85bAA2',
  '0x8366a39CC670B4001A1121B8F6A443A643e40951',
  '0x1981e861c483A1c93D731C7443BcDE910a5aAbd8', LIQUIDITY,
].map(a => a.toLowerCase()));
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const address = a => { if (!/^0x[0-9a-f]{40}$/i.test(a || '')) throw Error('Invalid wallet address'); return a; };
const hex = n => '0x' + BigInt(n).toString(16);
const word = n => { n = BigInt(n); if (n < 0n || n >= 1n << 256n) throw Error('Amount is too large'); return n.toString(16).padStart(64, '0'); };
const uint = h => { if (!/^0x[0-9a-f]+$/i.test(h || '')) throw Error('Incomplete network read. Refresh to try again.'); return BigInt(h); };
export const addressTopic = a => '0x' + address(a).slice(2).toLowerCase().padStart(64, '0');
export const depositData = () => '0xd0e30db0';
export const transferData = amount => '0xa9059cbb' + addressTopic(LIQUIDITY).slice(2) + word(amount);
export const balanceData = owner => '0x70a08231' + addressTopic(owner).slice(2);

export function parseAmount(text) {
  const s = String(text).trim();
  if (s.length > 100 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) throw Error('Enter an ETH amount using digits and a decimal point.');
  const [whole = '', fraction = ''] = s.split('.');
  if (fraction.length > 18) throw Error('Use at most 18 decimal places.');
  const n = BigInt(whole || '0') * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  if (n < MIN_AMOUNT) throw Error('Enter at least 0.000001 ETH.');
  word(n); return n;
}
export function formatAmount(n, digits = 18) {
  n = BigInt(n);
  const f = (n % (10n ** 18n)).toString().padStart(18, '0').slice(0, digits).replace(/0+$/, '');
  return (n / (10n ** 18n)).toString() + (f ? '.' + f : '');
}
export function maxAmount({eth, weth}, reserve) {
  return weth + (eth > reserve ? eth - reserve : 0n);
}
export function contributionPlan(amount, {eth, weth}, reserve = 0n) {
  if (amount < MIN_AMOUNT) throw Error('Enter at least 0.000001 ETH.');
  const wrap = amount > weth ? amount - weth : 0n;
  if (eth < wrap || eth - wrap < reserve) throw Error('Keep more ETH for network gas, or lower the amount.');
  return {amount, wrap, calls: [
    ...(wrap ? [{to: WETH, data: depositData(), value: hex(wrap)}] : []),
    {to: WETH, data: transferData(amount), value: '0x0'},
  ]};
}
export function supportsAtomic(capabilities) {
  const c = capabilities?.['0x1237'] || capabilities?.[CHAIN_ID];
  return c?.atomic?.status === 'supported' || c?.atomic?.status === 'ready' || c?.atomicBatch?.supported === true;
}
export const sendMode = (plan, atomic) => plan.wrap && atomic ? 'atomic' : plan.wrap ? 'wrap' : 'transfer';

export function revertReason(error) {
  const data = error?.data?.data || error?.data?.originalError?.data || error?.data;
  if (typeof data === 'string' && /^0x08c379a0[0-9a-f]+$/i.test(data)) {
    try {
      const size = Number(BigInt('0x' + data.slice(74, 138)));
      if (size > 0 && size <= 240 && data.length >= 138 + size * 2) return new TextDecoder().decode(Uint8Array.from(data.slice(138, 138 + size * 2).match(/../g), b => parseInt(b, 16)));
    } catch { /* Use the node's reason below. */ }
  }
  return String(error?.message || 'The network could not check this step. Try again.').slice(0, 240);
}

// Same read relay as the setup page, with transaction reads kept out of its display cache.
// Coalesced JSON-RPC arrays stay below its 20-call/16 KiB limits. Each browser request has
// bounded work; no per-contributor upstream requests (the Worker has a 256-subrequest cap).
const PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com';
export function createRelayClient({fetchImpl = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), interval = 550, now = Date.now} = {}) {
  let sequence = 0, last = -Infinity, pending = [], scheduled = false, tail = Promise.resolve();
  async function drain(tasks) {
    const pause = interval - (now() - last); if (pause > 0) await sleep(pause);
    last = now();
    try {
      const transaction = tasks.some(t => t.purpose === 'transaction');
      const body = JSON.stringify(tasks.map(({id, method, params}) => ({jsonrpc: '2.0', id, method, params})));
      const post = (url, headers = {}) => fetchImpl(url, {method: 'POST', headers: {'content-type': 'application/json', ...headers}, signal: AbortSignal.timeout(12000), body});
      // The site relay first; when it refuses (HTTP error or a 429 inside the answer), the same reads go to Robinhood
      // Chain's public RPC (allowed by the site CSP). Lead review 2026-11-11: the relay answered 429 and the total never loaded.
      let entries = null;
      try {
        const response = await post('/api/rpc/4663', {'x-qhooks-read-purpose': transaction ? 'transaction' : 'display'});
        if (response.ok) { const j = await response.json(); if (Array.isArray(j) && !j.some(e => e?.error?.code === 429)) entries = j; }
      } catch {}
      if (!entries) {
        const response = await post(PUBLIC_RPC);
        if (!response.ok) throw Error('Could not read the network. Refresh to try again.');
        entries = await response.json();
      }
      if (!Array.isArray(entries) || entries.length !== tasks.length) throw Error('Incomplete network response. Refresh to try again.');
      const byId = new Map(entries.map(e => [e.id, e]));
      if (byId.size !== tasks.length || tasks.some(t => !byId.has(t.id))) throw Error('Incomplete network response. Refresh to try again.');
      for (const t of tasks) {
        const entry = byId.get(t.id);
        if (entry.error) {
          const e = Object.assign(Error(entry.error.message || 'The network refused this read.'), {data: entry.error.data, code: entry.error.code});
          // A contract refusal is an answer, never a reason to retry another provider.
          t.reject(t.method === 'eth_estimateGas' || /revert/i.test(e.message) ? Error('This step would fail: ' + revertReason(e)) : Error('Could not read the network. Refresh to try again.'));
        } else if (!Object.hasOwn(entry, 'result') || entry.result == null && t.method !== 'eth_getTransactionReceipt') t.reject(Error('Incomplete network response. Refresh to try again.'));
        else t.resolve(entry.result);
      }
    } catch (e) { for (const t of tasks) t.reject(e); }
  }
  function flush() {
    scheduled = false;
    while (pending.length) {
      const tasks = pending.splice(0, 20);
      tail = tail.then(() => drain(tasks));
    }
  }
  return {rpc(method, params = [], purpose = 'transaction') {
    const promise = new Promise((resolve, reject) => pending.push({id: ++sequence, method, params, purpose, resolve, reject}));
    if (!scheduled) { scheduled = true; queueMicrotask(flush); }
    return promise;
  }};
}

export async function readBalances(rpc, owner) {
  const [eth, weth, price] = await Promise.all([
    rpc('eth_getBalance', [address(owner), 'pending']),
    rpc('eth_call', [{to: WETH, data: balanceData(owner)}, 'pending']),
    rpc('eth_gasPrice', []),
  ]);
  const gasPrice = uint(price); if (!gasPrice) throw Error('Could not estimate network gas. Try again.');
  return {eth: uint(eth), weth: uint(weth), gasPrice};
}
export function balanceSlot(owner, slot) {
  const h = addressTopic(owner).slice(2) + word(slot);
  return keccakHex(Uint8Array.from(h.match(/../g), b => parseInt(b, 16)));
}

// For a wrap+transfer estimate only: prove the balance mapping by a balanceOf read
// with two distinct values. The override is read-only and is NEVER sent to a wallet.
// If the RPC cannot check the post-wrap state we refuse the combined send.
export async function postWrapOverride(rpc, owner, amount) {
  const probe = async slot => {
    const key = balanceSlot(owner, slot), override = value => ({[WETH]: {stateDiff: {[key]: '0x' + word(value)}}});
    const sentinel = amount + 123456789n;
    const got = await rpc('eth_call', [{to: WETH, data: balanceData(owner)}, 'latest', override(sentinel)]);
    if (uint(got) !== sentinel) return null;
    const checked = await rpc('eth_call', [{to: WETH, data: balanceData(owner)}, 'latest', override(sentinel + 1n)]);
    return uint(checked) === sentinel + 1n ? override(amount) : null;
  };
  // Standard WETH's balance mapping is slot 3; discover rather than trusting that layout.
  let found = await probe(3); if (found) return found;
  for (let start = 0; start < 16; start += 4) {
    const results = await Promise.all(Array.from({length: 4}, (_, i) => start + i).filter(s => s !== 3).map(probe));
    found = results.find(Boolean); if (found) return found;
  }
  throw Error('Could not check the WETH balance after wrapping. Try again.');
}
export async function estimateCall(rpc, owner, call, override) {
  const tx = {from: address(owner), ...call};
  const params = override ? [tx, 'latest', override] : [tx];
  let estimate;
  try { estimate = uint(await rpc('eth_estimateGas', params)); }
  catch (e) { throw Error(revertReason(e)); }
  if (!estimate) throw Error('Could not estimate network gas. Try again.');
  return {...tx, gas: hex((estimate * 13n + 9n) / 10n)};
}
export async function prepareContribution({rpc, owner, amount, balances, atomic = false, enforceReserve = true}) {
  const plan = contributionPlan(amount, balances), mode = sendMode(plan, atomic);
  const override = plan.wrap ? await postWrapOverride(rpc, owner, amount) : null;
  const transactions = [];
  for (const call of plan.calls) transactions.push(await estimateCall(rpc, owner, call, call.data.startsWith('0xa9059cbb') ? override : null));
  // Cap the fee used by standalone sends; double the capped estimate is left in ETH.
  // Nitro's eth_estimateGas includes its data fee. Allow extra wallet batch execution gas.
  const feeCap = balances.gasPrice * 2n;
  const units = transactions.reduce((n, tx) => n + uint(tx.gas), 0n) + (mode === 'atomic' ? 100000n : 0n);
  const reserve = units * feeCap * 2n;
  if (enforceReserve) contributionPlan(amount, balances, reserve);
  return {...plan, mode, reserve, feeCap, transactions: transactions.map(tx => ({...tx, gasPrice: hex(feeCap), chainId: '0x1237'}))};
}
export async function estimateMax({rpc, owner, balances, atomic = false}) {
  // Estimate with a tiny deposit, leaving actual spendable ETH to the reserve calculation.
  const amount = balances.weth + (balances.eth >= MIN_AMOUNT ? MIN_AMOUNT : 0n);
  if (amount < MIN_AMOUNT) return {max: 0n, reserve: 0n};
  const plan = await prepareContribution({rpc, owner, amount, balances, atomic, enforceReserve: false});
  return {max: maxAmount(balances, plan.reserve), reserve: plan.reserve};
}
export function captureConnection(hub) {
  const captured = hub.snapshot().current;
  if (!captured) throw Error('Connect your wallet first.');
  if (String(captured.chainId) !== CHAIN_ID) throw Error('Switch to Robinhood Chain first.');
  const provider = captured.entry.provider, owner = address(captured.owner);
  const assert = () => {
    const s = hub.snapshot(), now = s.current;
    if (s.busy || !same(now?.owner, owner) || now?.entry?.provider !== provider || String(now?.chainId) !== CHAIN_ID) throw Error('Your wallet changed. Review the amount again.');
  };
  async function check() {
    assert();
    const [accounts, chain] = await Promise.all([provider.request({method: 'eth_accounts'}), provider.request({method: 'eth_chainId'})]);
    assert();
    if (!same(accounts?.[0], owner) || uint(chain) !== 4663n) throw Error('Your wallet changed. Switch to Robinhood Chain and review again.');
  }
  return {owner, provider, assert, check};
}
export async function readAtomic(connection) {
  await connection.check();
  try { const caps = await connection.provider.request({method: 'wallet_getCapabilities', params: [connection.owner, ['0x1237']]}); connection.assert(); return supportsAtomic(caps); }
  catch { connection.assert(); return false; }
}

export async function waitReceipt(rpc, hash, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  if (!/^0x[0-9a-f]{64}$/i.test(hash || '')) throw Error('Check your wallet activity before trying again.');
  for (let i = 0; i < 90; i++) {
    const r = await rpc('eth_getTransactionReceipt', [hash]);
    if (r) { if (uint(r.status) !== 1n) throw Error('The transaction did not complete. Check your wallet activity.'); return r; }
    await sleep(2000);
  }
  throw Error('Still pending. Check your wallet activity, then refresh.');
}

// One click performs at most one wallet operation. In two-step mode, a confirmed wrap
// returns to the page; sending WETH always needs its own press and fresh simulation.
export async function executeContribution({hub, rpc, amount, atomicSend, expected, atomicAllowed = true, onStatus = () => {}, onSubmitted = () => {}, sleep}) {
  const connection = captureConnection(hub); await connection.check();
  const balances = await readBalances(rpc, connection.owner), atomic = atomicAllowed && await readAtomic(connection);
  const plan = await prepareContribution({rpc, owner: connection.owner, amount, balances, atomic});
  if (expected && (plan.wrap !== expected.wrap || plan.mode !== expected.mode)) throw Error('Your balance or wallet steps changed. Review the amount again.');
  await connection.check();
  if (plan.mode === 'atomic') {
    onStatus('Confirm both steps in your wallet');
    // qx-chain owns capability detection, atomicRequired, network guard and batch receipts.
    onSubmitted({kind: 'atomic', amount: String(amount)});
    const receipts = await atomicSend(CHAIN_ID, plan.calls, onStatus, connection.assert);
    if (receipts !== null) {
      if (!receipts.length || receipts.some(r => uint(r.status) !== 1n || !/^0x[0-9a-f]{64}$/i.test(r.transactionHash || ''))) throw Error('Check your wallet activity, then refresh to read the result.');
      return {kind: 'added', receipts};
    }
    // A null result guarantees the helper sent nothing (capability changed).
    onSubmitted(null);
    return {kind: 'review', receipts: []};
  }
  const tx = plan.transactions[0];
  // A transfer is estimated against real state; wrap simulation uses only the shortfall.
  await connection.check();
  onStatus(plan.mode === 'wrap' ? 'Confirm the wrap in your wallet' : 'Confirm the WETH transfer in your wallet');
  onSubmitted({kind: plan.mode, amount: String(amount)});
  connection.assert();
  const hash = await connection.provider.request({method: 'eth_sendTransaction', params: [tx]});
  onSubmitted({kind: plan.mode, amount: String(amount), hash});
  const receipt = await waitReceipt(rpc, hash, sleep);
  return {kind: plan.mode === 'wrap' ? 'wrapped' : 'added', receipts: [receipt]};
}

const DEPLOY_KEY = 'qhooks:add-liquidity:4663:deploy:' + LIQUIDITY.toLowerCase();
const hasCode = value => { if (!/^0x(?:[0-9a-f]{2})*$/i.test(value || '')) throw Error('Incomplete contract read. Refresh to try again.'); return value !== '0x'; };
export async function findDeployBlock(rpc, head, storage) {
  head = BigInt(head);
  let hint; try { hint = storage?.getItem(DEPLOY_KEY); } catch { /* Storage is optional. */ }
  if (/^\d{1,20}$/.test(hint || '') && BigInt(hint) <= head) {
    const h = BigInt(hint), [here, before] = await Promise.all([
      rpc('eth_getCode', [LIQUIDITY, hex(h)], 'display'), h ? rpc('eth_getCode', [LIQUIDITY, hex(h - 1n)], 'display') : '0x',
    ]);
    if (hasCode(here) && !hasCode(before)) return h;
  }
  if (!hasCode(await rpc('eth_getCode', [LIQUIDITY, hex(head)], 'display'))) throw Error('The liquidity contract is not on this block. Refresh to try again.');
  let lo = 0n, hi = head;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (hasCode(await rpc('eth_getCode', [LIQUIDITY, hex(mid)], 'display'))) hi = mid; else lo = mid + 1n;
  }
  try { storage?.setItem(DEPLOY_KEY, String(lo)); } catch { /* Storage is optional. */ }
  return lo;
}
export function sumContributions(logs) {
  let total = 0n; const transactions = new Set(), seen = new Set();
  for (const log of logs) {
    if (log.removed || !same(log.address, WETH) || !same(log.topics?.[0], TRANSFER_TOPIC) || !same(log.topics?.[2], addressTopic(LIQUIDITY))) continue;
    if (!/^0x0{24}[0-9a-f]{40}$/i.test(log.topics?.[1] || '') || !/^0x[0-9a-f]{64}$/i.test(log.data || '') || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash || '') || !/^0x[0-9a-f]+$/i.test(log.logIndex || '')) throw Error('Incomplete contributor read. Refresh to try again.');
    const sender = '0x' + log.topics[1].slice(-40).toLowerCase(), amount = BigInt(log.data);
    if (EXCLUDED_SENDERS.includes(sender) || amount === 0n) continue;
    const key = log.transactionHash.toLowerCase() + ':' + BigInt(log.logIndex);
    if (seen.has(key)) continue; seen.add(key);
    total += amount; transactions.add(log.transactionHash.toLowerCase());
  }
  return {total, count: transactions.size};
}
// v2's deploy block (verified 2026-11-11: code first appears there; a wider range returns the same logs). Lead fix after
// release: the relay answered each wide eth_getLogs slowly and the deploy-block search needed archive state the public
// RPC doesn't keep, so the total never loaded. Now: one eth_getLogs over the whole range straight to RH's public RPC
// (about 0.3 s), with the old relay loop only as a fallback.
export const DEPLOY_BLOCK = 111634607n;
// The site's cached server total first (one Worker read per minute for everyone).
export async function readContributorsServer({fetchImpl = globalThis.fetch} = {}) {
  const r = await fetchImpl('/api/add-liquidity/total', {cache: 'no-store', signal: AbortSignal.timeout(10000)});
  const j = r.ok ? await r.json() : null;
  if (!j || !/^\d+$/.test(j.total || '') || !Number.isSafeInteger(j.count)) throw Error('read');
  return {total: BigInt(j.total), count: j.count, block: BigInt(j.block || 0)};
}
export async function readContributorsDirect({fetchImpl = globalThis.fetch, url = PUBLIC_RPC} = {}) {
  const post = async body => { const r = await fetchImpl(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)}); if (!r.ok) throw Error('read'); return r.json(); };
  const [h, l] = await post([{jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: []},
    {jsonrpc: '2.0', id: 2, method: 'eth_getLogs', params: [{address: WETH, topics: [TRANSFER_TOPIC, null, addressTopic(LIQUIDITY)], fromBlock: hex(DEPLOY_BLOCK), toBlock: 'latest'}]}]).then(a => [a.find(x => x.id === 1), a.find(x => x.id === 2)]);
  if (!h?.result || !Array.isArray(l?.result)) throw Error('read');
  return {...sumContributions(l.result), block: uint(h.result)};
}
export async function readContributors({rpc, storage, chunk = 1000000n, sleep = ms => new Promise(r => setTimeout(r, ms)), direct = readContributorsDirect, server = readContributorsServer, start: startBlock = DEPLOY_BLOCK}) {
  if (server) { try { return await server(); } catch { /* next source */ } }
  if (direct) { try { return await direct(); } catch { /* fall back to the relay loop below */ } }
  chunk = BigInt(chunk);
  if (chunk < 1n || chunk > 10000000n) throw Error('Invalid log range');
  const head = uint(await rpc('eth_blockNumber', [], 'display')), start = startBlock ?? await findDeployBlock(rpc, head, storage);
  const logs = [];
  for (let from = start; from <= head;) {
    const to = from + chunk - 1n < head ? from + chunk - 1n : head;
    try {
      const found = await rpc('eth_getLogs', [{address: WETH, topics: [TRANSFER_TOPIC, null, addressTopic(LIQUIDITY)], fromBlock: hex(from), toBlock: hex(to)}], 'display');
      if (!Array.isArray(found)) throw Error('Incomplete contributor read. Refresh to try again.');
      for (const log of found) logs.push(log); from = to + 1n;
    } catch (e) { if (chunk <= 10000n) throw e; chunk = chunk / 2n < 10000n ? 10000n : chunk / 2n; }
    if (from <= head) await sleep(550);
  }
  return {...sumContributions(logs), block: head};
}

export function mountAddLiquidity({document: doc, hub, rpc, atomicSend, explorer, storage, sessionStorage, pollMs = 60000}) {
  const $ = id => doc.getElementById(id), input = $('qal-amount');
  let busy = false, reading = false, stopped = false, balances = null, atomic = false, forceSeparate = false, quote = null, identity = null, version = 0, pending = null, totalReading = false;
  const pendingKey = owner => 'qhooks:add-liquidity:pending:' + owner.toLowerCase();
  const message = text => { $('qal-status').textContent = text; };
  function remember(value, owner = identity?.owner) {
    if (same(owner, identity?.owner)) pending = value;
    try { if (owner) { if (value) sessionStorage?.setItem(pendingKey(owner), JSON.stringify(value)); else sessionStorage?.removeItem(pendingKey(owner)); } } catch { /* Keep the current press guarded in memory. */ }
  }
  function render() {
    const c = hub.snapshot().current, rightChain = String(c?.chainId) === CHAIN_ID;
    $('ql-connection').textContent = c ? 'Robinhood Chain · ' + c.owner : '';
    $('qal-wallet').textContent = c ? (rightChain ? 'Robinhood Chain · ' : 'Switch network · ') + c.owner : 'Connect your wallet to see your balances.';
    $('qal-connect').hidden = !!c; $('qal-switch').hidden = !c || rightChain;
    $('qal-form').hidden = !c || !rightChain;
    $('qal-eth').textContent = balances ? formatAmount(balances.eth) + ' ETH' : 'Refreshing';
    $('qal-weth').textContent = balances ? formatAmount(balances.weth) + ' WETH' : 'Refreshing';
    input.disabled = busy || reading || !!pending;
    for (const id of ['qal-connect', 'qal-switch', 'qal-max', 'qal-review', 'qal-send']) $(id).disabled = busy || reading || hub.snapshot().busy || !!pending;
    $('qal-max').disabled ||= !balances;
    $('qal-send').hidden = !quote;
    $('qal-review').hidden = !!quote;
    $('qal-refresh').disabled = busy || reading;
    $('qal-pending-check').hidden = !pending;
    $('qal-pending-check').disabled = busy || reading;
    $('qal-pending-clear').hidden = !pending; $('qal-pending-clear').disabled = busy || reading;
    if (quote) {
      const wrap = formatAmount(quote.wrap), amount = formatAmount(quote.amount);
      $('qal-plan').textContent = quote.mode === 'atomic' ? `Wrap ${wrap} ETH, then send ${amount} WETH in one batch.` : quote.mode === 'wrap' ? `1 · Wrap ${wrap} ETH. 2 · Send ${amount} WETH to the liquidity contract.` : `2 · Send ${amount} WETH to the liquidity contract. Your WETH covers this amount.`;
      $('qal-send').textContent = quote.mode === 'atomic' ? 'Wrap and add liquidity' : quote.mode === 'wrap' ? `1 · Wrap ${wrap} ETH` : `2 · Send ${amount} WETH to the liquidity contract`;
      $('qal-reserve').textContent = 'Keep at least ' + formatAmount(quote.reserve) + ' ETH for network gas.';
    } else { $('qal-plan').textContent = 'We use your WETH first and wrap only the ETH needed.'; $('qal-reserve').textContent = ''; }
  }
  function showReceipts(receipts) {
    const links = new Set(receipts.map(r => r.transactionHash));
    for (const hash of links) {
      if (!/^0x[0-9a-f]{64}$/i.test(hash)) continue;
      const a = doc.createElement('a'); a.href = explorer + '/tx/' + hash; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'View transaction ' + hash.slice(0, 10) + '…'; $('qal-transactions').append(a);
    }
  }
  async function refreshWallet() {
    if (busy || reading || stopped) return;
    const revision = ++version, c = hub.snapshot().current;
    balances = null; quote = null;
    if (!c || String(c.chainId) !== CHAIN_ID) { render(); return; }
    reading = true; render();
    try {
      const connection = captureConnection(hub); await connection.check();
      const b = await readBalances(rpc, connection.owner), a = !forceSeparate && await readAtomic(connection);
      connection.assert(); if (revision !== version || stopped) return;
      balances = b; atomic = a;
    } catch (e) { if (revision === version) message(e.message); }
    finally { reading = false; render(); if (revision !== version && !stopped) void refreshWallet(); }
  }
  async function refreshTotal() {
    if (totalReading || stopped) return;
    totalReading = true; $('qal-total-status').textContent = 'Refreshing';
    try {
      const total = await readContributors({rpc, storage});
      if (stopped) return;
      $('qal-total').textContent = formatAmount(total.total) + ' WETH';
      $('qal-count').textContent = total.count + (total.count === 1 ? ' contributing transaction' : ' contributing transactions');
      $('qal-total-status').textContent = '';
    } catch { $('qal-total-status').textContent = 'Could not read the total. Refresh to try again.'; }
    finally { totalReading = false; }
  }
  async function review(useMax = false) {
    if (busy || reading || pending) return;
    busy = true; quote = null; message('Checking balances and network gas…'); render();
    try {
      const connection = captureConnection(hub); await connection.check();
      const b = await readBalances(rpc, connection.owner), a = !forceSeparate && await readAtomic(connection);
      if (useMax) { const result = await estimateMax({rpc, owner: connection.owner, balances: b, atomic: a}); input.value = formatAmount(result.max); }
      const amount = parseAmount(input.value);
      const prepared = await prepareContribution({rpc, owner: connection.owner, amount, balances: b, atomic: a});
      await connection.check(); balances = b; atomic = a; quote = prepared;
      message('Review the amount and the permanent-liquidity terms above.');
    } catch (e) { message(e.message); }
    finally { busy = false; render(); }
  }
  async function send() {
    if (busy || reading || pending || !quote) return;
    let amount;
    try { amount = parseAmount(input.value); } catch (e) { message(e.message); return; }
    if (quote.amount !== amount) { quote = null; render(); return; }
    const owner = identity?.owner, expected = quote;
    busy = true; render();
    try {
      const result = await executeContribution({hub, rpc, amount, atomicSend, expected, atomicAllowed: !forceSeparate, onStatus: message, onSubmitted: value => remember(value, owner)});
      remember(null, owner); showReceipts(result.receipts); quote = null;
      if (result.kind === 'review') forceSeparate = true;
      message(result.kind === 'wrapped' ? 'Wrapped. Your WETH is in your wallet. Review and send it when ready.' : result.kind === 'review' ? 'Your wallet needs separate steps. Review the amount again.' : 'Added. It joins the next runs.');
      if (result.kind === 'added') { input.value = ''; void refreshTotal(); }
    } catch (e) {
      if (Number(e.code) === 4001 || /declin|reject|denied|cancel/i.test(e.message)) { remember(null, owner); message('Cancelled in your wallet. Review the amount to try again.'); }
      else { message(e.message); if (pending) message(e.message + ' Check wallet activity before trying again.'); }
      if (pending?.hash) showReceipts([{transactionHash: pending.hash}]);
      quote = null;
    } finally { busy = false; await refreshWallet(); render(); }
  }
  async function checkPending() {
    if (busy || reading || !pending) return;
    const saved = pending, owner = identity?.owner;
    if (!saved.hash) { message('Check wallet activity. If nothing is pending, use the button below to review again.'); return; }
    busy = true; render();
    try {
      const receipt = await rpc('eth_getTransactionReceipt', [saved.hash]);
      if (!receipt) { message('Still pending. Check your wallet activity.'); return; }
      const wasWrap = saved.kind === 'wrap'; remember(null, owner);
      message(uint(receipt.status) === 1n ? wasWrap ? 'Wrapped. Review and send the WETH when ready.' : 'Added. It joins the next runs.' : 'The transaction did not complete. Review to try again.');
      showReceipts([receipt]); void refreshTotal();
    } catch (e) { message(e.message); }
    finally { busy = false; await refreshWallet(); }
  }
  $('qal-connect').addEventListener('click', () => hub.open());
  $('qal-switch').addEventListener('click', async () => {
    if (busy || reading) return; busy = true; message('Switch to Robinhood Chain in your wallet.'); render();
    try { const before = hub.snapshot().current; const after = await hub.switchChain(CHAIN_ID); if (!same(before?.owner, after?.owner)) throw Error('Your wallet changed. Review the amount again.'); message('Robinhood Chain selected.'); }
    catch (e) { message(e.message); } finally { busy = false; await refreshWallet(); }
  });
  input.addEventListener('input', () => { quote = null; message(''); render(); });
  $('qal-form').addEventListener('submit', event => { event.preventDefault(); if (quote) return send(); return review(); });
  $('qal-max').addEventListener('click', () => review(true));
  $('qal-refresh').addEventListener('click', () => { void refreshTotal(); return refreshWallet(); });
  $('qal-pending-check').addEventListener('click', checkPending);
  $('qal-pending-clear').addEventListener('click', () => { if (busy || reading) return; remember(null); message('Pending step cleared. Review your balance before sending again.'); void refreshWallet(); });
  let initialized = false;
  const unsubscribe = hub.subscribe(() => {
    const c = hub.snapshot().current;
    if (identity?.owner?.toLowerCase() !== c?.owner?.toLowerCase() || identity?.entry?.provider !== c?.entry?.provider || identity?.chainId !== c?.chainId) {
      identity = c; version++; quote = null; balances = null; pending = null; forceSeparate = false;
      try { const saved = c && JSON.parse(sessionStorage?.getItem(pendingKey(c.owner)) || 'null'); if (saved && ['wrap', 'transfer', 'atomic'].includes(saved.kind)) pending = saved; } catch { /* A storage hint is never used as chain state. */ }
      if (pending) message('Check your pending wallet activity before sending again.');
      if (initialized && !busy) void refreshWallet();
    }
    $('qal-pending-clear').hidden = !pending; $('qal-pending-clear').disabled = busy || reading;
    render();
  });
  initialized = true;
  const ready = Promise.all([refreshWallet(), refreshTotal()]);
  const timer = pollMs ? setInterval(() => { if (doc.visibilityState !== 'hidden') { void refreshWallet(); void refreshTotal(); } }, pollMs) : null;
  return {ready, review, send, refreshWallet, refreshTotal, checkPending, getState: () => ({balances, atomic, quote, pending}), dispose() { stopped = true; version++; unsubscribe(); if (timer) clearInterval(timer); }};
}

if (typeof document !== 'undefined' && document.getElementById('qal-form')) {
  Promise.all([import('./wallet-hub-fresh.mjs'), import('./qx-chain.mjs'), import('./chains.mjs')]).then(([wallet, chain, chains]) => {
    let storage, sessionStorage; try { storage = window.localStorage; sessionStorage = window.sessionStorage; } catch { /* Page remains usable without storage. */ }
    const client = createRelayClient();
    mountAddLiquidity({document, hub: wallet.getWalletHub(window), rpc: client.rpc, atomicSend: chain.sendCallsAtomic, explorer: chains.chainById(CHAIN_ID).explorer, storage, sessionStorage});
  }).catch(() => { document.getElementById('qal-status').textContent = 'Could not load the wallet tools. Reload to try again.'; });
}
