// Hidden one-off page (2026-11-10, Randall: "Arb profit was going to switch to liquidity"): the arb executors whose
// non-caller share goes to the QHOOKS floor as WETH liquidity instead of buying and burning QHOOKS. Two taps, each creates
// one contract at its fixed address through the standard deployer: the keeper build (10% to the caller; the M2 bot switches
// to it by itself once this exact code is on chain) and QHooks Arb (open, 85% to the caller; /arb switches to it the same way).
// Same hook list as before, nothing to re-pin. No owner, no Safe step. Nothing is sent without ?go=4663, when code is already
// there, or before an eth_estimateGas of the exact tx passes.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';

const root=document.getElementById('qao-root'),hub=getWalletHub(window);
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
  const rq=art.requireRemoved;if(rq){const v=await Promise.all(rq.hooks.map(h=>rpc('eth_call',[{to:rq.hookList,data:'0xbabcc539'+h.slice(2).padStart(64,'0')},'latest'])));if(v.some(x=>BigInt(x)===1n))throw Error('Hook 0xd531 is still on the list. Sign '+rq.page+' first. Nothing was sent.');}
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
 art||=await fetch('/full-launch/arb-liquidity-rh-v1.json',{cache:'no-store'}).then(r=>r.json());
 const conn=hub.snapshot().current,C=art.chainId,cleared=go.has(C);
 const sts=await Promise.all(art.steps.map(s=>state(s).catch(()=>null)));
 const next=sts.findIndex(x=>x!=='ok'),bad=sts.includes('other');
 const rq=art.requireRemoved;let blocked=rq?null:false;
 if(rq){try{const v=await Promise.all(rq.hooks.map(h=>rpc('eth_call',[{to:rq.hookList,data:'0xbabcc539'+h.slice(2).padStart(64,'0')},'latest'])));blocked=v.some(x=>BigInt(x)===1n);}catch{blocked=null;}}
 const rows=art.steps.map((s,i)=>el('dl',{},el('dt',{},'Step '+(i+1)),el('dd',{},s.name),el('dt',{},'Creates'),el('dd',{},s.address),
  el('dt',{},'Status'),el('dd',{},sts[i]===null?'Refreshing…':sts[i]==='ok'?'Set up':sts[i]==='other'?'Different code at this address':'Not yet')));
 const facts=el('dl',{},el('dt',{},'Chain'),el('dd',{},chainById(C).name+' ('+C+')'),el('dt',{},'Sends to'),el('dd',{},art.deployer+' (standard deployer)'),el('dt',{},'Value'),el('dd',{},'0 · network gas only'));
 let label,disabled=busy,action=null;
 if(sts.includes(null)){label='Refreshing…';disabled=true;}
 else if(bad){label='Not available';disabled=true;}
 else if(next<0){label='All set up';disabled=true;}
 else if(blocked!==false){label=blocked===null?'Refreshing…':'Waiting for '+rq.page;disabled=true;}
 else if(!cleared){label='Waiting for a go';disabled=true;}
 else if(!conn){label='Connect wallet';action=()=>hub.open();}
 else{label='Step '+(next+1)+' of '+art.steps.length+': '+art.steps[next].short;action=()=>send(art.steps[next]);}
 const btn=el('button',{type:'button',class:'qtx-mini qas-go',disabled},label);if(action)btn.addEventListener('click',action);
 root.replaceChildren(facts,...rows,btn,el('p',{class:'qas-status',role:'status','aria-live':'polite','data-tone':status.tone||false},status.text));
}
render().catch(e=>{root.textContent=e.message;});
hub.subscribe(()=>{if(art)render();});
