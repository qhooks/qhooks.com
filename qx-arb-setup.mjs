// One-tap setup for the shared arb recapture contract, one chain at a time. The button sends the pinned init code to
// the deterministic deployer (0x4e59…956C), so the contract can only land at its fixed address as exactly this code.
// Nothing is sent without ?go=<chain id>, if code is already there, or from any wallet but the one the person connected
// in the Your wallet panel (browser extension, wallet app browser, any phone wallet or the email wallet: the shared
// wallet hub, the same path one-tap Create uses). This page never turns the feature on; the site does that separately.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';

const root=document.getElementById('qas-root'),hub=getWalletHub(window);
const go=new Set((new URLSearchParams(location.search).get('go')||'').split(',').filter(Boolean));
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)n.setAttribute(k,v===true?'':v);n.append(...kids);return n;};
let art,busy=false,status={text:'',tone:''};
async function rpc(chainId,method,params){
 const r=await fetch(chainById(chainId).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const j=await r.json();if(j.error)throw Error(j.error.message||'Network read failed');return j.result;
}
const hasCode=async(chainId,a)=>(await rpc(chainId,'eth_getCode',[a,'latest']))!=='0x';
const say=(text,tone='')=>{status={text,tone};render();};
async function deploy(chainId){
 if(busy)return;const c=art.chains[chainId];
 let conn=hub.snapshot().current;if(!conn){hub.open();return;}
 busy=true;say('');
 try{
  if(await hasCode(chainId,c.address)){say('Already set up at '+c.address+'. Nothing to send.','ok');return;}
  if(conn.chainId!==chainId){say('Switching your wallet to '+chainById(chainId).name+'…');conn=await hub.switchChain(chainId);if(conn?.chainId!==chainId)throw Error('Switch your wallet to '+chainById(chainId).name+', then try again.');}
  const from=conn.owner,provider=conn.entry.provider,tx={from,to:art.deployer,data:c.data,value:'0x0'};
  // Explicit fees and a fresh gas estimate (with headroom) so every wallet, including phone wallets, sends the same thing.
  try{const est=BigInt(await rpc(chainId,'eth_estimateGas',[{from,to:tx.to,data:tx.data,value:'0x0'}]));tx.gas='0x'+(est*13n/10n).toString(16);}
  catch{throw Error('This transaction would fail right now. Nothing was sent.');}
  try{const b=await rpc(chainId,'eth_getBlockByNumber',['latest',false]),tip=BigInt(await provider.request({method:'eth_maxPriorityFeePerGas'}).catch(()=>'0x0'));
   if(b?.baseFeePerGas){tx.maxPriorityFeePerGas='0x'+tip.toString(16);tx.maxFeePerGas='0x'+(BigInt(b.baseFeePerGas)*2n+tip).toString(16);}}catch{}
  if(hub.snapshot().current?.owner!==from)throw Error('Your wallet changed. Try again.');
  say('Confirm in your wallet…');
  const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});
  say('Sent. Waiting for the network…');
  let r=null;for(let i=0;i<180&&!r;i++){r=await rpc(chainId,'eth_getTransactionReceipt',[hash]).catch(()=>null);if(!r)await new Promise(res=>setTimeout(res,2000));}
  if(!r)throw Error('Still pending. Check your wallet activity, then reload this page.');
  if(r.status!=='0x1')throw Error('The network refused it. Only gas was spent.');
  say(await hasCode(chainId,c.address)?'Set up at '+c.address+'.':'Confirmed, but no contract at '+c.address+' yet. Reload in a minute.',await hasCode(chainId,c.address)?'ok':'bad');
 }catch(e){say(/reject|denied|cancel/i.test(e?.message||'')?'Cancelled in your wallet. Nothing was sent.':(e?.message||'That did not go through.'),'bad');}
 finally{busy=false;render();}
}
async function render(){
 art||=await fetch('/full-launch/arb-recapture-v1.json',{cache:'no-store'}).then(r=>r.json());
 const conn=hub.snapshot().current,rows=[];
 for(const[chainId,c]of Object.entries(art.chains)){
  const ch=chainById(chainId);if(!ch)continue;
  let on=null;try{on=await hasCode(chainId,c.address);}catch{}
  const cleared=go.has(chainId);
  const btn=el('button',{type:'button',class:'qtx-mini qas-go',disabled:busy||on!==false||!cleared},on?'Set up':!conn?'Connect wallet to set up':'Set up on '+ch.name);
  btn.addEventListener('click',()=>deploy(chainId));
  rows.push(el('div',{},
   el('dl',{},el('dt',{},'Chain'),el('dd',{},ch.name+' ('+chainId+')'),el('dt',{},'Creates'),el('dd',{},c.address),
    el('dt',{},'Sends to'),el('dd',{},art.deployer+' (standard deployer)'),el('dt',{},'Value'),el('dd',{},'0 · network gas only'),
    el('dt',{},'Status'),el('dd',{},on===null?'Refreshing…':on?'Set up':cleared?'Ready to set up':'Waiting for a go')),
   btn,el('p',{class:'qas-status',role:'status','aria-live':'polite','data-tone':status.tone||false},status.text)));
 }
 root.replaceChildren(...rows);
}
render().catch(e=>{root.textContent=e.message;});
hub.subscribe(()=>{if(art)render();});
