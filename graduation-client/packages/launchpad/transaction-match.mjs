export function assertTransaction(expected, actual) {
  if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object') throw new TypeError('transaction required');
  for (const field of ['hash','from','to','input','chainId','nonce','value']) {
    const e = expected[field], a = actual[field];
    if (field === 'to' && (e === null || a === null)) {
      if (e !== null || a !== null) throw new TypeError('transaction mismatch');
      continue;
    }
    if (typeof e !== 'string' || typeof a !== 'string') throw new TypeError('transaction field type');
    let pattern, limit;
    if (field === 'hash') { pattern = /^0x[0-9a-fA-F]{64}$/; limit = 66; }
    else if (field === 'from' || field === 'to') { pattern = /^0x[0-9a-fA-F]{40}$/; limit = 42; }
    else if (field === 'input') { pattern = /^0x(?:[0-9a-fA-F]{2})*$/; limit = 262146; }
    else { pattern = /^0x(?:0|[1-9a-f][0-9a-f]*)$/; limit = 66; }
    if (e.length > limit || a.length > limit || !pattern.test(e) || !pattern.test(a) || e.toLowerCase() !== a.toLowerCase()) {
      throw new TypeError('transaction mismatch');
    }
  }
  return true;
}
