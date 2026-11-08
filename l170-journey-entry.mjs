import {initializeLaunchChainEntry} from '/l140-launch-boot.mjs';
import {bindCompleteLaunchWorkspace} from '/trade-client/apps/marketplace-preview/l129-launch-page.mjs';
import {bindLaunchJourney} from './l164-journey-page.mjs';
import {bindTokenBrief} from './l170-token-brief-page.mjs';
import {bindLaunchLink} from './launch-links/prefill.mjs';
import {loadStudioClient} from './qx-launch-engine.mjs';
const entry=initializeLaunchChainEntry();let core=null;
const journey=bindLaunchJourney({blocked:entry.status==='blocked',snapshot:()=>core?.snapshot()||{}});
if(entry.status!=='blocked'){
 core=bindCompleteLaunchWorkspace({
  loadClient:async()=>journey.wrapClient(await loadStudioClient()),
  loadWrap:async()=>{const m=await import('/full-launch/packages/multichain-launch/native-wrap.mjs');return m.createNativeWrap;},
  loadArtifacts:async()=>Object.fromEntries(await Promise.all([
   ['toolkitText','toolkit.json',1000000],['metadataText','metadata.json',100000],['tokenText','token.json',20000],['policyText','dependencies.json',100000]
  ].map(async([key,name,limit])=>{const r=await fetch('/full-launch/'+name,{redirect:'error',cache:'no-store'});if(!r.ok)throw Error('Launch artifact unavailable: '+name);const text=await r.text();if(text.length>limit)throw Error('Launch artifact too large');return[key,text];})))
 });journey.render();
}
bindTokenBrief({blocked:entry.status==='blocked',snapshot:()=>core?.snapshot()||{}});
bindLaunchLink({blocked:entry.status==='blocked',snapshot:()=>core?.snapshot()||{}});
