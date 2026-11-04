import {abiWord} from './abi-word.mjs';

// Deliberately bounded subset: flat static words plus dynamic bytes/string.
// Static contract tuples may be flattened by reviewed call descriptors.
export function abiEncode(types, values) {
  if (!Array.isArray(types) || !Array.isArray(values) || types.length !== values.length || types.length > 64) {
    throw new TypeError('types and values must be arrays of equal length <= 64');
  }
  const head = [], tail = [];
  let offset = 32 * types.length;
  for (let i = 0; i < types.length; i++) {
    const type = types[i], value = values[i];
    if (typeof type !== 'string') throw new TypeError('type must be a string');
    if (type !== 'bytes' && type !== 'string') {
      head.push(abiWord(type, value));
      continue;
    }
    if (typeof value !== 'string') throw new TypeError('dynamic value must be a string');
    let hex;
    if (type === 'bytes') {
      if (value.length > 131074 || !/^0x(?:[0-9a-f]{2})*$/.test(value)) throw new TypeError('invalid bytes');
      hex = value.slice(2);
    } else {
      if (value.length > 65536 || !value.isWellFormed()) throw new TypeError('invalid string');
      const bytes = new TextEncoder().encode(value);
      if (bytes.length > 65536) throw new TypeError('string bytes exceed 65536');
      hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    head.push(abiWord('uint256', String(offset)));
    const chunk = abiWord('uint256', String(hex.length / 2)) + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
    tail.push(chunk);
    offset += chunk.length / 2;
  }
  return '0x' + head.join('') + tail.join('');
}
