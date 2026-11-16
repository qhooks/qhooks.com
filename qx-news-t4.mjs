import {node} from './qx-news-ui.mjs';
import {PROOF_CHAINS,proofSubject,proofCard} from './qx-news-t4-core.mjs';
export function mountQuickProof(root,{fetcher=fetch,now=Date.now}={}){
 if(!root)return;let revision=0,controller=null,disposed=false;
 const form=node('form',{class:'nt4-form'}),address=node('input',{type:'text',placeholder:'Paste a token or wallet address',autocomplete:'off',spellcheck:'false','aria-label':'Address for QProof'}),chain=node('select',{'aria-label':'QProof chain'}),check=node('button',{type:'submit',class:'qn-button'},'Check'),status=node('p',{role:'status',class:'qn-note'}),card=node('div');
 chain.append(node('option',{value:''},'Choose chain'),...Object.entries(PROOF_CHAINS).map(([value,label])=>node('option',{value},label)));
 form.append(address,chain,check);root.append(node('header',{class:'qn-panel-head'},node('h2',{},'Instant QProof'),node('a',{class:'qn-link',href:'/qproof'},'Full checker ↗')),form,status,card);
 const changed=()=>{revision++;controller?.abort();controller=null;card.replaceChildren();check.disabled=false;status.textContent='';};address.addEventListener('input',changed);chain.addEventListener('change',changed);
 async function api(path,body,signal){const r=await fetcher('/api/qproof/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal,headers:body?{'content-type':'application/json'}:{accept:'application/json'},...(body?{body:JSON.stringify(body)}:{})}),j=await r.json().catch(()=>null);if(!r.ok)throw Error(r.status===429?'QProof is busy. Try again after '+(r.headers.get('retry-after')||'a short wait')+'.':r.status===503?'QProof is refreshing. Try again shortly.':'QProof could not finish this check. Open the full checker for details.');return j}
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(disposed||check.disabled)return;let subject;try{subject=proofSubject(chain.value,address.value)}catch(e){status.textContent=e.message;return}
  const mine=++revision;controller?.abort();controller=new AbortController();const active=controller,signal=active.signal;let timedOut=false;const timer=setTimeout(()=>{timedOut=true;active.abort()},25000);check.disabled=true;card.replaceChildren();status.textContent='Reading stored QProof…';
  try{
   let report=null,stored=false;
   try{const got=await api('latest?'+new URLSearchParams(subject.chain?{chain:subject.chain,address:subject.address}:{}),null,signal);if(got?.report){proofCard(got.report,subject,now());report=got.report;stored=true}}catch(e){if(signal.aborted)throw e}
   if(mine!==revision||disposed||signal.aborted)return;
   if(!report){status.textContent='Checking this address…';report=(await api('check',{chain:subject.chain,query:subject.address},signal))?.report}
   if(mine!==revision||disposed||signal.aborted)return;
   const value=proofCard(report,subject,now()),count=node('p',{class:'qn-note'},Object.entries(value.counts).map(([kind,n])=>n+' '+({danger:'failed',caution:'caution',clear:'passed',unknown:'not checked'})[kind]).join(' · '));
   card.replaceChildren(node('div',{class:'nt4-verdict','data-level':value.level},node('span',{class:'nt4-level'},value.title),node('code',{},PROOF_CHAINS[subject.chain]+' · '+subject.address),count,node('p',{class:'qn-note'},(stored?'Stored report':'QProof report')+(value.at?' · '+new Date(value.at).toLocaleString():' · Time unavailable')+(!value.fresh?' · Refresh in the full checker for current evidence.':'')),node('a',{href:value.url,class:'qn-link'},'Read the report ↗')));
   status.textContent=''; 
  }catch(e){if(mine===revision&&!disposed&&(e.name!=='AbortError'||timedOut))status.textContent=timedOut?'The check timed out. Tap Check to retry.':e.message}finally{clearTimeout(timer);if(mine===revision){check.disabled=false;controller=null}}
 });
 fetcher('/api/news/qproof-status',{cache:'no-store'}).then(async r=>{const j=await r.json();if(!disposed)root.hidden=!r.ok||j.enabled!==true}).catch(()=>{root.hidden=true});
 const dispose=()=>{disposed=true;revision++;controller?.abort();};addEventListener('pagehide',dispose,{once:true});return {dispose};
}
