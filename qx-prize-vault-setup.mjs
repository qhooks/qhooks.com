import {getWalletHub} from './wallet-hub-fresh.mjs';
import {createPrizeVaultSetup,PRIZE} from './qx-prize-vault-core.mjs';
import {mountSetup} from './qx-a/pages/setup-ui.mjs';
const hub=getWalletHub(window),root=document.getElementById('prize-root'),status=document.getElementById('prize-status'),go=document.getElementById('prize-go'),retry=document.getElementById('prize-retry'),hashLink=document.getElementById('prize-tx'),track=document.getElementById('prize-track'),hashInput=document.getElementById('prize-hash');
let timer=null,polls=0,lastWallet=null;
const app=createPrizeVaultSetup({hub,onChange:render});
function render(state){
 root.dataset.state=state.phase;status.textContent=state.message;status.dataset.tone=state.phase==='done'?'ok':['error','ambiguous','wrong-chain'].includes(state.phase)?'bad':'';
 const current=hub.snapshot().current,ready=state.phase==='ready',connected=!!current,wrong=connected&&current.chainId!==PRIZE.chainId;
 go.hidden=state.phase==='done'||['pending','ambiguous','wallet'].includes(state.phase);go.disabled=state.busy||(!ready&&!wrong&&connected);go.textContent=!connected?'Connect wallet':wrong?'Switch to Robinhood Chain':'Deploy prize vault';
 retry.disabled=state.busy;retry.hidden=state.phase==='wallet';retry.textContent=state.phase==='pending'?'Check transaction':'Retry check';
 track.hidden=state.phase!=='ambiguous';hashLink.hidden=!state.hash;if(state.hash){hashLink.href='https://robinhoodchain.blockscout.com/tx/'+state.hash;hashLink.textContent='View transaction '+state.hash.slice(0,10)+'…'+state.hash.slice(-6);}
 clearTimeout(timer);if(state.phase==='pending'&&!state.busy&&polls++<20)timer=setTimeout(()=>app.check(),3000);
}
document.getElementById('prize-address').textContent=PRIZE.address;document.getElementById('prize-token').textContent=PRIZE.token;document.getElementById('prize-safe').textContent=PRIZE.funder;document.getElementById('prize-explorer').href='https://robinhoodchain.blockscout.com/address/'+PRIZE.address;
go.addEventListener('click',async()=>{const c=hub.snapshot().current;if(!c){hub.open();return;}if(c.chainId!==PRIZE.chainId){try{await hub.switchChain(PRIZE.chainId);await app.check();}catch{status.textContent='Network switch was not completed. Nothing was sent.';}return;}await app.deploy();});
retry.addEventListener('click',()=>{polls=0;app.check();});document.getElementById('prize-track-go').addEventListener('click',()=>app.track(hashInput.value.trim()));
hub.subscribe(s=>{const c=s.current,identity=c?[c.owner,c.chainId,c.entry.provider]:null;if(lastWallet&&(lastWallet[0]!==identity?.[0]||lastWallet[1]!==identity?.[1]||lastWallet[2]!==identity?.[2]))app.walletChanged();lastWallet=identity;render(app.snapshot());});
mountSetup({title:'Prize vault',back:'/taps'});app.check();
window.addEventListener('pagehide',()=>clearTimeout(timer));
