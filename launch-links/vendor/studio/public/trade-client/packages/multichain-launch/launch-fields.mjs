import {normalizeTokenFields} from '../token-launch/token-fields.mjs';
export function normalizeLaunchFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![null,Object.prototype].includes(Object.getPrototypeOf(input))) throw new TypeError('Plain launch fields required');
  const d=Object.getOwnPropertyDescriptors(input), keys=Reflect.ownKeys(d);
  const names=['tokenName','symbol','decimals','totalSupply','notice','lpFeePpm'];
  if(keys.length!==6 || !keys.every(k=>names.includes(k))) throw new TypeError('Exactly six launch fields required');
  const v={};
  for(const k of names){
    const desc=d[k];
    if(!desc.enumerable || !Object.hasOwn(desc,'value') || typeof desc.value!=='string') throw new TypeError('Launch data strings required');
    v[k]=desc.value;
  }
  if(v.notice.length>8 || !/^[1-9][0-9]*$/.test(v.notice) || BigInt(v.notice)<3600n || BigInt(v.notice)>2592000n) throw new TypeError('Invalid notice');
  if(v.lpFeePpm.length>6 || !/^[1-9][0-9]*$/.test(v.lpFeePpm) || BigInt(v.lpFeePpm)<1n || BigInt(v.lpFeePpm)>100000n) throw new TypeError('Invalid LP fee');
  const normalizedToken=normalizeTokenFields({tokenName:v.tokenName,symbol:v.symbol,decimals:v.decimals,totalSupply:v.totalSupply});
  return Object.freeze({...normalizedToken,notice:v.notice,lpFeePpm:v.lpFeePpm});
}
