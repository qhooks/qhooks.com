import { buildCreatorDraft } from './creator-draft.mjs';
import { buildSplitDraft } from './split-draft.mjs';
import { createCompileSession } from './compile-session.mjs';
import { renderBuildSummary } from './build-summary.mjs';
import { mountLabDeploy } from './lab-deploy.mjs';

const form = document.getElementById('lab-form');
const feedback = document.getElementById('lab-feedback');
const output = document.getElementById('lab-output');
const saveBtn = document.getElementById('lab-save');
const restoreBtn = document.getElementById('lab-restore');
const downloadBtn = document.getElementById('lab-download');
const exampleBtn = document.getElementById('lab-example');
const sourceBtn = document.getElementById('lab-source');
const projectDownloadBtn = document.getElementById('lab-project-download');
const buildBtn = document.getElementById('lab-build');
const artifactDownloadBtn = document.getElementById('lab-artifact-download');
const abiDownloadBtn = document.getElementById('lab-abi-download');
const bytecodeDownloadBtn = document.getElementById('lab-bytecode-download');
const summary = document.getElementById('lab-build-summary');
const compilation = createCompileSession();
let activeBuildJob = null;

const template = document.getElementById('lab-template');
const split = () => template.value === 'split';
const fields = () => ['projectName', 'chainId', 'owner', 'currency0', 'currency1', 'feeBps', 'poolFee', 'tickSpacing', ...(split()?['ownerB','shareBps']:[])];
const buildDraft = input => split()?buildSplitDraft(input):buildCreatorDraft(input);
const apiPath = () => split()?'/api/lab/split':'/api/lab';
const storageKey = () => 'qhooks.lab.'+(split()?'split':'creator')+'.v1';
let current = null;
let project = null;
let generation = 0;
let pending = null;

function read() {
  return Object.fromEntries(fields().map(name => [name, form.elements.namedItem(name).value]));
}

function invalidate() {
  generation++;
  pending?.abort();
  pending = null;
  compilation.invalidate();
  activeBuildJob = null;
  summary.hidden = true;
  summary.replaceChildren();
  for (const b of [buildBtn,artifactDownloadBtn,abiDownloadBtn,bytecodeDownloadBtn]) b.disabled = true;
  project = null;
  sourceBtn.disabled = true;
  projectDownloadBtn.disabled = true;
  current = null;
  output.hidden = true;
  output.textContent = '';
  saveBtn.disabled = true;
  downloadBtn.disabled = true;
  feedback.textContent = 'Validate your updated draft.';
  feedback.dataset.error = 'false';
}

function validate() {
  invalidate();
  try {
    current = buildDraft(read());
    output.textContent = JSON.stringify(current, null, 2);
    output.hidden = false;
    saveBtn.disabled = false;
    downloadBtn.disabled = false;
    sourceBtn.disabled = false;
    feedback.textContent = 'Draft validated. No contract has been built or deployed.';
    feedback.dataset.error = 'false';
  } catch (error) {
    invalidate();
    feedback.textContent = 'Check ' + error.message;
    feedback.dataset.error = 'true';
  }
}

