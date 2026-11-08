// Pure source proposals and exact raw-unit arithmetic. No wallet, provider,
// target deployment, signing, network, storage or live execution admission.
import {keccak} from './lab-deploy-core.mjs';
const U128=(1n<<128n)-1n,U64=(1n<<64n)-1n,U256=(1n<<256n)-1n,DAY=86400n;
const common=[['token','address'],['quote','address'],['inventoryProvider','address'],['proceedsRecipient','address'],['unsoldRecipient','address']];
const layouts={
 'fixed-price-opening':[...common,...['tokenInventory','maxTokensPerBuyer','priceQuoteNumerator','priceTokenDenominator'].map(n=>[n,'uint128']),['minimumQuoteRaise','uint256'],...['fundingDeadline','start','end'].map(n=>[n,'uint64'])],
 'proportional-community':[...common,...['tokenInventory','targetQuote','minimumQuoteRaise','maxDepositPerBuyer','maxTotalDeposits'].map(n=>[n,'uint128']),['maxParticipants','uint16'],...['fundingDeadline','start','end','vestingStart','vestingDuration'].map(n=>[n,'uint64'])]
};
const names={'fixed-price-opening':'QFixedPriceOpening','proportional-community':'QCommunityAllocationVault'};
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
function shape(x,keys,label){ensure(x&&Object.getPrototypeOf(x)===Object.prototype,label+' must be plain public data.');const ds=Object.getOwnPropertyDescriptors(x),own=Reflect.ownKeys(ds);ensure(own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k)&&ds[k].enumerable&&Object.hasOwn(ds[k],'value')),label+' fields must match exactly.');}
function uint(v,max,label,positive=false){ensure(typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v),'Use canonical raw decimal strings for '+label+'.');const n=BigInt(v);ensure(n<=max&&(!positive||n>0n),'Out-of-range '+label+'.');return n;}
function address(v){ensure(typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)&&BigInt(v)!==0n,'Use a nonzero exact address.');return v.toLowerCase();}
const ceil=(n,d)=>n/d+(n%d===0n?0n:1n);
const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
const fingerprint=x=>keccak(new TextEncoder().encode(JSON.stringify(sort(x))));
function exact(actual,expected){
 if(expected===null||typeof expected!=='object'){ensure(actual===expected,'Proposal content or source identity changed. Review a new proposal.');return;}
 if(Array.isArray(expected)){
  ensure(Array.isArray(actual)&&Object.getPrototypeOf(actual)===Array.prototype&&actual.length===expected.length,'Proposal array changed.');
  const ds=Object.getOwnPropertyDescriptors(actual);ensure(Reflect.ownKeys(ds).length===expected.length+1&&expected.every((_,i)=>ds[i]&&Object.hasOwn(ds[i],'value')),'Proposal arrays must be dense public data.');expected.forEach((v,i)=>exact(actual[i],v));return;
 }
 shape(actual,Object.keys(expected),'Proposal record');for(const key of Object.keys(expected))exact(actual[key],expected[key]);
}

