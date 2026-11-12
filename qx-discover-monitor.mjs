// Change records and finalized Tape coverage retain their own source and observation time.
export const MONITORED_CHAINS = Object.freeze([
  {chainId:8453,name:'Base'}, {chainId:4663,name:'Robinhood Chain'},
  {chainId:1,name:'Ethereum'}, {chainId:42161,name:'Arbitrum One'}, {chainId:56,name:'BNB Chain'},
]);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const known=value=>value!==null&&value!==undefined&&value!=='';
const note=text=>`<p class="qd-note">${escapeHTML(text)}</p>`;
const chainName=id=>MONITORED_CHAINS.find(c=>c.chainId===Number(id))?.name||`Chain ${id}`;
const integer=value=>known(value)&&/^\d+$/.test(String(value))?Number(value):null;
function number(value){if(!known(value)||!Number.isFinite(Number(value)))return '';try{return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(typeof value==='bigint'?value:/^-?\d+$/.test(String(value))?BigInt(value):Number(value));}catch{return '';}}
const placeholder=value=>typeof value==='string'&&/^(?:not[ _-]?reported|unknown|undefined|null)$/i.test(value.trim());
const timeValue=value=>{if(!known(value)||placeholder(value))return null;const numeric=typeof value==='number'||/^\d+(?:\.\d+)?$/.test(String(value))?Number(value):null;const n=+new Date(numeric===null?value:numeric<1e12?numeric*1000:numeric);return Number.isFinite(n)&&n>0?n:null;};
export function monitorTime(value){
  const time=timeValue(value);if(time===null)return '';
  const date=new Date(time);
  return `${date.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})}, ${date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'})} UTC`;
}
const sourceLabel=source=>typeof source==='string'?(placeholder(source)?'':source):Array.isArray(source)?source.map(sourceLabel).filter(Boolean).join(', '):source&&typeof source==='object'?sourceLabel(source.label||source.name||source.used):'';
export function monitorSource(record={}){
  return [sourceLabel(record.source||record.sources),monitorTime(record.observedAt??record.observed_at??record.generatedAt),integer(record.block)!==null?`block ${number(record.block)}`:''].filter(Boolean).join(' · ');
}
const CHANGE_KINDS=Object.freeze({code:'Runtime code',owner:'Owner',implementation:'Implementation',admin:'Admin',lp_fee:'LP fee',new_pool:'New pool'});
function stableValue(value){
  if(value===null)return 'Not set';
  if(value===undefined||placeholder(value))return '';
  if(typeof value==='string'||typeof value==='number'||typeof value==='bigint'||typeof value==='boolean')return String(value);
  if(Array.isArray(value))return value.map(stableValue).filter(Boolean).join(', ');
  if(typeof value==='object')return Object.keys(value).sort().flatMap(key=>{const v=stableValue(value[key]);return v?[`${key}: ${v}`]:[];}).join(' · ');
  return '';
}
export function formatChange(change={}){
  return {kind:Object.hasOwn(CHANGE_KINDS,change.kind)?CHANGE_KINDS[change.kind]:'Change',before:stableValue(change.before),after:stableValue(change.after),
    block:integer(change.block)!==null?number(change.block):'',time:monitorTime(change.observedAt??change.observed_at??change.at),source:sourceLabel(change.source)};
}
function presentSlot(value){
  if(value&&typeof value==='object')return value.status!=='unavailable'&&presentSlot(value.address??value.value);
  return typeof value==='string'&&/^0x[\da-f]+$/i.test(value)&&!/^(?:0x)?0+$/i.test(value);
}
export function upgradeableLabel(record={}){
  for(const root of [record,record.evidence,record.monitoring,record.monitor,record.baseline].filter(Boolean)){
    const value=root.upgradeable;
    if(value===true||(value&&typeof value==='object'&&value.status!=='unavailable'&&(value.value===true||value.present===true||presentSlot(value.implementation)||presentSlot(value.admin))))return 'Upgradeable';
    if(presentSlot(root.implementation)||presentSlot(root.admin)||presentSlot(root.slots?.implementation)||presentSlot(root.slots?.admin))return 'Upgradeable';
  }
  return '';
}
export function changeCoverageText(body={}){
  const c=body.coverage;
  if(!c||typeof c!=='object')return '';
  if(c.status==='unavailable')return `Watched-set coverage could not be read${c.reason?` · ${c.reason}`:''}.`;
  const labels=[];
  const set=c.watchedSet??c.watched_set??c.scope??c.sources;
  if(typeof set==='string')labels.push(set);
  else if(Array.isArray(set))labels.push(set.map(v=>typeof v==='string'?v:v.label||v.name).filter(Boolean).join(', '));
  else if(set&&typeof set==='object'){
    if(set.browserWatchlists||set.onSiteWatchlists||set.watchlists)labels.push('on-site watchlists');
    if(set.telegramFollows||set.telegram)labels.push('Telegram follows');
    if(set.qhooksLaunchHooks||set.launchHooks||set.launches)labels.push('QHooks launch hooks');
    const top=set.topBoardHooks??set.topActivity;
    if(known(top))labels.push(`top ${number(top)} board hooks by activity on live chains`);
  }
  const summary=c.summary||c.description;
  if(!labels.length&&summary)labels.push(summary);
  const details=[];
  for(const [label,value]of [['hooks in the watched set',c.watchedHooks??c.hookCount??c.total],['checks this run',c.checkedHooks??c.checked],['checks per run at most',c.maxChecksPerRun??c.maxPerRun]])if(known(value))details.push(`${number(value)} ${label}`);
  const interval=c.minIntervalSeconds??c.checkIntervalSeconds;
  if(known(interval))details.push(`at least ${number(Number(interval)/60)} minutes between checks for a hook`);
  return labels.length||details.length?`Watched set: ${[labels.join(', '),...details].filter(Boolean).join(' · ')}.`:'';
}
const watchingSince=body=>body.watchingSince??body.watching_since??body.monitoring?.watchingSince??body.monitor?.watchingSince??body.coverage?.watchingSince;
function changeHookLink(change){
  const chain=change.chainId??change.chain,hook=typeof change.hook==='object'?change.hook.address:change.hook??change.address;
  if(!/^[1-9]\d*$/.test(String(chain))||!/^0x[\da-f]{40}$/i.test(hook||''))return '';
  const title=change.hookName??change.name??(typeof change.hook==='object'?change.hook.name:null)??`${String(hook).slice(0,8)}…${String(hook).slice(-6)}`;
  return `<a class="qd-change-hook" href="/discover-hook#${Number(chain)}:${hook.toLowerCase()}">${escapeHTML(title)}</a><span class="qd-note">${escapeHTML(chainName(chain))}</span>`;
}
function hookWatchButton(body,options){
  const chain=options.chainId??body.chainId??body.chain;
  const hook=options.hook??(typeof body.hook==='object'?body.hook.address:body.hook)??body.address;
  if(!/^[1-9]\d*$/.test(String(chain))||!/^0x[\da-f]{40}$/i.test(hook||''))return '';
  const watched=Boolean(options.watched);
  return `<button type="button" class="qd-button" data-star="${Number(chain)}_${hook.toLowerCase()}" aria-pressed="${watched}">${watched?'★ Watching':'☆ Watch hook'}</button>`;
}
export function renderChangeLog(body={}, options={}){
  const {recent=false}=options,source=monitorSource(body),sourceNote=source?note(source):'';
  if(body.status==='unavailable'||body.error)return `<div class="qd-monitor">${note(`Change records could not be read · ${body.reason||body.error||'read not completed'}`)}${sourceNote}</div>`;
  if(!Array.isArray(body.changes)&&!Array.isArray(body.events))return `<div class="qd-monitor">${note('Change records could not be read. Try again to read this hook’s watch status.')}${sourceNote}</div>`;
  const changes=Array.isArray(body.changes)?body.changes:body.events;
  const badge=upgradeableLabel(body),coverage=recent?changeCoverageText(body):'';
  const since=monitorTime(watchingSince(body));
  const watching=recent?'':since?note(`Watching since ${since}.${changes.length?'':' No changes seen.'}`):`<div class="qd-change-watch">${note('Not on the watch list yet. Watch this hook to add it.')}${hookWatchButton(body,options)}</div>`;
  const empty=!changes.length&&recent?note('No changes seen in the watched set.'):'';
  const events=changes.length?`<ol class="qd-changes${recent?' qd-changes-recent':''}">${changes.map(change=>{
    const f=formatChange(change),evidence=[f.block?`Block ${f.block}`:'',f.time,f.source].filter(Boolean).join(' · ');
    const values=f.before&&f.after?`<code>${escapeHTML(f.before)}</code><span aria-label="changed to"> → </span><code>${escapeHTML(f.after)}</code>`:f.before?`<code>${escapeHTML(f.before)}</code>`:f.after?`<code>${escapeHTML(f.after)}</code>`:'';
    return `<li class="qd-change"><div class="qd-change-heading">${recent?changeHookLink(change):''}<strong>${escapeHTML(f.kind)}</strong></div>${values?`<p class="qd-change-values">${values}</p>`:''}${evidence?note(evidence):''}</li>`;
  }).join('')}</ol>`:'';
  return `<div class="qd-monitor">${badge?'<span class="qd-status-chip qd-status-neutral">Upgradeable</span>':''}${coverage?note(coverage):''}${watching}${empty}${events}${sourceNote}</div>`;
}
export function createChangesState(){return {changes:[],nextCursor:null,seenCursors:[],loaded:false,body:{},paginationStopped:false};}
export function applyChangesPage(state,body,cursor=null){
  if(!body||body.status==='unavailable'||body.error||(!Array.isArray(body.changes)&&!Array.isArray(body.events)))throw new Error(body?.reason||body?.error||'Change records were not returned');
  const incoming=body.changes??body.events;
  const key=change=>change.id??[change.chainId??change.chain,change.hook,change.kind,change.block,change.observedAt??change.observed_at,stableValue(change.before),stableValue(change.after)].join('|');
  const seen=new Set(state.changes.map(key)),changes=[...state.changes];
  for(const change of incoming)if(!seen.has(key(change))){seen.add(key(change));changes.push(change);}
  const seenCursors=cursor===null?[...state.seenCursors]:[...state.seenCursors,cursor];
  const next=typeof body.nextCursor==='string'&&body.nextCursor?body.nextCursor:null;
  const paginationStopped=!!next&&(next===cursor||seenCursors.includes(next));
  return {changes,nextCursor:paginationStopped?null:next,seenCursors,loaded:true,body:{...state.body,...body},paginationStopped};
}
async function readChanges(path,fetcher,signal){
  const response=await fetcher(path,{headers:{accept:'application/json'},cache:'no-store',signal});
  const body=await response.json();
  if(!response.ok)throw new Error(body?.reason||body?.error||`HTTP ${response.status}`);
  return body;
}
function mountChanges(el,path,{recent=false,fetcher=globalThis.fetch,timeoutMs=12000,chainId,hook,watched=false}={}){
  if(!el||typeof el.querySelector!=='function')return null;
  loadMonitorStyle(el.ownerDocument);
  let state=createChangesState(),busy=false,destroyed=false,error='',failedCursor=null,activeRequest=null;
  function draw(){
    if(destroyed)return;
    el.innerHTML=`${state.loaded?renderChangeLog({...state.body,changes:state.changes},{recent,chainId,hook,watched}):note(busy?'Reading monitored changes…':'Change records could not be read.')}<p class="qd-note" role="status" aria-live="polite">${escapeHTML(error?`Could not read changes · ${error}.${state.loaded?' Saved records remain visible.':''}`:state.paginationStopped?'No new cursor was returned. Refresh to check for more changes.':busy?'Reading change records…':'')}</p><div class="qd-actions">${state.nextCursor?`<button class="qd-button" data-change-more type="button"${busy?' disabled':''}>Load more changes ↓</button>`:''}${error?`<button class="qd-button" data-change-retry type="button"${busy?' disabled':''}>Retry changes</button>`:''}</div>`;
    const more=el.querySelector('[data-change-more]'),retry=el.querySelector('[data-change-retry]');
    if(more)more.onclick=()=>void load(state.nextCursor);
    if(retry)retry.onclick=()=>void load(failedCursor);
  }
  async function load(cursor=null){
    if(busy||destroyed)return;
    busy=true;error='';draw();
    const request=new AbortController();activeRequest=request;
    let ceiling,onAbort;
    const ended=new Promise((_,reject)=>{
      onAbort=()=>reject(new Error('Change read cancelled'));
      request.signal.addEventListener('abort',onAbort,{once:true});
      ceiling=setTimeout(()=>{reject(new Error('Change read timed out'));request.abort();},Math.max(1,Math.min(12000,Number(timeoutMs)||12000)));
    });
    try{
      const query=new URLSearchParams({limit:recent?'6':'20'});if(cursor)query.set('cursor',cursor);
      const body=await Promise.race([readChanges(`${path}?${query}`,fetcher,request.signal),ended]);
      if(destroyed)return;
      state=applyChangesPage(state,body,cursor);
    }catch(cause){if(!destroyed){error=cause?.message||'The read did not finish';failedCursor=cursor;}}
    finally{clearTimeout(ceiling);request.signal.removeEventListener('abort',onAbort);if(activeRequest===request)activeRequest=null;busy=false;draw();}
  }
  const ready=load();
  return {ready,loadMore:()=>state.nextCursor?load(state.nextCursor):Promise.resolve(),retry:()=>load(failedCursor),destroy(){destroyed=true;activeRequest?.abort();},get state(){return state;}};
}
export function mountHookChanges(el,{chainId,hook,fetcher,timeoutMs,watched=false}={}){
  if(!/^[1-9]\d*$/.test(String(chainId))||!/^0x[\da-f]{40}$/i.test(hook||'')){if(el)el.innerHTML=note('A chain and full hook address are needed to read changes.');return null;}
  return mountChanges(el,`/api/v1/hooks/${Number(chainId)}/${hook.toLowerCase()}/changes`,{fetcher,timeoutMs,chainId,hook,watched});
}
export function mountRecentChanges(el,{fetcher,timeoutMs}={}){return mountChanges(el,'/api/v1/hooks/changes',{recent:true,fetcher,timeoutMs});}
const firstField=(...pairs)=>{for(const [record,key]of pairs)if(record&&Object.hasOwn(record,key))return {present:true,value:record[key]};return {present:false,value:undefined};};
const cursorFields=s=>{
  const c=s?.coverage||{},sw=s?.swapCoverage||{};
  return [
    {label:'Live cursor',...firstField([s,'liveThrough'],[c,'liveThrough'],[s,'liveCursor'])},
    {label:'Historical cursor',...firstField([s,'historicalThrough'],[c,'historicalThrough'],[s,'historicalCursor'])},
    {label:'Swap live cursor',...firstField([sw,'liveThrough'])},
  ];
};
const lastSuccess=s=>s?.lastSuccessAt??s?.scan?.lastSuccessAt;
const nowValue=value=>timeValue(value)??Date.now();
const age=(value,now)=>{const time=timeValue(value);return time===null?Infinity:Math.max(0,now-time);};
export function tapeFreshness(record={}, {now=Date.now()}={}){
  const reference=nowValue(now),scan=record.scan||{},success=lastSuccess(record);
  const runTimes=[record.lastCheckedAt,scan.lastCheckedAt,record.lastRunAt,scan.lastRunAt,record.checkedAt,scan.checkedAt,record.lastRun?.at,scan.lastRun?.at,record.lastFailureAt,scan.lastFailureAt,scan.lastFailure?.at,success].map(timeValue).filter(v=>v!==null);
  const lastRun=runTimes.length?Math.max(...runTimes):null,successAge=age(success,reference),runAge=lastRun===null?Infinity:Math.max(0,reference-lastRun);
  return {hasSuccess:timeValue(success)!==null,recentSuccess:successAge<30*60*1000,showSourceIssues:timeValue(success)===null||runAge>=15*60*1000,successAgeMs:successAge,lastRunAgeMs:runAge};
}
function issueReason(value){
  if(value===null||value===undefined||value===false||value==='')return '';
  const raw=typeof value==='object'?value.reason??value.code??value.error??value.status??stableValue(value):String(value);
  if(!known(raw)||placeholder(raw))return '';
  return String(raw).replace(/^(?:sqd|rpc|hypersync)[_ :.-]*/i,'').replace(/^http[_ :.-]*(\d{3})$/i,'$1').replace(/_/g,' ').toLowerCase();
}
export function sourceIssueText(record={}, options={}){
  if(!tapeFreshness(record,options).showSourceIssues)return '';
  const errors=record.sourceErrors??record.scan?.sourceErrors;
  if(!errors||typeof errors!=='object'||Array.isArray(errors))return '';
  const provider=key=>({sqd:'SQD',rpc:'RPC',hypersync:'HyperSync'}[String(key).toLowerCase()]||String(key).replace(/_/g,' '));
  const messages=Object.entries(errors).flatMap(([key,value])=>{const reason=issueReason(value);return reason?[`${provider(key)} ${reason}`]:[];});
  return messages.length?`Last source issue: ${messages.join(', ')}`:'';
}
export function tapeStatusRows(body={}, options={}){
  const input=Array.isArray(body.chains)?body.chains:body.chains&&typeof body.chains==='object'?Object.entries(body.chains).map(([chainId,row])=>({...row,chainId:row.chainId??Number(chainId)})):known(body.chainId)?[body]:[];
  return MONITORED_CHAINS.map(chain=>{
    const raw=input.find(row=>Number(row.chainId??row.source?.chainId)===chain.chainId);
    const scan=raw?.scan||{},coverage=raw?.coverage||{},lag=raw?.lag||coverage.lag||{},fresh=tapeFreshness(raw||{},options);
    const blocks=integer(lag.blocks??coverage.lagBlocks??raw?.lagBlocks),seconds=integer(lag.seconds??raw?.lagSeconds);
    const reported=raw?.status??scan.status,catching=Boolean(raw?.budgetHit??scan.budgetHit)||blocks!==null&&blocks>0||seconds!==null&&seconds>0;
    let status=['healthy','catching_up','initializing'].includes(reported)?reported:'initializing';
    if(reported==='degraded'||reported==='needs_attention')status=fresh.recentSuccess?(catching?'catching_up':'healthy'):'needs_attention';
    else if(!reported&&catching)status='catching_up';
    const states={healthy:{label:'Healthy',tone:'success'},catching_up:{label:'Catching up',tone:'neutral'},needs_attention:{label:'Needs attention',tone:'warning'},initializing:{label:'Initializing',tone:'neutral'}};
    const label=states[status];
    const cursors=cursorFields(raw),hasCursor=cursors.some(c=>integer(c.value)!==null);
    const notStarted=cursors.some(c=>c.present&&(c.value===null||known(c.value)&&Number.isFinite(Number(c.value))&&Number(c.value)<0))||(!fresh.hasSuccess&&!hasCursor);
    return {...chain,raw:raw||null,rawStatus:reported??null,status,label:label.label,tone:label.tone,lagBlocks:blocks,lagMinutes:seconds===null?null:seconds/60,notStarted,sourceIssue:sourceIssueText(raw||{},options)};
  });
}
export function renderTapeStatusCards(body={}, options={}){
  return tapeStatusRows(body,options).map(row=>{
    const {raw:s,chainId,name}=row,coverage=s?.coverage||{},scan=s?.scan||{},source=s?.source||{},swap=s?.swapCoverage||{};
    const facts=[];
    const add=(label,value,format=v=>v)=>{if(known(value)&&!placeholder(value)&&value!==-1&&value!=='-1')facts.push(`<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(format(value))}</dd></div>`);};
    const addNumber=(label,value,{positive=false,format=number}={})=>{const n=integer(value);if(n!==null&&(!positive||n>0))add(label,n,format);};
    addNumber('Lag',row.lagBlocks,{format:n=>`${number(n)} blocks`});
    if(row.lagMinutes!==null)add('Lag in minutes',row.lagMinutes,n=>`${number(n)} min`);
    const manager=source.managerAddress??s?.manager;if(/^0x[\da-f]{40}$/i.test(manager||'')&&!/^0x0{40}$/i.test(manager))add('Manager',manager);
    addNumber('Deployment block',source.deploymentBlock??s?.deploymentBlock,{positive:true});
    addNumber('Finalized head',coverage.finalizedBlock??s?.finalizedHead);
    for(const cursor of cursorFields(s))addNumber(cursor.label,cursor.value);
    addNumber('Swap lag',swap.lagBlocks,{format:n=>`${number(n)} blocks`});
    addNumber('Historical gap',coverage.gapBlocks,{format:n=>`${number(n)} blocks`});
    addNumber('Pools',s?.counts?.pools);addNumber('Swaps',s?.counts?.swaps);
    const used=s?.sourceUsed??scan.source??source.used??(typeof s?.source==='string'?s.source:null);if(typeof used==='string')add('Source used',used);
    const success=monitorTime(lastSuccess(s));if(success)add('Last success',success);
    const time=s?.observedAt??s?.generatedAt??body.observedAt??body.generatedAt;
    const sourceText=monitorSource({source:'QHooks Tape',observedAt:time});
    return `<article class="qd-panel qd-monitor qd-tape-status" data-tape-chain="${chainId}"><div class="qd-tape-status-heading"><h2>${escapeHTML(name)}</h2><span class="qd-status-chip qd-status-${row.tone}" data-tape-status="${row.status}">${escapeHTML(row.label)}</span></div>${note('Finalized only · official Uniswap v4 PoolManager logs')}<dl class="qd-facts">${facts.join('')}</dl>${row.notStarted?'<p class="qd-note qd-tape-pending">Not started yet</p>':''}${row.status==='catching_up'?note('The Tape is reading more finalized blocks.'):''}${row.sourceIssue?`<p class="qd-note qd-source-issue">${escapeHTML(row.sourceIssue)}</p>`:''}${sourceText?note(sourceText):''}</article>`;
  }).join('');
}
export function loadMonitorStyle(doc=globalThis.document){
  if(!doc?.head||doc.querySelector('link[data-qhooks-monitor-style]'))return;
  const style=doc.createElement('link');style.rel='stylesheet';style.href=new URL('./qx-discover-monitor.css',import.meta.url).href;style.dataset.qhooksMonitorStyle='';doc.head.append(style);
}
