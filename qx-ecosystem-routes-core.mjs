import {abi} from './qx-launch-route-codec.mjs';
import {keccak} from './lab-deploy-core.mjs';
import {chainById} from './chains.mjs';
const ZERO='0x'+'0'.repeat(40),ROUTER='0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff',MAX=(1n<<128n)-1n;
const fail=m=>{throw new TypeError(m);},ok=(v,m)=>{if(!v)fail(m);};
const frozen=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(frozen);Object.freeze(x);}return x;};
const copy=x=>structuredClone(x);
function exact(o,keys,label){ok(o&&Object.getPrototypeOf(o)===Object.prototype,label+' must be a plain object');const ds=Object.getOwnPropertyDescriptors(o),own=Reflect.ownKeys(ds);ok(own.length===keys.length&&own.every(k=>keys.includes(k)&&ds[k].enumerable&&Object.hasOwn(ds[k],'value')),label+' fields must match exactly');}
const addr=(a,label,zero=false)=>{ok(typeof a==='string'&&/^0x[0-9a-f]{40}$/i.test(a)&&(zero||a.toLowerCase()!==ZERO),'Invalid '+label);return a.toLowerCase();};
const uint=(v,label,max=MAX,min=0n)=>{ok(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v),'Use raw decimal units for '+label);const n=BigInt(v);ok(n>=min&&n<=max,label+' is out of range');return v;};
const digest=x=>keccak(new TextEncoder().encode(JSON.stringify(x)));
export function normalizeEcosystemRouteRequest(value){
 exact(value,['chainId','owner','currencyIn','currencyOut','amountIn','slippageBps','deadline','feeOnInput','referrer'],'Route request');
 const chainId=uint(value.chainId,'chain',(1n<<64n)-1n,1n);ok(typeof value.feeOnInput==='boolean','Choose which quote side pays the existing platform fee');
 const r={chainId,owner:addr(value.owner,'owner'),currencyIn:addr(value.currencyIn,'input currency',true),currencyOut:addr(value.currencyOut,'output currency',true),amountIn:uint(value.amountIn,'maximum input',MAX,1n),slippageBps:uint(value.slippageBps,'slippage',5000n),deadline:uint(value.deadline,'deadline',(1n<<64n)-1n,1n),feeOnInput:value.feeOnInput,referrer:addr(value.referrer,'referrer',true)};
 ok(r.currencyIn!==r.currencyOut,'Choose two distinct assets');ok(r.referrer!==r.owner,'A trader cannot refer themselves');return frozen(r);
}
export function ecosystemRouteIdentity(request){return digest(normalizeEcosystemRouteRequest(request));}
function keyOf(k){exact(k,['currency0','currency1','fee','tickSpacing','hooks'],'Pool key');const currency0=addr(k.currency0,'currency0',true),currency1=addr(k.currency1,'currency1');ok(BigInt(currency0)<BigInt(currency1),'Pool currencies must be strictly ordered');const fee=uint(k.fee,'pool fee',(1n<<24n)-1n);ok(typeof k.tickSpacing==='string'&&/^-?[1-9][0-9]*$/.test(k.tickSpacing)&&BigInt(k.tickSpacing)>0n&&BigInt(k.tickSpacing)<=32767n,'Use positive tick spacing');return{currency0,currency1,fee,tickSpacing:k.tickSpacing,hooks:addr(k.hooks,'hook',true)};}
function pathOf(path,input,output,wrap){
 ok(Array.isArray(path)&&path.length>=1&&path.length<=3,'Use one to three exact pool hops');let currency=input===ZERO&&wrap!==ZERO?wrap:input;const seen=new Set([currency]);
 const hops=path.map(h=>{exact(h,['key','zeroForOne','hookData'],'Route hop');ok(typeof h.zeroForOne==='boolean','Use an explicit hop direction');ok(typeof h.hookData==='string'&&/^0x(?:[0-9a-f]{2})*$/i.test(h.hookData)&&h.hookData.length<=8194,'Invalid hook data');const key=keyOf(h.key),[from,to]=h.zeroForOne?[key.currency0,key.currency1]:[key.currency1,key.currency0];ok(from===currency,'Pool hops must connect exact currencies');ok(!seen.has(to),'A route cannot cycle through an asset');seen.add(to);currency=to;return{key,zeroForOne:h.zeroForOne,hookData:h.hookData.toLowerCase()};});ok(currency===output,'The final hop must return the requested asset');return hops;
}
function routeOf(d){
 exact(d,['id','chainId','manager','router','wrap','path','sourceRef','quote'],'Trusted route adapter');ok(typeof d.id==='string'&&/^[a-z0-9][a-z0-9._-]{0,79}$/.test(d.id),'Invalid route ID');ok(typeof d.quote==='function','A quote reader is required');ok(typeof d.sourceRef==='string'&&d.sourceRef.length>0&&d.sourceRef.length<=500,'Route provenance is required');
 return{...d,chainId:uint(d.chainId,'adapter chain',(1n<<64n)-1n,1n),manager:addr(d.manager,'manager'),router:addr(d.router,'router'),wrap:addr(d.wrap,'wrapped native currency',true),path:copy(d.path)};
}
const tuple=k=>[k.currency0,k.currency1,k.fee,k.tickSpacing,k.hooks];
function unsigned(request,route,minimum){
 const chain=chainById(request.chainId);ok(chain?.status==='live'&&chain.router,'This chain has no admitted current QHooks fee-router generation');
 ok(route.manager===chain.contracts.manager.toLowerCase()&&route.router===ROUTER,'Route generation needs separate execution qualification');
 ok(route.wrap===ZERO||request.currencyIn===ZERO&&route.wrap===chain.wrappedNative?.toLowerCase(),'Native wrapping must match this chain’s exact wrapped asset');
 const data='0xf5ec7c4b'+abi(['address','((address,address,uint24,int24,address),bool,bytes)[]','uint128','uint128','address','bool','uint16','uint256','address'],[route.manager,route.path.map(h=>[tuple(h.key),h.zeroForOne,h.hookData]),request.amountIn,minimum,route.wrap,request.feeOnInput,'100',request.deadline,request.referrer]).slice(2);
 return frozen({chainId:request.chainId,from:request.owner,to:ROUTER,data,value:request.currencyIn===ZERO?request.amountIn:'0'});
}
// Adapters are trusted source injections, never request fields or URL flags.
// This prepares reviewable wires; it cannot authorize a wallet or submit them.
export function createEcosystemRoutePlanner({adapters=[],clock=()=>Math.floor(Date.now()/1000)}={}){
 const routes=adapters.map(routeOf);ok(new Set(routes.map(r=>r.chainId+':'+r.id)).size===routes.length,'Route IDs must be unique per chain');
 const issuedPlans=new WeakSet();
 const now=()=>{const n=clock();ok(Number.isSafeInteger(n)&&n>=0,'Quote time is unavailable');return n;};
 async function compare(value,{signal}={}){
  const request=normalizeEcosystemRouteRequest(value),at=now();ok(BigInt(request.deadline)>BigInt(at)&&BigInt(request.deadline)<=BigInt(at+900),'Review a deadline within the next fifteen minutes');
  const requestIdentity=ecosystemRouteIdentity(request),candidates=routes.filter(r=>r.chainId===request.chainId);ok(candidates.length>0,'No route adapters are configured for this chain');
  const inputFee=request.feeOnInput?BigInt(request.amountIn)/100n:0n,quoteInput=BigInt(request.amountIn)-inputFee;ok(quoteInput>0n,'Input after platform fee must be positive');
  const settled=await Promise.allSettled(candidates.map(async source=>{
   if(signal?.aborted)throw Error('Quote request was cancelled');const path=pathOf(source.path,request.currencyIn,request.currencyOut,source.wrap);
   const result=await source.quote(frozen({request,requestIdentity,amountIn:quoteInput.toString()}),{signal});
   if(signal?.aborted)throw Error('Quote request was cancelled');exact(result,['amountOut','block','expiresAt'],'Source quote');exact(result.block,['chainId','number','hash','timestamp'],'Quote block');
   ok(result.block.chainId===request.chainId,'The quote came from another chain');uint(result.block.number,'source block',(1n<<64n)-1n);ok(/^0x[0-9a-f]{64}$/i.test(result.block.hash),'A source block hash is required');uint(result.block.timestamp,'source timestamp',(1n<<64n)-1n);uint(result.expiresAt,'quote expiry',(1n<<64n)-1n);
   const current=now();ok(BigInt(result.block.timestamp)<=BigInt(current+5)&&BigInt(result.block.timestamp)+120n>BigInt(current),'Refreshing the quote. Try again in a moment.');ok(BigInt(result.expiresAt)>BigInt(current)&&BigInt(result.expiresAt)<=BigInt(request.deadline)&&BigInt(result.expiresAt)<=BigInt(result.block.timestamp)+120n,'Quote expiry is outside the reviewed window');
   const gross=BigInt(uint(result.amountOut,'gross output',MAX,1n)),fee=request.feeOnInput?inputFee:gross/100n,net=gross-(request.feeOnInput?0n:fee),minimum=net*(10000n-BigInt(request.slippageBps))/10000n;ok(minimum>0n,'Minimum received must remain positive');
   const route={id:source.id,chainId:source.chainId,manager:source.manager,router:source.router,wrap:source.wrap,path,sourceRef:source.sourceRef};let transaction=null,wireUnavailable=null;try{transaction=unsigned(request,route,minimum.toString());}catch(e){wireUnavailable=e.message;}
   const plan=frozen({request,requestIdentity,route,routeIdentity:digest(route),quotedInput:quoteInput.toString(),grossOutput:gross.toString(),netOutput:net.toString(),minimumOutput:minimum.toString(),platformFee:{bps:'100',currency:request.feeOnInput?(request.currencyIn===ZERO&&route.wrap!==ZERO?route.wrap:request.currencyIn):request.currencyOut,amount:fee.toString(),existingCashbackAndReferralRules:true},sourceBlock:copy(result.block),expiresAt:result.expiresAt,transaction,wireUnavailable,executionEnabled:false,requiredLiveChecks:['Revalidate exact wallet, chain, route generation and runtimes','Requote and simulate the complete call at current state','Check balance, approval, nonce, gas and total fees before signing']});issuedPlans.add(plan);return plan;
  }));
  if(signal?.aborted)throw Error('Quote request was cancelled');const completedAt=BigInt(now());for(let i=0;i<settled.length;i++){const item=settled[i];if(item.status==='fulfilled'&&(BigInt(item.value.expiresAt)<=completedAt||BigInt(item.value.sourceBlock.timestamp)+120n<=completedAt))settled[i]={status:'rejected',reason:Error('Quote expired while other routes were being compared; refresh this route.')};}const quotes=settled.filter(r=>r.status==='fulfilled').map(r=>r.value).sort((a,b)=>BigInt(a.netOutput)>BigInt(b.netOutput)?-1:BigInt(a.netOutput)<BigInt(b.netOutput)?1:a.route.id.localeCompare(b.route.id));
  const failures=settled.flatMap((r,i)=>r.status==='rejected'?[{routeId:candidates[i].id,error:r.reason?.message||'Quote unavailable'}]:[]);ok(quotes.length>0,'All configured routes are unavailable. '+failures.map(r=>r.error).join(' '));
  return frozen({kind:'qhooks-ecosystem-route-comparison',version:1,requestIdentity,quotes,selected:quotes[0],failures,coverage:'Configured routes that returned valid quotes; not a claim about every market',executionEnabled:false});
 }
 return Object.freeze({compare,verifyUnsigned(plan,transaction){ok(issuedPlans.has(plan)&&plan.executionEnabled===false,'A fresh route plan issued by this reader is required; imports must be requoted');const r=normalizeEcosystemRouteRequest(plan.request);ok(plan.requestIdentity===ecosystemRouteIdentity(r),'The reviewed request changed');ok(digest(plan.route)===plan.routeIdentity,'The reviewed route changed');ok(BigInt(plan.expiresAt)>BigInt(now()),'Refresh the expired route quote');const route=routes.find(x=>x.chainId===r.chainId&&x.id===plan.route.id);ok(route,'This adapter is no longer configured');const expectedRoute={id:route.id,chainId:route.chainId,manager:route.manager,router:route.router,wrap:route.wrap,path:pathOf(route.path,r.currencyIn,r.currencyOut,route.wrap),sourceRef:route.sourceRef};ok(digest(expectedRoute)===plan.routeIdentity,'The source route changed');const net=BigInt(uint(plan.netOutput,'net output',MAX,1n)),minimum=net*(10000n-BigInt(r.slippageBps))/10000n;ok(minimum.toString()===plan.minimumOutput,'Minimum received changed');const expected=unsigned(r,expectedRoute,minimum.toString());exact(transaction,['chainId','from','to','data','value'],'Unsigned route');ok(Object.keys(expected).every(k=>transaction[k]===expected[k]),'The unsigned wire differs from the reviewed route');return frozen({verified:true,executionEnabled:false,transaction:expected});}});
}
