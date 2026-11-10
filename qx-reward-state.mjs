// Read/display state only. No wallet, signing, transaction or fee calculations.
export const sameRewardOwner = (a,b) => /^0x[0-9a-f]{40}$/i.test(a||'') && /^0x[0-9a-f]{40}$/i.test(b||'') ? a.toLowerCase()===b.toLowerCase() : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a||'') && a===b;
const atomic=raw=>{if(typeof raw!=='bigint'&&!(typeof raw==='string'&&/^(?:\d+|0x[0-9a-f]+)$/i.test(raw)))throw TypeError('Reward amount unavailable');return BigInt(raw);};
export function rewardAmount(raw,decimals) {
 if(!Number.isInteger(decimals)||decimals<0||decimals>18)throw TypeError('Invalid reward decimals');
 const value=atomic(raw);if(value<0n)throw TypeError('Invalid reward amount');
 if(!decimals)return value.toString();
 const base=10n**BigInt(decimals),whole=value/base,fraction=(value%base).toString().padStart(decimals,'0');
 let precision=Math.min(decimals,decimals===9?6:4);
 while(value>0n&&whole===0n&&!/[1-9]/.test(fraction.slice(0,precision))&&precision<decimals)precision++;
 return whole+'.'+fraction.slice(0,precision);
}
export function rewardClaimState(balance,{reserved=false,busy=false}={}) {
 const amount=atomic(balance.amount),minimum=atomic(balance.minimum);
 if(amount<0n||minimum<0n)throw TypeError('Invalid reward balance');
 if(reserved)return{eligible:false,label:'Payout pending',detail:'This asset is reserved until the payment confirms or safely expires.'};
 if(busy)return{eligible:false,label:'Claim in progress',detail:'Finish the claim in your wallet.'};
 if(!balance.enabled)return{eligible:false,label:'Claims temporarily unavailable',detail:'Your recorded rewards remain in this balance.'};
 if(amount<minimum)return{eligible:false,label:'Below claim minimum',detail:'Minimum '+rewardAmount(minimum,balance.decimals)+' '+balance.symbol+'.'};
 return{eligible:amount>0n,label:amount>0n?'Available to claim':'No rewards yet',detail:'QHooks pays the Solana payout network cost.'};
}
export async function readEvmRewardSnapshot(owner,{quotes,native,router,codeAt,cashbackOf,now=Date.now}) {
 if(!/^0x[0-9a-f]{40}$/i.test(owner||'')||BigInt(owner)===0n)throw TypeError('Connect a valid rewards wallet.');
 const wallet=owner.toLowerCase(),balances=[],chains=[],routerOf=typeof router==='function'?router:()=>router;
 await Promise.all(Object.entries(quotes).map(async([chainId,assets])=>{
  const currencies=[['0x'+'0'.repeat(40),native[chainId],18],...assets];
  const r=routerOf(chainId);let code;try{code=await codeAt(chainId,r);if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})*$/i.test(code))throw Error('Invalid network response');}
  catch{chains.push({chainId,status:'unavailable'});for(const[address,symbol,decimals]of currencies)balances.push({chainId,address,symbol,decimals,status:'unavailable',amount:null});return;}
  if(code==='0x'){chains.push({chainId,status:'not_deployed'});return;}
  chains.push({chainId,status:'checked'});
  await Promise.all(currencies.map(async([address,symbol,decimals])=>{
   try{const amount=atomic(await cashbackOf(chainId,r,wallet,address));if(amount<0n||amount>=1n<<256n)throw Error('Invalid reward amount');balances.push({chainId,address,symbol,decimals,status:'checked',amount:amount.toString(),router:r});}
   catch{balances.push({chainId,address,symbol,decimals,status:'unavailable',amount:null});}
  }));
 }));
 balances.sort((a,b)=>a.chainId.localeCompare(b.chainId)||a.address.localeCompare(b.address));chains.sort((a,b)=>a.chainId.localeCompare(b.chainId));
 return{owner:wallet,observedAt:now(),balances,chains,partial:balances.some(row=>row.status==='unavailable'),claimable:balances.filter(row=>row.status==='checked'&&BigInt(row.amount)>0n)};
}
