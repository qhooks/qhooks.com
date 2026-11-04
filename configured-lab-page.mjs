// Lead-owned public draft/build integration. No wallet, signer, RPC or candidate execution.
import {createCompileSession} from './compile-session.mjs';
import {buildIntegrationKit} from './integration-kit.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function pollDelay(signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new DOMException('View cancelled','AbortError'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},750);
    if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  });
}
export function bindConfiguredLabPage({document:d,target,fetch:request,downloadFile=null,downloadLink=null,pause=pollDelay}, definition) {
  const {base,prefix,sourceCount,controllerName,normalize,fields,readForm,example,slug,storageKey,renderSummary,hookName}=definition;
  const $=id=>d.getElementById(prefix+id), session=createCompileSession();
  let current=null,project=null,jobId=null,pending=null,revision=0,dead=false;
  const key=()=>storageKey($);
  const tell=(text,error=false)=>{$('feedback').textContent=text;$('feedback').dataset.error=String(error);};
  function render(){
    definition.renderFields?.($);
    for(const id of ['save','draft-download'])$(id).disabled=dead||!current;
    $('source').disabled=dead||!current||!!pending;
    $('source-download').disabled=dead||!project;
    $('build').disabled=dead||!project||!!pending;
    for(const id of ['artifact','abi','bytecode','integration'])$(id).disabled=dead||session.snapshot.status!=='ready'||!jobId;
    if(session.snapshot.status!=='ready'){$('summary').hidden=true;$('summary').replaceChildren();}
  }
  function invalidate(){revision++;pending?.abort();pending=null;current=null;project=null;jobId=null;session.invalidate();render();}
  function install(input){const normalized=normalize(input);for(const k of fields(normalized))$(k).value=normalized[k];invalidate();}
  function download(text,name){if(downloadFile)return downloadFile(text,name);const u=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=d.createElement('a');a.href=u;a.download=name;d.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
  function on(id,type,fn){$(id).addEventListener(type,event=>{if(!dead)return fn(event);});}
  async function json(response){const text=await response.text();if(text.length>2097152)throw Error('Response too large');const result=JSON.parse(text);if(!response.ok)throw Error(result.error||'Local service unavailable');return result;}
  on('form','input',()=>{invalidate();tell('Configuration changed. Validate it again.');});
  if(definition.selector)on(definition.selector,'change',()=>{invalidate();tell('Choose your settings, then validate.');});
  on('form','submit',event=>{event.preventDefault();invalidate();try{current=readForm(k=>$(k).value);tell('Configuration validated. Generate your source project to continue.');}catch(error){tell(error.message,true);}render();});
  on('example','click',()=>{install(example($));tell('Example values filled. Review and validate to continue.');});
  on('save','click',()=>{if(!current)return;try{target.localStorage.setItem(key(),JSON.stringify(current));tell('Draft saved in this browser.');}catch{tell('Save unavailable. Download your configuration instead.',true);}});
  on('restore','click',()=>{invalidate();try{const text=target.localStorage.getItem(key());if(!text||text.length>4096)throw Error();const input=JSON.parse(text);if(!definition.matchesSaved(input,$))throw Error();install(input);tell('Draft restored. Validate to continue.');}catch{tell('No valid saved draft for this template.',true);}});
  on('draft-download','click',()=>{if(current)download(JSON.stringify(current,null,2),'qhooks-'+slug(current)+'-configuration.json');});
  on('source-download','click',()=>{if(project)download(JSON.stringify(project,null,2),'qhooks-'+slug(current)+'-source-project.json');});
  on('source','click',async()=>{
    if(!current||pending)return;
    const rev=revision,config=current,controller=new AbortController();pending=controller;project=null;jobId=null;session.invalidate();render();tell('Preparing your source project…');
    try{
      const result=await json(await request(base+'/source',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(config),signal:controller.signal}));
      if(dead||rev!==revision)return;
      if(result.kind!=='qhooks-source-project'||result.compiled!==false||result.deploymentEnabled!==false||result.sourceCount!==sourceCount||!/^[a-f0-9]{64}$/.test(result.inputSha256)||JSON.stringify(result.configuration)!==JSON.stringify(normalize(config)))throw Error('Source identity mismatch');
      project=result;tell(`Source ready: ${sourceCount} Solidity files, compiler input, helper bytecode and notices. Build when ready.`);
    }catch(error){if(!dead&&rev===revision&&error.name!=='AbortError')tell('Source unavailable: '+error.message,true);}
    finally{if(pending===controller)pending=null;if(!dead&&rev===revision)render();}
  });
  on('build','click',async()=>{
    if(!project||!current||pending)return;
    const rev=revision,config=current,ticket=session.begin(project.inputSha256),controller=new AbortController();pending=controller;jobId=null;render();tell('Compiling your controller and hook in the isolated compiler…');
    try{
      let job=await json(await request(base+'/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(config),signal:controller.signal}));
      if(!uuid.test(job.id)||job.projectInputSha256!==ticket.inputSha256)throw Error('Build identity mismatch');
      const id=job.id,deadline=Date.now()+370000;
      while(job.status==='building'){
        if(Date.now()>deadline)throw Error('Build timed out. Retry to retrieve its cached result.');
        await pause(controller.signal);
        if(dead||rev!==revision)return;
        job=await json(await request(base+'/build/'+id,{signal:controller.signal}));
        if(job.id!==id||job.projectInputSha256!==ticket.inputSha256)throw Error('Build identity changed');
      }
      if(dead||rev!==revision)return;
      if(job.status!=='ready')throw Error(job.error||'Build did not complete');
      const a=job.artifact;
      if(JSON.stringify(a?.configuration)!==JSON.stringify(normalize(config))||a.sourceCount!==sourceCount||a.contracts?.[definition.contractKey||'controller']?.name!==controllerName||(definition.contractKey!=='hook'&&a.contracts?.hook?.name!==hookName(config))||a.integration?.configurationEvmTested!==false||a.integration?.transactionSubmissionEnabled!==false)throw Error('Compiled configuration mismatch');
      if(!session.finish(ticket,a))return;
      renderSummary($('summary'),session.snapshot.artifact);$('summary').hidden=false;jobId=id;tell('Build ready. Download the full project or controller ABI and bytecode.');
    }catch(error){if(!dead&&rev===revision&&error.name!=='AbortError'){session.fail(ticket);tell('Build unavailable: '+error.message,true);}}
    finally{if(pending===controller)pending=null;if(!dead&&rev===revision)render();}
  });
  for(const [id,kind,name] of [['artifact','artifact','qhooks-'+definition.downloadSlug+'-build.json'],['abi','abi',controllerName+'.abi.json'],['bytecode','bytecode',controllerName+'.bytecode.txt']])on(id,'click',()=>{
    if(session.snapshot.status!=='ready'||!jobId)return;const url=base+'/build/'+jobId+'/'+kind;
    if(downloadLink)return downloadLink(url,name);const a=d.createElement('a');a.href=url;a.download=name;d.body.appendChild(a);a.click();a.remove();
  });
  on('integration','click',()=>{
    if(session.snapshot.status!=='ready'||!jobId)return;
    try{
      const kit=buildIntegrationKit(session.snapshot.artifact);
      download(JSON.stringify(kit,null,2)+'\n','qhooks-'+slug(current)+'-integration-kit.json');
      tell('Integration kit downloaded: build, configuration, public constructor inputs and step-by-step guide.');
    }catch{tell('Integration kit unavailable for this build. Download the original build for inspection.',true);}
  });
  definition.initialize?.($,target);
  function dispose(){if(dead)return;dead=true;invalidate();target.removeEventListener('pagehide',dispose);}
  target.addEventListener('pagehide',dispose);render();return Object.freeze({dispose});
}
