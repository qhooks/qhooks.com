import {onTokenProfileDraft} from './qx-token-profile.mjs';
import {normalizeTokenFields} from './full-launch/packages/token-launch/token-fields.mjs';
import {startSelection,optionalQuoteRaw} from './qx-guided-start-core.mjs';
import {chainById} from './chains.mjs';
import {stockPair} from './full-launch/packages/multichain-launch/stock-pairs.mjs';
import {normalizeStudioConfiguration,readStudioConfiguration,studioAgentArguments,normalizeStudioAgent,studioConfigurationFromHash,STUDIO_CONFIG_LIMIT} from './qx-studio-config.mjs';
import {readLaunchForm} from './trade-client/apps/marketplace-preview/launch-form-values.mjs';
import {parseDecimalAmount} from './full-launch/packages/crosschain/decimal-amount.mjs';
import {normalize as normalizeLaunchRow} from './qx-a/pages/hooks-live.mjs';
import {studioGas} from './qx-studio-gas.mjs';
const d=document,$=id=>d.getElementById(id),h=(tag,attrs={},...kids)=>{const e=d.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')e.className=v;else e.setAttribute(k,v);}e.append(...kids.flat().filter(x=>x!=null));return e;};
const root=$('launch-workspace');
if(root){
 const rules=$('qtd-rules-panel'),blocks=$('qx-blocks');
 const policy=h('details',{class:'qs-policy'},h('summary',{},'Graduation & LP fees'));
 for(const n of [...rules.children])if(n!==blocks&&!n.classList.contains('qtd-actions')&&!n.classList.contains('qtd-muted'))policy.append(n);
 rules.prepend(blocks);blocks.after(policy);
 const vals=()=>readLaunchForm(d,parseDecimalAmount);
 const config=()=>normalizeStudioConfiguration({kind:'qhooks-expert-studio',version:1,chainId:$('ql-chain').value,pair:$('ql-pair')?.value||'',fields:{...vals(),blocks:$('ql-blocks').value}});
 const status=h('p',{role:'status','aria-live':'polite',id:'qs-config-status'}),json=h('textarea',{id:'qs-agent-json',rows:'7','aria-label':'Public launch JSON',spellcheck:'false',placeholder:'Paste Studio prepare_launch arguments or a full Studio configuration'});
 const copy=h('button',{type:'button',class:'workspace-button'},'Copy for agent'),download=h('button',{type:'button',class:'workspace-button'},'Export JSON'),apply=h('button',{type:'button',class:'workspace-button'},'Review imported JSON');
 const file=h('input',{type:'file',accept:'.json,application/json',id:'qs-config-file'}),preview=h('div',{class:'qs-import-review',hidden:''}),applyConfirm=h('button',{type:'button',class:'workspace-button'},'Apply reviewed draft'),previewLine=h('p');preview.append(previewLine,applyConfirm);
 const tools=h('details',{class:'qs-config-tools'},h('summary',{},'Export / import · agents & saved drafts'),h('p',{},'Copy prepare_launch arguments for an agent, or save the same JSON. Includes every pool rule and payee. Artwork and encrypted key backups stay separate.'),h('div',{class:'qj-actions'},copy,download),h('label',{for:'qs-config-file'},'Import public JSON',file),json,apply,preview,status);
 d.querySelector('.qj-content')?.prepend(tools);
 const report=fn=>{try{return fn();}catch(e){status.textContent=e.message;}};
 copy.addEventListener('click',async()=>{try{const text=JSON.stringify(studioAgentArguments(config()),null,2);json.value=text;await navigator.clipboard.writeText(text);status.textContent='Copied prepare_launch arguments. The agent returns a draft link; nothing is signed.';}catch(e){status.textContent=e.message+' You can select and copy the JSON below.';}});
 download.addEventListener('click',()=>report(()=>{const text=JSON.stringify(studioAgentArguments(config()),null,2),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=h('a',{href:url,download:'qhooks-studio-public.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Public configuration exported. No private key or artwork included.';}));
 let pending=null;
 const review=text=>{pending=null;preview.hidden=true;const obj=JSON.parse(text);pending=typeof obj.configuration==='string'?normalizeStudioAgent(obj):readStudioConfiguration(text);previewLine.textContent=pending.fields.tokenName+' ($'+pending.fields.symbol+') · chain '+pending.chainId+' · '+pending.fields.tokenAmount+' tokens in pool · '+(pending.fields.blocks?'custom blocks':'no blocks')+'. Applying replaces the current public draft only. Review all settings before launch.';preview.hidden=false;status.textContent='Configuration validated. Review this summary before replacing your draft.';};
 apply.addEventListener('click',()=>report(()=>{if(json.value.length>STUDIO_CONFIG_LIMIT*2)throw Error('Choose JSON under 24 KB.');review(json.value);}));
 file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;try{if(f.size>STUDIO_CONFIG_LIMIT*2)throw Error('Choose JSON under 24 KB.');json.value=await f.text();review(json.value);}catch(e){pending=null;preview.hidden=true;status.textContent=e.message;}finally{file.value='';}});
 const format=(raw,dec)=>{const n=BigInt(raw),base=10n**BigInt(dec),f=(n%base).toString().padStart(dec,'0').replace(/0+$/,'');return String(n/base)+(f?'.'+f:'');};
 applyConfirm.addEventListener('click',()=>report(()=>{
  if(!pending)throw Error('Review a configuration first.');const c=normalizeStudioConfiguration(pending);
  if($('ql-name').disabled||$('ql-chain').disabled||!$('ql-disconnect').disabled&&$('ql-chain').value!==c.chainId)throw Error('Keep the active launch unchanged. Disconnect before importing a different chain.');
  if(c.pair&&(!$('ql-pair')||$('ql-pair').disabled||$('ql-pair').closest('[hidden]')||![...$('ql-pair').options].some(o=>o.value===c.pair&&!o.disabled)))throw Error('This quote pair is unavailable in this region or current view.');
  const f=c.fields,map={'ql-name':f.tokenName,'ql-symbol':f.symbol,'ql-decimals':f.decimals,'ql-supply':format(f.totalSupply,Number(f.decimals)),'ql-notice':f.notice,'ql-fee':format(f.lpFeePpm,4),'ql-token-funding':f.tokenAmount,'ql-quote-funding':f.quoteAmount,'ql-mode':f.graduationMode,'ql-threshold':f.threshold,'ql-destination-fee':format(f.destinationFeePpm,4)};
  if(f.startTier!==undefined)Object.assign(map,{'ql-start-tier':f.startTier,'ql-start-steps':f.startSteps,'ql-start-usd':f.startUsd||''});
  for(const id of Object.keys(map))if(!$(id)||$(id).disabled)throw Error('Studio is busy. Keep the current launch unchanged.');
  $('ql-chain').value=c.chainId;$('ql-chain').dispatchEvent(new Event('change',{bubbles:true}));if($('ql-pair')){$('ql-pair').value=c.pair;$('ql-pair').dispatchEvent(new Event('change',{bubbles:true}));}
  for(const[id,value]of Object.entries(map))$(id).value=value;
  for(const id of Object.keys(map)){$(id).dispatchEvent(new Event('input',{bubbles:true}));$(id).dispatchEvent(new Event('change',{bubbles:true}));}
  $('ql-blocks').value=f.blocks;$('ql-blocks').dispatchEvent(new Event('qx-blocks-load'));$('ql-blocks').dispatchEvent(new Event('input',{bubbles:true}));
  pending=null;preview.hidden=true;status.textContent='Draft applied. Check Token, Pool rules and Review before launching.';paintDots();
 }));
 try{const linked=studioConfigurationFromHash(location.hash);if(linked){history.replaceState(history.state,'',location.pathname+location.search);tools.open=true;json.value=JSON.stringify(studioAgentArguments(linked),null,2);review(json.value);}}catch(e){tools.open=true;status.textContent=e.message;}
 const dots=[0,1,2,3].map(i=>{const dot=h('span',{class:'qs-step-dot','aria-hidden':'true'});$('qj-step-'+i).append(dot);return dot;});
 function paintDots(){
  let valid=false;try{config();valid=true;}catch{}
  let token=false;try{const decimals=Number($('ql-decimals').value),supply=parseDecimalAmount($('ql-supply').value,decimals),amount=BigInt(parseDecimalAmount($('ql-token-funding').value,decimals)),chain=chainById($('ql-chain').value),pair=$('ql-pair')?.value?stockPair(chain.id,$('ql-pair').value):null;normalizeTokenFields({tokenName:$('ql-name').value,symbol:$('ql-symbol').value,decimals:String(decimals),totalSupply:supply});optionalQuoteRaw($('ql-quote-funding').value||'0',pair?.decimals??chain.quote.decimals);startSelection($('ql-start-tier')?.value||'standard',$('ql-start-steps')?.value||'0',$('ql-start-usd')?.value||'');token=amount>0n&&amount<=BigInt(supply);}catch{}const blocks=!$('ql-blocks').dataset.problem;
  const key=/Backup verified/.test($('ql-key-status').textContent),image=!!d.querySelector('#ql-profile .qtp-preview-avatar:not([hidden])')?.getAttribute('src');
  [token,valid&&blocks,key,valid&&blocks&&key&&image].forEach((ready,i)=>{dots[i].dataset.valid=String(ready);dots[i].title=ready?'Ready':'Needs attention';$('qj-step-'+i).setAttribute('aria-label',['Token','Pool rules','Key backup','Review & launch'][i]+(ready?' · ready':' · needs attention'));});
 }
 onTokenProfileDraft(paintDots);root.addEventListener('input',paintDots);root.addEventListener('change',paintDots);new MutationObserver(paintDots).observe($('ql-key-status'),{childList:true,subtree:true});paintDots();
 $('qs-key-early').addEventListener('click',()=>$('qj-step-2').click());
 for(const id of ['ql-generate','ql-restore-key'])$(id)?.addEventListener('click',e=>{if($('qs-key-understand').checked)return;e.preventDefault();e.stopImmediatePropagation();$('ql-key-feedback').textContent='Read the checklist and confirm what this key controls first.';$('qs-key-understand').focus();},true);
 // One bounded directory read on first visible Rules visit. No poll, scan, new API or per-block fan-out.
 let usage=null,loading=false,controller=null;
 async function adoption(){
  if(usage||loading||d.hidden||$('qj-panel-1').hidden)return;loading=true;controller=new AbortController();
  try{const r=await fetch('/api/terminal/feed?chain=all',{signal:controller.signal,headers:{accept:'application/json'}});if(!r.ok)throw Error();const j=await r.json();if(!Array.isArray(j.markets)||j.coverage?.degraded||j.refreshing)throw Error();const seen=new Set();usage=j.markets.map(normalizeLaunchRow).filter(m=>{if(!m.live||seen.has(m.key))return false;seen.add(m.key);return true;});paintUsage();}catch{for(const n of root.querySelectorAll('[data-qs-usage]'))n.textContent=studioGas([n.dataset.qsUsage]).label+' · Launch count unavailable';}finally{loading=false;}
 }
 function paintUsage(){if(!usage)return;for(const n of root.querySelectorAll('[data-qs-usage]')){const id=n.dataset.qsUsage,count=usage.filter(m=>m.blocks.includes(id)).length;n.textContent=studioGas([id]).label+' · '+(id==='openingAuction'||id==='payees'?'Launch count not separately indexed':(count?'Used by at least '+count+(count===1?' live launch · current feed':' live launches · current feed'):'No usage observed in current feed'));}}
 new MutationObserver(()=>{paintUsage();void adoption();}).observe($('qj-panel-1'),{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(paintUsage).observe($('qx-blocks'),{childList:true});
 d.addEventListener('visibilitychange',()=>{if(d.hidden)controller?.abort();else void adoption();});addEventListener('pagehide',()=>controller?.abort());
}
