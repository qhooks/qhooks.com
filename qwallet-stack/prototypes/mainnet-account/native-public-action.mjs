import {typedPoolAction} from '../qpools/client/pool-typed-data.mjs';
export function parsePublicAction(raw){
 if(!raw||Object.getPrototypeOf(raw)!==Object.prototype)throw new TypeError('Plain action required');
 const keys=Reflect.ownKeys(raw),desc=Object.getOwnPropertyDescriptors(raw);
 const required=new Set(['schemaVersion','chainId','pool','moduleId','actionType','accountId','owner','publicKey','policyHash','nonce','asset','amount','recipient','validAfter','validUntil']);
 if(keys.length!==15)throw new TypeError('Exactly 15 properties required');
 for(const k of keys){
  if(typeof k!=='string'||!required.has(k))throw new TypeError('Invalid property');
  const d=desc[k];if(!Object.hasOwn(d,'value')||!d.enumerable||typeof d.value!=='string')throw new TypeError('Enumerable string data required');
 }
 const numeric=new Set(['schemaVersion','chainId','actionType','nonce','amount','validAfter','validUntil']),result={};
 for(const k of keys){const v=desc[k].value;if(numeric.has(k)){if(v.length>78||!/^(0|[1-9][0-9]*)$/.test(v))throw new TypeError('Canonical decimal required');result[k]=BigInt(v);}else result[k]=v;}
 const typed=typedPoolAction(result);for(const k of keys)if(typed.message[k]!==desc[k].value)throw new TypeError('Typed message mismatch');
 return Object.freeze(result);
}
