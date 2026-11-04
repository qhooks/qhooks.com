// UI orchestration only. Crypto loads lazily; public journals contain no keys.
import {discoverWallets} from './discover-wallets.mjs';
import {renderPoolSetup} from './pool-setup-summary.mjs';
export function bindPoolSetupPage({document:d=document,target=window,loadModules,getToolkitText,downloadFile=null,onContext=()=>{}}){
 const $=id=>d.getElementById(id),ensure=ok=>{if(!ok)throw Error('Setup unavailable');};
 let providers=[],provider=null,session=null,modules=null,setup=null,busy=false,dead=false,revision=0,toolkitReady=false,cost=null,timer=null;
 const status=(text,error=false)=>{$('pool-setup-feedback').textContent=text;$('pool-setup-feedback').dataset.error=String(error);};
 function clearCost(){cost=null;clearTimeout(timer);$('pool-setup-accept').checked=false;}
 function render(){
  if(dead)return;const state=setup?.snapshot(),connected=session?.current?.chainId==='31337',working=busy||!!state?.busy,review=state?.review;
  renderPoolSetup($('pool-setup-summary'),state||null);
  $('pool-provider').disabled=working;$('pool-connect').disabled=working||!providers.length;$('pool-disconnect').disabled=!session?.current;
  $('pool-tokens').disabled=working||!!setup;$('pool-prepare').disabled=working||!connected||!toolkitReady||!!setup;
  for(const id of ['pool-resume','pool-journal-import'])$(id).disabled=working||!connected||!toolkitReady;
  $('pool-journal-file').disabled=working;$('pool-journal-download').disabled=!setup;
  const next=state?.stages.verifier?.status==='confirmed'?'pool':'verifier',phase=state?.stages[next]?.status;
  $('pool-setup-review').disabled=working||!connected||!setup||!!state?.binding||!['pending','rejected',undefined].includes(phase);
  $('pool-setup-review').textContent=next==='pool'?'Review pool deployment':'Review verifier deployment';
  $('pool-setup-check').disabled=working||!connected||!setup;
  const unknown=['verifier','pool'].find(id=>state?.stages[id]?.status==='unknown');$('pool-setup-recovery').hidden=!unknown;$('pool-setup-recover').disabled=working||!connected||!unknown;
  const valid=!!review&&cost?.review===review&&Date.now()<review.expiresAt;
  $('pool-setup-review-details').hidden=!review;$('pool-setup-review-text').textContent=review?JSON.stringify(review,null,2):'';
  $('pool-setup-cost').textContent=valid?`Estimated network gas: ${review.estimatedGas}. At ${cost.gasPrice} wei/gas: ${BigInt(review.estimatedGas)*BigInt(cost.gasPrice)} wei. Service fee: off. Your wallet shows the final fee.`:'Review a deployment for a fresh gas estimate.';
  $('pool-setup-accept').disabled=working||!connected||!valid;
  $('pool-setup-send').disabled=working||!connected||!valid||!$('pool-setup-accept').checked;
  onContext(connected&&setup?{provider,session,setup}:null);
 }
 const invalidate=()=>{revision++;clearCost();setup?.invalidate();render();};
 function clearConnection(){revision++;clearCost();const old=setup;setup=null;old?.dispose();const previous=session;session=null;previous?.dispose();provider=null;render();}
 async function run(fn,message){
  if(dead||busy||setup?.snapshot().busy)return;busy=true;render();status('Working locally…');
  try{const result=await fn();if(!dead)status(typeof message==='function'?message(result):message);}
  catch{if(!dead)status('Step stopped. Check your local wallet, toolkit and saved progress. If a broadcast was interrupted, recover its exact hash before proceeding.',true);}
  finally{busy=false;render();}
 }
 async function live(rev,connection){ensure(!dead&&revision===rev&&session?.current===connection);await session.refresh(connection);ensure(!dead&&revision===rev&&session.current===connection);}
 function save(journal){
  const text=JSON.stringify(journal);ensure(text.length<=500000&&/^0x[0-9a-f]{40}$/.test(journal.owner)&&/^(0|[1-9][0-9]{0,19})$/.test(journal.baseNonce));
  target.localStorage.setItem(`qhooks.pool.setup.${journal.owner}.${journal.baseNonce}`,text);
  target.localStorage.setItem(`qhooks.pool.setup.latest.${journal.owner}`,journal.baseNonce);
 }
 function latest(){const owner=session.current.owner,nonce=target.localStorage.getItem(`qhooks.pool.setup.latest.${owner}`);ensure(typeof nonce==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(nonce));const text=target.localStorage.getItem(`qhooks.pool.setup.${owner}.${nonce}`);ensure(typeof text==='string');return text;}
 async function install(journal=null){
  const rev=revision,connection=session.current;ensure(connection?.chainId==='31337'&&toolkitReady);clearCost();
  const toolkitText=await getToolkitText();await live(rev,connection);
  const tokens=$('pool-tokens').value.trim()===''?[]:$('pool-tokens').value.trim().split(/[\s,]+/).map(x=>x.toLowerCase());
  const candidate=await modules[0].createPoolSetup({provider,session,toolkitText,tokens,journal,save,onChange:render});
  try{await live(rev,connection);}catch(e){candidate.dispose();throw e;}
  const old=setup;setup=candidate;old?.dispose();$('pool-tokens').value=candidate.snapshot().tokens.join('\n');
  save(candidate.journal());if(journal!==null)await candidate.reconcile();render();
 }
 async function price(rev,connection){const value=await provider.request({method:'eth_gasPrice'});await live(rev,connection);ensure(typeof value==='string'&&value.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value));return BigInt(value).toString();}
 function quote(review,gasPrice){clearCost();cost={review,gasPrice};timer=setTimeout(render,Math.max(0,review.expiresAt-Date.now()+1));}
 const discovery=discoverWallets(target,entries=>{providers=entries;const select=$('pool-provider'),prior=select.value;select.replaceChildren();entries.forEach((entry,i)=>{const option=d.createElement('option');option.value=String(i);option.textContent=entry.name;select.appendChild(option);});if(prior!==''&&entries[Number(prior)])select.value=prior;render();});
 $('pool-provider').addEventListener('change',()=>{clearConnection();status('Wallet selection changed. Saved setup journals are retained.');});
 $('pool-connect').addEventListener('click',()=>run(async()=>{
  clearConnection();const rev=revision,p=providers[Number($('pool-provider').value)]?.provider;ensure(p);modules??=await loadModules();ensure(!dead&&revision===rev);provider=p;session=modules[1].createWalletSession(p,invalidate);await session.connect();ensure(session.current?.chainId==='31337');
 },'Connected. Build the toolkit, then prepare a new pool or resume saved setup.'));
 $('pool-disconnect').addEventListener('click',()=>{clearConnection();status('Disconnected. Public progress remains saved.');});
 $('pool-prepare').addEventListener('click',()=>run(()=>{ensure(!setup);return install();},'Setup prepared. Review the verifier deployment first.'));
 $('pool-resume').addEventListener('click',()=>run(()=>install(latest()),'Saved setup loaded. Canonical receipts and full runtime checked where confirmed.'));
 $('pool-journal-import').addEventListener('click',()=>run(async()=>{const f=$('pool-journal-file').files?.[0],rev=revision;ensure(f&&f.size<=500000);const text=await f.text();ensure(rev===revision);await install(text);},'Public setup journal loaded and rechecked.'));
 $('pool-journal-download').addEventListener('click',()=>{
  if(!setup)return;const value=setup.journal();if(downloadFile)return downloadFile(value,'qhooks-public-pool-setup.json');
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download='qhooks-public-pool-setup.json';d.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 });
 $('pool-setup-review').addEventListener('click',()=>run(async()=>{clearCost();const rev=revision,connection=session.current,state=setup.snapshot(),id=state.stages.verifier?.status==='confirmed'?'pool':'verifier';const review=await setup.review(id);await live(rev,connection);const gasPrice=await price(rev,connection);ensure(setup.snapshot().review===review);quote(review,gasPrice);$('pool-setup-review-details').open=true;},'Review this exact deployment and its gas estimate before sending.'));
 $('pool-setup-accept').addEventListener('change',render);
 $('pool-setup-send').addEventListener('click',()=>run(async()=>{
  const review=setup.snapshot().review,rev=revision,connection=session.current;ensure(cost?.review===review&&$('pool-setup-accept').checked&&Date.now()<review.expiresAt);
  const gasPrice=await price(rev,connection);ensure(cost?.review===review&&setup.snapshot().review===review&&$('pool-setup-accept').checked&&Date.now()<review.expiresAt);
  if(gasPrice!==cost.gasPrice){quote(review,gasPrice);return false;}clearCost();await setup.submit(review);return true;
 },sent=>sent?'Transaction submitted. Check receipts before continuing.':'Gas price changed. Accept the refreshed estimate before sending.'));
 $('pool-setup-check').addEventListener('click',()=>run(()=>{clearCost();return setup.reconcile();},'Deployment receipts checked.'));
 $('pool-setup-recover').addEventListener('click',()=>run(()=>{clearCost();const state=setup.snapshot(),id=['verifier','pool'].find(k=>state.stages[k]?.status==='unknown');ensure(id);return setup.recover(id,$('pool-setup-hash').value.trim());},'Transaction matched to the exact saved deployment.'));
 function dispose(){if(dead)return;dead=true;onContext(null);clearConnection();discovery.stop();target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);render();return Object.freeze({dispose,setToolkitReady(ready){toolkitReady=ready===true;render();}});
}
