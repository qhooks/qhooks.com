import {communityTarget,communityKey} from './qx-community-intent.mjs';
import {isElysiumDiscussion} from './qx-community-capabilities.mjs';
const KEY='qhooks:community-following:v1',EVENT='qhooks:community-following',ADDRESS=/^0x[0-9a-fA-F]{40}$/;
export function followSubject(value){
 if(value?.kind==='caller'){if(!ADDRESS.test(value.wallet||''))throw Error('Choose a caller wallet.');return{kind:'caller',wallet:value.wallet.toLowerCase(),label:String(value.label||'').slice(0,80)};}
 const board=communityTarget(value?.board||value);return{kind:'board',board,label:String(value?.label||value?.board?.symbol||value?.symbol||'').slice(0,80)};
}
export const followKey=value=>{const subject=followSubject(value);return subject.kind==='caller'?'u:'+subject.wallet:communityKey(subject.board);};
export function createCommunityFollowing({storage=()=>localStorage,now=Date.now,limit=32}={}){
 let memory=[],dirty=false,persistent=true;
 const normalize=row=>{try{const subject=followSubject(row);return{...subject,addedAt:Number.isFinite(row.addedAt)&&row.addedAt<=now()+60000?row.addedAt:now()};}catch{return null;}};
 function list(){if(!dirty)try{const saved=JSON.parse(storage().getItem(KEY)||'[]');if(Array.isArray(saved))memory=saved.map(normalize).filter(Boolean);}catch{}const unique=new Map();for(const row of memory)unique.set(followKey(row),row);return[...unique.values()].slice(-limit);}
 function write(rows){memory=rows;dirty=true;try{const target=storage(),text=JSON.stringify(rows);target.setItem(KEY,text);dirty=target.getItem(KEY)!==text;persistent=!dirty;}catch{persistent=false;}return list();}
 function has(subject){const key=followKey(subject);return list().some(row=>followKey(row)===key);}
 function set(subject,on){const normalized=followSubject(subject),key=followKey(normalized),rows=list().filter(row=>followKey(row)!==key);if(on){if(rows.length>=limit)throw Error('This device’s following list is full. Unfollow one item first.');rows.push({...normalized,addedAt:now()});}write(rows);return on;}
 return{list,has,set,toggle:subject=>set(subject,!has(subject)),persistent:()=>persistent};
}
export const communityFollowing=createCommunityFollowing();
let serial=0;
export function mountCommunityFollowButton(target,subject,{store=communityFollowing,document:doc=globalThis.document,events=globalThis.window,noun}={}){
 const normalized=followSubject(subject),key=followKey(normalized),button=doc.createElement('button'),note=doc.createElement('small'),id='qcf-note-'+(++serial);button.type='button';button.className='qcf-button';button.setAttribute('aria-describedby',id);note.id=id;note.className='qcf-device-note';
 const update=()=>{const on=store.has(normalized),discussion=normalized.kind==='board'&&isElysiumDiscussion(normalized.board),suffix=noun??(normalized.kind==='caller'?'caller':'token');button.textContent=discussion?(on?'Board saved':'Save board'):(on?'Following':'Follow')+(suffix?' '+suffix:'');button.setAttribute('aria-pressed',String(on));note.textContent=store.persistent()?(discussion?'On this device only. Discussion posts stay on the board.':'Saved on this device'):'Storage unavailable. Kept only while this page is open.';};
 const changed=()=>{if(!target.isConnected){dispose();return;}update();};
 function dispose(){events?.removeEventListener?.(EVENT,changed);events?.removeEventListener?.('storage',changed);}
 button.addEventListener('click',()=>{try{store.toggle(normalized);update();events?.dispatchEvent?.(new CustomEvent(EVENT,{detail:{key,following:store.has(normalized)}}));}catch(error){note.textContent=error.message;}});
 events?.addEventListener?.(EVENT,changed);events?.addEventListener?.('storage',changed);target.classList.add('qcf-control');target.replaceChildren(button,note);update();return{button,dispose,update,setNoun(value){noun=value;update();}};
}
export function followingQuery(store=communityFollowing){const rows=store.list();return{boards:rows.filter(row=>row.kind==='board').map(row=>communityKey(row.board)),callers:rows.filter(row=>row.kind==='caller').map(row=>row.wallet)};}
