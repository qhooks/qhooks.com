// Signing code loads only after the user chooses Connect wallet.
import {bindLaunchPage} from './launch-page.mjs';
bindLaunchPage({loadModules:()=>Promise.all([
 import('/qwallet/client/workspace.mjs'),
 import('/launch-client/prototypes/launchpad/l16/launch-signer.mjs'),
 import('/launch-client/prototypes/qwallet/client/wallet-session.mjs'),
 import('/launch-client/prototypes/qwallet/client/approval.mjs'),
 import('/launch-client/prototypes/qwallet/client/typed-data.mjs'),
 import('/launch-client/packages/launchpad/launch-plan-client.mjs'),
 import('/launch-client/packages/launchpad/launch-execution.mjs')
])});
