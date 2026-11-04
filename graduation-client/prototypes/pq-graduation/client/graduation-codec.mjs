export function encodeGraduationAction(action) {
  if (action === null || typeof action !== 'object' || Array.isArray(action) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(action))) {
    throw new TypeError('Plain action object required');
  }
  const fields = [
    'schemaVersion','chainId','controller','moduleId','profileId','accountId',
    'owner','publicKey','actionType','authEpoch','policyVersion','policyHash',
    'operationHash','nonce','validAfter','validUntil'
  ];
  const keys = Reflect.ownKeys(action);
  if (keys.length !== 16 || keys.some(k => typeof k !== 'string' || !fields.includes(k))) {
    throw new TypeError('Exactly 16 known own action fields required');
  }
  const descriptors = Object.getOwnPropertyDescriptors(action);
  if (keys.some(k => !Object.hasOwn(descriptors[k], 'value'))) {
    throw new TypeError('Action accessors are not allowed');
  }
  const a = Object.fromEntries(fields.map(k => [k, descriptors[k].value]));
  const integers = ['schemaVersion','chainId','actionType','authEpoch',
    'policyVersion','nonce','validAfter','validUntil'];
  for (const k of integers) {
    const bits = k === 'validAfter' || k === 'validUntil' ? 64n : 256n;
    if (typeof a[k] !== 'bigint' || a[k] < 0n || a[k] >= (1n << bits)) {
      throw new TypeError(k + ' must be an in-range unsigned BigInt');
    }
  }
  for (const k of ['controller','owner']) {
    if (typeof a[k] !== 'string' || !/^0x[0-9a-f]{40}$/.test(a[k])) {
      throw new TypeError(k + ' must be a lowercase address');
    }
  }
  for (const k of ['moduleId','profileId','accountId','publicKey','policyHash','operationHash']) {
    if (typeof a[k] !== 'string' || !/^0x[0-9a-f]{64}$/.test(a[k])) {
      throw new TypeError(k + ' must be lowercase bytes32');
    }
  }
  const output = new Uint8Array(512);
  fields.forEach((k, index) => {
    const word = (typeof a[k] === 'bigint' ? a[k].toString(16) : a[k].slice(2)).padStart(64, '0');
    for (let i = 0; i < 32; i++) output[index * 32 + i] = parseInt(word.slice(i * 2, i * 2 + 2), 16);
  });
  return output;
}