export function fixedPriceQuoteCost(input){
 shape(input,['tokens','priceQuoteNumerator','priceTokenDenominator'],'Fixed price math');
 const tokens=uint(input.tokens,U128,'tokens'),n=uint(input.priceQuoteNumerator,U128,'price numerator',true),d=uint(input.priceTokenDenominator,U128,'price denominator',true);
 return ceil(tokens*n,d).toString();
}
export function proportionalCommunityEntitlement(input){
 shape(input,['deposited','snapshotDeposits','tokenInventory','targetQuote','successful'],'Community entitlement');
 const d=uint(input.deposited,U128,'deposited'),total=uint(input.snapshotDeposits,U128,'snapshot deposits'),inventory=uint(input.tokenInventory,U128,'inventory',true),target=uint(input.targetQuote,U128,'target quote',true);ensure(d<=total&&typeof input.successful==='boolean'&&(!input.successful||total>0n),'Invalid snapshot participation.');
 let tokens=0n,used=0n;if(input.successful&&d>0n){tokens=d*inventory/(total>target?total:target);used=tokens===0n?0n:d*(total>target?target:total)/total;}
 return freeze({tokenAllocation:tokens.toString(),quoteUsed:used.toString(),quoteRefund:(d-used).toString()});
}
export function communityVestedAmount(input){
 shape(input,['tokenAllocation','vestingStart','vestingDuration','now','alreadyClaimed'],'Vesting math');
 const tokens=uint(input.tokenAllocation,U128,'allocation'),start=uint(input.vestingStart,U64,'vesting start'),duration=uint(input.vestingDuration,10n*365n*DAY,'vesting duration'),now=uint(input.now,U64,'now'),claimed=uint(input.alreadyClaimed,U128,'claimed');
 const elapsed=now<start?0n:now-start,vested=now<start?0n:duration===0n||elapsed>=duration?tokens:tokens*elapsed/duration;ensure(claimed<=vested,'Claimed amount exceeds vested allocation in supplied time.');return freeze({vested:vested.toString(),claimable:(vested-claimed).toString()});
}
function create(mechanism,input){
 shape(input,['chainId','reviewedAt','configuration'],'Sale proposal input');const layout=layouts[mechanism];
 uint(input.chainId,U64,'chain ID',true);const reviewedAt=uint(input.reviewedAt,U64,'review time');shape(input.configuration,layout.map(([n])=>n),'Immutable configuration');
 const c=Object.fromEntries(layout.map(([key,type])=>[key,type==='address'?address(input.configuration[key]):uint(input.configuration[key],type==='uint128'?U128:type==='uint64'?U64:type==='uint16'?65535n:U256,key).toString()]));
 const n=key=>BigInt(c[key]);ensure(c.token!==c.quote,'Token and quote must be distinct.');ensure(n('tokenInventory')>0n,'Funded inventory must be positive.');
 ensure(n('fundingDeadline')>reviewedAt&&n('fundingDeadline')<=n('start')&&n('start')<n('end')&&n('end')-n('start')<=30n*DAY,'Use a future funding deadline and finite opening window up to30days.');
 let derived;
 if(mechanism==='fixed-price-opening'){
  ensure(n('maxTokensPerBuyer')>0n&&n('maxTokensPerBuyer')<=n('tokenInventory')&&n('priceQuoteNumerator')>0n&&n('priceTokenDenominator')>0n,'Invalid fixed price or token budget.');
  ensure(n('minimumQuoteRaise')<=ceil(n('tokenInventory')*n('priceQuoteNumerator'),n('priceTokenDenominator')),'Minimum raise exceeds full inventory price.');
  derived={quoteRounding:'ceil-per-reservation',buyerCancellation:'strictly-before-end',claimTime:c.end};
 }else{
  const participants=n('maxParticipants');ensure(n('targetQuote')>0n&&n('minimumQuoteRaise')>0n&&participants>0n&&participants<=512n&&n('targetQuote')>=participants&&n('minimumQuoteRaise')+participants-1n<=n('targetQuote'),'Minimum raise must allow participant floor dust.');
  ensure(n('maxTotalDeposits')>=n('targetQuote')&&n('maxDepositPerBuyer')>0n&&n('maxDepositPerBuyer')<=n('maxTotalDeposits'),'Invalid quote deposit limits.');
  const minimum=ceil(n('maxTotalDeposits'),n('tokenInventory'));ensure(minimum<=n('maxDepositPerBuyer'),'Inventory is too small for a positive worst-case allocation.');
  ensure(n('vestingStart')>=n('end')&&n('vestingStart')<=n('end')+365n*DAY&&n('vestingDuration')<=10n*365n*DAY,'Invalid finite vesting schedule.');
  derived={minimumDepositForPositiveAllocation:minimum.toString(),maximumQuoteRoundingDust:(participants-1n).toString(),tokenRounding:'floor-per-buyer; unsold returned only after all accounts booked',quoteRounding:'floor-used-per-buyer; all unused quote refunded',buyerCancellation:'strictly-before-end',claimTime:c.vestingStart};
 }
 const contractName=names[mechanism],body={kind:'qhooks-community-sale-proposal',schemaVersion:1,mechanism,chainId:input.chainId,reviewedAt:input.reviewedAt,configuration:c,
  source:{contractName,path:'contracts/chain-launch/fair/src/'+contractName+'.sol',compiler:'0.8.26'},
  constructor:{inputs:[{name:'c',type:'tuple',components:layout.map(([name,type])=>({name,type}))}],args:[c]},
  inventoryFunding:{actor:c.inventoryProvider,asset:c.token,amount:c.tokenInventory,strictlyBefore:c.fundingDeadline},derived,
  target:null,routeAdmission:'unadmitted-source',requiresPlainERC20Verification:true,requiresFreshChainState:true,poolIntegration:false,pqProtection:false,executionEnabled:false};
 return freeze({...body,fingerprint:fingerprint(body)});
}
export const createFixedPriceOpeningProposal=input=>create('fixed-price-opening',input);
export const createCommunityAllocationProposal=input=>create('proportional-community',input);
export function parseCommunitySaleProposal(value){
 if(typeof value==='string'){ensure(value.length<=20000,'Proposal file too large.');value=JSON.parse(value);}
 const keys=['kind','schemaVersion','mechanism','chainId','reviewedAt','configuration','source','constructor','inventoryFunding','derived','target','routeAdmission','requiresPlainERC20Verification','requiresFreshChainState','poolIntegration','pqProtection','executionEnabled','fingerprint'];shape(value,keys,'Sale proposal');
 ensure(Object.hasOwn(layouts,value.mechanism),'Unsupported sale mechanism.');const rebuilt=create(value.mechanism,{chainId:value.chainId,reviewedAt:value.reviewedAt,configuration:value.configuration});
 exact(value,rebuilt);return rebuilt;
}
export function communitySaleCallProposal(proposal,input){
 const p=parseCommunitySaleProposal(proposal);shape(input,['actor','action','arguments'],'Sale call input');const actor=address(input.actor),c=p.configuration,action=input.action;let args=[],signature;
 const noArgs=['fundInventory','cancel','finalize','claimTokens','claimRefund','withdrawProceeds','withdrawUnsold'];
 if(noArgs.includes(action)){
  shape(input.arguments,[],'Call arguments');signature=action+'()';
  const role={fundInventory:'inventoryProvider',withdrawProceeds:'proceedsRecipient',withdrawUnsold:'unsoldRecipient'}[action];if(role)ensure(actor===c[role],'Only the immutable '+role+' may propose this action.');
 }else if(action==='reserve'&&p.mechanism==='fixed-price-opening'){
  shape(input.arguments,['tokens','maximumQuote','minimumTokens','recipient'],'Reserve arguments');const a=input.arguments,t=uint(a.tokens,U128,'tokens',true),maximum=uint(a.maximumQuote,U256,'maximum quote'),minimum=uint(a.minimumTokens,U128,'minimum tokens');
  ensure(t<=BigInt(c.maxTokensPerBuyer)&&minimum<=t&&maximum>=BigInt(fixedPriceQuoteCost({tokens:a.tokens,priceQuoteNumerator:c.priceQuoteNumerator,priceTokenDenominator:c.priceTokenDenominator})),'Invalid exact reservation bounds.');args=[a.tokens,a.maximumQuote,a.minimumTokens,address(a.recipient)];signature='reserve(uint128,uint256,uint128,address)';
 }else if(action==='deposit'&&p.mechanism==='proportional-community'){
  shape(input.arguments,['quoteAmount','minimumTokensAtMaximum','recipient'],'Deposit arguments');const a=input.arguments,q=uint(a.quoteAmount,U128,'quote amount',true),m=uint(a.minimumTokensAtMaximum,U128,'minimum tokens');
  ensure(q>=BigInt(p.derived.minimumDepositForPositiveAllocation)&&q<=BigInt(c.maxDepositPerBuyer)&&q*BigInt(c.tokenInventory)/BigInt(c.maxTotalDeposits)>=m,'Invalid fresh-buyer deposit bounds.');args=[a.quoteAmount,a.minimumTokensAtMaximum,address(a.recipient)];signature='deposit(uint128,uint128,address)';
 }else if(action==='settleFor'&&p.mechanism==='proportional-community'){
  shape(input.arguments,['buyer'],'Settle arguments');args=[address(input.arguments.buyer)];signature='settleFor(address)';
 }else throw new TypeError('Unsupported call for this mechanism.');
 return freeze({kind:'qhooks-community-sale-call-proposal',schemaVersion:1,parentFingerprint:p.fingerprint,chainId:p.chainId,actor,target:null,functionName:action,signature,args,requiresFreshChainState:true,freshBuyerAssumption:action==='deposit',routeAdmission:'unadmitted-source',executionEnabled:false});
}
