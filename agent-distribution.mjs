import {cursorInstallLink} from './qx-agents-setups.mjs';
import {agentActivityView} from './agent-activity-core.mjs';
const ENDPOINT='https://qhooks.com/mcp';
export function renderAgentActivity(root,value,{now=Date.now()}={}){
 const view=agentActivityView(value,{now});root.hidden=!view;if(!view){root.querySelector('[data-agent-activity-values]')?.replaceChildren();return false;}
 const doc=root.ownerDocument,values=root.querySelector('[data-agent-activity-values]');values.replaceChildren(...view.metrics.map(v=>{const item=doc.createElement('div'),number=doc.createElement('strong'),label=doc.createElement('span');number.textContent=new Intl.NumberFormat('en-US').format(v.count);label.textContent=v.label;item.append(number,label);return item;}));
 root.querySelector('[data-agent-activity-note]').textContent='UTC · recorded calls'+(view.includesTests?' · includes test traffic':'')+'. Plans need a wallet signature; QProof reads stored verdicts.';return true;
}
export function mountAgentDistribution({document:doc=document,fetcher=(...a)=>fetch(...a),navigator:nav=globalThis.navigator,timers=globalThis,now=Date.now}={}){
 if(doc.querySelector('meta[name="qhooks-agent-distribution"]')?.content!=='1')return {dispose(){}};
 const roots=[...doc.querySelectorAll('[data-agent-activity]')],plug=doc.querySelector('[data-agent-plug]');if(!roots.length)return {dispose(){}};let disposed=false,readAt=-Infinity,pending=null,observer,snapshot=null,expiry;
 // A zero-height position marker stays observable when the strip is hidden.
 // The strip itself is observed once shown; the hero never controls polling.
 const positions=roots.map(root=>{const marker=doc.createElement('span');marker.setAttribute('aria-hidden','true');marker.style.cssText='display:block;height:0;pointer-events:none';root.before(marker);return {root,marker};});
 if(plug){const source=plug.dataset.agentSource,install=cursorInstallLink(source);plug.querySelector('[data-agent-cursor]').href=install;
  for(const b of plug.querySelectorAll('[data-agent-copy]'))b.addEventListener('click',async()=>{const value=b.dataset.agentCopy==='cursor'?install:ENDPOINT,feedback=plug.querySelector('[data-agent-copy-feedback]'),manual=plug.querySelector('[data-agent-manual-copy]');try{if(!nav?.clipboard?.writeText)throw Error('clipboard');await nav.clipboard.writeText(value);manual.hidden=true;feedback.textContent=b.dataset.agentCopy==='claude'?'Copied. In Claude: Customize → Connectors → Add custom connector. Paste the URL and choose No sign in.':b.dataset.agentCopy==='cursor'?'Cursor installation link copied. Open it to review the connection in Cursor.':'MCP endpoint copied.';}catch{manual.hidden=false;manual.value=value;manual.focus();manual.select();feedback.textContent='Select the address and copy it.';}feedback.hidden=false;});
 }
 const visible=()=>positions.some(({root,marker})=>{const box=(root.hidden?marker:root).getBoundingClientRect();return box.bottom>=0&&box.top<=doc.defaultView.innerHeight+300;});
 function revalidate(){
  timers.clearTimeout(expiry);expiry=undefined;
  if(disposed)return;
  const time=now(),view=agentActivityView(snapshot,{now:time});
  for(const root of roots)renderAgentActivity(root,view?snapshot:null,{now:time});
  if(!view){snapshot=null;return;}
  // The validator accepts the exact 15-minute boundary; expire the next ms.
  // UTC midnight also invalidates `through`, including Monday week rollover.
  const midnight=new Date(time);midnight.setUTCHours(24,0,0,0);
  const until=Math.min(Date.parse(snapshot.sampledAt)+900001,midnight.getTime());
  expiry=timers.setTimeout(revalidate,Math.max(1,until-time));
 }
 async function load(){revalidate();if(disposed||doc.hidden||!visible()||now()-readAt<300000)return;if(pending)return pending;readAt=now();pending=(async()=>{try{const response=await fetcher('/api/agents/usage',{method:'GET',cache:'no-store',headers:{accept:'application/json'}});if(!response.ok)throw Error('unavailable');const value=await response.json();if(!disposed){snapshot=value;revalidate();}}catch{if(!disposed){snapshot=null;revalidate();}}finally{pending=null;}})();return pending;}
 if(doc.defaultView?.IntersectionObserver){observer=new doc.defaultView.IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void load();},{rootMargin:'300px'});for(const {root,marker} of positions){observer.observe(root);observer.observe(marker);}}else void load();
 const tick=timers.setInterval(()=>void load(),300000),visibleAgain=()=>{revalidate();if(!doc.hidden)void load();};doc.addEventListener('visibilitychange',visibleAgain);
 return {refresh:load,dispose(){disposed=true;observer?.disconnect();timers.clearInterval(tick);timers.clearTimeout(expiry);doc.removeEventListener('visibilitychange',visibleAgain);for(const {marker} of positions)marker.remove();}};
}
if(typeof document!=='undefined'){const app=mountAgentDistribution();addEventListener('pagehide',()=>app.dispose(),{once:true});}
