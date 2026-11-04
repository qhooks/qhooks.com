import {readFeeInput} from './fee-input.mjs';

export function buildFeeDraft(input){
  const d=readFeeInput(input);
  const projectName=d.projectName.trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(projectName))throw new Error('Invalid projectName');
  if(d.chainId!=='31337')throw new Error('chainId must be 31337');
  function decimal(name,min,max){
    const v=d[name];
    if(v.length>6||!/^(0|[1-9][0-9]*)$/.test(v))throw new Error('Invalid '+name);
    const n=BigInt(v);
    if(n.toString()!==v||n<min||n>max)throw new Error(name+' out of range');
    return n;
  }
  decimal('tickSpacing',1n,32767n);
  const maximum=decimal('maxLpFee',1n,100000n);
  if(d.template==='dynamic')decimal('initialLpFee',0n,maximum);
  else{
    decimal('initialFee0For1',0n,maximum);
    decimal('initialFee1For0',0n,maximum);
  }
  return Object.freeze({
    ...d,
    projectName,
    schemaVersion:1,
    kind:'qhooks-fee-draft',
    templateId:d.template==='dynamic'?'qdynamic-fee-pq-governance':'qdirectional-fees-pq-schedules',
    profile:'ML-DSA-65'
  });
}
