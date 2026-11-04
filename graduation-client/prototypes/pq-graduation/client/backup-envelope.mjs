export function parseBackup(text) {
  if (typeof text !== 'string' || text.length < 1 || text.length > 4096) {
    throw new TypeError('text must be a string of 1..4096 characters');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError('invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('parsed must be a non-null object and not an array');
  }
  const keys = Object.keys(parsed);
  const expectedKeys = [
    'format', 'version', 'algorithm', 'encoding', 'kdf', 'iterations',
    'cipher', 'salt', 'iv', 'publicKey', 'ciphertext'
  ];
  if (keys.length !== expectedKeys.length || keys.some((k, i) => k !== expectedKeys[i])) {
    throw new TypeError('missing/extra/reordered keys');
  }
  const expectedValues = {
    format: 'qhooks-qgraduation-backup',
    version: 1,
    algorithm: 'SLH-DSA-SHA2-128s',
    encoding: 'seed48',
    kdf: 'PBKDF2-SHA256',
    iterations: 600000,
    cipher: 'AES-256-GCM'
  };
  for (const [k, v] of Object.entries(expectedValues)) {
    if (parsed[k] !== v) throw new TypeError(`invalid fixed value for ${k}`);
  }
  const hexFields = ['salt', 'iv', 'publicKey', 'ciphertext'];
  const hexLengths = { salt: 32, iv: 12, publicKey: 32, ciphertext: 64 };
  for (const field of hexFields) {
    const value = parsed[field];
    if (typeof value !== 'string' || !/^0x[0-9a-f]+$/.test(value)) {
      throw new TypeError(`invalid hex string for ${field}`);
    }
    if ((value.length - 2) / 2 !== hexLengths[field]) {
      throw new TypeError(`invalid hex length for ${field}`);
    }
  }
  if (JSON.stringify(parsed) !== text) throw new TypeError('duplicate keys or noncanonical JSON');
  return Object.freeze(parsed);
}
