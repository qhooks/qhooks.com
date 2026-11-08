import {launchShare} from './qx-launch-share.mjs';
import {hasTokenProfile,normalizeTokenProfile} from './qx-token-profile-core.mjs';
function recordedProfile(record){
 const source=record.config||{};
 return normalizeTokenProfile(record.metadata?.links?record.metadata:{description:source.description,image:source.image,banner:source.banner,links:{x:source.x,discord:source.discord,telegram:source.telegram,website:source.website}});
}
export async function readLaunchReadiness(record,{fetcher=fetch,signal}={}){
 launchShare(record);const chain=String(record.chainId),controller=record.addresses.controller.toLowerCase(),token=record.addresses.token.toLowerCase();
 const controllerSignal=new AbortController(),abort=()=>controllerSignal.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,7000);
 const read=async path=>{try{const response=await fetcher(path,{cache:'no-store',signal:controllerSignal.signal});const body=await response.json();return{status:response.status,body};}catch{return{status:0,body:null};}};
 try{
  const[market,profile]=await Promise.all([read('/api/markets/'+chain+'/'+controller),read('/api/token-profiles/'+chain+'/'+controller)]);
  if(signal?.aborted)throw Object.assign(Error('Launch check cancelled.'),{name:'AbortError'});
  const pool=market.body?.pool,constructor=pool?.constructor;
  const matches=String(pool?.chainId)===chain&&pool?.controller?.toLowerCase()===controller&&[constructor?.currency0,constructor?.currency1].some(value=>value?.toLowerCase()===token);
  const listed=market.status===200&&matches?'listed':market.status===404?'missing':'unavailable';
  const sameProfile=String(profile.body?.chainId)===chain&&profile.body?.controller?.toLowerCase()===controller&&profile.body?.token?.toLowerCase()===token;
  let identity='unavailable',profilePublished=null,profileMatchesDraft=null,recordedDraftPresent=null;
  if(listed==='missing')identity='blocked';
  else if(profile.status===200&&sameProfile){
   try{
    const remote=normalizeTokenProfile(profile.body.profile||{}),draft=recordedProfile(record);
    profilePublished=hasTokenProfile(remote);recordedDraftPresent=hasTokenProfile(draft);
    if(!profilePublished)identity='not_published';
    else if(!recordedDraftPresent)identity='existing_profile';
    else{profileMatchesDraft=JSON.stringify(remote)===JSON.stringify(draft);identity=profileMatchesDraft?'published':'draft_differs';}
   }catch{/* An unreadable profile cannot establish that the recorded draft was published. */}
  }
  return{chainId:chain,controller,token,listed,profile:identity,profilePublished,profileMatchesDraft,recordedDraftPresent,checkedAt:Date.now()};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function mountLaunchReadiness(record,{document:doc=document,fetcher=fetch}={}){
 const h=(tag,attrs={},...kids)=>{const node=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))k==='class'?node.className=v:node.setAttribute(k,v);node.append(...kids);return node;};
 let hasDraft=false;try{hasDraft=hasTokenProfile(recordedProfile(record));}catch{}
 const title=h('h3',{},'Your launch page'),facts=h('dl',{class:'qxc-launch-readiness'}),status=h('p',{class:'qxc-fine',role:'status','aria-live':'polite'}),check=h('button',{type:'button'},'Refresh launch page');
 const element=h('section',{class:'qxc-readiness'},title,h('p',{class:'qxc-fine'},'Check the market listing and publish your artwork before sharing it with your community.'),facts,check,status);
 let sequence=0,controller=null,disposed=false;
 const line=(label,value)=>h('div',{class:'qxc-summary-line'},h('dt',{},label),h('dd',{},value));
 async function refresh(){if(disposed)return;const mine=++sequence;controller?.abort();controller=new AbortController();check.disabled=true;status.textContent='Checking your launch page…';
  try{const result=await readLaunchReadiness(record,{fetcher,signal:controller.signal});if(disposed||mine!==sequence)return;
   facts.replaceChildren(line('Market listing',{listed:'Listed',missing:'Not found · reopen the launch record',unavailable:'Could not check · refresh to retry'}[result.listed]),
    line('Published profile',result.profilePublished===true?'Published':result.profilePublished===false?'No profile published':result.profile==='blocked'?'Check the listing first':'Could not check · refresh to retry'),
    line('Recorded artwork & links',{published:'Published',draft_differs:'Differs from published profile · publish this draft below',existing_profile:'No recorded artwork or links',not_published:hasDraft?'Ready to publish below':'No recorded artwork or links',blocked:'Check the listing first',unavailable:'Could not compare · refresh to retry'}[result.profile]));
   status.textContent=result.profile==='draft_differs'?'A profile is published, but it differs from this launch’s recorded draft. Publish the recorded artwork and links below before sharing.':result.listed==='listed'?'Market found. Open trading, share its link, and introduce your token to the community.':'Your saved launch record is retained. Check again or open My QHooks to find the market.';
  }catch(error){if(!disposed&&mine===sequence&&error.name!=='AbortError')status.textContent='The launch page could not be checked. Your record and profile draft are retained.';}finally{if(mine===sequence&&!disposed)check.disabled=false;}
 }
 check.addEventListener('click',refresh);void refresh();return{element,refresh,dispose(){disposed=true;sequence++;controller?.abort();}};
}
