// Read-only reports plus an explicit, bounded check request. No wallet/provider
// access, signing or trading authority. RepoProof checks on its own schedule; while it
// refreshes, this panel re-reads the stored report a few times (reads only, never a scan).
const EVM=/^0x[0-9a-f]{40}$/i,SOL=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CHAINS=new Set(['1','8453','42161','56','4663','99901','solana']),KINDS=new Set(['token','wallet','launch','contract']);
const STATES=new Set(['ready','refreshing','not_checked','unavailable','busy','rate_limited']);
const REREAD_MS=20000,REREADS=9;
const CHAIN_NAMES={'1':'Ethereum','8453':'Base','42161':'Arbitrum','56':'BNB Chain','4663':'Robinhood','99901':'Elysium','solana':'Solana'};
const scalar=v=>v==null?'Unknown':typeof v==='boolean'?(v?'Yes · reported':'No · reported'):typeof v==='number'&&!Number.isFinite(v)?'Unknown':String(v);
const label=v=>String(v).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,c=>c.toUpperCase());
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const time=v=>stamp(v)===null?'Not reported':new Date(stamp(v)).toISOString().slice(0,19).replace('T',' ')+' UTC';
const knownCount=v=>Number.isSafeInteger(v)&&v>=0?String(v):'Not reported';
let widgetId=0;
export function repoProofSubject(raw){
 if(!raw||typeof raw!=='object')return null;
 const kind=String(raw.kind||''),chainId=String(raw.chainId||''),address=chainId==='solana'?String(raw.address||''):String(raw.address||'').toLowerCase();
 if(!KINDS.has(kind)||!CHAINS.has(chainId)||kind==='launch'&&chainId==='solana'||!(chainId==='solana'?SOL.test(address):EVM.test(address)&&BigInt(address)!==0n))return null;
 return Object.freeze({kind,chainId,address,...(raw.revision!==undefined?{revision:raw.revision}:{})});
}
const key=s=>s?s.kind+':'+s.chainId+':'+s.address:null;
export function sameRepoProofSubject(a,b,{revision=true}={}){const x=repoProofSubject(a),y=repoProofSubject(b);return !!x&&!!y&&key(x)===key(y)&&(!revision||x.revision===y.revision);}
export function repoProofSellEvidence(report){
 const simulation=report?.observations?.simulation;
 if(!simulation||typeof simulation!=='object')return{headline:'No measured sell probe reported',detail:'Sell-route observations, when returned, are listed with their checks. An overall report level does not establish sell execution.'};
 const headlines={sold:'Probe recorded a sell','sell-reverted':'Sell probe reverted','buy-reverted':'Buy probe reverted · sell not measured','no-liquidity':'No liquidity in probe · sell not measured','buy-empty':'Buy probe returned no tokens · sell not measured','v3-short':'Sell probe arrived short · pool refused sale'};
 const block=simulation.block==null?'Block not reported':'Block '+scalar(simulation.block);
 return{headline:headlines[simulation.outcome]||'Sell probe outcome is unknown',detail:'eth_call probe · '+block+(simulation.venue?' · '+scalar(simulation.venue):'')+'. This snapshot does not establish current sell execution or execution for your order size.'};
}
const reportURL=raw=>{try{const url=new URL(raw);return url.protocol==='https:'&&url.hostname==='repoproof.online'&&!url.port&&!url.username&&!url.password&&/^\/proof\/[a-zA-Z0-9_-]{1,160}$/.test(url.pathname)&&!url.search&&!url.hash?url.href:null;}catch{return null;}};
export function mountRepoProofCheck(container,{subject,getSubject=()=>subject,onReport=()=>{},document:doc=container?.ownerDocument||globalThis.document,fetcher=(...args)=>globalThis.fetch(...args)}={}){
 const target=repoProofSubject(subject);if(!target||!container?.replaceChildren||!doc?.createElement)throw TypeError('Supply an exact supported QProof subject and report container.');
 const h=(tag,attrs={},...children)=>{const node=doc.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')node.className=v;else if(k.startsWith('on'))node.addEventListener(k.slice(2),v);else if(k in node)node[k]=v;else node.setAttribute(k,v);}node.append(...children.flat().filter(v=>v!==null&&v!==undefined&&v!==false));return node;};
 if(doc.head&&!doc.getElementById('qpr-styles'))doc.head.append(h('link',{id:'qpr-styles',rel:'stylesheet',href:'/qx-repoproof.css'}));
 const id='qpr-'+(++widgetId),status=h('p',{class:'qpr-status',role:'status','aria-live':'polite'}),reportHost=h('div',{class:'qpr-report'}),badge=h('span',{class:'qpr-state'},'Reading cache');
 const check=h('button',{type:'button',class:'qpr-check'},'Check with QProof'),refresh=h('button',{type:'button',class:'qpr-refresh'},'Refresh cached report');
 check.setAttribute('aria-describedby',id+'-privacy');
 const privacy=h('p',{class:'qpr-privacy',id:id+'-privacy'},'This check sends the displayed public address and chain to our proof service, QProof (repoproof.online).');
 const identity=h('p',{class:'qpr-identity'},h('span',{},CHAIN_NAMES[target.chainId]+' · '+label(target.kind)),h('code',{},target.address));
 const element=h('section',{class:'qpr','aria-label':'QProof report'},h('div',{class:'qpr-head'},h('h3',{},'QProof'),badge),identity,h('div',{class:'qpr-actions'},check,refresh),privacy,status,reportHost);
 // Keep native report-control activation inside this component. In a terminal,
 // an outer Enter shortcut must not submit a trade while evidence has focus.
 element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();});
 container.replaceChildren(element);
 let disposed=false,revision=0,controller=null,pending=false,envelope=null,issue=null,retryTime=null,retryTimer=null,requestTimer=null,rereadTimer=null,rereads=0;
 const active=()=>!disposed&&sameRepoProofSubject(target,getSubject());
 const current=()=>{try{return active();}catch{return false;}};
 function loseContext(){revision++;controller?.abort();clearTimeout(requestTimer);requestTimer=null;pending=false;envelope=null;issue='Selection changed. Reopen this report for the current asset.';reportHost.replaceChildren();paintStatus();}
 function paintStatus(){
  clearTimeout(retryTimer);retryTimer=null;
  const alive=current(),blocked=envelope?.state==='busy'||envelope?.state==='rate_limited',waiting=retryTime!==null&&Date.now()<retryTime||blocked&&retryTime===null;
  check.disabled=!alive||pending||waiting;refresh.disabled=!alive||pending;
  check.textContent=pending?'Reading…':envelope?.report?'Run another check':'Check with QProof';
  const texts={ready:'Report available',refreshing:'Refreshing…',not_checked:'Refreshing…',unavailable:'Refreshing…',busy:'Check in progress',rate_limited:'Check limit reached'};
  badge.textContent=issue?'Refreshing…':pending?'Reading…':envelope?.stale&&envelope?.state==='ready'?'Refreshing…':texts[envelope?.state]||'Reading cache';
  badge.className='qpr-state'+(envelope?.stale?' qpr-stale':'');
  status.textContent=!alive?'Selection changed. Reopen this report for the current asset.':issue?issue:pending?'Reading the selected asset only…':['not_checked','refreshing'].includes(envelope?.state)?(envelope.report?'Refreshing… QProof is rechecking this. The report below is from its last check.':'Refreshing… QProof is checking this now. This panel updates by itself.'):envelope?.state==='busy'?'A check is already in progress. Refresh the cached report to read its result.':envelope?.state==='rate_limited'?'The check limit was reached. Refreshing the cache does not request a scan.':envelope?.state==='unavailable'?'Refreshing… QProof is checking this. This panel updates by itself.':envelope?.stale?'Refreshing… The report below is from QProof’s last check.':'Observations are scoped to this report and its snapshot.';
  if(retryTime!==null&&Date.now()<retryTime){status.textContent+=' Retry after '+time(new Date(retryTime).toISOString())+'.';retryTimer=setTimeout(paintStatus,Math.min(2147483647,retryTime-Date.now()+20));}
 }
 function fields(value,depth=0){
  if(value===null||typeof value!=='object')return h('span',{},scalar(value));
  const entries=Array.isArray(value)?value.map((v,i)=>[String(i+1),v]):Object.entries(value);
  if(!entries.length)return h('span',{class:'qpr-unknown'},Array.isArray(value)?'None returned':'No fields returned');
  if(depth>=12)return h('pre',{class:'qpr-raw'},JSON.stringify(value,null,2));
  return h('dl',{class:'qpr-fields'},...entries.map(([name,v])=>h('div',{},h('dt',{},label(name)),h('dd',{},fields(v,depth+1)))));
 }
 function disclosure(name,title,body,open=false){return h('details',{'data-qpr-detail':name,open},h('summary',{},title),h('div',{class:'qpr-disclosure-body'},body));}
 function paintReport(){
  const report=envelope?.report;if(!report||typeof report!=='object'){reportHost.replaceChildren();return;}
  const prior=new Map([...reportHost.querySelectorAll('details')].map(node=>[node.getAttribute('data-qpr-detail'),node.open]));
  const counts=report.counts||{},coverage=report.coverage||{},checks=Array.isArray(report.checks)?report.checks:[],receipts=Array.isArray(report.receipts)?report.receipts:[];
  const strongest=report.level==='danger'||checks.some(c=>c?.status==='danger')?'danger':report.level==='caution'||checks.some(c=>c?.status==='caution')?'caution':report.level;
  const link=reportURL(report.url),sell=repoProofSellEvidence(report),level={danger:'Danger signals reported',caution:'Caution signals reported',clear:'No flags in returned checks',unknown:'Unknown coverage'}[strongest]||'Unknown coverage';
  const source=h('div',{class:'qpr-report-overview'},h('p',{class:'qpr-cache-state'},envelope.cached?'Cached report':'Returned check report',envelope.stale||envelope.state==='refreshing'?' · Refreshing':''),h('p',{class:'qpr-level '+(strongest==='danger'?'danger':strongest==='caution'?'caution':'neutral')},level),
   report.headline?h('p',{class:'qpr-headline'},h('span',{},'QProof summary: '),String(report.headline)):null,
   h('p',{class:'qpr-counts'},'Reported checks · Danger '+knownCount(counts.danger)+' · Caution '+knownCount(counts.caution)+' · Clear '+knownCount(counts.clear)+' · Unknown '+knownCount(counts.unknown)),
   h('p',{class:'qpr-coverage'},coverage.complete===true?'Complete reported coverage for this snapshot':coverage.complete===false?'Partial reported coverage':'Coverage completeness not reported',
    ' · Checked '+knownCount(coverage.checked)+' · Unknown '+knownCount(coverage.unknown)),
   h('dl',{class:'qpr-meta'},h('div',{},h('dt',{},'Provider retrieval'),h('dd',{},time(report.retrievedAt))),h('div',{},h('dt',{},'Report completed'),h('dd',{},time(report.completedAt))),h('div',{},h('dt',{},'Evidence as of'),h('dd',{},time(envelope.checkedAt)))),
   report.snapshot?fields({snapshot:report.snapshot}):h('p',{class:'qpr-unknown'},'Snapshot chain/block/slot not reported.'),
   link?h('a',{class:'qpr-report-link',href:link,target:'_blank',rel:'noopener noreferrer'},'Open full QProof report ↗'):h('p',{class:'qpr-unknown'},'Report link not available.'));
  const sellNode=target.kind==='token'||target.kind==='launch'||report.observations?.simulation?h('div',{class:'qpr-sell'},h('h4',{},'Sell evidence'),h('b',{},sell.headline),h('p',{},sell.detail)):null;
  const receiptIds=new Map(receipts.filter(r=>Number.isSafeInteger(r?.index)&&r.index>=0).map(r=>[r.index,id+'-receipt-'+r.index]));
  const rows=checks.map((c,i)=>{const status=['danger','caution','clear','unknown','info'].includes(c?.status)?c.status:'unknown',evidence=Array.isArray(c?.evidence)?c.evidence:[];
   return disclosure('check-'+i,h('span',{class:'qpr-check-title'},h('span',{class:'qpr-check-status '+status},label(status)),h('b',{},String(c?.title||'Untitled check'))),h('div',{},
    c?.category?h('p',{class:'qpr-category'},'Category: '+String(c.category)):null,h('p',{class:'qpr-detail'},typeof c?.detail==='string'&&c.detail?c.detail:'No further detail returned.'),
    c?.data&&typeof c.data==='object'&&!Array.isArray(c.data)&&Object.keys(c.data).length?disclosure('check-fields-'+i,'Returned check fields',fields(c.data)):null,
    h('div',{class:'qpr-evidence'},'Evidence: ',evidence.length?evidence.map(index=>receiptIds.has(index)?h('button',{type:'button',class:'qpr-source-link',onclick:()=>{receiptNode.open=true;const receipt=doc.getElementById(receiptIds.get(index));receipt?.scrollIntoView({block:'nearest'});receipt?.focus({preventScroll:true});}},'Receipt '+index):h('span',{},'Receipt '+scalar(index)+' not returned')):h('span',{},'No receipt pointer returned.'))),status==='danger'||status==='caution');});
  const checklist=h('div',{class:'qpr-checks'},h('h4',{},'All returned checks · '+checks.length),rows.length?rows:h('p',{class:'qpr-unknown'},'No check details returned.'));
  const observation=disclosure('observations','Authority, liquidity, creator & other observations',report.observations?fields(report.observations):h('p',{class:'qpr-unknown'},'No observations returned.'));
  const subjectNode=disclosure('subject','Report target & input',fields({...(report.subject?{reportedSubject:report.subject}:{}),...(report.input?{reportedInput:report.input}:{}),requested:{kind:target.kind,chainId:target.chainId,address:target.address}}));
  const receiptNode=disclosure('receipts','Source receipts · '+receipts.length,receipts.length?receipts.map((receipt,i)=>h('article',{class:'qpr-receipt',tabIndex:-1,id:receiptIds.get(receipt?.index)||id+'-receipt-row-'+i},h('h5',{},'Receipt '+(receipt.index??i)),fields(receipt))):h('p',{class:'qpr-unknown'},'No source receipts returned.'));
  reportHost.replaceChildren(...[source,sellNode,checklist,observation,subjectNode,receiptNode].filter(Boolean));
  for(const node of reportHost.querySelectorAll('details'))if(prior.has(node.getAttribute('data-qpr-detail')))node.open=prior.get(node.getAttribute('data-qpr-detail'));
 }
 function retryAfter(response,body){
  const value=response.headers?.get?.('Retry-After'),seconds=value&&/^\d+$/.test(value)?Number(value):null,header=seconds!==null?Date.now()+seconds*1000:stamp(value),reported=stamp(body?.retryAt);
  const times=[header,reported].filter(v=>Number.isFinite(v)&&Number.isFinite(new Date(v).getTime())&&v>Date.now());return times.length?Math.max(...times):null;
 }
 async function request(method){
  if(disposed||pending)return false;if(!current()){loseContext();return false;}
  if(method==='POST'&&(retryTime!==null&&Date.now()<retryTime||retryTime===null&&(envelope?.state==='busy'||envelope?.state==='rate_limited'))){paintStatus();return false;}
  const mine=++revision;controller?.abort();clearTimeout(requestTimer);controller=new AbortController();pending=true;issue=null;paintStatus();
  const requestController=controller,signal=requestController.signal,timer=setTimeout(()=>requestController.abort(),method==='POST'?60000:10000),data={kind:target.kind,chainId:target.chainId,address:target.address};
  requestTimer=timer;
  try{
   const response=await fetcher('/api/repoproof/check'+(method==='GET'?'?'+new URLSearchParams(data):''),{method,cache:'no-store',signal,...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{})});
   if(disposed||mine!==revision)return false;if(!current()){loseContext();return false;}
   const body=await response.json();if(disposed||mine!==revision)return false;if(!current()){loseContext();return false;}
   if(body?.version!==1||!sameRepoProofSubject(target,body.subject,{revision:false})||!STATES.has(body.state))throw Error('The report response did not match this asset. Refresh the cached report to retry.');
   if(!response.ok&&!['busy','rate_limited','unavailable'].includes(body.state))throw Error('The report request could not complete. Refresh the cached report to retry.');
   envelope=structuredClone(body);scheduleReread();const nextRetry=retryAfter(response,body),remaining=retryTime!==null&&retryTime>Date.now()?retryTime:null;retryTime=nextRetry===null?remaining:remaining===null?nextRetry:Math.max(remaining,nextRetry);paintReport();try{onReport(structuredClone(envelope));}catch{}return true;
  }catch(error){if(disposed||mine!==revision)return false;if(!current()){loseContext();return false;}if(envelope?.report)envelope={...envelope,stale:true};scheduleReread(true);issue=method==='GET'?'Refreshing… QProof is checking this. This panel updates by itself.':error?.name==='AbortError'?'The report response took too long. Refresh the cached report before requesting another check.':error?.message||'The report could not be read. Refresh the cache to retry.';return false;}
  finally{clearTimeout(timer);if(requestTimer===timer)requestTimer=null;if(!disposed&&mine===revision){pending=false;paintStatus();}}
 }
 // While RepoProof refreshes (or a read failed), re-read the stored report a bounded number of times.
 function scheduleReread(failed=false){
  clearTimeout(rereadTimer);rereadTimer=null;
  const waiting=failed||['refreshing','not_checked','unavailable'].includes(envelope?.state)||envelope?.stale;
  if(!waiting){rereads=0;return;}if(rereads>=REREADS||disposed)return;
  rereads++;rereadTimer=setTimeout(()=>{rereadTimer=null;if(!disposed&&current())void request('GET');},REREAD_MS);
 }
 check.addEventListener('click',()=>request('POST'));refresh.addEventListener('click',()=>request('GET'));
 const view=Object.freeze({element,refreshCache:()=>request('GET'),dispose(){if(disposed)return;disposed=true;revision++;controller?.abort();clearTimeout(requestTimer);clearTimeout(retryTimer);clearTimeout(rereadTimer);if(element.parentNode===container)element.remove();}});
 void view.refreshCache();return view;
}

// Selected-terminal adapter: native reports bind to the controller, outside
// token reports bind to the token itself. Same-selection market polls do not scan
// or reread. The terminal calls sync only after selection intent is admitted.
export function terminalRepoProofSubject(selection){
 if(!selection||!['launch','external'].includes(selection.kind))return null;
 return repoProofSubject({kind:selection.kind==='launch'?'launch':'token',chainId:selection.chainId,address:selection.kind==='launch'?selection.controller:selection.token,revision:selection.revision});
}
export function mountSelectedRepoProof(container,{getSelection,...options}){
 let view=null,selected=null;
 const clear=()=>{view?.dispose();view=null;selected=null;container.hidden=true;};
 return Object.freeze({
  sync(){const next=terminalRepoProofSubject(getSelection());if(!next){clear();return false;}if(selected&&sameRepoProofSubject(selected,next))return true;clear();container.hidden=false;selected=next;view=mountRepoProofCheck(container,{...options,subject:next,getSubject:()=>terminalRepoProofSubject(getSelection())});return true;},
  clear,dispose:clear,
 });
}
