export function normalizeSwapFields(input){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype)throw new TypeError('Plain swap fields required');
 const keys=Reflect.ownKeys(input),descriptors=Object.getOwnPropertyDescriptors(input),allowed=['zeroForOne','amountIn','slippageBps'];
 if(keys.length!==allowed.length||keys.some(key=>typeof key!=='string'||!allowed.includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))throw new TypeError('Exact enumerable data fields required');
 const {value:zeroForOne}=descriptors.zeroForOne,{value:amountIn}=descriptors.amountIn,{value:slippageBps}=descriptors.slippageBps;
 if(typeof zeroForOne!=='boolean')throw new TypeError('zeroForOne must be boolean');
 if(typeof amountIn!=='string'||amountIn.length===0||amountIn.length>39||/[^0-9]/.test(amountIn))throw new TypeError('Canonical decimal amountIn required');
 const amountNum=BigInt(amountIn);
 if(amountNum<=0n||amountNum>(1n<<127n)-1n||amountNum.toString()!==amountIn)throw new TypeError('amountIn out of range');
 if(!Number.isInteger(slippageBps)||Object.is(slippageBps,-0)||slippageBps<0||slippageBps>500)throw new TypeError('slippageBps out of range');
 return Object.freeze({zeroForOne,amountIn,slippageBps});
}
