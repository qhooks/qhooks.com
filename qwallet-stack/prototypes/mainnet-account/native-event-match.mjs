export function requireNativeEvent(receipt, expected) {
  const hash = x => typeof x === 'string' && /^0x[0-9a-f]{64}$/.test(x);
  const quantity = x => typeof x === 'string' && x.length <= 66 && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x);
  if (!receipt || receipt.status !== '0x1' || !Array.isArray(receipt.logs) || receipt.logs.length > 10000) throw new TypeError('Invalid receipt');
  if (!expected || typeof expected.address !== 'string' || !/^0x[0-9a-f]{40}$/.test(expected.address) || BigInt(expected.address) === 0n ||
      !Array.isArray(expected.topics) || expected.topics.length < 1 || expected.topics.length > 4 || !Array.from(expected.topics).every(hash) ||
      typeof expected.data !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(expected.data)) throw new TypeError('Invalid expected event');
  if (!hash(receipt.transactionHash) || !hash(receipt.blockHash) || !quantity(receipt.blockNumber)) throw new TypeError('Invalid receipt identity');
  let matched = null;
  for (const log of receipt.logs) {
    if (log && log.removed === false && log.address === expected.address && log.data === expected.data &&
        Array.isArray(log.topics) && log.topics.length === expected.topics.length && expected.topics.every((t, i) => t === log.topics[i]) &&
        log.transactionHash === receipt.transactionHash && log.blockHash === receipt.blockHash && log.blockNumber === receipt.blockNumber) {
      if (matched !== null) throw new TypeError('Multiple matching events');
      matched = log;
    }
  }
  if (matched === null || !quantity(matched.logIndex)) throw new TypeError('Missing canonical event');
  return Object.freeze({logIndex: matched.logIndex});
}
