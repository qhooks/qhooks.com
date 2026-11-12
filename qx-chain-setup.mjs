// Tap-through chain setup for one chain (?chain=8453) or several stacked (?chains=8453,42161,56 or ?chains=all), every
// step from /full-launch/chain-setup-v1.json in order (the chain's own 2-of-2 fee Safe, the shared launch contracts,
// the launch contract, then any later steps). Each step sends fixed calldata whose result can only be the contract at
// the address shown; after each send the page checks the code there (sha256 of the runtime) and, for the Safe, its
// owners and threshold. Nothing is sent without ?go=<chain id> (and the launch contract and fee router steps also need
// &factory=<chain id>: Randall's go for that chain), if code is already there, before the step above is on chain, or
// from any wallet but the one connected in the Your wallet panel (the shared wallet hub, as on the other setup pages).
// ?set=<name> reads /full-launch/chain-setup-<name>-v1.json instead (e.g. set=cleantoken: the gated Base clean-token
// test). A step may carry a value (shown, and counted in the cost) and `predict` {to, salt}: its address is then the
// factory's predictToken(connected wallet, salt), read once that factory has code (a test launch from this wallet).
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';
import {readCreateNativeUSD} from '/qx-create-prices.mjs';

const root=document.getElementById('qcs-root'),hub=getWalletHub(window),q=new URLSearchParams(location.search);
const list=k=>new Set((q.get(k)||'').split(',').map(x=>x.trim()).filter(Boolean));
const go=list('go'),factoryGo=list('factory');
// ?first=order-executor,x-receiver (2026-11-10, /taps for Ethereum): trading steps first. Only steps in the "Orders" and
// "Cross-chain buys" groups may move up; they deploy through the standard deployer with no reference to the steps
// between, so they are ready once the fee Safe and shared launch contracts are on chain. Everything else keeps its order.
const FIRST=[...list('first')],FIRST_GROUPS=new Set(['Orders','Cross-chain buys']);
const firstOf=steps=>FIRST.map(id=>steps.find(s=>s.id===id&&FIRST_GROUPS.has(s.group))).filter(Boolean);
const BASE_GROUPS=new Set(['Fee Safe','Shared launch contracts']);
const SET=/^[a-z0-9-]{1,32}$/.test(q.get('set')||'')?q.get('set'):null;
const needsFactoryGo=s=>s.group==='Launch contract'||s.group==='Terminal trading';
// A chain that is not built in chains.mjs yet (Elysium mainnet before its site release) carries its network in the manifest.
const net=id=>chainById(id)||M?.chains?.[id]?.network||null;
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)n.setAttribute(k,v===true?'':v);n.append(...kids.filter(k=>k!=null&&k!==false));return n;};
let M,busy=false,status={chain:null,text:'',tone:''};
// Per chain: {steps:{id:'none'|'ok'|'wrong'|null}, gasPrice, balance:{owner,wei}, read:boolean}
const state={};
async function rpc(chainId,method,params){
 const r=await fetch(net(chainId).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const j=await r.json();if(j.error)throw Error(j.error.message||'Network read failed');return j.result;
}
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const bytes=h=>Uint8Array.from((h.slice(2).match(/../g)||[]).map(x=>parseInt(x,16)));
const sha256=async code=>hex(await crypto.subtle.digest('SHA-256',bytes(code)));
const words=h=>(h.slice(2).match(/.{64}/g)||[]);
// A predicted step's address for the connected wallet (null until a wallet is connected and the factory has code).
async function target(chainId,s){
 if(!s.predict)return s.address;
 const owner=hub.snapshot().current?.owner;s.address=null;
 if(!owner||(await rpc(chainId,'eth_getCode',[s.predict.to,'latest']))==='0x')return null;
 const r=await rpc(chainId,'eth_call',[{to:s.predict.to,data:'0x486e36c8'+owner.slice(2).toLowerCase().padStart(64,'0')+s.predict.salt.slice(2)},'latest']);
 return s.address='0x'+r.slice(-40);
}
// What is at a step's address: 'none', 'ok' (code matches the step), or 'wrong' (some other code: stop).
async function check(chainId,s){
 const addr=await target(chainId,s);if(!addr)return 'none';
 const code=await rpc(chainId,'eth_getCode',[addr,'latest']);
 if(code==='0x')return 'none';
 if(s.runtimeSha256&&await sha256(code)!==s.runtimeSha256)return 'wrong';
 if(s.safe){
  const th=await rpc(chainId,'eth_call',[{to:s.address,data:'0xe75235b8'},'latest']);
  const ow=words(await rpc(chainId,'eth_call',[{to:s.address,data:'0xa0e67e2b'},'latest'])).slice(2).map(w=>'0x'+w.slice(24));
  // Multi-chain manifests give the Safe's address in s.safe and the owners/threshold once at the top level.
  const safe=s.safe&&typeof s.safe==='object'?s.safe:{owners:M.owners||[],threshold:M.threshold};
  const want=safe.owners.map(o=>o.toLowerCase());
  if(!want.length||BigInt(th)!==BigInt(safe.threshold)||ow.length!==want.length||!want.every(o=>ow.includes(o)))return 'wrong';
 }
 return 'ok';
}
const say=(chain,text,tone='')=>{status={chain,text,tone};draw();};
const gwei=w=>(Number(w)/1e9).toPrecision(3)+' gwei';
// USD per native coin (2026-11-12): the cost line also shows dollars at today's gas, so a costly chain can be skipped.
const usdOf={};
const usdText=(chainId,w)=>{const p=usdOf[net(chainId)?.native||'ETH'];if(!(p>0))return '';const v=Number(w)/1e18*p;return ' (about $'+(v>=100?Math.round(v).toLocaleString('en-US'):v>=1?v.toFixed(2):v.toFixed(3))+')';};
const native=(chainId,w)=>{const n=Number(w)/1e18;return (n===0?'0':n.toPrecision(3))+' '+(net(chainId)?.native||'ETH');};
// Reads one chain: every step (in parallel), gas price, and the connected wallet's balance there.
async function refresh(chainId){
 const C=M.chains[chainId],S=state[chainId]||={steps:{},gasPrice:null,balance:null,read:false};
 const owner=hub.snapshot().current?.owner||null;
 await Promise.all([
  ...C.steps.map(async s=>{try{S.steps[s.id]=await check(chainId,s);}catch{S.steps[s.id]=null;}}),
  rpc(chainId,'eth_gasPrice',[]).then(v=>{S.gasPrice=BigInt(v);}).catch(()=>{}),
  (async()=>{const sym=net(chainId)?.native||'ETH';if(usdOf[sym]===undefined){usdOf[sym]=null;usdOf[sym]=await readCreateNativeUSD(sym).catch(()=>null);}})(),
  owner?rpc(chainId,'eth_getBalance',[owner,'latest']).then(v=>{S.balance={owner,wei:BigInt(v)};}).catch(()=>{S.balance=null;}):Promise.resolve(S.balance=null)
 ]);
 S.read=true;draw();
}
async function refreshBalances(){
 const owner=hub.snapshot().current?.owner||null;
 await Promise.all(chainIds().map(async id=>{const S=state[id];if(!S)return;
  if(!owner){S.balance=null;return;}
  try{S.balance={owner,wei:BigInt(await rpc(id,'eth_getBalance',[owner,'latest']))};}catch{S.balance=null;}}));
 draw();
}
async function switchTo(chainId){
 if(busy)return;
 const conn=hub.snapshot().current;if(!conn){hub.open();return;}
 busy=true;const n=net(chainId);say(chainId,'Switching your wallet to '+n.name+'…');
 try{
  const c=chainById(chainId)?await hub.switchChain(chainId):await switchManifest(conn,chainId,n);
  say(chainId,c?.chainId===chainId?'Your wallet is on '+n.name+'.':'Switch your wallet to '+n.name+', then try again.',c?.chainId===chainId?'ok':'bad');
 }catch(e){say(chainId,/reject|denied|cancel/i.test(e?.message||'')?'Cancelled in your wallet.':(e?.message||'The switch did not go through.'),'bad');}
 finally{busy=false;draw();refreshBalances();}
}
async function send(chainId,s){
 if(busy)return;
 let conn=hub.snapshot().current;if(!conn){hub.open();return;}
 busy=true;say(chainId,'');
 try{
  const now=await check(chainId,s);
  if(s.predict&&!s.address)throw Error('Connect your wallet and send the step above first.');
  if(now==='ok'){state[chainId].steps[s.id]='ok';say(chainId,'Already set up at '+s.address+'. Nothing to send.','ok');return;}
  if(now==='wrong')throw Error('Something else is at '+s.address+'. Stop and check before going on.');
  if(conn.chainId!==chainId){const n=net(chainId);say(chainId,'Switching your wallet to '+n.name+'…');conn=chainById(chainId)?await hub.switchChain(chainId):await switchManifest(conn,chainId,n);if(conn?.chainId!==chainId)throw Error('Switch your wallet to '+n.name+', then try again.');}
  if(BigInt(await rpc(chainId,'eth_chainId',[]))!==BigInt(chainId))throw Error('The network read is not '+net(chainId).name+'. Nothing was sent.');
  if((await rpc(chainId,'eth_getCode',[M.deployer,'latest']))==='0x')throw Error('The standard deployer is not on this chain. Nothing was sent.');
  const from=conn.owner,provider=conn.entry.provider,tx={from,to:s.to,data:s.data,value:s.value||'0x0'};
  try{const est=BigInt(await rpc(chainId,'eth_estimateGas',[{from,to:tx.to,data:tx.data,value:tx.value}]));tx.gas='0x'+(est*13n/10n).toString(16);}
  catch{throw Error('This step would fail right now (often: not enough gas in the wallet on this chain). Nothing was sent.');}
  try{const b=await rpc(chainId,'eth_getBlockByNumber',['latest',false]),tip=BigInt(await provider.request({method:'eth_maxPriorityFeePerGas'}).catch(()=>'0x0'));
   if(b?.baseFeePerGas){tx.maxPriorityFeePerGas='0x'+tip.toString(16);tx.maxFeePerGas='0x'+(BigInt(b.baseFeePerGas)*2n+tip).toString(16);}}catch{}
  if(hub.snapshot().current?.owner!==from)throw Error('Your wallet changed. Try again.');
  say(chainId,'Confirm in your wallet…');
  const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});
  say(chainId,'Sent. Waiting for the network…');
  let r=null;for(let i=0;i<180&&!r;i++){r=await rpc(chainId,'eth_getTransactionReceipt',[hash]).catch(()=>null);if(!r)await new Promise(res=>setTimeout(res,2000));}
  if(!r)throw Error('Still pending. Check your wallet activity, then reload this page.');
  if(r.status!=='0x1')throw Error('The network refused it. Only gas was spent.');
  const after=await check(chainId,s);state[chainId].steps[s.id]=after;
  if(after==='ok')say(chainId,'Set up at '+s.address+'.','ok');
  else if(after==='none')say(chainId,'Confirmed, but no contract at '+s.address+' yet. Reload in a minute.','bad');
  else say(chainId,'Confirmed, but the code at '+s.address+' is not what this step expects. Stop and check.','bad');
 }catch(e){say(chainId,/reject|denied|cancel/i.test(e?.message||'')?'Cancelled in your wallet. Nothing was sent.':(e?.message||'That did not go through.'),'bad');}
 finally{busy=false;draw();refresh(chainId);}
}
// Switch (or add) a network that only the manifest knows, then wait for the hub to see it.
async function switchManifest(conn,chainId,n){
 const p=conn.entry.provider;
 try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:n.hex}]});}
 catch(e){if(e?.code!==4902&&!/unrecognized|not added|unknown chain/i.test(e?.message||''))throw e;
  await p.request({method:'wallet_addEthereumChain',params:[{chainId:n.hex,chainName:n.name,nativeCurrency:{name:n.native,symbol:n.native,decimals:18},rpcUrls:[n.rpc],...(n.explorer?{blockExplorerUrls:[n.explorer]}:{})}]});
  await p.request({method:'wallet_switchEthereumChain',params:[{chainId:n.hex}]});}
 // The wallet hub only follows networks built in chains.mjs: it drops the connection when the wallet moves to this one.
 // Then one reconnect on this network is needed; the provider stays the source of truth for the chain either way.
 // Wallets report the change just after the switch resolves, so give it time to arrive before deciding.
 for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,150));if(!hub.snapshot().current)break;}
 const c=hub.snapshot().current,id=await p.request({method:'eth_chainId'}).catch(()=>null);
 if(!id||BigInt(id)!==BigInt(chainId))return c;
 if(!c)throw Error('Your wallet is on '+n.name+' now. Connect it again under Your wallet, then press Send.');
 return c.owner===conn.owner?{...c,chainId}:c;
}
// ?chains=a,b,c (or all) stacks several chains; ?chain=x keeps the single-chain page.
function chainIds(){
 const many=q.get('chains'),one=q.get('chain');
 const want=many==='all'?Object.keys(M.chains):many?[...list('chains')]:one?[one]:[];
 return [...new Set(want)].filter(id=>M.chains[id]&&net(id));
}
function chainList(){
 const ids=Object.keys(M.chains).filter(id=>net(id));
 return el('div',{},el('h2',{},'Choose a chain'),el('ul',{},
  el('li',{},el('a',{href:'?chains='+ids.join(',')},'All chains on one page')),
  ...ids.map(id=>el('li',{},el('a',{href:'?chain='+id},net(id).name+' ('+id+')')))));
}
function section(chainId,many){
 const ch=net(chainId),C=M.chains[chainId],S=state[chainId],conn=hub.snapshot().current,cleared=go.has(chainId),rows=[];
 if(many)rows.push(el('h2',{class:'qcs-chain'},ch.name+' ('+chainId+')'));
 if(!S?.read){rows.push(el('p',{},'Refreshing…'));return el('section',{class:'qcs-chainset','data-chain':chainId},...rows);}
 let left=0n,leftValue=0n,prev='ok',done=0;
 for(const s of C.steps){const st=S.steps[s.id];if(st==='ok')done++;else{if(s.gas)left+=BigInt(s.gas);if(s.value)leftValue+=BigInt(s.value);}}
 const cost=S.gasPrice!=null?left*S.gasPrice+leftValue:null;
 const valued=C.steps.filter(s=>s.value&&BigInt(s.value)>0n);
 const bal=S.balance&&conn&&S.balance.owner===conn.owner?S.balance.wei:null;
 rows.push(el('dl',{},
  ...(many?[]:[el('dt',{},'Chain'),el('dd',{},ch.name+' ('+chainId+')')]),
  ...(C.safe?[el('dt',{},'Fee Safe'),el('dd',{},C.safe+' · 2-of-2: '+M.owners.join(', '))]:[el('dt',{},'Fee wallet'),el('dd',{},(C.platform||'')+(C.platformName?' · '+C.platformName:''))]),
  el('dt',{},'Launch contract'),el('dd',{},C.factory||M.factory),
  ...(chainById(chainId)?[]:[el('dt',{},'Network'),el('dd',{},'Chain '+chainId+' · '+ch.native+' · '+ch.rpc+'. The first Send adds and switches it in your wallet; then connect again once.')]),
  el('dt',{},'Every step'),el('dd',{},valued.length?'Network gas, plus '+valued.map(s=>native(chainId,BigInt(s.value))+' sent with “'+s.group+'”').join(', '):'Value 0 · network gas only'),
  el('dt',{},'Go'),el('dd',{},(cleared?'Cleared for this chain':'Waiting for a go (go='+chainId+')')+(!C.steps.some(needsFactoryGo)?'':factoryGo.has(chainId)?' · launch contract cleared':' · launch contract needs factory='+chainId)),
  ...(C.optional?[el('dt',{},'Optional'),el('dd',{},C.optional)]:[]),
  el('dt',{},'Progress'),el('dd',{},done+' of '+C.steps.length+' set up'),
  el('dt',{},'Still to send'),el('dd',{},left===0n&&leftValue===0n?'Nothing. This chain is set up.':'About '+Number(left).toLocaleString('en-US')+' gas'+(leftValue?' + '+native(chainId,leftValue):'')+(cost!=null?', '+native(chainId,cost)+usdText(chainId,cost)+' in all at today’s '+gwei(S.gasPrice)+'. Keep at least twice that in the wallet.':'.')),
  el('dt',{},'Your wallet here'),el('dd',{},!conn?'Connect your wallet to see its balance.':bal==null?'Refreshing…':native(chainId,bal)+(cost!=null&&left>0n?(bal>=cost*2n?' · enough':bal>=cost?' · enough, but under twice the cost':' · not enough yet'):''))));
 // Wallet on another network: one tap to switch (the hub switches; Elysium is added from the manifest).
 if(conn&&conn.chainId!==chainId&&left>0n&&cleared){
  const b=el('button',{type:'button',class:'qtx-mini qas-go',disabled:busy},'Switch to '+ch.name);b.addEventListener('click',()=>switchTo(chainId));
  rows.push(el('div',{class:'qcs-step qcs-switch'},el('h3',{},'Switch your wallet to '+ch.name),el('dl',{},el('dt',{},'Status'),el('dd',{},'Your wallet is on '+(net(conn.chainId)?.name||'chain '+conn.chainId)+'. Send also switches it.')),b));
 }
 let group='';
 const early=firstOf(C.steps),baseOk=C.steps.filter(x=>BASE_GROUPS.has(x.group)).every(x=>S.steps[x.id]==='ok');
 for(const s of [...early,...C.steps.filter(x=>!early.includes(x))]){
  const st=S.steps[s.id],isEarly=early.includes(s);
  const ready=isEarly?baseOk:prev==='ok',ok=cleared&&(!needsFactoryGo(s)||factoryGo.has(chainId));
  if(s.group!==group){group=s.group;rows.push(el(many?'h3':'h2',{class:'qcs-group'},group));}
  const btn=el('button',{type:'button',class:'qtx-mini qas-go',disabled:busy||st!=='none'||!ok||!ready},
   st==='ok'?'Set up':st==='wrong'?'Stopped':!conn?'Connect wallet':'Send');
  btn.addEventListener('click',()=>send(chainId,s));
  rows.push(el('div',{class:'qcs-step'},el(many?'h4':'h3',{},s.name),
   el('dl',{},el('dt',{},'Creates'),el('dd',{},s.address||(s.predict?'Its address shows once your wallet is connected and the step above is set up':'')),el('dt',{},'Sends to'),el('dd',{},s.to),
    ...(s.value&&BigInt(s.value)>0n?[el('dt',{},'Sends'),el('dd',{},native(chainId,BigInt(s.value)))]:[]),
    ...(s.scan&&st==='ok'&&s.address?[el('dt',{},'Scanner'),el('dd',{},el('a',{href:s.scan+s.address,target:'_blank',rel:'noopener'},'Open the GoPlus check'))]:[]),
    ...(s.gas?[el('dt',{},'Gas'),el('dd',{},Number(s.gas).toLocaleString('en-US'))]:[]),
    el('dt',{},'Status'),el('dd',{},st===null?'Refreshing…':st==='ok'?'Set up':st==='wrong'?'Other code at this address: stop':!ready?'After the step above':ok?'Ready':needsFactoryGo(s)&&cleared?'Waiting for Randall’s go for this chain’s launch contract (factory='+chainId+')':'Waiting for a go')),
   btn));
  if(!isEarly)prev=st;
 }
 rows.push(el('p',{class:'qas-status',role:'status','aria-live':'polite','data-tone':status.chain===chainId&&status.tone||false},status.chain===chainId?status.text:''));
 return el('section',{class:'qcs-chainset','data-chain':chainId},...rows);
}
function draw(){
 if(!M)return;
 const ids=chainIds();
 if(!ids.length){root.replaceChildren(chainList());return;}
 const many=!!q.get('chains');
 root.replaceChildren(...ids.map(id=>section(id,many)));
}
async function start(){
 M=await fetch(SET?'/full-launch/chain-setup-'+SET+'-v1.json':'/full-launch/chain-setup-v1.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
 if(!M){root.textContent=SET?'This setup list is not available.':'Could not load the setup list. Refresh to try again.';return;}
 draw();
 await Promise.all(chainIds().map(refresh));
}
start().catch(e=>{root.textContent=e.message;});
let lastOwner=null;
hub.subscribe(c=>{if(!M)return;const o=c.current?.owner||null;draw();if(o!==lastOwner){lastOwner=o;refreshBalances();
 // A predicted step (test launch) depends on the wallet: read it again for the new one.
 for(const id of chainIds())if(M.chains[id].steps.some(s=>s.predict))refresh(id);}});
