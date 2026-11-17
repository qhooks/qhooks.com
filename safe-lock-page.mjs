import {getWalletHub}from'./wallet-hub-fresh.mjs';
import {createSafeReader,OWNERS,executionConfirmed}from'./safe-lock-safe-reader.mjs';
import {C,utc,openAt,endAt}from'./safe-lock-core.mjs';
import {createOperationRead,proposalIdentity,readProposalHint,sharedProposalLink,walletAction}from'./safe-lock-read.mjs';
import {prepareOwnerAction}from'./safe-lock-action.mjs';
export const tokenAmount=n=>{const s=BigInt(n).toString().padStart(19,'0'),whole=s.slice(0,-18).replace(/\B(?=(\d{3})+(?!\d))/g,','),fraction=s.slice(-18,-12).replace(/0+$/,'');return whole+(fraction?'.'+fraction:'');};
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)e.setAttribute(k,String(v));e.append(...kids.flat().filter(x=>x!=null));return e;};
export function createSafeLockPage({root,kind,hub,reader,read,href=()=>location.href}){
 let state=null,review=null,linkError='',error='',status='',reading=false,busy=false,pending=null,complete=null,disposed=false;
 try{const q=readProposalHint(new URL(href()).search);if(q)review=[kind,String(q.nonce),q.hash,q.stateHash].join(':');}catch(e){linkError=e.message;}
 const changed=()=>!!state?.tx&&(!!linkError||review!==proposalIdentity(state));
 function accept(){if(!state?.tx||!state.hash)return;review=proposalIdentity(state);linkError='';history.replaceState(null,'',sharedProposalLink(href(),state));}
 function render(){
  if(disposed)return;const s=state,c=hub.snapshot().current,owner=c?.owner?.toLowerCase(),isA=kind==='treasury',stale=s&&Date.now()-s.readAt>45000;
  let action=null;if(!error&&!changed()&&!stale)try{action=walletAction(s,c,review);}catch{}
  let label='Reading on-chain state…',reason='The page checks chain, contract code, lock state, Safe owners, threshold, nonce and approvals.';
  if(error){label='State unavailable';reason=error+' Wallet actions are disabled.';}
  else if(s){reason=s.blockedReason||s.reason;if(s.done)label='Cliff already extended';else if(changed()){label='Proposal changed — review first';reason=linkError||'The nonce, hash or lock state changed. Review the exact current proposal.';}else if(stale)label='Refresh current state';else if(!s.ready)label=!s.forkAccepted?'Execution check pending':'Notice is still running';else if(action==='connect')label='Connect the designated owner';else if(action==='approve')label='1 · Approve as Qhooks 1';else if(action==='exec')label='2 · Send as Qhooks2';else if(owner===OWNERS[0].a&&s.approved[0])label='Approved · open this link on desktop';else if(owner===OWNERS[1].a)label='Waiting for Qhooks 1 approval';else label='Connect Qhooks 1 or Qhooks2';}
  const disabled=reading||busy||!!pending||!!complete||!action,button=h('button',{type:'button',class:'sl-primary',disabled},busy?'Checking exact transaction…':complete?'Execution confirmed':pending?'Transaction pending':label);button.addEventListener('click',()=>action==='connect'?hub.open():send(action));
  const refresh=h('button',{type:'button',class:'sl-secondary',disabled:reading||busy},reading?'Reading…':'Refresh on-chain state');refresh.addEventListener('click',update);
  const top=h('div',{class:'sl-state','data-state':error?'unavailable':changed()?'changed':s?.ready?'ready':'waiting'},h('span',{class:'sl-dot','aria-hidden':'true'}),h('strong',{},complete?'Execution confirmed':label),h('p',{},reason));
  const controls=h('div',{class:'sl-controls'},button,refresh);
  if(changed()){const b=h('button',{type:'button',class:'sl-secondary',disabled:reading||busy||!!error},'Review current proposal');b.addEventListener('click',()=>{accept();status='Current lock state, Safe nonce and hash are shown. Check them before approving.';render();});controls.append(b);}
  if(error&&c){const b=h('button',{type:'button',class:'sl-secondary',disabled:reading||busy},reader.mode==='relay'?'Read through owner wallet':'Retry QHooks relay');b.addEventListener('click',()=>{reader.setMode(reader.mode==='relay'?'wallet':'relay');void update();});controls.append(b);}
  const content=[top];
  if(s){
   const now=s.now+Math.max(0,Math.floor((Date.now()-s.readAt)/1000)),left=Math.max(0,C.readyAt-now);
   if(!isA)content.push(h('p',{class:'sl-countdown','data-countdown':true},left?`${Math.floor(left/86400)}d ${Math.floor(left%86400/3600)}h ${Math.floor(left%3600/60)}m until ${utc(C.readyAt)}`:'Ready time reached. Refresh on-chain state to verify readiness.'));
   const facts=isA?[['Lock','2 · Treasury'],[complete?'Vested before this transaction':'Currently vested, unclaimed',tokenAmount(s.vested)+' QHOOKS'],['After extending','0 QHOOKS vested until the new drip starts'],['New drip starts',utc(openAt)],['720-day drip ends',utc(endAt)],['Claimed',tokenAmount(s.lock.claimed)+' QHOOKS']]:[['Lock','4 · Community rewards'],['Exact withdrawal and deposit',tokenAmount(s.tx?.amount||C.amount)+' QHOOKS'],['Notice ready at',utc(C.readyAt)],['Safe QHOOKS before execution',tokenAmount(s.safeBalance)],['Safe QHOOKS after execution','Same preexisting balance · 0 newly withdrawn residue'],['QDrops allowance after execution','0 · exact approval is consumed']];
   content.push(h('dl',{class:'sl-facts'},...facts.flatMap(([k,v])=>[h('dt',{},k),h('dd',{},v)])));
   const checks=[h('li',{'data-ok':'true'},'Robinhood Chain · exact contract code verified'),h('li',{'data-ok':'true'},'Safe owners 2 of 2 · exact reviewed lock state'),h('li',{'data-ok':String(s.forkAccepted)},s.forkAccepted?'Fork execution and fund invariants verified':'Atomic fork execution check pending')];
   if(!isA)checks.push(h('li',{'data-ok':String(s.now>=C.readyAt)},s.now>=C.readyAt?'Public notice has matured':'Public notice is still running'));
   content.push(h('ul',{class:'sl-checklist','aria-label':'Readiness checks'},checks));
   if(s.hash){
    content.push(h('div',{class:'sl-proposal'},h('p',{class:'sl-kicker'},'Shared on-chain proposal'),h('p',{},'Safe transaction #'+s.nonce+' · threshold 2 of 2'),h('pre',{class:'sl-hash','aria-label':'Safe transaction hash'},s.hash),h('ol',{},...OWNERS.map((o,i)=>h('li',{'data-approved':String(s.approved[i])},o.name+' · '+(s.approved[i]?'approved on chain':i===0?'phone approval needed':'desktop execution after Qhooks 1 approves'))))));
    if(!changed()){const link=sharedProposalLink(href(),s),field=h('input',{class:'sl-link',type:'text',readonly:true,value:link,'aria-label':'Shared proposal link'}),copy=h('button',{type:'button',class:'sl-secondary'},'Copy proposal link');copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link);status='Copied. Both devices read the same nonce, hash and on-chain approval.';}catch{field.focus();field.select();status='Select and copy the proposal link.';}render();});content.push(h('div',{class:'sl-share'},copy,field));}
   }
   content.push(h('p',{class:'sl-checked'},'Checked block '+s.blockNumber+' · '+s.readSource+' · '+new Date(s.readAt).toLocaleTimeString()));
   const calls=s.tx?(s.tx.calls||[[s.tx.to,s.tx.data]]):[];
   content.push(h('details',{class:'sl-details'},h('summary',{},'Exact contract calls and addresses'),h('p',{},'Safe '+C.safe),h('ol',{},...calls.map(([to,data])=>h('li',{},h('code',{},to),h('code',{},data)))),h('p',{},'Value 0 · '+(isA?'CALL QLocks.extend(2, 8553600)':'DELEGATECALL MultiSendCallOnly; exactly three CALLs, no next announcement'))));
  }
  content.push(controls,h('p',{role:'status','aria-live':'polite',class:'sl-status'},status));
  if(pending||complete)content.push(h('a',{href:'https://robinhoodchain.blockscout.com/tx/'+(pending||complete).hash,target:'_blank',rel:'noopener'},'View submitted transaction receipt'));
  content.push(h('p',{class:'sl-help'},'Qhooks 1 approves the exact Safe hash on chain from the phone. Qhooks2 opens the same link on desktop and sends it. Approvals are read from the chain; no signature is saved in this browser.'));
  root.replaceChildren(...content);
 }
 async function update(){if(reading||busy||pending||disposed)return;reading=true;render();try{const next=await reader.withHash(await read());state=next;error='';if(!review&&!linkError&&next.hash)accept();}catch(e){error=e.message||'The state could not be verified.';}finally{reading=false;render();}}
 async function send(kind){
  if(busy||reading||pending||complete||error||changed()||!state?.ready)return;
  busy=true;status='Rechecking exact state, caller, nonce and simulation before opening the wallet…';render();
  try{
   const prepared=await prepareOwnerAction({kind,displayed:state,review,read,reader,hub});status='Confirm this exact '+(kind==='approve'?'Safe hash approval':'Safe execution')+' in the designated wallet.';render();
   const hash=await prepared.provider.request({method:'eth_sendTransaction',params:[prepared.tx]});if(!/^0x[0-9a-f]{64}$/i.test(hash||''))throw Error('No transaction hash returned. Check wallet activity before retrying.');pending={hash,kind,safeHash:prepared.safeHash};status='Submitted. Waiting for its on-chain receipt…';render();
   let receipt=null;for(let n=0;n<90&&!receipt;n++){receipt=await reader.rpc('eth_getTransactionReceipt',[hash]).catch(()=>null);if(!receipt)await new Promise(r=>setTimeout(r,2000));}
   if(!receipt)throw Error('Receipt pending. Use its explorer link; this page will not send another action while pending.');
   if(receipt.status!=='0x1'){pending=null;throw Error('The transaction reverted. Refresh before retrying.');}
   if(kind==='exec'){if(!executionConfirmed(receipt,prepared.safeHash)){pending=null;throw Error('The receipt does not prove Safe execution success for this hash.');}complete={hash};pending=null;status='Exact Safe execution confirmed.';}
   else{pending=null;status='Approval mined. The shared on-chain approval is being checked.';}
  }catch(e){status=/reject|denied|cancel/i.test(e.message||'')?'Cancelled in the wallet. Nothing was sent.':e.message||'Could not verify the action.';}
  finally{busy=false;render();if(!pending&&!complete)await update();}
 }
 const unsubscribe=hub.subscribe(()=>{if(!busy)void update();}),timer=setInterval(()=>{if(document.visibilityState==='visible'&&state&&Date.now()-state.readAt>30000)void update();else if(kind==='drops'&&state){const n=root.querySelector('[data-countdown]'),left=Math.max(0,C.readyAt-state.now-Math.max(0,Math.floor((Date.now()-state.readAt)/1000))),text=left?`${Math.floor(left/86400)}d ${Math.floor(left%86400/3600)}h ${Math.floor(left%3600/60)}m until ${utc(C.readyAt)}`:'Ready time reached. Refresh on-chain state to verify readiness.';if(n&&n.textContent!==text)n.textContent=text;}},1000);
 void update();return {refresh:update,getState:()=>state,dispose(){disposed=true;clearInterval(timer);unsubscribe();}};
}
if(typeof window!=='undefined'&&document.getElementById('safe-operation')){const root=document.getElementById('safe-operation'),kind=root.dataset.kind,hub=getWalletHub(window),reader=createSafeReader({wallet:()=>hub.snapshot().current}),read=createOperationRead({kind,reader});createSafeLockPage({root,kind,hub,reader,read});}
