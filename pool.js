import {bindPoolPage} from './pool-page.mjs';
import {bindPoolSetupPage} from './pool-setup-page.mjs';
import {bindPoolAccountPage} from './pool-account-page.mjs';
let setup;
const account=bindPoolAccountPage({loadModule:()=>import('/pool-client/prototypes/qpools/client/pool-workspace.mjs')});
const toolkit=bindPoolPage({onToolkitReady:ready=>setup?.setToolkitReady(ready)});
setup=bindPoolSetupPage({onContext:context=>account.setContext(context),getToolkitText:()=>toolkit.toolkitText(),loadModules:()=>Promise.all([
 import('/pool-client/prototypes/qpools/client/pool-setup.mjs'),
 import('/pool-client/prototypes/qwallet/client/wallet-session.mjs')
])});
