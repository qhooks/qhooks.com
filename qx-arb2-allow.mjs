// Hidden one-off page (2026-11-09, Randall's go): the QHooks Safe adds the 4 reviewed hooks to the arb v4 hook list,
// each pinned to its code hash, in ONE Safe transaction (a MultiSendCallOnly batch of 4 allow() calls).
// Same flow as /safe-fomo: no Safe app; one owner calls approveHash, the other owner sends execTransaction with both
// signatures in approved-hash form. Nonce: /safe-fomo holds Safe nonce 2, so this page uses nonce 3 (or the Safe's current
// nonce once it is past 3). Owners can approve early; Send opens only when the Safe is at that nonce. The hash is computed by
// the Safe itself for that nonce, so a stale approval is never used. Nothing is sent before the hook list has the expected
// code and an eth_call of the exact transaction succeeds. After sending, the page checks isAllowed() for all 4 hooks.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';

const OWNERS=[{a:'0x88db60586866294409e47bbbb0b436104f09c1b5',name:'Qhooks 1',full:'0x88Db60586866294409E47BbBb0b436104F09c1B5'},
 {a:'0x9b13398df547c18e68d1cfe086ff1cb5f1a84127',name:'Qhooks2',full:'0x9B13398dF547C18e68d1cFE086Ff1cb5F1a84127'}];
