import {getWalletHub} from './wallet-hub-fresh.mjs';
import {createPurchase} from './qx-bazaar-test-core.mjs';
const hub=getWalletHub(window),$=id=>document.getElementById(id),purchase=createPurchase({hub});
let busy=false;
function render(){const c=hub.snapshot().current;$('wallet-state').textContent=c?c.owner:'Not connected';$('qhc-trigger').textContent=c?'Wallet connected':'Connect wallet';for(const b of document.querySelectorAll('[data-buy]'))b.disabled=busy;}
for(const b of document.querySelectorAll('[data-buy]'))b.addEventListener('click',async()=>{
  if(busy)return;
  const c=hub.snapshot().current;
  if(!c){hub.open();$('status').textContent='Connect your wallet, then tap the route to pay.';return;}
  busy=true;render();$('status').textContent='Checking the offer. Review the Base USDC authorization in your wallet.';
  try{
    if(Number(c.chainId)!==8453)await hub.switchChain('8453');
    const result=await purchase(b.dataset.buy,$('chain').value.trim(),$('address').value.trim());
    $('result').hidden=false;$('paid-json').textContent=JSON.stringify(result.body,null,2);
    $('settlement').href='https://basescan.org/tx/'+result.transaction;$('status').textContent='Payment confirmed. Your QProof report is below.';
  }catch(e){$('status').textContent=e.message||'The response was interrupted. Tap the same route to check the saved payment.';}
  finally{busy=false;render();}
});
hub.subscribe(render);render();
