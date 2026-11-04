// Lead-owned public draft and download lifecycle. No wallet or crypto imports.
import {createGraduationLabDraft,readGraduationLabDraft,graduationLabStorageKey,graduationSetupNames,graduationBootstrapNames} from './graduation-lab-draft.mjs';
import {collectGraduationActionForm} from './graduation-action-form.mjs';
import {renderGraduationLabSummary} from './graduation-lab-summary.mjs';
export function bindGraduationLabPage({document:d,target,fetch:request,downloadFile=null,navigate=url=>{target.location.href=url;}}){
 const $=id=>d.getElementById('ql-'+id),all=[...graduationSetupNames,...graduationBootstrapNames];
 let draft=null,toolkit=null,pending=null,revision=0,dead=false;
 const feedback=(text,error=false)=>{$('feedback').textContent=text;$('feedback').dataset.error=String(error);};
 function render(){if(dead)return;const mode=$('mode').value;$('destination').hidden=mode==='2';$('threshold-label').hidden=mode!=='0';renderGraduationLabSummary($('summary'),draft,!!toolkit);
  for(const id of ['save','download-draft','continue'])$(id).disabled=!draft;
  $('package').disabled=!draft||!!pending;$('download-toolkit').disabled=!toolkit;
 }
 function invalidate(){revision++;pending?.abort();pending=null;draft=null;toolkit=null;render();}
 function download(text,name){if(downloadFile)return downloadFile(text,name);const u=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=d.createElement('a');a.href=u;a.download=name;d.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
 function install(next){invalidate();for(const k of all)$(k).value='';for(const[k,v]of Object.entries(next.setup))$(k).value=v;for(const[k,v]of Object.entries(next.bootstrap))if(k!=='kind')$(k).value=v;draft=next;render();}
 function save(){if(!draft)throw Error('Validate first');target.localStorage.setItem(graduationLabStorageKey,JSON.stringify(draft));}
 $('form').addEventListener('submit',event=>{event.preventDefault();invalidate();try{draft=createGraduationLabDraft(Object.fromEntries(graduationSetupNames.map(k=>[k,$(k).value])),collectGraduationActionForm('bootstrap',k=>$(k).value));feedback('Configuration validated. Review the summary, then export or continue.');}catch(error){feedback(error.message,true);}render();});
 for(const k of all)$(k).addEventListener(k==='mode'?'change':'input',()=>{invalidate();feedback('Configuration changed. Validate it again.');});
 $('example').addEventListener('click',()=>{invalidate();for(const[k,v]of Object.entries({tokenName:'My graduation token',symbol:'GRAD',decimals:'18',totalSupply:'1000000000000000000000000',quoteSupply:'1000000000000000000000000',notice:'3600',mode:'2','source-fee':'3000','source-spacing':'60','dest-fee':'500','dest-spacing':'60',threshold:'1000000000000000000',price:'79228162514264337593543950336',liquidity:'1000000000000000000',lower:'-887220',upper:'887220',salt:'0x'+'0'.repeat(64),max0:'2000000000000000000',max1:'2000000000000000000'}))$(k).value=v;render();feedback('Local example filled. Review every value, then validate.');});
 $('save').addEventListener('click',()=>{try{save();feedback('Public draft saved in this browser.');}catch{feedback('Draft could not be saved. Download a configuration copy.',true);}});
 $('restore').addEventListener('click',()=>{invalidate();try{install(readGraduationLabDraft(target.localStorage.getItem(graduationLabStorageKey)));feedback('Saved draft restored and validated.');}catch{feedback('No valid saved graduation draft was found.',true);}});
 $('import').addEventListener('click',async()=>{invalidate();const rev=revision;try{const file=$('file').files?.[0];if(!file||file.size<1||file.size>4096)throw Error('Invalid file');const next=readGraduationLabDraft(await file.text());if(dead||rev!==revision)return;install(next);feedback('Configuration imported and validated. No transaction was authorized.');}catch{if(!dead&&rev===revision)feedback('Import a public QGraduation configuration, not a backup or transaction journal.',true);}});
 $('download-draft').addEventListener('click',()=>{if(draft)download(JSON.stringify(draft,null,2),'qhooks-graduation-draft.json');});
 $('continue').addEventListener('click',()=>{try{save();navigate('graduation.html');}catch{feedback('Save failed. Download the draft before leaving.',true);}});
 $('package').addEventListener('click',async()=>{
  if(!draft||pending||dead)return;const rev=revision,current=draft,controller=new AbortController();pending=controller;toolkit=null;render();feedback('Preparing your configuration and accepted developer toolkit…');
  try{
   const response=await request('/api/lab/graduation/source',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(current),signal:controller.signal});
   if(!response.ok)throw Error('Toolkit unavailable');const text=await response.text();if(text.length>4*1024*1024)throw Error('Oversized toolkit');const result=JSON.parse(text);
   if(dead||revision!==rev||draft!==current)return;
   if(result.kind!=='qhooks-graduation-toolkit'||result.compiledTemplate!==true||result.configurationEvmTested!==false||result.deployed!==false||result.transactionSubmissionEnabled!==false||!/^[0-9a-f]{64}$/.test(result.toolkitId)||JSON.stringify(result.configuration)!==JSON.stringify(current)||Object.keys(result.contracts||{}).length!==7)throw Error('Toolkit identity mismatch');
   toolkit=text;feedback('Toolkit ready: configuration, compiled template, source snapshots, clients and notices.');
  }catch(error){if(!dead&&rev===revision&&error.name!=='AbortError')feedback('Toolkit unavailable. Your validated draft is still available.',true);}
  finally{if(pending===controller)pending=null;if(!dead&&rev===revision)render();}
 });
 $('download-toolkit').addEventListener('click',()=>{if(toolkit)download(toolkit,'qhooks-graduation-toolkit.json');});
 function dispose(){if(dead)return;dead=true;invalidate();target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);render();return Object.freeze({dispose});
}
