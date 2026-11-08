// Browser/fork acceptance logic stays pure so Node tests can verify each failure.
import {allocationAmounts,human} from './qx-create-plan.mjs';
import {chainById} from './chains.mjs';
import {planV4LaunchLiquidity} from './full-launch/packages/multichain-launch/liquidity-v4-plan.mjs';
const atomic=value=>typeof value==='string'&&/^(?:0|[1-9][0-9]{0,77})$/.test(value)?BigInt(value):null;
function samePlan(found,expected) {
 if(!expected||typeof expected!=='object')return found===expected;
 if(!found||typeof found!=='object'||Array.isArray(found)||![Object.prototype,null].includes(Object.getPrototypeOf(found)))return false;
 return Object.keys(expected).every(key=>{
  const field=Object.getOwnPropertyDescriptor(found,key);
  return field&&Object.hasOwn(field,'value')&&samePlan(field.value,expected[key]);
 });
}
export function createJourneyChecks(config,facts) {
 const expected=allocationAmounts(config.supply,config.allocations),checks=[];
 const check=(id,ok,detail)=>checks.push({id,ok:!!ok,detail:String(detail)});
 check('total-supply',facts.totalSupply===expected.total,'expected '+expected.total+' found '+facts.totalSupply);
 if(Object.hasOwn(facts,'funding')) {
  // The intended pool allocation is a budget. Full-range integer liquidity can
  // leave a remainder; accept it only against the complete exact engine plan.
  let planned=null,complete=false;
  try {
   const chain=chainById(config.chainId);
   planned=planV4LaunchLiquidity({token:facts.funding?.token,quote:chain.quote.address,tokenDecimals:18,quoteDecimals:chain.quote.decimals,tokenAmount:human(expected.pool),quoteAmount:config.liquidity});
   complete=samePlan(facts.funding,planned);
  }catch{}
  check('pool-funding-plan',complete,'expected complete exact v4 funding plan for pool budget '+expected.pool);
  const funded=atomic(facts.funding?.fundedTokenRaw),unused=atomic(facts.funding?.unusedTokenRaw);
  check('pool-budget',complete&&funded!==null&&unused!==null&&funded+unused===BigInt(expected.pool),'intended pool budget '+expected.pool+'; funded '+facts.funding?.fundedTokenRaw+'; unused '+facts.funding?.unusedTokenRaw);
  check('pool-share',complete&&facts.poolTokenAmount===planned.fundedTokenRaw,'expected funded '+planned?.fundedTokenRaw+' from budget '+expected.pool+'; observed pool '+facts.poolTokenAmount);
  const remainder=atomic(facts.creatorTokenAmount),pool=atomic(facts.poolTokenAmount),total=atomic(facts.totalSupply),locks=facts.locks.map(row=>atomic(row.amount));
  check('creator-remainder',complete&&remainder!==null&&facts.creatorTokenAmount===planned.unusedTokenRaw,'expected creator remainder '+planned?.unusedTokenRaw+'; observed '+facts.creatorTokenAmount);
  check('supply-conservation',complete&&pool!==null&&remainder!==null&&total!==null&&total===BigInt(expected.total)&&locks.every(amount=>amount!==null)&&pool+remainder+locks.reduce((sum,amount)=>sum+amount,0n)===total,'minted '+facts.totalSupply+'; observed pool '+facts.poolTokenAmount+' + creator '+facts.creatorTokenAmount+' + allocation locks');
 }else check('pool-share',facts.poolTokenAmount===expected.pool,'expected '+expected.pool+' found '+facts.poolTokenAmount);
 check('allocation-count',facts.locks.length===expected.allocations.length,'expected '+expected.allocations.length+' found '+facts.locks.length);
 for(const row of expected.allocations){const lock=facts.locks.find(l=>l.allocationId===row.id);
  for(const key of ['wallet','amount','cliff','duration','notice'])check('lock-'+row.id+'-'+key,lock&&String(lock[key]).toLowerCase()===String(row[key]).toLowerCase(),'expected '+row[key]+' found '+lock?.[key]);
 }
 check('launch-fee',facts.feeReceived===chainById(config.chainId).launchFeeWei,'expected '+chainById(config.chainId).launchFeeWei+' wei found '+facts.feeReceived);
 check('market-listed',facts.listed,'expected listed pool found '+facts.listed);
 check('click-count',Number.isInteger(facts.clicks)&&facts.clicks>0,'user clicks '+facts.clicks);
 if(facts.email){check('one-review',facts.reviews===1,'expected 1 found '+facts.reviews);check('silent-session',facts.prompts===0&&facts.silent>0,'expected 0 prompts found '+facts.prompts+'; silent actions '+facts.silent);check('chain-switch',facts.chainId===config.chainId,'expected '+config.chainId+' found '+facts.chainId);}
 if(facts.requireWrap)check('auto-wrap',facts.wrappedFromZero,'expected native-only start and deposit receipt found '+facts.wrappedFromZero);
 for(const shot of facts.layouts||[]){check('layout-'+shot.id,shot.scrollWidth<=shot.width,'viewport '+shot.width+'px document '+shot.scrollWidth+'px');check('type-'+shot.id,shot.italics===0&&shot.serifs===0,'italic elements '+shot.italics+' serif elements '+shot.serifs);}
 return checks;
}
