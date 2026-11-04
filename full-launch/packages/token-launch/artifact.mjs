// Fixed, previously compiled QLaunchToken. No uploaded or worker-produced bytecode.
import {abiEncode} from '../launchpad/abi-encode.mjs';
import {normalizeTokenFields} from './token-fields.mjs';
export const TOKEN_ARTIFACT_SHA='965d97a7ba8b71e64a0b6a0acb30d027d925fe9238b85f5021bebb4e96915fdd';
export const ensure=(ok,msg)=>{if(!ok)throw new TypeError(msg);};
export const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0{40}$/.test(x);
export const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
export const shape=(o,names)=>{if(!o||Object.getPrototypeOf(o)!==Object.prototype)return false;const d=Object.getOwnPropertyDescriptors(o),keys=Reflect.ownKeys(d);return keys.length===names.length&&keys.every(k=>typeof k==='string'&&names.includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value'));};
export const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
export async function readTokenArtifact(text){
 ensure(typeof text==='string'&&text.length<=20000,'Fixed token artifact required');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 ensure(digest===TOKEN_ARTIFACT_SHA,'Token artifact identity mismatch');const artifact=JSON.parse(text);
 ensure(artifact.token.name==='QLaunchToken'&&artifact.token.runtimeBytes===1769,'Fixed token identity');return freeze(artifact.token);
}
export function tokenCreation(token,fields,owner){
 const f=normalizeTokenFields(fields);ensure(address(owner),'Connected wallet required');
 const data=token.bytecode+abiEncode(['string','string','uint8','uint256','address'],[f.tokenName,f.symbol,f.decimals,f.totalSupply,owner]).slice(2);
 ensure(/^0x(?:[0-9a-f]{2})+$/.test(data)&&data.length<=98306,'Token constructor bound');return data;
}
export const tokenViewExpectations=fields=>Object.freeze({
 '0x06fdde03':abiEncode(['string'],[fields.tokenName]),'0x95d89b41':abiEncode(['string'],[fields.symbol]),
 '0x313ce567':abiEncode(['uint8'],[fields.decimals]),'0x18160ddd':abiEncode(['uint256'],[fields.totalSupply])
});
