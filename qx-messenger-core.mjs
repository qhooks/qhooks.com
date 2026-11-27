export const MESSENGER='https://qmessenger.chat';
const TOKEN=/^qmnotify_[A-Za-z0-9_-]{43}$/;
const LINK=/^https:\/\/qmessenger\.chat\/u\/[a-f0-9]{64}\.[a-f0-9]{64}$/;
const NOTIFY='qhooks.qm.notify',PENDING='qhooks.qm.pending';
export const enabled=value=>value==='1';
function validDraft(draft){if(typeof draft!=='string'||[...draft].length>200||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(draft))throw Error('Draft must be plain text up to 200 characters');}
export function conversationURL(recipient='',draft=''){
 validDraft(draft);
 if(!recipient)return MESSENGER+'/';
 if(LINK.test(recipient))return recipient; // canonical public inbox link (official contact): opened as is
 if(!/^(?:evm:0x[a-fA-F0-9]{40}|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(recipient))throw Error('Invalid message recipient');
 const u=new URL('/m/'+recipient,MESSENGER);if(draft)u.searchParams.set('draft',draft);return u.href;
}
export function firstTapURL(current,draft=''){
 validDraft(draft);if(current.length>2048)throw Error('Return URL is too long');const here=new URL(current);if(here.origin!=='https://qhooks.com')throw Error('Open QHooks to connect messaging');
 const u=new URL('/connect',MESSENGER);u.searchParams.set('return',here.href);u.searchParams.set('auto','1');if(draft)u.searchParams.set('draft',draft);return u.href;
}
const get=(storage,key)=>{try{return storage?.getItem(key);}catch{return null;}};
const set=(storage,key,value)=>{try{storage?.setItem(key,value);return true;}catch{return false;}};
const remove=(storage,key)=>{try{storage?.removeItem(key);}catch{}};
export function createMessenger({location,history,storage,session,fetcher,visible=()=>true,now=Date.now,onCount=()=>{}}){
 let memory=null,last=-Infinity,inflight=false;
 const token=()=>{const value=memory||get(storage,NOTIFY);return TOKEN.test(value||'')?value:null;};
 function open(recipient='',draft=''){
  const destination=conversationURL(recipient,draft);
  if(LINK.test(destination)){location.assign(destination);return destination;} // public inbox page needs no notify connection
  if(token()){location.assign(destination);return destination;}
  set(session,PENDING,destination);const url=firstTapURL(location.href,draft);location.assign(url);return url;
 }
 function acceptReturn(){
  const u=new URL(location.href),p=new URLSearchParams(u.hash.slice(1));
  if(!p.has('notify'))return false;
  const value=p.get('notify'),link=p.get('link');
  // Remove the fragment before any navigation, even if storage is disabled or input invalid.
  const resume=p.get('resume');history.replaceState(history.state??null,'',u.pathname+u.search+(resume?.startsWith('#')?resume:''));
  if(!TOKEN.test(value||'')||!LINK.test(link||''))return false;
  memory=value;set(storage,NOTIFY,value);
  const pending=get(session,PENDING);remove(session,PENDING);
  // Only locally-created conversation routes can be resumed; never forward the capability.
  if(pending)try{const target=new URL(pending);if(target.origin===MESSENGER&&!target.hash&&(target.pathname==='/'||/^\/m\/(evm:0x[a-fA-F0-9]{40}|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(target.pathname)))location.assign(target.href);}catch{}
  return true;
 }
 async function poll(){
  const value=token();if(!visible()||!value||inflight||now()-last<60000)return;
  last=now();inflight=true;
  try{const response=await fetcher(MESSENGER+'/api/unread-count',{method:'GET',headers:{Authorization:'Bearer '+value},credentials:'omit',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(response.status===401){memory=null;remove(storage,NOTIFY);onCount(0);return;}
   if(!response.ok)return;const body=await response.json();if(Number.isSafeInteger(body.count)&&body.count>=0)onCount(body.count);
  }catch{}finally{inflight=false;}
 }
 return {open,acceptReturn,poll};
}
export function messageButton(document,{enabled:active,recipient='',draft='',label='Message',open}){
 if(!active)return null;const button=document.createElement('button');button.type='button';button.textContent=label;button.className='qhc-secondary';button.dataset.qmMessage='';button.addEventListener('click',()=>open(recipient,draft));return button;
}
// Public token identity only: indexed creator or the listed controller's creator() getter.
export async function verifiedTokenRecipient(body,{chain,controller,rpc,fetcher}){
 if(body?.version!==1||String(body.chainId)!==chain||body.controller?.toLowerCase()!==controller.toLowerCase())return null;
 if(body.creator){const recipient=(chain==='solana'?'solana:':'evm:')+body.creator;try{conversationURL(recipient);return recipient;}catch{return null;}}
 if(chain==='solana'||!rpc||!/^0x[a-fA-F0-9]{40}$/.test(controller))return null;
 try{const response=await fetcher(rpc,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(2000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:controller,data:'0xb387ef92'},'latest']})}),value=response.ok?await response.json():null;
  if(!/^0x0{24}[a-fA-F0-9]{40}$/.test(value?.result||'')||/^0x0+$/.test(value.result))return null;
  return 'evm:0x'+value.result.slice(-40).toLowerCase();
 }catch{return null;}
}
