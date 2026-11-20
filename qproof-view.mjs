import {qproofCheckDisplayCopy} from './qproof-check-display-copy.mjs';
// Display only: the server owns risk, required checks and the verdict policy.
const LEVELS=new Set(['danger','watch','clear','incomplete']);
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const pct=v=>finite(v)!==null&&v<=100?v:null;
const text=(v,max=500)=>typeof v==='string'?v.slice(0,max):'';
const fullText=v=>typeof v==='string'?v:'';
const emptyNumbers=()=>Object.fromEntries(['buyTaxPct','sellTaxPct','buyChargePct','sellChargePct','poolFeePct','sellable','roundTripReturnPct','lpLockedPct','lpLockedScope','lpUnlockAt','top10Pct','creatorPct','holders','insiderPct','sniperPct','bundlePct','sellableBasis','taxBasis','reportedSellable','reportedBuyTaxPct','reportedSellTaxPct','reportedTop10Pct','reportedHolders'].map(k=>[k,null]));
const CHECK_LEVELS=new Set([...LEVELS,'info']);
const CHECK_STATUS={danger:'danger',watch:'caution',clear:'clear',incomplete:'unknown',info:'info'};
const CHECK_LABEL={danger:'Danger',watch:'Watch',clear:'Passed',incomplete:'Not checked',info:'Note'};
function checkLevel(check){
 if(check.level!==undefined)return CHECK_LEVELS.has(check.level)?check.level:'incomplete';
 return({danger:'danger',caution:'watch',watch:'watch',clear:'clear',unknown:'incomplete',incomplete:'incomplete',info:'info'})[check.status??check.st]||'incomplete';
}
function evidenceLinks(check){
 const canonical=Array.isArray(check.evidence)&&check.evidence.some(e=>e&&typeof e==='object'&&Object.hasOwn(e,'url'));
 const rows=canonical?check.evidence:Array.isArray(check.evidenceLinks)?check.evidenceLinks:[],found=new Map();
 for(const e of rows){if(!e||typeof e!=='object')continue;const url=safeQProofUrl(e.url);if(!url||found.has(url))continue;found.set(url,{kind:text(e.kind,40),value:text(e.value,300),label:text(e.label,100)||text(e.value,100)||text(e.kind,40)||'Evidence',url});if(found.size===16)break;}
 return [...found.values()];
}
export function normalizeQProofChecks(checks){
 if(!Array.isArray(checks))return[];
 return checks.map((value,index)=>{const c=value&&typeof value==='object'?value:{},level=checkLevel(c),status=CHECK_STATUS[level];
  const copy=qproofCheckDisplayCopy(c);return{...c,id:text(c.id,100)||String(index),level,status,st:status,label:CHECK_LABEL[level],title:text(copy.title),why:fullText(copy.why||copy.notCheckedReason),detail:fullText(copy.detail),evidenceLinks:evidenceLinks(c)};
 });
}
function readKeyNumbers(raw={}){
 const numbers=emptyNumbers();
 for(const k of ['buyTaxPct','sellTaxPct','buyChargePct','sellChargePct','poolFeePct','lpLockedPct','top10Pct','creatorPct','insiderPct','sniperPct','bundlePct'])numbers[k]=pct(raw?.[k]);
 numbers.roundTripReturnPct=finite(raw?.roundTripReturnPct);numbers.sellable=typeof raw?.sellable==='boolean'?raw.sellable:null;
 numbers.holders=Number.isSafeInteger(raw?.holders)&&raw.holders>=0?raw.holders:null;
 for(const k of ['sellableBasis','taxBasis'])numbers[k]=['sell_test','reported'].includes(raw?.[k])?raw[k]:null;
 numbers.reportedSellable=typeof raw?.reportedSellable==='boolean'?raw.reportedSellable:null;numbers.reportedBuyTaxPct=pct(raw?.reportedBuyTaxPct);numbers.reportedSellTaxPct=pct(raw?.reportedSellTaxPct);numbers.reportedTop10Pct=pct(raw?.reportedTop10Pct);numbers.reportedHolders=Number.isSafeInteger(raw?.reportedHolders)&&raw.reportedHolders>0?raw.reportedHolders:null;
 numbers.lpUnlockAt=typeof raw?.lpUnlockAt==='string'&&Number.isFinite(Date.parse(raw.lpUnlockAt))?raw.lpUnlockAt:null;
 numbers.lpLockedScope=['launch pool only','one V2 pair only','one pool only'].includes(raw?.lpLockedScope)?raw.lpLockedScope:null;
 return numbers;
}
function readHolders(rows){return(Array.isArray(rows)?rows:[]).slice(0,40).filter(r=>r&&typeof r==='object'&&text(r.address,100)).map(r=>({address:text(r.address,100),pct:pct(r.pct),label:text(r.label,160)||null,url:safeQProofUrl(r.url)}));}
const isPresentation=value=>value?.presentationVersion===2||value?.version===2;
export function ensureQProofStyles(doc=globalThis.document){if(doc?.head&&!doc.getElementById('qproof-view-styles')){const link=doc.createElement('link');link.id='qproof-view-styles';link.rel='stylesheet';link.href='/qproof-view.css';doc.head.append(link);}}
// holders = the server's supplied holder rows (any chain); holderView/hookView = the native holder ranking and
// pool hook answers (Robinhood Chain), shown by renderQProofHolders/renderQProofHooks.
export function readQProofPresentation(value){
 const report=value?.report??value??null,source=isPresentation(value)?value:isPresentation(report)?report:null,v=source?.verdict;
 if(!source||!v||!LEVELS.has(v.level)||!text(v.label,80))return{ready:false,report,verdict:{level:'incomplete',label:'Partly checked',reason:'The latest verdict is not available yet.',flags:[],counts:{},evidence:[]},freshness:{checkedAt:null,ageSec:null,block:null,slot:null,stale:true},keyNumbers:emptyNumbers(),keyEvidence:{},checks:normalizeQProofChecks(Array.isArray(value?.checks)?value.checks:report?.checks),notChecked:[],holders:[],links:{}};
 const displayVerdict=qproofCheckDisplayCopy({detail:v.reason});
 const numbers=readKeyNumbers(source.keyNumbers??report?.keyNumbers);
 const checks=normalizeQProofChecks(Array.isArray(source.checks)?source.checks:report?.checks);
 const keyEvidence=source.keyEvidence??report?.keyEvidence;
 return{ready:true,presentationVersion:2,report,verdict:{...v,label:text(v.label,80),reason:text(displayVerdict.detail),flags:Array.isArray(v.flags)?v.flags.map(qproofCheckDisplayCopy):[],counts:v.counts??{},evidence:Array.isArray(v.evidence)?v.evidence:[]},freshness:source.freshness??report?.freshness??{},keyNumbers:numbers,keyEvidence:keyEvidence&&typeof keyEvidence==='object'&&!Array.isArray(keyEvidence)?keyEvidence:{},checks,notChecked:(Array.isArray(source.notChecked)?source.notChecked:Array.isArray(report?.notChecked)?report.notChecked:[]).map(qproofCheckDisplayCopy),holders:readHolders(Array.isArray(source.holders)?source.holders:report?.holders),links:source.links??report?.links??{},holderView:qproofHolderView(source===report?report:{report,holderRanking:source.holderRanking}),hookView:qproofHookView(source===report?report:{report,poolHooks:source.poolHooks})};
}
export function qproofAgeLabel(freshness,now=Date.now()){
 const at=typeof freshness?.checkedAt==='string'?Date.parse(freshness.checkedAt):NaN;if(!Number.isFinite(now)||!Number.isFinite(at)||at>now+10000)return'Check time not reported';
 const age=Math.max(0,Math.floor((now-at)/1000)),unit=age<60?'just now':age<3600?Math.floor(age/60)+' min ago':age<86400?Math.floor(age/3600)+' h ago':Math.floor(age/86400)+' days ago';
 const block=Number.isSafeInteger(freshness.block)&&freshness.block>0?' · block '+freshness.block.toLocaleString('en-US'):Number.isSafeInteger(freshness.slot)&&freshness.slot>0?' · slot '+freshness.slot.toLocaleString('en-US'):'';
 return'Checked '+unit+block;
}
// Compatibility for existing execution guards; this maps the server enum only.
export function qproofGuardLevel(value){const p=readQProofPresentation(value);return p.ready?({danger:'danger',watch:'caution',clear:'clear',incomplete:'unknown'})[p.verdict.level]:null;}
export function qproofReadParams(search=globalThis.location?.search||''){const q=new URLSearchParams(search);if(!q.has('cached_only'))return{};return{cached_only:q.getAll('cached_only').length===1&&q.get('cached_only')==='1'?'1':'invalid'};}
export function qproofReportLocation(path,search=globalThis.location?.search||''){const mode=qproofReadParams(search);return path+(mode.cached_only?'?'+new URLSearchParams(mode):'');}
const percent=v=>v===null?'Not reported':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)+'%';
export function qproofNumberCells(numbers={},evidence={}){
 const n=readKeyNumbers(numbers),buy=n.buyChargePct!==null,sell=n.sellChargePct!==null;
 // Evidence only for the value a cell shows; a value not reported has none.
 const taxReported=n.taxBasis==='reported';
 const ev=(...keys)=>{const key=keys.find(k=>n[k]!==null&&n[k]!==undefined);return key?qproofEvidenceItems(evidence?.[key],1):[];};
 return[
  {label:buy?'Buy charge':(taxReported?'Reported buy tax':'Buy tax'),value:percent(buy?n.buyChargePct:n.buyTaxPct),detail:buy&&n.buyTaxPct>0?'Plus '+percent(n.buyTaxPct)+(taxReported?' reported':'')+' token tax':!buy&&n.buyTaxPct===null&&n.reportedBuyTaxPct!==null?'Reported tax: '+percent(n.reportedBuyTaxPct):null,evidence:ev(buy?'buyChargePct':'buyTaxPct','reportedBuyTaxPct')},
  {label:sell?'Sell charge':(taxReported?'Reported sell tax':'Sell tax'),value:percent(sell?n.sellChargePct:n.sellTaxPct),detail:sell&&n.sellTaxPct>0?'Plus '+percent(n.sellTaxPct)+(taxReported?' reported':'')+' token tax':!sell&&n.sellTaxPct===null&&n.reportedSellTaxPct!==null?'Reported tax: '+percent(n.reportedSellTaxPct):null,evidence:ev(sell?'sellChargePct':'sellTaxPct','reportedSellTaxPct')},
  // A provider's sellable flag is never shown as our sell test: without our test it is "Reported sellable";
  // when our test ran without a sale, the provider value is only a reported note.
  n.sellableBasis==='reported'?{label:'Reported sellable',value:n.sellable===true?'Yes':n.sellable===false?'No':'Not reported',detail:null,evidence:ev('sellable')}
  :{label:'Sell test',value:n.sellable===true?'Sold':n.sellable===false?'Failed':'Not checked',detail:n.roundTripReturnPct!==null?percent(n.roundTripReturnPct)+' returned':n.sellable===null&&n.reportedSellable!==null?'Reported sellable: '+(n.reportedSellable?'yes':'no'):null,evidence:ev('sellable','roundTripReturnPct','reportedSellable')},
  {label:'LP locked',value:percent(n.lpLockedPct)+(n.lpLockedPct!==null&&n.lpLockedScope?` (${n.lpLockedScope})`:''),detail:n.lpUnlockAt?'Until '+new Date(n.lpUnlockAt).toISOString().slice(0,10):null,evidence:ev('lpLockedPct')},
  {label:'Top 10',value:percent(n.top10Pct),detail:n.reportedTop10Pct!==null&&n.reportedTop10Pct!==undefined?'Reported, contracts included: '+percent(n.reportedTop10Pct):null,evidence:ev('top10Pct','reportedTop10Pct')},
  {label:'Creator',value:percent(n.creatorPct),detail:null,evidence:ev('creatorPct')}
 ];
}
// Server evidence references (verdict.evidence, keyEvidence, checks[].evidenceRefs) as short links. Labels come
// from the server; a link is an https block-explorer URL. A reference without one (a paid RPC or reported-data
// receipt) is shown by its label and receipt hash only. Repeated links (same explorer URL) and repeated labels collapse.
export function qproofEvidenceItems(refs,max=3){
 const out=[],seen=new Set();
 for(const r of Array.isArray(refs)?refs:[]){
  if(!r||typeof r!=='object')continue;const label=text(r.label,80).trim();if(!label)continue;
  const raw=safeQProofUrl(r.url),url=raw&&!/(?:^|\.)alchemy\.com$/i.test(new URL(raw).hostname)&&!new URL(raw).search?raw:null,key=url||'label:'+label;
  if(seen.has(key))continue;seen.add(key);
  out.push({label,url,kind:text(r.kind,40),receipt:Number.isSafeInteger(r.receipt)&&r.receipt>=0?r.receipt:null,receiptSha256:/^[a-f0-9]{64}$/i.test(r.receiptSha256||'')?r.receiptSha256.toLowerCase():null,inputs:r.inputs&&typeof r.inputs==='object'&&!Array.isArray(r.inputs)?r.inputs:null});
  if(out.length>=max)break;
 }
 return out;
}
export function renderQProofEvidence(h,refs,{max=3,cls='qp-evidence'}={}){
 const items=qproofEvidenceItems(refs,max);if(!items.length)return null;
 return h('span',{class:cls},items.map(e=>e.url?h('a',{href:e.url,target:'_blank',rel:'noopener noreferrer'},e.label):h('span',e.receiptSha256?{title:'Receipt '+e.receiptSha256}:null,e.label)));
}
export function safeQProofUrl(value,origin='https://qhooks.com'){
 if(typeof value!=='string')return null;try{const u=new URL(value,origin);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function renderQProofSummary(h,presentation,{onRefresh,refreshing=false}={}){
 const p=readQProofPresentation(presentation),v=p.verdict;
 const refresh=onRefresh?h('button',{type:'button',class:'qp-summary__refresh','data-proof-action':'refresh',disabled:refreshing,onclick:onRefresh},refreshing?'Refreshing…':'Refresh'):null;
 const bar=h('section',{class:'qp-verdict-bar is-'+v.level,'aria-label':'QProof verdict'},
  h('div',{class:'qp-verdict-bar__top'},h('strong',{class:'qp-verdict-word'},v.label),refresh),
  h('p',{class:'qp-verdict-reason'},v.reason),
  h('p',{class:'qp-verdict-age'},qproofAgeLabel(p.freshness)),
  renderQProofEvidence(h,v.evidence,{cls:'qp-evidence qp-verdict-evidence'}));
 const strip=h('dl',{class:'qp-key-strip'},qproofNumberCells(p.keyNumbers,p.keyEvidence).map(c=>h('div',{class:'qp-key-cell'},h('dt',null,c.label),h('dd',null,c.value),c.detail?h('small',null,c.detail):null,renderQProofEvidence(h,c.evidence,{max:1}))));
 const fee=p.keyNumbers.poolFeePct===null?null:h('p',{class:'qp-fee-note'},'Pool fee '+percent(p.keyNumbers.poolFeePct)+' per swap, separate from token tax and launch charges.');
 return{presentation:p,bar,strip,fee};
}

// Holder ranking and pool hook answers (server words; display only). Top 10 rows first, the rest behind "Show top 100".
// Every row links to the explorer address page the server supplies; the pin block is shown once.
const safeLink=v=>{const u=safeQProofUrl(v);return u&&!new URL(u).search?u:null;};
const shortAddress=a=>typeof a==='string'&&a.length>14?a.slice(0,6)+'…'+a.slice(-4):text(a,64);
export function qproofHolderView(value){
 const report=value?.report??value,h=report?.holderRanking??value?.holderRanking;if(!h||typeof h!=='object'||Array.isArray(h))return null;
 const L=h.lines&&typeof h.lines==='object'?h.lines:{},line=k=>text(L[k],240)||null;
 const base=safeLink(h.addressUrl),rows=(Array.isArray(h.top100)?h.top100:Array.isArray(h.top10)?h.top10:[]).slice(0,100).filter(r=>r&&typeof r.address==='string'&&/^[0-9A-Za-z]{32,64}$/.test(r.address)).map(r=>({rank:Number.isSafeInteger(r.rank)?r.rank:null,address:text(r.address,64),short:shortAddress(r.address),label:text(r.label,60)||'Unlabelled',detail:text(r.detail,100)||null,pct:text(r.pctLabel,16)||'Not checked',url:safeLink(r.url)||(base?safeLink(base+encodeURIComponent(r.address)):null)}));
 return{state:['complete','bounded','unknown'].includes(h.state)?h.state:'unknown',pin:line('pin'),pinUrl:safeLink(h.pinUrl),holders:line('holders'),rawTop10:line('rawTop10')||'Top 10 wallets: Not checked',labeledTop10:line('labeledTop10')||'Top 10 after pools, locks, staking and burn: Not checked',excluded:line('excluded'),rowsTitle:line('rows'),evidence:Array.isArray(h.evidence)?h.evidence:[],rows,total:Number.isSafeInteger(h.rowCount)?h.rowCount:rows.length};
}
export function qproofHookView(value){
 const report=value?.report??value,x=report?.poolHooks??value?.poolHooks;if(!x||!Array.isArray(x.pools)||!x.pools.length)return null;
 const LEVEL={danger:'Danger',watch:'Watch',clear:'Clear',incomplete:'Partly checked'};
 return{note:text(x.coverageNote,200)||null,pools:x.pools.slice(0,12).map(p=>({hook:text(p.hook,64)||null,short:p.hook?shortAddress(p.hook):null,hookUrl:safeLink(p.hookUrl),level:LEVEL[p.level]?p.level:p.level==='info'?'clear':'incomplete',levelLabel:LEVEL[p.level]||(p.level==='info'?'Clear':'Partly checked'),identity:text(p.identity?.line,160)||null,
  answers:['sells','cut','fees','upgrade'].map((key,i)=>{const a=(Array.isArray(p.answers)?p.answers:[]).find(a=>a?.key===key)||{};return{key,label:['Sells','Cut','Fees','Upgrade'][i],known:a.known===true,headline:text(a.headline,300)||'Not checked: this report does not include this answer.',detail:a.known===true?text(a.detail,1200)||null:null,evidence:Array.isArray(a.evidence)?a.evidence:[]};})}))};
}
function holderRowEl(h,r){
 return h('li',{class:'qp-holder'},h('span',{class:'qp-holder__rank'},r.rank===null?'':String(r.rank)),
  h('span',{class:'qp-holder__who'},h('b',null,r.label),h('small',null,r.url?h('a',{href:r.url,target:'_blank',rel:'noopener noreferrer',title:r.address},r.short):r.short,r.detail?' · '+r.detail:null)),
  h('span',{class:'qp-holder__pct'},r.pct));
}
export function renderQProofHolders(h,value,{initial=10,extra=null}={}){
 const v=qproofHolderView(value);if(!v)return null;
 const first=v.rows.slice(0,initial),rest=v.rows.slice(initial);
 return h('section',{class:'ta-proof-section qp-holders is-'+v.state,'aria-label':'Holders','data-proof-holders':v.state},
  h('h3',null,'Holders'),
  h('p',{class:'qp-holders__line'},v.rawTop10),h('p',{class:'qp-holders__line'},v.labeledTop10),
  v.excluded?h('p',{class:'qp-holders__note'},v.excluded):null,
  h('p',{class:'qp-holders__note'},v.holders),
  qproofEvidenceItems(v.evidence,1).length?renderQProofEvidence(h,v.evidence,{max:1}):v.pin?h('p',{class:'qp-holders__note'},v.pin):null,
  first.length?h('ol',{class:'qp-holder-list'},first.map(r=>holderRowEl(h,r))):null,
  rest.length?h('details',{class:'qp-holder-more','data-proof-section':'holders-top100'},h('summary',null,'Show top '+v.rows.length),h('ol',{class:'qp-holder-list'},rest.map(r=>holderRowEl(h,r)))):null,
  typeof extra==='function'?extra():null);
}
export function renderQProofHooks(h,value){
 const v=qproofHookView(value);if(!v)return null;
 return h('section',{class:'ta-proof-section qp-hooks','aria-label':'Pool hook'},h('h3',null,v.pools.length>1?'Pool hooks ('+v.pools.length+')':'Pool hook'),
  v.pools.map(p=>h('article',{class:'qp-hook is-'+p.level},
   h('div',{class:'qp-hook__id'},h('span',{class:'ta-proof-status is-'+(p.level==='watch'?'caution':p.level)},p.levelLabel),p.hookUrl?h('a',{href:p.hookUrl,target:'_blank',rel:'noopener noreferrer',title:p.hook},'Hook '+p.short):p.short?h('span',null,'Hook '+p.short):null,p.identity?h('small',null,p.identity):null),
   h('dl',{class:'qp-hook__answers'},p.answers.map(a=>h('div',{class:'qp-hook__answer'+(a.known?'':' is-unknown')},h('dt',null,a.label),h('dd',null,h('span',null,a.headline),a.evidence.length||a.detail?h('div',{class:'qp-hook__meta'},renderQProofEvidence(h,a.evidence,{max:1}),a.detail?h('details',{class:'ta-proof-more'},h('summary',null,'More'),h('p',null,a.detail)):null):null)))))),
  v.note?h('p',{class:'qp-holders__note'},v.note):null);
}
