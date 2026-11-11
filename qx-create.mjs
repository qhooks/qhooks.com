import {mountSolCreate} from './qx-sol-launch.mjs';
import {checkTicker,assertTickerFree,TickerTaken,tickerBlockNodes} from '/qx-ticker-guard.mjs';
import {CREATE_EXECUTION_ENABLED,CREATE_EXECUTION_HOLD,GUIDED_NEW_LAUNCHES,START_PRICING_HOLD} from './qx-create-release.mjs';
import {appendArbRecaptureLine,createCostView,walletStepLabel,showRequiredQuantum,bindFundWallet} from './qx-create-display.mjs';
import {readCreateNativeUSD} from './qx-create-prices.mjs';
import {visibleChains,chainById} from './chains.mjs';
import {launchChains as guidedChains} from './chain-catalog.mjs';
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {EMBEDDED_RDNS} from './embedded-wallet-provider.mjs';
import {withLaunchSession} from './qx-instant-bridge.mjs';
import {CREATE_STYLES,MONTH,defaultConfig,presetRules,ecosystem,poolBps,allocationAmounts,validateConfig,makeBlocks,costSummary,human,units,launchError,plan,validAddress,workspaceFields} from './qx-create-plan.mjs';
import {mountAccountQuantum} from './qx-account-quantum-control.mjs';
import {mountTokenProfileEditor,editableTokenProfileDraft,setTokenProfileDraft,onTokenProfileDraft,profilePublicationControl} from './qx-token-profile.mjs';
import {hasTokenProfile} from './qx-token-profile-core.mjs';
import {profileFromConfig} from './qx-create-plan.mjs';
import {newLaunchRecord,createLaunchContext,saveLaunchRecord,RECORD_PREFIX} from './qx-create-runner.mjs';
import {launchShare,mountLaunchShare} from './qx-launch-share.mjs';
import {mountAssistedLaunchPanel} from './qx-assisted-launch-panel.mjs';
import {applyAssistedLaunch} from './qx-assisted-launch-core.mjs';
import {mountLaunchReadiness} from './qx-launch-readiness.mjs';
import {createLaunchReviewGate} from './qx-create-review.mjs';
import {mountCreateChainPackage,prepareCreateChainHandoff,adoptCreateProfile} from './qx-create-chain-package.mjs';
import {liquidityAffordability,liquidityDraftState,readLiquidityBalances} from './qx-create-liquidity.mjs';
const $=id=>document.getElementById('qc-'+id),DRAFT='qhooks:create:draft:v1',ACTIVE='qhooks:create:active:v1';
const hub=getWalletHub(window),chains=visibleChains();
const chainPackage=mountCreateChainPackage({container:$('chain-package')});
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k in n)n[k]=v;else n.setAttribute(k,v);}n.append(...kids.filter(x=>x!==null&&x!==undefined));return n;};
let solCreate=null;
let config=defaultConfig(),profileScope='',screen=1,record=null,signer=null,context=null,busy=false,openingMarket=false,cost=null,costRevision=0,costTimer=null;
let liquidityState=liquidityDraftState(config),walletBalances=null,balanceIdentity=null,balanceRevision=0,balanceRead=null,liquidityGasCost=null;
let usdPrices={},usdReads=new Map(),usdReadAt=new Map();
function refreshDollarPrices(){
 const symbol=chainById(config.chainId).native;
 if(usdReads.has(symbol)||Date.now()-(usdReadAt.get(symbol)||0)<60000)return;
 usdReadAt.set(symbol,Date.now());usdPrices[symbol]=null;
 usdReads.set(symbol,readCreateNativeUSD(symbol).then(price=>{usdPrices[symbol]=price;}).finally(()=>{usdReads.delete(symbol);if(screen===3)render();}));
}
const note=(text,error=false)=>{$('message').textContent=text;$('message').dataset.error=String(error);};
// Anti-copycat ticker block (2026-11-08): a ticker already launched through QHooks is refused before the wallet opens.
let taken=null,tickerRun=0,tickerTimer=0;
const showTaken=r=>{taken={...r,key:config.symbol+'|'+config.chainId};$('message').replaceChildren(...tickerBlockNodes(r));$('message').dataset.error='true';};
function checkTickerSoon(){clearTimeout(tickerTimer);const run=++tickerRun;tickerTimer=setTimeout(async()=>{
 if(record||!config.symbol){if(taken){taken=null;note('');}render();return;}
 const r=await checkTicker({symbol:config.symbol,chainId:config.chainId,creator:hub.snapshot().current?.owner||''});if(run!==tickerRun)return;
 if(!r.available)showTaken(r);else if(taken){taken=null;note('');}render();},350);}
