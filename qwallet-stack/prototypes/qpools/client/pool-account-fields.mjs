export function parsePoolAccountFields(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input) || ![null,Object.prototype].includes(Object.getPrototypeOf(input))) throw new TypeError('Invalid fields');
  const keys=['kind','asset','amount','recipient'],own=Reflect.ownKeys(input),descriptors=Object.getOwnPropertyDescriptors(input);
  if(own.length!==4||own.some(k=>typeof k!=='string'||!keys.includes(k))||keys.some(k=>!Object.hasOwn(descriptors[k],'value')||!descriptors[k].enumerable||typeof descriptors[k].value!=='string'))throw new TypeError('Exact string data fields required');
  const {kind,asset,amount,recipient}=Object.fromEntries(keys.map(k=>[k,descriptors[k].value]));
  if(!['enroll','deposit','withdraw','approve-token'].includes(kind))throw new TypeError('Invalid kind');
  const zero='0x'+'0'.repeat(40);
  if(kind==='enroll'){
    if(asset!==''||amount!==''||recipient!=='')throw new TypeError('Enrollment has no transfer fields');
    return Object.freeze({kind,asset:zero,amount:'0',recipient:''});
  }
  if(!/^0x[0-9a-fA-F]{40}$/.test(asset))throw new TypeError('Invalid asset');
  if(amount.length>78||!/^[1-9][0-9]*$/.test(amount)||BigInt(amount)>2n**256n-1n)throw new TypeError('Invalid amount');
  const lowerAsset=asset.toLowerCase(),lowerRecipient=recipient.toLowerCase();
  if(kind==='withdraw'){
    if(!/^0x[0-9a-fA-F]{40}$/.test(recipient)||lowerRecipient===zero)throw new TypeError('Invalid recipient');
  }else if(recipient!=='')throw new TypeError('Unexpected recipient');
  if(kind==='approve-token'&&lowerAsset===zero)throw new TypeError('Native approval is invalid');
  return Object.freeze({kind,asset:lowerAsset,amount,recipient:kind==='withdraw'?lowerRecipient:''});
}
