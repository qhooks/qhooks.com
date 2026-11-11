import {checksSummary} from './qx-checks-copy.mjs';
// Trust layer on token pages: who made this launch (a creator verified on X), whether it copies an earlier verified
// launch, RepoProof's pre-buy verdict, and the launch's own facts read from its contracts just now.
// Used by the Launch terms card (qx-terms.mjs), the terminal's header, list and risk banner, and verify.html.
// Labels only: nothing here blocks or slows a trade.
import { ethCall, calldata, words, toAddress, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS, BLOCK_BITS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { modulesAmong, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';
import { BLOCKS, AUCTION_ADDRESS } from '/qx-block-catalog.mjs';
import { extraAddress, isLive } from '/qx-extras.mjs';

const SEL = { config: '0x79502c55', previewRate: '0xb9c3fc44', currentOwner: '0xb387ef92', recoveryEta: '0x1479b3da', recoveryBy: '0xaa19ddc3', locksSummary: '0x9522a80a', totalSupply: '0x18160ddd' };
const ZERO = '0x' + '0'.repeat(40);
// Its own stylesheet, so every page that shows a launch (Trade, terminal, creator dashboard) gets it without an edit.
if (!document.querySelector('link[href="/qx-trust.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/qx-trust.css' }));
const pad = v => BigInt(v).toString(16).padStart(64, '0');
const cache = new Map();
// A 404 (not listed) is an answer, not a failure: keep it for 10 minutes instead of asking again on every render
// (2026-11-10: QHOOKS asked /api/trust/market every few seconds). Other failures are retried on the next call.
const once = (key, ms, fn) => { const c = cache.get(key); if (c && Date.now() - c.at < (c.missing ? 600000 : ms)) return c.p; const entry = { at: Date.now(), p: null, missing: false }; entry.p = fn().catch(e => { if (e?.message === '404') { entry.missing = true; throw e; } cache.delete(key); throw e; }); cache.set(key, entry); return entry.p; };
const getJson = async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const pct = bps => (Number(bps) / 100).toFixed(2).replace(/\.?0+$/, '') + '%';
const share = (n, d) => { if (!d) return '0%'; const p = Number(n * 1000000n / d) / 10000; return (p === 0 ? '0' : p < 1 ? p.toFixed(2) : p.toFixed(1).replace(/\.0$/, '')) + '%'; };
const keyOf = (chainId, controller) => chainId + ':' + String(controller).toLowerCase();

// ---- Server data ----
export const trustOf = (chainId, controller) => once('t:' + keyOf(chainId, controller), 20000, () => getJson(`/api/trust/market/${chainId}/${String(controller).toLowerCase()}`)).catch(() => null);
export const verdictOf = (chainId, controller) => once('v:' + keyOf(chainId, controller), 20000, async () => {
  const address=String(controller).toLowerCase(),response=await fetch('/api/repoproof/check?'+new URLSearchParams({kind:'launch',chainId:String(chainId),address}),{cache:'no-store'}),value=await response.json();
  if(value?.version!==1||value.subject?.kind!=='launch'||String(value.subject?.chainId)!==String(chainId)||value.subject?.address?.toLowerCase()!==address)return null;
  const report=value.report;
  if(!report||!['danger','caution','clear','unknown'].includes(report.level)||!Array.isArray(report.checks))return {level:null,unavailable:true,state:value.state,source:'RepoProof via QHooks',checkedAt:value.checkedAt||null,cached:!!value.cached,stale:!!value.stale};
  return {...report,state:value.state,source:'RepoProof via QHooks',checkedAt:value.checkedAt||report.completedAt||report.retrievedAt||null,cached:!!value.cached,stale:!!value.stale||value.state!=='ready'||!response.ok};
}).catch(() => null);
export const trustList = () => once('list', 20000, () => getJson('/api/trust/list')).then(j => j.markets || {}).catch(() => ({}));
export const forget = (chainId, controller) => { cache.delete('t:' + keyOf(chainId, controller)); cache.delete('v:' + keyOf(chainId, controller)); cache.delete('list'); };

// ---- Small labels ----
export function badge(v, { compact = false } = {}) {
  if (!v?.handle) return null;
  const text = compact ? '✓ @' + v.handle : 'Verified creator @' + v.handle;
  const el = v.postUrl ? h('a', { class: 'qtr-badge', href: v.postUrl, target: '_blank', rel: 'noopener', title: 'The creator\'s wallet signed a code that @' + v.handle + ' posted on X' }, text)
    : h('span', { class: 'qtr-badge', title: 'The creator\'s wallet signed a code that @' + v.handle + ' posted on X' }, text);
  return el;
}
export function copyLabel(c, { compact = false } = {}) {
  if (!c) return null;
  return h('span', { class: 'qtr-copy', title: 'Same ' + c.same + ' as $' + c.symbol + ', launched earlier by the verified creator @' + c.handle }, compact ? 'Copy of $' + c.symbol : 'Same ' + c.same + ' as an earlier verified launch');
}
const LEVEL = { danger: ['High risk', 'danger'], caution: ['Caution', 'caution'], clear: ['No flags returned', 'unknown'], unknown: ['Coverage incomplete', 'unknown'] };
const timeOf=value=>{const n=typeof value==='number'?(value<1e12?value*1000:value):typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(n)&&n>0&&n<=Date.now()+60000?n:null;};
const ageOf=at=>{const seconds=Math.max(0,Math.floor((Date.now()-at)/1000));return seconds<60?seconds+'s ago':seconds<3600?Math.floor(seconds/60)+'m ago':seconds<86400?Math.floor(seconds/3600)+'h ago':Math.floor(seconds/86400)+'d ago';};
const checkTime=v=>timeOf(v?.checkedAt||v?.completedAt||v?.retrievedAt);
const completeCoverage=v=>v?.coverage?.complete===true&&v?.coverage?.unknown===0;
function verdictMeta(v){
 const at=checkTime(v),coverage=v?.coverage,checked=Number.isSafeInteger(coverage?.checked)?coverage.checked:null,unknown=Number.isSafeInteger(coverage?.unknown)?coverage.unknown:null;
 const snapshot=v?.snapshot,point=snapshot?(snapshot.chain?' · snapshot '+String(snapshot.chain).slice(0,40):'')+(snapshot.block!=null?' · block '+String(snapshot.block).slice(0,80):snapshot.slot!=null?' · slot '+String(snapshot.slot).slice(0,80):''):'';
 return (v?.source||'RepoProof via QHooks')+' · '+(v?.stale?'refreshing · ':'')+(v?.cached?'cached · ':'')+(at?new Date(at).toISOString()+' ('+ageOf(at)+')':'check time unknown')+' · source coverage: '+(checked!==null?checked+' checked'+(unknown!==null?', '+unknown+' unknown':''):Array.isArray(v?.checks)?v.checks.length+' returned checks; completeness unknown':'unavailable')+(point||'');
}
export function verdictChip(v) {
  if (!v || !v.level) return h('span', { class: 'qtr-chip' }, v?.unsupported ? 'Not covered' : 'Refreshing…');
  if(v.level==='clear'&&(v.stale||!checkTime(v)||!completeCoverage(v)))return h('span',{class:'qtr-chip unknown'},v.stale?'Refreshing…':!checkTime(v)?'Check time unknown':'Limited coverage');
  const [t, c] = LEVEL[v.level] || ['Unknown', 'unknown'];
  return h('span', { class: 'qtr-chip ' + c }, t);
}

// ---- The launch's own facts, read from chain ----
/** Blocks on, what a trade pays now, liquidity, team locks, keys and recovery, modules. */
const address=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value);
const uint=hex=>{if(typeof hex!=='string'||!/^0x[0-9a-f]{64}$/i.test(hex))throw Error('Unreadable ABI word');return BigInt(hex);};
const abiWords=(hex,min)=>{if(typeof hex!=='string'||!/^0x(?:[0-9a-f]{64})+$/i.test(hex))throw Error('Unreadable ABI words');const out=words(hex);if(out.length<min)throw Error('Incomplete ABI result');return out;};
export function factsOf(pool) {
 return once('f:'+keyOf(pool.chainId,pool.controller),30000,async()=>{
  const {chainId,controller}=pool,c=pool.constructor,quote=c.quote.toLowerCase();
  const token=(c.currency0.toLowerCase()===quote?c.currency1:c.currency0).toLowerCase(),owner=String(c.owner).toLowerCase();
  if(!address(token)||!address(owner)||owner===ZERO)throw Error('Launch identity unavailable');
  const hasBlocksField=Object.hasOwn(c,'blocks'),blocks=c.blocks,knownType=!hasBlocksField||address(blocks),hasBlocks=address(blocks)&&blocks.toLowerCase()!==ZERO;
  const reads={};
  async function read(name,to,data,decode=uint){try{const result=decode(await ethCall(chainId,to,data));reads[name]='observed';return result;}catch{reads[name]='unavailable';return null;}}
  const [configWords,buy,sell,current,eta,by,supply,free]=await Promise.all([
   hasBlocks?read('Block configuration',blocks,SEL.config,hex=>abiWords(hex,BLOCK_FIELDS.length)):null,
   hasBlocks?read('Buy charge',blocks,SEL.previewRate+pad(1)+pad(0)+pad(0),hex=>{const n=uint(hex);if(n>10000n)throw Error('Invalid charge');return n;}):null,
   hasBlocks?read('Sell charge',blocks,SEL.previewRate+pad(0)+pad(0)+pad(0),hex=>{const n=uint(hex);if(n>10000n)throw Error('Invalid charge');return n;}):null,
   read('Current owner',controller,SEL.currentOwner,hex=>{const n=uint(hex);if(n===0n||n>=1n<<160n)throw Error('Invalid owner');return toAddress(n);}),
   read('Recovery status',controller,SEL.recoveryEta,hex=>{const n=uint(hex);if(n>8640000000000n)throw Error('Unreadable recovery time');return Number(n);}),
   read('Recovery initiating key',controller,SEL.recoveryBy,hex=>{const n=uint(hex);if(n>2n)throw Error('Invalid recovery key');return Number(n);}),
   read('Total supply',token,SEL.totalSupply),read('Original creator balance',token,calldata('0x70a08231',['address'],[owner]))
  ]);
  const liquidity={k:'Liquidity',v:!knownType?'Unavailable · launch type could not be determined':hasBlocksField?'Permanent: nobody can withdraw it, the creator included':'The creator can withdraw graduated liquidity with both keys',tone:!knownType?'':hasBlocksField?'':'warn',source:'Listed launch configuration'};
  const facts=[liquidity];let cfg=null,on=[];
  if(configWords){
   cfg=Object.fromEntries(BLOCK_FIELDS.map(([key],i)=>[key,configWords[i]]));
   on=Object.entries(BLOCK_BITS).filter(([,bit])=>(cfg.mask>>BigInt(bit))&1n).map(([id])=>id);
   if(on.includes('holderGate')&&cfg.gateToken===BigInt(AUCTION_ADDRESS))on=on.map(id=>id==='holderGate'?'openingAuction':id);
   const names=on.map(id=>BLOCKS.find(block=>block.id===id)?.name||id);
   facts.push({k:'Blocks observed',v:names.length?names.length+': '+names.join(', '):'None enabled in the observed configuration',tone:''});
  }else facts.push({k:'Blocks observed',v:hasBlocks?'Unavailable · block configuration could not be read':'No block contract in the listed launch configuration',tone:''});
  if(hasBlocks)facts.push({k:'Charges observed',v:'A buy '+(buy===null?'charge is unavailable':'pays '+pct(buy))+', a sell '+(sell===null?'charge is unavailable':'pays '+pct(sell))+' (on top of pool fees)',tone:(buy!==null&&buy>=1000n)||(sell!==null&&sell>=1000n)?'warn':''});
  let locked=null,lockState='unavailable';
  try{
   const live=await isLive(chainId,'locks');reads['QLocks presence']='observed';
   if(live){locked=await read('QLocks summary',await extraAddress('locks',chainId),calldata(SEL.locksSummary,['address'],[token]),hex=>abiWords(hex,5)[0]);lockState=locked===null?'unavailable':'observed';}
   else lockState='not_deployed';
  }catch{reads['QLocks presence']='unavailable';}
  const lockText=lockState==='not_deployed'?'QLocks is not deployed at its listed address; lock coverage unavailable':locked===null?'QLocks balance unavailable':supply===null?'QLocks share unavailable because total supply could not be read':supply===0n?'QLocks holds '+locked+' raw token units':share(locked,supply)+' of supply in QLocks across all beneficiaries, with public notice';
  const creatorText=free===null?'Original creator wallet balance unavailable':supply===null?'Original creator wallet share unavailable because total supply could not be read':supply===0n?'Original creator wallet holds '+free+' raw token units':'Original creator wallet holds '+share(free,supply)+' unlocked';
  facts.push({k:'Token locks & creator holdings',v:(supply===0n?'Total supply is 0; percentage shares do not apply. ':'')+lockText+'; '+creatorText,tone:free!==null&&supply!==null&&supply>0n&&free*20n>supply?'warn':''});
  const ownerText=current===null?'Current creator wallet unavailable. ':current!==owner?'Keys were rotated to '+current+'. ':'';
  const recoveryText=eta===null?'Recovery status unavailable; it could not be read from the controller.':eta>0?'A creator key recovery is pending'+(by===1?' (started by the wallet)':by===2?' (started by the post-quantum key)':' (initiating key unavailable)')+'; it can replace both keys from '+new Date(eta*1000).toISOString()+' unless the other key cancels it.':'No recovery pending at this observation.';
  facts.push({k:'Creator keys',v:ownerText+'Creator actions require the wallet and a post-quantum key together. '+recoveryText,tone:eta!==null&&eta>0?'warn':''});
  if(cfg&&configWords.length>=BLOCK_FIELDS.length+8){
   try{await loadModules();const payees=configWords.slice(BLOCK_FIELDS.length,BLOCK_FIELDS.length+8).map(toAddress).filter(value=>value!==ZERO),found=modulesAmong(payees,token,quote);facts.push({k:'Modules observed',v:found.length?found.map(f=>f.module.name+(f.module.builderBps?' (builder keeps '+pct(f.module.builderBps)+')':'')).join(', '):'No recognized modules among the observed payees',tone:''});}
   catch{facts.push({k:'Modules observed',v:'Unavailable · reviewed module coverage could not be checked',tone:''});}
  }else if(hasBlocks)facts.push({k:'Modules observed',v:'Unavailable · complete payee configuration could not be read',tone:''});
  const observed=Object.values(reads).filter(state=>state==='observed').length,unavailable=Object.values(reads).filter(state=>state==='unavailable').length;
  return {facts,token,owner,current,recovery:eta===null?null:eta>0,buyBps:buy===null?null:Number(buy),sellBps:sell===null?null:Number(sell),checkedAt:new Date().toISOString(),source:'RPC latest + listed launch configuration (liquidity policy)',coverage:{observed,unavailable,reads}};
 });
}
const factsMeta=f=>{const at=timeOf(f.checkedAt);return f.source+' · observed '+(at?new Date(at).toISOString()+' ('+ageOf(at)+')':'time unavailable')+' · read coverage: '+f.coverage.observed+' observed, '+f.coverage.unavailable+' unavailable. RPC reads use latest independently; no common block was pinned.';};

