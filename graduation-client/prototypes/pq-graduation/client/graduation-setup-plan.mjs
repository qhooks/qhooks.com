// Lead-owned fixed artifact and CREATE plan. SOURCE ONLY until Q49 acceptance.
import {abiEncode} from '../../../packages/launchpad/abi-encode.mjs';
import {keccak_256} from '../../qpools/client/vendor/hashes/sha3.js';
import {encodeGraduationConstructor} from './graduation-constructor.mjs';
import {normalizeGraduationSetupFields} from './graduation-setup-fields.mjs';
const text=new TextEncoder();
export const setupIds=Object.freeze(['manager','verifier','token','quote','controller']);
export const graduationToolkitSha256='5c41ec8164e4a1e0dcaf7590e6e495de7f5020da8ea800be80743f37a2c60f7c';
export const launchTokenToolkitSha256='965d97a7ba8b71e64a0b6a0acb30d027d925fe9238b85f5021bebb4e96915fdd';
export const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
export const hex=b=>'0x'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export const bytes=s=>Uint8Array.from(s.slice(2).match(/../g)||[],x=>parseInt(x,16));
export const hash=b=>hex(keccak_256(b));
export const hashObject=o=>hash(text.encode(JSON.stringify(o)));
export const quantity=x=>typeof x==='string'&&x.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x);
export const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0{40}$/.test(x);
export const q=n=>'0x'+BigInt(n).toString(16);
export const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(freeze);}return o;};
export function ownFields(input,names){
 ensure(input&&typeof input==='object'&&!Array.isArray(input)&&[null,Object.prototype].includes(Object.getPrototypeOf(input)),'Plain data object');
 const ds=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(ds);ensure(keys.length===names.length&&keys.every(k=>names.includes(k)),'Exact fields');
 const out={};for(const k of names){const d=ds[k];ensure(d.enumerable&&Object.hasOwn(d,'value'),'Own data fields');out[k]=d.value;}return out;
}
export function setupCall(signature,types=[],values=[]){return hash(text.encode(signature)).slice(0,10)+abiEncode(types,values).slice(2);}
export function predictGraduationCreate(owner,nonce){
 ensure(address(owner)&&typeof nonce==='bigint'&&nonce>=0n&&nonce<(1n<<64n),'CREATE identity');
 let n=nonce.toString(16);if(n.length%2)n='0'+n;
 const encoded=nonce===0n?'80':nonce<128n?n:(128+n.length/2).toString(16)+n;
 const payload='94'+owner.slice(2)+encoded;
 return '0x'+hash(bytes('0x'+(192+payload.length/2).toString(16)+payload)).slice(-40);
}
export function makeGraduationSetupProfile(input){
 const p=ownFields(input,['owner','baseNonce','publicKey','fields']);
 ensure(address(p.owner)&&typeof p.publicKey==='string'&&/^0x[0-9a-f]{64}$/.test(p.publicKey)&&!/^0x0{64}$/.test(p.publicKey),'Setup owner/key');
 ensure(typeof p.baseNonce==='string'&&p.baseNonce.length<=20&&/^(?:0|[1-9][0-9]*)$/.test(p.baseNonce)&&BigInt(p.baseNonce)<=(1n<<64n)-6n,'Setup nonce');
 return freeze({...p,fields:normalizeGraduationSetupFields(p.fields)});
}
async function pinnedJSON(raw,expected,max){
 ensure(typeof raw==='string'&&raw.length>0&&raw.length<=max,'Fixed toolkit text');
 ensure(hex(new Uint8Array(await crypto.subtle.digest('SHA-256',text.encode(raw)))).slice(2)===expected,'Unrecognized compiled toolkit');return JSON.parse(raw);
}
export async function prepareGraduationSetup(profile,graduationText,tokenText){
 const p=makeGraduationSetupProfile(profile),a=await pinnedJSON(graduationText,graduationToolkitSha256,1000000),t=await pinnedJSON(tokenText,launchTokenToolkitSha256,100000);
 const contracts={...a.contracts,token:t.token},g=Object.fromEntries(setupIds.map((id,i)=>[id,predictGraduationCreate(p.owner,BigInt(p.baseNonce)+BigInt(i))]));
 g.escrow=predictGraduationCreate(g.controller,1n);g.factory=predictGraduationCreate(g.controller,2n);
 ensure(new Set([p.owner,...Object.values(g)]).size===Object.values(g).length+1,'Setup identity collision');
 const currencies=[g.token,g.quote].sort(),f=p.fields;
 const constructor={verifier:g.verifier,owner:p.owner,publicKey:p.publicKey,manager:g.manager,currency0:currencies[0],currency1:currencies[1],quote:g.quote,notice:f.notice};
 const init=(id,types=[],values=[])=>contracts[id].bytecode+abiEncode(types,values).slice(2);
 const inputs={manager:init('manager',['address'],[p.owner]),verifier:init('verifier'),
  token:init('token',['string','string','uint8','uint256','address'],[f.tokenName,f.symbol,f.decimals,f.totalSupply,p.owner]),
  quote:init('token',['string','string','uint8','uint256','address'],['QHooks Local Quote','QLQ','18',f.quoteSupply,p.owner]),
  controller:contracts.controller.bytecode+encodeGraduationConstructor(constructor).slice(2)};
 for(const value of Object.values(inputs))ensure(value.length<=98306&&/^0x(?:[0-9a-f]{2})+$/.test(value),'Creation size');
 const childInputs={escrow:init('escrow',['address','address','address','address'],[g.manager,...currencies,p.owner]),factory:init('factory',['address','address','address','address','address'],[g.manager,...currencies,g.escrow,g.quote])};
 const plan={profile:p,graph:g,constructor,inputs,childInputs,graduationToolkitSha256,launchTokenToolkitSha256};
 return freeze({...plan,id:hashObject(plan),contracts});
}
