export function parseBackup(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > 4096) {
    throw new TypeError('Invalid input: text must be a non-empty string of length <= 4096');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError('Invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Parsed value must be a non-null, non-array object');
  }

  const requiredKeys = ['format', 'version', 'algorithm', 'encoding', 'kdf', 'iterations', 'cipher', 'salt', 'iv', 'publicKey', 'ciphertext'];
  const keys = Object.keys(parsed);
  if (keys.length !== requiredKeys.length || !requiredKeys.every((k, i) => keys[i] === k)) {
    throw new TypeError('Invalid keys: must contain exactly the required keys in order');
  }

  const requiredValues = {
    format: 'qhooks-qpool-backup',
    version: 1,
    algorithm: 'SLH-DSA-SHA2-128s',
    encoding: 'seed48',
    kdf: 'PBKDF2-SHA256',
    iterations: 600000,
    cipher: 'AES-256-GCM'
  };

  for (const [key, value] of Object.entries(requiredValues)) {
    if (parsed[key] !== value) {
      throw new TypeError(`Invalid value for ${key}`);
    }
  }

  const hexFields = ['salt', 'iv', 'publicKey', 'ciphertext'];
  const hexLengths = { salt: 32, iv: 12, publicKey: 32, ciphertext: 64 };

  for (const field of hexFields) {
    const value = parsed[field];
    if (typeof value !== 'string' || !value.startsWith('0x') || (value.length - 2) !== 2 * hexLengths[field]) {
      throw new TypeError(`Invalid ${field}`);
    }
    if (!/^[0-9a-f]+$/.test(value.slice(2))) {
      throw new TypeError(`Invalid hex in ${field}`);
    }
  }

  const canonical = JSON.stringify(parsed);
  if (canonical !== text) {
    throw new TypeError('Non-canonical JSON');
  }

  return Object.freeze(parsed);
}
