// Public configuration only. The accepted connected core remains signing authority.
import {normalizeGraduationLabSetup} from './graduation-lab-setup.mjs';
import {collectGraduationActionForm} from './graduation-action-form.mjs';
export const graduationLabStorageKey='qhooks.graduation.lab.v1';
export const graduationSetupNames=Object.freeze(['tokenName','symbol','decimals','totalSupply','quoteSupply','notice']);
export const graduationBootstrapNames=Object.freeze(['mode','source-fee','source-spacing','dest-fee','dest-spacing','threshold','price','liquidity','lower','upper','salt','max0','max1']);
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
function data(input,keys){
 ensure(input!==null&&typeof input==='object'&&!Array.isArray(input)&&[Object.prototype,null].includes(Object.getPrototypeOf(input)),'Expected a plain configuration');
 const desc=Object.getOwnPropertyDescriptors(input),actual=Reflect.ownKeys(desc);
 ensure(actual.length===keys.length&&actual.every(k=>keys.includes(k)),'Unexpected configuration fields');
 for(const k of keys)ensure(desc[k]?.enumerable&&Object.hasOwn(desc[k],'value'),'Configuration must contain only data properties');
 return Object.fromEntries(keys.map(k=>[k,desc[k].value]));
}
export function createGraduationLabDraft(setupInput,bootstrapInput){
 const setup=normalizeGraduationLabSetup(setupInput);
 ensure(bootstrapInput!==null&&typeof bootstrapInput==='object','Missing bootstrap settings');
 const desc=Object.getOwnPropertyDescriptors(bootstrapInput),mode=desc.mode;
 ensure(mode?.enumerable&&Object.hasOwn(mode,'value')&&typeof mode.value==='string','Missing policy mode');
 const selected=['kind','mode','source-fee','source-spacing','price','liquidity','lower','upper','salt','max0','max1',...(mode.value.trim()!=='2'?['dest-fee','dest-spacing']:[]),...(mode.value.trim()==='0'?['threshold']:[])];
 const values=data(bootstrapInput,selected);ensure(values.kind==='bootstrap','Only initial liquidity configuration is supported');
 const bootstrap=collectGraduationActionForm('bootstrap',k=>values[k]);
 const bound=(key,min,max)=>{const n=BigInt(bootstrap[key]);ensure(n>=min&&n<=max,'Check '+key);return n;};
 const max=(1n<<256n)-1n;
 bound('source-fee',0n,1000000n);const spacing=bound('source-spacing',1n,32767n);
 if(bootstrap.mode!=='2'){bound('dest-fee',0n,1000000n);bound('dest-spacing',1n,32767n);}
 if(bootstrap.mode==='0')bound('threshold',1n,max);
 bound('price',4295128739n,1461446703485210103287273052203988822378723970341n);
 bound('liquidity',1n,(1n<<127n)-1n);
 const lower=bound('lower',-887272n,887272n),upper=bound('upper',-887272n,887272n);
 ensure(lower<upper&&lower%spacing===0n&&upper%spacing===0n,'Align both ticks with source spacing');
 ensure(bound('max0',0n,max)+bound('max1',0n,max)>0n,'At least one funding limit must be positive');
 return Object.freeze({schemaVersion:1,kind:'qhooks-graduation-draft',chainId:'31337',profile:'SLH-DSA-SHA2-128s',setup,bootstrap});
}
export function normalizeGraduationLabDraft(input){
 const d=data(input,['schemaVersion','kind','chainId','profile','setup','bootstrap']);
 ensure(d.schemaVersion===1&&d.kind==='qhooks-graduation-draft'&&d.chainId==='31337'&&d.profile==='SLH-DSA-SHA2-128s','Unsupported graduation draft');
 return createGraduationLabDraft(d.setup,d.bootstrap);
}
export function readGraduationLabDraft(text){
 ensure(typeof text==='string'&&text.length>0&&text.length<=4096,'Draft is missing or too large');
 return normalizeGraduationLabDraft(JSON.parse(text));
}
export function graduationDraftMatchesSetup(draft,fields){
 const normalized=normalizeGraduationLabSetup(fields);
 return graduationSetupNames.every(k=>draft.setup[k]===normalized[k]);
}
