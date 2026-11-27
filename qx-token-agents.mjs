import {AGENT_AVATARS,mintFormValues,ORBIO_KEY_MESSAGE} from './qx-token-agent-model.mjs';
import {esc,mintSheet,previewTable,profileView} from './qx-token-agent-view.mjs';
const sessionKey='qhooks:board-session:v1';
function session(){try{const s=JSON.parse(localStorage.getItem(sessionKey)||'null'),current=globalThis.QHWallet?.current?.();return s?.token&&s.expiresAt>Date.now()&&(!current?.address||s.wallet===current.address)?s:null;}catch{return null;}}
async function api(action,body,{publicRead=false}={}){
 const s=session();const headers={accept:'application/json',...(s?{authorization:'Bearer '+s.token}:{}),...(body?{'content-type':'application/json'}:{})};
 const response=await fetch((globalThis.QH_API||'')+'/api/agents/token/'+action,{method:body?'POST':'GET',headers,cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'agent_unavailable');return data;
}
async function signedIn(){
 if(session())return;
 if(!globalThis.QHWallet)throw Error('connect_in_app');
 await globalThis.QHWallet.ensure('evm');if(!session())await globalThis.QHOneClick?.check();if(!session())throw Error('sign_in');
}
export async function deriveOrbioKey(provider,wallet){
 if(!provider?.request||!/^0x[0-9a-f]{40}$/i.test(wallet||''))throw Error('connect_wallet');
 const hex='0x'+[...new TextEncoder().encode(ORBIO_KEY_MESSAGE)].map(b=>b.toString(16).padStart(2,'0')).join('');
 const signature=await provider.request({method:'personal_sign',params:[hex,wallet]});
 if(typeof signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature))throw Error('wallet_signature_unavailable');
 const bytes=Uint8Array.from(signature.slice(2).match(/../g),h=>parseInt(h,16));
 return 'sk-orb-0-'+btoa(String.fromCharCode(...bytes));
}
const messages={active_agent_limit:'You already have five active agents. Close one before minting another.',connect_in_app:'Connect and sign in from the /new app, then return here.',wallet_unfunded:'Your agent is minted and paused. Fund your connected wallet before activating it.',plan_not_understood:'Some of the plan could not be parsed. Use clear amounts and price, dip or time triggers.',preview_required:'Review a fresh preview before activating this plan.',agent_key_required:'Attach your wallet-derived Orbio key before activating AI.',agent_encryption_unavailable:'AI key storage is not configured. Your key was not saved.',sign_in:'Sign in with your connected wallet.',agent_unavailable:'Agent data is unavailable. Please retry.'};
function explain(e){return messages[e.message]||'This action could not finish. Your current plan is preserved; check the fields and try again.';}
function formObject(form){return Object.fromEntries(new FormData(form));}
function goProfile(id){if(location.pathname.startsWith('/new')||location.hash.startsWith('#/')){location.hash='#/agents/'+id;}else location.href='/agents/'+id;}
function dialog(html){const previous=document.activeElement,d=document.createElement('dialog');d.className='ta-dialog';d.setAttribute('aria-labelledby','ta-mint-title');d.innerHTML=html;document.body.append(d);d.addEventListener('close',()=>{d.remove();if(previous?.isConnected)previous.focus();},{once:true});d.querySelector('[data-ta-dismiss]')?.addEventListener('click',()=>d.close());d.showModal();return d;}
export function openMintSheet(context={}){
 const d=dialog(mintSheet(context)),form=d.querySelector('form'),notice=d.querySelector('[data-ta-message]'),submit=form.querySelector('[type=submit]'),previewButton=d.querySelector('[data-ta-preview-button]');let preview=null,fingerprint='',previewKey;d.addEventListener('close',()=>{previewKey=undefined;},{once:true});
 const update=()=>{const values=formObject(form),brain=values.brain;if(brain!=='ai')previewKey=undefined;previewButton.textContent=brain==='ai'&&values.sampleAi?'Preview AI · up to '+Math.min(8,+values.callsPerHour||0)+' CREDIT calls':'Preview last 7 days';d.querySelector('[data-ta-signal]').hidden=brain!=='signal';d.querySelector('[data-ta-ai]').hidden=brain!=='ai';d.querySelector('[data-ta-strategy]').hidden=brain==='signal';form.elements.token.required=brain==='levels';form.elements.strategy.required=brain!=='signal';form.elements.selection.required=brain==='signal';if(JSON.stringify(values)!==fingerprint){preview=null;submit.disabled=true;}};
 form.addEventListener('input',update);form.addEventListener('change',update);update();
 previewButton.addEventListener('click',async()=>{if(!form.reportValidity())return;previewButton.disabled=true;notice.textContent='Replaying available own-index history…';
  try{await signedIn();const values=formObject(form),draft=mintFormValues(values);if(draft.brain==='ai'&&values.sampleAi){if(!previewKey){const w=globalThis.QHWallet.current();previewKey=await deriveOrbioKey(w.provider,w.address);}draft.apiKey=previewKey;draft.sampleAi=true;}try{preview=await api('preview',draft);}finally{delete draft.apiKey;}fingerprint=JSON.stringify(values);d.querySelector('[data-ta-preview]').innerHTML=previewTable(preview);submit.disabled=false;notice.textContent='Review the results, coverage and limits before activating.';}catch(e){notice.textContent=explain(e);}finally{previewButton.disabled=false;}
 });
 form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity()||!preview||JSON.stringify(formObject(form))!==fingerprint)return;submit.disabled=true;const draft=mintFormValues(formObject(form));
  try{await signedIn();if(draft.brain==='ai'){notice.textContent='Approve the Orbio key message in your wallet. This authorizes inference using your own CREDIT.';const w=globalThis.QHWallet?.current?.();draft.apiKey=previewKey||await deriveOrbioKey(w?.provider,w?.address);}
   const minted=await api('mint',draft);delete draft.apiKey;
   try{await api('activate',{id:minted.id,previewId:preview.id});}catch{/* The free identity is kept paused; the owner can fund/review on its page. */}
   d.close();goProfile(minted.id);
  }catch(e){notice.textContent=explain(e);submit.disabled=false;}finally{delete draft.apiKey;}
 });return d;
}
async function reviewExisting(p,agent){
 const config=agent.config,plan={...config,chainId:agent.chainId,token:agent.token};delete plan.personal;delete plan.previewId;
 const preview=await api('preview',{name:p.name,avatar:p.avatar,brain:p.brain,plan});
 const d=dialog('<div class="ta-heading"><h2 id="ta-mint-title">Review before activation</h2><button data-ta-dismiss aria-label="Close preview">×</button></div>'+previewTable(preview)+'<p data-ta-message role="status"></p><button class="ta-primary" data-ta-activate>Activate this plan</button>');
 d.querySelector('[data-ta-activate]').onclick=async()=>{try{await api('activate',{id:p.id,previewId:preview.id});d.close();refreshRoute(true);}catch(e){d.querySelector('[data-ta-message]').textContent=explain(e);}};
}
async function editLimits(p){
 const agents=await api('list'),agent=agents.agents.find(a=>a.id===p.id);if(!agent)return;
 const l=agent.config.limits,d=dialog('<form class="ta-form"><div class="ta-heading"><h2 id="ta-mint-title">Plan & limits</h2><button type="button" data-ta-dismiss aria-label="Close settings">×</button></div><ul>'+p.rules.map(r=>'<li>'+esc(r)+'</li>').join('')+(p.brain==='ai'?'<label>Strategy<textarea name="strategy" minlength="8" maxlength="4000">'+esc(agent.config.strategy)+'</textarea></label>':'')+'<div class="ta-fields">'+[['perTradeUsd','Per trade'],['perDayUsd','Per day'],['totalUsd','Total spend'],['maxOpenPositions','Open positions']].map(([k,label])=>'<label>'+label+'<input name="'+k+'" type="number" min="'+(k==='maxOpenPositions'?'1':'0')+'" '+(k==='maxOpenPositions'?'max="20"':'')+' step="'+(k==='maxOpenPositions'?'1':'any')+'" value="'+l[k]+'" required></label>').join('')+'</div><p data-ta-message role="status"></p><button class="ta-primary" type="submit">Save & preview</button></form>');
 d.querySelector('form').onsubmit=async event=>{event.preventDefault();const v=formObject(event.target),limits={...l};for(const k of Object.keys(limits))if(k in v)limits[k]=+v[k];try{await api('edit',{id:p.id,limits,...(p.brain==='ai'?{strategy:v.strategy}:{})});d.close();const next=(await api('list')).agents.find(a=>a.id===p.id);await reviewExisting(p,next);}catch(e){d.querySelector('[data-ta-message]').textContent=explain(e);}};
}
export async function renderProfile(root,id){
 try{const p=await api('profile/'+id,undefined,{publicRead:true});root.innerHTML=profileView(p);
  if(!p.ownerControls)return;const message=root.querySelector('[data-ta-profile-message]');
  root.querySelector('[data-ta-pause]').onclick=async()=>{try{await api(['active','closing'].includes(p.status)?'pause':'resume',{id});await renderProfile(root,id);}catch(e){if(e.message==='preview_required'){const a=(await api('list')).agents.find(a=>a.id===id);await reviewExisting(p,a);}else message.textContent=explain(e);}};
  root.querySelector('[data-ta-close]').onclick=async()=>{try{await api('close',{id});await renderProfile(root,id);}catch(e){message.textContent=explain(e);}};
  root.querySelector('[data-ta-settings]').onclick=()=>editLimits(p).catch(e=>{message.textContent=explain(e);});
  const orbio=root.querySelector('[data-ta-orbio]');if(orbio)orbio.onclick=async()=>{let apiKey;try{await signedIn();const w=globalThis.QHWallet.current();apiKey=await deriveOrbioKey(w.provider,w.address);await api('key',{id:p.id,apiKey});message.textContent='Orbio connected. Preview and activate when your wallet is funded.';}catch(e){message.textContent=explain(e);}finally{apiKey=undefined;}};
 }catch(e){root.innerHTML='<p role="status">'+esc(explain(e))+'</p><button data-ta-retry>Retry</button>';root.querySelector('button').onclick=()=>renderProfile(root,id);}
}
async function renderHome(root,context={}){
 root.innerHTML='<section class="ta-hero"><p class="ta-eyebrow">PERSONAL AGENTS</p><h1>Give your strategy a name.</h1><p>Pick levels, follow sources you choose, or describe your style. Review a seven-day price replay, set hard limits and keep control from your wallet.</p><button class="ta-primary" data-ta-mint>Mint an agent · free</button></section><div data-ta-list role="status">Loading your agents…</div><div data-ta-queue></div>';
 root.querySelector('[data-ta-mint]').onclick=()=>openMintSheet(context);
 const list=root.querySelector('[data-ta-list]');
 if(!session()){list.innerHTML='<p>Sign in to see your agents.</p><button data-ta-signin>Connect & sign in</button>';list.querySelector('button').onclick=()=>signedIn().then(()=>renderHome(root,context)).catch(e=>{list.querySelector('p').textContent=explain(e);});return;}
 try{const [mine,queue]=await Promise.all([api('my'),api('notifications')]);list.removeAttribute('role');list.innerHTML='<div class="ta-agent-grid">'+mine.agents.map(a=>{const avatar=AGENT_AVATARS.find(v=>v.id===a.avatar)||AGENT_AVATARS[0];return '<a class="ta-agent-link" href="'+(location.pathname.startsWith('/new')?'#/agents/':'/agents/')+esc(a.id)+'"><div class="ta-avatar ta-avatar-'+avatar.id+'" aria-hidden="true">'+avatar.glyph+'</div><h3>'+esc(a.name)+'</h3><span>'+esc(a.brain)+' · '+esc(a.status)+'</span></a>';}).join('')+'</div>'+(!mine.agents.length?'<p>Your first agent starts with a plan.</p>':'');
 root.querySelector('[data-ta-queue]').innerHTML=queue.notifications.map(q=>'<div class="ta-queue"><strong>Confirm in your wallet</strong><p>'+esc(q.order.side)+' '+esc(q.order.amountIn??q.order.pctOfPosition+'%')+' · '+esc(q.token)+'</p><a href="/new/#/token/'+esc(q.chainId)+'/'+esc(q.token)+'">Review on the token page</a></div>').join('');
 }catch(e){list.textContent=explain(e);}
}
let enabled=false,scheduled=false;
function refreshRoute(force=false){
 if(!enabled)return;
 const standalone=document.querySelector('[data-personal-agent]');if(standalone){const id=standalone.dataset.personalAgent,target=standalone.querySelector('[data-ta-content]');standalone.querySelector(':scope > h1')?.remove();if(force)delete target.dataset.ready;if(!target.dataset.ready){target.dataset.ready='1';if(id)renderProfile(target,id);else renderHome(target);}return;}
 const route=location.hash.split('?')[0],main=document.querySelector('main.q-main');if(!main)return;
 const profile=/^#\/agents\/([a-zA-Z0-9_-]{1,80})$/.exec(route);
 if(profile){if(force)delete main.dataset.taProfile;if(main.dataset.taProfile!==profile[1]){main.dataset.taProfile=profile[1];main.replaceChildren();const host=document.createElement('div');host.className='ta-personal';main.append(host);renderProfile(host,profile[1]);}return;}
 delete main.dataset.taProfile;
 if(route==='#/agents'){
  if(!main.querySelector('[data-ta-home]')){const host=document.createElement('section');host.className='ta-personal';host.dataset.taHome='1';main.prepend(host);const q=new URLSearchParams(location.hash.split('?')[1]||'');renderHome(host,{token:q.get('token')||'',chainId:q.get('chain')||'8453'});}return;
 }
 const token=/^#\/token\/(\d+)\/(0x[0-9a-f]{40})$/i.exec(route);
 if(token&&!main.querySelector('[data-ta-run]')){const b=document.createElement('button');b.className='ta-run';b.dataset.taRun='1';b.textContent='Run an agent on this token';b.onclick=()=>openMintSheet({chainId:token[1],token:token[2]});main.prepend(b);}
}
export async function mountPersonalAgents(){
 if(globalThis.__qhPersonalAgentsMounting)return;globalThis.__qhPersonalAgentsMounting=true;
 try{const catalog=await api('catalog',undefined,{publicRead:true});enabled=catalog.enabled===true;}catch{return;}
 if(!enabled)return;globalThis.QHPersonalAgents={open:openMintSheet,renderProfile};
 const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;refreshRoute();});};
 window.addEventListener('hashchange',schedule);document.addEventListener('DOMContentLoaded',schedule,{once:true});
 const app=document.getElementById('app');if(app)new MutationObserver(schedule).observe(app,{childList:true});refreshRoute();
}
if(typeof document!=='undefined')mountPersonalAgents();
