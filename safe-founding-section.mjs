import {FOUNDING,SAFE} from './founding-config.mjs';
import {safeExecData} from './qdrops-core.mjs';
import {OWNERS,proposalKey,proposalHint,proposalLink,exactWeth,executionConfirmed} from './safe-founding-read.mjs';
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)n.setAttribute(k,v===true?'':v);n.append(...kids.filter(k=>k!=null));return n;};
const meOf=c=>c&&OWNERS.find(o=>o.a===String(c.owner).toLowerCase());
export function createSafeSection({root,read,describe,hub,reader,topup=false}){
 let last=null,review=null,linkError='',reading=false,queued=false,busy=false,error='',status='',tone='',generation=0,complete=null,pending=null,editing=false,firstShown=false,approval=null;
 if(topup)try{const h=proposalHint(location.search);if(h)review=h.nonce+':'+h.hash;}catch(e){linkError=e.message;}
 const changed=()=>!!proposalKey(last)&&(linkError||review!==proposalKey(last));
 function accept(){if(!last?.tx)return;review=proposalKey(last);linkError='';complete=null;if(topup)history.replaceState(null,'',proposalLink(location.href,last));}
 const say=(message,t='')=>{status=message;tone=t;render();};
 function render(){
  const amountOpen=!!root.querySelector('.qff-amount-editor')?.open,factsOpen=!!root.querySelector('.qff-funding-facts')?.open;
  const focus=root.contains(document.activeElement)?document.activeElement.id:null,c=hub.snapshot().current,me=meOf(c),s=last,d=s?describe(s):{title:topup?'Deposit WETH for rewards':'Founding grants',facts:[],note:''};
  let disabled=busy||reading||!!error||editing||!!pending||!!complete,label='Connect an owner wallet',action=()=>hub.open(),note=d.note||'';
  if(!s){label=reading?'Reading on-chain state…':'State unavailable';disabled=true;}
  else if(!s.tx){label='Nothing to sign';disabled=true;}
  else if(changed()){label='Proposal changed — review first';disabled=true;}
  else if(s.short){label='Safe balance too low';disabled=true;}
  else if(c&&!me){label='Switch to an owner wallet';note+=' Connect Qhooks 1 or Qhooks2.';}
  else if(me){const i=OWNERS.indexOf(me),j=1-i;
   if(s.approved[j]){label='Step 2: Send'+(topup?' '+exactWeth(s.tx.amount)+' WETH':' grants');action=()=>send('exec');note+=' '+OWNERS[j].name+' approved this exact hash on chain. '+me.name+' sends it; no separate second approval is needed.';}
   else if(s.approved[i]){label='Waiting for '+OWNERS[j].name;disabled=true;note+=' Your approval is on chain. Open this proposal link with '+OWNERS[j].name+' on any device.';}
   else{label='Step 1: Approve as '+me.name;action=()=>send('approve');note+=' Then the other owner sends the same proposal on any device.';}
  }
  if(complete){label='Execution confirmed';disabled=true;}
  const primary=el('button',{id:root.id+'-action',type:'button',class:'qtx-mini qas-go',disabled},label);primary.addEventListener('click',action);
  const refresh=el('button',{id:root.id+'-refresh',type:'button',disabled:busy||reading},reading?'Reading…':'Refresh on-chain state');refresh.addEventListener('click',()=>update());
  const controls=el('div',{class:'qff-controls'},primary,refresh),extras=[];
  if(error&&c){const fallback=el('button',{type:'button',disabled:busy||reading},reader.mode==='relay'?'Read through connected wallet':'Retry QHooks read relay');fallback.addEventListener('click',()=>{reader.setMode(reader.mode==='relay'?'wallet':'relay');void update();});controls.append(fallback);}
  if(changed()){const button=el('button',{type:'button',disabled:busy||reading||!!error},'Review current proposal');button.addEventListener('click',()=>{accept();say('Current nonce, amount and hash are shown. Check them before approving.');});extras.push(el('p',{class:'qff-changed',role:'alert'},linkError||'The Safe nonce or transaction hash changed. Review the new proposal before any wallet action.'),button);}
  const progress=s?.hash?el('div',{class:'qff-progress','data-safe-state':changed()?'changed':error?'unavailable':complete?'complete':'ready'},
   el('p',{class:'qff-exact'},topup?'Exact deposit: '+exactWeth(s.tx.amount)+' WETH':'Review the grant batch below'),el('p',{},'Safe transaction #'+s.nonce+' · threshold 2 of 2'),
   el('pre',{class:'qff-hash','aria-label':'Full Safe transaction hash'},s.hash),el('ol',{},...OWNERS.map((o,i)=>el('li',{'data-approved':String(s.approved[i])},o.name+' · '+(s.approved[i]?'approved on chain':s.approved[1-i]?'can send; no separate approval':'not yet approved')))),
   el('p',{class:'qff-checked'},'Checked '+new Date(s.readAt).toLocaleTimeString()+' · block '+s.blockNumber+' · '+s.readSource+(reading?' · refreshing…':''))):null;
  const share=[];
  if(topup&&s?.hash&&!changed()){
   const link=proposalLink(location.href,s),field=el('input',{type:'text',readonly:true,value:link,'aria-label':'Shared Safe proposal link',class:'qff-link'}),copy=el('button',{type:'button'},'Copy proposal link');
   copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link);say('Proposal link copied. Both devices read the same on-chain approvals.');}catch{field.focus();field.select();say('Select and copy the proposal link shown here.');}});share.push(el('div',{class:'qff-share'},copy,field));
  }
  const txHash=pending?.hash||complete?.hash;
  const facts=el('dl',{},...d.facts.flatMap(([k,v])=>[el('dt',{},k),el('dd',{},v)]));
  const balanceDetails=topup?el('details',{class:'setup-facts qff-funding-facts',open:factsOpen},el('summary',{},'Funding balances and destination'),facts):facts;
  const amountDetails=topup?el('details',{class:'qff-amount-editor',open:amountOpen},el('summary',{},'Change deposit amount'),...(d.extra||[])):null;
  const errorNode=error?el('p',{role:'alert',class:'qff-error'},error+' Last displayed facts are not verified for sending.'):null;
  const statusNode=el('p',{class:'qas-status',role:'status','aria-live':'polite','data-tone':tone||false},status);
  const receiptNode=txHash?el('a',{href:'https://robinhoodchain.blockscout.com/tx/'+txHash,target:'_blank',rel:'noopener'},'View transaction receipt'):null;
  const core=topup?[progress,...extras,errorNode,controls,statusNode,receiptNode,el('p',{},note),amountDetails,balanceDetails]:[progress,facts,...(d.extra||[]),...extras,el('p',{},note),controls,errorNode,statusNode,receiptNode];
  const nodes=[el('h2',{},d.title),...core,...share,
   el('p',{class:'qff-help'},'Approvals are shared on chain. Keep this page visible for automatic refresh, or use Refresh. No same-browser or account-switch handoff is required.'),
   el('a',{href:'https://robinhoodchain.blockscout.com/address/'+SAFE,target:'_blank',rel:'noopener'},'Open the Safe on the chain explorer')];root.replaceChildren(...nodes.filter(node=>node!=null));
  if(topup)root.querySelector('#qff-amount')?.toggleAttribute('disabled',busy||!!pending);
  if(focus)document.getElementById(focus)?.focus({preventScroll:true});
  if(topup&&s&&!firstShown){firstShown=true;if(location.hash==='#qff-weth')requestAnimationFrame(()=>root.scrollIntoView({block:'start'}));}
 }
 async function update(){
  if(busy)return;if(reading){queued=true;return;}
  reading=true;const version=generation;render();
  try{const next=await reader.withHash(await read());if(version!==generation)return;last=next;error='';if(approval&&next.hash===approval.hash&&next.approved[approval.index]){status='Approval verified on chain. The other owner can send from any device.';tone='ok';approval=null;}if(!review&&!linkError&&next.hash)accept();}
  catch(e){if(version===generation)error=e.message||'On-chain state unavailable. Retry.';}
  finally{reading=false;render();if(queued){queued=false;void update();}}
 }
 async function send(kind){
  if(busy||reading||error||editing||changed()||pending||complete||!last?.tx)return;
  let c=hub.snapshot().current;if(!c){hub.open();return;}
  const displayed=proposalKey(last),version=generation;busy=true;say('Checking current nonce, amount and approvals…');
  try{
   const s=await reader.withHash(await read());last=s;
   if(!s.tx||proposalKey(s)!==displayed||review!==proposalKey(s)||generation!==version)throw Error('The proposal changed. Review its nonce, amount and hash before opening your wallet.');
   if(s.short)throw Error('The Safe does not hold enough for this exact transaction. Nothing was sent.');
   if(String(c.chainId)!==FOUNDING.pay.chain){say('Switching your wallet to Robinhood Chain…');await hub.switchChain(FOUNDING.pay.chain);c=hub.snapshot().current;if(String(c?.chainId)!==FOUNDING.pay.chain)throw Error('Switch your wallet to Robinhood Chain, then refresh.');}
   const from=c.owner,entry=c.entry,me=meOf(c);if(!me)throw Error('This wallet is not one of the two verified Safe owners.');
   const i=OWNERS.indexOf(me),j=1-i;
   if(kind==='exec'&&!s.approved[j])throw Error('The other owner has not approved this exact hash on chain. Refresh after their approval.');
   if(kind==='approve'&&(s.approved[i]||s.approved[j])){say(s.approved[j]?'The other owner approved. Step 2 is ready; review and send.':'Your approval is already on chain. The other owner can send.');return;}
   const data=kind==='exec'?safeExecData(s.tx,OWNERS.map(o=>o.a)):'0xd4d9bdcd'+s.hash.slice(2),tx={from,to:SAFE,data,value:'0x0'};
   say('Simulating this exact transaction before opening your wallet…');
   const result=await reader.call(SAFE,data,from);if(kind==='exec'&&BigInt(result||'0x0')!==1n)throw Error('The Safe would not execute this exact transaction. Nothing was sent.');
   tx.gas='0x'+(BigInt(await reader.rpc('eth_estimateGas',[tx]))*13n/10n).toString(16);
   const final=await reader.withHash(await read());last=final;
   if(proposalKey(final)!==displayed||review!==proposalKey(final)||final.short||kind==='exec'&&!final.approved[j]||generation!==version)throw Error('Safe state changed during checks. Refresh and review before sending.');
   const current=hub.snapshot().current;if(current?.owner!==from||String(current.chainId)!==FOUNDING.pay.chain||current.entry!==entry)throw Error('Your wallet changed. Refresh and try again.');
   say('Confirm the exact '+(kind==='exec'?'execution':'Safe hash approval')+' in your wallet…');
   const hash=await entry.provider.request({method:'eth_sendTransaction',params:[tx]});if(!/^0x[0-9a-f]{64}$/i.test(hash||''))throw Error('No transaction hash returned. Check wallet activity before retrying.');
   pending={hash,kind,safeHash:s.hash,amount:s.tx.amount?.toString(),ownerIndex:i};say('Submitted. Waiting for the on-chain receipt…');
   let receipt=null;for(let n=0;n<180&&!receipt;n++){receipt=await reader.rpc('eth_getTransactionReceipt',[hash]).catch(()=>null);if(!receipt)await new Promise(resolve=>setTimeout(resolve,2000));}
   if(!receipt)throw Error('Receipt is still pending. Use its link; do not submit the same action again while pending.');
   if(receipt.status!=='0x1'){pending=null;throw Error('Transaction reverted. Check its receipt before retrying.');}
   if(kind==='exec'){
    if(!executionConfirmed(receipt,s.hash)){pending=null;throw Error('Mined receipt does not verify Safe execution success for this hash. Check the receipt.');}
    complete={hash};pending=null;say('Safe execution confirmed'+(topup?' for '+exactWeth(s.tx.amount)+' WETH':'')+'.','ok');
   }else{approval={hash:s.hash,index:i};pending=null;say('Approval transaction confirmed. Refreshing its shared on-chain state…','ok');}
  }catch(e){say(/reject|denied|cancel/i.test(e?.message||'')?'Cancelled in your wallet. Nothing was sent.':e.message||'Could not verify this action.','bad');}
  finally{busy=false;render();if(!complete)void update();}
 }
 update.render=render;update.reset=()=>{generation++;last=null;review=null;linkError='';complete=null;error='';editing=false;void update();};update.edit=()=>{editing=true;render();};
 hub.subscribe(()=>{if(!busy)void update();});return update;
}
