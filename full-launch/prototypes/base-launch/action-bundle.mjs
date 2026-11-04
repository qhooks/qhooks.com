export function encodeActionBundle(actions, params) {
 if(typeof actions!=='string'||!/^0x(?:[0-9a-f]{2}){1,16}$/.test(actions))throw new TypeError('actions must be 1..16 lowercase hex bytes');
 if(!Array.isArray(params)||Object.getPrototypeOf(params)!==Array.prototype||params.length!==(actions.length-2)/2)throw new TypeError('One plain Array entry per action required');
 const keys=Reflect.ownKeys(params);
 if(keys.length!==params.length+1)throw new TypeError('No extra array properties');
 let payload=0;
 const values=[];
 for(let i=0;i<params.length;i++){
  const desc=Object.getOwnPropertyDescriptor(params,String(i));
  if(!desc||!Object.hasOwn(desc,'value')||!desc.enumerable||typeof desc.value!=='string')throw new TypeError('Enumerable string data entries required');
  const value=desc.value;
  if(value.length>65538||!/^0x(?:[0-9a-f]{2})*$/.test(value))throw new TypeError('Invalid parameter bytes');
  payload+=(value.length-2)/2;values.push(value);
 }
 if(payload>65536)throw new TypeError('Payload exceeds 65536 bytes');
 const word=n=>BigInt(n).toString(16).padStart(64,'0');
 const blob=s=>{const hex=s.slice(2);return word(hex.length/2)+hex.padEnd(Math.ceil(hex.length/64)*64,'0');};
 const encodedActions=blob(actions),tails=values.map(blob);
 let offset=32*values.length;
 const heads=tails.map(t=>{const h=word(offset);offset+=t.length/2;return h;});
 const encodedArray=word(values.length)+heads.join('')+tails.join('');
 return '0x'+word(64)+word(64+encodedActions.length/2)+encodedActions+encodedArray;
}
