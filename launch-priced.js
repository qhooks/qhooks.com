import {bindCompleteLaunchWorkspace} from './launch-remembered-page.mjs';
bindCompleteLaunchWorkspace({
 loadClient:async()=>Object.assign({},...await Promise.all([
  import('/full-launch/packages/multichain-launch/workspace-chains.mjs'),
  import('/full-launch/packages/multichain-launch/workspace-fields.mjs'),
  import('/full-launch/packages/multichain-launch/guided-management.mjs'),
  import('/full-launch/packages/multichain-launch/dependencies.mjs'),
  import('/full-launch/packages/multichain-launch/actions/signer.mjs'),
  import('/full-launch/prototypes/qwallet/client/wallet-session.mjs'),
  import('/full-launch/packages/crosschain/decimal-amount.mjs')
 ])),
 loadWrap:async()=>{const m=await import('/full-launch/packages/multichain-launch/native-wrap.mjs');return m.createNativeWrap;},
 loadArtifacts:async()=>Object.fromEntries(await Promise.all([
  ['toolkitText','toolkit.json',1000000],['metadataText','metadata.json',100000],['tokenText','token.json',20000],['policyText','dependencies.json',100000]
 ].map(async([key,name,limit])=>{const r=await fetch('/full-launch/'+name,{redirect:'error',cache:'no-store'});if(!r.ok)throw Error('Launch artifact unavailable: '+name);const text=await r.text();if(text.length>limit)throw Error('Launch artifact too large');return [key,text];})))
});
