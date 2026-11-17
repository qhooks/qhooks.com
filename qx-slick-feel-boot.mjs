import {mountSlickMotion} from './qx-slick-motion.mjs';

// Attach feedback to the existing discovery surface. Data, navigation and
// transaction handlers stay with their original owners.
const mounted=new WeakMap();
export function mountSlickFeelBoot({document:doc=globalThis.document,target=globalThis.window}={}){
 if(!doc||!target)return{dispose(){}};
 if(mounted.has(doc))return mounted.get(doc);
 let disposed=false,feedback=null,host=null,observer=null;
 const attach=()=>{
  if(disposed||feedback)return !!feedback;
  const root=doc.getElementById('qxt-discover'),status=root?.querySelector('.qxfd-status');
  if(!root||!status)return false;
  host=doc.createElement('span');host.className='qxfd-latency-host';host.hidden=true;
  status.after(host);
  feedback=mountSlickMotion({root,statusHost:host});
  observer?.disconnect();observer=null;
  return true;
 };
 const ready=()=>{
  if(attach()||disposed)return;
  const main=doc.getElementById('qxt-main')||doc.body;
  if(main&&!observer){observer=new target.MutationObserver(attach);observer.observe(main,{childList:true});}
 };
 const pagehide=event=>{if(!event.persisted)dispose();};
 const pageshow=event=>{if(event.persisted)ready();};
 function dispose(){
  if(disposed)return;disposed=true;observer?.disconnect();observer=null;
  feedback?.dispose();feedback=null;host?.remove();host=null;
  doc.removeEventListener('DOMContentLoaded',ready);target.removeEventListener('pagehide',pagehide);target.removeEventListener('pageshow',pageshow);
  mounted.delete(doc);
 }
 const controller={dispose};mounted.set(doc,controller);
 target.addEventListener('pagehide',pagehide);target.addEventListener('pageshow',pageshow);
 ready();if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',ready,{once:true});
 return controller;
}
if(typeof document!=='undefined')mountSlickFeelBoot();
