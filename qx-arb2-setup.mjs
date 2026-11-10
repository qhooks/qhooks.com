// Hidden one-off page (2026-11-09, Randall's go): arb recapture on Robinhood Chain. Step 1 creates the hook list (owned by
// the QHooks Safe), step 2 the executor that reads it: v5 since Randall's split change (10% caller, then of the QHOOKS bought
// half is burned and half goes to the QHooks Safe). The v4 executor (burns all) is retired. Each sends pinned init
// code to the deterministic deployer (0x4e59…956C), so each can only land at its fixed address as exactly this code.
// Nothing is sent without ?go=4663, when the code is already there, or before an eth_estimateGas of the exact transaction
// passes. After each send the page re-reads the code at the address and checks its SHA-256. Wallet: the shared wallet hub.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';

const root=document.getElementById('qa2-root'),hub=getWalletHub(window);
const go=new Set((new URLSearchParams(location.search).get('go')||'').split(',').filter(Boolean));
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)n.setAttribute(k,v===true?'':v);n.append(...kids);return n;};
let art,busy=false,status={text:'',tone:''};
async function rpc(method,params){
 const r=await fetch(chainById(art.chainId).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const j=await r.json();if(j.error)throw Error(j.error.message||'Network read failed');return j.result;
}
const sha256=async hex=>{const b=new Uint8Array(hex.slice(2).match(/../g).map(x=>parseInt(x,16)));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');};
/// 'none' (no code), 'ok' (expected code), 'other' (some other code: refuse everything).
async function state(s){const code=await rpc('eth_getCode',[s.address,'latest']);if(code==='0x')return 'none';return (await sha256(code))===s.runtimeSha256?'ok':'other';}
const say=(text,tone='')=>{status={text,tone};render();};
async function send(s){
 if(busy)return;let conn=hub.snapshot().current;if(!conn){hub.open();return;}
 busy=true;say('');const C=art.chainId,name=chainById(C).name;
 try{
  const st=await state(s);
  if(st==='ok'){say(s.name+' is already set up. Nothing to send.','ok');return;}
  if(st==='other')throw Error('Different code is at '+s.address+'. Nothing was sent.');
  if(conn.chainId!==C){say('Switching your wallet to '+name+'…');conn=await hub.switchChain(C);if(conn?.chainId!==C)throw Error('Switch your wallet to '+name+', then try again.');}
  const from=conn.owner,provider=conn.entry.provider,tx={from,to:art.deployer,data:s.data,value:'0x0'};
  try{const est=BigInt(await rpc('eth_estimateGas',[{from,to:tx.to,data:tx.data,value:'0x0'}]));tx.gas='0x'+(est*13n/10n).toString(16);}
  catch{throw Error('This transaction would fail right now. Nothing was sent.');}
  try{const b=await rpc('eth_getBlockByNumber',['latest',false]),tip=BigInt(await provider.request({method:'eth_maxPriorityFeePerGas'}).catch(()=>'0x0'));
   if(b?.baseFeePerGas){tx.maxPriorityFeePerGas='0x'+tip.toString(16);tx.maxFeePerGas='0x'+(BigInt(b.baseFeePerGas)*2n+tip).toString(16);}}catch{}
  if(hub.snapshot().current?.owner!==from)throw Error('Your wallet changed. Try again.');
  say('Confirm in your wallet…');
  const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});
  say('Sent. Waiting for the network…');
  let r=null;for(let i=0;i<180&&!r;i++){r=await rpc('eth_getTransactionReceipt',[hash]).catch(()=>null);if(!r)await new Promise(res=>setTimeout(res,2000));}
  if(!r)throw Error('Still pending. Check your wallet activity, then reload this page.');
  if(r.status!=='0x1')throw Error('The network refused it. Only gas was spent.');
  const after=await state(s);
  say(after==='ok'?s.name+' set up at '+s.address+'.':'Confirmed, but the code at '+s.address+' is not there yet. Reload in a minute.',after==='ok'?'ok':'bad');
 }catch(e){say(/reject|denied|cancel/i.test(e?.message||'')?'Cancelled in your wallet. Nothing was sent.':(e?.message||'That did not go through.'),'bad');}
 finally{busy=false;render();}
}
async function render(){
 art||=await fetch('/full-launch/arb2-rh-v1.json',{cache:'no-store'}).then(r=>r.json());
 const conn=hub.snapshot().current,C=art.chainId,cleared=go.has(C);
 const sts=await Promise.all(art.steps.map(s=>state(s).catch(()=>null)));
 const next=sts.findIndex(x=>x!=='ok'),bad=sts.includes('other');
 const rows=art.steps.map((s,i)=>el('dl',{},el('dt',{},'Step '+(i+1)),el('dd',{},s.name),el('dt',{},'Creates'),el('dd',{},s.address),
  el('dt',{},'Status'),el('dd',{},sts[i]===null?'Refreshing…':sts[i]==='ok'?'Set up':sts[i]==='other'?'Different code at this address':'Not yet')));
 const facts=el('dl',{},el('dt',{},'Chain'),el('dd',{},chainById(C).name+' ('+C+')'),el('dt',{},'Sends to'),el('dd',{},art.deployer+' (standard deployer)'),el('dt',{},'Value'),el('dd',{},'0 · network gas only'));
 let label,disabled=busy,action=null;
 if(sts.includes(null)){label='Refreshing…';disabled=true;}
 else if(bad){label='Not available';disabled=true;}
 else if(next<0){label='All set up';disabled=true;}
 else if(!cleared){label='Waiting for a go';disabled=true;}
 else if(!conn){label='Connect wallet';action=()=>hub.open();}
 else{label='Step '+(next+1)+' of '+art.steps.length+': '+art.steps[next].short;action=()=>send(art.steps[next]);}
 const btn=el('button',{type:'button',class:'qtx-mini qas-go',disabled},label);if(action)btn.addEventListener('click',action);
 root.replaceChildren(facts,...rows,btn,el('p',{class:'qas-status',role:'status','aria-live':'polite','data-tone':status.tone||false},status.text));
}
render().catch(e=>{root.textContent=e.message;});
hub.subscribe(()=>{if(art)render();});
