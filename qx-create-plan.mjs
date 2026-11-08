// Public configuration only. No wallet, DOM, storage, key material or network.
import {chainById} from './chains.mjs';
import {normalizeTokenProfile} from './qx-token-profile-core.mjs';
import {PRESETS, BLOCKS} from './qx-block-catalog.mjs';
import {BLOCK_BITS, emptyBlocks, blocksText, normalizeBlocks, STAKERS_PAYEE} from './full-launch/packages/multichain-launch/launch-blocks.mjs';
export const MONTH = 30 * 86400;
export const QLOCKS_LIMITS = Object.freeze({span:315360000, notice:7776000});
export const SIMPLE_LAUNCH = Object.freeze({}); // Blocks owner supplies the address + ABI here later. No deployments here.
export const CREATE_STYLES = Object.freeze(PRESETS.filter(p => ['none','fair','flywheel','degen','community','burn','hours'].includes(p.id)));
const ensure = (ok, message) => { if (!ok) throw new TypeError(message); };
export const validAddress = a => typeof a === 'string' && /^0x[0-9a-f]{40}$/i.test(a) && BigInt(a) !== 0n;
export function units(value, decimals = 18) {
 const s=String(value).trim();ensure(s.length<=100 && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s),'Enter a plain positive amount.');
 const [i,f='']=s.split('.');ensure(f.length<=decimals,'That amount has too many decimals.');return BigInt(i)*10n**BigInt(decimals)+BigInt(f.padEnd(decimals,'0')||0);
}
export function human(raw, decimals=18) { const s=BigInt(raw).toString().padStart(decimals+1,'0'),f=s.slice(-decimals).replace(/0+$/,'');return decimals?s.slice(0,-decimals)+(f?'.'+f:''):s; }
export function ecosystem(owner='') {
 return [
  ['founder','Team & hiring reserve',12,3,15,owner],['builder-fund','Builder fund',5,0,24,''],['treasury','Treasury',5,0,24,''],
  ['marketing-launch','Marketing at launch',1,0,0,''],['marketing','Marketing',4,0,12,''],['community','Community',3,0,24,'']
 ].map(([id,label,pct,cliff,duration,wallet])=>({id,label,pct:String(pct),wallet,cliff:cliff*MONTH,duration:duration*MONTH,notice:604800}));
}
export function poolBps(rows=[]) {
 const held=rows.reduce((sum,r)=>{const n=units(r.pct,2);ensure(n>0n,'Each allocation needs a positive share.');return sum+n;},0n);
 ensure(held<=9900n,'Allocations can use at most 99% of supply. Leave a pool share.');return 10000n-held;
}
export function allocationAmounts(supply,rows=[]) {const total=units(supply);const pool=poolBps(rows);const allocations=rows.map(r=>({...r,amount:(total*units(r.pct,2)/10000n).toString()}));
 // Put indivisible rounding dust in the pool; every minted unit is assigned once.
 return {total:total.toString(),poolBps:pool.toString(),pool:(total-allocations.reduce((n,r)=>n+BigInt(r.amount),0n)).toString(),allocations};
}
export function validateAllocations(rows,supply,limits=QLOCKS_LIMITS) {
 ensure(Array.isArray(rows)&&rows.length<=32,'Use at most 32 allocations.');poolBps(rows);
 ensure(new Set(rows.map(r=>r.id)).size===rows.length,'Allocation ids must be distinct.');
 for(const r of allocationAmounts(supply,rows).allocations){
  ensure(/^[a-z0-9-]{1,64}$/.test(r.id),'Allocation id is invalid.');ensure(typeof r.label==='string'&&r.label.trim().length>0&&r.label.length<=64,'Give each allocation a short label.');
  ensure(validAddress(r.wallet),'Enter a valid wallet for '+r.label+'.');
  ensure(BigInt(r.amount)>0n&&BigInt(r.amount)<(1n<<128n),'Allocation amount is outside QLocks limits.');
  for(const k of ['cliff','duration','notice'])ensure(Number.isSafeInteger(r[k])&&r[k]>=0&&r[k]<=4294967295,'Enter a valid '+k+' for '+r.label+'.');
  ensure(r.cliff<=limits.span&&r.duration<=limits.span,'Cliff and vesting can each be at most '+Math.floor(limits.span/86400)+' days.');
  ensure(r.notice>=1&&r.notice<=limits.notice,'Sell notice must be between 1 second and '+limits.notice/86400+' days.');
 }
 return true;
}
export const defaultConfig = () => ({chainId:'8453',name:'',symbol:'',supply:'1000000000',image:'',banner:'',description:'',x:'',discord:'',telegram:'',website:'',style:'none',stakers:0,referrals:0,antiSnipe:0,quantum:true,allocations:[],allocationPreset:'none',liquidity:'50'});
export function presetRules(id) {const p=CREATE_STYLES.find(p=>p.id===id);ensure(p,'Choose a launch style.');return {stakers:p.stakers||0,referrals:p.set?.referralShareBps||0,antiSnipe:p.guardMin||0};}
export function makeBlocks(config,owner) {
 const p=CREATE_STYLES.find(p=>p.id===config.style),chain=chainById(config.chainId);ensure(p&&chain&&validAddress(owner),'Choose a style, chain and launch wallet.');
 const on=[...p.on],settings=Object.fromEntries(BLOCKS.flatMap(b=>b.params.map(v=>[v.k,v.def])));Object.assign(settings,p.set||{});
 const c=emptyBlocks(owner.toLowerCase()),quote=units(config.liquidity,chain.quote.decimals);
 if(Number(config.referrals)>0&&!on.includes('referrals'))on.push('referrals');
 c.mask=on.reduce((n,id)=>n|(1n<<BigInt(BLOCK_BITS[id])),0n).toString();
 c.guardSeconds=String(on.some(id=>BLOCKS.find(b=>b.id===id)?.guard)?Number(config.antiSnipe)*60:0);
 for(const b of BLOCKS.filter(b=>on.includes(b.id)))for(const v of b.params){
  let value=settings[v.k];
  if(v.k==='referralShareBps')value=Number(config.referrals);
  if(v.unit==='quote'&&value==='auto'){c[v.k]=(quote/BigInt(v.k==='maxBuyPerBlock'?200:v.k==='buybackMax'?100:1000)).toString();continue;}
  c[v.k]=v.unit==='addr'?String(value).toLowerCase():v.unit==='quote'?units(String(value),chain.quote.decimals).toString():String(Math.round(Number(value)*({pct:100,supplyPct:100,min:60,hr:3600,day:86400,sec:1,raw:1}[v.unit])));
 }
 if(on.includes('antiSnipe'))c.snipeDecay=String(Math.min(Number(c.snipeDecay),Number(c.guardSeconds)));
 if(Number(config.referrals)===0)c.mask=(BigInt(c.mask)&~(1n<<BigInt(BLOCK_BITS.referrals))).toString();
 const stakers=units(String(config.stakers),2);ensure(stakers<=10000n,'Stakers share is at most 100%.');
 c.payees=stakers===0n?[[owner.toLowerCase(),'10000']]:stakers===10000n?[[STAKERS_PAYEE,'10000']]:[[owner.toLowerCase(),String(10000n-stakers)],[STAKERS_PAYEE,String(stakers)]];
 return normalizeBlocks(blocksText(c));
}
export function validateConfig(c,owner,{quantumRequired=true}={}) {
 const chain=chainById(c.chainId);ensure(chain,'Choose a supported chain.');
 ensure(typeof c.name==='string'&&c.name.isWellFormed()&&c.name.trim().length>0&&new TextEncoder().encode(c.name.trim()).length<=64,'Enter a token name, up to 64 UTF-8 bytes.');
 ensure(/^[A-Za-z0-9]{1,10}$/.test(c.symbol),'Use 1–10 letters or digits for the ticker.');ensure(units(c.supply)>0n&&units(c.supply)<(1n<<128n),'Supply must fit the token engine.');
 ensure(units(c.liquidity,chain.quote.decimals)>0n,'Enter starting liquidity.');
 ensure(Number.isInteger(Number(c.antiSnipe))&&Number(c.antiSnipe)>=0&&Number(c.antiSnipe)<=10080,'Anti-snipe length is 0–10080 minutes.');
 for(const k of ['stakers','referrals'])ensure(Number(c[k])>=0&&Number(c[k])<=100,'Shares must be between 0 and 100%.');
 ensure(!quantumRequired||c.quantum,'This launch engine needs the second key. Turn quantum protection on to continue.');
 profileFromConfig(c);
 validateAllocations(c.allocations,c.supply);makeBlocks(c,owner);return true;
}
export const profileFromConfig = c => normalizeTokenProfile({description:c.description||'',image:c.image||'',banner:c.banner||'',links:{x:c.x||'',discord:c.discord||'',telegram:c.telegram||'',website:c.website||''}});
export function workspaceFields(c,owner) {const a=allocationAmounts(c.supply,c.allocations);return {tokenName:c.name.trim(),symbol:c.symbol.toUpperCase(),decimals:'18',totalSupply:a.total,notice:'604800',lpFeePpm:'10000',tokenAmount:human(a.pool),quoteAmount:c.liquidity,graduationMode:'1',threshold:'0',destinationFeePpm:'3000',blocks:makeBlocks(c,owner)};}
export function engineFor(config,targets=SIMPLE_LAUNCH) {return !config.quantum&&config.allocations.length===0&&targets[String(config.chainId)]?'simple':'multi';}
export const ENGINE_STAGES = Object.freeze([['token','Create token',1000000],['verifier','Deploy verifier',2000000],['collector','Deploy fee collector',1000000],['blocks','Deploy launch blocks',9000000],['controller','Deploy launch controller',12000000],['funding','Fund liquidity',160000],['bootstrap','Launch pool',7000000]]);
export function plan(config,targets=SIMPLE_LAUNCH) {
 if(engineFor(config,targets)==='simple')return [{id:'switch-chain',label:'Switch chain',kind:'switch',gas:0},{id:'simple-launch',label:'Launch token and pool',kind:'simple',gas:0}];
 const chain=chainById(config.chainId);ensure(chain,'Unknown chain.');
 return [{id:'switch-chain',label:'Switch to '+chain.name,kind:'switch',gas:0},{id:'check-funds',label:'Check liquidity and launch balance',kind:'preflight',gas:0},...(chain.quote.wrapNative?[{id:'wrap',label:'Wrap '+chain.native+' for liquidity',kind:'wrap',gas:65000}]:[]),
 ...ENGINE_STAGES.map(([id,label,gas])=>({id,label,kind:'engine',gas})),
 ...(config.allocations.length?[{id:'locks-setup',label:'Set up QLocks if needed',kind:'locks-setup',gas:1400000},{id:'locks-approve',label:'Approve allocation tokens',kind:'locks-approve',gas:65000}]:[]),
 ...config.allocations.map(r=>({id:'allocation-'+r.id,label:'Lock '+r.label+' · '+r.pct+'%',kind:'allocation',allocationId:r.id,gas:260000})),
 {id:'list-market',label:'List your market',kind:'listing',gas:0}];
}
export function costSummary(config,{gasPriceWei=0n,gasEstimates={},wrapNeeded=true,locksSetupNeeded=true}={}) {
 const chain=chainById(config.chainId),fee=BigInt(chain.launchFeeWei);
 const steps=plan(config).map(s=>({...s,estimatedGas:String(gasEstimates[s.id]??s.gas),estimate:true}));
 const gas=steps.reduce((n,s)=>n+BigInt(s.id==='wrap'&&!wrapNeeded||s.id==='locks-setup'&&!locksSetupNeeded?0:s.estimatedGas)*BigInt(gasPriceWei),0n);
 const txCount=8+(chain.quote.wrapNative&&wrapNeeded?1:0)+(config.allocations.length?1+config.allocations.length+(locksSetupNeeded?1:0):0);
 const nativeLiquidity=chain.family==='arc'?units(config.liquidity,18):chain.quote.wrapNative&&wrapNeeded?units(config.liquidity,chain.quote.decimals):0n;
 return {steps,networkGasWei:gas.toString(),estimate:true,platformFee:chain.launchFee,platformFeeWei:fee.toString(),native:chain.native,liquidity:config.liquidity,liquidityUnit:chain.quote.symbol,txCount,signatureCount:1,walletConfirmations:txCount+1,totalNativeWei:(gas+fee+nativeLiquidity).toString()};
}
// A saved "done" flag alone is never enough to skip a transaction.
export function resumeDecision(step,record,observation={}) {
 if(!record||record.status==='pending'||record.status==='failed'&&!record.hash&&!record.uncertain)return 'run';
 if(record.uncertain&&!record.hash)return 'recover';
 if(record.hash){if(!observation.receipt)return 'wait';if(observation.receipt.status!=='0x1')return 'retry';if(record.address&&(!observation.code||observation.code==='0x'))return 'recover';return 'skip';}
 if(step.kind==='switch')return observation.chainId===record.chainId?'skip':'run';
 if(step.kind==='engine')return observation.engineCompleted?'skip':'run';
 if(step.kind==='listing')return observation.listed?'skip':'run';
 return observation.verified?'skip':'run';
}
// Plain sentences only: raw wallet/RPC text and internal codes never reach the page.
// Messages this app writes itself (sentences ending in . or ?) pass through.
export function launchError(e) {const m=String(e?.shortMessage||e?.message||e||'').trim();
 if(Number(e?.code)===4001||/user rejected|denied|cancelled|canceled/i.test(m))return 'Cancelled in your wallet. Retry when you are ready.';
 if(/insufficient|exceeds balance|fund your wallet/i.test(m))return 'Not enough balance for this step. Add funds to your wallet, then retry.';
 if(/market_observation_unavailable|listing stopped|not visible yet/i.test(m))return 'Your token is live. It isn\'t on Markets yet. Try again in a minute; nothing else to sign.';
 if(/missing or invalid parameters|invalid params|-32602|-32603|internal json-rpc/i.test(m))return 'Your wallet couldn\'t answer just now. Retry in a moment; your progress is saved.';
 if(/price exceeds review limit/i.test(m))return 'Network fees are above this launch\u2019s limit right now. Nothing was sent; wait a few minutes and retry.';
 if(/gas exceeds review limit/i.test(m))return 'This launch needs more gas than the guided flow allows. Nothing was sent; remove an option or use Expert Studio.';
 if(/revert/i.test(m))return 'The network refused this step. Your progress is saved; Retry checks it before sending anything.';
 if(/timeout|timed out|took too long|failed to fetch|network error|load failed|rpc|rate limit|429|503/i.test(m))return 'The network took too long to reply. Retry checks the last transaction before continuing.';
 if(/wrong network|stale connection|connection changed|reconnect|chain mismatch|chainid/i.test(m))return 'Your wallet is on the wrong network or changed connection. Reconnect, then retry.';
 if(/^[A-Z][^]*[.?]$/.test(m)&&!/[{}<>]|_[a-z]+_|0x[0-9a-f]{40}/i.test(m)&&m.length<=240)return m;
 return 'This step stopped. Retry to check its saved progress.';
}
// The protected market route accepts the exact pool package, without metadata.
// Preserve all fields locally; do not add unsupported fields to the submission.
export const MARKET_METADATA_GAPS = Object.freeze(['image','banner','description','x','discord','telegram','website']);
export function listingBody(pool,_metadata) {return typeof pool==='string'?pool:JSON.stringify(pool);}

// Check the actual quote before any deployment. USDC pools keep their admitted
// quote; wrapped-native pools only need the wrapped balance shortfall in ETH/BNB.
export function fundingPreflight(config,{quoteBalance,nativeBalance,gasPriceWei=0n}={}) {
 const chain=chainById(config.chainId),quote=BigInt(quoteBalance),native=BigInt(nativeBalance),needed=units(config.liquidity,chain.quote.decimals);
 const shortfall=needed>quote?needed-quote:0n,wrapAmount=chain.quote.wrapNative?shortfall:0n;
 const cost=costSummary(config,{gasPriceWei,wrapNeeded:wrapAmount>0n});
 const nativeLiquidity=chain.family==='arc'?units(config.liquidity,18):wrapAmount;
 const requiredNative=BigInt(cost.networkGasWei)+BigInt(chain.launchFeeWei)+nativeLiquidity;
 return {ready:(chain.quote.wrapNative||shortfall===0n)&&native>=requiredNative,missingQuote:chain.quote.wrapNative?'0':shortfall.toString(),wrapAmount:wrapAmount.toString(),requiredNative:requiredNative.toString(),quoteUnit:chain.quote.symbol,nativeUnit:chain.native};
}
