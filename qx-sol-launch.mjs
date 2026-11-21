import {solModel,mountCreateModelPreview} from './qx-create-model-preview.mjs';
import {mountLaunchTickerInput} from './qx-launch-ticker.mjs';
import {launchReadiness,paintLaunchReadiness} from './qx-quick-launch-readiness.mjs';
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {launchIdentityDraft,draftTokenProfile} from './qx-create-draft.mjs';
import {solLaunchError} from './qx-sol-launch-errors.mjs';
import {recordSolLaunch} from './qx-sol-launch-record.mjs';
import {SOL_LAUNCH_CONFIG as C,solLaunchConfigReady} from './qx-sol-launch-config.mjs';
import {solReviewLines,solFirstBuyNote,normalizeSolMetadata,solAmount,solText} from './qx-sol-launch-values.mjs';
import {setSolActivePolicy,solActivePolicy} from './qx-sol-launch-config.mjs';
import {mountTeamBuy} from './qx-team-buy-ui.mjs';
import {TEAM_TEXT,TEAM_BUY_LIVE,supplyPercent} from './qx-team-buy-core.mjs';
import {sendSolTeamShares} from './qx-team-buy-sol.mjs';
import {mountTokenProfileEditor,editableTokenProfileDraft,onTokenProfileDraft,setTokenProfileDraft} from './qx-token-profile.mjs';
import {solAddress,solWallets,connectSol,onSolChange} from './qx-solana.mjs';
import {solApi,solRuntime,prepareSolTransaction,sendPreparedSol,buildSolLaunch} from './qx-sol-launch-client.mjs';
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v);}n.append(...kids.flat().filter(x=>x!=null));return n;};
const button=(text,fn,primary=false)=>el('button',{type:'button',class:primary?'qxc-primary':'',onclick:fn},text);
export function mountSolCreate({chainSelect,onExit=()=>{}}){
 const quick=document.querySelector('.cr5 #qq-quick'),identityDraft=launchIdentityDraft(),inline=!!quick;
 const root=el('section',{class:'qxc-sol',hidden:'',id:'qsc-root'}),chainSlot=el('div',{class:'qxc-fields'}),message=el('p',{class:'qxc-message',role:'status','aria-live':'polite'}),wallets=el('div',{class:'qxc-key-actions'});
 const receiptLink=el('p',{class:'qxc-number'});
 const screens=[1,2,3].map(i=>el('section',{class:'qxc-panel',id:'qsc-step-'+i,'aria-labelledby':'qsc-title-'+i},el('div',{class:'qxc-panel-head'},el('h2',{id:'qsc-title-'+i,tabindex:'-1'},['Your token','Hooks & rules','Review & launch'][i-1]),el('span',{},'0'+i+' / 03'))));
 const name=el('input',{maxlength:'32',autocomplete:'off',placeholder:'Token name'}),symbol=el('input',{maxlength:'10',autocomplete:'off',placeholder:'TICKER'}),buy=el('input',{inputmode:'decimal',value:'0',autocomplete:'off','aria-describedby':'qsc-buy-note'});
 let active=false,step=1,busy=false,config=null,runtime=null,mint=null,prepared=null,details=null,cost=null,pending=null,metadataUri=null;
 // Team buy (2026-11-21): shown only on a config whose creator first buy pays the base fee (policy 2).
 const team=mountTeamBuy({chain:'solana',creator:()=>solAddress(),onChange:()=>{prepared=null;cost=null;metadataUri=null;}}),buyPct=el('p',{class:'qxc-fine',id:'qsc-buy-pct',role:'status'});
 let pctTimer=null;const paintPct=()=>{clearTimeout(pctTimer);if(!TEAM_BUY_LIVE){buyPct.textContent='';return;}pctTimer=setTimeout(async()=>{let lamports=0n;try{lamports=solAmount(buy.value);}catch{}if(lamports<=0n){buyPct.textContent='';return;}try{runtime||=await solRuntime();const p=solActivePolicy(),q=runtime.client.pool.getQuoteFromInputAmount({config:runtime.buildSolLaunchParameters(p),amountIn:new runtime.BN(lamports.toString()),swapBaseForQuote:false,slippageBps:0,hasReferral:false,eligibleForFirstSwapWithMinFee:p.enableFirstSwapWithMinFee===true});buyPct.textContent=TEAM_TEXT.supply(supplyPercent(q.outputAmount.toString(),BigInt(C.totalSupply)*10n**BigInt(C.tokenDecimals)));}catch{buyPct.textContent='';}},250);};
 buy.addEventListener('input',paintPct);
 let teamPending=null;try{teamPending=JSON.parse(localStorage.getItem('qhooks:team-buy:pending:solana')||'null');}catch{}
 try{const d=JSON.parse(localStorage.getItem('qhooks:sol-launch:draft')||'null');name.value=d?.name||'';symbol.value=d?.symbol||'';buy.value=d?.buy||'0';pending=JSON.parse(localStorage.getItem('qhooks:sol-launch:pending')||'null');}catch{}
 const q=new URLSearchParams(location.search);if(q.get('chain')==='solana'){if(q.has('name'))name.value=q.get('name').slice(0,32);if(q.has('ticker'))symbol.value=q.get('ticker').slice(0,10).toUpperCase();}
 const save=()=>{try{localStorage.setItem('qhooks:sol-launch:draft',JSON.stringify({name:name.value,symbol:symbol.value,buy:buy.value}));}catch{}prepared=null;cost=null;mint=null;metadataUri=null;};
 for(const n of [name,symbol,buy])n.addEventListener('input',()=>{if(n===symbol)n.value=n.value.toUpperCase();save();});
 screens[0].append(el('div',{class:'qxc-fields'},el('label',{},'Name',name),el('label',{},'Ticker',symbol)),wallets,mountTokenProfileEditor({id:'qsc-profile',chain:()=> 'solana',name:()=>name.value,symbol:()=>symbol.value,imageRequired:true,bannerRequired:true}),el('div',{class:'qxc-actions'},button('Hooks & rules →',()=>go(2),true)));
 const rules=el('dl',{class:'qxc-sol-rules'},...solReviewLines().flatMap(([k,v])=>[el('dt',{},k),el('dd',{},v)]));
 screens[1].append(rules,el('label',{},'Your optional first buy · SOL',buy),el('p',{id:'qsc-buy-note',class:'qxc-fine'},solFirstBuyNote()),buyPct,team.node,el('div',{class:'qxc-actions'},button('← Your token',()=>go(1)),button('Review launch →',()=>go(3),true)));
 const review=el('div'),launch=button('Confirm and launch',()=>void confirm(),true),prepareButton=button('Prepare launch review',()=>void reviewAction(),true),recover=button('Check launch confirmation',()=>void recoverPending(),true),done=el('div',{class:'qxc-done'});
 screens[2].append(review,el('div',{class:'qxc-actions'},button('← Hooks & rules',()=>go(2)),prepareButton,launch,recover),done);
 root.append(chainSlot,...screens,message,receiptLink);document.getElementById('qc-screen-1').before(root);
 const chainLabel=chainSelect.closest('label'),origin=chainLabel.parentNode,after=chainLabel.nextSibling;
 chainSelect.append(el('option',{value:'solana'},'Solana'));
 const originals=()=>[...document.querySelectorAll('[id^="qc-screen-"],#qc-saved-launch,#qc-message,.qxc-wallet'+(inline?'':',#qq-quick'))];
 const notify=(text,error=false)=>{message.textContent=text;message.dataset.error=String(error);};
 const rootOrigin=root.parentNode,rootAfter=root.nextSibling;
 let draftError='';
 const readinessHost=el('div',{class:'qq-readiness',id:'qsc-readiness',role:'status','aria-live':'polite','aria-atomic':'true'});prepareButton.setAttribute('aria-describedby','qsc-readiness');launch.setAttribute('aria-describedby','qsc-readiness');prepareButton.closest('.qxc-actions').before(readinessHost);
 const inlineLimit=el('p',{class:'qxc-message',role:'status','aria-live':'polite'});
 const modelAnchor=el('div');root.append(modelAnchor);const modelPreview=mountCreateModelPreview({before:modelAnchor,id:'qsc-model-preview'});modelAnchor.remove();
 if(inline){
  root.classList.add('qsc-inline');
  const hiddenIdentity=el('div',{hidden:''},screens[0]),options=el('details',{class:'qsc-inline-options'},el('summary',{},'Hooks & rules'),rules,screens[1].querySelector('label'),document.getElementById('qsc-buy-note'),buyPct,team.node);
  const actions=screens[2].querySelector('.qxc-actions');actions.firstElementChild.hidden=true;
  root.replaceChildren(hiddenIdentity,wallets,inlineLimit,modelPreview.element,options,review,readinessHost,actions,done,message,receiptLink);
 }
 function syncIdentity(){
  if(!inline||busy||pending)return;
  const d=identityDraft.get();if(!d)return;
  name.value=d.name;symbol.value=d.symbol;save();
  try{setTokenProfileDraft('solana',draftTokenProfile(d));draftError='';}catch(e){draftError=solLaunchError(e);}
  render();
 }
 document.addEventListener('qhooks:create-draft',()=>{if(active)syncIdentity();});
 function fields(){return normalizeSolMetadata({mint:mint?.publicKey.toBase58()||C.quoteMint,name:name.value,symbol:symbol.value,...editableTokenProfileDraft('solana'),teamBuy:team.value()});}
 function go(next){if(busy)return;try{if(next>1)fields();if(next>2)solAmount(buy.value);step=next;render();document.getElementById('qsc-title-'+step).focus({preventScroll:true});root.scrollIntoView({block:'start'});}catch(e){notify(solLaunchError(e),true);}}
 async function loadConfig(){try{config=await solApi('config');config={...config,ready:solLaunchConfigReady(config)};setSolActivePolicy(config.policyVersion);team.setAvailable(TEAM_BUY_LIVE&&config.ready&&solActivePolicy().enableFirstSwapWithMinFee===true);paintPct();rules.replaceChildren(...solReviewLines().flatMap(([k,v])=>[el('dt',{},k),el('dd',{},v)]));{const note=document.getElementById('qsc-buy-note');if(note)note.textContent=solFirstBuyNote();}notify(config.ready?'':'Solana launches open shortly.');}catch{config={ready:false};notify('Solana launches open shortly.');}render();}
 function render(){
  mountLaunchTickerInput(symbol,{id:'qsc-symbol-rule'}).paint();
  if(!active)return;modelPreview.update(solModel({ready:!!config?.ready,cost,prepared,pending:!!pending}));root.hidden=false;for(const n of originals())n.hidden=true;
  if(!inline)for(let i=0;i<3;i++)screens[i].hidden=i!==step-1;
  document.querySelectorAll('[data-screen]').forEach(b=>{b.disabled=busy;if(Number(b.dataset.screen)===step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  wallets.replaceChildren(el('p',{class:'qxc-fine'},solAddress()?'Solana wallet · '+solAddress():'Connect your Solana wallet.'),...solWallets().map(w=>button((solAddress()?'Use ':'Connect ')+w.name,async()=>{try{await connectSol(w.name);prepared=null;render();}catch(e){notify(solLaunchError(e),true);}})));
  if(!solWallets().length)wallets.append(el('p',{class:'qxc-fine'},'Install a Wallet Standard wallet such as Phantom, Solflare or Backpack.'));
  receiptLink.replaceChildren(...(pending?[el('a',{href:'https://solscan.io/tx/'+pending.signature,target:'_blank',rel:'noopener'},'Transaction · '+pending.signature)]:[]));
  const readiness=readinessState();paintLaunchReadiness(readinessHost,readiness);
  launch.hidden=!config?.ready||!prepared||!!pending;launch.disabled=readiness.disabled;prepareButton.hidden=!!prepared||!!pending;prepareButton.disabled=readiness.disabled;prepareButton.textContent=readiness.label;recover.hidden=!pending;recover.disabled=busy;
  if(inline){
   quick.hidden=false;for(const n of quick.querySelectorAll('#qq-name,#qq-symbol,#qq-image,#qq-banner,#qq-description,#qq-x,#qq-telegram,#qq-website'))n.disabled=busy||!!pending;
   const nameError=new TextEncoder().encode(name.value.trim()).length>32?'Use a name of 1–32 UTF-8 bytes, without angle brackets.':'';inlineLimit.textContent=draftError||nameError;inlineLimit.hidden=!inlineLimit.textContent;
   if(nameError||draftError)prepareButton.disabled=true;review.hidden=!prepared&&!pending;done.hidden=!done.childNodes.length;
  }
  chainSelect.disabled=busy;const quickPicker=document.getElementById('qq-chain');if(quickPicker)quickPicker.disabled=busy;
  for(const n of [name,symbol,buy,...screens[0].querySelectorAll('#qsc-profile input,#qsc-profile textarea,#qsc-profile button')])n.disabled=busy||!!pending;
  review.replaceChildren(el('p',{class:'qxc-kicker'},'Solana · Meteora DBC'),el('h3',{},name.value+' · '+symbol.value),el('dl',{class:'qxc-sol-rules'},...solReviewLines().flatMap(([k,v])=>[el('dt',{},k),el('dd',{},v)])));
  if(cost)review.append(el('dl',{class:'qxc-sol-rules'},el('dt',{},'Flat launch fee'),el('dd',{},solText(cost.lamports)+' SOL · about $'+C.flatLaunchUsd+' · one transfer to QHooks'),el('dt',{},'Rent · upfront estimate'),el('dd',{},solText(cost.rent)+' SOL · temporary wrapped SOL account rent may return'),el('dt',{},'Network fee · estimate'),el('dd',{},solText(prepared.networkLamports)+' SOL'),el('dt',{},'First buy'),el('dd',{},buy.value+' SOL · opening anti-snipe applies')));
  if(!config?.ready)notify('Solana launches open shortly.');
 }
 function readinessState(){let profile={},validationError='';try{profile=editableTokenProfileDraft('solana');fields();solAmount(buy.value);}catch(e){validationError=solLaunchError(e);}return launchReadiness({kind:'solana',available:config?.ready,hold:'Solana launches open shortly.',busy,pending:!!pending,image:profile.image,banner:profile.banner,name:name.value,symbol:symbol.value,wallet:!!solAddress(),validationError:draftError||validationError,prepared:!!prepared,reviewError:message.dataset.error==='true'?message.textContent:''});}
 async function reviewAction(){const state=readinessState();if(state.disabled)return;if(state.action==='connect'){notify('Choose your Solana wallet.');const{readPrivyAppConfig}=await import('./qx-privy-app-config.mjs');const settings=await readPrivyAppConfig();if(!active||readinessState().action!=='connect')return;if(settings?.solana_wallet_auth===true)getWalletHub(window).open();else{wallets.tabIndex=-1;(wallets.querySelector('button')||wallets).focus({preventScroll:true});wallets.scrollIntoView({block:'nearest'});}return;}await prepareLaunch();}
 function artReady(){try{const p=editableTokenProfileDraft('solana');return !!p.image&&!!p.banner;}catch{return false;}}
 async function prepareLaunch(){
  if(busy||pending)return;busy=true;render();try{
   if(!config?.ready)throw Error('Solana launches open shortly.');const owner=solAddress();if(!owner)throw Error('Connect your Solana wallet.');fields();const amount=solAmount(buy.value);
   notify('Preparing metadata and simulating your launch…');runtime||=await solRuntime();mint||=runtime.Keypair.generate();details=fields();
   let uri=metadataUri;if(!uri){const meta=await solApi('meta',details);uri=metadataUri=meta.uri;}
   details.uri=uri;
   const quoted=await solApi('cost',{mint:details.mint,creator:owner}),tx=await buildSolLaunch(runtime,{config:config.config,policyVersion:config.policyVersion||1,mint,owner,name:details.name,symbol:details.symbol,uri,buy:amount,lamports:quoted.lamports});
   prepared=await prepareSolTransaction(runtime,tx,[mint],owner);
   const sizes=[82,165,runtime.client.program.account.virtualPool.size,679],response=await fetch('/api/sol-launch/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sizes.map((size,i)=>({jsonrpc:'2.0',id:i,method:'getMinimumBalanceForRentExemption',params:[size,{commitment:'confirmed'}]})))}),rows=await response.json();
   if(!Array.isArray(rows)||rows.some(r=>r.error||!Number.isSafeInteger(r.result)))throw Error('Refreshing the rent estimate. Refresh review.');const rent=rows.reduce((n,r)=>n+BigInt(r.result)*(r.id===1?BigInt(amount>0n?4:2):1n),0n);
   if(owner!==solAddress())throw Error('Wallet changed. Review again.');cost={...quoted,rent};notify('Simulation passed. Review the fees above, then confirm in your wallet.');
  }catch(e){prepared=null;cost=null;notify(solLaunchError(e),true);}finally{busy=false;render();}
 }
 async function confirm(){if(!prepared||busy||pending)return;busy=true;render();try{
  // Refresh the unsigned message and simulation immediately before wallet approval.
  const owner=prepared.owner;prepared=await prepareSolTransaction(runtime,prepared.transaction,[mint],owner);notify('Confirm the token launch in your Solana wallet.');
  const sent=await sendPreparedSol(runtime,prepared);pending={signature:sent.signature,mint:details.mint,creator:owner,team:team.value()};try{localStorage.setItem('qhooks:sol-launch:pending',JSON.stringify(pending));}catch{}
  notify('Waiting for final confirmation…');await sent.confirm();await record();
 }catch(e){notify(solLaunchError(e,'Could not confirm your launch. Please try again.')+(pending?' Check confirmation to continue.':''),true);}finally{busy=false;render();}}
 async function record(){const r=await recordSolLaunch(pending.signature),l=r.launch,teamPlan=pending.team;if(teamPlan?.wallets?.length){teamPending={mint:l.mint,owner:pending.creator,team:teamPlan};try{localStorage.setItem('qhooks:team-buy:pending:solana',JSON.stringify(teamPending));}catch{}}pending=null;mint=null;prepared=null;try{localStorage.removeItem('qhooks:sol-launch:pending');}catch{}done.replaceChildren(el('p',{class:'qxc-kicker'},'Launch complete'),el('h3',{},'Launched.'),el('p',{},l.name+' · '+l.symbol),el('p',{class:'qxc-number'},l.mint),el('a',{class:'qxc-primary',href:'/terminal#t=solana:'+l.mint},'Open your market →'));paintTeamSend();notify('Your coin is live on QHooks.');}
 function paintTeamSend(){done.querySelector('.qtb-send')?.remove();if(!teamPending)return;const n=teamPending.team.wallets.length,b=button(TEAM_TEXT.send(n),()=>void sendTeam(),true);b.classList.add('qtb-send');b.disabled=busy;done.append(b);}
 async function sendTeam(){if(!teamPending||busy)return;if(solAddress()!==teamPending.owner){notify('Connect the creator wallet '+teamPending.owner.slice(0,4)+'…'+teamPending.owner.slice(-4)+' to send team shares.',true);return;}busy=true;render();try{runtime||=await solRuntime();const r=await sendSolTeamShares(runtime,{mint:teamPending.mint,owner:teamPending.owner,team:teamPending.team,onStatus:notify});teamPending=null;team.clear();try{localStorage.removeItem('qhooks:team-buy:pending:solana');}catch{}done.append(el('p',{class:'qxc-number'},el('a',{href:'https://solscan.io/tx/'+r.signature,target:'_blank',rel:'noopener'},TEAM_TEXT.sent+' · '+r.signature)));notify(TEAM_TEXT.sent);}catch(e){notify(solLaunchError(e,'Could not send team shares. Please try again.'),true);}finally{busy=false;render();paintTeamSend();}}
 async function recoverPending(){if(!pending||busy)return;busy=true;render();try{await record();}catch(e){notify(solLaunchError(e),true);}finally{busy=false;render();}}
 function select(value){if(busy)return;active=value;if(active){
  const picker=document.getElementById('qq-chain');if(inline&&picker&&picker.value!=='solana'){picker.value='solana';picker.dispatchEvent(new Event('change',{bubbles:true}));return;}
  if(inline){quick.insertBefore(root,quick.querySelector('.cr-go'));syncIdentity();}else chainSlot.append(chainLabel);
  chainSelect.value='solana';const u=new URL(location.href);u.searchParams.set('chain','solana');history.replaceState(history.state,'',u);render();void loadConfig();if(pending){step=3;render();}else if(teamPending){step=3;render();paintTeamSend();}
 }else{
  root.hidden=true;if(inline){rootOrigin.insertBefore(root,rootAfter);for(const n of quick.querySelectorAll('#qq-name,#qq-symbol,#qq-image,#qq-banner,#qq-description,#qq-x,#qq-telegram,#qq-website'))n.disabled=false;}else origin.insertBefore(chainLabel,after);
  document.querySelector('.qxc-wallet').hidden=false;document.getElementById('qc-message').hidden=false;onExit();
 }}
 chainSelect.addEventListener('change',e=>{if(chainSelect.value==='solana'){e.stopImmediatePropagation();select(true);}else if(active)select(false);},true);
 document.querySelector('.qxc-progress').addEventListener('click',e=>{const b=e.target.closest('[data-screen]');if(active&&b){e.stopImmediatePropagation();go(Number(b.dataset.screen));}},true);
 document.addEventListener('qhooks:sol-create',e=>{if(e.detail?.chain&&e.detail.chain!=='solana'){if(active){select(false);chainSelect.value=e.detail.chain;chainSelect.dispatchEvent(new Event('change',{bubbles:true}));}}else select(true);});
 onTokenProfileDraft(({chain})=>{if(chain==='solana'&&!busy){save();render();}});
 onSolChange(()=>{if(!busy){prepared=null;mint=null;metadataUri=null;cost=null;}render();});if(q.get('chain')==='solana'||document.getElementById('qq-chain')?.value==='solana')select(true);
 return {get active(){return active;},render,select};
}
