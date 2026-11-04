import {verifyToken, tokenFromLink, STUDIO_URL} from './codec.mjs';
import {FORM_IDS, prefillGate, prefillPlan, describePlan, neutralBlockDraft} from './plan.mjs';
import {PUBLIC_KEYS} from './trusted-keys.mjs';
import {PRESETS} from '/qx-block-catalog.mjs';
// Display only: friendlier values for the review card (the signed plan is unchanged).
const NICE={notice:{'3600':'1 hour','86400':'1 day','604800':'7 days'}};
const show=(label,value)=>{const v=String(value);const m=/^(\d+) seconds$/.exec(v);if(m)return NICE.notice[m[1]]||v;if(/blocks/i.test(label)){const p=PRESETS.find(x=>x.id===v);if(p)return p.name;}return v;};
const PROTECTED_ACTIONS = ['qj-restore-draft','qj-import-draft','ql-restore','ql-import','qql-go'];
/** Append after bindTokenBrief in l170-journey-entry.mjs; pass its core snapshot.
 * This module only writes public configuration and invokes block-picker controls.
 * It never clicks connect, preview, setup, continue, quick-launch or transaction UI.
 */
export function bindLaunchLink({document:d=document,target=window,snapshot=()=>({}),blocked=false,publicKeys=PUBLIC_KEYS,now=()=>Math.floor(Date.now()/1000)}={}) {
  if (!(target.location.hash || '').startsWith('#launch=')) return {dispose(){},ready:Promise.resolve(false)};
  const href = target.location.href;
  // Consume once; fragments are never included in HTTP Referer. Remove from history
  // as well, before verification. We retain the token only in this closure.
  let token,readError;
  try { token = tokenFromLink(href); } catch (e) { readError = e; }
  try { target.history.replaceState(target.history.state,'',target.location.pathname + target.location.search); } catch { readError = Error('Could not remove the launch payload from history. Open a fresh Studio tab.'); }
  const panel=d.createElement('section'),heading=d.createElement('h2'),summary=d.createElement('p'),details=d.createElement('dl'),image=d.createElement('p'),button=d.createElement('button'),status=d.createElement('p');
  panel.id='qhooks-launch-link';panel.setAttribute('aria-labelledby','qhooks-launch-link-title');panel.className='qtd-form';
  heading.id='qhooks-launch-link-title';heading.textContent='Review your launch link';
  button.id='qhooks-launch-link-apply';button.type='button';button.textContent='Apply to full Studio';button.disabled=true;button.className='workspace-button qtd-primary';
  status.id='qhooks-launch-link-status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  panel.append(heading,summary,details,image,button,status);
  const host=d.getElementById('launch-workspace');if(!host)throw Error('Missing Studio workspace');host.prepend(panel);
  if(!d.querySelector('link[href="/launch-links/launch-links.css"]')){const css=d.createElement('link');css.rel='stylesheet';css.href='/launch-links/launch-links.css';d.head.append(css);}
  const get=id=>d.getElementById(id),fingerprint=()=>JSON.stringify(FORM_IDS.map(id=>[id,get(id)?.value,get(id)?.disabled]));
  const initialFingerprint=fingerprint();
  const existingDraft=['ql-name','ql-symbol','ql-token-funding','ql-quote-funding','ql-blocks'].some(id=>!!get(id)?.value);
  let dead=false,dirty=false,applying=false,verified=null;
  const changed=e=>{
    if(applying)return;
    if(FORM_IDS.includes(e.target?.id)||e.target?.id?.startsWith('qql-')||e.target?.id?.startsWith('qxb-')||e.target?.closest?.('#qx-blocks')||PROTECTED_ACTIONS.includes(e.target?.id))dirty=true;
  };
  for(const type of ['input','change','click'])d.addEventListener(type,changed,true);
  const gate=()=>{
    let neutral=false;try{neutral=neutralBlockDraft(target.sessionStorage.getItem('qhooks:studio-blocks:v1'));}catch{}
    return prefillGate({blocked,dirty,existingDraft:existingDraft||!neutral||!!get('ql-pair')?.value,initialFingerprint,currentFingerprint:fingerprint(),snapshot:snapshot()||{}});
  };
  const showError=e=>{status.textContent=e.message || String(e);button.disabled=true;};
  const apply=async()=>{
    if(dead||!verified||button.disabled)return;
    button.disabled=true;
    try{
      const fresh=await verifyToken(token,{publicKeys,now:now(),subtle:target.crypto.subtle});
      if(dead)return;
      const problem=gate();if(problem)throw Error(problem);
      const plan=prefillPlan(fresh.request),fire=(node,type)=>node.dispatchEvent(new target.Event(type,{bubbles:true}));
      for(const id of FORM_IDS)if(!get(id)||get(id).disabled)throw Error('Studio configuration is unavailable. Keep the current launch unchanged.');
      if(!d.querySelector(`[data-preset="${plan.preset}"]`))throw Error('Studio block picker is unavailable.');
      if(plan.blocks)for(const id of plan.blocks)if(!d.querySelector(`[data-block="${id}"] .qxb-toggle`))throw Error('Studio block controls are unavailable.');
      applying=true;
      // Keep all writes synchronous after the final guard. Chain input/change events
      // are Studio's established public configuration seam.
      get('ql-chain').value=plan.fields['ql-chain'];fire(get('ql-chain'),'change');
      const pair=get('ql-pair');if(pair){pair.value='';fire(pair,'change');}
      for(const [id,value]of Object.entries(plan.fields)){get(id).value=value;fire(get(id),'input');fire(get(id),'change');}
      d.querySelector(`[data-preset="${plan.preset}"]`).click();
      if(plan.blocks)for(const id of plan.blocks)d.querySelector(`[data-block="${id}"] .qxb-toggle`).click();
      if(plan.auctionMinutes){const field=get('qxb-auctionMin');if(!field)throw Error('Opening auction controls unavailable.');field.value=plan.auctionMinutes;fire(field,'input');}
      // Hide the independent quick-launch card, whose defaults would override the
      // full form. The existing full Studio review and wallet flow remain intact.
      const quick=get('qql');if(quick)quick.hidden=true;
      status.textContent='Settings applied to full Studio. Review supply, liquidity, fees and all blocks below, then continue through your wallet and key-backup checks.';
      dirty=true;get('ql-name').focus();
    }catch(e){showError(e);}finally{applying=false;}
  };
  button.addEventListener('click',apply);
  const ready=(async()=>{
    try{
      if(readError)throw readError;
      verified=await verifyToken(token,{publicKeys,now:now(),subtle:target.crypto.subtle});
      if(dead)return false;
      const plan=prefillPlan(verified.request);
      const chainName=({'8453':'Base','4663':'Robinhood Chain','1':'Ethereum','42161':'Arbitrum One','56':'BNB Chain'})[verified.request.chainId];
      summary.textContent=verified.request.name+' ('+verified.request.ticker+') on '+chainName;
      for(const [label,value]of describePlan(plan)){if(/inflow target/i.test(label)&&String(value)==='0')continue;const row=d.createElement('div'),term=d.createElement('dt'),description=d.createElement('dd');term.textContent=label;description.textContent=show(label,value);row.append(term,description);details.append(row);}
      if(plan.image){const a=d.createElement('a');a.href=plan.image;a.textContent='Open attached image reference';a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';image.append(a,d.createTextNode(' · Image reference only; Studio has no token-image launch field.'));}
      const problem=gate();if(problem)throw Error(problem);
      button.disabled=false;status.textContent='Signed settings verified. Apply them only if these are the settings you intend to review and sign.';return true;
    }catch(e){if(!dead)showError(e);return false;}
  })();
  function dispose(){dead=true;button.disabled=true;button.removeEventListener('click',apply);for(const type of ['input','change','click'])d.removeEventListener(type,changed,true);target.removeEventListener('pagehide',dispose);}
  target.addEventListener('pagehide',dispose);
  return {ready,dispose};
}
