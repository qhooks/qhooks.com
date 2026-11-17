import {FUNDING,FUNDING_OWNERS,validateFundingReview,fundingState,fundingTransaction,fundingHashCall,fundingExecutionData,fundingProposalKey,fundingShareLink,validateFundingLink,verifyFundingReceipt} from './rewards-funding-core.mjs';
import {createSafeReader,OWNERS} from './safe-lock-safe-reader.mjs';
import {CODE_PINS} from './safe-lock-pins.mjs';
import {callData,addressWord,word} from './safe-lock-core.mjs';
import {keccakHex} from './qdrops-core.mjs';
import {getWalletHub} from './wallet-hub-fresh.mjs';
const HASH=/^0x[0-9a-f]{64}$/i,UINT=/^0x[0-9a-f]{64}$/i;
const uint=x=>{if(!UINT.test(x||''))throw Error('An on-chain amount is incomplete.');return BigInt(x);};
const address=x=>{if(uint(x)>=1n<<160n)throw Error('An on-chain address is invalid.');return '0x'+x.slice(-40).toLowerCase();};
const bool=x=>{const n=uint(x);if(n>1n)throw Error('An on-chain status is invalid.');return n===1n;};
export const formatQhooks=n=>{const raw=BigInt(n),s=(raw/10n**18n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');const fraction=(raw%10n**18n).toString().padStart(18,'0').slice(0,6).replace(/0+$/,'');return s+(fraction?'.'+fraction:'');};
const APPROVE_TOPIC=keccakHex(new TextEncoder().encode('ApproveHash(bytes32,address)'));
const journalName=r=>'qhooks:rewards-funding:'+r.policyId+':'+r.weekStart;
const ownerIndex=c=>FUNDING_OWNERS.indexOf(String(c?.owner||'').toLowerCase());
export function createFundingRead({review,reader}){
 validateFundingReview(review);
 return async()=>{
  const common=await reader.common(),block=common.blockTag;
  const fields=[['funded',FUNDING.drops,callData('funded(address)',addressWord(FUNDING.token))],['safeBalance',FUNDING.token,callData('balanceOf(address)',addressWord(FUNDING.safe))],['allowance',FUNDING.token,callData('allowance(address,address)',addressWord(FUNDING.safe),addressWord(FUNDING.drops))],['listed',FUNDING.drops,callData('listed(address)',addressWord(FUNDING.token))],['dropsOwner',FUNDING.drops,callData('owner()')],['paused',FUNDING.drops,callData('paused()')],['rooterFrozen',FUNDING.drops,callData('rooterFrozen()')],['singleton',FUNDING.safe,'0xa619486e']];
  const names=['locks','token','safe','singleton','tokenImplementation','drops','multi'];
  const values=await reader.batch([...fields.map(([,to,data])=>['eth_call',[{to,data},block]]),...names.map(n=>['eth_getCode',[CODE_PINS[n].address,block]])]);
  const v=Object.fromEntries(fields.map(([k],i)=>[k,values[i]]));
  if(address(v.singleton)!==CODE_PINS.singleton.address)throw Error('The Safe implementation changed. Hold this proposal.');
  for(let i=0;i<names.length;i++){const pin=CODE_PINS[names[i]],code=values[fields.length+i];if(!/^0x(?:[0-9a-f]{2})+$/i.test(code||'')||code.length!==pin.bytes*2+2||keccakHex(Uint8Array.from(code.slice(2).match(/../g),h=>parseInt(h,16)))!==pin.keccak)throw Error('Contract code changed: '+names[i]+'. Hold this proposal.');}
  const state={...common,funded:uint(v.funded),safeBalance:uint(v.safeBalance),allowance:uint(v.allowance),listed:bool(v.listed),dropsOwner:address(v.dropsOwner),paused:bool(v.paused),rooterFrozen:bool(v.rooterFrozen),contractCodesVerified:true};
  const ready=fundingState(review,state);if(!ready.ready)return {...state,...ready,tx:null,hash:null,approved:[false,false]};
  const hash=await reader.call(FUNDING.safe,fundingHashCall(review),null,block);if(!HASH.test(hash||''))throw Error('The exact Safe hash is unreadable.');
  const approvals=await reader.batch(FUNDING_OWNERS.map(a=>['eth_call',[{to:FUNDING.safe,data:'0x7d832974'+addressWord(a)+hash.slice(2)},block]]));
  return {...state,...ready,hash:hash.toLowerCase(),approved:approvals.map(x=>uint(x)!==0n)};
 };
}
export function fundingAction(state,connection){
 if(!state?.ready||!state.hash)return null;if(!connection)return 'connect';
 const i=ownerIndex(connection);if(i<0)return null;if(String(connection.chainId)!==FUNDING.chainId)return 'switch';
 if(i===0)return state.approved[0]?null:'approve';return state.approved[0]?'exec':null;
}
export function readFundingIntent(storage,review){
 const raw=storage.getItem(journalName(review));if(!raw)return null;let intent;try{intent=JSON.parse(raw);}catch{throw Error('The saved funding intent is unreadable. Reconcile wallet activity before any new action.');}
 if(intent?.version!==1||!['approve','exec'].includes(intent.kind)||!FUNDING_OWNERS.includes(intent.owner)||!HASH.test(intent.safeHash||'')||intent.key!==fundingProposalKey(review,intent.safeHash)||intent.hash!==null&&!HASH.test(intent.hash||''))throw Error('The saved funding intent differs from this week. Reconcile wallet activity before any new action.');
 return intent;
}
export async function prepareFundingAction({kind,review,displayed,read,reader,hub,search='',now=Date.now}){
 if(!['approve','exec'].includes(kind))throw Error('Unknown owner action.');
 const expected=fundingProposalKey(review,displayed?.hash),connection=hub.snapshot().current,entry=connection?.entry,from=connection?.owner;
 const valid=(s,c)=>{if(!s.ready||fundingProposalKey(review,s.hash)!==expected||fundingAction(s,c)!==kind||String(s.nonce)!==review.safeNonce||String(s.funded)!==review.fundedBeforeRaw||now()-s.readAt>45000)throw Error('State, approval or owner changed. Hold this proposal and refresh.');validateFundingLink(search,review,s.hash);};
 let state=await read();valid(state,connection);const data=kind==='exec'?fundingExecutionData(review):'0xd4d9bdcd'+state.hash.slice(2),tx={from,to:FUNDING.safe,data,value:'0x0'};
 const simulated=await reader.call(FUNDING.safe,data,from);if(kind==='exec'&&(!UINT.test(simulated||'')||uint(simulated)!==1n)||kind==='approve'&&simulated!=='0x')throw Error('The exact Safe action did not simulate successfully. Nothing was sent.');
 const gas=await reader.rpc('eth_estimateGas',[tx]);if(!/^0x[0-9a-f]+$/i.test(gas||'')||BigInt(gas)<=0n)throw Error('The gas estimate is unavailable. Nothing was sent.');tx.gas='0x'+(BigInt(gas)*13n/10n).toString(16);
 state=await read();const current=hub.snapshot().current;valid(state,current);if(current?.owner!==from||current?.entry!==entry||String(current?.chainId)!==FUNDING.chainId)throw Error('The connected wallet changed. Nothing was sent.');
 const chain=await entry.provider.request({method:'eth_chainId',params:[]}),accounts=await entry.provider.request({method:'eth_accounts',params:[]});
 if(BigInt(chain)!==BigInt(FUNDING.chainId)||!Array.isArray(accounts)||accounts[0]?.toLowerCase()!==from.toLowerCase())throw Error('The wallet account or network changed. Nothing was sent.');
 if(hub.snapshot().current?.entry!==entry||hub.snapshot().current?.owner!==from)throw Error('The connected wallet changed. Nothing was sent.');
 return {tx,provider:entry.provider,safeHash:state.hash,owner:from.toLowerCase(),key:expected,kind};
}
export async function verifyFundingPostState({review,receipt,reader,safeHash,expectedTxHash}){
 const verified=verifyFundingReceipt(review,receipt,{safeHash,expectedTxHash});if(!verified)throw Error('The receipt does not prove this exact Safe deposit. Keep this action held.');
 const [header,funded,allowance]=await reader.batch([['eth_getBlockByNumber',[receipt.blockNumber,false]],['eth_call',[{to:FUNDING.drops,data:callData('funded(address)',addressWord(FUNDING.token))},receipt.blockNumber]],['eth_call',[{to:FUNDING.token,data:callData('allowance(address,address)',addressWord(FUNDING.safe),addressWord(FUNDING.drops))},receipt.blockNumber]]]);
 if(header?.hash?.toLowerCase()!==receipt.blockHash.toLowerCase()||uint(funded)!==BigInt(verified.fundedRaw)||uint(allowance)!==0n)throw Error('Receipt-block funding, allowance or canonical block differs. Keep this action held.');return verified;
}
export function createFundingController({review,reader,hub,storage=globalThis.localStorage,read=createFundingRead({review,reader}),search='',onChange=()=>{},now=Date.now,lock=null}){
 validateFundingReview(review);let state=null,intent=null,complete=null,error='',journalError='',message='',reading=false,busy=false,disposed=false;
 try{intent=readFundingIntent(storage,review);}catch(e){journalError=error=e.message;}
 const snapshot=()=>({review,state,intent,complete,error,message,reading,busy,connection:hub.snapshot().current});const emit=()=>{if(!disposed)onChange(snapshot());};
 const save=value=>{try{storage.setItem(journalName(review),JSON.stringify(value));if(storage.getItem(journalName(review))!==JSON.stringify(value))throw Error('Funding recovery could not be saved.');intent=value;}catch(e){journalError='Funding recovery could not be saved. Reconcile wallet activity before a new action.';throw Error(journalError);}};
 async function refresh(){if(reading||busy||disposed)return;reading=true;emit();try{state=await read();if(state.hash)validateFundingLink(search,review,state.hash);error=journalError;}catch(e){error=e.message||'State unavailable. Wallet actions are disabled.';}finally{reading=false;emit();}}
 async function recover(hash=intent?.hash,kind=intent?.kind||'exec'){
  if(busy||reading||disposed)return;busy=true;emit();try{
   if(!HASH.test(hash||'')||!['approve','exec'].includes(kind))throw Error('Enter the complete transaction hash and correct action type from wallet activity.');
   const h=await reader.rpc('eth_getTransactionReceipt',[hash]);if(!h){message='No mined receipt yet. Keep this intent held; check again manually.';return;}
   const safeHash=intent?.safeHash||state?.hash||await reader.call(FUNDING.safe,fundingHashCall(review),null,h.blockNumber);validateFundingLink(search,review,safeHash);if(!HASH.test(safeHash||''))throw Error('Refresh the exact proposal first.');
   if(intent&&intent.kind!==kind)throw Error('Recovery action differs from the saved funding intent.');
   if(h.transactionHash?.toLowerCase()!==hash.toLowerCase()||h.to?.toLowerCase()!==FUNDING.safe||h.from?.toLowerCase()!==(kind==='approve'?FUNDING_OWNERS[0]:FUNDING_OWNERS[1])||h.status!=='0x1')throw Error('The receipt is reverted or does not match the designated owner/Safe. Reconcile it before any new action.');
   if(kind==='exec'){
    complete=await verifyFundingPostState({review,receipt:h,reader,safeHash,expectedTxHash:hash});
    save({version:1,key:fundingProposalKey(review,safeHash),kind,owner:FUNDING_OWNERS[1],safeHash,hash:hash.toLowerCase(),status:'confirmed'});message='Exact 750,000 QHOOKS deposit confirmed. This week stays closed to another deposit.';
   }else{
    const matches=(h.logs||[]).filter(l=>!l.removed&&l.address?.toLowerCase()===FUNDING.safe&&l.topics?.[0]?.toLowerCase()===APPROVE_TOPIC&&l.topics?.[1]?.toLowerCase()===safeHash.toLowerCase()&&l.topics?.[2]?.toLowerCase()==='0x'+addressWord(FUNDING_OWNERS[0]));
    if(matches.length!==1)throw Error('The receipt does not prove the exact on-chain owner approval.');
    const next=await read();if(!next.ready||next.hash!==safeHash||!next.approved[0])throw Error('The approval is not readable for this unchanged proposal. Keep this intent held.');
    state=next;storage.removeItem(journalName(review));intent=null;journalError='';message='Qhooks 1 approval is confirmed on chain. Qhooks2 can open the same link and send.';
   }
   error='';
  }catch(e){error=e.message||'The receipt could not be verified. Keep this intent held.';}finally{busy=false;emit();}
 }
 async function sendAction(kind){
  if(disposed||busy||reading||intent||complete||error||!state?.ready||!state.hash)return;
  busy=true;message='Rechecking the exact week, nonce, funding, owner and simulation…';emit();let submitted=false;
  try{
   const existing=readFundingIntent(storage,review);if(existing){intent=existing;throw Error('A saved funding intent already exists. Recover it before another action.');}validateFundingLink(search,review,state.hash);const p=await prepareFundingAction({kind,review,displayed:state,read,reader,hub,search,now});if(disposed)throw Error('This page was closed before the wallet request. Nothing was sent.');
   save({version:1,key:p.key,kind,owner:p.owner,safeHash:p.safeHash,hash:null,status:'wallet-requested'});
   message='Confirm only this exact '+(kind==='exec'?'750,000 QHOOKS Safe execution':'Safe hash approval')+' in your wallet.';emit();submitted=true;
   const hash=await p.provider.request({method:'eth_sendTransaction',params:[p.tx]});
   if(!HASH.test(hash||''))throw Error('No transaction hash returned. The intent stays held; check wallet activity and recover its receipt.');
   const next={...intent,hash:hash.toLowerCase(),status:'submitted'};intent=next;save(next);message='Submitted once. Use Check receipt; this page will not resend while an intent exists.';
  }catch(e){
   if(submitted&&e?.code===4001){try{storage.removeItem(journalName(review));intent=null;message='Rejected in the wallet. Nothing was submitted.';}catch{error='The saved intent could not be cleared. Reconcile wallet activity.';}}
   else error=(e.message||'The action could not be verified.')+(submitted?' No automatic retry. Check wallet activity and recover its receipt.':'');
  }finally{busy=false;emit();}
 }
 const send=async kind=>{if(busy||reading||intent||complete||error)return;try{const run=()=>sendAction(kind);if(lock)await lock(run);else{if(!globalThis.navigator?.locks)throw Error('This browser cannot reserve the funding action safely. Use a browser with Web Locks.');await navigator.locks.request(journalName(review),{ifAvailable:true},held=>{if(!held)throw Error('This funding action is already open in another tab. Check that tab first.');return run();});}}catch(e){error=e.message;emit();}};
 emit();return {refresh,send,recover,snapshot,dispose(){disposed=true;}};
}
const el=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)n.setAttribute(k,String(v));n.append(...children.flat().filter(x=>x!=null));return n;};
function renderFunding(root,view,controller,hub,href){
 const {review,state:s,intent,complete,error,message,reading,busy,connection}=view;let action=fundingAction(s,connection),label='State unavailable';
 if(complete||intent?.status==='confirmed')label='Deposit confirmed';else if(intent)label='Intent held · recover receipt';else if(reading)label='Reading current state…';else if(error)label='Hold · checks incomplete';else if(!s?.ready)label='Hold · '+(s?.reason||'current state unavailable');else if(action==='connect')label='Connect an owner wallet';else if(action==='switch')label='Switch to Robinhood Chain';else if(action==='approve')label='1 · Approve as Qhooks 1';else if(action==='exec')label='2 · Send 750,000 QHOOKS';else if(ownerIndex(connection)===0&&s.approved[0])label='Approved · share with Qhooks2';else label='Waiting for Qhooks 1 approval';
 const primary=el('button',{type:'button',id:'rewards-action',class:'rf-primary',disabled:reading||busy||!!error||!!intent||!!complete||!action},busy?'Checking exact action…':label);primary.addEventListener('click',()=>{if(action==='connect')hub.open();else if(action==='switch')void hub.switchChain(FUNDING.chainId).then(()=>controller.refresh()).catch(()=>{});else void controller.send(action);});
 const refresh=el('button',{type:'button',class:'rf-secondary',disabled:reading||busy},reading?'Reading…':'Refresh on-chain state');refresh.addEventListener('click',()=>controller.refresh());
 const nodes=[el('div',{class:'rf-state',role:'status','aria-live':'polite','data-held':Boolean(error||!s?.ready||intent)},el('h2',{},label),el('p',{},error||s?.reason||'Checking contract code, chain, Safe owners, nonce, funding, balance, allowance and approvals.')),el('div',{class:'rf-controls'},primary,refresh)];
 if(s){nodes.push(el('dl',{class:'rf-facts'},...[['Funding week',review.weekStart+' · Monday UTC'],['Exact Safe deposit','750,000 QHOOKS'],['Safe nonce',review.safeNonce],['QDrops funded before',formatQhooks(review.fundedBeforeRaw)+' QHOOKS'],['Current Safe balance',formatQhooks(s.safeBalance)+' QHOOKS'],['Current QDrops funded',formatQhooks(s.funded)+' QHOOKS'],['Current Safe → QDrops allowance',formatQhooks(s.allowance)+' QHOOKS']].flatMap(([k,v])=>[el('dt',{},k),el('dd',{},v)])));
  if(s.hash){nodes.push(el('section',{class:'rf-proposal'},el('h3',{},'Same proposal on both devices'),el('p',{},'Safe transaction #'+review.safeNonce+' · threshold 2 of 2'),el('code',{class:'rf-hash','aria-label':'Full Safe transaction hash'},s.hash),el('ol',{},...OWNERS.map((o,i)=>el('li',{},o.name+' · '+(s.approved[i]?'approved on chain':i===0?'phone approval needed':'desktop sends after Qhooks 1 approval'))))));
   const link=fundingShareLink(href,review,s.hash),field=el('input',{readonly:true,value:link,'aria-label':'Shared funding proposal link',class:'rf-link'}),copy=el('button',{type:'button',class:'rf-secondary'},'Copy proposal link');copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link);copy.textContent='Copied';}catch{field.focus();field.select();}});nodes.push(el('div',{class:'rf-share'},copy,field));
  }
  nodes.push(el('p',{class:'rf-checked'},'Checked block '+s.blockNumber+' · '+s.readSource+' · '+new Date(s.readAt).toLocaleTimeString()+'. Every wallet action reads fresh state again.'));
 }
 if(intent||complete){const saved=intent?.hash||complete?.transactionHash;nodes.push(el('p',{class:'rf-hold'},saved?'Saved transaction: '+saved:'Wallet request has no saved transaction hash. Check wallet activity; do not submit another action.'));if(saved)nodes.push(el('a',{href:'https://robinhoodchain.blockscout.com/tx/'+saved,target:'_blank',rel:'noopener'},'View submitted transaction'));
 }
 const recovery=el('details',{class:'rf-recovery'},el('summary',{},'Recover a submitted transaction'));const input=el('input',{type:'text',inputmode:'text',autocomplete:'off',spellcheck:'false',placeholder:'0x… full transaction hash','aria-label':'Transaction hash from wallet activity',value:intent?.hash||'',class:'rf-link'}),select=el('select',{'aria-label':'Recovery action type'},el('option',{value:'exec',selected:intent?.kind!=='approve'},'Safe deposit execution'),el('option',{value:'approve',selected:intent?.kind==='approve'},'Qhooks 1 hash approval')),check=el('button',{type:'button',class:'rf-secondary',disabled:busy||reading},'Check receipt');check.addEventListener('click',()=>controller.recover(input.value.trim(),select.value));recovery.append(el('p',{},'A saved intent blocks new wallet requests, including after reload. Verify the actual mined receipt; no resend is automatic.'),input,select,check);nodes.push(recovery,el('p',{class:'rf-status',role:'status','aria-live':'polite'},message));
 root.replaceChildren(...nodes);
}
export async function mountRewardsFunding({root,fetchImpl=globalThis.fetch,hub=getWalletHub(window),storage=globalThis.localStorage,target=window}={}){
 let disposed=false,unsubscribe=()=>{},controller;
 const dispose=()=>{if(disposed)return;disposed=true;target.removeEventListener('pagehide',dispose,true);unsubscribe();controller?.dispose();for(const control of root.querySelectorAll('button,input,select'))control.disabled=true;};
 target.addEventListener('pagehide',dispose,{capture:true});
 try{
  const response=await fetchImpl('/full-launch/rewards-funding-week-2026-11-16.json',{cache:'no-store'});if(disposed)return null;if(!response.ok)throw Error('The reviewed funding manifest is unavailable. Wallet actions stay disabled.');
  const text=await response.text();if(disposed)return null;if(text.length>16384)throw Error('The funding manifest is too large.');const review=validateFundingReview(JSON.parse(text));
  const reader=createSafeReader({fetchImpl,wallet:()=>hub.snapshot().current});const show=view=>{if(controller&&!disposed)renderFunding(root,view,controller,hub,location.href);};
  controller=createFundingController({review,reader,hub,storage,search:location.search,onChange:show});show(controller.snapshot());unsubscribe=hub.subscribe(()=>controller.refresh());void controller.refresh();
  return {controller,dispose};
 }catch(e){if(disposed)return null;dispose();root.replaceChildren(el('h2',{},'Funding held'),el('p',{role:'alert'},e.message||'The reviewed proposal could not be loaded. No wallet action is available.'));return null;}
}
if(typeof document!=='undefined'&&document.getElementById('rewards-funding')){
 const root=document.getElementById('rewards-funding');void mountRewardsFunding({root});
 Promise.all([import('./qx-a/components.mjs'),import('./qx-a/shell.mjs')]).then(([{ambient,setArt,initTheme},{mountShell}])=>{initTheme();setArt({banner:'/qx-a/img/qhooks-banner.jpg',blur:'/qx-a/img/qhooks-banner-blur.jpg'});document.body.prepend(ambient());const trigger=document.getElementById('qhc-trigger');mountShell({mode:'detail',title:'Weekly rewards funding',back:'/taps',active:'portfolio',logo:'/qx-a/img/qhooks-icon.jpg',wallet:trigger});document.querySelector('.setup-fallback').hidden=true;}).catch(()=>{});
}
