// Presentation and public configuration only. Transaction authority remains in L129.
import {withPair} from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
import {launchJourneyStatus} from './l164-journey-status.mjs';
import {createLaunchRecipe,recipeChain,readLaunchRecipe,writeLaunchRecipe,recipeLimit} from '/trade-client/apps/marketplace-preview/l124-launch-recipe.mjs';
import {readLaunchForm} from './launch-form-values.mjs';
import {fillRecipeForm} from '/trade-client/apps/marketplace-preview/l124-recipe-form.mjs';
import {parseDecimalAmount} from '/full-launch/packages/crosschain/decimal-amount.mjs';
import {qTokenPresetValues} from './l162-qtoken-presets.mjs';
import {chainMap} from './chains.mjs';
import {launchDraftView,placeSelectSymbols} from './crypto-product-ui.mjs';
import {exportSwapPoolPackage} from '/trade-client/packages/multichain-swap/pool-package.mjs';
import {tradePoolLink} from '/trade-client/apps/marketplace-preview/trade-pool-links.mjs';
const draftPrefix='qhooks:journey-draft:v1:',savedPrefix='qhooks:lab:graduation-recipe:v1:';
const held=s=>['unknown','submitting','submitted'].includes(s?.launch?.action?.stage?.status)||['unknown','submitting','submitted'].includes(s?.wrap?.stage?.status);
export function bindLaunchJourney({document:d=document,target=window,snapshot=()=>({}),blocked=false,downloadFile}={}){
 const $=id=>d.getElementById(id),listeners=[];let step=0,dead=false,workspace=null,packet=null,importing=false,revision=0,seenLaunch=false;
 const listen=(n,type,fn)=>{if(!n)throw Error('Missing journey control');n.addEventListener(type,fn);listeners.push([n,type,fn]);};
 const text=(id,value)=>{$(id).textContent=value;};
 const message=(value,error=false)=>{text('qj-message',value);$('qj-message').dataset.error=String(error);};
 const current=()=>snapshot()||{},canEdit=()=>!blocked&&!dead&&!importing&&launchJourneyStatus(current()).canConfigure;
 const recipe=()=>createLaunchRecipe($('ql-chain').value,readLaunchForm(d,parseDecimalAmount));
 function download(body,name){if(downloadFile)return downloadFile(body,name,true);const url=target.URL.createObjectURL(new Blob([body],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download=name;d.body.append(a);a.click();a.remove();target.setTimeout(()=>target.URL.revokeObjectURL(url),30000);}
 function remember(){try{const value=writeLaunchRecipe(recipe());target.sessionStorage.setItem(draftPrefix+$('ql-chain').value,value);if(target.sessionStorage.getItem(draftPrefix+$('ql-chain').value)!==value)throw Error('Draft not saved');}catch{message('This configuration is not saved yet. Use Download configuration to keep a copy.');}}
 function validate(){try{recipe();message('');return true;}catch(error){message(error.message||'Check your settings.',true);$('qj-message').focus();$('qj-message').scrollIntoView?.({block:'start'});return false;}}
 function choose(next,focus=true){
  if(dead||blocked||launchJourneyStatus(current()).busy)return;
  const s=current(),hasLaunch=!!s.launch;
  if(next>0&&!hasLaunch&&!validate())return;
  if(next===3&&!hasLaunch&&($('ql-begin').disabled||!s.connected)){message('Connect on your selected chain, then create or restore and verify your quantum-key backup.',true);next=2;}
  step=next;render();
  if(focus){const heading=$('qj-heading-'+step);heading.focus();heading.scrollIntoView?.({block:'start'});}
 }
 function applyDraft(value){
  if(!canEdit())throw Error('Keep the current launch unchanged.');
  const next=readLaunchRecipe(value),before=$('ql-chain').value;
  if(current().connected&&next.chainId!==before)throw Error('Disconnect before importing a different chain.');
  fillRecipeForm(d,next);revision++;$('qj-preset').value='custom';
  if(next.chainId!==before)$('ql-chain').dispatchEvent(new (target.Event||Event)('change',{bubbles:true}));
  $('ql-name').dispatchEvent(new (target.Event||Event)('input',{bubbles:true}));remember();render();
 }
 function clearLinks(){packet=null;$('qj-market-actions').hidden=true;$('qj-share').value='';for(const id of ['qj-trade','qj-list'])$(id).removeAttribute('href');}
 let shareRetries=0;
 function render(){
  if(dead)return;placeSelectSymbols(d);const s=current(),v=launchJourneyStatus(s),ready=v.complete&&!held(s);
  if(v.hasLaunch&&!seenLaunch){seenLaunch=true;step=3;}if(!v.hasLaunch)seenLaunch=false;
  for(let i=0;i<4;i++){$('qj-panel-'+i).hidden=step!==i;$('qj-step-'+i).setAttribute('aria-current',step===i?'step':'false');$('qj-step-'+i).disabled=blocked||v.busy;}
  for(const id of ['qj-next-token','qj-next-rules','qj-back-rules','qj-back-key','qj-back-review'])$(id).disabled=blocked||v.busy;
  $('qj-next-key').disabled=blocked||v.busy||!s.connected||(!v.hasLaunch&&$('ql-begin').disabled);
  $('qj-preset').disabled=!canEdit();for(const id of ['qj-save-draft','qj-restore-draft','qj-import-draft','qj-download-draft','qj-draft-file'])$(id).disabled=!canEdit();
  for(const button of d.querySelectorAll('[data-qtd-chain]')){button.disabled=blocked||$('ql-chain').disabled||v.busy;button.setAttribute('aria-pressed',String(!blocked&&button.dataset.qtdChain===$('ql-chain').value));}
  try{const c=withPair(recipeChain($('ql-chain').value)),value=id=>$(id).value,view=launchDraftView({name:value('ql-name'),symbol:value('ql-symbol'),supply:value('ql-supply'),mode:value('ql-mode'),fee:value('ql-fee'),network:c.name});
   text('qtd-summary-name',view.name+' ('+view.symbol+')');text('qtd-summary-chain',c.name);text('qtd-summary-supply',value('ql-supply').trim()||'Not set');text('qtd-summary-token',(value('ql-token-funding').trim()||'Not set')+' '+view.symbol);text('qtd-summary-quote',(value('ql-quote-funding').trim()||'Not set')+' '+c.quoteSymbol);text('qtd-quote-label','Initial '+c.quoteSymbol+' amount');text('qtd-summary-note','Initial liquidity uses '+c.quoteSymbol+' on '+c.name+'. Network gas is paid in '+c.nativeSymbol+'.');text('qtd-fee-preview',view.fees);
   if(!s.connected)text('ql-quote-unit','Liquidity uses '+c.quoteSymbol+' ('+c.quoteDecimals+' decimals). Keep '+c.nativeSymbol+' for network fees.');
   const names=chainMap(c=>c.icon);$('qtd-summary-chain-icon').src='/chain-symbol-icons/'+names[c.id]+'.svg';$('ql-threshold-label').hidden=$('ql-mode').value!=='0';
  }catch{message('Choose one supported chain before continuing.',true);}
  $('qj-success').hidden=!ready;
  if(!ready){shareRetries=0;clearLinks();return;}
  text('qj-launched-name',s.launch.fields.tokenName+' ('+s.launch.fields.symbol+')');text('qj-launched-chain',recipeChain(s.launch.chainId).name);text('qj-token-address',s.launch.addresses.token);text('qj-controller-address',s.launch.addresses.controller);$('qj-qwallet').href='/qwallets.html?chain='+s.launch.chainId;const story=d.getElementById('qj-story');if(story)story.href='/launch-story.html?chain='+s.launch.chainId;
  try{if(!workspace)throw Error('Restore and check the launch first');packet=exportSwapPoolPackage(workspace);const link=tradePoolLink(packet);$('qj-trade').href=link;$('qj-list').href='/list-market.html'+link.slice('/trade.html'.length);$('qj-share').value=new URL(link,target.location.href).href;{const story=d.getElementById('qj-story');if(story)story.href='/launch-story.html?chain='+s.launch.chainId+'#trade='+encodeURIComponent(link);}$('qj-market-actions').hidden=false;text('qj-share-status','Only public pool details are shared. Listing opens a separate review; nothing is submitted automatically.');}
  catch{clearLinks();text('qj-share-status','Check the saved launch and confirmed contract history before creating a trading link.');if(shareRetries<20&&!dead){shareRetries++;target.setTimeout(()=>{if(!dead)render();},1000);}}
 }
 for(let i=0;i<4;i++)listen($('qj-step-'+i),'click',()=>choose(i));
 for(const [id,next]of [['qj-next-token',1],['qj-next-rules',2],['qj-next-key',3],['qj-back-rules',0],['qj-back-key',1],['qj-back-review',2]])listen($(id),'click',()=>{if(next===2&&validate())remember();choose(next);});
 for(const button of d.querySelectorAll('[data-qtd-chain]'))listen(button,'click',()=>{if(!canEdit()||$('ql-chain').disabled)return;$('ql-chain').value=button.dataset.qtdChain;$('ql-chain').dispatchEvent(new (target.Event||Event)('change',{bubbles:true}));render();});
 for(const id of ['ql-chain','ql-name','ql-symbol','ql-supply','ql-decimals','ql-token-funding','ql-quote-funding','ql-fee','ql-mode','ql-threshold','ql-notice','ql-destination-fee'])for(const kind of ['input','change'])listen($(id),kind,()=>{revision++;$('qj-preset').value='custom';render();});
 listen($('qj-preset'),'change',()=>{if(!canEdit()||$('qj-preset').value==='custom')return;try{const id=$('qj-preset').value,p=qTokenPresetValues($('ql-chain').value,id);for(const[k,suffix]of Object.entries({mode:'mode',fee:'fee',notice:'notice',threshold:'threshold',destinationFee:'destination-fee'}))$('ql-'+suffix).value=p[k];$('ql-mode').dispatchEvent(new (target.Event||Event)('change',{bubbles:true}));$('qj-preset').value=id;render();}catch(error){message(error.message,true);}});
 listen($('qj-save-draft'),'click',()=>{if(!canEdit())return;try{const value=writeLaunchRecipe(recipe()),key=savedPrefix+$('ql-chain').value;target.localStorage.setItem(key,value);if(target.localStorage.getItem(key)!==value)throw Error('Configuration did not save');message('Configuration saved. It contains no private key.');}catch(error){message(error.message,true);}});
 listen($('qj-restore-draft'),'click',()=>{try{applyDraft(target.localStorage.getItem(savedPrefix+$('ql-chain').value));message('Saved configuration restored.');}catch(error){message(error.message,true);}});
 listen($('qj-download-draft'),'click',()=>{if(!canEdit())return;try{download(writeLaunchRecipe(recipe()),'qhooks-'+$('ql-chain').value+'-configuration.json');message('Public configuration download requested.');}catch(error){message(error.message,true);}});
 listen($('qj-import-draft'),'click',async()=>{if(!canEdit())return;const rev=revision,f=$('qj-draft-file').files?.[0];try{if(!f||f.size<=0||f.size>recipeLimit)throw Error('Choose a public recipe JSON up to 8192 bytes.');importing=true;render();const value=await f.text();if(dead||rev!==revision||current().launch||launchJourneyStatus(current()).busy)throw Error('The launch changed while reading the file.');importing=false;applyDraft(value);$('qj-draft-file').value='';message('Public configuration imported.');}catch(error){if(!dead)message(error.message,true);}finally{importing=false;render();}});
 listen($('qj-download-pool'),'click',()=>{if(packet&&launchJourneyStatus(current()).complete&&!held(current()))download(packet,'qhooks-public-pool.json');});
 listen($('qj-copy-link'),'click',async()=>{const link=$('qj-share').value;if(!packet||!link||!launchJourneyStatus(current()).complete||held(current()))return;try{await target.navigator.clipboard.writeText(link);if(!dead)text('qj-share-status','Public trading link copied.');}catch{if(!dead){$('qj-share').focus();$('qj-share').select?.();text('qj-share-status','Select and copy this public trading link.');}}});
 listen($('qj-manage'),'click',()=>{$('ql-manage-heading').focus();$('ql-manage-heading').scrollIntoView?.({block:'start'});});
 const Observer=target.MutationObserver;const observer=Observer?new Observer(()=>render()):null;
 for(const id of ['ql-connection','ql-key-status','ql-progress','ql-feedback','ql-begin'])observer?.observe($(id),{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
 function wrapClient(client){return Object.freeze({...client,async createLaunchWorkspace(options){let instance=null;const next=await client.createLaunchWorkspace({...options,onChange(...args){options.onChange?.(...args);if(instance&&workspace===instance)render();}});if(dead){next.dispose();throw Error('Launch page closed');}instance=next;workspace=next;Promise.resolve().then(render);return Object.freeze({...next,dispose(){if(workspace===next){workspace=null;clearLinks();}next.dispose();}});}});}
 function dispose(){if(dead)return;dead=true;workspace=null;packet=null;observer?.disconnect();for(const[n,type,fn]of listeners)n.removeEventListener(type,fn);}
 listen(target,'pagehide',dispose);
 if(blocked){for(const n of $('launch-workspace').querySelectorAll('input,select,button,textarea'))n.disabled=true;message('This launch link has an invalid or repeated chain. Return through Launch token.',true);}
 else{try{const value=target.sessionStorage.getItem(draftPrefix+$('ql-chain').value);if(value)applyDraft(value);}catch{message('The previous public configuration could not be restored. Import it or enter your settings.');}}
 render();return Object.freeze({render,wrapClient,dispose,get step(){return step;}});
}