// ---- The Launch terms card's trust section ----
const verifyHref = pool => '/verify#m=' + pool.chainId + ':' + pool.controller;
function verdictBlock(v) {
  const head = h('div', { class: 'qtr-row' }, h('b', {}, 'Market checks'), verdictChip(v));
  if (!v || !v.level) return h('div', { class: 'qtr-verdict' }, head,
    h('p', { class: 'qtb-note' }, v?.unsupported ? 'RepoProof does not cover this chain yet.' : 'Refreshing… RepoProof is checking this launch. Contract observations below have separate source coverage.'),
    h('p',{class:'qtr-evidence'},verdictMeta(v)),
    v?.url ? h('a', { class: 'qtr-link', href: v.url, target: '_blank', rel: 'noopener' }, 'Run the check on RepoProof ↗') : null);
  return h('div', { class: 'qtr-verdict ' + (v.level==='clear'?'unknown':v.level) }, head,
    h('p', { class: 'qtr-headline' }, 'RepoProof: ' + v.headline + (v.counts ? ' · ' + (v.counts.danger??'?') + ' red, ' + (v.counts.caution??'?') + ' watch, ' + (v.counts.clear??'?') + ' clear' : '') + (v.stale ? ' (from an earlier check)' : '')),
    h('p',{class:'qtr-evidence'},verdictMeta(v)),
    v.checks?.length ? h('ul', { class: 'qtr-checks' }, ...v.checks.slice(0, 4).map(c => h('li', { class: c.status==='clear'&&(v.stale||!checkTime(v)||!completeCoverage(v))?'unknown':c.status }, c.title))) : null,
    v.url ? h('a', { class: 'qtr-link', href: v.url, target: '_blank', rel: 'noopener' }, 'Evidence on RepoProof ↗') : null);
}
const renderRuns=new WeakMap();
function beginRender(el,key){const revision=(renderRuns.get(el)||0)+1;renderRuns.set(el,revision);el.dataset.key=key;return()=>el.dataset.key===key&&renderRuns.get(el)===revision;}
/** Fills `el` with the trust section for `pool` (creator, copy warning, verdict, facts). */
export async function renderTrust(el, pool) {
  const key = keyOf(pool.chainId, pool.controller),active=beginRender(el,key);
  el.className = 'qtr';
  el.replaceChildren(h('p', { class: 'qtb-note' }, 'Checking who made this launch…'));
  const [t, v, f] = await Promise.all([trustOf(pool.chainId, pool.controller), verdictOf(pool.chainId, pool.controller), factsOf(pool).catch(() => null)]);
  if (!active()) return;
  const creator = t?.verified
    ? h('div', { class: 'qtr-row' }, h('b', {}, 'Creator'), badge(t.verified))
    : h('div', { class: 'qtr-row' }, h('b', {}, 'Creator'), h('span', { class: 'qtr-muted' }, t?'Not verified on X':'Creator verification unavailable'), h('a', { class: 'qtr-link', href: verifyHref(pool) }, 'Are you the creator? Verify'));
  const copy = t?.copyOf ? h('div', { class: 'qtr-warn', role: 'note' }, h('b', {}, 'Check you have the right token'),
    h('span', {}, 'Same ' + t.copyOf.same + ' as $' + t.copyOf.symbol + ' (' + t.copyOf.name + '), launched earlier by the verified creator @' + t.copyOf.handle + '. '),
    h('a', { href: '/terminal#m=' + t.copyOf.chainId + ':' + t.copyOf.controller }, 'Open the earlier launch')) : null;
  // Liquidity has its own row in the terms below, so it is left out here.
  const facts = f ? h('div', {}, h('p', { class: 'qtr-sub' }, 'Launch observations'),h('p',{class:'qtr-evidence'},factsMeta(f)),
    h('ul', { class: 'qtb-list qtr-facts' }, ...f.facts.filter(x => x.k !== 'Liquidity').map(x => h('li', { class: x.tone }, h('b', {}, x.k), h('span', {}, x.v))))) : null;
  el.replaceChildren(...[creator, copy, verdictBlock(v), facts].filter(Boolean));
}

