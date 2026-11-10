// Browser/Node ES2022, no dependencies and no DOM. See relay/NOTES.md for the wallet contract.
const API = 'https://api.relay.link';
const CHAINS = new Set([1, 8453, 42161, 56, 4663, 5042, 130, 99901, 999]); // + Elysium, HyperEVM (2026-11-09)
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && /^0x[0-9a-fA-F]{1,128}$/.test(value);
const error = (code, message, extra = {}) => Object.assign(new Error(message), {code, ...extra});
const proxyPath = (base, path) => base.replace(/\/+$/, '') + path;

async function requestJson(url, init, fetchImpl, allowEmpty = false) {
  const response = await fetchImpl(url, {cache: 'no-store', credentials: 'omit', redirect: 'error', ...init});
  let body;
  try { body = await response.json(); }
  catch {
    if (allowEmpty && response.ok) return null;
    throw error('relay_invalid_response', `Relay returned invalid JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const code = body?.error ?? body?.errorCode ?? 'relay_http_error';
    const detail = body?.detail ?? body?.message;
    throw error(String(code), `Relay HTTP ${response.status}${typeof detail === 'string' ? ': ' + detail : ''}`,
      {httpStatus: response.status});
  }
  return body;
}

export function quote(params, {fetchImpl = fetch, base = '/api/relay'} = {}) {
  return requestJson(proxyPath(base, '/quote'), {method: 'POST',
    headers: {'content-type': 'application/json'}, body: JSON.stringify(params)}, fetchImpl);
}

export function status(requestId, {fetchImpl = fetch, base = '/api/relay'} = {}) {
  if (!validId(requestId)) return Promise.reject(error('invalid_request_id', 'requestId must be 0x-prefixed hex, at most 130 characters.'));
  return requestJson(proxyPath(base, '/status?') + new URLSearchParams({requestId}), {method: 'GET'}, fetchImpl);
}

function decimal(value) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? value : null;
}

// Add decimal strings exactly, without floating-point rounding or assuming missing fees are zero.
function sumDecimals(values) {
  if (values.some(value => value === null)) return null;
  const places = Math.max(...values.map(value => (value.split('.')[1] ?? '').length));
  const total = values.reduce((sum, value) => {
    const negative = value.startsWith('-'), [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    const units = BigInt(whole + fraction.padEnd(places, '0'));
    return sum + (negative ? -units : units);
  }, 0n);
  const digits = (total < 0n ? -total : total).toString().padStart(places + 1, '0');
  const formatted = places ? (digits.slice(0, -places) + '.' + digits.slice(-places)).replace(/\.?0+$/, '') : digits;
  return (total < 0n ? '-' : '') + formatted;
}

function chainNumber(value) {
  if (typeof value === 'string' && /^(?:[1-9]\d*|0x[0-9a-fA-F]+)$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function summarize(quote) {
  const details = quote?.details, fees = quote?.fees;
  const gasFeeUsd = decimal(fees?.gas?.amountUsd), relayerFeeUsd = decimal(fees?.relayer?.amountUsd);
  const appFeeUsd = decimal(fees?.app?.amountUsd);
  return {
    inAmount: details?.currencyIn?.amount ?? null,
    outAmount: details?.currencyOut?.amount ?? null,
    outToken: details?.currencyOut?.currency ?? null,
    feeTotalUsd: sumDecimals([gasFeeUsd, relayerFeeUsd, appFeeUsd]),
    relayerFeeUsd, gasFeeUsd, appFeeUsd,
    timeSeconds: details?.timeEstimate ?? null,
    steps: Array.isArray(quote?.steps) ? quote.steps.map(step => {
      const chains = new Set((Array.isArray(step?.items) ? step.items : []).map(item =>
        chainNumber(item?.data?.chainId ?? item?.data?.sign?.domain?.chainId ?? step?.chainId)).filter(id => id !== null));
      return {id: step?.id ?? null, kind: ['transaction', 'signature'].includes(step?.kind) ? step.kind : null,
        chainId: chains.size === 1 ? [...chains][0] : chainNumber(step?.chainId), description: step?.description ?? null};
    }) : [],
  };
}

function relayUrl(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint || endpoint.startsWith('//')) {
    throw error('invalid_endpoint', 'A Relay step endpoint is missing or invalid.');
  }
  let url;
  try { url = new URL(endpoint, API); }
  catch { throw error('invalid_endpoint', 'A Relay step endpoint is invalid.'); }
  if (url.origin !== API || url.username || url.password || url.hash) {
    throw error('invalid_endpoint', 'Step endpoints must belong to https://api.relay.link.');
  }
  return url;
}

function checkPlan(check, base) {
  if (!check) return null;
  if (check.method !== undefined && check.method !== 'GET') throw error('invalid_check', 'Relay status checks must use GET.');
  const url = relayUrl(check.endpoint);
  const intents = /^\/intents\/status(?:\/v[123])?\/?$/.test(url.pathname);
  const requestId = url.searchParams.get('requestId');
  if (intents && (!validId(requestId) || url.searchParams.getAll('requestId').length !== 1)) {
    throw error('invalid_request_id', 'The Relay status check has an invalid requestId.');
  }
  return {url: intents ? proxyPath(base, '/status?') + new URLSearchParams({requestId}) : url.href,
    requestId: validId(requestId) ? requestId : null};
}

function quantity(value, field) {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) return value;
  if ((typeof value === 'string' && /^\d+$/.test(value)) || (Number.isSafeInteger(value) && value >= 0)) {
    return '0x' + BigInt(value).toString(16);
  }
  throw error('invalid_transaction', `Relay transaction ${field} is not a nonnegative integer quantity.`);
}

function itemPlan(step, item, quote, base) {
  if (!record(item)) throw error('invalid_quote', 'Relay step item must be an object.');
  const check = checkPlan(item.check, base);
  const requestId = check?.requestId ?? item.requestId ?? step.requestId ?? quote.requestId
    ?? item.data?.post?.body?.requestId ?? item.post?.body?.requestId ?? null;
  if (requestId !== null && !validId(requestId)) throw error('invalid_request_id', 'The Relay quote has an invalid requestId.');
  const plan = {step, item, check, requestId, complete: ['complete', 'completed'].includes(item.status)};
  if (['failure', 'refund', 'fallback', 'refunded'].includes(item.status)) {
    throw error('relay_' + item.status, `Relay step ${step.id ?? ''} has status ${item.status}.`, {requestId, status: item.status});
  }
  if (plan.complete) return plan;
  if (!record(item.data)) {
    if (check) return {...plan, pollOnly: true};
    throw error('invalid_quote', 'Relay step data is missing; obtain a fresh quote.');
  }
  const data = item.data, sign = data.sign;
  const chainId = chainNumber(data.chainId ?? sign?.domain?.chainId ?? step.chainId ?? quote.details?.currencyIn?.currency?.chainId);
  if (!CHAINS.has(chainId)) throw error('unsupported_chain', chainId === 792703809 ? 'Solana is phase 2.' : 'Relay step chain is not supported.');
  plan.chainId = chainId;
  if (step.kind === 'transaction') {
    if (typeof data.to !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(data.to)
        || typeof data.data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(data.data)) {
      throw error('invalid_transaction', 'Relay transaction target or calldata is invalid.');
    }
    plan.transaction = {to: data.to, data: data.data, value: quantity(data.value, 'value'), chainId};
    for (const field of ['maxFeePerGas', 'maxPriorityFeePerGas', 'gas']) {
      if (data[field] !== undefined) plan.transaction[field] = quantity(data[field], field);
    }
  } else if (step.kind === 'signature') {
    const post = data.post ?? item.post;
    if (!record(sign) || !record(post) || !record(post.body) || (post.method !== undefined && post.method !== 'POST')) {
      throw error('invalid_signature', 'Relay signature data and a POST body are required.');
    }
    plan.post = {url: relayUrl(post.endpoint), body: post.body};
    if (sign.signatureKind === 'eip712') {
      if (!record(sign.domain) || !record(sign.types) || typeof sign.primaryType !== 'string'
          || !record(sign.value ?? sign.message) || (sign.domain.chainId !== undefined && chainNumber(sign.domain.chainId) !== chainId)) {
        throw error('invalid_signature', 'Relay EIP-712 typed data or its chain is invalid.');
      }
      plan.typed = {domain: sign.domain, types: sign.types, primaryType: sign.primaryType, message: sign.value ?? sign.message};
    } else if (sign.signatureKind === 'eip191' && typeof sign.message === 'string') {
      plan.message = sign.message;
    } else throw error('invalid_signature', 'Relay signature kind must be eip712 or eip191.');
  } else throw error('unsupported_step', `Unsupported Relay step kind: ${String(step.kind)}.`);
  return plan;
}

function checkRecipient(quote) {
  // Preserve the API body, but do not execute a quote that contradicts its own sender.
  const sender = quote.details?.sender;
  if (typeof sender !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(sender)) return;
  const order = quote.protocol?.v2?.orderData;
  const recipients = [quote.details?.recipient,
    ...(Array.isArray(order?.output?.payments) ? order.output.payments.map(payment => payment?.recipient) : []),
    ...(Array.isArray(order?.inputs) ? order.inputs.flatMap(input => Array.isArray(input.refunds)
      ? input.refunds.map(refund => refund?.recipient) : []) : [])];
  if (recipients.some(recipient => recipient !== undefined && recipient !== null
      && (typeof recipient !== 'string' || recipient.toLowerCase() !== sender.toLowerCase()))) {
    throw error('relay_recipient_mismatch', 'Relay quote recipient differs from the sender; obtain a corrected quote before moving funds.');
  }
}

export async function execute(quote, wallet, {
  onUpdate, fetchImpl = fetch, base = '/api/relay', pollMs = 2000, timeoutMs = 15 * 60_000,
} = {}) {
  if (!Number.isFinite(pollMs) || pollMs < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw error('invalid_options', 'pollMs must be nonnegative and timeoutMs must be positive and at most 2147483647.');
  }
  if (!Array.isArray(quote?.steps) || quote.steps.length === 0) throw error('invalid_quote', 'Relay quote has no steps.');
  checkRecipient(quote);
  // Validate every action and endpoint before opening the first wallet prompt.
  const plans = quote.steps.flatMap(step => {
    if (!record(step)) throw error('invalid_quote', 'Relay steps must be objects.');
    if (step.items === undefined) return [];
    if (!Array.isArray(step.items)) throw error('invalid_quote', 'Relay step items must be an array.');
    return step.items.map(item => itemPlan(step, item, quote, base));
  });
  let requestId = [...plans].reverse().find(plan => plan.requestId)?.requestId ?? quote.requestId ?? null;
  if (plans.length === 0 || (!validId(requestId) && !plans.at(-1).check)) {
    throw error('invalid_quote', 'Relay quote has no settlement check or requestId.');
  }
  for (const plan of plans) {
    if (plan.complete || plan.pollOnly) continue;
    const methods = plan.transaction ? ['switchChain', 'sendTransaction'] : [plan.typed ? 'signTypedData' : 'signMessage'];
    if (methods.some(method => typeof wallet?.[method] !== 'function')) throw error('invalid_wallet', `Wallet must implement ${methods.join(' and ')}.`);
  }
  const controller = new AbortController(), outTxHashes = new Set();
  let current, txHash = null, timer, expired = false;
  const deadline = Date.now() + timeoutMs;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      reject(error('relay_timeout', `Relay execution timed out${requestId ? ' for ' + requestId : ''}.`, {requestId, txHash}));
    }, timeoutMs);
  });
  const run = task => {
    if (expired || Date.now() >= deadline) throw error('relay_timeout', `Relay execution timed out${requestId ? ' for ' + requestId : ''}.`, {requestId, txHash});
    return Promise.race([timeout, Promise.resolve().then(task)]);
  };
  const update = state => {
    // Observer errors must not interrupt settlement tracking after a wallet action.
    try {
      const observed = onUpdate?.({step: current?.step.id ?? null, status: state, txHash, requestId});
      if (typeof observed?.catch === 'function') void observed.catch(() => {});
    } catch {}
  };
  const poll = async check => {
    while (true) {
      const result = await run(() => requestJson(check.url, {method: 'GET', signal: controller.signal}, fetchImpl));
      const state = result?.status;
      if (typeof state !== 'string') throw error('relay_invalid_response', 'Relay status response has no status.');
      update(state);
      if (['failure', 'refund', 'fallback', 'refunded'].includes(state)) {
        throw error('relay_' + state, `Relay execution ${state}${requestId ? ' for ' + requestId : ''}.`, {requestId, txHash, status: state});
      }
      if (state === 'success') {
        for (const hash of [...(Array.isArray(result.txHashes) ? result.txHashes : []),
          ...(Array.isArray(result.outTxHashes) ? result.outTxHashes : [])]) {
          if (typeof hash === 'string' && hash) outTxHashes.add(hash);
        }
        return;
      }
      await run(() => new Promise(resolve => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now())))));
    }
  };
  let confirmed = false;
  try {
    for (current of plans) {
      requestId = current.requestId ?? requestId;
      txHash = null;
      if (!current.complete && !current.pollOnly) {
        confirmed = false;
        if (current.transaction) {
          update('switching_chain');
          await run(() => wallet.switchChain(current.chainId));
          update('awaiting_wallet');
          const sent = await run(() => wallet.sendTransaction({...current.transaction}));
          txHash = typeof sent === 'string' ? sent : sent?.hash;
          if (typeof txHash !== 'string' || !txHash) throw error('invalid_wallet_response', 'Wallet did not return a transaction hash.');
          update('submitted');
        } else {
          update('awaiting_signature');
          const signature = await run(() => current.typed ? wallet.signTypedData(current.chainId, current.typed)
            : wallet.signMessage(current.chainId, current.message));
          if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
            throw error('invalid_wallet_response', 'Wallet did not return a hex signature.');
          }
          const url = new URL(current.post.url);
          url.searchParams.set('signature', signature);
          await run(() => requestJson(url.href, {method: 'POST', headers: {'content-type': 'application/json'},
            body: JSON.stringify(current.post.body), signal: controller.signal}, fetchImpl, true));
          update('submitted');
        }
      }
      if (current.check) { await poll(current.check); confirmed = true; }
      else update(current.complete ? 'complete' : 'submitted');
    }
    if (!confirmed) {
      if (!validId(requestId)) throw error('invalid_quote', 'Relay quote has no final settlement requestId.');
      await poll({url: proxyPath(base, '/status?') + new URLSearchParams({requestId})});
    }
    return {requestId, status: 'success', outTxHashes: [...outTxHashes]};
  } catch (cause) {
    const failure = cause instanceof Error ? cause : error('relay_execution_error', 'Relay execution could not continue.');
    failure.requestId ??= requestId;
    failure.txHash ??= txHash;
    update(failure.code === 'relay_timeout' ? 'timeout' : failure.status ?? 'failure');
    throw failure;
  } finally { clearTimeout(timer); }
}
