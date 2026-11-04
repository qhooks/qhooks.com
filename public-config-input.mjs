// Lead-owned shape/canonicality boundary shared by new public configuration families.
export function readPublicConfig(input,fields){
  if(input===null||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Expected a plain configuration object');
  const ds=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(ds);
  if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))throw Error('Unexpected or missing configuration fields');
  const out={};for(const k of fields){const d=ds[k];if(!d||!d.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string')throw Error(k+' must be an enumerable string data field');out[k]=d.value;}
  return Object.freeze(out);
}
export function projectLabel(value){const name=value.trim();if(!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(name))throw Error('Project name must be 1–64 ASCII letters, digits, spaces, hyphens or underscores and start with a letter or digit');return name;}
export function canonicalUint(value,name,min,max){
  if(typeof value!=='string'||value.length>39||!/^[0-9]+$/.test(value))throw Error(name+' must be a canonical unsigned integer');
  const n=BigInt(value);if(n.toString()!==value||n<min||n>max)throw Error(name+' is outside its allowed range');return n;
}
