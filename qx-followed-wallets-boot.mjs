import {bootFollowedWallets} from './qx-followed-wallets.mjs';
void bootFollowedWallets().catch(()=>{const root=document.getElementById('followed-wallets');if(root)root.textContent='Following is refreshing. Reload to try again.';});
