import { typedPoolAction } from './pool-typed-data.mjs';

export function poolCall(action, walletSignature, pqSignature) {
  const a = typedPoolAction(action).message;

  // Validate walletSignature
  if (typeof walletSignature !== 'string' || !/^0x[0-9a-f]{130}$/.test(walletSignature)) {
    throw new TypeError('Invalid walletSignature');
  }

  // Validate pqSignature
  if (typeof pqSignature !== 'string' || !/^0x[0-9a-f]{15712}$/.test(pqSignature)) {
    throw new TypeError('Invalid pqSignature');
  }

  let signature, types, values;

  if (a.actionType === '1') {
    signature = 'enroll(address,bytes32,uint64,uint64,bytes,bytes)';
    types = ['address', 'bytes32', 'uint64', 'uint64', 'bytes', 'bytes'];
    values = [a.owner, a.publicKey, a.validAfter, a.validUntil, walletSignature, pqSignature];
  } else if (a.actionType === '2') {
    signature = 'withdraw(bytes32,address,uint256,address,uint256,uint64,uint64,bytes,bytes)';
    types = ['bytes32', 'address', 'uint256', 'address', 'uint256', 'uint64', 'uint64', 'bytes', 'bytes'];
    values = [a.accountId, a.asset, a.amount, a.recipient, a.nonce, a.validAfter, a.validUntil, walletSignature, pqSignature];
  } else {
    throw new TypeError('Invalid actionType');
  }

  return Object.freeze({
    signature: signature,
    types: Object.freeze(types),
    values: Object.freeze(values)
  });
}