const executionAllowed=()=>{if(!record&&!GUIDED_NEW_LAUNCHES){note(START_PRICING_HOLD,true);return false;}if(CREATE_EXECUTION_ENABLED)return true;note(CREATE_EXECUTION_HOLD);return false;};
function restoreDraft(){let hadDraft=false;try{const text=localStorage.getItem(DRAFT);hadDraft=text!==null;const d=JSON.parse(text||'null');if(d?.version===1&&d.config){config={...config,...d.config};liquidityState=liquidityDraftState(config,d.liquidityState);if(typeof d.profileScope==='string'&&/^[a-z0-9-]{1,80}$/i.test(d.profileScope))profileScope=d.profileScope;screen=[1,2,3].includes(d.screen)?d.screen:1;}
 const id=localStorage.getItem(ACTIVE);if(id&&/^[a-z0-9-]{1,80}$/i.test(id)){const r=JSON.parse(localStorage.getItem(RECORD_PREFIX+id)||'null');if(r?.version===1&&r.id===id&&validAddress(r.owner)&&r.steps&&chainById(r.chainId)){record=r;config=r.config;screen=3;}}
 }catch{note('The saved draft could not be opened. You can enter your settings again.',true);}
 const query=new URLSearchParams(location.search),requested=chains.find(c=>c.id===query.get('chain')),handoff=prepareCreateChainHandoff({config,liquidityState,profileScope,requestedChain:requested,hasSavedDraft:hadDraft,hasActiveRecord:!!record});
 if(handoff.profileCarry){const c=handoff.profileCarry;setTokenProfileDraft(c.chainId,c.profile,c.scope);}config=handoff.config;profileScope=handoff.profileScope;liquidityState=liquidityDraftState(config,handoff.liquidityState||liquidityState);
 if(hadDraft&&handoff.changedChain){saveDraft();note('Selected '+requested.name+'. Check starting liquidity in '+requested.quote.symbol+'; your other draft settings were kept.');}
 if(!chains.some(c=>c.id===config.chainId)&&!record)config.chainId=chains[0].id;
}
function saveDraft(){try{localStorage.setItem(DRAFT,JSON.stringify({version:1,screen,config,profileScope,liquidityState}));}catch{note('Browser storage is full or unavailable. Free space before launching.',true);}}
async function saveRecord(){saveLaunchRecord(localStorage,record);localStorage.setItem(ACTIVE,record.id);if(localStorage.getItem(ACTIVE)!==record.id)throw Error('Could not remember the active launch.');}
let quantumControl=null,quantumReady=false;
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const reviewGate=createLaunchReviewGate({getState:()=>({config,connection:hub.snapshot().current,signer,cost,record,busy,backupConfirmed:quantumReady}),onInvalidate:message=>{if($('review').open)$('review').close();note(message,true);}});
const inputKeys=['chainId','name','symbol','supply','liquidity','stakers','referrals','antiSnipe','quantum'];
let publishedControl=null,sharedRecord=null,assistedPanel=null,launchReadiness=null,lastProgressStatus=null;
function adoptProfile(){
 config=adoptCreateProfile({config,profileScope,hasActiveRecord:!!record},{readProfile:editableTokenProfileDraft,writeProfile:setTokenProfileDraft});
}
function fill(){for(const k of inputKeys){if(k==='quantum')$(k).checked=!!config[k];else $(k).value=k==='image'&&config.image?.startsWith('data:')?'':String(config[k]??'');}$('allocation-preset').value=config.allocationPreset||'none';renderAllocations();}
function tokenValid(){if(!config.name.trim()||config.name.trim().length>64)throw Error('Enter your token name.');if(!record&&taken&&taken.key===config.symbol+'|'+config.chainId)throw Error(taken.message);if(!/^[A-Za-z0-9]{1,10}$/.test(config.symbol))throw Error('Use 1–10 letters or digits for the ticker.');
 const c={...config,allocations:[],quantum:true,stakers:0,referrals:0,antiSnipe:10,style:'fair'};validateConfig(c,'0x'+'1'.repeat(40));}