const root=document.getElementById('qa2a-root'),hub=getWalletHub(window);
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)n.setAttribute(k,v===true?'':v);n.append(...kids);return n;};
const pad=a=>a.toLowerCase().slice(2).padStart(64,'0');
let art,busy=false,status={text:'',tone:''};
async function rpc(method,params){
 const r=await fetch(chainById(art.chainId).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const j=await r.json();if(j.error)throw Error(j.error.message||'Network read failed');return j.result;
}
const call=(to,data,from)=>rpc('eth_call',[{to,data,...(from?{from}:{})},'latest']);
const sha256=async hex=>{const b=new Uint8Array(hex.slice(2).match(/../g).map(x=>parseInt(x,16)));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');};
/// getTransactionHash for nonce n: the nonce is the 10th head word of the fixed nonce-3 call.
const hashCall=n=>{const o=2+8+9*64;return art.getHash3.slice(0,o)+n.toString(16).padStart(64,'0')+art.getHash3.slice(o+64);};
async function read(){
 const nonce=BigInt(await call(art.safe,'0xaffed0e0')),target=nonce>BigInt(art.firstNonce)?nonce:BigInt(art.firstNonce);
 const code=await rpc('eth_getCode',[art.hookList,'latest']),list=code==='0x'?'none':(await sha256(code))===art.hookListRuntimeSha256?'ok':'other';
 const hash=await call(art.safe,hashCall(target));
 const approved=await Promise.all(OWNERS.map(o=>call(art.safe,'0x7d832974'+pad(o.a)+hash.slice(2)).then(v=>BigInt(v)!==0n)));
 const allowed=list==='ok'?await Promise.all(art.hooks.map(h=>call(art.hookList,'0xbabcc539'+pad(h)).then(v=>BigInt(v)===1n))):art.hooks.map(()=>false);
 return {nonce,target,list,hash,approved,allowed,done:allowed.every(Boolean)};
}
const say=(text,tone='')=>{status={text,tone};render();};
async function send(kind){
 if(busy)return;let conn=hub.snapshot().current;if(!conn){hub.open();return;}
 busy=true;say('');const C=art.chainId;
 try{
  const s=await read();
  if(s.done){say('All 4 hooks are already on the list. Nothing to send.','ok');return;}
  if(s.list!=='ok')throw Error('The hook list is not set up yet (or has different code). Nothing was sent.');
  if(kind==='exec'&&s.nonce!==s.target)throw Error('The Safe is not at nonce '+s.target+' yet. Nothing was sent.');
  if(conn.chainId!==C){say('Switching your wallet to Robinhood Chain…');conn=await hub.switchChain(C);if(conn?.chainId!==C)throw Error('Switch your wallet to Robinhood Chain, then try again.');}
  const from=conn.owner,me=OWNERS.find(o=>o.a===String(from).toLowerCase());
  if(!me)throw Error('This wallet is not an owner of the QHooks Safe. Nothing was sent.');
  const data=kind==='exec'?art.exec:'0xd4d9bdcd'+s.hash.slice(2),tx={from,to:art.safe,data,value:'0x0'};
  let sim;try{sim=await call(art.safe,data,from);}catch(e){throw Error('This would fail right now ('+(e.message||'reverted')+'). Nothing was sent.');}
  if(kind==='exec'&&BigInt(sim||'0x0')!==1n)throw Error('The Safe would not run it right now. Nothing was sent.');
  try{const est=BigInt(await rpc('eth_estimateGas',[{from,to:art.safe,data,value:'0x0'}]));tx.gas='0x'+(est*13n/10n).toString(16);}
  catch{throw Error('This would fail right now. Nothing was sent.');}
  try{const b=await rpc('eth_getBlockByNumber',['latest',false]),tip=BigInt(await conn.entry.provider.request({method:'eth_maxPriorityFeePerGas'}).catch(()=>'0x0'));
   if(b?.baseFeePerGas){tx.maxPriorityFeePerGas='0x'+tip.toString(16);tx.maxFeePerGas='0x'+(BigInt(b.baseFeePerGas)*2n+tip).toString(16);}}catch{}
  if(hub.snapshot().current?.owner!==from)throw Error('Your wallet changed. Try again.');
  say('Confirm in your wallet…');
  const hash=await conn.entry.provider.request({method:'eth_sendTransaction',params:[tx]});
  say('Sent. Waiting for the network…');
  let r=null;for(let i=0;i<180&&!r;i++){r=await rpc('eth_getTransactionReceipt',[hash]).catch(()=>null);if(!r)await new Promise(res=>setTimeout(res,2000));}
  if(!r)throw Error('Still pending. Check your wallet activity, then reload this page.');
  if(r.status!=='0x1')throw Error('The network refused it. Only gas was spent.');
  const after=await read();
  if(kind==='exec')say(after.done?'Done. All 4 reviewed hooks are on the list.':'Confirmed, but the list does not show all 4 hooks. Reload to check.',after.done?'ok':'bad');
  else say('Approved.','ok');
 }catch(e){say(/reject|denied|cancel/i.test(e?.message||'')?'Cancelled in your wallet. Nothing was sent.':(e?.message||'That did not go through.'),'bad');}
 finally{busy=false;render();}
}
async function render(){
 art||=await fetch('/full-launch/arb2-allow-v1.json',{cache:'no-store'}).then(r=>r.json());
 let s=null;try{s=await read();}catch{}
 const conn=hub.snapshot().current,me=conn&&OWNERS.find(o=>o.a===String(conn.owner).toLowerCase()),other=me&&OWNERS.find(o=>o!==me);
 const facts=el('dl',{},el('dt',{},'Adds'),el('dd',{},'4 reviewed hooks, each pinned to its code hash'),el('dt',{},'To'),el('dd',{},'Hook list '+art.hookList),
  el('dt',{},'From'),el('dd',{},'QHooks Safe '+art.safe+' on Robinhood Chain'),el('dt',{},'Value'),el('dd',{},'0 · network gas only'),
  el('dt',{},'Safe nonce'),el('dd',{},s?String(s.nonce)+(s.nonce<s.target?' (this one uses '+s.target+')':''):'Refreshing…'),
  ...art.hooks.flatMap((h,i)=>[el('dt',{},'Hook '+(i+1)),el('dd',{},h+' · '+(!s?'Refreshing…':s.allowed[i]?'on the list':'not yet'))]),
  ...OWNERS.flatMap((o,i)=>[el('dt',{},o.name),el('dd',{},o.full+' · '+(!s?'Refreshing…':s.approved[i]?'approved':'not yet'))]));
 let label='Connect an owner wallet',action=()=>hub.open(),disabled=busy,note='';
 if(!s){disabled=true;label='Refreshing…';}
 else if(s.done){disabled=true;label='Already done';note='All 4 hooks are on the list.';}
 else if(s.list==='other'){disabled=true;label='Not available';note='The hook list address holds different code. Nothing can be sent from this page.';}
 else if(s.list==='none'){disabled=true;label='Waiting for the hook list';note='Set up the hook list first at /arb2-setup?go=4663 (step 1).';}
 else if(conn&&!me){label='Switch to an owner wallet';note='This wallet is not an owner. Connect Qhooks 1 or Qhooks2.';}
 else if(me){const i=OWNERS.indexOf(me),j=1-i,ready=s.nonce===s.target;
  if(s.approved[j]&&ready){label='Step 2: Add the 4 hooks';action=()=>send('exec');note=OWNERS[j].name+' has approved. Sending from '+me.name+' completes it.';}
  else if(s.approved[j]){disabled=true;label='Waiting for Safe nonce '+s.target;note=OWNERS[j].name+' has approved. The Safe is at nonce '+s.nonce+': finish /safe-fomo (nonce 2) first, then come back to send.';}
  else if(s.approved[i]){disabled=true;label='Waiting for '+other.name;note='Approved by '+me.name+'. Open this page with '+other.name+' ('+other.full+') to send.';}
  else{label='Step 1: Approve as '+me.name;action=()=>send('approve');note='Then open this page with '+other.name+' to send.'+(s.nonce<s.target?' Sending opens after /safe-fomo (Safe nonce 2) is done.':'');}}
 const btn=el('button',{type:'button',class:'qtx-mini qas-go',disabled},label);btn.addEventListener('click',action);
 root.replaceChildren(facts,el('p',{},note),btn,el('p',{class:'qas-status',role:'status','aria-live':'polite','data-tone':status.tone||false},status.text));
}
render().catch(e=>{root.textContent=e.message;});
hub.subscribe(()=>{if(art)render();});
