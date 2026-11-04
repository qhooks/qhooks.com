// Pure display policy for an immutable launch-workspace snapshot. This does not
// quote a swap, inspect form controls, request a wallet or change launch state.
const fail=message=>{throw new TypeError(message);};
function ppm(raw,label){
 const match=typeof raw==='string'?raw.match(/^(?:0|[1-9][0-9]*)$/):null;if(match?.[0]!==raw||raw.length>7)fail('Canonical '+label+' required');
 const value=BigInt(raw);if(value>1000000n)fail(label+' exceeds one million ppm');return value;
}
function text(raw,label,max=100){if(typeof raw!=='string'||raw.length<1||raw.length>max||/[\u0000-\u001f\u007f]/.test(raw))fail('Bounded '+label+' required');return raw;}
function percent(value){const whole=value/10000n,fraction=(value%10000n).toString().padStart(4,'0').replace(/0+$/,'');return whole+(fraction?'.'+fraction:'')+'%';}
export function launchPricingSummary(snapshot){
 if(!snapshot||typeof snapshot!=='object'||!Object.isFrozen(snapshot)||!Object.isFrozen(snapshot.fields)||!Object.isFrozen(snapshot.quote))fail('Immutable launch snapshot required');
 const f=snapshot.fields,q=snapshot.quote,creator=ppm(f.lpFeePpm,'source creator fee'),protocol=creator/5n;
 const tokenAmount=text(f.tokenAmount,'token liquidity'),quoteAmount=text(f.quoteAmount,'quote liquidity'),symbol=text(f.symbol,'token symbol',12),quoteSymbol=text(q.symbol,'quote symbol',16);
 if(!['0','1','2'].includes(f.graduationMode))fail('Supported graduation mode required');
 let result='Launch costs — upfront platform fee: 0; initial liquidity: '+tokenAmount+' '+symbol+' + '+quoteAmount+' '+quoteSymbol+'; source nominal rates: '+percent(creator)+' creator LP + '+percent(protocol)+' protocol = '+percent(creator+protocol)+' total.';
 if(f.graduationMode!=='2'){const destination=ppm(f.destinationFeePpm,'destination creator fee'),destinationProtocol=destination/5n;result+=' Destination after migration: '+percent(destination)+' creator LP + '+percent(destinationProtocol)+' protocol = '+percent(destination+destinationProtocol)+' total.';}
 return result+' Network fee: reviewed above. Rates are not a swap quote.';
}
