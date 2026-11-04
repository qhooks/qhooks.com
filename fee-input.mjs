// Lead-owned shape boundary shared by fee drafts and their presentation. No getter reads.
const common=Object.freeze(['template','projectName','chainId','tickSpacing','maxLpFee']);
export function feeFieldNames(template){
  if(!['dynamic','directional'].includes(template))throw Error('Unknown fee template');
  return Object.freeze([...common,...(template==='dynamic'?['initialLpFee']:['initialFee0For1','initialFee1For0'])]);
}
export function readFeeInput(input){
  if(input===null||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Expected a plain configuration');
  const descriptors=Object.getOwnPropertyDescriptors(input),td=descriptors.template;
  if(!td||!Object.hasOwn(td,'value'))throw Error('Missing fee template');
  const fields=feeFieldNames(td.value),keys=Reflect.ownKeys(descriptors);
  if(keys.length!==fields.length||keys.some(k=>!fields.includes(k)))throw Error('Unexpected fee configuration fields');
  for(const name of fields){const d=descriptors[name];if(!d||!d.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string')throw Error(name+' must be an enumerable string data field');}
  return Object.freeze(Object.fromEntries(fields.map(name=>[name,descriptors[name].value])));
}
