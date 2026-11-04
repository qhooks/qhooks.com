export function swapQuoteBounds(expectedAmount,slippageBps,blockTimestamp){
 const positive=(value,length,label)=>{
  if(typeof value!=='string'||value.length>length||!/^[1-9][0-9]*$/.test(value)||/[^0-9]/.test(value))throw new TypeError(label+' must be a canonical positive decimal string');
  return BigInt(value);
 };
 const expected=positive(expectedAmount,39,'expectedAmount');
 if(expected>(1n<<127n)-1n)throw new TypeError('expectedAmount out of range');
 if(!Number.isInteger(slippageBps)||Object.is(slippageBps,-0)||slippageBps<0||slippageBps>500)throw new TypeError('slippageBps out of range');
 const timestamp=positive(blockTimestamp,15,'blockTimestamp');
 if(timestamp>(1n<<48n)-301n)throw new TypeError('blockTimestamp out of range');
 const minimumOut=expected*(10000n-BigInt(slippageBps))/10000n;
 if(minimumOut===0n)throw new TypeError('minimumOut cannot be zero');
 return Object.freeze({expectedAmount,minimumOut:minimumOut.toString(),deadline:(timestamp+300n).toString(),slippageBps});
}
