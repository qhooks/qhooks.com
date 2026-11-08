// One-time QFlywheel setup on Robinhood Chain. Reuses the site's generic extras setUp (salt ++ pinned init
// code to the deterministic deployer, same wallet path as QLocks/limit orders). Ownerless: whoever sends it
// creates the same contract. Every check below must pass before the button enables.
import {codeAt,ethCall,connectedAddress,onWalletChange} from '/qx-chain.mjs';
import {extras,setUp} from '/qx-extras.mjs';
import {getWalletHub} from '/wallet-hub.mjs';
const CHAIN='4663',SAFE='0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71',FLYWHEEL='0xb85e67cf7728572033a9d36aee3218dadf85baa2';
const DEPLOYER='0x4e59b44847b379578588920ca78fbf26c0b4956c',DATA_SHA256='61e5c5189f53ff9ae48b351e8300f532304e39a557a59bf7116bbcb441814a3a',RUNTIME_BYTES=7880,SAFE_SELECTOR='0x885a1ffa';
const EXPLORER='https://robinhoodchain.blockscout.com/address/';
const $=id=>document.getElementById(id);
// The shared send() reads the connected address from #qt-connection (as on the terminal and My QHooks); keep it in sync with the site's wallet hub.
const hub=getWalletHub(window),line=document.getElementById('qt-connection');
hub.subscribe(s=>{const a=s.current?.owner?.toLowerCase()||'';const text=a?'EVM · '+a:'';if(line.textContent!==text)line.textContent=text;});
const bytes=hex=>(hex&&hex!=='0x')?(hex.length-2)/2:0;
async function sha256Hex(hex){const b=new Uint8Array(hex.slice(2).match(/../g).map(x=>parseInt(x,16)));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function row(id,state,text){const li=$(id);li.dataset.state=state;li.querySelector('span').textContent=text;}
let busy=false,ready=false;
async function check(){
 const a=await extras(),f=a.contracts.flywheel,data=a.salt+f.initCode.slice(2);
 const pinned=a.deployer.toLowerCase()===DEPLOYER&&f.address.toLowerCase()===FLYWHEEL&&f.runtimeBytes===RUNTIME_BYTES&&await sha256Hex(data)===DATA_SHA256;
 row('fw-data',pinned?'ok':'bad',pinned?'Deploy data matches the reviewed version.':'Deploy data does not match the reviewed version. Do not continue.');
 const [safeCode,flyCode]=await Promise.all([codeAt(CHAIN,SAFE),codeAt(CHAIN,FLYWHEEL)]);
 const safeLive=bytes(safeCode)>0,flyLive=bytes(flyCode)>0;
 row('fw-safe',safeLive?'ok':'bad',safeLive?'The QHooks Safe is live on Robinhood Chain.':'The Safe is not live on Robinhood Chain yet. Create it first.');
 let safeLinked=false;
 if(flyLive){try{safeLinked=('0x'+(await ethCall(CHAIN,FLYWHEEL,SAFE_SELECTOR)).slice(-40)).toLowerCase()===SAFE;}catch{}}
 row('fw-state',flyLive?(bytes(flyCode)===RUNTIME_BYTES&&safeLinked?'ok':'bad'):'todo',flyLive?(bytes(flyCode)===RUNTIME_BYTES&&safeLinked?'The flywheel is set up: '+RUNTIME_BYTES.toLocaleString()+' bytes of code, paying the QHooks Safe.':'Code is at the flywheel address but it does not match. Do not use it.'):'Not set up yet.');
 const wallet=connectedAddress();
 row('fw-wallet',wallet?'ok':'todo',wallet?'Wallet connected: '+wallet.slice(0,6)+'…'+wallet.slice(-4)+'. You will be asked to switch to Robinhood Chain.':'Connect a wallet with a little ETH on Robinhood Chain (about 0.00004 ETH for gas).');
 ready=pinned&&safeLive&&!flyLive&&!!wallet;
 $('fw-go').disabled=busy||!ready;$('fw-go').hidden=flyLive;$('fw-done').hidden=!flyLive;
 $('fw-link').href=EXPLORER+FLYWHEEL;
 return {pinned,safeLive,flyLive,safeLinked};
}
async function run(){
 if(busy||!ready)return;busy=true;$('fw-go').disabled=true;const say=t=>{$('fw-status').textContent=t;};
 const wallet=connectedAddress(),assertContext=()=>{if(connectedAddress()!==wallet)throw Error('Your wallet changed. Start again.');};
 try{say('Preparing…');await setUp(CHAIN,'flywheel',say,assertContext);say('Sent. Checking the result…');const r=await check();say(r.flyLive&&r.safeLinked?'Done. The flywheel is set up.':'The transaction landed but the check did not pass. Look at the address before using it.');}
 catch(error){say(error?.message||'Setup did not finish.');}
 finally{busy=false;check().catch(()=>{});}
}
$('fw-go').addEventListener('click',run);
onWalletChange?.(()=>{check().catch(()=>{});});
check().catch(e=>{$('fw-status').textContent='Could not read Robinhood Chain right now. Refresh to try again.';});
