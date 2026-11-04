// Import accepted signing modules only following an explicit user connection.
import {bindWalletPage} from './wallet-page.mjs';
bindWalletPage({loadModules:()=>Promise.all([
  import('/qwallet/client/workspace.mjs'),import('/qwallet/client/signer.mjs'),
  import('/qwallet/client/wallet-session.mjs'),import('/qwallet/client/approval.mjs'),
  import('/qwallet/client/typed-data.mjs')
])});
