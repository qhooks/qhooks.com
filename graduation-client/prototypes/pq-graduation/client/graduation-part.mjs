import { graduationSchemas } from './graduation-schema.mjs';
import { abiWord } from '../../../packages/launchpad/abi-word.mjs';

export function canonicalGraduationPart(name, input) {
  if (typeof name !== 'string') throw new TypeError('name must be a string');
  if (!Object.hasOwn(graduationSchemas, name)) throw new TypeError('unknown schema name');
  if (input === null) throw new TypeError('input cannot be null');
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new TypeError('input must be a plain object');
  if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new TypeError('input must be a plain object');

  const types = [];
  const values = [];

  function visit(schema, obj) {
    if (obj === null) throw new TypeError('null not allowed');
    if (typeof obj !== 'object' || Array.isArray(obj)) throw new TypeError('must be a plain object');
    if (![Object.prototype, null].includes(Object.getPrototypeOf(obj))) throw new TypeError('must be a plain object');

    const names = Object.keys(schema);
    const desc = Object.getOwnPropertyDescriptors(obj);
    const keys = Reflect.ownKeys(desc);

    if (keys.length !== names.length) throw new TypeError('keys length mismatch');
    if (!keys.every(k => typeof k === 'string')) throw new TypeError('keys must be strings');
    if (!names.every(k => keys.includes(k))) throw new TypeError('keys mismatch schema');

    const entries = [];
    for (const key of names) {
      if (!Object.hasOwn(desc[key], 'value')) throw new TypeError('missing value descriptor');
      const value = desc[key].value;
      const type = schema[key];

      if (typeof type === 'string') {
        if (typeof value !== 'string') throw new TypeError('value must be a string');
        abiWord(type, value);
        types.push(type);
        values.push(value);
        entries.push([key, value]);
      } else {
        entries.push([key, visit(type, value)]);
      }
    }
    return Object.freeze(Object.fromEntries(entries));
  }

  const value = visit(graduationSchemas[name], input);
  return Object.freeze({ value, types: Object.freeze(types), values: Object.freeze(values) });
}
