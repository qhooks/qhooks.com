// Pure ABI encoder extracted from QHooks qx-chain.mjs; no wallet/network imports.
const W = 64;
const pad = h => h.padStart(W, '0');
function splitTypes(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const isArray = t => t.endsWith('[]');
const isTuple = t => t.startsWith('(');
const tupleTypes = t => splitTypes(t.slice(1, -1));
function dynamic(t) { return t === 'bytes' || t === 'string' || isArray(t) || (isTuple(t) && tupleTypes(t).some(dynamic)); }
// Head size in bytes: static tuples sit inline, so they take one word per member.
function headSize(t) { return !dynamic(t) && isTuple(t) ? tupleTypes(t).reduce((n, x) => n + headSize(x), 0) : 32; }
function word(t, v) {
  if (t === 'address') { const h = String(v).toLowerCase().replace(/^0x/, ''); if (!/^[0-9a-f]{40}$/.test(h)) throw new TypeError('Bad address'); return pad(h); }
  if (t === 'bool') return pad(v ? '1' : '0');
  if (t === 'bytes32') { const h = String(v).replace(/^0x/, ''); if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new TypeError('Bad bytes32'); return h.toLowerCase(); }
  const m = /^(u?)int(\d*)$/.exec(t); if (!m) throw new TypeError('Unsupported type ' + t);
  let n = BigInt(v); const bits = BigInt(m[2] || 256);
  if (m[1]) { if (n < 0n || n >= 1n << bits) throw new RangeError(t + ' out of range'); }
  else { if (n < -(1n << (bits - 1n)) || n >= 1n << (bits - 1n)) throw new RangeError(t + ' out of range'); if (n < 0n) n = (1n << 256n) + n; }
  return pad(n.toString(16));
}
function encodeOne(t, v) {
  if (t === 'bytes' || t === 'string') {
    const hex = t === 'string' ? Array.from(new TextEncoder().encode(v), b => b.toString(16).padStart(2, '0')).join('') : String(v).replace(/^0x/, '');
    return pad((hex.length / 2).toString(16)) + hex.padEnd(Math.ceil(hex.length / W) * W, '0');
  }
  if (isArray(t)) return pad(v.length.toString(16)) + encodeList(v.map(() => t.slice(0, -2)), v);
  if (isTuple(t)) return encodeList(tupleTypes(t), v);
  return word(t, v);
}
function encodeList(types, values) {
  if (types.length !== values.length) throw new TypeError('ABI arity');
  const heads = [], tails = []; let offset = types.reduce((n, t) => n + headSize(t), 0);
  types.forEach((t, i) => {
    const enc = encodeOne(t, values[i]);
    if (dynamic(t)) { heads.push(pad(offset.toString(16))); tails.push(enc); offset += enc.length / 2; } else heads.push(enc);
  });
  return heads.join('') + tails.join('');
}
export const abi = (types, values) => '0x' + encodeList(types, values);
export const calldata = (selector, types = [], values = []) => selector + encodeList(types, values);
