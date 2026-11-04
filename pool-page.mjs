// Public toolkit and unsigned-draft UI only. No crypto imports, wallet API or secrets.
import {parsePoolTransfer} from './pool-form.mjs';
const fixedDigest='62add93977e4b82135922a1534e6b6c3fe3c78e7bf4cb3077a94326fc14be72b';
export function validatePoolArtifact(a){
 if(!a||a.schemaVersion!==1||a.kind!=='qhooks-compiled-pool'||a.projectInputSha256!==fixedDigest||a.sourceInputSha256!==fixedDigest||a.compiled!==true||a.deployed!==false||a.sourceCount!==9||a.configuration?.chainId!=='31337'||a.configuration?.profile!=='SLH-DSA-SHA2-128s')throw new TypeError('Wrong QPool toolkit');
 for(const name of ['verifier','pool']){const c=a.contracts?.[name];if(!c||!Array.isArray(c.abi)||!c.abi.length||typeof c.bytecode!=='string'||!/^0x(?:[0-9a-f]{2})+$/.test(c.bytecode)||typeof c.deployedBytecode!=='string'||!/^0x(?:[0-9a-f]{2})+$/.test(c.deployedBytecode)||c.bytecode.length>98306||c.deployedBytecode.length>49154||c.runtimeBytes!==(c.deployedBytecode.length-2)/2)throw new TypeError('Invalid compiled contract');}
 return a;
}
export function renderPoolBuildSummary(container,artifact){
 const a=validatePoolArtifact(artifact),d=container.ownerDocument,section=d.createElement('section');section.className='build-summary';
 const h=d.createElement('h2');h.textContent='Ready for local integration';section.appendChild(h);
 const dl=d.createElement('dl');for(const[label,value]of [['Profile','SLH-DSA-SHA2-128s'],['Shared verifier',a.contracts.verifier.runtimeBytes+' runtime bytes'],['Custody pool',a.contracts.pool.runtimeBytes+' runtime bytes'],['Included','2 contracts · 9 source files · ABI · bytecode'],['Network','Local EVM · chain 31337']]){const dt=d.createElement('dt'),dd=d.createElement('dd');dt.textContent=label;dd.textContent=value;dl.appendChild(dt);dl.appendChild(dd);}section.appendChild(dl);
 const p=d.createElement('p');p.textContent='Compiled, not deployed. Follow the included setup requirements and verify the complete deployed runtime before enrollment.';section.appendChild(p);container.replaceChildren(section);
}
export function bindPoolPage({document:d=document,target=window,request=fetch,downloadFile=null,pause=()=>new Promise(r=>setTimeout(r,750)),onToolkitReady=()=>{}}={}){
 const $=id=>d.getElementById(id),form=$('pool-draft-form'),build=$('pool-build'),download=$('pool-download'),summary=$('pool-build-summary'),feedback=$('pool-build-feedback');
 let revision=0,pending=null,accepted=null,draft=null;
 const message=(el,text,error=false)=>{el.textContent=text;el.dataset.error=String(error);};
 const clearDraft=()=>{draft=null;$('pool-draft-download').disabled=true;$('pool-draft-preview').hidden=true;$('pool-draft-preview').textContent='';message($('pool-draft-feedback'),'');};
 function mode(){clearDraft();const withdraw=form.elements.kind.value==='withdraw';$('pool-recipient-label').hidden=!withdraw;form.elements.recipient.disabled=!withdraw;form.elements.recipient.required=withdraw;if(!withdraw)form.elements.recipient.value='';}
 form.addEventListener('input',clearDraft);form.elements.kind.addEventListener('change',mode);
 form.addEventListener('submit',event=>{event.preventDefault();clearDraft();try{const action=parsePoolTransfer(Object.fromEntries(['kind','amount','recipient'].map(k=>[k,form.elements[k].value])));draft=Object.freeze({schemaVersion:1,kind:'qhooks-unsigned-native-pool-draft',chainId:'31337',signed:false,submitted:false,action});$('pool-draft-preview').textContent=JSON.stringify(draft,null,2);$('pool-draft-preview').hidden=false;$('pool-draft-download').disabled=false;message($('pool-draft-feedback'),'Unsigned draft ready. No funds moved.');}catch{message($('pool-draft-feedback'),'Enter a positive whole-number amount in wei and, for withdrawals, a nonzero EVM recipient.',true);}});
 $('pool-draft-download').addEventListener('click',()=>{if(!draft)return;if(downloadFile)return downloadFile(draft,'qhooks-pool-draft.json');const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)+'\n'],{type:'application/json'}));const a=d.createElement('a');a.href=url;a.download='qhooks-pool-draft.json';d.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);});
 build.addEventListener('click',async()=>{
  if(pending)return;const rev=++revision,controller=new AbortController();pending=controller;accepted=null;onToolkitReady(false);build.disabled=true;download.disabled=true;summary.hidden=true;summary.replaceChildren();message(feedback,'Compiling your QPool toolkit locally…');
  try{
   const response=await request('/api/pool/build',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:controller.signal});let job=await response.json();
   if(!response.ok||!job||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job.id)||job.projectInputSha256!==fixedDigest)throw Error('Build identity mismatch');
   const id=job.id,deadline=Date.now()+370000;
   while(job.status==='building'){
    if(rev!==revision||controller.signal.aborted)return;if(Date.now()>deadline)throw Error('Build deadline');await pause();if(rev!==revision||controller.signal.aborted)return;
    const poll=await request('/api/pool/build/'+id,{signal:controller.signal});job=await poll.json();if(!poll.ok||job.id!==id||job.projectInputSha256!==fixedDigest)throw Error('Build identity changed');
   }
   if(rev!==revision)return;if(job.status!=='ready')throw Error('Build incomplete');renderPoolBuildSummary(summary,job.artifact);summary.hidden=false;accepted={id};onToolkitReady(true);download.disabled=false;message(feedback,'Toolkit ready. Download it or continue to connected pool setup below.');
  }catch{if(rev===revision)message(feedback,'The local build is unavailable or busy. Try again to retrieve its result.',true);}
  finally{if(pending===controller)pending=null;if(rev===revision)build.disabled=false;}
 });
 download.addEventListener('click',()=>{if(!accepted)return;const a=d.createElement('a');a.href='/api/pool/build/'+accepted.id+'/artifact';a.download='qhooks-pool-toolkit.json';d.body.appendChild(a);a.click();a.remove();});
 function dispose(){revision++;pending?.abort();pending=null;accepted=null;onToolkitReady(false);download.disabled=true;clearDraft();}
 async function toolkitText(){const selected=accepted;if(!selected)throw Error('Build the toolkit first');const response=await request('/api/pool/build/'+selected.id+'/artifact');if(!response.ok)throw Error('Toolkit unavailable');const text=await response.text();if(accepted!==selected||text.length>500000)throw Error('Toolkit changed');return text;}
 target.addEventListener('pagehide',dispose);mode();return Object.freeze({dispose,toolkitText});
}
