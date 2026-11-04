import {parsePoolAccountFields} from '../qpools/client/pool-account-fields.mjs';
// Preserve accepted exact field parsing while explicitly allowing allowance revocation.
export function parseWalletFields(input){
 if(!input||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError('Plain wallet fields required');
 const d=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(d),names=['kind','asset','amount','recipient'];
 if(keys.length!==4||!keys.every(k=>names.includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value')&&typeof d[k].value==='string'))throw new TypeError('Exact wallet string fields required');
 const values=Object.fromEntries(names.map(k=>[k,d[k].value]));
 if(values.kind==='approve-token'&&values.amount==='0')return Object.freeze({...parsePoolAccountFields({...values,amount:'1'}),amount:'0'});
 return parsePoolAccountFields(values);
}
