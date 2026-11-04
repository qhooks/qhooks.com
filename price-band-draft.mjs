// Reviewed L40-C01 proposal: exact descriptor keys, value snapshot and ESM exports repaired.
export const priceBandFields=Object.freeze(['projectName','chainId','poolFee','tickSpacing','minSqrtPriceX96','maxSqrtPriceX96']);
function decimal(value,name,min,max) {
  if(value.length>49||!/^[0-9]+$/.test(value))throw Error(`${name} must be a canonical unsigned integer string of at most 49 digits`);
  const n=BigInt(value);
  if(n.toString()!==value||n<min||n>max)throw Error(`${name} out of range [${min},${max}]`);
  return n;
}
export function buildPriceBandDraft(input) {
  if(input===null||typeof input!=='object'||Array.isArray(input))throw Error('Input must be a plain object');
  const proto=Object.getPrototypeOf(input);
  if(proto!==Object.prototype&&proto!==null)throw Error('Input must be a plain object');
  const descriptors=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(descriptors);
  if(keys.length!==priceBandFields.length||keys.some(k=>typeof k!=='string'||!priceBandFields.includes(k)))throw Error('Exactly the six Price Bands fields are required');
  const values={};
  for(const k of priceBandFields){const d=descriptors[k];if(!d||!d.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string')throw Error(`${k} must be an enumerable own string value`);values[k]=d.value;}
  const projectName=values.projectName.trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(projectName))throw Error('Project name must be 1–64 ASCII letters, digits, spaces, hyphens or underscores and start with a letter or digit');
  if(values.chainId!=='31337')throw Error('chainId must be 31337');
  decimal(values.poolFee,'poolFee',0n,1000000n);decimal(values.tickSpacing,'tickSpacing',1n,32767n);
  const min=decimal(values.minSqrtPriceX96,'minSqrtPriceX96',4295128739n,1461446703485210103287273052203988822378723970341n);
  const max=decimal(values.maxSqrtPriceX96,'maxSqrtPriceX96',4295128739n,1461446703485210103287273052203988822378723970341n);
  if(min>=max)throw Error('minSqrtPriceX96 must be less than maxSqrtPriceX96');
  return Object.freeze({...values,projectName,schemaVersion:1,kind:'qhooks-price-band-draft',templateId:'qprice-band-pq-governance',profile:'ML-DSA-65'});
}
