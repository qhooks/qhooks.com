// Additive view wrapper: preserves the accepted launch workspace and transaction APIs.
import {exportSwapPoolPackage} from '../../packages/multichain-swap/pool-package.mjs';
import {tradePoolLink,rememberTradePool} from './trade-pool-links.mjs';
export function bindLaunchTradeHandoff({document:d=document,target=window,downloadFile}={}){
 const $=id=>d.getElementById('qh-trade-'+id),ids=['panel','create','ready','link','url','download','status'];for(const id of ids)if(!$(id))throw Error('Missing launch trade handoff: '+id);
 let workspace=null,packet=null,dead=false;const listeners=[];
 const listen=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push([node,type,fn]);};
 const eligible=s=>!s?.busy&&!s?.saveFailed&&s?.attention!=='connection-changed'&&s?.completed?.includes('bootstrap')&&['1','2'].includes(s?.state?.phase);
 function render(){if(dead)return;const s=workspace?.snapshot();const ready=!!workspace&&eligible(s);$('panel').hidden=!ready;$('create').disabled=!ready;
  if(!ready){packet=null;$('ready').hidden=true;$('download').disabled=true;$('url').value='';$('link').removeAttribute('href');}
 }
 const download=text=>{if(downloadFile)return downloadFile(text,'qhooks-public-pool.json',true);const url=target.URL.createObjectURL(new Blob([text],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download='qhooks-public-pool.json';d.body.appendChild(a);a.click();a.remove();target.setTimeout(()=>target.URL.revokeObjectURL(url),30000);};
 listen($('create'),'click',()=>{
  if(dead||!eligible(workspace?.snapshot()))return;
  try{packet=exportSwapPoolPackage(workspace);const link=tradePoolLink(packet);$('link').href=link;$('url').value=new URL(link,target.location.href).href;$('ready').hidden=false;$('download').disabled=false;
   try{rememberTradePool(target.localStorage,packet);$('status').textContent='Trade link ready. Opening it leaves this launch page and releases its wallet lock.';}catch(error){$('status').textContent='Trade link ready. Could not save the recent-pool shortcut: '+error.message;}
  }catch(error){packet=null;$('ready').hidden=true;$('download').disabled=true;$('status').textContent=error.message;}
 });
 listen($('download'),'click',()=>{if(!dead&&packet&&eligible(workspace?.snapshot()))download(packet);});
 function wrapClient(client){return Object.freeze({...client,async createLaunchWorkspace(options){
  let instance=null;const next=await client.createLaunchWorkspace({...options,onChange(...args){options.onChange?.(...args);if(instance&&workspace===instance)render();}});
  if(dead){next.dispose();throw Error('Launch page closed');}instance=next;workspace=next;packet=null;render();
  return Object.freeze({...next,dispose(){if(workspace===next){workspace=null;render();}next.dispose();}});
 }});}
 function dispose(){if(dead)return;workspace=null;render();dead=true;for(const [node,type,fn]of listeners)node.removeEventListener(type,fn);}
 listen(target,'pagehide',dispose);render();return Object.freeze({wrapClient,dispose});
}