form.addEventListener('input', invalidate);
function selectTemplate() {
  invalidate();
  for(const [id,name] of [['lab-owner-b','ownerB'],['lab-share','shareBps']]) {
    document.getElementById(id).hidden=!split();
    form.elements.namedItem(name).disabled=!split();
  }
  document.getElementById('lab-split-note').hidden=!split();
  document.getElementById('launch-kit-section').hidden=split();
  const deployHost=document.getElementById('lab-deploy');if(deployHost)deployHost.hidden=split();
  const splitHost=document.getElementById('lab-deploy-split-host');if(splitHost)splitHost.hidden=!split();
}
// Deploy to a public chain (Creator Revenue). The build fixes the fee owner from this form; any wallet may send.
{
  const host=document.getElementById('lab-deploy');
  if(host)mountLabDeploy({container:host,template:'creator',ownerFromConfig:true,readConfig(){
    if(split())throw new Error('Public-chain deployment is available for Creator Revenue. Choose it above, or build Revenue Split for local testing.');
    const v=read();
    return {projectName:v.projectName,owner:v.owner,currency0:v.currency0,currency1:v.currency1,feeBps:v.feeBps,poolFee:v.poolFee,tickSpacing:v.tickSpacing};
  }});
}
// Deploy to a public chain (Revenue Split). Payee 1 is the fee owner above (their key is enrolled by the panel);
// payee 2 creates their own key, in their own browser, with the small tool here and sends the public half.
{
  const host=document.getElementById('lab-deploy-split-host');
  if(host){
    const el=(t,a={},...k)=>{const n=document.createElement(t);for(const[x,v]of Object.entries(a)){if(x==='class')n.className=v;else if(x==='text')n.textContent=v;else if(x.startsWith('on'))n.addEventListener(x.slice(2),v);else n.setAttribute(x,v);}n.append(...k.filter(Boolean));return n;};
    const pkB=el('input',{type:'text',id:'lab-public-key-b',maxlength:'66',spellcheck:'false',autocomplete:'off',placeholder:'0x… (64 hex characters)'});
    const pass=el('input',{type:'password',autocomplete:'new-password','aria-label':'Payee 2 key passphrase',placeholder:'At least 16 characters'});
    const file=el('input',{type:'file',accept:'.json,application/json','aria-label':'Payee 2 saved key backup'});
    const note=el('p',{class:'lab-feedback',role:'status','aria-live':'polite'});
    let signer=null;
    const make=el('button',{type:'button',class:'workspace-button',onclick:async()=>{try{
      const {createSigner}=await import('/full-launch/packages/multichain-launch/actions/signer.mjs');
      signer?.lock();signer=createSigner();const backup=await signer.exportBackup(pass.value);
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([backup],{type:'application/json'}));a.download='qhooks-payee-key-'+signer.publicKeyHex.slice(2,10)+'.json';a.click();
      note.textContent='Backup downloaded. Choose the saved file and verify it.';note.dataset.error='false';
    }catch(e){note.textContent=e.message;note.dataset.error='true';}}},'Create a payee key and download its backup');
    const check=el('button',{type:'button',class:'workspace-button',onclick:async()=>{try{
      if(!signer)throw new Error('Create the key first');const f=file.files?.[0];if(!f)throw new Error('Choose the backup you saved');
      await signer.verifyBackup(await f.text(),pass.value);pkB.value=signer.publicKeyHex;signer.lock();signer=null;pass.value='';
      note.textContent='Verified. The public key is filled in above; keep the backup file and passphrase: withdrawals from payee 2’s vault need them.';note.dataset.error='false';
    }catch(e){note.textContent=e.message;note.dataset.error='true';}}},'Verify saved backup');
    const panel=el('div');
    host.append(el('section',{class:'ld ld-payee','aria-labelledby':'lab-payee-h'},el('h2',{id:'lab-payee-h',text:'Payee 2’s post-quantum key'}),
      el('p',{text:'Payee 2 withdraws their share with their own wallet and their own post-quantum key. Paste their public key here. If you are payee 2, create your key below in your own browser and send only the public key to the deployer.'}),
      el('label',{},el('span',{text:'Payee 2 public key'}),pkB),
      el('details',{},el('summary',{text:'I am payee 2: create my key'}),el('div',{class:'ld-grid'},el('label',{},el('span',{text:'Backup passphrase'}),pass),el('label',{},el('span',{text:'Saved backup'}),file)),
        el('div',{class:'lab-actions'},make,check),note)),panel);
    mountLabDeploy({container:panel,template:'split',ownerFromConfig:true,readConfig(){
      if(!split())throw new Error('Choose Revenue Split above to deploy it.');
      const v=read();
      return {projectName:v.projectName,owner:v.owner,ownerB:v.ownerB,publicKeyB:pkB.value.trim().toLowerCase(),currency0:v.currency0,currency1:v.currency1,feeBps:v.feeBps,shareBps:v.shareBps,poolFee:v.poolFee,tickSpacing:v.tickSpacing};
    }});
  }
}
template.addEventListener('change',selectTemplate);
if(new URLSearchParams(window.location.search).get('template')==='split')template.value='split';
selectTemplate();
form.addEventListener('submit', e => {
  e.preventDefault();
  validate();
});

sourceBtn.addEventListener('click', async () => {
  if (!current || pending) return;
  const revision = generation;
  const controller = new AbortController();
  pending = controller;
  sourceBtn.disabled = true;
  project = null;
  projectDownloadBtn.disabled = true;
  feedback.textContent = 'Generating your source project…';
  try {
    const response = await fetch(apiPath()+'/source', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(read()),signal:controller.signal});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Source generation failed');
    if (revision !== generation) return;
    if (result.kind !== 'qhooks-source-project' || result.compiled !== false || result.deploymentEnabled !== false || result.sourceCount !== (split()?62:61) || JSON.stringify(result.configuration)!==JSON.stringify(current)) throw new Error('Unexpected project response');
    project = result;
    output.textContent = JSON.stringify({projectName:result.configuration.projectName,status:result.status,sourceFiles:result.sourceCount,compiler:result.compiler,inputSha256:result.inputSha256,next:'Compile and test the generated project'},null,2);
    output.hidden = false;
    feedback.textContent = `Source project ready: ${result.sourceCount} Solidity files, compiler input, configuration and license notices. Not compiled or deployed.`;
    feedback.dataset.error = 'false';
    projectDownloadBtn.disabled = false;
    buildBtn.disabled = false;
  } catch (error) {
    if (revision !== generation || error.name === 'AbortError') return;
    feedback.textContent = 'Generation failed: ' + error.message;
    feedback.dataset.error = 'true';
  } finally {
    if (pending === controller) pending = null;
    if (revision === generation) sourceBtn.disabled = false;
  }
});

