// Call-link attribution (2026-11-12): opening a call's Buy button or link (?call=<id>, or the caller's ?ref= on a board)
// is remembered for 24 h in this browser and sent once the wallet is signed in to the community (no new prompts). The
// server keeps it only for the signed-in wallet, so nobody can claim someone else's buys.
const ADDRESS=/^0x[0-9a-fA-F]{40}$/,REF_KEY='qhooks:call-refs:v1',DAY=86400000,POST_ID=/^p[0-9a-v]{12}$/;
function readRefs(storage){try{const v=JSON.parse(storage.getItem(REF_KEY)||'[]');return Array.isArray(v)?v.filter(r=>r&&r.seenAt>Date.now()-DAY).slice(-10):[];}catch{return[];}}
function writeRefs(storage,list){try{storage.setItem(REF_KEY,JSON.stringify(list.slice(-10)));}catch{}}
export function captureCallRef(loc,{storage=globalThis.localStorage,now=Date.now()}={}){
 let q,board='';try{q=new URLSearchParams(loc.search||'');const m=/(?:^#|&)([mt]=\d{1,6}:0x[0-9a-fA-F]{40})/.exec(loc.hash||'');board=m?m[1].toLowerCase():'';}catch{return null;}
 const call=q.get('call')||'',ref=(q.get('ref')||q.get('caller')||'').toLowerCase();
 const item=POST_ID.test(call)?{call,seenAt:now}:ADDRESS.test(ref)&&board?{ref,board,seenAt:now}:null;if(!item)return null;
 const list=readRefs(storage),key=x=>x.call||x.ref+'|'+x.board;
 if(!list.some(x=>key(x)===key(item)))writeRefs(storage,[...list,item]);
 return item;
}
let refBusy=false;
export async function sendCallRefs({storage=globalThis.localStorage,headers=()=>({}),wallet=()=>null,fetcher=(...a)=>fetch(...a)}={}){
 if(refBusy)return 0;const auth=headers();if(!auth?.authorization)return 0;
 const me=String(wallet()||'').toLowerCase(),pending=readRefs(storage).filter(x=>!(x.sentBy||[]).includes(me));if(!pending.length||!me)return 0;
 refBusy=true;
 try{const r=await fetcher('/api/callouts/ref',{method:'POST',cache:'no-store',headers:{'content-type':'application/json',...auth},body:JSON.stringify({items:pending.map(({call,ref,board,seenAt})=>({call,ref,board,seenAt}))})});
  if(!r.ok)return 0;const sent=new Set(pending.map(x=>x.seenAt+'|'+(x.call||x.ref)));
  writeRefs(storage,readRefs(storage).map(x=>sent.has(x.seenAt+'|'+(x.call||x.ref))?{...x,sentBy:[...(x.sentBy||[]),me]}:x));return pending.length;
 }catch{return 0;}finally{refBusy=false;}
}
