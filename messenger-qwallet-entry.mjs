import {bindMessengerWallet} from './messenger-wallet.mjs';
import {ALLOWED_MESSENGER_ORIGINS} from './messenger-origins.mjs';
import {initializeQWalletChainEntry} from './qwallet-chain-entry.mjs';
import {bindQWalletPage} from './qwallet-remembered-page.mjs';

const entry=initializeQWalletChainEntry();
if(entry.status!=='blocked'){const controller=bindQWalletPage({
 loadSetup:async()=>{
  const [deployment,session,assets,amount]=await Promise.all([
   import('/qwallet-stack/packages/chain-wallet/deployment.mjs'),
   import('/qwallet-stack/prototypes/qwallet/client/wallet-session.mjs'),
   import('/qwallet-stack/packages/chain-wallet/wallet-assets.mjs'),
   import('/qwallet-stack/packages/crosschain/decimal-amount.mjs')
  ]);return {...deployment,...session,...assets,...amount};
 },
 loadWorkspace:()=>import('/qwallet-stack/prototypes/chain-wallet/wallet-workspace.mjs'),
 loadToolkit:async()=>{const r=await fetch('mainnet-toolkit.json',{redirect:'error',cache:'no-store'});if(!r.ok)throw Error('QWallet toolkit unavailable');const raw=await r.text();if(raw.length>1000000)throw Error('QWallet toolkit too large');return raw;}
});
 bindMessengerWallet({controller,allowedOrigins:ALLOWED_MESSENGER_ORIGINS});
}
