export function normalizeGraduationLabSetup(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || ![Object.prototype,null].includes(Object.getPrototypeOf(input))) throw Error('Expected plain setup fields');
  const keys=Reflect.ownKeys(input),desc=Object.getOwnPropertyDescriptors(input);
  const exactKeys=['tokenName','symbol','decimals','totalSupply','quoteSupply','notice'];
  if(keys.length!==6||!keys.every(k=>exactKeys.includes(k)))throw Error('Expected six setup fields');
  for(const k of exactKeys)if(!desc[k].enumerable||!Object.hasOwn(desc[k],'value')||typeof desc[k].value!=='string')throw Error('Setup fields must be data strings');
  const values=Object.fromEntries(exactKeys.map(k=>[k,desc[k].value]));
  const tokenName=values.tokenName.trim(),symbol=values.symbol.trim().toUpperCase();
  if(!tokenName.isWellFormed()||new TextEncoder().encode(tokenName).length<1||new TextEncoder().encode(tokenName).length>64)throw Error('Token name must be 1–64 UTF-8 bytes');
  if(!/^[A-Z0-9]{1,10}$/.test(symbol))throw Error('Symbol must be 1–10 letters or digits');
  const checkNumeric=(s,name,min,max)=>{
    if(s.length>78||!/^(0|[1-9][0-9]*)$/.test(s))throw Error('Use exact integer text for '+name);
    const n=BigInt(s);if(n<min||n>max)throw Error('Check '+name);return s;
  };
  return Object.freeze({tokenName,symbol,
    decimals:checkNumeric(values.decimals,'decimals',0n,18n),
    totalSupply:checkNumeric(values.totalSupply,'totalSupply',1n,(1n<<256n)-1n),
    quoteSupply:checkNumeric(values.quoteSupply,'quoteSupply',1n,(1n<<256n)-1n),
    notice:checkNumeric(values.notice,'notice',3600n,2592000n)});
}
