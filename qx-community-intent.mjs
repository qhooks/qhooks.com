// Public community intent: asset selection, local text recovery and explicit call publication.
// This module never signs or writes merely by loading or restoring a draft.
import {readCallEntry,callEntryError} from './qx-call-entry.mjs';
import {communityCapabilities} from './qx-community-capabilities.mjs';
export const COMMUNITY_CHAINS=Object.freeze([['8453','Base'],['4663','Robinhood Chain'],['1','Ethereum'],['42161','Arbitrum'],['56','BNB Chain'],['solana','Solana']]);
export const COMMUNITY_BOARD_CHAINS=Object.freeze([...COMMUNITY_CHAINS,['99901','Elysium · discussion only']]);
const EVM=/^0x[0-9a-fA-F]{40}$/,POST=/^p[0-9a-v]{12}$/,DRAFT_KEY='qhooks:community-drafts:v2';
export function communityTarget(value){
 const chainId=String(value?.chainId||''),kind=value?.kind==='launch'?'launch':'token',address=String(kind==='launch'?value?.controller||'':value?.address||'');
 if(kind==='launch'? !/^\d{1,6}$/.test(chainId)||!EVM.test(address):!COMMUNITY_BOARD_CHAINS.some(([id])=>id===chainId)||!(chainId==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address):EVM.test(address)))throw Error('Choose a supported chain and full token contract.');
 if(kind==='token'&&chainId==='99901'&&BigInt(address)===0n)throw Error('Enter a token contract on Elysium; the native currency has no token board.');
 return{kind,chainId,[kind==='launch'?'controller':'address']:chainId==='solana'?address:address.toLowerCase()};
}
export const communityKey=value=>{const b=communityTarget(value);return(b.kind==='launch'?'m=':'t=')+b.chainId+':'+(b.controller||b.address);};
export function launchIntroduction(board){
 const target=communityTarget(board),token=String(board?.token||'');
 if(target.kind!=='launch'||!EVM.test(token)||BigInt(token)===0n||BigInt(target.controller)===0n)throw Error('Open a listed launch board to prepare its introduction.');
 const name=String(board.name||'').replace(/[\r\n\t]/g,' ').trim().slice(0,64),symbol=String(board.symbol||'').replace(/[^a-z0-9]/gi,'').slice(0,10);
 if(!name||!symbol)throw Error('The launch identity is unavailable. Refresh the board or write your own introduction.');
 const chain=COMMUNITY_CHAINS.find(([id])=>id===target.chainId)?.[1]||'chain '+target.chainId;
 return `${name} ($${symbol}) is live on ${chain}.\n\nContract: ${token.toLowerCase()}\nTrade and review the pool rules: https://qhooks.com/terminal#${communityKey(target)}`;
}
export function communityPath(board,{intent=false,call,caller}={}){
 const query=new URLSearchParams();if(intent&&communityCapabilities(board).calls)query.set('intent','call');if(POST.test(call||'')&&EVM.test(caller||'')){query.set('call',call);query.set('caller',caller.toLowerCase());query.set('ref',caller.toLowerCase());}
 return'/board'+(query.size?'?'+query:'')+'#'+communityKey(board);
}
export function callLinks(board,post){
 if(!communityCapabilities(board).calls)throw Error('Elysium supports discussion posts here; scored calls are unavailable.');
 const b=communityTarget(board),wallet=String(post?.author||'').toLowerCase();if(!POST.test(post?.id||'')||!EVM.test(wallet))throw Error('The published call did not return its identity.');
 const path=communityPath(b,{call:post.id,caller:wallet}),ref='?ref='+wallet;
 return{path,permalink:'https://qhooks.com/call/'+post.id,board:'https://qhooks.com'+path,firstCall:'https://qhooks.com'+communityPath(b,{intent:true,call:post.id,caller:wallet}),trade:'https://qhooks.com/'+(b.kind==='launch'?'l/'+b.chainId+'/'+b.controller+ref:'terminal'+ref+'#'+communityKey(b))};
}
const ownerKey=owner=>EVM.test(owner||'')?owner.toLowerCase():'guest';
export function createCommunityDrafts({storage=()=>localStorage,now=()=>Date.now(),limit=12,ttl=7*86400000}={}){
 let memory=[],dirty=false,persistent=true;
 const clean=record=>{
  try{const target=communityTarget(record.target),at=Number(record.at);if(!Number.isFinite(at)||at<now()-ttl||at>now()+60000)return null;
   const reply=POST.test(record.reply||'')?record.reply:null;
   return{target,owner:ownerKey(record.owner),reply,post:String(record.post||'').slice(0,1200),call:String(record.call||'').slice(0,560),callMode:!!record.callMode,at,attemptAt:Number.isFinite(record.attemptAt)?record.attemptAt:null};
  }catch{return null;}
 };
 function rows(){if(dirty)return memory.map(clean).filter(Boolean);try{const saved=JSON.parse(storage().getItem(DRAFT_KEY)||'[]');if(Array.isArray(saved))memory=saved.map(clean).filter(Boolean).slice(-limit);}catch{}return memory.map(clean).filter(Boolean);}
 const key=r=>communityKey(r.target)+'|'+ownerKey(r.owner)+'|'+(r.reply||'post');
 function write(values){const useful=values.filter(row=>row.post||row.call||row.attemptAt),empty=values.filter(row=>!row.post&&!row.call&&!row.attemptAt);memory=[...empty.slice(-Math.max(0,limit-useful.length)),...useful].slice(-limit);dirty=true;try{const value=JSON.stringify(memory),target=storage();target.setItem(DRAFT_KEY,value);dirty=target.getItem(DRAFT_KEY)!==value;persistent=!dirty;}catch{persistent=false;}return memory;}
 function read(target,owner='guest',reply=null){return rows().find(r=>key(r)===key({target,owner,reply}))||{target:communityTarget(target),owner:ownerKey(owner),reply,post:'',call:'',callMode:false,at:now(),attemptAt:null};}
 function save(target,owner,draft,reply=null){const value=clean({...draft,target,owner,reply,at:now()});if(!value)return;write([...rows().filter(r=>key(r)!==key(value)),value]);return value;}
 function adopt(target,owner,reply=null){const guest=read(target,'guest',reply),own=read(target,owner,reply);if(!guest.post&&!guest.call)return own;const next=save(target,owner,{...guest,...own,post:own.post||guest.post,call:own.call||guest.call,callMode:guest.callMode,attemptAt:own.attemptAt||guest.attemptAt},reply);write(rows().filter(r=>key(r)!==key(guest)));return next;}
 return{read,save,adopt,persistent:()=>persistent,latest:()=>rows().filter(r=>r.post||r.call).sort((a,b)=>b.at-a.at).slice(0,3)};
}
export async function resolveCommunityToken({chainId,query,signal},fetcher=fetch){
 const chain=String(chainId),q=String(query||'').trim();if(!COMMUNITY_BOARD_CHAINS.some(([id])=>id===chain))throw Error('Choose a supported chain.');if(q.length<2||q.length>200)throw Error('Enter a token name or full contract address.');
 const direct=chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q):EVM.test(q);
 if(chain==='99901'&&!direct)throw Error('Use the full Elysium token contract address. Name search is unavailable.');
 const cancelled=()=>Object.assign(Error('Token search cancelled.'),{name:'AbortError'});if(signal?.aborted)throw cancelled();
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(()=>controller.abort(),12000);signal?.addEventListener('abort',abort,{once:true});
 try{
  const path=direct?'/api/community/token/'+chain+'/'+q:'/api/terminal/x/search?'+new URLSearchParams({q,chain});
  const response=await fetcher(path,{cache:'no-store',signal:controller.signal}),body=await response.json().catch(()=>null);if(signal?.aborted)throw cancelled();if(!body)throw Error('Token search is unavailable. Try again.');if(!response.ok)throw Error(body.error==='unknown_token'?'No token was found at that contract. Check the chain.':'Token search is unavailable. Try again.');
  if(direct){const item=body.redirect?{...body.redirect,kind:'launch'}:body.board;if(!item)throw Error('The token resolver returned no board.');return[{...item,...communityTarget(item)}];}
  return(Array.isArray(body.results)?body.results:[]).flatMap(hit=>{try{return[{...hit,...communityTarget({kind:'token',chainId:hit.chainId,address:hit.address})}];}catch{return[];}}).filter(hit=>hit.chainId===chain).slice(0,8);
 }catch(error){if(error.name==='AbortError'){if(signal?.aborted)throw cancelled();throw Error('Token search timed out. Try again.');}throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function mountCommunityPicker(target,{document:doc=globalThis.document,fetcher=globalThis.fetch,navigate=path=>{location.href=path;},drafts=createCommunityDrafts()}={}){
 const make=(tag,attrs={},...kids)=>{const node=doc.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')node.className=v;else node.setAttribute(k,v);}node.append(...kids);return node;};
 const id=target.id||'community-token',select=make('select',{id:id+'-chain','aria-label':'Token chain'},...COMMUNITY_BOARD_CHAINS.map(([value,label])=>make('option',{value},label))),input=make('input',{id:id+'-query',type:'search',maxlength:'200',placeholder:'Token name or contract address',autocomplete:'off'});
 const submit=make('button',{type:'submit',class:'qa-btn qx-btn qx-btn-primary'},'Find your token'),status=make('p',{class:'qb-status',role:'status','aria-live':'polite'}),results=make('div',{class:'qb-picker-results'});
 const form=make('form',{class:'qb-picker'},make('label',{for:id+'-chain'},'Chain',select),make('label',{for:id+'-query'},'Token',input),submit);
 let generation=0,searchController=null;
 const invalidateSearch=()=>{const hadSearch=!!searchController||results.children.length>0||!!status.textContent;generation++;searchController?.abort();searchController=null;results.replaceChildren();submit.disabled=false;const note=select.value==='99901'?'Use the full Elysium token contract. Discussion only; scored calls and trading are unavailable here.':hadSearch&&input.value.trim()?'Chain or token changed. Use Find your token to search again.':'';if(status.textContent!==note)status.textContent=note;};
 select.addEventListener('change',invalidateSearch);input.addEventListener('input',invalidateSearch);
 form.addEventListener('submit',async event=>{event.preventDefault();const mine=++generation;searchController?.abort();const currentSearch=new AbortController();searchController=currentSearch;submit.disabled=true;status.textContent='Finding your token…';results.replaceChildren();
  try{const hits=await resolveCommunityToken({chainId:select.value,query:input.value,signal:currentSearch.signal},fetcher);if(mine!==generation)return;status.textContent=hits.length?(select.value==='99901'?'Open this contract’s discussion. Reading and drafting need no wallet.':'Choose a token to draft your call. Reading and drafting need no wallet.'):'No matching tokens. Try the full contract and check the chain.';
   results.replaceChildren(...hits.map(hit=>{const calls=communityCapabilities(hit).calls,button=make('button',{type:'button',class:'qa-btn qx-btn qx-btn-primary'},(calls?'Make a call · ':'Start discussion · ')+(hit.symbol||hit.name||'Token'));button.addEventListener('click',()=>navigate(communityPath(hit,{intent:calls})));return make('article',{class:'qb-picker-hit'},make('div',{},make('strong',{},hit.name||hit.symbol||'Token'),make('span',{},COMMUNITY_BOARD_CHAINS.find(([chain])=>chain===hit.chainId)?.[1]||'Chain '+hit.chainId),make('code',{},hit.controller||hit.address)),make('div',{class:'qa-actions cx-actions'},button,make('a',{class:'qa-btn qx-link',href:communityPath(hit)},'Read the board →'))); }));
  }catch(error){if(mine===generation)status.textContent=error.message+' Your draft is unchanged; use Find your token to retry.';}finally{if(mine===generation){submit.disabled=false;searchController=null;}}
 });
 const saved=drafts.latest(),resume=saved.length?make('div',{class:'qb-draft-resume'},make('p',{},'Saved on this browser'),...saved.map(draft=>make('a',{class:'qx-link',href:communityPath(draft.target,{intent:draft.callMode})},'Continue '+(draft.callMode&&communityCapabilities(draft.target).calls?'your call':'your post')+' · '+(COMMUNITY_BOARD_CHAINS.find(([id])=>id===draft.target.chainId)?.[1]||draft.target.chainId)+' · '+(draft.target.controller||draft.target.address).slice(0,8)+'…'))):null;
 target.replaceChildren(form,status,results,...(resume?[resume]:[]));return{form,input,select,status,results};
}
export async function publishCommunityCall({board,thesis,wallet,api,signMessage,current=()=>true,status=()=>{},fetcher=globalThis.fetch,onEntry=()=>{},beforePublish=()=>{}}){
 if(!communityCapabilities(board).calls)throw Error('Elysium supports discussion posts here; scored calls are unavailable.');
 const text=String(thesis||'').trim(),owner=String(wallet||'').toLowerCase(),target=communityTarget(board);if(!EVM.test(owner)||!text||[...text].length>1000)throw Error('Review your wallet and a thesis of up to 1,000 characters.');
 const check=()=>{if(!current())throw Error('Your wallet, token or thesis changed. Review your call before signing again.');};check();
 const entryReady=async()=>{if(target.kind!=='launch')return;status('Checking the indexed call entry quote…');const entry=await readCallEntry({...target,token:board.token},{fetcher});check();onEntry(entry);check();if(entry.state!=='ready')throw callEntryError(entry);};
 await entryReady();check();
 const {message}=await api('/call/message',{method:'POST',auth:true,body:{chainId:target.chainId,...(target.kind==='token'?{address:target.address}:{controller:target.controller}),wallet:owner,thesis:text}});check();
 await entryReady();check();
 status('Sign this call in your wallet. It is free and sends no transaction.');const signature=await signMessage(message);check();
 beforePublish();check();
 const result=await api((target.kind==='token'?'/token/'+target.chainId+'/'+target.address:'/board/'+target.chainId+'/'+target.controller)+'/calls',{method:'POST',auth:true,body:{message,thesis:text,signature}});
 if(!result?.post||result.post.kind!=='call'||result.post.author?.toLowerCase()!==owner)throw Error('Publication did not return the signed call. Check your call record before retrying.');return result.post;
}
export async function recoverCommunityCall({board,wallet,thesis,attemptAt,api}){
 if(!communityCapabilities(board).calls)return null;
 if(!EVM.test(wallet||'')||!Number.isFinite(attemptAt))return null;
 const body=await api('/caller/'+wallet.toLowerCase());return(body.calls||[]).find(post=>{try{return post.kind==='call'&&post.author?.toLowerCase()===wallet.toLowerCase()&&post.text===String(thesis||'').trim()&&post.createdAt>=attemptAt-60000&&communityKey(post.board)===communityKey(board);}catch{return false;}})||null;
}
