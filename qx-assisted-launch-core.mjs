// Guided, public-data planning over the existing Create engine. No signer,
// wallet provider, storage, network, natural-language model or execution access.
import {chainById} from './chains.mjs';
import {BLOCKS} from './qx-block-catalog.mjs';
import {CREATE_STYLES, defaultConfig, presetRules, validateConfig, makeBlocks,
 allocationAmounts, human, units, workspaceFields, validAddress} from './qx-create-plan.mjs';
import {BLOCK_BITS} from './full-launch/packages/multichain-launch/launch-blocks.mjs';
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

export const ASSISTED_VERSION=1;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const ASSISTED_RECIPES=freeze([
 {id:'minimal',version:1,style:'none',title:'Keep it simple',summary:'A plain protected pool. No extra block tax, wallet caps or launch games.',options:[]},
 {id:'opening',version:1,style:'fair',title:'Protect the opening',summary:'A falling opening tax, temporary wallet limits and cooldown, plus a lasting sandwich charge.',options:['guardMinutes']},
 {id:'holder-income',version:1,style:'flywheel',title:'Reward holders',summary:'A 2% buy/sell tax funds buybacks, referrals and income for stakers and your wallet.',options:['guardMinutes','stakersPercent','referralsPercent']}
]);
export const ASSISTED_SOURCES=freeze({
 recipes:'qx-block-catalog.mjs#PRESETS',
 config:'qx-create-plan.mjs#makeBlocks',
 chains:'chains.mjs#CHAIN_REGISTRY',
 limits:'full-launch/packages/multichain-launch/launch-blocks.mjs#normalizeBlocks',
 poolFees:'full-launch/packages/multichain-launch/descriptor.mjs#describe',
 launchFields:'qx-create-plan.mjs#workspaceFields',
 routeFees:'qx-swap.mjs#FEE_BPS',
 recovery:'qx-create-runner.mjs#createLaunchContext'
});
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
const CONFIG_KEYS=Object.keys(defaultConfig()),ALLOCATION_KEYS=['id','label','pct','wallet','cliff','duration','notice'];
const RULE_KEYS=['style','stakers','referrals','antiSnipe'];
const LABELS={style:'Launch style',stakers:'Stakers’ share of payee income',referrals:'Referrers’ share of charges',antiSnipe:'Opening guard · minutes'};
// This address is used only to exercise the existing pure engine validator
// before a wallet is connected. It is never exposed as a suggested recipient.
const VALIDATION_OWNER='0x'+'1'.repeat(40);
const canonical=v=>JSON.stringify(sort(v));
function sort(value){return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;}
const digest=value=>'qha1-'+Array.from(keccak_256(new TextEncoder().encode(canonical(value))),b=>b.toString(16).padStart(2,'0')).join('');
function dataObject(value){
 ensure(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'Use plain public data.');
 const fields=Object.getOwnPropertyDescriptors(value);
 ensure(Object.values(fields).every(d=>Object.hasOwn(d,'value')),'Use plain public data without accessors.');
 return fields;
}
function onlyKeys(fields,keys,message){ensure(Object.keys(fields).every(k=>keys.includes(k)),message);}
function publicDraft(input){
 const fields=dataObject(input);onlyKeys(fields,CONFIG_KEYS,'This draft uses settings the guided planner cannot preserve. Use full customization.');
 const defaults=defaultConfig(),result={};
 for(const key of CONFIG_KEYS){
  const value=Object.hasOwn(fields,key)?fields[key].value:defaults[key];
  if(key==='allocations'){
   ensure(Array.isArray(value)&&value.length<=32,'Use at most 32 public allocations.');
   result.allocations=value.map(row=>{
    const f=dataObject(row);onlyKeys(f,ALLOCATION_KEYS,'This allocation uses settings the guided planner cannot preserve. Use full customization.');
    return Object.fromEntries(ALLOCATION_KEYS.map(k=>{const v=f[k]?.value;ensure(['string','number'].includes(typeof v),'Complete the public allocation settings.');return[k,v];}));
   });
  }else{
   ensure(['string','number','boolean'].includes(typeof value),'Use plain public data for '+key+'.');
   if(typeof value==='number')ensure(Number.isFinite(value),'Enter a finite value for '+key+'.');
   if(typeof value==='string')ensure(value.length<=3000000,'This draft field is too large.');
   result[key]=value;
  }
 }
 ensure(typeof result.chainId==='string','Choose a supported chain.');
 ensure(typeof result.name==='string'&&typeof result.symbol==='string','Enter a token name and ticker.');
 ensure(typeof result.quantum==='boolean','Choose the key protection setting.');
 return result;
}
function publicContext(input={}){
 const fields=dataObject(input),owner=fields.owner?.value??null;
 ensure(owner===null||owner===''||validAddress(owner),'Connect a valid launch wallet.');
 for(const key of ['busy','hasRecord'])ensure(!fields[key]||typeof fields[key].value==='boolean','Use a boolean launch state for '+key+'.');
 return {owner:owner?owner.toLowerCase():null,busy:fields.busy?.value===true,hasRecord:fields.hasRecord?.value===true};
}
function supportedChain(id){const c=chainById(id);ensure(c?.status==='live','Choose a live launch chain supported by Create.');return c;}
function definition(id){const r=ASSISTED_RECIPES.find(r=>r.id===id);ensure(r,'Choose one of the supported guided recipes.');return r;}
function recipeSource(recipe){
 const p=CREATE_STYLES.find(p=>p.id===recipe.style);ensure(p,'This recipe is no longer in Create.');
 return {recipe,preset:p,blocks:BLOCKS.filter(b=>p.on.includes(b.id))};
}
export function assistedDraftFingerprint(config,context={}){
 const c=publicDraft(config),ctx=publicContext(context),chain=supportedChain(c.chainId);
 return digest({version:ASSISTED_VERSION,config:c,context:ctx,chain,recipes:ASSISTED_RECIPES.map(recipeSource)});
}
function guard(value){
 ensure((typeof value==='number'&&Number.isSafeInteger(value))||(typeof value==='string'&&/^\d{1,5}$/.test(value)),'Use a whole number of minutes for the opening guard.');
 const n=Number(value);ensure(n>=1&&n<=10080,'The opening guard is 1–10080 minutes.');return n;
}
function percent(value,label){
 ensure(typeof value==='number'||typeof value==='string','Enter '+label+' as a percentage.');
 const s=String(value);ensure(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s)&&s.length<=7,'Use up to two decimals for '+label+'.');
 const n=units(s,2);ensure(n<=10000n,label+' is between 0 and 100%.');return Number(n)/100;
}
function readIntent(input){
 const fields=dataObject(input);onlyKeys(fields,['version','recipeId','recipeVersion','chainId','options'],'Choose supported recipe options; free text and custom hooks are not part of this planner.');
 ensure(fields.version?.value===ASSISTED_VERSION,'This planner version changed. Review a fresh recipe.');
 const recipe=definition(fields.recipeId?.value);ensure(fields.recipeVersion?.value===recipe.version,'This recipe version changed. Review it again.');
 const chainId=fields.chainId?.value;ensure(typeof chainId==='string','Choose a supported chain.');supportedChain(chainId);
 const optionFields=dataObject(fields.options?.value??{});onlyKeys(optionFields,recipe.options,'This recipe does not support that setting. Use full customization.');
 const defaults=presetRules(recipe.style),options={};
 if(recipe.options.includes('guardMinutes'))options.guardMinutes=guard(optionFields.guardMinutes?.value??defaults.antiSnipe);
 if(recipe.options.includes('stakersPercent'))options.stakersPercent=percent(optionFields.stakersPercent?.value??defaults.stakers,'Stakers’ share');
 if(recipe.options.includes('referralsPercent'))options.referralsPercent=percent(optionFields.referralsPercent?.value??defaults.referrals,'Referrers’ share');
 return {version:ASSISTED_VERSION,recipeId:recipe.id,recipeVersion:recipe.version,chainId,options};
}
export function createAssistedIntent(recipeId,config,options={}){
 const c=publicDraft(config),recipe=definition(recipeId);
 return freeze(readIntent({version:ASSISTED_VERSION,recipeId,recipeVersion:recipe.version,chainId:c.chainId,options}));
}
function resolve(input,config,context){
 const intent=readIntent(input),current=publicDraft(config),ctx=publicContext(context),recipe=definition(intent.recipeId);
 ensure(!ctx.busy,'Wait for the current launch step to finish.');
 ensure(!ctx.hasRecord,'This launch has saved progress. Continue in the launch review.');
 ensure(intent.chainId===current.chainId,'Your chain changed. Review the recipe again.');
 const rules=presetRules(recipe.style),proposed={...current,style:recipe.style,
  stakers:intent.options.stakersPercent??rules.stakers,
  referrals:intent.options.referralsPercent??rules.referrals,
  antiSnipe:intent.options.guardMinutes??rules.antiSnipe};
 const missingFields=['name','symbol'].filter(k=>!current[k].trim());
 // The recipe may be applied before identity is entered. Placeholders exercise
 // the engine's remaining rules; the original empty fields stay in the draft.
 const checked={...proposed,name:proposed.name||'Your token',symbol:proposed.symbol||'TOKEN'};
 validateConfig(checked,ctx.owner||VALIDATION_OWNER);
 const blocks=makeBlocks(checked,ctx.owner||VALIDATION_OWNER);
 return {intent,current,ctx,recipe,proposed,checked,blocks,missingFields};
}
export function validateAssistedIntent(intent,config,context={}){
 try{resolve(intent,config,context);return freeze({ok:true,issues:[]});}
 catch(error){return freeze({ok:false,issues:[{code:'guided_configuration',message:error.message}]});}
}
const pct=bps=>human(BigInt(bps),2);
const sharePercent=(a,b)=>human(BigInt(a)*BigInt(b),6);
function reviewFor({proposed:c,checked,ctx,blocks}){
 const chain=supportedChain(c.chainId),b=JSON.parse(blocks),owner=ctx.owner||'Your launch wallet';
 const active=Object.keys(BLOCK_BITS).filter(k=>(BigInt(b.mask)&(1n<<BigInt(BLOCK_BITS[k])))!==0n);
 const has=id=>active.includes(id),behavior=[];
 if(!active.length)behavior.push('Open buying and selling. No extra block tax, wallet caps, cooldown or launch games.');
 if(has('antiSnipe'))behavior.push('Buys start with a '+pct(b.snipeBps)+'% opening tax, falling to '+pct(b.snipeFloorBps)+'% over '+Number(b.snipeDecay)/60+' minutes. The opening per-block buy cap starts at '+human(b.maxBuyPerBlock,chain.quote.decimals)+' '+chain.quote.symbol+' and widens during that decay.');
 if(has('walletCap'))behavior.push('Each wallet can buy at most '+pct(b.walletCapBps)+'% of total supply during the '+c.antiSnipe+' minutes of the opening guard.');
 if(has('cooldown'))behavior.push('Each wallet waits '+b.cooldownSeconds+' seconds between buys during that guard.');
 if(has('sandwich'))behavior.push('Trades that reverse this block’s price move can pay up to '+pct(b.sandwichMaxBps)+'%. This charge continues after the opening guard.');
 if(has('tax'))behavior.push('Every buy pays '+pct(b.buyTaxBps)+'% and every sell pays '+pct(b.sellTaxBps)+'% block tax in '+chain.quote.symbol+'.');
 if(has('buyback'))behavior.push(pct(b.buybackShareBps)+'% of block charges funds buybacks. After '+Number(b.buybackCooldown)/60+' minutes, someone must run the buyback; its quote limit is '+human(b.buybackMax,chain.quote.decimals)+' '+chain.quote.symbol+' and its price limit is '+pct(b.buybackSlipBps)+'%. Bought tokens are burned.');
 if(has('referrals'))behavior.push('Trades with an eligible credited referrer allocate '+pct(b.referralShareBps)+'% of block charges to that referrer.');
 if(has('points'))behavior.push('Trading volume earns accounting points; points do not promise a payout.');
 const buyback=has('buyback')?BigInt(b.buybackShareBps):0n,referrer=has('referrals')?BigInt(b.referralShareBps):0n,payees=10000n-buyback-referrer,stakers=units(String(c.stakers),2);
 if(stakers>0n)behavior.push(pct(stakers)+'% of payee income goes to the launch’s staking vault and streams to stakers over a day. The remaining payee income goes to '+owner+'.');
 else if(active.length)behavior.push('The remaining payee income goes to '+owner+'.');
 const fields=workspaceFields(checked,ctx.owner||VALIDATION_OWNER),lp=BigInt(fields.lpFeePpm),protocol=lp/5n;
 const allocations=allocationAmounts(c.supply,c.allocations);
 return {
  chain:{id:chain.id,name:chain.name},
  blocks:active.map(id=>({id,name:BLOCKS.find(block=>block.id===id)?.name||id})),behavior,
  recurringTax:{buyPercent:has('tax')?pct(b.buyTaxBps):'0',sellPercent:has('tax')?pct(b.sellTaxBps):'0'},
  poolFees:{creatorPercent:human(lp,4),protocolPercent:human(protocol,4),totalPercent:human(lp+protocol,4),creatorRecipient:'Creator fee vault · '+owner,protocolRecipient:'QHooks protocol fee collector'},
  routeFee:{percent:'1',detail:'Trades through the QHooks terminal’s fee router also pay its 1% routing fee in the quote asset or native payment. Cashback and referral shares are shown in the trade quote. Other routes can have different charges.'},
  revenue:{creator:owner,buybackOfChargesPercent:pct(buyback),referrerOfChargesPercent:pct(referrer),payeesOfChargesPercent:pct(payees),stakersOfPayeesPercent:pct(stakers),stakersOfChargesPercent:sharePercent(payees,stakers),creatorOfChargesPercent:sharePercent(payees,10000n-stakers),hasCharges:active.some(id=>['antiSnipe','sandwich','tax'].includes(id))},
  liquidity:{amount:c.liquidity,unit:chain.quote.symbol,wrapNative:chain.quote.wrapNative,native:chain.native},
  supply:{total:c.supply,poolAmount:human(allocations.pool),poolPercent:pct(allocations.poolBps),allocations:allocations.allocations},
  costs:{platformAmount:chain.launchFee,platformWei:chain.launchFeeWei,platformRecipient:'QHooks launch-fee collector',native:chain.native,networkGas:null,networkDetail:'Refresh network gas in the launch review. Each transaction is estimated again before sending.'},
  controls:[
   'Selected block settings and payee shares are fixed at launch. Nobody can change them afterward.',
   'The creator can claim pool fees, manage liquidity and approve graduation using the launch wallet and matching second key.',
   'Graduation policy changes use the existing '+Number(fields.notice)/86400+' day notice and both keys. Graduation moves the whole position to its destination pool.',
   'Existing supply allocations keep their named beneficiary, cliff, vesting and sell notice.'
  ],
  keys:['Protected creator actions require your launch wallet and matching second key. Traders do not need your second key.','Create or restore and confirm the encrypted backup in the launch review. Keep its passphrase separately.'],
  nextStep:'Apply these rules to your draft, then continue to the key, cost and launch review. Your launch progress is saved so you can return and continue.'
 };
}
export function previewAssistedLaunch(intent,config,context={}){
 const value=resolve(intent,config,context),draftFingerprint=assistedDraftFingerprint(value.current,value.ctx);
 const body={version:ASSISTED_VERSION,kind:'qhooks-assisted-launch-preview',recipe:{id:value.recipe.id,version:value.recipe.version,title:value.recipe.title,style:value.recipe.style},
  intent:value.intent,draftFingerprint,proposedConfig:value.proposed,blocks:value.ctx.owner?value.blocks:null,ownerBound:!!value.ctx.owner,missingFields:value.missingFields,
  changes:RULE_KEYS.filter(k=>value.current[k]!==value.proposed[k]).map(key=>({key,label:LABELS[key],before:value.current[key],after:value.proposed[key]})),
  review:reviewFor(value),sources:ASSISTED_SOURCES};
 return freeze({...body,planFingerprint:digest(body)});
}
export function applyAssistedLaunch(reviewed,config,context={}){
 const fields=dataObject(reviewed);
 ensure(fields.kind?.value==='qhooks-assisted-launch-preview'&&fields.version?.value===ASSISTED_VERSION,'Review a current guided launch recipe.');
 ensure(fields.draftFingerprint?.value===assistedDraftFingerprint(config,context),'Your draft or wallet changed. Review the recipe again.');
 const fresh=previewAssistedLaunch(fields.intent?.value,config,context);
 ensure(canonical(reviewed)===canonical(fresh),'The recipe review changed. Review it again before applying.');
 return publicDraft(fresh.proposedConfig);
}