function nextPoll(signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new DOMException('Build view cancelled','AbortError'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},750);
    if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  });
}
buildBtn.addEventListener('click',async()=>{
  if(!project||pending)return;
  const revision=generation,ticket=compilation.begin(project.inputSha256),controller=new AbortController(),base=apiPath();
  pending=controller;buildBtn.disabled=true;sourceBtn.disabled=true;
  activeBuildJob=null;
  for(const b of [artifactDownloadBtn,abiDownloadBtn,bytecodeDownloadBtn])b.disabled=true;
  summary.hidden=true;summary.replaceChildren();feedback.dataset.error='false';
  feedback.textContent='Building your hook and fee-vault contracts in the isolated compiler…';
  try{
    const response=await fetch(base+'/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(read()),signal:controller.signal});
    let job=await response.json();if(!response.ok)throw new Error(job.error||'Build could not start');
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job.id)||job.projectInputSha256!==ticket.inputSha256)throw new Error('Build identity mismatch');
    const id=job.id,deadline=Date.now()+370000;
    while(job.status==='building'){
      if(Date.now()>deadline)throw new Error('Build is taking too long. Try again to check the cached result.');
      await nextPoll(controller.signal);
      const poll=await fetch(base+'/build/'+id,{signal:controller.signal});
      job=await poll.json();if(!poll.ok)throw new Error(job.error||'Build status could not be read');
      if(job.id!==id||job.projectInputSha256!==ticket.inputSha256)throw new Error('Build identity changed');
    }
    if(job.status!=='ready')throw new Error(job.error||'Build failed');
    if(revision!==generation||!compilation.finish(ticket,job.artifact))return;
    activeBuildJob={id,base};
    renderBuildSummary(summary,compilation.snapshot.artifact);summary.hidden=false;output.hidden=true;
    for(const b of [artifactDownloadBtn,abiDownloadBtn,bytecodeDownloadBtn])b.disabled=false;
    feedback.textContent='Build ready. Download the contracts, ABI and bytecode to integrate.';
  }catch(error){
    if(revision!==generation||error.name==='AbortError')return;
    compilation.fail(ticket);feedback.textContent='Build could not finish: '+error.message;feedback.dataset.error='true';
  }finally{
    if(pending===controller)pending=null;
    if(revision===generation){sourceBtn.disabled=false;buildBtn.disabled=!project;}
  }
});
artifactDownloadBtn.addEventListener('click',()=>{
  downloadBuild('artifact','qhooks-compiled-project.json');
});
abiDownloadBtn.addEventListener('click',()=>{
  downloadBuild('abi',(split()?'ConfiguredSplitHook':'ConfiguredCreatorHook')+'.abi.json');
});
bytecodeDownloadBtn.addEventListener('click',()=>{
  downloadBuild('bytecode',(split()?'ConfiguredSplitHook':'ConfiguredCreatorHook')+'.bytecode.txt');
});
function downloadBuild(kind,name) {
  if(compilation.snapshot.status!=='ready'||!activeBuildJob)return;
  const a=document.createElement('a');a.href=activeBuildJob.base+'/build/'+activeBuildJob.id+'/'+kind;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
}

projectDownloadBtn.addEventListener('click', () => {
  if (!project) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));
  const a = document.createElement('a');
  a.href = url; a.download = 'qhooks-'+(split()?'split':'creator')+'-source-project.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url),100);
});

saveBtn.addEventListener('click', () => {
  if (!current) return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(read()));
    feedback.textContent = 'Draft saved.';
    feedback.dataset.error = 'false';
  } catch (e) {
    feedback.textContent = 'Save failed: ' + e.message;
    feedback.dataset.error = 'true';
  }
});

restoreBtn.addEventListener('click', () => {
  invalidate();
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw || raw.length > 4096) throw new Error('No draft or too large');
    const config = JSON.parse(raw);
    const validated = buildDraft(config);
    fields().forEach(name => {
      if (name in validated) form.elements.namedItem(name).value = validated[name];
    });
    invalidate();
    feedback.textContent = 'Draft restored. Validate again.';
  } catch (e) {
    feedback.textContent = 'Restore failed: ' + e.message;
    feedback.dataset.error = 'true';
  }
});

downloadBtn.addEventListener('click', () => {
  if (!current) return;
  const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'qhooks-'+(split()?'split':'creator')+'-draft.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
});

exampleBtn.addEventListener('click', () => {
  const example = {
    projectName: split()?'My revenue split':'My creator pool',
    chainId: '31337',
    owner: '0x' + '1'.repeat(40),
    currency0: '0x' + '2'.repeat(40),
    currency1: '0x' + '3'.repeat(40),
    feeBps: '100',
    poolFee: '3000',
    tickSpacing: '60',
    ownerB: '0x'+'4'.repeat(40),
    shareBps: '3333'
  };
  fields().forEach(name => form.elements.namedItem(name).value = example[name]);
  invalidate();
  feedback.textContent = 'Synthetic example loaded. Validate to proceed.';
});
