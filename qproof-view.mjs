// Display only: the server owns risk, required checks and the verdict policy.
const LEVELS=new Set(['danger','watch','clear','incomplete']);
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const pct=v=>finite(v)!==null&&v<=100?v:null;
const text=(v,max=500)=>typeof v==='string'?v.slice(0,max):'';
const emptyNumbers=()=>Object.fromEntries(['buyTaxPct','sellTaxPct','buyChargePct','sellChargePct','poolFeePct','sellable','roundTripReturnPct','lpLockedPct','lpUnlockAt','top10Pct','creatorPct','holders'].map(k=>[k,null]));
export function ensureQProofStyles(doc=globalThis.document){if(doc?.head&&!doc.getElementById('qproof-view-styles')){const link=doc.createElement('link');link.id='qproof-view-styles';link.rel='stylesheet';link.href='/qproof-view.css';doc.head.append(link);}}
export function readQProofPresentation(value){
 const report=value?.report??value??null,source=value?.presentationVersion===2?value:report?.presentationVersion===2?report:null,v=source?.verdict;
 if(!source||!v||!LEVELS.has(v.level)||!text(v.label,80))return{ready:false,report,verdict:{level:'incomplete',label:'Not fully checked',reason:'The latest verdict is not available yet.',flags:[],counts:{}},freshness:{checkedAt:null,ageSec:null,block:null,slot:null,stale:true},keyNumbers:emptyNumbers(),checks:[],notChecked:[],links:{}};
 const raw=source.keyNumbers??report?.keyNumbers??{},numbers=emptyNumbers();
 for(const k of ['buyTaxPct','sellTaxPct','buyChargePct','sellChargePct','poolFeePct','lpLockedPct','top10Pct','creatorPct'])numbers[k]=pct(raw[k]);
 numbers.roundTripReturnPct=finite(raw.roundTripReturnPct);numbers.sellable=typeof raw.sellable==='boolean'?raw.sellable:null;
 numbers.holders=Number.isSafeInteger(raw.holders)&&raw.holders>=0?raw.holders:null;
 numbers.lpUnlockAt=typeof raw.lpUnlockAt==='string'&&Number.isFinite(Date.parse(raw.lpUnlockAt))?raw.lpUnlockAt:null;
 return{ready:true,presentationVersion:2,report,verdict:{...v,label:text(v.label,80),reason:text(v.reason),flags:Array.isArray(v.flags)?v.flags:[],counts:v.counts??{}},freshness:source.freshness??report?.freshness??{},keyNumbers:numbers,checks:Array.isArray(report?.checks)?report.checks:[],notChecked:Array.isArray(source.notChecked)?source.notChecked:report?.notChecked??[],links:source.links??report?.links??{}};
}
export function qproofAgeLabel(freshness,now=Date.now()){
 const at=Date.parse(freshness?.checkedAt);if(!Number.isFinite(at)||at>now+10000)return'Check time not reported';
 const age=Math.max(0,Math.floor((now-at)/1000)),unit=age<60?'just now':age<3600?Math.floor(age/60)+' min ago':age<86400?Math.floor(age/3600)+' h ago':Math.floor(age/86400)+' days ago';
 const block=Number.isSafeInteger(freshness.block)&&freshness.block>0?' · block '+freshness.block.toLocaleString('en-US'):Number.isSafeInteger(freshness.slot)&&freshness.slot>0?' · slot '+freshness.slot.toLocaleString('en-US'):'';
 return'Checked '+unit+block;
}
// Compatibility for existing execution guards; this maps the server enum only.
export function qproofGuardLevel(value){const p=readQProofPresentation(value);return p.ready?({danger:'danger',watch:'caution',clear:'clear',incomplete:'unknown'})[p.verdict.level]:null;}
export function qproofReadParams(search=globalThis.location?.search||''){const q=new URLSearchParams(search);if(!q.has('cached_only'))return{};return{cached_only:q.getAll('cached_only').length===1&&q.get('cached_only')==='1'?'1':'invalid'};}
export function qproofReportLocation(path,search=globalThis.location?.search||''){const mode=qproofReadParams(search);return path+(mode.cached_only?'?'+new URLSearchParams(mode):'');}
const percent=v=>v===null?'Not reported':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)+'%';
export function qproofNumberCells(numbers={}){
 const n={...emptyNumbers(),...numbers},buy=n.buyChargePct!==null,sell=n.sellChargePct!==null;
 return[
  {label:buy?'Buy charge':'Buy tax',value:percent(buy?n.buyChargePct:n.buyTaxPct),detail:buy&&n.buyTaxPct>0?'Plus '+percent(n.buyTaxPct)+' token tax':null},
  {label:sell?'Sell charge':'Sell tax',value:percent(sell?n.sellChargePct:n.sellTaxPct),detail:sell&&n.sellTaxPct>0?'Plus '+percent(n.sellTaxPct)+' token tax':null},
  {label:'Sell test',value:n.sellable===true?'Sold':n.sellable===false?'Failed':'Not checked',detail:n.roundTripReturnPct!==null?percent(n.roundTripReturnPct)+' returned':null},
  {label:'LP locked',value:percent(n.lpLockedPct),detail:n.lpUnlockAt?'Until '+new Date(n.lpUnlockAt).toISOString().slice(0,10):null},
  {label:'Top 10',value:percent(n.top10Pct),detail:null},
  {label:'Creator',value:percent(n.creatorPct),detail:null}
 ];
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
  h('p',{class:'qp-verdict-age'},qproofAgeLabel(p.freshness)));
 const strip=h('dl',{class:'qp-key-strip'},qproofNumberCells(p.keyNumbers).map(c=>h('div',{class:'qp-key-cell'},h('dt',null,c.label),h('dd',null,c.value),c.detail?h('small',null,c.detail):null)));
 const fee=p.keyNumbers.poolFeePct===null?null:h('p',{class:'qp-fee-note'},'Pool fee '+percent(p.keyNumbers.poolFeePct)+' per swap, separate from token tax and launch charges.');
 return{presentation:p,bar,strip,fee};
}

