import { encodePoolAction } from './pool-codec.mjs';

export function typedPoolAction(action) {
  const encoded = encodePoolAction(action);
  const words = new Uint8Array(encoded);
  const wordHex = i => Array.from(words.subarray(i * 32, (i + 1) * 32), b => b.toString(16).padStart(2, '0')).join('');

  const fields = [
    'schemaVersion','chainId','pool','moduleId','actionType',
    'accountId','owner','publicKey','policyHash','nonce',
    'asset','amount','recipient','validAfter','validUntil'
  ];
  const types = [
    'uint256','uint256','address','bytes32','uint256',
    'bytes32','address','bytes32','bytes32','uint256',
    'address','uint256','address','uint64','uint64'
  ];

  const message = {};
  for (let i = 0; i < fields.length; i++) {
    const word = wordHex(i);
    message[fields[i]] = types[i] === 'address' ? '0x' + word.slice(24) :
                         types[i] === 'bytes32' ? '0x' + word :
                         BigInt('0x' + word).toString();
  }

  const freeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  return freeze({
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ],
      QPoolAction: Array.from({ length: fields.length }, (_, i) => ({
        name: fields[i],
        type: types[i]
      }))
    },
    primaryType: 'QPoolAction',
    domain: {
      name: 'QHooks QPool',
      version: '1',
      chainId: message.chainId,
      verifyingContract: message.pool
    },
    message
  });
}
