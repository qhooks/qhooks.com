import {feeFieldNames} from './fee-input.mjs';
import {buildFeeDraft} from './fee-draft.mjs';
export function readFeeForm(value) {
  const template=value('template'), fields=feeFieldNames(template);
  const draft=buildFeeDraft(Object.fromEntries(fields.map(k=>[k,k==='template'?template:value(k)])));
  return Object.freeze(Object.fromEntries(fields.map(k=>[k,draft[k]])));
}
export function feeExample(template) {
  feeFieldNames(template);
  return Object.freeze(template==='dynamic'
    ? {template:'dynamic',projectName:'Dynamic fees example',chainId:'31337',tickSpacing:'60',maxLpFee:'10000',initialLpFee:'3000'}
    : {template:'directional',projectName:'Directional fees example',chainId:'31337',tickSpacing:'120',maxLpFee:'20000',initialFee0For1:'5000',initialFee1For0:'1000'});
}