function rulesValid(){validateConfig(config,hub.snapshot().current?.owner||'0x'+'1'.repeat(40));}
// A step change always starts at the top of the new step (under the sticky header). Focusing a heading alone
// does not scroll reliably on iPhone browsers, so scroll explicitly and focus without scrolling.
function showStepTop(){
 const title=$('title-'+screen),step=$('screen-'+screen)||title;if(!step)return;
 const header=document.querySelector('.site-header'),offset=(header&&getComputedStyle(header).position.match(/sticky|fixed/)?header.getBoundingClientRect().bottom:0)+12;
 const top=Math.max(0,step.getBoundingClientRect().top+scrollY-offset);
 scrollTo({top,behavior:'auto'});title?.focus({preventScroll:true});
}
function go(next,{focus=true}={}){if(busy)return;try{if(next>screen){if(next>1&&!record&&liquidityStatus().blocked)throw Error(liquidityStatus().message);if(next>1)tokenValid();if(next>2)rulesValid();}screen=next;saveDraft();note('');render();if(focus)showStepTop();if(next===3)void refreshCost();}catch(e){note(e.message,true);}}
function renderPool(){try{const bps=poolBps(config.allocations),pool=human(bps,2)+'%';$('pool-share').textContent='Pool '+pool;$('pool-share').style.color='';$('default-supply').textContent=pool+' in the pool · '+(config.allocations.length?'Custom allocations':'No team reserve');$('allocation-label').textContent=config.allocations.length?'Custom supply allocations · '+human(10000n-bps,2)+'% reserved':'Optional supply allocations · none';}catch(e){$('pool-share').textContent=e.message;$('pool-share').style.color='#e8a89a';$('default-supply').textContent='Review supply allocations';}}
function changed({rebuild=false}={}){reviewGate.invalidate();costRevision++;cost=null;saveDraft();renderPool();if(rebuild)renderAllocations();render();if(screen===3){clearTimeout(costTimer);costTimer=setTimeout(()=>void refreshCost(),300);}}
function renderAllocations(){
 $('allocations').replaceChildren(...config.allocations.map((row,index)=>{
  const field=(key,label,type='text',scale=1)=>{const input=el('input',{id:'qc-allocation-'+row.id+'-'+key,type,value:scale===1?row[key]:row[key]/scale,disabled:!!record||busy});
   if(type==='number'){input.min='0';input.max=key==='pct'?'99':key==='notice'?'90':'120';input.step=key==='pct'?'0.01':'any';}if(key==='wallet'){input.placeholder='0x…';input.maxLength=42;}if(key==='label')input.maxLength=64;
   input.addEventListener('input',()=>{row[key]=scale===1&&type==='text'||key==='pct'?input.value:Number(input.value)*scale;config.allocationPreset='custom';$('allocation-preset').value='custom';changed();});return el('label',{},label,input);};
  const remove=el('button',{type:'button','aria-label':'Remove '+row.label,disabled:!!record||busy},'×');remove.addEventListener('click',()=>{config.allocations.splice(index,1);config.allocationPreset='custom';changed({rebuild:true});});
  return el('div',{class:'qxc-allocation','data-allocation':row.id},el('div',{class:'qxc-allocation-head'},field('label','Label'),field('pct','Share %','number'),remove),
   el('div',{class:'qxc-allocation-address'},field('wallet','Beneficiary wallet')),el('div',{class:'qxc-fields'},field('cliff','Cliff · months','number',MONTH),field('duration','Vesting · months','number',MONTH),field('notice','Sell notice · days','number',86400)));
 }));renderPool();
}
const workspaceFieldsForReview=()=>workspaceFields(config,hub.snapshot().current?.owner||'0x'+'1'.repeat(40));
function summaryNode(){const c=chainById(config.chainId),a=allocationAmounts(config.supply,config.allocations),box=el('div'),[whole,fraction]=String(config.supply).split('.');
 const line=(label,value)=>el('div',{class:'qxc-summary-line'},el('span',{},label),el('b',{},String(value)));
 const quantity=value=>String(value).replace(/^\d+/,part=>BigInt(part).toLocaleString('en-US'));
 if(config.banner)box.append(el('img',{class:'qxc-review-banner',src:config.banner,alt:config.symbol+' token banner'}));
 if(config.image)box.append(el('img',{src:config.image,alt:config.symbol+' token image',width:48,height:48}));
 box.append(line('Token',config.name+' · '+config.symbol),line('Chain',c.name),line('Supply',BigInt(whole).toLocaleString('en-US')+(fraction?'.'+fraction:'')),line('In the pool',quantity(human(a.pool))+' '+config.symbol+' · '+human(a.poolBps,2)+'%'),line('Style',CREATE_STYLES.find(p=>p.id===config.style)?.name||config.style),line('Second key',config.quantum?'Required for protected creator actions':'Off'),el('p',{class:'qxc-fine'},$('style-summary').textContent));
 appendArbRecaptureLine(box,c,CREATE_STYLES.find(p=>p.id===config.style)?.on||[],'studio');
 for(const r of config.allocations)box.append(line(r.label,r.pct+'% · '+(r.cliff?r.cliff/MONTH+' month cliff, ':'')+(r.duration?r.duration/MONTH+' months vesting':'available at launch')+' · '+r.notice/86400+' day notice'),line('Beneficiary',r.wallet));
 const lp=Number(workspaceFieldsForReview().lpFeePpm);box.append(el('p',{class:'qxc-fine'},'Creator LP fee: '+lp/10000+'%. Protocol pool fee: '+Math.floor(lp/5)/10000+'%. Selected block charges are shown above. Graduation needs your approval and both keys.'));
 if(config.description)box.append(el('p',{},config.description));for(const[k,label]of Object.entries({x:'X',discord:'Discord',telegram:'Telegram',website:'Website'}))if(config[k])box.append(line(label,config[k]));return box;
}
function costNode(){const box=el('div'),view=createCostView(config,cost,usdPrices);
 const line=(k,v)=>el('div',{class:'qxc-summary-line'},el('span',{},k),el('b',{class:'qxc-number'},v));
 box.append(el('p',{class:'qxc-cost-total'},view.headline),line('Starting liquidity',view.liquidity),line('Platform launch fee',view.fee),line('Network gas · estimate',view.gas),el('p',{class:'qxc-fine'},view.note));
 if(cost)box.append(line('Native balance needed · estimate',human(cost.totalNativeWei)+' '+cost.native));
 if(cost&&!chainById(config.chainId).quote.wrapNative&&chainById(config.chainId).family!=='arc')box.append(el('p',{class:'qxc-fine'},'Plus '+cost.liquidity+' '+cost.liquidityUnit+' from your token balance.'));
 box.append(el('p',{class:'qxc-fine'},'Gas uses planning estimates for each step, with fresh network fees. Each transaction is estimated again before sending. Any wrapped balance you already hold reduces the native amount needed.'));return box;
}
function renderStyle(){for(const b of $('styles').children)b.setAttribute('aria-pressed',String(b.dataset.style===config.style));
 const p=CREATE_STYLES.find(p=>p.id===config.style);if(!p)return;
 let line=p.line;
 try{const b=JSON.parse(makeBlocks(config,hub.snapshot().current?.owner||'0x'+'1'.repeat(40)));line=p.on.length?p.on.map(id=>({antiSnipe:'Falling launch tax',walletCap:'wallet cap',cooldown:'buy cooldown',sandwich:'sandwich guard',tax:'buy/sell tax',autoBurn:'buy burns',king:'largest-buy pot',clockPot:'last-buyer pot',referrals:'referral rewards',points:'volume points',exitClock:'falling sell fee',buyback:'buyback and burn',sessionFee:'market-hours fees',stormFee:'volatility fee'}[id]||id)).join(', ')+'.':'Open trading with no extra buy/sell tax, wallet limits or launch games.';
  if(p.on.includes('tax'))line+=' Buy/sell tax '+Number(b.buyTaxBps)/100+'% / '+Number(b.sellTaxBps)/100+'%.';
  if(p.on.includes('buyback'))line+=' '+Number(b.buybackShareBps)/100+'% of charges fund buybacks, with a '+Number(b.buybackCooldown)/60+' minute cooldown; someone must run them.';
  if(Number(config.referrals))line+=' Referrers receive '+config.referrals+'% of charges.';if(Number(config.stakers))line+=' Stakers receive '+config.stakers+'% of the creator block income, streamed over a day.';
  if(p.on.includes('antiSnipe'))line+=' Launch guards last '+config.antiSnipe+' minutes.';
 }catch{line+=' Check the shares and guard length below.';}
 $('style-summary').textContent=line;
}
function renderProgress(){const label=walletStepLabel(record,record?plan(record.config):[]);$('step-label').textContent=label;$('step-label').hidden=!label;if(!record){$('running').hidden=true;$('done').hidden=true;launchReadiness?.dispose();launchReadiness=null;lastProgressStatus=null;return;}
 $('running').hidden=false;if(lastProgressStatus!==record.status){$('running').open=record.status!=='done';lastProgressStatus=record.status;}$('launch-id').textContent=record.id.slice(0,8);$('steps').replaceChildren(...plan(record.config).map(step=>{
  const r=record.steps[step.id]||{},label=r.status==='done'?(r.unread?'Not checked':r.skipped?'Already ready':'Confirmed'):r.status==='running'?'Working…':r.status==='failed'?'Stopped':'Waiting';
  const details=el('span',{},step.label),hash=r.hash||r.hashes?.at(-1);if(hash)details.append(' ',el('a',{href:chainById(record.chainId).explorer+'/tx/'+hash,target:'_blank',rel:'noopener noreferrer'},hash.slice(0,8)+'…'));
  return el('li',{'data-step':step.id,'data-state':r.status||'pending'},details,el('small',{},label),...(r.note||r.unread&&r.detail?[el('p',{class:'qc-step-note'},r.note||r.detail)]:[]));}));
 const failed=Object.values(record.steps).find(r=>r.status==='failed');$('run-error').textContent=failed?launchError(failed.error):'';$('retry').hidden=busy||record.status!=='stopped';$('retry').disabled=!CREATE_EXECUTION_ENABLED||!signer?.backupVerified||!quantumReady||!cost;$('recovery').hidden=record.status!=='stopped';
 $('done').hidden=record.status!=='done';if(record.status==='done'){$('done-name').textContent=record.config.name+' ('+record.config.symbol+') · '+chainById(record.chainId).name;$('token-address').textContent=record.addresses.token||'';$('open-market').href='/terminal#m='+record.chainId+':'+record.addresses.controller;$('manage').href='/me';
  if(!busy&&!openingMarket&&sharedRecord!==record.id){try{$('share-pack').replaceChildren(mountLaunchShare(record,chainById(record.chainId).name));launchReadiness?.dispose();launchReadiness=mountLaunchReadiness(record);$('launch-ready').replaceChildren(launchReadiness.element);sharedRecord=record.id;}catch{$('share-pack').textContent='The saved launch record is incomplete. Use My QHooks to open the listed market.';}}
  if(!busy&&!openingMarket&&publishedControl!==record.id&&record.pool&&hasTokenProfile(record.metadata?.links?record.metadata:profileFromConfig(record.config))){
   $('profile-publish').replaceChildren(profilePublicationControl({chain:()=>record.chainId,share:()=>'/trade#pool='+encodeURIComponent(JSON.stringify(record.pool)),profile:()=>record.metadata?.links?record.metadata:profileFromConfig(record.config),onPublished:()=>void launchReadiness?.refresh(),getConnection:()=>hub.snapshot().current}));publishedControl=record.id;
  }
 }
}
// Guided Create runs only on chain-catalog rollout chains; elsewhere (Elysium) one-tap is the way (2026-11-09).
const guidedOff=()=>!guidedChains.some(c=>c.id===String(config.chainId));
function renderChainNote(){
 let n=$('chain-note');if(!n){n=el('div',{id:'qc-chain-note',class:'qxc-chain-note',role:'status'});$('chainId').closest('label').after(n);}
 const open=!!record&&record.status!=='done',c=chainById(config.chainId);
 if(open){const b=el('button',{type:'button'},'Start over');b.addEventListener('click',startOver);
  n.replaceChildren(el('p',{},'This form is holding your unfinished launch of “'+(record.config?.name||'your token')+'” on '+(chainById(record.chainId)?.name||'its chain')+', so its fields are locked. Finish it on step 3, or start over to change the chain.'),b);n.hidden=false;return;}
 if(guidedOff()){const a=el('a',{href:'#qq-ideas'},'Use one-tap above');a.addEventListener('click',e=>{e.preventDefault();document.getElementById('qq-ideas')?.scrollIntoView({block:'start'});});
  n.replaceChildren(el('p',{},'Guided Create isn’t on '+(c?.name||'this chain')+' yet. '),a);n.firstChild.append(a);n.hidden=false;return;}
 n.replaceChildren();n.hidden=true;
}
function render(){if(solCreate?.active){solCreate.render();return;}renderChainNote();
 const liquidity=liquidityStatus();if(!record&&liquidity.blocked)reviewGate.invalidate(liquidity.message);
 reviewGate.check();
 for(let n=1;n<=3;n++)$('screen-'+n).hidden=screen!==n;for(const b of document.querySelectorAll('[data-screen]')){if(Number(b.dataset.screen)===screen)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');b.disabled=busy||!record&&liquidity.blocked&&Number(b.dataset.screen)>screen;b.title=b.disabled&&!busy?liquidity.message:'';}
 const c=hub.snapshot().current,chain=chainById(config.chainId);$('wallet').textContent=c?c.entry.name+' · '+c.owner.slice(0,6)+'…'+c.owner.slice(-4):'Connect a wallet to launch.';$('wallet').title=c?.owner||'';$('connect').textContent=c?'Wallet options':'Connect wallet';$('connect').disabled=busy;
 chainPackage.refresh(config.chainId);
 $('quote-unit').textContent='· '+chain.quote.symbol;$('liquidity-note').textContent=liquidity.message;$('liquidity-note').dataset.error=String(liquidity.blocked);$('liquidity').setAttribute('aria-invalid',String(liquidity.blocked));$('refresh-balance').disabled=busy||!c;
 renderPool();for(const k of inputKeys)$(k).disabled=busy||!!record;for(const id of ['allocation-preset','add-allocation'])$(id).disabled=busy||!!record;for(const b of $('styles').children)b.disabled=busy||!!record;
 showRequiredQuantum($('quantum'));
 for(const field of $('profile-slot').querySelectorAll('input,textarea,button'))field.disabled=busy||!!record;for(const field of $('allocations').querySelectorAll('input,button'))field.disabled=busy||!!record;
 for(const id of ['next-1','next-2','back-2','back-3','refresh-cost'])$(id).disabled=busy;
 for(const id of ['next-1','next-2']){$(id).disabled=busy||!record&&(liquidity.blocked||guidedOff());$(id).title=!record&&liquidity.blocked?liquidity.message:'';$(id).setAttribute('aria-describedby','qc-liquidity-note');}
 renderSavedLaunch();$('execution-hold').hidden=CREATE_EXECUTION_ENABLED&&(!!record||GUIDED_NEW_LAUNCHES);if(!record&&!GUIDED_NEW_LAUNCHES){const hold=$('execution-hold');hold.querySelector('h2').textContent=START_PRICING_HOLD;hold.querySelector('p').textContent='You can still set up and review your token here.';}$('key-panel').hidden=!CREATE_EXECUTION_ENABLED||record?.status==='done';$('launch').hidden=record?.status==='done';$('launch').textContent=record?'Resume launch':'Launch';
 let valid=true;try{validateConfig(config,c?.owner||'0x'+'1'.repeat(40));}catch{valid=false;}
 // A token image is required for a new launch (2026-11-10); a launch already underway can still resume.
 const needImage=!record&&!config.image;if(needImage)valid=false;$('need-image').hidden=!needImage;
 $('launch').disabled=!CREATE_EXECUTION_ENABLED||!record&&!GUIDED_NEW_LAUNCHES||busy||!c||!record&&guidedOff()||!signer?.backupVerified||signer.locked||!quantumReady||!cost||!valid||!!record&&record.owner!==c?.owner||!record&&liquidity.blocked;
 $('launch').title=!record&&liquidity.blocked?liquidity.message:'';
 quantumControl?.render();
 renderStyle();$('current-rules').textContent='Current draft: '+(CREATE_STYLES.find(p=>p.id===config.style)?.name||config.style)+'. '+$('style-summary').textContent;assistedPanel?.refresh();
 if(screen===3){try{$('summary').replaceChildren(summaryNode());}catch{$('summary').textContent='Check the token and allocation values.';}$('cost').replaceChildren(costNode());$('gas-steps').replaceChildren(...(cost?.steps||[]).map(step=>el('li',{},step.label+' · '+(BigInt(step.estimatedGas)>0n?Number(step.estimatedGas).toLocaleString('en-US')+' gas · estimate':'no transaction'))));$('confirmations').textContent=c?.entry.rdns===EMBEDDED_RDNS?'Email wallet: one review.':cost?'Studio: the full guided setup for custom launches, in '+cost.txCount+' transactions and 1 signature, plus a network switch if needed. For most launches, one-tap above is all you need.':'Connect your wallet to see confirmation details.';}
 renderProgress();
 for(const id of ['confirm','retry','recover'])if(!CREATE_EXECUTION_ENABLED)$(id).disabled=true;
}
function liquidityIdentity(){const c=hub.snapshot().current;return c?{owner:c.owner,provider:c.entry.provider,walletChain:c.chainId,chainId:config.chainId}:null;}
function sameLiquidityIdentity(a,b){return a===b||!!a&&!!b&&a.owner===b.owner&&a.provider===b.provider&&a.walletChain===b.walletChain&&a.chainId===b.chainId;}
function currentLiquidityBalances(){return sameLiquidityIdentity(balanceIdentity,liquidityIdentity())?walletBalances:null;}
function liquidityStatus(estimate=cost||liquidityGasCost){return liquidityAffordability(config,{...currentLiquidityBalances(),cost:estimate});}
function applyAffordableLiquidity(estimate=cost||liquidityGasCost){
 if(record||busy||liquidityState.userEdited)return false;const {suggestion}=liquidityStatus(estimate);if(suggestion===null||suggestion===config.liquidity)return false;
 reviewGate.invalidate();config.liquidity=suggestion;liquidityState.defaultValue=suggestion;$('liquidity').value=suggestion;saveDraft();return true;
}
function refreshLiquidity({force=false}={}){
 if(solCreate?.active)return Promise.resolve(null);
 const identity=liquidityIdentity();if(!force&&sameLiquidityIdentity(identity,balanceIdentity))return balanceRead||Promise.resolve(walletBalances);
 if(identity?.chainId!==balanceIdentity?.chainId)liquidityGasCost=null;
 balanceIdentity=identity;walletBalances=null;const revision=++balanceRevision;costRevision++;cost=null;reviewGate.invalidate();
 if(!identity){balanceRead=null;return Promise.resolve(null);}
 balanceRead=(async()=>{let balances=null;try{balances=await readLiquidityBalances(identity.chainId,identity.owner,rpcRead);}catch{/* Unknown balances keep the existing connect/review behavior. */}
  if(revision!==balanceRevision||!sameLiquidityIdentity(identity,liquidityIdentity()))return null;
  walletBalances=balances;if(applyAffordableLiquidity())changed();else render();return balances;
 })().finally(()=>{if(revision===balanceRevision)balanceRead=null;});return balanceRead;
}
async function rpcRead(method,params,chainId=config.chainId){const r=await fetch(chainById(chainId).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!r.ok)throw Error('RPC timeout.');const j=await r.json();if(j.error)throw Error(j.error.message);return j.result;}
async function refreshCost({refreshBalances=true}={}){if(solCreate?.active)return;const identity=liquidityIdentity();await refreshLiquidity({force:refreshBalances});if(!sameLiquidityIdentity(identity,liquidityIdentity()))return;clearTimeout(costTimer);refreshDollarPrices();reviewGate.invalidate();const rev=++costRevision,chain=chainById(config.chainId);cost=null;render();try{const price=BigInt(await rpcRead('eth_gasPrice',[],chain.id));if(price<=0n)throw Error('Network gas estimate is unavailable.');let wrapNeeded=true,locksSetupNeeded=true,wrapAmount=null;const c=hub.snapshot().current;
 if(config.allocations.length){const r=await fetch('/full-launch/extras.json');if(!r.ok)throw Error('Could not estimate QLocks setup.');const extras=await r.json();locksSetupNeeded=await rpcRead('eth_getCode',[extras.contracts.locks.address,'latest'],chain.id)==='0x';}
 if(rev!==costRevision)return;liquidityGasCost=costSummary(config,{gasPriceWei:price,locksSetupNeeded});applyAffordableLiquidity(liquidityGasCost);
 if(c&&chain.quote.wrapNative){const bal=currentLiquidityBalances()?.quoteBalance;if(bal==null)throw Error('Balance unavailable.');const need=units(config.liquidity,chain.quote.decimals);wrapNeeded=BigInt(bal)<need;wrapAmount=need>BigInt(bal)?need-BigInt(bal):0n;}
 cost=costSummary(config,{gasPriceWei:price,wrapNeeded,locksSetupNeeded});
 if(wrapAmount!==null)cost.totalNativeWei=(BigInt(cost.totalNativeWei)-(wrapNeeded?units(config.liquidity,chain.quote.decimals):0n)+wrapAmount).toString();
 render();
 }catch(e){if(rev===costRevision){note('Could not read the network estimate. Refresh to retry.',true);$('cost').replaceChildren(costNode());}}}
function review(){if(!executionAllowed())return;try{const c=hub.snapshot().current;if(!c)throw Error('Connect your launch wallet.');if(!record&&!config.image)throw Error('Add an image for your token.');if(!record&&liquidityStatus().blocked)throw Error(liquidityStatus().message);validateConfig(config,c.owner);if(!signer?.backupVerified||signer.locked||!quantumReady)throw Error('Unlock your account quantum key first.');if(!cost)throw Error('Refresh the network estimate first.');
 $('review-summary').replaceChildren(summaryNode());$('review-cost').replaceChildren(costNode());$('review-steps').replaceChildren(...plan(config).map(s=>el('li',{},s.label)));$('review-wallet').textContent=c.entry.rdns===EMBEDDED_RDNS?'One review for your email wallet. The launch starts after you confirm.':'Up to '+cost.walletConfirmations+' wallet confirmations: '+cost.txCount+' transactions and 1 signature, plus a network switch.';reviewGate.prepare();$('review').showModal();}catch(e){note(e.message,true);}}
const lockName=()=>'qhooks-full-launch:'+record.chainId+':'+record.owner;
let lockBlocked=false;const launchChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('qhooks-create-launch'):null;
// Another window asked to continue this launch there: stop at the next safe step (dispose), which frees the lock.
launchChannel?.addEventListener('message',e=>{if(e.data?.type!=='take-over'||!record||e.data.lock!==lockName())return;context?.dispose();context=null;if(busy)note('This launch moved to another window. Reload this page to bring it back here.',true);});
async function exclusive(fn){if(!navigator.locks)throw Error('Use a current browser with launch progress locking.');return navigator.locks.request(lockName(),{ifAvailable:true},lock=>{if(!lock){lockBlocked=true;render();throw Error('This launch is running in another window or tab. Tap “Continue this launch here” to move it to this window.');}lockBlocked=false;return fn();});}
async function takeOver(){
 if(!record||busy)return;launchChannel?.postMessage({type:'take-over',lock:lockName()});note('Moving the launch to this window…');
 try{await navigator.locks.request(lockName(),{signal:AbortSignal.timeout(20000)},()=>{});lockBlocked=false;render();note('This window now has the launch. Press Resume launch.');}
 catch{note('The other window is still waiting on a wallet confirmation. Confirm or cancel it there (or close that window), then tap Continue this launch here again.',true);}
}
function startOver(){
 if(!record||record.status==='done'||busy)return;
 const sentIds=Object.entries(record.steps||{}).filter(([,r])=>r?.transaction||r?.hash||r?.receipt).map(([id])=>id),sent=sentIds.length;
 // Only the ETH->WETH wrap went out: nothing of the token exists on chain, and the WETH is reused by the next launch.
 const onlyWrap=sent>0&&sentIds.every(id=>id==='wrap');
 if(sent&&!onlyWrap&&!confirm(sent+' launch step'+(sent>1?'s were':' was')+' already sent. Those stay on chain, and starting over makes a new token. Start over?'))return;
 reviewGate.clear();costRevision++;clearTimeout(costTimer);context?.dispose();context=null;lockBlocked=false;
 record=null;localStorage.removeItem(ACTIVE);cost=null;screen=Math.min(screen,3);
 const keyState=quantumControl.key.snapshot();signer=keyState.signer;quantumReady=keyState.ready;saveDraft();fill();render();void quantumControl.refresh();
 note('Started over. Your token details and picture are kept; the launch will use your account key.');void refreshLiquidity({force:true});
}
function renderSavedLaunch(){
 const open=!!record&&record.status!=='done'&&!busy,panel=$('saved-launch');panel.hidden=!open;if(!open)return;
 const name=record.config?.name||'your token',when=record.createdAt?new Date(record.createdAt).toLocaleString():'earlier';
 const k=quantumControl?.key.snapshot(),oldKey=!!k?.needsImport;
 $('saved-text').textContent=lockBlocked?'“'+name+'” is running in another window or tab of this browser. Continue it here, or start over.':oldKey?'An unfinished launch of “'+name+'” (started '+when+' on this device) used an older key that isn’t here. Start over to launch with your account key; your token details and picture stay.':'Unfinished launch of “'+name+'” started '+when+'. Resume it below, or start over.';
 const sentIds=Object.entries(record.steps||{}).filter(([,r])=>r?.transaction||r?.hash||r?.receipt).map(([id])=>id);
 if(!lockBlocked&&sentIds.length&&sentIds.every(id=>id==='wrap'))$('saved-text').textContent='An unfinished launch of “'+name+'” (started '+when+') only wrapped ETH into WETH; no token was made. Tap Start over to launch fresh with your account key. Your WETH stays in your wallet and is used again.';
 $('take-over').hidden=!lockBlocked;
}
function openLaunchContext(){
 if(!record)throw Error('Open the saved launch before continuing.');
 if(!signer?.backupVerified||signer.locked||!quantumReady)throw Error('Unlock the quantum key for this launch before continuing.');
 const c=hub.snapshot().current;if(c?.owner!==record.owner)throw Error('Connect the wallet that started this launch.');
 context??=createLaunchContext({record,hub,signer,save:saveRecord,onChange:()=>renderProgress()});context.setSigner(signer);return context;
}
async function launch(){if(!executionAllowed())return;if(busy)return;let c,destination=null;try{if(!$('review').open)throw Error('Review your launch again before confirming.');c=reviewGate.consume();}catch(e){note(launchError(e),true);return;}$('review').close();
 if(!record){try{await assertTickerFree({symbol:config.symbol,chainId:config.chainId,creator:c.owner});}catch(e){if(e instanceof TickerTaken){showTaken(e.result);render();return;}note('Could not check the ticker right now. Try again in a moment.',true);return;}}
 busy=true;note('Launching. You can follow every step below.');try{validateConfig(config,c?.owner);if(!signer?.backupVerified||!quantumReady)throw Error('Unlock the quantum key for this launch.');
 if(!record){record=newLaunchRecord(config,c.owner);record.publicKey=signer.publicKeyHex;await saveRecord();}else if(record.owner!==c?.owner)throw Error('Connect the wallet that started this launch.');
 openLaunchContext();render();
 await exclusive(()=>c.entry.rdns===EMBEDDED_RDNS?withLaunchSession(()=>context.run(),{id:record.id}):context.run());
 // The runner resolves only after its final receipt is saved. Restoring a done
 // record never enters this path, so returning for receipts cannot redirect.
 destination=launchShare(record).market.replace('https://qhooks.com','');openingMarket=true;
 note('Your token launched. Opening its market…');
 }catch(e){note(launchError(e),true);if(record&&record.status!=='done'){record.status='stopped';try{await saveRecord();}catch(saveError){note(launchError(saveError),true);}}}finally{busy=false;render();}
 if(destination){try{location.assign(destination);}catch{openingMarket=false;render();note('Your token launched. Open your market below to see its chart and activity.');$('open-market').focus();}}
}
restoreDraft();adoptProfile();checkTickerSoon();
quantumControl=mountAccountQuantum($('key-panel'),{hub,getExpectedKey:()=>record&&record.status!=='done'?record.publicKey:null,enabled:()=>CREATE_EXECUTION_ENABLED&&!busy,onChange:state=>{
 const previous=signer;signer=state.signer;quantumReady=state.ready;
 if(previous!==signer)reviewGate.invalidate();
 if(signer&&context&&previous!==signer){context.dispose();context=null;}
 render();
}});
// Older drafts could turn this required setting off. Keep their other work.
if(!record&&!config.quantum){config.quantum=true;saveDraft();}
bindFundWallet($('fund-wallet'),{hub,chainId:()=>config.chainId,note});
$('profile-slot').append(mountTokenProfileEditor({id:'qc-profile',imageRequired:true,chain:()=>config.chainId,name:()=>config.name||'Your token',symbol:()=>config.symbol||'TICKER',scope:()=>profileScope}));
onTokenProfileDraft(({chain,scope=''})=>{if(!record&&chain===String(config.chainId)&&scope===profileScope){const value=editableTokenProfileDraft(chain,profileScope);Object.assign(config,{description:value.description,image:value.image,banner:value.banner,...value.links});changed();}});
for(const c of chains)$('chainId').append(el('option',{value:c.id},c.name));if(record&&!chains.some(c=>c.id===config.chainId))$('chainId').append(el('option',{value:config.chainId},chainById(config.chainId).name));
for(const p of CREATE_STYLES){const b=el('button',{type:'button','data-style':p.id,'aria-pressed':'false'},p.name);b.addEventListener('click',()=>{config.style=p.id;Object.assign(config,presetRules(p.id));for(const k of ['stakers','referrals','antiSnipe'])$(k).value=config[k];changed();});$('styles').append(b);}
fill();
if(!['none','fair','flywheel'].includes(config.style))$('customize').open=true;
const assistedContext=()=>({owner:hub.snapshot().current?.owner||null,busy,hasRecord:!!record});
assistedPanel=mountAssistedLaunchPanel({getDraft:()=>structuredClone(config),getContext:assistedContext,language:{fetcher:globalThis.fetch},onApply:(next,reviewed)=>{
 if(busy||record)throw Error('Continue the active launch before changing its rules.');
 config=applyAssistedLaunch(reviewed,config,assistedContext());fill();changed({rebuild:true});note('Recipe applied. Review your launch when you are ready.');
}});$('assisted-slot').append(assistedPanel.element);
for(const k of inputKeys)$(k).addEventListener(k==='chainId'||k==='quantum'?'change':'input',()=>{
 if(k==='chainId'){const requested=chains.find(c=>c.id===$(k).value),handoff=prepareCreateChainHandoff({config,liquidityState,profileScope,requestedChain:requested,hasSavedDraft:true,hasActiveRecord:!!record});if(handoff.profileCarry){const c=handoff.profileCarry;setTokenProfileDraft(c.chainId,c.profile,c.scope);}config=handoff.config;liquidityState=liquidityDraftState(config,handoff.liquidityState||liquidityState);profileScope=handoff.profileScope;$('liquidity').value=config.liquidity;if(handoff.changedChain){adoptProfile();if(window.history?.replaceState){const url=new URL(location.href);url.searchParams.set('chain',config.chainId);window.history.replaceState(window.history.state,'',url);}}}
 else config[k]=k==='quantum'?$(k).checked:['stakers','referrals','antiSnipe'].includes(k)?Number($(k).value):$(k).value;
 if(k==='liquidity')liquidityState.userEdited=true;
 if(k==='symbol'){config.symbol=config.symbol.toUpperCase();$('symbol').value=config.symbol;}changed();if(k==='symbol'||k==='chainId')checkTickerSoon();if(k==='chainId'){void refreshLiquidity();if(screen===3)void refreshCost({refreshBalances:false});}});
$('allocation-preset').addEventListener('change',()=>{config.allocationPreset=$('allocation-preset').value;if(config.allocationPreset==='ecosystem')config.allocations=ecosystem(hub.snapshot().current?.owner||'');else if(config.allocationPreset==='none')config.allocations=[];changed({rebuild:true});});
$('add-allocation').addEventListener('click',()=>{const first=!config.allocations.length;config.allocations.push({id:first?'founder':crypto.randomUUID(),label:first?'Founder':'Allocation',pct:'1',wallet:first?hub.snapshot().current?.owner||'':'',cliff:0,duration:12*MONTH,notice:604800});config.allocationPreset='custom';$('allocation-preset').value='custom';changed({rebuild:true});});
for(const b of document.querySelectorAll('[data-screen]'))b.addEventListener('click',()=>go(Number(b.dataset.screen)));
for(const[id,next]of [['next-1',2],['next-2',3],['back-2',1],['back-3',2]])$(id).addEventListener('click',()=>go(next));
$('connect').addEventListener('click',()=>hub.open());$('refresh-cost').addEventListener('click',()=>void refreshCost());
$('refresh-balance').addEventListener('click',()=>void refreshCost());
$('launch').addEventListener('click',review);$('retry').addEventListener('click',review);$('close-review').addEventListener('click',()=>{reviewGate.clear();$('review').close();});$('review').addEventListener('close',()=>reviewGate.clear());$('confirm').addEventListener('click',()=>void launch());
$('recover').addEventListener('click',async()=>{if(!executionAllowed()||busy)return;reviewGate.invalidate();busy=true;render();try{await openLaunchContext().recover($('recover-hash').value.trim());note('Transaction checked. Resume to continue.');}catch(e){note(launchError(e),true);}finally{busy=false;render();}});
$('download-record').addEventListener('click',()=>{if(record)download(JSON.stringify(record,null,2),'qhooks-launch-'+record.id+'.json');});
$('take-over').addEventListener('click',()=>void takeOver());$('start-over').addEventListener('click',startOver);
$('new').addEventListener('click',()=>{
 if(record?.status!=='done'||busy)return;
 reviewGate.clear();costRevision++;clearTimeout(costTimer);context?.dispose();context=null;
 record=null;publishedControl=null;sharedRecord=null;$('profile-publish').replaceChildren();$('share-pack').replaceChildren();$('launch-ready').replaceChildren();
 config=defaultConfig();liquidityState=liquidityDraftState(config);screen=1;cost=null;profileScope='create-'+crypto.randomUUID();localStorage.removeItem(ACTIVE);
 setTokenProfileDraft(config.chainId,{description:'',image:'',banner:'',links:{}},profileScope);const keyState=quantumControl.key.snapshot();signer=keyState.signer;quantumReady=keyState.ready;saveDraft();fill();render();note('');void refreshLiquidity({force:true});
});
hub.subscribe(s=>{void quantumControl.refresh();reviewGate.check();if(!record){let filled=false;for(const r of config.allocations)if(r.id==='founder'&&!r.wallet&&s.current){r.wallet=s.current.owner;filled=true;}if(filled){renderAllocations();saveDraft();}}
 if(context&&!s.busy&&(!s.current||s.current.owner!==record.owner||s.current.chainId!==record.chainId)){context.dispose();context=null;}
 if(!sameLiquidityIdentity(balanceIdentity,liquidityIdentity())){void refreshLiquidity();if(screen===3)void refreshCost({refreshBalances:false});}
 render();});
window.addEventListener('focus',()=>{void refreshLiquidity({force:true});if(screen===3)void refreshCost({refreshBalances:false});});
window.addEventListener('pagehide',()=>{balanceRevision++;reviewGate.clear();context?.dispose();quantumControl.lock();});render();void quantumControl.refresh();if(screen===3)void refreshCost({refreshBalances:false});

solCreate=mountSolCreate({chainSelect:$('chainId'),onExit:()=>{render();}});
