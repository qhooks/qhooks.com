// SOURCE ONLY: pure calldata descriptors for a lead-admitted launch pool.
// This is not dependency, controller-state, quote, fee, wallet or send admission.
import {abiWord} from '../launchpad/abi-word.mjs';
import {abiEncode} from '../launchpad/abi-encode.mjs';
import {encodeActionBundle} from '../../prototypes/base-launch/action-bundle.mjs';

const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
const MAX=(1n<<127n)-1n,MAX_FINITE_ALLOWANCE=(1n<<160n)-2n,HOOK_MASK=16383n,GRADUATION_FLAGS=[10820n,10956n];
// Blocks pools credit referrals from hookData. The referrer comes from a ?ref= link and is kept per
// browser, so a saved swap rebuilds the same calldata. Pools without blocks always get empty hookData.
let referrer=null;
export function setSwapReferrer(a){referrer=typeof a==='string'&&/^0x[0-9a-f]{40}$/.test(a)&&BigInt(a)!==0n?a:null;}
const hookDataFor=k=>referrer&&(BigInt(k.hooks)&HOOK_MASK)===10956n?'0x'+referrer.slice(2).padStart(64,'0'):'0x';
const PROFILES=Object.freeze({
 '8453':Object.freeze({router:'0x6ff5693b99212da76ad316178a184ab56d299b43',permit2:'0x000000000022d473030f116ddee9f6b43ac78ba3',quoter:'0x0d5e0f971ed27fbff6c2837bf31316121532048d',extended:false}),
 '4663':Object.freeze({router:'0x06afba43fd06227fa663b0daecf536f6eaa6bf99',permit2:'0x000000000022d473030f116ddee9f6b43ac78ba3',quoter:'0x8dc178efb8111bb0973dd9d722ebeff267c98f94',extended:true}),
 '1':Object.freeze({router:'0x66a9893cc07d91d95644aedd05d03f95e1dba8af',permit2:'0x000000000022d473030f116ddee9f6b43ac78ba3',quoter:'0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203',extended:false}),
 '42161':Object.freeze({router:'0x96b2fd2f80e9428daa65d859653117d453981ab4',permit2:'0x000000000022d473030f116ddee9f6b43ac78ba3',quoter:'0x3972c00f7ed4885e145823eb7c655375d275a1c5',extended:false}),
 '56':Object.freeze({router:'0x91bf3bfaef8d771a74e1a8fe460b3ee646b2e588',permit2:'0x000000000022d473030f116ddee9f6b43ac78ba3',quoter:'0x9f75dd27d6664c475b90e105573e550ff69437b0',extended:false}),
 '5042':Object.freeze({router:'0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1',permit2:'0x000000000022d473030f116ddee9f6b43ac78ba3',quoter:'0x8dc178efb8111bb0973dd9d722ebeff267c98f94',extended:true})
});
const keyNames=Object.freeze(['currency0','currency1','fee','tickSpacing','hooks']);
function exact(input,names,label){
 ensure(input&&Object.getPrototypeOf(input)===Object.prototype,label+' must be a plain object');
 const keys=Reflect.ownKeys(input),descriptors=Object.getOwnPropertyDescriptors(input);
 ensure(keys.length===names.length&&keys.every(k=>typeof k==='string'&&names.includes(k)&&descriptors[k].enumerable&&Object.hasOwn(descriptors[k],'value')),label+' requires exact data fields');
 return Object.fromEntries(names.map(k=>[k,descriptors[k].value]));
}
function ownData(input,name,label){
 const d=Object.getOwnPropertyDescriptor(input,name);ensure(d?.enumerable&&Object.hasOwn(d,'value'),label+' requires data field '+name);return d.value;
}
function address(value,label){ensure(typeof value==='string'&&value.length===42&&/^0x[0-9a-f]{40}$/.test(value)&&BigInt(value)>0n,label+' must be a lowercase nonzero address');return value;}
function decimal(value,max,label,{positive=true}={}){
 ensure(typeof value==='string'&&value.length>0&&value.length<=78&&!/[^0-9]/.test(value),label+' must be a canonical decimal string');
 const n=BigInt(value);ensure(n.toString()===value&&n<=max&&(!positive||n>0n),label+' is out of range');return n;
}
function poolKey(input){
 const k=exact(input,keyNames,'Pool key');
 const c0=address(k.currency0,'currency0'),c1=address(k.currency1,'currency1'),hooks=address(k.hooks,'hooks');
 ensure(BigInt(c0)<BigInt(c1)&&c0!==hooks&&c1!==hooks,'Sorted distinct ERC20 currencies and hook required');
 decimal(k.fee,100000n,'fee');ensure(k.tickSpacing==='60','Static tick spacing 60 required');
 ensure(GRADUATION_FLAGS.includes(BigInt(hooks)&HOOK_MASK),'Exact QGraduation hook permissions required');
 return Object.freeze({...k});
}
function profileTargets(chainId,profile){
 const expected=PROFILES[chainId];ensure(expected,'Unsupported swap chain profile');
 ensure(profile&&Object.getPrototypeOf(profile)===Object.prototype,'Admitted profile must be a plain object');
 ensure(ownData(profile,'chainId','Admitted profile')===chainId,'Admitted profile chain mismatch');
 const contracts=ownData(profile,'contracts','Admitted profile');ensure(contracts&&Object.getPrototypeOf(contracts)===Object.prototype,'Admitted contracts required');
 for(const [name,value] of [['UniversalRouter',expected.router],['Permit2',expected.permit2],['V4Quoter',expected.quoter]]){
  const record=ownData(contracts,name,'Admitted contracts');ensure(record&&Object.getPrototypeOf(record)===Object.prototype,'Admitted '+name+' required');
  ensure(ownData(record,'address','Admitted '+name)===value,'Unknown '+name+' target for chain '+chainId);
 }
 return expected;
}
const sameKey=(a,b)=>keyNames.every(name=>a[name]===b[name]);
const transaction=(to,data)=>Object.freeze({to,data,value:'0x0'});
const keyTypes=['address','address','uint24','int24','address'];
const keyValues=k=>keyNames.map(name=>k[name]);

