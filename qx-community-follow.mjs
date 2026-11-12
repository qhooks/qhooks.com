import {communityTarget,communityKey} from './qx-community-intent.mjs';
import {isElysiumDiscussion} from './qx-community-capabilities.mjs';
import {memberWalletKey} from './qx-member-wallet.mjs';
const KEY='qhooks:community-following:v1',EVENT='qhooks:community-following';
export function followSubject(value){
 if(value?.kind==='caller'||value?.kind==='wallet'){const wallet=memberWalletKey(value.wallet);if(!wallet)throw Error('Choose a caller wallet.');return{kind:'caller',wallet,label:String(value.label||'').slice(0,80)};}
 let board=value?.board||value;if(value?.kind==='token'&&value.wallet){const match=/^([mt])=(solana|\d+):(.+)$/.exec(value.wallet);if(!match)throw Error('Choose a token board.');board={kind:match[1]==='m'?'launch':'token',chainId:match[2],[match[1]==='m'?'controller':'address']:match[3]};}
 board=communityTarget(board);return{kind:'board',board,label:String(value?.label||value?.board?.symbol||value?.symbol||'').slice(0,80)};
}
export const followKey=value=>{const subject=followSubject(value);return subject.kind==='caller'?'u:'+subject.wallet:communityKey(subject.board);};
const payload=subject=>subject.kind==='caller'?{kind:'caller',wallet:subject.wallet,label:subject.label}:{kind:'token',board:subject.board,label:subject.label};
// Snapshot only follow/watch entries; recents and unrelated workspace fields survive.
export function browserFollowImport(storage){
 const subjects=[],cleanups=[];
 const read=key=>{try{return storage().getItem(key);}catch{return null;}};
 const collect=(key,array,make,raw,container)=>{
  const migrated=new Set();for(let index=0;index<array.length;index++)try{subjects.push(followSubject(make(array[index])));migrated.add(index);}catch{}
  if(!migrated.size)return;
  cleanups.push(()=>{if(read(key)!==raw)return;const remaining=array.filter((_,index)=>!migrated.has(index));if(container)storage().setItem(key,JSON.stringify({...container,watched:remaining}));else if(remaining.length)storage().setItem(key,JSON.stringify(remaining));else storage().removeItem(key);});
 };
 for(const key of[KEY,'qhooks:terminal:workspace:v1','qhooks:terminal:watch']){
  const raw=read(key);if(!raw||raw.length>100000)continue;let value;try{value=JSON.parse(raw);}catch{continue;}
  if(key===KEY&&Array.isArray(value))collect(key,value,row=>row,raw);
  if(key==='qhooks:terminal:workspace:v1'&&value?.version===1&&Array.isArray(value.watched))collect(key,value.watched,row=>({kind:'board',board:{kind:row.kind==='launch'||row.controller?'launch':'token',chainId:row.chainId,controller:row.controller,address:row.token||row.address},label:row.symbol||row.name||''}),raw,value);
  if(key==='qhooks:terminal:watch'&&Array.isArray(value))collect(key,value,key=>{const match=/^(\d{1,6}):(0x[0-9a-fA-F]{40})$/.exec(key);if(!match)throw Error('invalid');return{kind:'board',board:{kind:'launch',chainId:match[1],controller:match[2]}};},raw);
 }
 const unique=new Map();for(const row of subjects){const key=followKey(row);unique.set(key,{...row,label:row.label||unique.get(key)?.label||''});}
 return{subjects:[...unique.values()],clear(){for(const cleanup of cleanups)try{cleanup();}catch{}}};
}
export function createCommunityFollowing({storage=()=>localStorage,fetcher=(...args)=>globalThis.fetch(...args),session=()=>null,events=globalThis.window,now=Date.now,limit=1000}={}){
 let memory=[],owner=null,inflight=null,sessionReader=session,configured=false,signInHandler=null;
 const current=()=>{const value=sessionReader?.();return value?.wallet&&value.token&&value.expiresAt>now()?value:null;};
 const notify=()=>events?.dispatchEvent?.(typeof CustomEvent==='function'?new CustomEvent(EVENT):new Event(EVENT));
 const publish=rows=>{const changed=JSON.stringify(memory)!==JSON.stringify(rows);memory=rows;if(changed)notify();};
 function align(){const value=current();if(value?.wallet!==owner){owner=value?.wallet||null;publish([]);}return value;}
 function list(){align();return memory.slice();}
 async function request(path,method,value,auth){const response=await fetcher(path,{method,cache:'no-store',credentials:'omit',redirect:'error',headers:{authorization:'Bearer '+auth.token,...(value?{'content-type':'application/json'}:{})},...(value?{body:JSON.stringify(value)}:{})});const body=await response.json().catch(()=>null);if(!response.ok)throw Error(({sign_in:'Sign in with your wallet to follow.',follow_limit:'Your following list is full. Unfollow an item first.',slow_down:'Too many changes. Try again shortly.'})[body?.error]||'Your following list could not be saved. Try again.');return body;}
 async function refresh(){
  const auth=align();if(!auth)return[];if(inflight?.token===auth.token)return inflight.promise;
  const active=()=>current()?.wallet===auth.wallet&&current()?.token===auth.token;
  const work=(async()=>{
   // Import the one browser-only caller/token list. Do not clear until the server
   // accepts the whole import, and do not erase changes from another tab.
   const legacy=browserFollowImport(storage);
   if(legacy.subjects.length){await request('/api/wallets/follows','PUT',{follows:legacy.subjects.map(payload)},auth);if(active()){legacy.clear();events?.dispatchEvent?.(typeof CustomEvent==='function'?new CustomEvent('qhooks:watch-migrated'):new Event('qhooks:watch-migrated'));}}
   if(!active())return[];
   const result=await request('/api/wallets/follows','GET',null,auth);if(!active())return[];
   if(result.follower!==auth.wallet||!Array.isArray(result.follows))throw Error('The following list did not match your wallet.');
   const unique=new Map();for(const row of result.follows){try{const subject=followSubject(row);unique.set(followKey(subject),{...subject,addedAt:row.since});}catch{}}
   publish([...unique.values()].slice(0,limit));return list();
  })();inflight={token:auth.token,promise:work};try{return await work;}finally{if(inflight?.promise===work)inflight=null;}
 }
 async function set(subject,on){const normalized=followSubject(subject),auth=align();if(!auth)throw Error('Connect and sign in with your wallet to follow.');await request('/api/wallets/follow','POST',{...payload(normalized),on:!!on},auth);await refresh();return on;}
 return{server:true,authHeaders:()=>{const value=align();return value?{authorization:'Bearer '+value.token}:{};},list,has:subject=>list().some(row=>followKey(row)===followKey(subject)),set,toggle:subject=>set(subject,!list().some(row=>followKey(row)===followKey(subject))),refresh,persistent:()=>!!align(),configure(value,{fallback=false,signIn}={}){if(fallback&&configured)return;configured=!fallback;sessionReader=value;signInHandler=signIn||null;align();},async signIn(){if(signInHandler)return signInHandler();const auth=await import('./qx-board-session.mjs');return auth.signIn();}};
}
export const communityFollowing=createCommunityFollowing();
// The canonical session reader checks the currently selected wallet. Loading a
// public page never signs or changes a follow; migration runs only with sign-in.
if(globalThis.window&&globalThis.document)void import('./qx-board-session.mjs').then(auth=>{communityFollowing.configure(()=>auth.boardSession(),{fallback:true});return communityFollowing.refresh();}).catch(()=>{});
export async function migrateCommunityFollowing(session,{storage=()=>localStorage,fetcher=(...args)=>globalThis.fetch(...args),current=()=>true,now=Date.now}={}){
 const store=createCommunityFollowing({storage,fetcher,now,session:()=>current()?session:null});await store.refresh();
 await communityFollowing.refresh().catch(()=>{});
}
let serial=0;
export function mountCommunityFollowButton(target,subject,{store=communityFollowing,document:doc=globalThis.document,events=globalThis.window,noun}={}){
 const normalized=followSubject(subject),button=doc.createElement('button'),note=doc.createElement('small'),id='qcf-note-'+(++serial);button.type='button';button.className='qcf-button';button.setAttribute('aria-describedby',id);note.id=id;note.className='qcf-device-note';note.setAttribute('role','status');
 const update=()=>{const on=store.has(normalized),discussion=normalized.kind==='board'&&isElysiumDiscussion(normalized.board),suffix=noun??(normalized.kind==='caller'?'caller':'token');button.textContent=discussion?(on?'Board saved':'Save board'):(on?'Following':'Follow')+(suffix?' '+suffix:'');button.setAttribute('aria-pressed',String(on));note.textContent='';};
 const changed=()=>{if(!target.isConnected){dispose();return;}update();};
 function dispose(){events?.removeEventListener?.(EVENT,changed);events?.removeEventListener?.('storage',changed);}
 button.addEventListener('click',async()=>{button.disabled=true;try{if(store===communityFollowing&&!store.persistent()){await store.signIn();await store.refresh();}await store.toggle(normalized);update();}catch(error){note.textContent=error.message;}finally{button.disabled=false;}});
 events?.addEventListener?.(EVENT,changed);events?.addEventListener?.('storage',changed);target.classList.add('qcf-control');target.replaceChildren(button,note);update();return{button,dispose,update,setNoun(value){noun=value;update();}};
}
export function followingQuery(store=communityFollowing){const rows=store.list();return{boards:rows.filter(row=>row.kind==='board').map(row=>communityKey(row.board)),callers:rows.filter(row=>row.kind==='caller').map(row=>row.wallet)};}
