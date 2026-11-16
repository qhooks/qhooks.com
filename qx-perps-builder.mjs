import {getWalletHub} from '/wallet-hub.mjs';
import {loadLivePerpsConfig} from './qx-perps-config.mjs';
import {changeBuilderFee,isSafeOwner} from './qx-perps-builder-flow.mjs';
import {info} from './qx-perps-data.mjs';
import {usd,createConfirmation} from './qx-perps-ui.mjs';
const $=id=>document.getElementById(id),hub=getWalletHub(window),confirm=createConfirmation();
const valid=a=>/^0x[0-9a-f]{40}$/i.test(a||'')&&!/^0x0{40}$/i.test(a);
const current=()=>hub.snapshot().current,owner=()=>current()?.owner,target=()=>$('builder-target').value.trim().toLowerCase();
let equity=null,sequence=0,busy=false,lastOwner=null,lastProvider=null,config=null,safeOwner=false,timer=null;
function render(){
  const address=owner(),builder=target();
  $('builder-current').textContent=!config?'Refreshing':config.builder?'Builder fee: on, 0.1%':'Builder fee: off';
  $('builder-current-address').hidden=!config?.builder;$('builder-current-address').textContent=config?.builder||'';
  $('builder-address').textContent=address||'Connect a Safe owner wallet to authorize the setting.';
  $('builder-equity').textContent=equity===null?'—':usd(equity);
  $('builder-target-full').textContent=valid(builder)?builder:'';
  $('builder-target').disabled=busy;$('builder-target').setAttribute('aria-invalid',String(!valid(builder)));
  $('builder-copy').disabled=!valid(builder)||busy;$('builder-refresh').disabled=busy;
  const ready=!!address&&!!config&&safeOwner===true&&valid(builder)&&equity!==null&&equity>=100&&config.builder!==builder;
  $('builder-ready').hidden=!ready;$('builder-on').disabled=busy||!ready;
  $('builder-off').hidden=!config?.builder||!address||!safeOwner;$('builder-off').disabled=busy;
}
async function refresh(){
  const address=owner(),provider=current()?.entry?.provider,builder=target(),seq=++sequence;
  config=null;equity=null;safeOwner=false;render();$('builder-status').textContent='Checking the Safe signer and receiving builder…';
  const [setting,state,authorization]=await Promise.allSettled([loadLivePerpsConfig(),valid(builder)?info({type:'clearinghouseState',user:builder}):Promise.resolve(null),address?isSafeOwner(address):Promise.resolve(false)]);
  if(seq!==sequence||address!==owner()||provider!==current()?.entry?.provider||builder!==target())return false;
  if(setting.status==='fulfilled')config=setting.value;
  const value=state.status==='fulfilled'?state.value?.marginSummary?.accountValue:null;
  if(value!==null&&value!==undefined&&String(value).trim()&&Number.isFinite(Number(value)))equity=Number(value);
  safeOwner=authorization.status==='fulfilled'&&authorization.value===true;
  $('builder-status').textContent=!config?'Builder settings are refreshing. Retry before signing.':!valid(builder)?'Enter a valid receiving builder address.':!address?'Connect a Safe owner to authorize this builder. The builder wallet does not need to connect.':authorization.status==='rejected'?'Safe ownership is refreshing. Retry the check.':!safeOwner?'Connect a wallet listed as an owner of the QHooks Safe.':equity===null?'Builder equity is refreshing. Retry the check; turn-off remains available.':equity<100?'The receiving builder needs at least 100 USDC in Hyperliquid perps account value. Your Safe signing wallet does not need a Hyperliquid account.':config.builder===builder?'This receiving builder is already on at 0.1%.':'Safe owner verified. Sign one message to authorize the receiving builder at 0.1%.';
  render();
}
async function run(fn){if(busy)return;confirm.setOpener(document.activeElement);busy=true;render();try{await fn();}catch(e){$('builder-status').textContent=e.message||'Refreshing. Try again.';}finally{busy=false;render();confirm.restoreFocus();confirm.setOpener(null);}}
async function change(action){
  const snapshot=current(),address=snapshot?.owner,provider=snapshot?.entry?.provider,builder=target();
  if(!address||!provider)throw Error('Connect a QHooks Safe owner wallet.');
  if(action==='off'&&!await confirm.ask('Turn off builder fee?','New orders will stop including the QHooks builder fee. Sign one message to confirm.'))return;
  await refresh();
  const unchanged=()=>owner()===address&&current()?.entry?.provider===provider&&(action==='off'||target()===builder);
  if(!unchanged())throw Error('Wallet or receiving builder changed. Review again.');
  if(!config)throw Error('Builder settings are refreshing. Retry before signing.');
  if(!safeOwner)throw Error('Connect a verified QHooks Safe owner wallet.');
  if(action==='on'&&(!valid(builder)||equity===null||equity<100))throw Error('The receiving builder must have at least 100 USDC in Hyperliquid perps account value.');
  ++sequence;config=null;render();$('builder-status').textContent='Confirm the message in your Safe owner wallet. It names the separate receiving builder.';
  await changeBuilderFee({address,builder,action,provider,isCurrent:unchanged});
  if(!unchanged())return;
  let verified;try{verified=await loadLivePerpsConfig();}catch{throw Error('The change is not yet verified. Refresh before trying again.');}
  if(!unchanged())return;
  if(verified.builderFeeTenthsBp!==100||verified.builder!==(action==='on'?builder:null))throw Error('The builder change is not yet verified. Refresh before trying again.');
  config=verified;safeOwner=true;$('builder-status').textContent=verified.builder?'Done. The receiving builder is on at 0.1%, verified from the current setting.':'Done. Builder fee is off, verified from the current setting.';
}
$('builder-on').addEventListener('click',()=>run(()=>change('on')));$('builder-off').addEventListener('click',()=>run(()=>change('off')));$('builder-refresh').addEventListener('click',()=>run(refresh));
$('builder-copy').addEventListener('click',()=>run(async()=>{const builder=target();if(!valid(builder))return;try{await navigator.clipboard.writeText(builder);$('builder-status').textContent='Receiving builder address copied.';}catch{$('builder-status').textContent='Select and copy the builder address above.';}}));
$('builder-target').addEventListener('input',()=>{clearTimeout(timer);++sequence;equity=null;render();timer=setTimeout(refresh,450);});
hub.subscribe(()=>{if(lastOwner!==owner()||lastProvider!==current()?.entry?.provider){lastOwner=owner();lastProvider=current()?.entry?.provider;confirm.cancel();refresh();}render();});
if(sequence===0)refresh();window.addEventListener('pagehide',()=>clearTimeout(timer));
