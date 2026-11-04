
export const freezePoolTokens = (tokens) => {
  if (!Array.isArray(tokens) || Object.getPrototypeOf(tokens)!==Array.prototype) throw new TypeError('tokens must be an Array');
  if (tokens.length > 16) throw new TypeError('tokens length must be 0..16');
  const descriptors=Object.getOwnPropertyDescriptors(tokens);
  if (Reflect.ownKeys(tokens).length!==tokens.length+1) throw new TypeError('Unexpected token array fields');
  const list=[];
  for(let i=0;i<tokens.length;i++){const d=descriptors[String(i)];if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw new TypeError('Token data entries required');list.push(d.value);}
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (typeof t !== 'string') throw new TypeError('token must be a string');
    if (!/^0x[0-9a-f]{40}$/.test(t) || /^0x0{40}$/.test(t)) throw new TypeError('token must be a lowercase nonzero 0x40 hex string');
    if (seen.has(t)) throw new TypeError('duplicate token');
    seen.add(t);
  }
  return Object.freeze(list);
};

export const encodePoolConstructor = (verifier, tokens) => {
  if (typeof verifier !== 'string') throw new TypeError('verifier must be a string');
  if (!/^0x[0-9a-f]{40}$/.test(verifier) || /^0x0{40}$/.test(verifier)) throw new TypeError('verifier must be a lowercase nonzero 0x40 hex string');
  const frozen = freezePoolTokens(tokens);
  for (const t of frozen) {
    if (t === verifier) throw new TypeError('token must not equal verifier');
  }
  const offset = '40'.padStart(64,'0');
  const count = frozen.length.toString(16).padStart(64, '0');
  let encoded = verifier.slice(2).padStart(64, '0') + offset + count;
  for (const t of frozen) {
    encoded += t.slice(2).padStart(64, '0');
  }
  return '0x' + encoded;
};