export function createSwapCalldata(input){
 const {chainId,profile,context}=exact(input,['chainId','profile','context'],'Swap codec factory');
 ensure(typeof chainId==='string'&&Object.hasOwn(PROFILES,chainId),'Fixed supported chainId required');
 const targets=profileTargets(chainId,profile),bound=exact(context,['controller','poolKey'],'Swap context');
 const controller=address(bound.controller,'controller'),key=poolKey(bound.poolKey);
 ensure(![key.currency0,key.currency1,key.hooks,targets.router,targets.permit2,targets.quoter].includes(controller),'Distinct controller binding required');
 function exactInputQuote(input){
  const x=exact(input,['poolKey','zeroForOne','amountIn'],'Exact-input quote'),supplied=poolKey(x.poolKey);
  ensure(sameKey(supplied,key),'Quote pool differs from admitted controller context');
  ensure(typeof x.zeroForOne==='boolean','Explicit boolean quote direction required');decimal(x.amountIn,MAX,'amountIn');
  const tuple=abiWord('uint256','32')+abiEncode([...keyTypes,'bool','uint128','bytes'],[...keyValues(key),x.zeroForOne,x.amountIn,hookDataFor(key)]).slice(2);
  return transaction(targets.quoter,'0xaa9d21cb'+tuple);
 }
 function exactInputSwap(input){
  const x=exact(input,['poolKey','zeroForOne','amountIn','minimumOut','deadline'],'Exact-input swap');
  const supplied=poolKey(x.poolKey);ensure(sameKey(supplied,key),'Swap pool differs from admitted controller context');
  ensure(typeof x.zeroForOne==='boolean','Explicit boolean swap direction required');
  decimal(x.amountIn,MAX,'amountIn');decimal(x.minimumOut,MAX,'minimumOut');decimal(x.deadline,(1n<<48n)-1n,'deadline');
  const types=[...keyTypes,'bool','uint128','uint128',...(targets.extended?['uint256']:[]),'bytes'];
  const values=[...keyValues(key),x.zeroForOne,x.amountIn,x.minimumOut,...(targets.extended?['0']:[]),hookDataFor(key)];
  const swap='0x'+abiWord('uint256','32')+abiEncode(types,values).slice(2);
  const inputCurrency=x.zeroForOne?key.currency0:key.currency1,outputCurrency=x.zeroForOne?key.currency1:key.currency0;
  const inner=encodeActionBundle('0x060c0f',[swap,abiEncode(['address','uint256'],[inputCurrency,x.amountIn]),abiEncode(['address','uint256'],[outputCurrency,x.minimumOut])]);
  const pair=encodeActionBundle('0x10',[inner]).slice(2),second=BigInt('0x'+pair.slice(64,128))+32n;
  const args=abiWord('uint256','96')+abiWord('uint256',String(second))+abiWord('uint256',x.deadline)+pair.slice(128);
  return transaction(targets.router,'0x3593564c'+args);
 }
 function finiteApprovals(input){
  const x=exact(input,['token','amount','expiration'],'Finite approvals'),token=address(x.token,'approval token');
  ensure(token===key.currency0||token===key.currency1,'Approval token is outside admitted pool');
  decimal(x.amount,MAX_FINITE_ALLOWANCE,'approval amount');decimal(x.expiration,(1n<<48n)-1n,'approval expiration');
  return Object.freeze([
   transaction(token,'0x095ea7b3'+abiEncode(['address','uint256'],[targets.permit2,x.amount]).slice(2)),
   transaction(targets.permit2,'0x87517c45'+abiEncode(['address','address','uint160','uint48'],[token,targets.router,x.amount,x.expiration]).slice(2))
  ]);
 }
 return Object.freeze({chainId,controller,poolKey:key,targets,exactInputQuote,exactInputSwap,finiteApprovals});
}
