import {canonicalGraduationPart as part} from './graduation-part.mjs';
import {abiWord} from '../../../packages/launchpad/abi-word.mjs';
const schemas=Object.freeze({bootstrap:['kind','bootstrap'],announce:['kind','policy','destination','eta'],cancel:['kind'],apply:['kind'],migrate:['kind','migration'],fees:['kind','withdrawal'],exit:['kind','withdrawal'],'approve-token':['kind','asset','amount']});
export function parseGraduationActionFields(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw)))throw new TypeError('Plain action fields');
 const ds=Object.getOwnPropertyDescriptors(raw),kd=ds.kind;
 if(!kd||!Object.hasOwn(kd,'value')||!kd.enumerable||typeof kd.value!=='string'||!Object.hasOwn(schemas,kd.value))throw new TypeError('Action kind');
 const names=schemas[kd.value],keys=Reflect.ownKeys(ds);
 if(keys.length!==names.length||!keys.every(k=>names.includes(k)))throw new TypeError('Exact action fields');
 const result={};for(const key of names){const d=ds[key];if(!d.enumerable||!Object.hasOwn(d,'value'))throw new TypeError('Own action data');result[key]=d.value;}
 const scalar=(key,type)=>{if(typeof result[key]!=='string')throw new TypeError('String field');abiWord(type,result[key]);};
 switch(result.kind){
  case 'bootstrap':result.bootstrap=part('bootstrap',result.bootstrap).value;break;
  case 'announce':result.policy=part('policy',result.policy).value;result.destination=part('descriptor',result.destination).value;scalar('eta','uint64');break;
  case 'migrate':result.migration=part('migration',result.migration).value;break;
  case 'fees':case 'exit':result.withdrawal=part('withdrawal',result.withdrawal).value;break;
  case 'approve-token':scalar('asset','address');scalar('amount','uint256');break;
 }
 return Object.freeze(result);
}
