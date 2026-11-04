export function abiWord(type, value) {
  if (typeof type !== 'string') throw new TypeError('type must be a string');
  switch (type) {
    case 'address': {
      if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value)) {
        throw new TypeError('address must be lowercase hex');
      }
      return value.slice(2).padStart(64, '0');
    }
    case 'bytes32': {
      if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
        throw new TypeError('bytes32 must be lowercase hex');
      }
      return value.slice(2);
    }
    case 'bool': {
      if (typeof value !== 'boolean') throw new TypeError('bool must be a boolean');
      return (value ? '1' : '0').padStart(64, '0');
    }
    default: {
      const match = /^(u?int)(|[1-9][0-9]{0,2})$/.exec(type);
      if (!match) throw new TypeError('invalid integer type');
      const isUnsigned = match[1] === 'uint';
      const bits = match[2] === '' ? 256 : Number(match[2]);
      if (bits % 8 !== 0 || bits < 8 || bits > 256) throw new TypeError('integer width');
      if (typeof value !== 'string' || value.length > 79 ||
          !(isUnsigned ? /^(0|[1-9][0-9]*)$/ : /^(0|-?[1-9][0-9]*)$/).test(value)) {
        throw new TypeError('integer must be a canonical decimal string');
      }
      const n = BigInt(value);
      const bound = 1n << BigInt(isUnsigned ? bits : bits - 1);
      if (n < (isUnsigned ? 0n : -bound) || n >= bound) throw new TypeError('integer range');
      return (n < 0n ? n + (1n << 256n) : n).toString(16).padStart(64, '0');
    }
  }
}
