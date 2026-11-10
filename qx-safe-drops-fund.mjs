// Hidden page (2026-11-09): funds the weekly QHOOKS drop from the community-rewards lock, one Safe transaction a week.
// Same flow as /safe-fomo and /safe-drops: no Safe app, owners approve on chain. Step 1, either owner calls
// approveHash(hash). Step 2, the other owner calls execTransaction with both approved-hash signatures (v=1).
// The transaction is built in /qdrops-fund.mjs from chain state only (lock 4's announced amount), so both owners'
// pages produce the same hash. The hash is the Safe's own getTransactionHash at its live nonce, so another Safe
// transaction landing first just moves this one to the next number. Nothing is sent unless an eth_call of the exact
// transaction succeeds from the connected owner.
import {getWalletHub} from "/wallet-hub-fresh.mjs";
import {chainById} from "/chains.mjs";
import {FUND,SEL,announceTx,releaseTx,decodeLock,vestedAt,fundStep} from "/qdrops-fund.mjs";
import {safeHashCall,safeExecData} from "/qdrops-core.mjs";
const hub=getWalletHub(window),root=document.getElementById("qsf-root");
const OWNERS=[{a:"0x88db60586866294409e47bbbb0b436104f09c1b5",name:"Qhooks 1",full:"0x88Db60586866294409E47BbBb0b436104F09c1B5"},
 {a:"0x9b13398df547c18e68d1cfe086ff1cb5f1a84127",name:"Qhooks2",full:"0x9B13398dF547C18e68d1cFE086Ff1cb5F1a84127"}];
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)n.setAttribute(k,v===true?"":v);n.append(...kids);return n;};
let busy=false,status={text:"",tone:""};
async function rpc(method,params){
 const r=await fetch(chainById(FUND.chain).rpc,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 const j=await r.json();if(j.error)throw Error(j.error.message||"Network read failed");return j.result;
}
const call=(to,data,from)=>rpc("eth_call",[{to,data,...(from?{from}:{})},"latest"]);
const pad=a=>a.toLowerCase().slice(2).padStart(64,"0"),W=v=>BigInt(v).toString(16).padStart(64,"0");
const fmt=v=>Math.floor(Number(v/10n**18n)).toLocaleString("en-US");
const when=s=>new Date(s*1000).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"});
async function read(){
 const [n,lockHex,vestedHex,blk,dropsFunded,safeBal]=await Promise.all([call(FUND.safe,"0xaffed0e0"),call(FUND.qlocks,"0x"+SEL.get+W(FUND.lockId)),call(FUND.qlocks,"0x"+SEL.vested+W(FUND.lockId)),
  rpc("eth_getBlockByNumber",["latest",false]),call(FUND.drops,"0x"+SEL.funded+pad(FUND.qhooks)),call(FUND.qhooks,"0x"+SEL.balanceOf+pad(FUND.safe))]);
 const lock=decodeLock(lockHex),now=Number(BigInt(blk.timestamp)),free=BigInt(vestedHex)-lock.claimed,step=fundStep(lock,now,free);
 const tx=step.step==="release"?releaseTx(step.amount):step.step==="announce"||step.step==="short"?announceTx():null;
 const nonce=BigInt(n),hash=tx?await call(FUND.safe,safeHashCall(tx,nonce)):null;
 const approved=hash?(await Promise.all(OWNERS.map(o=>call(FUND.safe,"0x7d832974"+pad(o.a)+hash.slice(2))))).map(x=>BigInt(x)!==0n):[false,false];
 return {nonce,lock,now,free,step,tx,hash,approved,dropsFunded:BigInt(dropsFunded),safeBal:BigInt(safeBal)};
}
const say=(text,tone="")=>{status={text,tone};render();};
async function send(kind){
 if(busy)return;let conn=hub.snapshot().current;if(!conn){hub.open();return;}
 busy=true;say("");
 try{
  const s=await read();
  if(!s.tx)throw Error("Nothing to sign right now. Nothing was sent.");
  if(conn.chainId!==FUND.chain){say("Switching your wallet to Robinhood Chain…");conn=await hub.switchChain(FUND.chain);if(conn?.chainId!==FUND.chain)throw Error("Switch your wallet to Robinhood Chain, then try again.");}
  const from=conn.owner,me=OWNERS.find(o=>o.a===String(from).toLowerCase());
  if(!me)throw Error("This wallet is not an owner of the QHooks Safe. Nothing was sent.");
  const data=kind==="exec"?safeExecData(s.tx,OWNERS.map(o=>o.a)):"0xd4d9bdcd"+s.hash.slice(2),tx={from,to:FUND.safe,data,value:"0x0"};
  let sim;try{sim=await call(FUND.safe,data,from);}catch(e){throw Error("This would fail right now ("+(e.message||"reverted")+"). Nothing was sent.");}
  if(kind==="exec"&&BigInt(sim||"0x0")!==1n)throw Error("The Safe would not run it right now. Nothing was sent.");
  try{const est=BigInt(await rpc("eth_estimateGas",[{from,to:FUND.safe,data,value:"0x0"}]));tx.gas="0x"+(est*13n/10n).toString(16);}
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
  if(kind!=="exec")say("Approved.","ok");
  else if(s.step.step==="release")say("Done. "+fmt(s.step.amount)+" QHOOKS moved into drops, and next week's 250,000 is announced.","ok");
  else say("Done. 250,000 QHOOKS announced. It can move into drops in 7 days.","ok");
 }catch(e){say(/reject|denied|cancel/i.test(e?.message||"")?"Cancelled in your wallet. Nothing was sent.":(e?.message||"That did not go through."),"bad");}
 finally{busy=false;render();}
}
function stepText(s){
 const st=s.step;
 if(st.step==="announce")return {title:"Announce this week's 250,000 QHOOKS",what:(st.expired?"Last week's announcement went unused and expired. ":"")+"Starts the lock's 7-day public notice. In 7 days this page moves it into drops."};
 if(st.step==="short")return {title:"Announce 250,000 QHOOKS again",what:"The current announcement asks for "+fmt(st.amount)+" but only "+fmt(st.free)+" has unlocked. A fresh 250,000 announcement replaces it."};
 if(st.step==="wait")return {title:"Notice running",what:fmt(st.amount)+" QHOOKS is announced. It can move into drops from "+when(st.readyAt)+"."};
 if(st.step==="release")return {title:"Move "+fmt(st.amount)+" QHOOKS into drops",what:"Withdraws it from the lock, deposits it into QDrops, and announces next week's 250,000 in the same transaction. Do it before "+when(st.expiresAt)+"."};
 return {title:"Not available",what:"The lock's beneficiary is not the QHooks Safe."};
}
async function render(){
 let s=null;try{s=await read();}catch{}
 const conn=hub.snapshot().current,me=conn&&OWNERS.find(o=>o.a===String(conn.owner).toLowerCase()),other=me&&OWNERS.find(o=>o!==me);
 const t=s?stepText(s):{title:"Refreshing…",what:""};
 const facts=el("dl",{},
  el("dt",{},"Lock"),el("dd",{},"Community rewards, QLocks "+FUND.qlocks+" #"+FUND.lockId+(s?" · "+fmt(s.lock.total)+" QHOOKS, unlocks about 291,667 a week":"")),
  el("dt",{},"Unlocked so far"),el("dd",{},s?fmt(s.free+s.lock.claimed)+" · moved out "+fmt(s.lock.claimed):"Refreshing…"),
  el("dt",{},"Announced"),el("dd",{},!s?"Refreshing…":s.lock.announced===0n?"Nothing yet":fmt(s.lock.announced)+" · ready "+when(s.lock.readyAt)),
  el("dt",{},"Drops"),el("dd",{},"QDrops "+FUND.drops+(s?" · deposited so far "+fmt(s.dropsFunded)+" QHOOKS":"")),
  el("dt",{},"Weekly drop"),el("dd",{},"250,000 QHOOKS to holders and stakers each week, first week Nov 17 to Nov 24"),
  el("dt",{},"This step"),el("dd",{},t.title),
  el("dt",{},"Safe transaction"),el("dd",{},s?(s.hash?"#"+s.nonce+" · "+s.hash:"#"+s.nonce+" · nothing to sign now"):"Refreshing…"),
  ...OWNERS.flatMap(o=>[el("dt",{},o.name),el("dd",{},o.full+" · "+(!s?"Refreshing…":!s.hash?"nothing to sign":s.approved[OWNERS.indexOf(o)]?"approved":"not yet"))]));
 let label="Connect an owner wallet",action=()=>hub.open(),disabled=busy,note=t.what;
 if(!s){disabled=true;label="Refreshing…";}
 else if(!s.tx){disabled=true;label=s.step.step==="wait"?"Ready "+when(s.step.readyAt):"Not available";}
 else if(conn&&!me){label="Switch to an owner wallet";note+=" This wallet is not an owner. Connect Qhooks 1 or Qhooks2.";}
 else if(me){const i=OWNERS.indexOf(me),j=1-i;
  if(s.approved[j]){label="Step 2: Send";action=()=>send("exec");note+=" "+OWNERS[j].name+" has approved. Sending from "+me.name+" completes it.";}
  else if(s.approved[i]){disabled=true;label="Waiting for "+other.name;note+=" Approved by "+me.name+". Open this page with "+other.name+" to send.";}
  else{label="Step 1: Approve as "+me.name;action=()=>send("approve");note+=" Then open this page with "+other.name+" to send.";}}
 const btn=el("button",{type:"button",class:"qtx-mini qas-go",disabled},label);btn.addEventListener("click",action);
 root.replaceChildren(el("h2",{},t.title),facts,el("p",{},note),btn,el("p",{class:"qas-status",role:"status","aria-live":"polite","data-tone":status.tone||false},status.text));
}
render().catch(e=>{root.textContent=e.message;});
hub.subscribe(()=>render());
