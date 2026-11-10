// Hidden one-off page (lead + Randall, 2026-11-09): the QHooks Safe sends 5,000,000 QHOOKS to the fomo team wallet.
// No Safe app or transaction service: owners approve on chain. Step 1, either owner calls approveHash(HASH). Step 2, the
// other owner calls execTransaction with both signatures in approved-hash form (v=1, r=owner), sorted by owner address.
// Every byte sent is fixed below (made with cast). Nothing is sent unless the Safe still computes HASH for nonce 2 and an
// eth_call of the exact transaction succeeds from the connected owner. Wallet: the shared wallet hub (as /arb-setup).
import {getWalletHub} from "/wallet-hub-fresh.mjs";
import {chainById} from "/chains.mjs";
const CHAIN="4663",SAFE="0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71",TOKEN="0x20429af7ca3b0ce4d99edbaa0693f26c5df05195";
const TO="0xA393E27dDf15d08D5f719A43c0a5c2a92DBA2ae5",AMOUNT=5000000n*10n**18n,NONCE=2n;
const HASH="0x24b9043f74b4f190286eff8c350e17ebfe7281d232720d9456fd950358663b20";
const OWNERS=[{a:"0x88db60586866294409e47bbbb0b436104f09c1b5",name:"Qhooks 1",full:"0x88Db60586866294409E47BbBb0b436104F09c1B5"},
 {a:"0x9b13398df547c18e68d1cfe086ff1cb5f1a84127",name:"Qhooks2",full:"0x9B13398dF547C18e68d1cFE086Ff1cb5F1a84127"}];
