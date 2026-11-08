import {chainLaunchProfile,chooseLaunchCapabilities} from './qx-chain-launch-profiles.mjs';
import {createFixedPriceOpeningProposal,createCommunityAllocationProposal} from './qx-community-sale-core.mjs';
import {createRevenueMechanismProposal} from './qx-revenue-mechanisms-core.mjs';
import {keccak} from './lab-deploy-core.mjs';
import {chainById} from './chains.mjs';
export const CHAIN_LAUNCH_PACKAGE_VERSION=1,MAX_CHAIN_PACKAGE_BYTES=262144;
export const CHAIN_PACKAGE_GOALS=Object.freeze(['fixed-price-opening','community-allocation-vault','decrease-only-fees','fee-funded-bidwall','ecosystem-pair-routing']);
const SALE_COMMON=['token','quote','inventoryProvider','proceedsRecipient','unsoldRecipient','tokenInventory','minimumQuoteRaise','fundingDeadline','start','end'];
export const CHAIN_PACKAGE_PART_FIELDS=freeze({fixedOpening:[...SALE_COMMON,'maxTokensPerBuyer','priceQuoteNumerator','priceTokenDenominator'],communityVault:[...SALE_COMMON,'targetQuote','maxDepositPerBuyer','maxTotalDeposits','maxParticipants','vestingStart','vestingDuration'],revenue:{fee:['manager','currency0','currency1','poolLpFee','tickSpacing','quote','controller','buyCeilingPpm','sellCeilingPpm','initialBuyPpm','initialSellPpm'],wall:['tickLower','tickUpper','lpFeeBeneficiary','unusedBudgetRecipient','releaseAfter']},routing:['owner','poolKey','amountIn','slippageBps','deadline','referrer']});
const ensure=(v,m)=>{if(!v)throw new TypeError(m);};
function freeze(o){if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;}
const order=o=>Array.isArray(o)?o.map(order):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,order(o[k])])):o;
const hash=o=>keccak(new TextEncoder().encode(JSON.stringify(order(o))));
function record(o,keys,label,all=true){ensure(o&&Object.getPrototypeOf(o)===Object.prototype,label+' must be plain public data.');const ds=Object.getOwnPropertyDescriptors(o),own=Reflect.ownKeys(ds);ensure((!all||own.length===keys.length)&&own.every(k=>typeof k==='string'&&keys.includes(k)&&ds[k].enumerable&&Object.hasOwn(ds[k],'value')),label+' fields must match its public schema.');}
const text=(v,label,max=200)=>{ensure(typeof v==='string'&&v.length<=max,label+' is too long or missing.');return v;};
function partial(o,keys,label){record(o,keys,label,false);const out={};for(const k of Object.keys(o))out[k]=text(o[k],label+'.'+k,500);return out;}
function routing(o){record(o,CHAIN_PACKAGE_PART_FIELDS.routing,'Routing draft',false);const out={};for(const k of Object.keys(o)){if(k==='poolKey'){out[k]=partial(o[k],['currency0','currency1','fee','tickSpacing','hooks'],'Pool key');}else out[k]=text(o[k],k,100);}return out;}
export function createChainLaunchPackage(input){
 record(input,['chainId','label','token','goals','preferences','parts'],'Package');const profile=chainLaunchProfile(input.chainId);ensure(profile,'Choose a known chain package.');
 record(input.token,['name','symbol','address','decimals','inventoryBudget'],'Public token');const token={};for(const k of Object.keys(input.token))token[k]=text(input.token[k],k,k==='name'?64:k==='symbol'?10:100);ensure(/^(0|[1-9][0-9]?)$/.test(token.decimals)&&Number(token.decimals)<=36,'Use token decimals from0to36.');
 ensure(Array.isArray(input.goals)&&Object.getPrototypeOf(input.goals)===Array.prototype&&input.goals.length<=5&&Reflect.ownKeys(input.goals).length===input.goals.length+1,'Choose supported package goals.');for(let i=0;i<input.goals.length;i++){const d=Object.getOwnPropertyDescriptor(input.goals,String(i));ensure(d?.enumerable&&Object.hasOwn(d,'value')&&CHAIN_PACKAGE_GOALS.includes(d.value),'Choose supported package goals.');}ensure(new Set(input.goals).size===input.goals.length,'Choose each goal once.');ensure(input.goals.every(id=>profile.mechanismCandidates.some(m=>m.id===id)),'This chain package does not offer those mechanisms.');
 record(input.preferences,['funding','distribution','liquidity'],'Package preferences');const preferences={...input.preferences};ensure(['native','quote'].includes(preferences.funding),'Choose native or quote funding.');ensure(['market-link','farcaster-share','community-board'].includes(preferences.distribution),'Choose a distribution handoff.');ensure(['qhooks-v4','pancake-review','camelot-review','ecosystem-review'].includes(preferences.liquidity),'Choose a liquidity plan.');
 record(input.parts,['fixedOpening','communityVault','revenue','routing'],'Package parts');record(input.parts.revenue,['fee','wall'],'Revenue draft');const parts={fixedOpening:partial(input.parts.fixedOpening,CHAIN_PACKAGE_PART_FIELDS.fixedOpening,'Opening draft'),communityVault:partial(input.parts.communityVault,CHAIN_PACKAGE_PART_FIELDS.communityVault,'Community draft'),revenue:{fee:partial(input.parts.revenue.fee,CHAIN_PACKAGE_PART_FIELDS.revenue.fee,'Fee draft'),wall:partial(input.parts.revenue.wall,CHAIN_PACKAGE_PART_FIELDS.revenue.wall,'Bid range draft')},routing:routing(input.parts.routing)};
 const body={kind:'qhooks-chain-launch-package',schemaVersion:1,chainId:profile.id,label:text(input.label,'Package name',120),token,goals:[...input.goals],preferences,parts};ensure(new TextEncoder().encode(JSON.stringify(body)).byteLength<=MAX_CHAIN_PACKAGE_BYTES,'This public package is too large.');return freeze({...body,fingerprint:hash(body)});
}
export function newChainLaunchPackage(chainId='8453'){
 return createChainLaunchPackage({chainId,label:'My '+(chainLaunchProfile(chainId)?.name||'chain')+' launch',token:{name:'',symbol:'',address:'',decimals:'18',inventoryBudget:''},goals:[],preferences:{funding:'native',distribution:'market-link',liquidity:'qhooks-v4'},parts:{fixedOpening:{},communityVault:{},revenue:{fee:{},wall:{}},routing:{}}});
}
export function parseChainLaunchPackage(value){
 if(typeof value==='string'){ensure(new TextEncoder().encode(value).byteLength<=MAX_CHAIN_PACKAGE_BYTES,'Package file is too large.');value=JSON.parse(value);}
 record(value,['kind','schemaVersion','chainId','label','token','goals','preferences','parts','fingerprint'],'Saved package');ensure(value.kind==='qhooks-chain-launch-package'&&value.schemaVersion===1,'Unsupported package format.');const {chainId,label,token,goals,preferences,parts}=value,rebuilt=createChainLaunchPackage({chainId,label,token,goals,preferences,parts});ensure(value.fingerprint===rebuilt.fingerprint,'The package changed; prepare a new public review.');return rebuilt;
}
export function reviewChainLaunchPackage(value,{now=String(Math.floor(Date.now()/1000))}={}){
 const p=value&&Object.getOwnPropertyDescriptor(value,'kind')?parseChainLaunchPackage(value):createChainLaunchPackage(value),profile=chainLaunchProfile(p.chainId),proposals=[],issues=[];ensure(typeof now==='string'&&/^(0|[1-9][0-9]*)$/.test(now),'Use a public review time in seconds.');
 const include=(id,part,builder)=>{try{const proposal=builder({chainId:p.chainId,reviewedAt:now,configuration:p.parts[part]});proposals.push({id,part,proposal});}catch(e){issues.push({part,message:e.message});}};
 if(p.goals.includes('fixed-price-opening'))include('fixed-price-opening','fixedOpening',createFixedPriceOpeningProposal);
 if(p.goals.includes('community-allocation-vault'))include('community-allocation-vault','communityVault',createCommunityAllocationProposal);
 if(p.goals.some(g=>g==='decrease-only-fees'||g==='fee-funded-bidwall')){try{proposals.push({id:'decrease-only-fees-and-bidwall',part:'revenue',proposal:createRevenueMechanismProposal({kind:'qhooks-quote-fee-bidwall',schemaVersion:1,chainId:p.chainId,...p.parts.revenue})});}catch(e){issues.push({part:'revenue',message:e.message});}}
 const sales=proposals.filter(x=>x.part==='fixedOpening'||x.part==='communityVault');let requiredInventory=0n;
 for(const s of sales){const c=s.proposal.configuration;requiredInventory+=BigInt(c.tokenInventory);if(!p.token.address||c.token!==p.token.address.toLowerCase())issues.push({part:s.part,message:'Bind this opening to the package’s exact token address.'});}
 if(sales.length){if(!/^[1-9][0-9]*$/.test(p.token.inventoryBudget)||BigInt(p.token.inventoryBudget)<requiredInventory)issues.push({part:'inventory',message:'Commit enough distinct token inventory for every enabled opening; the same tokens cannot fund two escrows.'});if(new Set(sales.map(s=>s.proposal.configuration.quote)).size>1)issues.push({part:'inventory',message:'Review the separate quote currencies before combining these openings.'});}
 const revenue=proposals.find(x=>x.part==='revenue');if(revenue){const fee=revenue.proposal.fee,token=fee.currency0===fee.quote?fee.currency1:fee.currency0,chain=chainById(p.chainId);if(!p.token.address||token!==p.token.address.toLowerCase())issues.push({part:'revenue',message:'Bind the fee pool’s non-quote currency to the package’s exact token address.'});if(!chain?.contracts?.manager||fee.manager!==chain.contracts.manager.toLowerCase())issues.push({part:'revenue',message:'This pool manager differs from the chain’s current QHooks generation and needs separate qualification.'});if(!profile.quote||fee.quote!==profile.quote.address.toLowerCase())issues.push({part:'revenue',message:'This quote asset differs from the chain’s current launch quote and needs separate qualification.'});}
 if(p.preferences.distribution==='farcaster-share'&&p.chainId!=='8453')issues.push({part:'distribution',message:'The current Farcaster handoff package is scoped to Base. Keep a market link on this chain.'});
 if(p.preferences.liquidity==='pancake-review'&&p.chainId!=='56'||p.preferences.liquidity==='camelot-review'&&p.chainId!=='42161')issues.push({part:'liquidity',message:'This liquidity destination belongs to another chain’s package.'});
 if(p.preferences.liquidity!=='qhooks-v4')issues.push({part:'liquidity',message:'This ecosystem destination needs its own qualified migration adapter; the preference does not create a transaction.'});
 if(p.goals.includes('ecosystem-pair-routing'))issues.push({part:'routing',message:'Use Compare routes for a fresh exact-block quote; a saved draft is not an executable quote.'});
 return freeze({kind:'qhooks-chain-package-review',schemaVersion:1,packageFingerprint:p.fingerprint,chainId:p.chainId,profile,capabilities:chooseLaunchCapabilities({chainId:p.chainId,mechanismIds:p.goals}),proposals,issues,requiredTokenInventory:requiredInventory.toString(),inventoryBudget:p.token.inventoryBudget,declaredInventoryIsNotBalanceProof:true,independentOpenings:sales.length>1,poolTransitionAutomatic:false,executionEnabled:false});
}
export function createChainLaunchPackageStore({indexedDB=globalThis.indexedDB,name='qhooks.chain.packages.v1',clock=Date.now}={}){
 let opened=null;
 function open(){
  if(opened)return opened;
  let abandoned=false;
  const pending=new Promise((resolve,reject)=>{
   if(!indexedDB){reject(Error('Package storage is unavailable. Export your public draft to keep it.'));return;}
   const r=indexedDB.open(name,1);
   r.onupgradeneeded=()=>r.result.createObjectStore('packages',{keyPath:'id'});
   r.onerror=()=>reject(r.error);
   r.onblocked=()=>{abandoned=true;reject(Error('Close the older package tab, then retry.'));};
   r.onsuccess=()=>{
    const db=r.result;if(abandoned){db.close();return;}
    try{
     ensure(db.objectStoreNames.length===1&&db.objectStoreNames.contains('packages'),'Package storage schema is incompatible.');
     const s=db.transaction('packages').objectStore('packages');ensure(s.keyPath==='id'&&!s.autoIncrement&&!s.indexNames.length,'Package storage schema is incompatible.');
     db.onversionchange=()=>{db.close();if(opened===pending)opened=null;};resolve(db);
    }catch(e){db.close();reject(e);}
   };
  });
  opened=pending;pending.catch(()=>{if(opened===pending)opened=null;});return pending;
 }
 const checked=row=>{record(row,['id','blueprint','savedAt'],'Stored package');const blueprint=parseChainLaunchPackage(row.blueprint);ensure(row.id===blueprint.fingerprint&&Number.isSafeInteger(row.savedAt)&&row.savedAt>=0,'Stored package identity is inconsistent.');return{...row,blueprint};};
 async function tx(mode,work){const db=await open();return new Promise((resolve,reject)=>{let value,cause;const t=db.transaction('packages',mode),s=t.objectStore('packages');t.oncomplete=()=>resolve(value);t.onabort=()=>reject(cause||t.error||Error('Package storage was interrupted.'));t.onerror=()=>reject(cause||t.error||Error('Package storage failed.'));try{work(s,v=>{value=v;},e=>{cause=e;t.abort();});}catch(e){cause=e;t.abort();}});}
 return Object.freeze({async save(value){const blueprint=parseChainLaunchPackage(value),savedAt=clock();ensure(Number.isSafeInteger(savedAt)&&savedAt>=0,'Save time is unavailable.');return tx('readwrite',(s,done)=>{const row={id:blueprint.fingerprint,blueprint,savedAt};s.put(row);done(row);});},async list(){return tx('readonly',(s,done,fail)=>{const r=s.getAll();r.onsuccess=()=>{try{done(r.result.map(checked).sort((a,b)=>b.savedAt-a.savedAt));}catch(e){fail(e);}};});},async get(id){ensure(typeof id==='string'&&/^0x[0-9a-f]{64}$/.test(id),'Invalid package identity.');return tx('readonly',(s,done,fail)=>{const r=s.get(id);r.onsuccess=()=>{try{done(r.result?checked(r.result):null);}catch(e){fail(e);}};});},async close(){if(opened){(await opened).close();opened=null;}}});
}
