// Public configuration only. No wallet API, signatures, private keys or charges.
import {buildCreatorDraft} from './creator-draft.mjs';
import {renderLaunchBuildSummary} from './launch-build-summary.mjs';
const $=id=>document.getElementById(id),form=$('lab-form'),build=$('launch-kit-build'),download=$('launch-kit-download'),summary=$('launch-kit-summary'),feedback=$('launch-kit-feedback');
const fields=['projectName','chainId','owner','currency0','currency1','feeBps','poolFee','tickSpacing'];
const read=()=>Object.fromEntries(fields.map(k=>[k,form.elements.namedItem(k).value]));
let revision=0,pending=null,accepted=null;
const creatorSelected=()=>form.elements.namedItem('template')?.value!=='split';
function invalidate(){revision++;pending?.abort();pending=null;accepted=null;download.disabled=true;build.disabled=!creatorSelected();summary.hidden=true;summary.replaceChildren();feedback.textContent='';}
form.addEventListener('input',invalidate);form.addEventListener('submit',invalidate);
form.elements.namedItem('template')?.addEventListener('change',invalidate);
for(const id of ['lab-example','lab-restore'])$(id).addEventListener('click',invalidate);
function pause(signal){return new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new DOMException('Cancelled','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},750);
  if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
});}
build.addEventListener('click',async()=>{
  if(pending||!creatorSelected())return;invalidate();let input,draft;
  try{input=read();draft=buildCreatorDraft(input);if(draft.chainId!=='31337')throw Error('Use local chain ID31337 for the launch toolkit.');}
  catch{feedback.textContent='Check your Lab configuration. The launch toolkit currently uses local chain31337.';feedback.dataset.error='true';return;}
  const rev=revision,controller=new AbortController();pending=controller;build.disabled=true;feedback.dataset.error='false';feedback.textContent='Building the complete token, QWallet and hook toolkit…';
  try{
    const response=await fetch('/api/launch/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),signal:controller.signal});
    let job=await response.json();if(!response.ok)throw Error(job.error||'Build unavailable');
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job.id)||!/^[a-f0-9]{64}$/.test(job.projectInputSha256))throw Error('Build identity mismatch');
    const id=job.id,digest=job.projectInputSha256,deadline=Date.now()+370000;
    while(job.status==='building'){
      if(Date.now()>deadline)throw Error('Build is taking too long. Try again to retrieve its result.');
      await pause(controller.signal);const poll=await fetch('/api/launch/build/'+id,{signal:controller.signal});job=await poll.json();
      if(!poll.ok||job.id!==id||job.projectInputSha256!==digest)throw Error('Build identity changed');
    }
    if(rev!==revision)return;
    if(job.status!=='ready')throw Error(job.error||'Build did not complete');
    const a=job.artifact;
    if(!a||a.schemaVersion!==1||a.projectInputSha256!==digest||a.sourceCount!==68||JSON.stringify(a.configuration)!==JSON.stringify(draft))throw Error('Configuration changed');
    renderLaunchBuildSummary(summary,a);summary.hidden=false;accepted={id,digest};download.disabled=false;
    feedback.textContent='Toolkit ready. Download the complete project to integrate on your local chain.';
  }catch(error){if(rev!==revision||error.name==='AbortError')return;feedback.textContent='Build unavailable: '+error.message;feedback.dataset.error='true';}
  finally{if(pending===controller)pending=null;if(rev===revision)build.disabled=!creatorSelected();}
});
download.addEventListener('click',()=>{
  if(!accepted||!creatorSelected())return;const a=document.createElement('a');a.href='/api/launch/build/'+accepted.id+'/artifact';a.download='qhooks-launch-toolkit.json';document.body.appendChild(a);a.click();a.remove();
});
window.addEventListener('pagehide',invalidate);
invalidate();
