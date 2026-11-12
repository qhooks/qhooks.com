// Public Elysium receipt observations only. No wallet, signer or transaction builder.
export const ELYSIUM_CHAIN_ID = '99901';
const STORAGE_KEY = 'qhooks:elysium:transaction:v1';
const HASH = /^0x[0-9a-f]{64}$/i;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/i;
const hashOf = value => typeof value === 'string' && HASH.test(value) ? value.toLowerCase() : null;
const copy = value => JSON.parse(JSON.stringify(value));
const invalid = () => { throw new TypeError('The observation does not match a complete Elysium transaction response.'); };
function clockValue(now) {
  const value = typeof now === 'function' ? now() : now;
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('now must be epoch milliseconds.');
  return value;
}
function quantity(value) { if (typeof value !== 'string' || !QUANTITY.test(value)) invalid(); return '0x' + BigInt(value).toString(16); }
function timestamp(value) {
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) value = Date.parse(value);
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function normalize(raw, expectedHash, now) {
  if (!raw || raw.version !== 1 || raw.chainId !== ELYSIUM_CHAIN_ID || !hashOf(raw.hash) || (expectedHash && hashOf(raw.hash) !== expectedHash)) invalid();
  const observedAt = timestamp(raw.observedAt);
  if (observedAt > now + 60_000 || !raw.provider || typeof raw.provider.name !== 'string' || !raw.provider.name.trim() || raw.provider.name.length > 120 || raw.provider.independent !== false) invalid();
  if (!raw.heads || typeof raw.heads !== 'object') invalid();
  const heads = {};
  for (const key of ['latest', 'safe', 'finalized']) {
    const head = raw.heads[key];
    if (head === null) { heads[key] = null; continue; }
    if (!head || !hashOf(head.hash)) invalid();
    heads[key] = { number: quantity(head.number), hash: hashOf(head.hash), timestamp: quantity(head.timestamp) };
  }
  let receipt = null;
  if (raw.receipt !== null) {
    const r = raw.receipt;
    if (!r || hashOf(r.transactionHash) !== hashOf(raw.hash) || !['0x0', '0x1'].includes(r.status) || !hashOf(r.blockHash)) invalid();
    receipt = { transactionHash: hashOf(r.transactionHash), status: r.status, blockNumber: quantity(r.blockNumber), blockHash: hashOf(r.blockHash) };
  }
  for (const name of ['canonicalBlockHash', 'parentHash']) if (raw[name] != null && !hashOf(raw[name])) invalid();
  return { version: 1, chainId: ELYSIUM_CHAIN_ID, hash: hashOf(raw.hash), observedAt, receipt, heads,
    provider: { name: raw.provider.name.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120), independent: false },
    ...(raw.canonicalBlockHash != null ? { canonicalBlockHash: hashOf(raw.canonicalBlockHash) } : {}),
    ...(raw.parentHash != null ? { parentHash: hashOf(raw.parentHash) } : {}) };
}
function finalityOf(observation) {
  if (!observation?.receipt) return 'RPC finality unknown';
  const block = BigInt(observation.receipt.blockNumber);
  for (const [key, label] of [['finalized', 'finalized'], ['safe', 'safe'], ['latest', 'latest']]) {
    const head = observation.heads[key];
    if (head && BigInt(head.number) >= block) return 'Provider-reported ' + label + ' head: ' + BigInt(head.number).toString();
  }
  return 'RPC finality unknown';
}

/** Interpret one observation. Execution and RPC head tags never prove parent settlement. */
export function elysiumTransactionView(observation, { now = Date.now(), hash = null, staleAfterMs = 60_000 } = {}) {
  const time = clockValue(now), selected = hashOf(hash);
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 0) throw new TypeError('Invalid stale interval.');
  const base = { status: selected ? 'pending' : 'idle', headline: selected ? 'Ready to check this transaction' : 'Track an Elysium transaction',
    detail: selected ? 'Refresh to read its public execution receipt.' : 'Enter a public Elysium transaction hash.',
    hash: selected, blockNumber: null, blockNumberHex: null, observedAt: null, stale: false, parentHash: null,
    canRefresh: !!selected, rpcFinality: 'RPC finality unknown', provider: null, rpcHeads: null };
  if (hash != null && !selected) return { ...base, status: 'unavailable', headline: 'Invalid transaction hash', detail: 'Enter an exact public Elysium transaction hash.' };
  if (!observation) return base;
  let data;
  try { data = normalize(observation, selected, time); }
  catch { return { ...base, status: 'unavailable', headline: 'Transaction check refreshing', detail: 'The response did not match the selected Elysium transaction. Refresh to retry.' }; }
  const common = { ...base, hash: data.hash, observedAt: data.observedAt, stale: time - data.observedAt >= staleAfterMs,
    parentHash: data.parentHash ?? null, canRefresh: true, rpcFinality: finalityOf(data), provider: data.provider, rpcHeads: data.heads };
  if (!data.receipt) return { ...common, status: 'pending', headline: 'Waiting for an execution receipt',
    detail: 'The provider returned no Elysium receipt at this check. The transaction may be pending or not found; refresh to check again.' };
  const blockNumber = BigInt(data.receipt.blockNumber).toString(), blockNumberHex = data.receipt.blockNumber;
  if (data.canonicalBlockHash && data.canonicalBlockHash !== data.receipt.blockHash) return { ...common, blockNumber, blockNumberHex,
    status: 'pending', headline: 'Receipt block changed', rpcFinality: 'Canonical block mismatch',
    detail: 'The provider’s current canonical block differs from the receipt block. Execution is unconfirmed; refresh before relying on this observation.' };
  const executed = data.receipt.status === '0x1';
  return { ...common, blockNumber, blockNumberHex, status: executed ? 'executed' : 'reverted', headline: executed ? 'Executed on Elysium' : 'Reverted on Elysium',
    detail: (executed ? 'The receipt reports successful execution' : 'The receipt reports a reverted transaction') + ' at Elysium block ' + blockNumber + '. RPC head tags are provider-reported; parent settlement is not verified.' };
}

function browserStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }

/** Constructor restores a public journal without a request. watch()/refresh() are explicit GET reads. */
export function createElysiumTracker({ fetcher = (...args) => globalThis.fetch(...args), storage = browserStorage(), onChange = () => {},
  now = Date.now, storageKey = STORAGE_KEY, staleAfterMs = 60_000, maxEntries = 12, timeoutMs = 10_000 } = {}) {
  if (typeof fetcher !== 'function' || typeof now !== 'function' || typeof onChange !== 'function' || typeof storageKey !== 'string' || !storageKey ||
    !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 50 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 ||
    !Number.isSafeInteger(staleAfterMs) || staleAfterMs < 0) throw new TypeError('Invalid Elysium tracker options.');
  let selected = null, observation = null, entries = [], error = null, loading = false, disposed = false, revision = 0, controller = null;
  let storagePersistent = !!storage;
  try {
    const text = storage?.getItem(storageKey);
    if (text && text.length <= 120_000) {
      const journal = JSON.parse(text);
      if (journal.version === 1 && journal.chainId === ELYSIUM_CHAIN_ID && Array.isArray(journal.entries)) {
        for (const item of journal.entries.slice(0, maxEntries)) {
          const hash = hashOf(item?.hash);
          if (!hash || entries.some(row => row.hash === hash)) continue;
          let saved = null;
          if (item.observation) { try { saved = normalize(item.observation, hash, clockValue(now)); } catch { continue; } }
          entries.push({ hash, observation: saved });
        }
        selected = hashOf(journal.selectedHash);
        if (!entries.some(row => row.hash === selected)) selected = null;
        observation = entries.find(row => row.hash === selected)?.observation ?? null;
      }
    }
  } catch { storagePersistent = false; }
  function snapshot() {
    const view = elysiumTransactionView(observation, { now: clockValue(now), hash: selected, staleAfterMs });
    const current = { ...view, loading, error, storagePersistent, lastStatus: observation ? view.status : null,
      observation: observation ? copy(observation) : null,
      history: entries.map(row => ({ hash: row.hash, observedAt: row.observation?.observedAt ?? null,
        status: elysiumTransactionView(row.observation, { now: clockValue(now), hash: row.hash, staleAfterMs }).status })),
      canRefresh: !!selected && !loading && !disposed };
    if (error) return { ...current, status: 'unavailable', headline: observation ? 'Refreshing · last observation retained' : 'Transaction check refreshing',
      detail: observation ? 'Could not refresh. Last observation: ' + view.headline + '. ' + view.detail : 'Could not read the public Elysium receipt. Refresh to retry.', stale: !!observation };
    return current;
  }
  function emit() { if (!disposed) { try { onChange(snapshot()); } catch {} } }
  function persist() {
    try {
      if (!storage) { storagePersistent = false; return; }
      const text = JSON.stringify({ version: 1, chainId: ELYSIUM_CHAIN_ID, selectedHash: selected, entries });
      storage.setItem(storageKey, text);
      storagePersistent = storage.getItem(storageKey) === text;
    } catch { storagePersistent = false; }
  }
  function remember() {
    if (selected) entries = [{ hash: selected, observation }, ...entries.filter(row => row.hash !== selected)].slice(0, maxEntries);
    persist();
  }
  function cancel() { revision++; controller?.abort(); controller = null; }
  async function refresh() {
    if (disposed || !selected) return snapshot();
    cancel(); const mine = revision, hash = selected, own = controller = new AbortController();
    loading = true; error = null; emit();
    let timer, abortListener;
    const aborted = new Promise((_, reject) => { abortListener = () => reject(new Error('Read aborted')); own.signal.addEventListener('abort', abortListener, { once: true }); });
    timer = setTimeout(() => own.abort(), timeoutMs);
    try {
      const data = await Promise.race([(async () => {
        const response = await fetcher('/api/elysium/transaction/' + hash, { method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: own.signal });
        if (!response.ok) throw new Error('Refreshing');
        return normalize(await response.json(), hash, clockValue(now));
      })(), aborted]);
      if (disposed || mine !== revision || own.signal.aborted || hash !== selected) return snapshot();
      observation = data; loading = false; remember(); emit();
    } catch {
      if (disposed || mine !== revision || hash !== selected) return snapshot();
      loading = false; error = 'read_unavailable'; emit();
    } finally { clearTimeout(timer); own.signal.removeEventListener('abort', abortListener); }
    return snapshot();
  }
  return Object.freeze({ snapshot,
    async watch(value) {
      const hash = hashOf(value);
      if (!hash) throw new TypeError('Enter an exact public Elysium transaction hash.');
      if (disposed) return snapshot();
      cancel(); selected = hash; observation = entries.find(row => row.hash === hash)?.observation ?? null; error = null; loading = false;
      remember(); return refresh();
    },
    refresh,
    clear() { if (disposed) return snapshot(); cancel(); selected = null; observation = null; error = null; loading = false; persist(); emit(); return snapshot(); },
    dispose() { if (disposed) return; cancel(); disposed = true; loading = false; },
  });
}
