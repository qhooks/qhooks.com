export function collectGraduationActionForm(kind, read) {
  const baseNames = {
    'approve-token': ['asset','amount'],
    bootstrap: ['mode','source-fee','source-spacing','price','liquidity','lower','upper','salt','max0','max1'],
    announce: ['mode','eta'], cancel: [], apply: [],
    migrate: ['price','liquidity','lower','upper','salt','max0','max1','min0','min1','min-liquidity','recipient'],
    fees: ['min0','min1','recipient'], exit: ['min0','min1','recipient']
  };
  if (typeof kind !== 'string' || typeof read !== 'function' || !Object.hasOwn(baseNames,kind)) throw Error('Unknown action');
  const fields = {};
  function take(name) {
    const value = read(name);
    if (typeof value !== 'string') throw Error('Expected exact text');
    const text = value.trim();
    if (!text || text.length > 79) throw Error('Missing or oversized field');
    fields[name] = text;
  }
  for (const name of baseNames[kind]) take(name);
  if (kind === 'bootstrap' || kind === 'announce') {
    if (!/^[012]$/.test(fields.mode)) throw Error('Invalid mode');
    if (fields.mode !== '2') {take('dest-fee');take('dest-spacing');}
    if (fields.mode === '0') take('threshold');
  }
  for (const [name,value] of Object.entries(fields)) {
    if (name === 'recipient' || name === 'salt') {
      fields[name] = value.toLowerCase();
      if (!(name === 'recipient' ? /^0x[0-9a-f]{40}$/ : /^0x[0-9a-f]{64}$/).test(fields[name])) throw Error('Invalid hex field');
    } else if (name === 'asset' || name === 'mode') {
      if (!(name === 'asset' ? /^[01]$/ : /^[012]$/).test(value)) throw Error('Invalid choice');
    } else if (value.length > 78 || !(name === 'lower' || name === 'upper' ? /^(0|-?[1-9][0-9]*)$/ : /^(0|[1-9][0-9]*)$/).test(value)) throw Error('Expected canonical decimal');
  }
  return Object.freeze({kind,...fields});
}
