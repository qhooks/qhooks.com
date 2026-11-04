import {normalizeGraduationSetupFields} from '../../prototypes/pq-graduation/client/graduation-setup-fields.mjs';
export function normalizeTokenFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
    throw new TypeError('Plain token fields required');
  }
  const fields=['tokenName','symbol','decimals','totalSupply'];
  const d=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(d);
  if (keys.length!==fields.length || !keys.every(k=>fields.includes(k))) throw new TypeError('Exactly four token fields required');
  const values={};
  for(const k of fields){
    if(!d[k].enumerable || !Object.hasOwn(d[k],'value') || typeof d[k].value!=='string') throw new TypeError('Enumerable token data strings required');
    values[k]=d[k].value;
  }
  const normalized=normalizeGraduationSetupFields({...values,quoteSupply:'1',notice:'3600'});
  return Object.freeze(Object.fromEntries(fields.map(k=>[k,normalized[k]])));
}
