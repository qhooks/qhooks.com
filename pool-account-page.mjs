// Presentation orchestration. Core imports only on explicit workspace open.
import {renderPoolAccount} from './pool-account-summary.mjs';
const ZERO='0x'+'00'.repeat(20);
export function bindPoolAccountPage({document:d=document,target=window,loadModule,downloadFile=null,clock=Date.now}){
 const $=id=>d.getElementById(id),ensure=(ok)=>{if(!ok)throw Error('Account step unavailable');};
 let context=null,workspace=null,busy=false,dead=false,revision=0,cost=null,timer=null,modules=null;
 const status=(message,error=false)=>{$('pool-account-feedback').textContent=message;$('pool-account-feedback').dataset.error=String(error);};
 function clearCost(){cost=null;clearTimeout(timer);$('pool-account-accept').checked=false;}
 function clearSecrets(){for(const id of ['pool-key-password','pool-key-file'])$(id).value='';}
 function available(){return !!context?.session.current&&context.session.current.chainId==='31337'&&!!context.setup.snapshot().binding;}
 function render(){
  if(dead)return;const s=workspace?.snapshot(),ready=available(),working=busy||!!s?.busy||!!context?.setup.snapshot().busy,e=s?.execution,j=e?.journal,phase=j?.status,kind=$('pool-account-kind').value,protectedAction=['enroll','withdraw'].includes(s?.fields?.kind);
  renderPoolAccount($('pool-account-summary'),s||null);
  $('pool-account-open').disabled=working||!ready||!!workspace;
  for(const id of ['pool-key-generate','pool-key-restore','pool-account-import','pool-account-resume'])$(id).disabled=working||!ready||!workspace;
  $('pool-key-generate').disabled ||= !!s&&!s.locked;
  for(const id of ['pool-key-export','pool-key-verify'])$(id).disabled=working||!ready||!s||s.locked;
  $('pool-key-lock').disabled=!workspace||!!s?.locked;
  for(const id of ['pool-key-password','pool-key-file','pool-action-file'])$(id).disabled=working||!workspace;
  $('pool-account-refresh').disabled=working||!ready||!s?.publicKeyHex;
  const pending=['unknown','submitting','submitted'].includes(phase)||(phase==='confirmed'&&!e?.outcome);
  $('pool-account-prepare').disabled=working||!ready||!s?.publicKeyHex||pending;
  for(const id of ['pool-account-kind','pool-account-asset','pool-account-amount','pool-account-recipient'])$(id).disabled=working||pending;
  $('pool-account-asset').disabled ||= kind==='enroll';$('pool-account-amount').disabled ||= kind==='enroll';$('pool-account-recipient').disabled ||= kind!=='withdraw';
  $('pool-account-amount-label').hidden=kind==='enroll';$('pool-account-asset-label').hidden=kind==='enroll';$('pool-account-recipient-label').hidden=kind!=='withdraw';
  $('pool-account-approve').disabled=working||!ready||!e||e.recoveryOnly||!protectedAction||!!s.locked||!s.backupVerified||!!e.approved||pending;
  $('pool-account-review').disabled=working||!ready||!e||e.recoveryOnly||pending||protectedAction&&!e.approved||phase==='confirmed'||phase==='reverted';
  $('pool-account-check').disabled=working||!ready||!j;
  $('pool-account-download').disabled=!j;
  $('pool-account-clear').disabled=working||!workspace||pending;
  const r=e?.review,valid=!!r&&cost?.review===r&&clock()<r.expiresAt;
  $('pool-account-review-details').hidden=!r;$('pool-account-review-text').textContent=r?JSON.stringify(r,null,2):'';
  $('pool-account-cost').textContent=valid?`Estimated gas: ${r.estimatedGas}. At ${cost.gasPrice} wei/gas: ${BigInt(r.estimatedGas)*BigInt(cost.gasPrice)} wei. Service fee: off. Your wallet shows the final fee.`:'Review this action for a fresh gas estimate.';
  $('pool-account-accept').disabled=working||!ready||!valid;
  $('pool-account-send').disabled=working||!ready||!valid||!$('pool-account-accept').checked;
  $('pool-account-recovery').hidden=phase!=='unknown';$('pool-account-recover').disabled=working||!ready||phase!=='unknown';
 }
 async function run(fn,message){
  if(dead||busy||workspace?.snapshot().busy||context?.setup.snapshot().busy)return;busy=true;render();status('Working locally…');
  try{const value=await fn();if(!dead)status(typeof message==='function'?message(value):message);}
  catch{if(!dead)status('Step stopped. Check your development wallet, account fields and backup. Recover an interrupted broadcast before preparing another action.',true);}
  finally{busy=false;render();}
 }
 function capture(){ensure(available()&&workspace);return {revision,context,workspace,connection:context.session.current};}
 async function live(c){ensure(!dead&&revision===c.revision&&context===c.context&&workspace===c.workspace&&context.session.current===c.connection);await context.session.refresh(c.connection);ensure(!dead&&revision===c.revision&&context===c.context&&workspace===c.workspace&&context.session.current===c.connection);}
 function save(journal){
  // Closed public schemas come from the accepted controller, never form values.
  const text=JSON.stringify(journal),identity=journal.kind==='qhooks-pool-protected-journal'?journal.approval?.action:journal.intent;
  ensure(text.length<=250000&&/^0x[0-9a-f]{40}$/.test(identity?.owner)&&/^0x[0-9a-f]{40}$/.test(identity.pool)&&/^0x[0-9a-f]{64}$/.test(identity.accountId));
  target.localStorage.setItem(`qhooks.pool.action.${identity.owner}.${identity.pool}.${identity.accountId}`,text);
  target.localStorage.setItem(`qhooks.pool.action.latest.${identity.owner}.${identity.pool}`,identity.accountId);
 }
 function latest(){const state=context.setup.snapshot(),owner=context.session.current.owner,pool=state.binding.pool,id=target.localStorage.getItem(`qhooks.pool.action.latest.${owner}.${pool}`);ensure(typeof id==='string'&&/^0x[0-9a-f]{64}$/.test(id));const saved=target.localStorage.getItem(`qhooks.pool.action.${owner}.${pool}.${id}`);ensure(typeof saved==='string');return saved;}
 function download(value,name,raw=false){
  if(downloadFile)return downloadFile(value,name,raw);
  const url=URL.createObjectURL(new Blob([raw?value:JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download=name;d.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 async function readFile(id,limit){const file=$(id).files?.[0];ensure(file&&file.size<=limit);const text=await file.text();ensure(text.length<=limit);return text;}
 function quote(review,gasPrice){clearCost();cost={review,gasPrice};timer=setTimeout(render,Math.max(0,review.expiresAt-clock()+1));}
 async function price(c){const value=await c.context.provider.request({method:'eth_gasPrice'});await live(c);ensure(typeof value==='string'&&value.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value));return BigInt(value).toString();}
 $('pool-account-open').addEventListener('click',()=>run(async()=>{
  ensure(available()&&!workspace);const rev=revision,selected=context;modules??=await loadModule();ensure(!dead&&rev===revision&&context===selected&&available());
  workspace=modules.createPoolWorkspace({...context,save,onChange:render,clock});
 },'Workspace opened. Create a quantum key or restore your encrypted backup.'));
 $('pool-key-generate').addEventListener('click',()=>run(async()=>{clearCost();clearSecrets();const c=capture();await c.workspace.generate();await live(c);},'Quantum key created in memory. Download and verify its encrypted backup before enrollment.'));
 $('pool-key-export').addEventListener('click',()=>run(async()=>{
  const c=capture(),password=$('pool-key-password').value;$('pool-key-password').value='';try{const encrypted=await c.workspace.exportBackup(password);await live(c);download(encrypted,'qhooks-encrypted-pool-key.json',true);}finally{clearSecrets();}
 },'Encrypted backup downloaded. Select that saved file and verify it with the same passphrase.'));
 for(const[id,method,message]of [['pool-key-verify','verifyBackup','Saved backup verified. Your key can now approve enrollment and withdrawals.'],['pool-key-restore','restore','Quantum key restored and backup verified.']])$(id).addEventListener('click',()=>run(async()=>{
  clearCost();const c=capture(),password=$('pool-key-password').value;$('pool-key-password').value='';try{const encrypted=await readFile('pool-key-file',20000);await live(c);await c.workspace[method](encrypted,password);await live(c);}finally{clearSecrets();}
 },message));
 $('pool-key-lock').addEventListener('click',()=>{clearCost();clearSecrets();workspace?.lock();render();status('Quantum key locked. Public transaction progress is retained.');});
 $('pool-account-refresh').addEventListener('click',()=>run(async()=>{const c=capture();await c.workspace.refresh($('pool-account-asset').value.trim().toLowerCase()||ZERO);await live(c);},'Canonical account balance and enrollment loaded.'));
 $('pool-account-prepare').addEventListener('click',()=>run(async()=>{
  clearCost();const c=capture(),kind=$('pool-account-kind').value;
  const fields={kind,asset:kind==='enroll'?'':$('pool-account-asset').value.trim().toLowerCase()||ZERO,amount:kind==='enroll'?'':$('pool-account-amount').value.trim(),recipient:kind==='withdraw'?$('pool-account-recipient').value.trim().toLowerCase():''};
  await c.workspace.prepare(fields);await live(c);
 },'Action prepared. Enrollment and withdrawals require both key approvals; deposits and exact allowances go directly to fee review.'));
 for(const id of ['pool-account-kind','pool-account-asset','pool-account-amount','pool-account-recipient'])$(id).addEventListener(id==='pool-account-kind'?'change':'input',()=>{
  clearCost();try{workspace?.clearAction();status('Fields changed. Prepare this action again.');}catch{status('Finish or recover the existing transaction before changing its action.',true);}render();
 });
 $('pool-account-clear').addEventListener('click',()=>run(async()=>{clearCost();workspace.clearAction();},'Action cleared. The quantum key remains available until you lock it.'));
 $('pool-account-approve').addEventListener('click',()=>run(async()=>{clearCost();const c=capture();await c.workspace.approve();await live(c);},'Both keys approved the exact intent. Review its network cost next.'));
 $('pool-account-review').addEventListener('click',()=>run(async()=>{clearCost();const c=capture(),r=await c.workspace.review();await live(c);const gasPrice=await price(c);ensure(c.workspace.snapshot().execution.review===r);quote(r,gasPrice);$('pool-account-review-details').open=true;},'Review the exact transaction and accept its estimated network cost.'));
 $('pool-account-accept').addEventListener('change',render);
 $('pool-account-send').addEventListener('click',()=>run(async()=>{
  const c=capture(),r=c.workspace.snapshot().execution.review;ensure(cost?.review===r&&$('pool-account-accept').checked&&clock()<r.expiresAt);const gasPrice=await price(c);ensure(cost?.review===r&&c.workspace.snapshot().execution.review===r&&$('pool-account-accept').checked&&clock()<r.expiresAt);
  if(gasPrice!==cost.gasPrice){quote(r,gasPrice);return false;}clearCost();await c.workspace.submit(r);await live(c);return true;
 },sent=>sent?'Transaction submitted. Check its receipt before the next action.':'Gas price changed. Accept the refreshed estimate before sending.'));
 $('pool-account-check').addEventListener('click',()=>run(async()=>{clearCost();const c=capture();await c.workspace.reconcile();await live(c);},'Receipt, exact account event and full contract runtime checked.'));
 $('pool-account-recover').addEventListener('click',()=>run(async()=>{clearCost();const c=capture();await c.workspace.recover($('pool-account-hash').value.trim());await live(c);},'Broadcast hash matched and receipt checked. No duplicate transaction was sent.'));
 $('pool-account-download').addEventListener('click',()=>{if(workspace)download(workspace.exportJournal(),'qhooks-public-pool-action.json');});
 $('pool-account-import').addEventListener('click',()=>run(async()=>{clearCost();const c=capture(),text=await readFile('pool-action-file',250000);await live(c);await c.workspace.resume(text);await live(c);},'Public progress loaded for receipt recovery only. It cannot sign or resend.'));
 $('pool-account-resume').addEventListener('click',()=>run(async()=>{clearCost();const c=capture();await c.workspace.resume(latest());await live(c);},'Saved public progress loaded for receipt recovery only.'));
 function setContext(next){
  if(dead)return;
  if(context?.provider===next?.provider&&context?.session===next?.session&&context?.setup===next?.setup){render();return;}
  revision++;clearCost();clearSecrets();const old=workspace;workspace=null;context=next;old?.dispose();render();
 }
 function dispose(){if(dead)return;dead=true;revision++;clearCost();clearSecrets();workspace?.dispose();workspace=null;context=null;target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);render();return Object.freeze({setContext,dispose});
}
