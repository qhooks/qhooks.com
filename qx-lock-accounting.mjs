import {acceptAccounting} from './qx-lock-accounting-core.mjs';
import {createLockAccountingRead} from './qx-lock-accounting-read.mjs';
const root=document.querySelector('[data-lock-accounting]');
const names=['Operations & hiring treasury','Builder fund','Treasury reserve','Marketing','Community rewards'];
const exactAmount=raw=>{const n=BigInt(raw),whole=(n/10n**18n).toLocaleString('en-US'),fraction=(n%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');return whole+(fraction?'.'+fraction:'');};
const displayAmount=raw=>{const n=BigInt(raw),unit=10n**18n,scale=n>=1000000n*unit?1000000n*unit:n>=1000n*unit?1000n*unit:unit,suffix=scale===unit?'':scale===1000n*unit?'K':'M';if(n>0n&&n<unit/10000n)return '<0.0001';const fraction=(n%scale*10000n/scale).toString().padStart(4,'0').replace(/0+$/,'');return (n%(scale/10000n)?'≈':'')+String(n/scale)+(fraction?'.'+fraction:'')+suffix;};
const utc=seconds=>new Date(seconds*1000).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC';
function el(tag,attrs={},...children){const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);n.append(...children.filter(x=>x!==null));return n;}
const number=raw=>el('span',{'class':'qlive-number',title:exactAmount(raw)+' QHOOKS','aria-label':exactAmount(raw)+' QHOOKS'},displayAmount(raw));
const fact=(label,raw)=>el('div',{},el('dt',{},label),el('dd',{},number(raw)));
function notice(n){
 if(n.status==='none')return 'No withdrawal announced.';
 if(n.status==='expired')return 'Notice expired · '+displayAmount(n.announced)+' QHOOKS announced.';
 if(n.status==='notice')return 'Notice until '+utc(n.readyAt)+' · '+displayAmount(n.announced)+' QHOOKS announced.';
 return 'Notice ready · up to '+displayAmount(n.withdrawable)+' QHOOKS currently available · window ends '+utc(n.expiresAt)+'.';
}
if(root){
 const button=root.querySelector('[data-lock-refresh]'),status=root.querySelector('[data-lock-status]'),body=root.querySelector('[data-lock-body]'),reader=createLockAccountingRead();let state=null,busy=false;
 function render(){
  if(!state?.model){body.replaceChildren(el('p',{'class':'qlive-empty'},'Current lock amounts are unavailable. Use Refresh to retry.'));return;}
  const m=state.model,t=m.totals;
  const cards=el('dl',{'class':'qlive-totals'},fact('Held in locks #0–4',t.held),fact('Still time-locked',t.timeLocked),fact('Vested, unclaimed',t.vestedUnclaimed),fact('Withdrawn from locks',t.claimed));
  const rows=el('div',{'class':'qlive-rows'},...m.rows.map(r=>el('article',{'class':'qlive-row','data-lock-id':r.id},
   el('div',{'class':'qlive-row-head'},el('h3',{},names[r.id]),el('span',{'class':'qlive-id'},'Lock #'+r.id)),
   el('p',{'class':'qlive-beneficiary'},'Beneficiary ',el('code',{},r.beneficiary)),
   el('dl',{'class':'qlive-facts'},fact('Held',r.held),fact('Still time-locked',r.timeLocked),fact('Vested, unclaimed',r.vestedUnclaimed),fact('Withdrawn',r.claimed)),
   el('p',{'class':'qlive-schedule'},'Vesting starts '+utc(r.dripStartsAt)+' · completes '+utc(r.dripEndsAt)),
   el('p',{'class':'qlive-notice','data-notice':r.notice.status},notice(r.notice)),
  )));
  const details=el('details',{'class':'qlive-details'},el('summary',{},'Snapshot and contract totals'),
   el('dl',{'class':'qlive-source'},el('div',{},el('dt',{},'Block'),el('dd',{},m.block.number+' · '+utc(m.block.timestamp))),el('div',{},el('dt',{},'Block hash'),el('dd',{},el('code',{},m.block.hash))),
    el('div',{},el('dt',{},'Read completed'),el('dd',{},m.readAt?utc(Math.floor(m.readAt/1000)):'Unknown')),el('div',{},el('dt',{},'Other QHOOKS V1 locks'),el('dd',{},String(m.additionalLockCount))),el('div',{},el('dt',{},'All QHOOKS held under QLocks'),el('dd',{},number(m.tokenSummary.held))),el('div',{},el('dt',{},'Unassigned contract balance'),el('dd',{},number(m.unassignedBalance)))));
  body.replaceChildren(cards,el('p',{'class':'qlive-equation'},'Held = still time-locked + vested, unclaimed. Withdrawals remain subject to each lock’s public notice.'),rows,
   el('p',{'class':'qlive-footnote'},'These five lock deposits exclude the 10M marketing allocation sent directly to the Safe at launch. The chart above shows the published schedule, separately from these block-pinned balances.'),details);
 }
 async function refresh(){
  if(busy)return;busy=true;button.disabled=true;root.setAttribute('aria-busy','true');status.textContent=state?.model?'Refreshing the current block…':'Reading current lock balances…';
  try{state=acceptAccounting(state,{data:await reader.read()});}catch{state=acceptAccounting(state,{error:'read unavailable'});}
  render();
  if(state.model){const m=state.model;status.textContent=(state.stale?'Refresh failed. Last successful snapshot: ':'As of ')+utc(m.block.timestamp)+' · block '+m.block.number+(state.stale?'. Values have not advanced.':'.');}
  else status.textContent='Current lock balances are unavailable. Refresh to retry.';
  status.dataset.state=state.state;root.setAttribute('aria-busy','false');button.disabled=false;busy=false;
 }
 button.addEventListener('click',refresh);void refresh();
}