// ---- The terminal's risk banner for a QHooks launch ----
/** Fills the ticket's banner: copy warning first, then RepoProof's verdict, then the facts that matter at the moment of trading. */
export async function renderRisk(el, pool) {
  const key = keyOf(pool.chainId, pool.controller),active=beginRender(el,key);
  el.hidden=false;el.replaceChildren(h('p',{class:'qtr-evidence'},checksSummary({state:'running'})));
  const [t, v, f] = await Promise.all([trustOf(pool.chainId, pool.controller), verdictOf(pool.chainId, pool.controller), factsOf(pool).catch(() => null)]);
  if (!active()) return;
  const warningChecks=(v?.checks||[]).filter(c=>c.status==='danger'||c.status==='caution');
  const warningFacts=(f?.facts||[]).filter(fact=>fact.tone==='warn');
  const level = t?.copyOf || v?.level === 'danger' || warningChecks.some(c=>c.status==='danger') ? 'danger'
    : v?.level === 'caution' || warningChecks.length || warningFacts.length || f?.recovery ? 'caution' : '';
  const title = t?.copyOf ? 'Copy warning: same ' + t.copyOf.same + ' as $' + t.copyOf.symbol + ' by @' + t.copyOf.handle
    : v?.level === 'danger' ? 'RepoProof: ' + v.headline : v?.level === 'caution' ? 'Trade with care: ' + v.headline : v?.level === 'clear' ? checksSummary(v,{hasTimestamp:!!checkTime(v)}) : 'Refreshing market checks…';
  const partialReads=!f||f.coverage.unavailable>0||f.facts.some(fact=>/unavailable|could not be read|could not be checked/i.test(fact.v));
  // checks-rel 2026-11-10 (walkthrough item 3): final states instead of an endless "Refreshing" — this one line only.
  const summary=checksSummary(v,{hasTimestamp:!!checkTime(v)});
  const creator=h('li',{},...(t?.verified?['Creator verified on X: ',badge(t.verified,{compact:true})]:[t?'Creator not verified on X':'Creator not verified on X']));
  const factLine=fact=>h('li',{},h('b',{},fact.k+': '),fact.v);
  const body=h('div',{class:'qtr-risk-detail-body'},
    h('p',{class:'qtr-headline'},title),h('ul',{},creator),
    h('p',{class:'qtr-evidence'},verdictMeta(v)),
    (v?.checks||[]).some(c=>c.status!=='danger'&&c.status!=='caution')?h('ul',{},...(v.checks.filter(c=>c.status!=='danger'&&c.status!=='caution').map(c=>h('li',{},c.title)))):null,
    f?h('p',{class:'qtr-evidence'},factsMeta(f)):h('p',{class:'qtr-evidence'},'Launch contract observations unavailable.'),
    f?h('ul',{},...f.facts.filter(fact=>fact.tone!=='warn').map(factLine)):null,
    h('a', { href: v?.url || 'https://repoproof.online/proof#q=' + encodeURIComponent('https://qhooks.com/l/' + pool.chainId + '/' + pool.controller), target: '_blank', rel: 'noopener' }, v?.url && v.level ? 'Evidence on RepoProof ↗' : 'Full check on RepoProof ↗'));
  // Native details/summary retains browser keyboard behavior without a second action or any scan.
  const coverageIncomplete=!v?.level||v.level==='unknown'||!completeCoverage(v)||partialReads||!t;
  const details=h('details',{class:'qtr-risk-details'},h('summary',{class:'qtr-risk-summary'},level?(coverageIncomplete?'Sources · incomplete coverage':'Sources & launch observations'):summary),body);
  const warningTitle=t?.copyOf||v?.level==='danger'||v?.level==='caution'?title:warningChecks.length?'Market checks need attention':'Launch observations need attention';
  const evidenceState=v?.stale?'Refreshing · last RepoProof check '+(checkTime(v)?ageOf(checkTime(v)):'time unknown'):v?.level&&!checkTime(v)?'RepoProof check time unknown':null;
  el.className = 'qxt-risk qtr-ticket-risk ' + (level||'qtr-ticket-risk--compact');
  el.replaceChildren(...(level?[h('b',{},warningTitle),
    h('ul',{},...warningChecks.map(c=>h('li',{},c.title)),...warningFacts.map(factLine)),
    evidenceState?h('p',{class:'qtr-evidence'},evidenceState):null]:[]).filter(Boolean),details);
  el.hidden = false;
}