const APPROVE="0xd4d9bdcd24b9043f74b4f190286eff8c350e17ebfe7281d232720d9456fd950358663b20";
const EXEC="0x6a76120200000000000000000000000020429af7ca3b0ce4d99edbaa0693f26c5df051950000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000044a9059cbb000000000000000000000000a393e27ddf15d08d5f719a43c0a5c2a92dba2ae50000000000000000000000000000000000000000000422ca8b0a00a42500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008200000000000000000000000088db60586866294409e47bbbb0b436104f09c1b50000000000000000000000000000000000000000000000000000000000000000010000000000000000000000009b13398df547c18e68d1cfe086ff1cb5f1a84127000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000";
const GETHASH="0xd8d11f7800000000000000000000000020429af7ca3b0ce4d99edbaa0693f26c5df051950000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000044a9059cbb000000000000000000000000a393e27ddf15d08d5f719a43c0a5c2a92dba2ae50000000000000000000000000000000000000000000422ca8b0a00a42500000000000000000000000000000000000000000000000000000000000000";
const root=document.getElementById("qsf-root"),hub=getWalletHub(window);
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)n.setAttribute(k,v===true?"":v);n.append(...kids);return n;};
let busy=false,status={text:"",tone:""};
async function rpc(method,params){
 const r=await fetch(chainById(CHAIN).rpc,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 const j=await r.json();if(j.error)throw Error(j.error.message||"Network read failed");return j.result;
}
const call=(to,data,from)=>rpc("eth_call",[{to,data,...(from?{from}:{})},"latest"]);
const pad=a=>a.toLowerCase().slice(2).padStart(64,"0");
const fmt=v=>{const w=v/10n**18n,f=(v%10n**18n)/10n**16n;return w.toLocaleString("en-US")+(f?"."+String(f).padStart(2,"0"):"");};
async function read(){
 const [n,h,a0,a1,sb,tb]=await Promise.all([call(SAFE,"0xaffed0e0"),call(SAFE,GETHASH),call(SAFE,"0x7d832974"+pad(OWNERS[0].a)+HASH.slice(2)),
  call(SAFE,"0x7d832974"+pad(OWNERS[1].a)+HASH.slice(2)),call(TOKEN,"0x70a08231"+pad(SAFE)),call(TOKEN,"0x70a08231"+pad(TO))]);
 return {nonce:BigInt(n),hashOk:h.toLowerCase()===HASH,approved:[BigInt(a0)!==0n,BigInt(a1)!==0n],safeBal:BigInt(sb),toBal:BigInt(tb)};
}
const say=(text,tone="")=>{status={text,tone};render();};
async function send(kind){
 if(busy)return;let conn=hub.snapshot().current;if(!conn){hub.open();return;}
 busy=true;say("");
 try{
  const s=await read();
  if(s.nonce!==NONCE||!s.hashOk)throw Error("The Safe has changed since this page was made. Nothing was sent.");
  if(conn.chainId!==CHAIN){say("Switching your wallet to Robinhood Chain…");conn=await hub.switchChain(CHAIN);if(conn?.chainId!==CHAIN)throw Error("Switch your wallet to Robinhood Chain, then try again.");}
  const from=conn.owner,me=OWNERS.find(o=>o.a===String(from).toLowerCase());
  if(!me)throw Error("This wallet is not an owner of the QHooks Safe. Nothing was sent.");
  const data=kind==="exec"?EXEC:APPROVE,tx={from,to:SAFE,data,value:"0x0"};
  // Simulate the exact transaction first: execTransaction must return true, approveHash must not revert.
  let sim;try{sim=await call(SAFE,data,from);}catch(e){throw Error("This would fail right now ("+(e.message||"reverted")+"). Nothing was sent.");}
  if(kind==="exec"&&BigInt(sim||"0x0")!==1n)throw Error("The Safe would not run it right now. Nothing was sent.");
  try{const est=BigInt(await rpc("eth_estimateGas",[{from,to:SAFE,data,value:"0x0"}]));tx.gas="0x"+(est*13n/10n).toString(16);}
  catch{throw Error("This would fail right now. Nothing was sent.");}
  try{const b=await rpc("eth_getBlockByNumber",["latest",false]),tip=BigInt(await conn.entry.provider.request({method:"eth_maxPriorityFeePerGas"}).catch(()=>"0x0"));
   if(b?.baseFeePerGas){tx.maxPriorityFeePerGas="0x"+tip.toString(16);tx.maxFeePerGas="0x"+(BigInt(b.baseFeePerGas)*2n+tip).toString(16);}}catch{}
  if(hub.snapshot().current?.owner!==from)throw Error("Your wallet changed. Try again.");
  say("Confirm in your wallet…");
  const hash=await conn.entry.provider.request({method:"eth_sendTransaction",params:[tx]});
  say("Sent. Waiting for the network…");
  let r=null;for(let i=0;i<180&&!r;i++){r=await rpc("eth_getTransactionReceipt",[hash]).catch(()=>null);if(!r)await new Promise(res=>setTimeout(res,2000));}
  if(!r)throw Error("Still pending. Check your wallet activity, then reload this page.");
  if(r.status!=="0x1")throw Error("The network refused it. Only gas was spent.");
  const after=await read();
  if(kind==="exec")say(after.nonce===NONCE+1n?"Done. 5,000,000 QHOOKS sent to "+TO+".":"Confirmed. Reload to check the result.",after.nonce===NONCE+1n?"ok":"");
  else say("Approved.","ok");
 }catch(e){say(/reject|denied|cancel/i.test(e?.message||"")?"Cancelled in your wallet. Nothing was sent.":(e?.message||"That did not go through."),"bad");}
 finally{busy=false;render();}
}
async function render(){
 let s=null;try{s=await read();}catch{}
 const conn=hub.snapshot().current,me=conn&&OWNERS.find(o=>o.a===String(conn.owner).toLowerCase()),other=me&&OWNERS.find(o=>o!==me);
 const facts=el("dl",{},el("dt",{},"Send"),el("dd",{},"5,000,000 QHOOKS"),el("dt",{},"To"),el("dd",{},TO),el("dt",{},"From"),el("dd",{},"QHooks Safe "+SAFE+" on Robinhood Chain"),
  el("dt",{},"Safe holds"),el("dd",{},s?fmt(s.safeBal)+" QHOOKS":"Refreshing…"),
  ...OWNERS.flatMap(o=>[el("dt",{},o.name),el("dd",{},o.full+" · "+(!s?"Refreshing…":s.approved[OWNERS.indexOf(o)]?"approved":"not yet"))]));
 let label="Connect an owner wallet",action=()=>hub.open(),disabled=busy,note="";
 if(!s){disabled=true;label="Refreshing…";}
 else if(s.nonce>NONCE){disabled=true;label="Already done";note="The Safe has moved past this transaction. 0xA393…2ae5 holds "+fmt(s.toBal)+" QHOOKS.";}
 else if(!s.hashOk||s.nonce!==NONCE){disabled=true;label="Not available";note="The Safe does not match this transaction. Nothing can be sent from this page.";}
 else if(s.safeBal<AMOUNT){disabled=true;label="Not available";note="The Safe holds less than 5,000,000 QHOOKS.";}
 else if(conn&&!me){label="Switch to an owner wallet";note="This wallet is not an owner. Connect Qhooks 1 or Qhooks2.";}
 else if(me){const i=OWNERS.indexOf(me),j=1-i;
  if(s.approved[j]){label="Step 2: Send 5,000,000 QHOOKS";action=()=>send("exec");note=OWNERS[j].name+" has approved. Sending from "+me.name+" completes it.";}
  else if(s.approved[i]){disabled=true;label="Waiting for "+other.name;note="Approved by "+me.name+". Open this page with "+other.name+" ("+other.full+") to send.";}
  else{label="Step 1: Approve as "+me.name;action=()=>send("approve");note="Then open this page with "+other.name+" to send.";}}
 const btn=el("button",{type:"button",class:"qtx-mini qas-go",disabled},label);btn.addEventListener("click",action);
 root.replaceChildren(facts,el("p",{},note),btn,el("p",{class:"qas-status",role:"status","aria-live":"polite","data-tone":status.tone||false},status.text));
}
render().catch(e=>{root.textContent=e.message;});
hub.subscribe(()=>render());
