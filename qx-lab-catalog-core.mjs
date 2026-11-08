// Portable, closed-world admission of the81 source-bound accepted captures.
// No compiler, wallet, provider, filesystem or network. Plans never enable execution.
import {CATALOG_EDITION as SOURCE_EDITION,CATALOG_PINS as SOURCE_PINS} from './qx-lab-catalog-pins.mjs';
import {CATALOG_CHAINS,CATALOG_CHAIN_ORDER,catalogChain,catalogAvailability} from './qx-lab-catalog-chains.mjs';
import {DETERMINISTIC_DEPLOYER,word,encode,selector,keccak,toBytes,buildHash,planTransactions} from './lab-deploy-core.mjs';
const ZERO='0x'+'00'.repeat(20);
const REQUEST=['kind','schemaVersion','sourceVersion','template','chainId','projectName','configuration'];
const RECORD=['id','contract','kind','name','summary','source','sourceSnapshot','constructorABI','abi','creationBytecode','deployedBytecode','immutables','methodIdentifiers','permissionFlags','callbacks','units','definition'];
const INPUT=['kind','schemaVersion','sourceVersion','edition','record'];
const RESPONSE=['kind','schemaVersion','sourceVersion','request','artifactInput','artifact','additionalChecks'];
const ensure=(ok,m)=>{if(!ok)throw new TypeError(m);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=x=>JSON.parse(JSON.stringify(x));
const frozen=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(frozen);Object.freeze(x);}return x;};
const CATALOG_EDITION=frozen(clone(SOURCE_EDITION)),CATALOG_PINS=frozen(clone(SOURCE_PINS)),VERSION=CATALOG_EDITION.sourceVersion;
function plain(x,keys,label){ensure(x&&Object.getPrototypeOf(x)===Object.prototype,label+' must be an object');const own=Reflect.ownKeys(x);ensure(own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(x,k),'value')),label+' fields must match exactly');}
function dense(x,min,max,label){ensure(Array.isArray(x)&&x.length>=min&&x.length<=max,label+' array length out of range');const keys=Reflect.ownKeys(x);ensure(keys.length===x.length+1&&keys.every(k=>k==='length'||typeof k==='string'&&/^(0|[1-9][0-9]*)$/.test(k)&&Number(k)<x.length&&Object.hasOwn(Object.getOwnPropertyDescriptor(x,k),'value')),label+' must be a dense array');}
function addr(x,label,nonzero=false){ensure(typeof x==='string'&&/^0x[0-9a-f]{40}$/i.test(x)&&(!nonzero||x.toLowerCase()!==ZERO),'Invalid '+label);return x.toLowerCase();}
function integer(x,min,max,label,signed=false){ensure(typeof x==='string'&&x.length<=Math.max(String(min).length,String(max).length)&&(signed?/^(0|-?[1-9][0-9]*)$/:/^(0|[1-9][0-9]*)$/).test(x),'Use a canonical decimal string for '+label);const n=BigInt(x);ensure(n>=BigInt(min)&&n<=BigInt(max),label+' out of range');return x;}
function fieldValue(field,value,path){
 if(field.type==='address')return addr(value,path,field.nonzero);
 if(field.type==='integer')return integer(value,field.min,field.max,path,field.abiType.startsWith('int'));
 if(field.type==='boolean'){ensure(typeof value==='boolean',path+' must be boolean');return value;}
 if(field.type==='bytes32'){ensure(typeof value==='string'&&/^0x[0-9a-f]{64}$/i.test(value),path+' must be bytes32');return value.toLowerCase();}
 if(field.type==='bytes'){ensure(typeof value==='string'&&/^0x(?:[0-9a-f]{2})*$/i.test(value)&&Number.isInteger(field.maxBytes)&&field.maxBytes<=4096&&(value.length-2)/2>=Number(field.minBytes??0)&&(value.length-2)/2<=field.maxBytes,path+' exceeds the admitted byte bounds');return value.toLowerCase();}
 if(field.type==='tuple'){dense(value,field.fields.length,field.fields.length,path);return field.fields.map((f,i)=>fieldValue(f,value[i],path+'.'+f.name));}
 ensure(field.type==='array','Unsupported pinned field');dense(value,field.minItems,field.maxItems,path);const result=value.map((v,i)=>fieldValue(field.items,v,path+'['+i+']'));
 if(field.unique||field.uniqueBy!==undefined){const keys=result.map(v=>JSON.stringify(field.uniqueBy===undefined?v:v[field.uniqueBy]));ensure(new Set(keys).size===keys.length,path+' must be unique');}return result;
}
const textHash=s=>keccak(new TextEncoder().encode(s));
const DOMAIN_TYPEHASH=textHash('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
const INTENT_TYPEHASH=textHash('SwapIntent(address signer,address router,address manager,bytes32 poolId,uint256 nonce,uint256 deadline,bool zeroForOne,int256 amountSpecified,uint160 sqrtPriceLimitX96,uint256 maximumInput,uint256 minimumOutput)');
function derived(request,address=null){
 const p=CATALOG_PINS[request.template],c=request.configuration,fee=p.definition.family==='dynamic-pool'?'8388608':c.poolFee;
 const profile=catalogChain(request.chainId);
 const d={chainId:profile.chainId,manager:profile.manager.address,poolFee:fee,intentDomainTypeHash:DOMAIN_TYPEHASH,intentTypeHash:INTENT_TYPEHASH};
 if(address)d.hookAddress=address;
 if(address&&p.kind==='pool-hook')d.poolId=keccak('0x'+encode(['address','address','uint24','int24','address'],[c.currency0,c.currency1,fee,c.tickSpacing,address]));
 if(address)d.intentDomainSeparator=keccak('0x'+encode(['bytes32','bytes32','bytes32','uint256','address'],[DOMAIN_TYPEHASH,textHash('QHooks Swap Intent'),textHash('1'),profile.chainId,address]));return d;
}
function evaluate(expr,c,d,ctx={}){
 if(Object.hasOwn(expr,'const'))return expr.const;
 if(Object.hasOwn(expr,'field')){ensure(Object.hasOwn(c,expr.field),'Unknown pinned field expression');return c[expr.field];}
 if(Object.hasOwn(expr,'derived'))return d[expr.derived];
 if(Object.hasOwn(expr,'length'))return String(c[expr.length].length);
 if(Object.hasOwn(expr,'item'))return expr.item.reduce((v,k)=>v[k],ctx.item);
 if(Object.hasOwn(expr,'index'))return String(ctx.indices[expr.index]);
 if(Object.hasOwn(expr,'tuple'))return expr.tuple.map(e=>evaluate(e,c,d,ctx));
 if(Object.hasOwn(expr,'equals')){const [a,b]=expr.equals.map(e=>evaluate(e,c,d,ctx));return a===b;}
 if(Object.hasOwn(expr,'choose')){const choice=evaluate(expr.choose.condition,c,d,ctx);if(choice===undefined)return undefined;ensure(typeof choice==='boolean','Pinned condition must be boolean');return evaluate(choice?expr.choose.then:expr.choose.else,c,d,ctx);}
 for(const key of ['hashWords','hashAbi'])if(Object.hasOwn(expr,key)){const spec=expr[key],values=spec.values.map(e=>evaluate(e,c,d,ctx));if(values.some(v=>v===undefined))return undefined;ensure(spec.types.length===values.length&&values.length<=32,'Pinned hash arity');return keccak('0x'+(key==='hashWords'?encode(spec.types,values):abiSequence(spec.types.map(type=>({type})),values)));}
 throw new TypeError('Unsupported pinned expression');
}
function validateRules(c,rules){for(const r of rules){
 const describe={lt:'must be less than',lte:'must not exceed',gte:'must be at least'};
 const extraMessages={'product-lte':'The complete window exceeds the admitted duration','duration':'Use an ordered campaign window within the admitted duration and long enough for its required progress','weekly-sessions':'Use sorted, nonoverlapping Monday UTC session offsets within one week','sequencer-config':'A sequencer feed needs a positive admitted grace period; no feed requires zero grace','active-subsidy':'At least one currency needs both a positive rate and a positive funded cap','directional-price':'The order trigger and execution limit must be ordered for the chosen direction'};
 const message=describe[r.op]?`${r.left.field} ${describe[r.op]} ${r.right.field??r.right.const}`:r.op==='range-edge'?`${r.edge} must fit within half the advertised tick range`:r.op==='aligned'?`${r.fields.join(', ')} must align with tickSpacing`:r.op==='not-both-zero'?`${r.fields.join(', ')} cannot all be zero`:r.op==='member'?`${r.field} must equal one of ${r.fields.join(', ')}`:r.op==='ranges'?`${r.field} must contain ordered, spacing-aligned tick ranges`:r.op==='schedule-end'?'The complete release schedule must fit within uint64 Unix seconds':r.op==='below-length'?`${r.field} must be below the number of ${r.array}`:r.op==='sum'?`${r.field} must sum exactly to ${r.equals}`:r.op==='length-difference'?`${r.a} must have ${r.difference} more entry than ${r.b}`:r.op==='same-length'?`${r.a} and ${r.b} must have the same length`:extraMessages[r.op]??'Unsupported constructor rule';
 const n=k=>BigInt(c[k]),fail=()=>ensure(false,message);
 if(['lt','lte','gte'].includes(r.op)){const a=BigInt(evaluate(r.left,c,{})),b=BigInt(evaluate(r.right,c,{}));if(!(r.op==='lt'?a<b:r.op==='lte'?a<=b:a>=b))fail();}
 else if(r.op==='range-edge'){if(n(r.edge)*2n>n(r.upper)-n(r.lower))fail();}
 else if(r.op==='aligned'){if(r.fields.some(k=>n(k)%n('tickSpacing')!==0n))fail();}
 else if(r.op==='not-both-zero'){if(r.fields.every(k=>n(k)===0n))fail();}
 else if(r.op==='member'){if(!r.fields.some(k=>c[k]===c[r.field]))fail();}
 else if(r.op==='ranges'){if(c[r.field].some(([lo,hi])=>BigInt(lo)>=BigInt(hi)||BigInt(lo)%n('tickSpacing')!==0n||BigInt(hi)%n('tickSpacing')!==0n))fail();}
 else if(r.op==='schedule-end'){if(n(r.start)+n(r.period)*n(r.count)>BigInt(r.maximum))fail();}
 else if(r.op==='below-length'){if(n(r.field)>=BigInt(c[r.array].length))fail();}
 else if(r.op==='sum'){if(c[r.field].reduce((sum,v)=>sum+BigInt(v),0n)!==BigInt(r.equals))fail();}
 else if(r.op==='length-difference'){if(c[r.a].length-c[r.b].length!==Number(r.difference))fail();}
 else if(r.op==='same-length'){if(c[r.a].length!==c[r.b].length)fail();}
 else if(r.op==='product-lte'){if(n(r.a)*n(r.b)>BigInt(r.maximum))fail();}
 else if(r.op==='duration'){if(n(r.start)>=n(r.end)||n(r.end)-n(r.start)>BigInt(r.maximum)||(r.required&&n(r.required)>n(r.end)-n(r.start)))fail();}
 else if(r.op==='weekly-sessions'){const sessions=c[r.field];if(sessions.some(([start,end],i)=>BigInt(start)>=BigInt(end)||BigInt(end)>604800n||(i>0&&BigInt(sessions[i-1][1])>BigInt(start))))fail();}
 else if(r.op==='sequencer-config'){if(c[r.feed]===ZERO?n(r.grace)!==0n:n(r.grace)<1n||n(r.grace)>86400n)fail();}
 else if(r.op==='active-subsidy'){if((n(r.rate0)===0n||n(r.cap0)===0n)&&(n(r.rate1)===0n||n(r.cap1)===0n))fail();}
 else if(r.op==='directional-price'){if(c[r.direction]?n(r.trigger)<=n(r.limit):n(r.trigger)>=n(r.limit))fail();}
 else throw new TypeError('Unsupported pinned constructor rule');
}}
// Replace the two Base example addresses; price and feed examples are adapted below.
// Address order defines the pair's slots, including token/quote module examples.
function chainExample(value,profile){
 if(Array.isArray(value))return value.map(v=>chainExample(v,profile));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,chainExample(v,profile)]));
 if(typeof value==='string'){
  const base=CATALOG_CHAINS['8453'].examplePair;
  if(value.toLowerCase()===base.currency0)return profile.examplePair.currency0;
  if(value.toLowerCase()===base.currency1)return profile.examplePair.currency1;
 }
 return value;
}
const Q192=1n<<192n;
function integerSqrt(n){let x=n,y=(n+1n)>>1n;while(y<x){x=y;y=(x+n/x)>>1n;}return x;}
function exampleConfiguration(pin,profile){
 const c=Object.fromEntries(pin.definition.fields.map(f=>[f.name,chainExample(clone(f.example),profile)])),inverted=['1','56'].includes(profile.chainId);
 if(inverted&&pin.kind==='pool-hook'){
  const bnb=profile.chainId==='56',scale=bnb?600n:1n,spacing=Number(c.tickSpacing);
  // Reciprocal raw prices on Ethereum. BNB also rescales Base's raw 1:1
  // reference to 1/600 WBNB per USDT, retaining each example's relative price.
  for(const field of pin.definition.fields.filter(f=>f.name.endsWith('SqrtPriceX96')||f.name==='sqrtPriceX96')){
   const value=BigInt(c[field.name]),converted=bnb?integerSqrt(Q192*Q192/(scale*value*value)):Q192/value;
   const lo=BigInt(field.min),hi=BigInt(field.max);c[field.name]=String(converted<lo?lo:converted>hi?hi:converted);
  }
  const offset=bnb?Math.log(1/600)/Math.log(1.0001):0;
  const tick=value=>String(Math.max(Math.ceil(-887272/spacing)*spacing,Math.min(Math.floor(887272/spacing)*spacing,Math.round((offset-Number(value))/spacing)*spacing)));
  for(const [lower,upper]of [['lowerTick','upperTick'],['requiredLower','requiredUpper'],['tickLower','tickUpper']])if(Object.hasOwn(c,lower)){
   const lo=c[lower],hi=c[upper];c[lower]=tick(hi);c[upper]=tick(lo);
  }
  if(Object.hasOwn(c,'anchorTick'))c.anchorTick=tick(c.anchorTick);
  if(c.ranges)c.ranges=c.ranges.map(([lo,hi])=>[tick(hi),tick(lo)]).sort((a,b)=>Number(a[0])-Number(b[0]));
  // Reciprocal trigger prices reverse the comparison direction.
  if(Object.hasOwn(c,'zeroForOne'))c.zeroForOne=!c.zeroForOne;
  // These fields also encode absolute raw currency1/currency0 prices.
  if(Object.hasOwn(c,'numerator1')){const n=c.numerator1;c.numerator1=c.denominator0;c.denominator0=String(BigInt(n)*scale);}
  if(Object.hasOwn(c,'minimumRatioX18')){
   const unit=10n**36n,lo=BigInt(c.minimumRatioX18),hi=BigInt(c.maximumRatioX18);
   c.minimumRatioX18=String(unit/(hi*scale));c.maximumRatioX18=String((unit+lo*scale-1n)/(lo*scale));
  }
  // Sale quotes are prices per fixed lot, with currency1 as quote in these
  // fixtures. Keep the descending schedule ordered after taking reciprocals.
  for(const key of ['reserveQuotePerLot','openingQuotePerLot','closingQuotePerLot'])if(Object.hasOwn(c,key)){
   const quote=BigInt(c.lotSize)**2n/(BigInt(c[key])*scale);c[key]=String(quote<1n?1n:quote);
  }
  if(c.openingQuotePerLot&&BigInt(c.openingQuotePerLot)<BigInt(c.closingQuotePerLot))[c.openingQuotePerLot,c.closingQuotePerLot]=[c.closingQuotePerLot,c.openingQuotePerLot];
 }
 if(pin.id==='next-wave/external-reference-price-guard-hook'&&Object.keys(profile.feeds).length){
  const bySymbol={WETH:'ethUsd',USDC:'usdcUsd',WBNB:'bnbUsd',USDT:'usdtUsd'},decimals={WETH:'18',USDC:'6',WBNB:'18',USDT:'18'};
  profile.examplePair.symbols.forEach((symbol,index)=>{const feed=profile.feeds[bySymbol[symbol]];c['feed'+index]=feed.address;c['feedDecimals'+index]=String(feed.decimals);c['tokenDecimals'+index]=decimals[symbol];});
  c.sequencerUptimeFeed=profile.feeds.sequencer?.address??ZERO;c.sequencerGraceSeconds=profile.feeds.sequencer?'3600':'0';
 }
 return c;
}
export function listCatalogTemplates(chainId='8453'){
 const profile=catalogChain(chainId);ensure(profile.status==='live',profile.reason);
 return frozen({kind:'qhooks-lab-catalog',schemaVersion:1,sourceVersion:VERSION,chainId,counts:clone(CATALOG_EDITION.catalogueCounts),
  chains:CATALOG_CHAIN_ORDER.map(id=>({id,name:CATALOG_CHAINS[id].name,status:CATALOG_CHAINS[id].status})),
  templates:Object.values(CATALOG_PINS).map(p=>{const examples=exampleConfiguration(p,profile);return{id:p.id,kind:p.kind,name:p.name,summary:p.summary,
   fields:p.definition.fields.map(f=>({...clone(f),example:clone(examples[f.name])})),
   exampleConfiguration:examples,
   availability:catalogAvailability(p.id,chainId),exampleKind:p.definition.exampleKind,help:p.definition.help,permissionFlags:p.permissionFlags,callbacks:clone(p.callbacks),source:clone(p.source),sourceSnapshot:clone(p.sourceSnapshot),units:clone(p.units)};})});
}
export function normalizeCatalogRequest(input){
 plain(input,REQUEST,'Request');ensure(input.kind==='qhooks-lab-template-request'&&input.schemaVersion===1&&input.sourceVersion===VERSION,'Unsupported request kind, schema or source edition');
 ensure(typeof input.template==='string'&&Object.hasOwn(CATALOG_PINS,input.template),'Unknown template');const availability=catalogAvailability(input.template,input.chainId);ensure(availability.available,availability.reason);
 ensure(typeof input.projectName==='string'&&input.projectName.trim().length>0&&input.projectName.trim().length<=120&&!/[\x00-\x1f\x7f]/.test(input.projectName),'Invalid project name');
 const p=CATALOG_PINS[input.template],fields=p.definition.fields;plain(input.configuration,fields.map(f=>f.name),'Configuration');const c={};for(const f of fields)c[f.name]=fieldValue(f,input.configuration[f.name],f.name);
 if(p.kind==='pool-hook'){ensure(BigInt(c.currency0)<BigInt(c.currency1),'Currencies must be strictly ordered');if(p.definition.family==='dynamic-pool')ensure(BigInt(c.minimumFee)<=BigInt(c.maximumFee),'Fee floor exceeds ceiling');}
 else ensure(c.token!==c.quote,'Income currencies must be distinct');validateRules(c,p.definition.rules);
 if(input.template==='next-wave/external-reference-price-guard-hook'&&['1','56'].includes(input.chainId))ensure(c.sequencerUptimeFeed===ZERO&&c.sequencerGraceSeconds==='0','No sequencer feed is needed on '+catalogChain(input.chainId).name+'; use the zero address and zero grace.');
 return frozen({kind:'qhooks-lab-template-request',schemaVersion:1,sourceVersion:VERSION,template:input.template,chainId:input.chainId,projectName:input.projectName.trim(),configuration:c});
}
export async function catalogSHA256(value){const data=typeof value==='string'?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');}
async function verifyRecord(record,id){
 plain(record,RECORD,'Captured record');record=clone(record);const pin=CATALOG_PINS[id];ensure(pin&&record.id===id,'Captured template mismatch');
 for(const key of ['id','contract','kind','name','summary','source','sourceSnapshot','constructorABI','immutables','permissionFlags','callbacks','units','definition'])ensure(equal(record[key],pin[key]),'Pinned '+key+' changed');
 ensure(typeof record.creationBytecode==='string'&&/^0x(?:[0-9a-f]{2})+$/i.test(record.creationBytecode)&&record.creationBytecode.length<=98306,'Invalid captured creation code');
 ensure(typeof record.deployedBytecode==='string'&&/^0x(?:[0-9a-f]{2})+$/i.test(record.deployedBytecode)&&record.deployedBytecode.length<=49154,'Invalid captured runtime');
 const checks=[[JSON.stringify(record.abi),pin.abiSHA256],[record.creationBytecode,pin.creationHexSHA256],[record.deployedBytecode,pin.runtimeHexSHA256],[JSON.stringify(record.methodIdentifiers),pin.methodIdentifiersSHA256],[JSON.stringify(record.definition),pin.definitionSHA256],[JSON.stringify(record.constructorABI),pin.sourceSnapshot.constructorABISHA256],[toBytes(record.creationBytecode),pin.sourceSnapshot.creationBytecodeSHA256],[toBytes(record.deployedBytecode),pin.sourceSnapshot.runtimeTemplateSHA256]];
 for(const [value,want]of checks)ensure(await catalogSHA256(value)===want,'Captured code/ABI/method/definition digest mismatch');
 ensure(equal(record.abi.filter(a=>a.type==='constructor'),[pin.constructorABI]),'Captured constructor differs from ABI');return record;
}
// The admitted constructors use only these scalar words, tuples, and fixed/dynamic
// arrays. Offsets are relative to each tuple head (array element head after length).
function arrayType(p){const m=/^(.*)\[([0-9]*)\]$/.exec(p.type);return m?{child:{...p,type:m[1]},length:m[2]===''?null:Number(m[2])}:null;}
function isDynamic(p){const a=arrayType(p);return a?a.length===null||isDynamic(a.child):p.type==='tuple'?p.components.some(isDynamic):p.type==='string'||p.type==='bytes';}
function staticBytes(p){ensure(!isDynamic(p),'Dynamic value has no static width');const a=arrayType(p);return a?a.length*staticBytes(a.child):p.type==='tuple'?p.components.reduce((n,c)=>n+staticBytes(c),0):32;}
function abiSequence(params,values){ensure(params.length===values.length,'Pinned ABI arity');let offset=params.reduce((n,p)=>n+(isDynamic(p)?32:staticBytes(p)),0);const heads=[],tails=[];params.forEach((p,i)=>{const bytes=abiValue(p,values[i]);if(isDynamic(p)){heads.push(word('uint256',String(offset)));tails.push(bytes);offset+=bytes.length/2;}else heads.push(bytes);});return heads.join('')+tails.join('');}
function abiValue(p,value){const a=arrayType(p);if(a){ensure(Array.isArray(value)&&(a.length===null||value.length===a.length),'Pinned ABI array length');const body=abiSequence(value.map(()=>a.child),value);return(a.length===null?word('uint256',String(value.length)):'')+body;}if(p.type==='tuple')return abiSequence(p.components,value);if(p.type==='string'||p.type==='bytes'){ensure(typeof value==='string','Pinned dynamic ABI value must be a string');const bytes=p.type==='string'?new TextEncoder().encode(value):(/^0x(?:[0-9a-f]{2})*$/i.test(value)?toBytes(value):null);ensure(bytes&&bytes.length<=4096,'Pinned dynamic ABI value exceeds bound');const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return word('uint256',String(bytes.length))+hex.padEnd(Math.ceil(bytes.length/32)*64,'0');}const integerType=/^u?int(\d+)$/.exec(p.type),bits=integerType?Number(integerType[1]):0;ensure(['address','bool','bytes32'].includes(p.type)||(integerType&&bits>=8&&bits<=256&&bits%8===0),'Unsupported admitted ABI scalar');return word(p.type,value);}
function constructorBytes(request,record){const args=record.definition.arguments.map(e=>evaluate(e,request.configuration,derived(request)));return'0x'+abiSequence(record.constructorABI.inputs,args);}
function requiredLiveChecks(pin,profile){return[
 {kind:'chain',chainId:profile.chainId,required:true},
 {kind:'manager-runtime',...clone(profile.manager),required:pin.kind==='pool-hook'},
 {kind:'state-view-runtime',...clone(profile.stateView),required:pin.kind==='pool-hook'},
 {kind:'deterministic-deployer',address:DETERMINISTIC_DEPLOYER,required:true,requirement:'Verify admitted runtime and unused predicted address before any transaction.'},
 {kind:'token-semantics',required:true,requirement:'Verify selected currencies and exact raw units; income requires distinct deployed plain nonrebasing ERC20 contracts.'},
 ...clone(pin.definition.liveChecks),
 {kind:'exact-simulation-and-signing-review',required:true,executionEnabled:false}
 ];}
function signature(fn){const type=p=>p.type.startsWith('tuple')?'('+p.components.map(type).join(',')+')'+p.type.slice(5):p.type;return fn.name+'('+fn.inputs.map(type).join(',')+')';}
function getterChecks(request,record,address=null){
 const contract=record.kind==='pool-hook'?'hook':'module',c=request.configuration,d=derived(request,address),checks=[];
 for(const spec of record.definition.checks){
  const selectorHex=record.methodIdentifiers[spec.read],fn=record.abi.find(f=>f.type==='function'&&signature(f)===spec.read);
  ensure(typeof selectorHex==='string'&&/^[0-9a-f]{8}$/.test(selectorHex)&&'0x'+selectorHex===selector(spec.read)&&fn&&['view','pure'].includes(fn.stateMutability),'Required pinned getter ABI/selector missing');
  const append=ctx=>{const args=spec.arguments.map(e=>evaluate(e,c,d,ctx)),values=spec.expected.map(e=>evaluate(e,c,d,ctx)),pending=values.some(v=>v===undefined);
   ensure(values.length===fn.outputs.length,'Pinned getter output arity');checks.push({contract,read:spec.read,arguments:args,argumentTypes:fn.inputs.map(p=>p.type),data:'0x'+selectorHex+abiSequence(fn.inputs,args),expected:pending?null:values.length===1?values[0]:values,expectedReturn:pending?null:'0x'+abiSequence(fn.outputs,values),outputTypes:fn.outputs.map(p=>p.type),phase:spec.phase,required:true,...(pending?{resolution:'requires-predicted-address',expectedExpressions:clone(spec.expected)}:{}),...(address?{to:address}:{})});};
  if(!spec.each)append({});else{const array=spec.each.field==='$currencies'?[c.token,c.quote]:c[spec.each.field];const visit=(items,depth,indices)=>{items.forEach((item,i)=>depth===1?append({item,indices:[...indices,i]}):visit(item,depth-1,[...indices,i]));};visit(array,spec.each.depth,[]);}
 }
 return checks;
}
async function construct(request,record){
 const profile=catalogChain(request.chainId),pin=CATALOG_PINS[request.template],c=request.configuration,isHook=pin.kind==='pool-hook',id=isHook?'hook':'module',ctor=constructorBytes(request,record),initcode=record.creationBytecode+ctor.slice(2);ensure((initcode.length-2)/2<=49152,'Initcode cap exceeded');
 const artifactInput={kind:'qhooks-lab-template-artifact-input',schemaVersion:1,sourceVersion:VERSION,edition:clone(CATALOG_EDITION),record};
 const artifactInputSHA256=await catalogSHA256(JSON.stringify(artifactInput));
 const configuration={projectName:request.projectName,...clone(c),...(isHook?{poolManager:profile.manager.address,poolFee:derived(request).poolFee,permissionFlags:String(pin.permissionFlags)}:{beneficiaryCount:String(c.beneficiaries.length),builder:ZERO,builderBps:'0'}),catalogueBinding:{artifactInput:clone(artifactInput),artifactInputSHA256}};
 if(c.ranges)configuration.rangeCount=String(c.ranges.length);
 const getters=getterChecks(request,record);
 const salt=isHook?{mine:{flags:pin.permissionFlags}}:{const:keccak(new TextEncoder().encode(JSON.stringify({domain:'qhooks-local-revenue-module-kit/v1',chainId:profile.chainId,deployer:DETERMINISTIC_DEPLOYER,selection:pin.id,initcodeHash:keccak(initcode)})))};
 const artifact={kind:'qhooks-lab-deploy-build',schemaVersion:1,template:'catalogue/'+pin.id,templateTitle:request.projectName,chainId:profile.chainId,chain:{id:profile.chainId,name:profile.name,native:profile.native,poolManager:profile.manager.address},configuration,contracts:{[id]:{name:pin.contract,abi:clone(record.abi),bytecode:initcode,deployedBytecode:record.deployedBytecode,immutables:clone(pin.immutables),methodIdentifiers:clone(record.methodIdentifiers),constructorPreencoded:true}},salts:{},plan:[{id,kind:'create2',contract:id,label:'Deploy '+pin.name,types:[],args:[],salt}],checks:getters.filter(g=>g.arguments.length===0&&g.expectedReturn!==null).map(g=>({contract:id,read:g.read,expect:{const:g.expectedReturn},phase:g.phase})),compilerInput:null,sourceInputSha256:await catalogSHA256(JSON.stringify(null)),prepared:true,executionEnabled:false,signingEnabled:false,requiredLiveChecks:requiredLiveChecks(pin,profile),sourceVersion:VERSION};
 if(isHook){ensure(Number.isInteger(pin.permissionFlags)&&pin.permissionFlags>=0&&pin.permissionFlags<=16383,'Invalid admitted hook flags');artifact.hook={contract:'hook',flags:pin.permissionFlags,permissions:clone(pin.callbacks)};artifact.plan.push({id:'initialize',kind:'initialize',label:'Initialize exact reviewed pool',key:{currency0:{config:'currency0'},currency1:{config:'currency1'},fee:{config:'poolFee'},tickSpacing:{config:'tickSpacing'},hooks:{ref:'hook'}}});}
 artifact.buildHash=await buildHash(artifact);return{artifactInput,artifact,additionalChecks:getters.filter(g=>g.arguments.length>0||g.expectedReturn===null),getters};
}
async function prepareRecord(request,capturedRecord){
 const record=await verifyRecord(capturedRecord,request.template),built=await construct(request,record);
 return frozen({kind:'qhooks-lab-catalog-build',schemaVersion:1,sourceVersion:VERSION,request,artifactInput:built.artifactInput,artifact:built.artifact,additionalChecks:built.additionalChecks});
}
// A selected captured record still passes every source, ABI, code and getter pin.
// Delivery separately binds its exact bytes to the complete admitted edition.
export async function prepareCatalogRecordBuild(input,capturedRecord){return prepareRecord(normalizeCatalogRequest(input),capturedRecord);}
export async function prepareCatalogBuild(input,captureBundle){
 const request=normalizeCatalogRequest(input);plain(captureBundle,['edition','records'],'Capture bundle');captureBundle=clone(captureBundle);const edition=clone(CATALOG_EDITION);delete edition.bundleSHA256;
 ensure(equal(captureBundle.edition,edition)&&await catalogSHA256(JSON.stringify(captureBundle))===CATALOG_EDITION.bundleSHA256,'Pinned capture bundle changed');
 ensure(equal(Object.keys(captureBundle.records).sort(),Object.keys(CATALOG_PINS).sort()),'Capture template set changed');
 return prepareRecord(request,captureBundle.records[request.template]);
}
export async function verifyCatalogBuild(response,input,{plan:withPlan=true}={}){
 const request=normalizeCatalogRequest(input);plain(response,RESPONSE,'Build response');ensure(JSON.stringify(response).length<=2097152,'Build response exceeds bound');response=clone(response);
 ensure(response.kind==='qhooks-lab-catalog-build'&&response.schemaVersion===1&&response.sourceVersion===VERSION&&equal(response.request,request),'Response/request identity mismatch');
 plain(response.artifactInput,INPUT,'Artifact input');ensure(response.artifactInput.kind==='qhooks-lab-template-artifact-input'&&response.artifactInput.schemaVersion===1&&response.artifactInput.sourceVersion===VERSION&&equal(response.artifactInput.edition,CATALOG_EDITION),'Unsupported artifact input');
 const record=await verifyRecord(response.artifactInput.record,request.template),expected=await construct(request,record);
 ensure(equal(response.artifactInput,expected.artifactInput)&&equal(response.artifact,expected.artifact)&&equal(response.additionalChecks,expected.additionalChecks),'Response differs from pinned code or derived plan/checks');
 const isHook=CATALOG_PINS[request.template].kind==='pool-hook',inputs=isHook?{sqrtPriceX96:request.configuration.sqrtPriceX96}:{};
 const result={kind:'qhooks-prepared-catalogue-template',schemaVersion:1,sourceVersion:VERSION,request,artifactInput:clone(expected.artifactInput),artifact:clone(expected.artifact),inputs,input:clone(inputs),additionalChecks:clone(expected.additionalChecks),buildHash:expected.artifact.buildHash,requiredLiveChecks:clone(expected.artifact.requiredLiveChecks),executionEnabled:false};
 if(withPlan){const plan=planTransactions(expected.artifact,inputs),address=plan.addresses[isHook?'hook':'module'];if(!isHook)ensure(!request.configuration.beneficiaries.includes(address),'A module cannot be its own beneficiary');result.plan=plan;result.checks=getterChecks(request,record,address);ensure(result.checks.every(g=>g.expectedReturn!==null),'Unresolved required getter');if(isHook)ensure(plan.txs[1].poolId===derived(request,address).poolId,'Planned pool identity mismatch');result.additionalChecks=result.checks.filter(g=>g.arguments.length>0||!expected.getters.some(e=>e.read===g.read&&e.expectedReturn!==null));}else result.checks=clone(expected.getters);
 return frozen(result);
}

// A downloaded preparation is not a receipt. Re-derive declarative checks from
// pinned source before resolving them, including address-derived zero-arg reads.
export async function verifyCatalogReviewManifest(input){
 const fields=['kind','schemaVersion','sourceVersion','chainId','projectName','template','buildHash','address','request','artifactInput','artifact','inputs','transactions','addresses','checks','requiredLiveChecks','executionEnabled','receipts','verification'];
 plain(input,fields,'Review manifest');ensure(JSON.stringify(input).length<=2097152,'Review manifest exceeds bound');const manifest=clone(input),request=normalizeCatalogRequest(manifest.request);
 plain(manifest.artifactInput,INPUT,'Artifact input');const record=await verifyRecord(manifest.artifactInput.record,request.template),built=await construct(request,record);
 const prepared=await verifyCatalogBuild({kind:'qhooks-lab-catalog-build',schemaVersion:1,sourceVersion:manifest.sourceVersion,request,artifactInput:manifest.artifactInput,artifact:manifest.artifact,additionalChecks:built.additionalChecks},request,{plan:true}),isPool=!!prepared.artifact.hook;
 const expected={kind:isPool?'qhooks-pool-preparation':'qhooks-revenue-module-preparation',schemaVersion:1,sourceVersion:prepared.sourceVersion,chainId:request.chainId,projectName:request.projectName,template:request.template,buildHash:prepared.buildHash,address:prepared.plan.addresses[isPool?'hook':'module'],request,artifactInput:prepared.artifactInput,artifact:prepared.artifact,inputs:prepared.inputs,transactions:prepared.plan.txs,addresses:prepared.plan.addresses,checks:prepared.checks,requiredLiveChecks:prepared.requiredLiveChecks,executionEnabled:false,receipts:[],verification:null};
 ensure(equal(manifest,expected),'Review manifest differs from the exact admitted preparation');return prepared;
}
