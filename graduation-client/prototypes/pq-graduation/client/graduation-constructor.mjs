import {abiEncode} from '../../../packages/launchpad/abi-encode.mjs';
const props=['verifier','owner','publicKey','manager','currency0','currency1','quote','notice'];
export function canonicalGraduationConstructor(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||![null,Object.prototype].includes(Object.getPrototypeOf(input)))throw new TypeError('Constructor object');
 const descriptors=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(descriptors),obj={};
 if(keys.length!==props.length||keys.some(k=>!props.includes(k)))throw new TypeError('Constructor fields');
 for(const key of props){const d=descriptors[key];if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string')throw new TypeError('Constructor data strings');obj[key]=d.value;}
 const addresses=[obj.verifier,obj.owner,obj.manager,obj.currency0,obj.currency1];
 for(const addr of [...addresses,obj.quote])if(!/^0x[0-9a-f]{40}$/.test(addr)||/^0x0{40}$/.test(addr))throw new TypeError('Constructor address');
 if(!/^0x[0-9a-f]{64}$/.test(obj.publicKey)||/^0x0{64}$/.test(obj.publicKey))throw new TypeError('Public key');
 if(BigInt(obj.currency0)>=BigInt(obj.currency1)||![obj.currency0,obj.currency1].includes(obj.quote)||new Set(addresses).size!==addresses.length)throw new TypeError('Constructor identities');
 if(obj.notice.length>7||!/^[1-9][0-9]*$/.test(obj.notice)||BigInt(obj.notice)<3600n||BigInt(obj.notice)>2592000n)throw new TypeError('Notice');
 return Object.freeze(obj);
}
export function encodeGraduationConstructor(input){
 const c=canonicalGraduationConstructor(input);
 return abiEncode(['address','address','bytes32','address','address','address','address','uint64'],props.map(k=>c[k]));
}
