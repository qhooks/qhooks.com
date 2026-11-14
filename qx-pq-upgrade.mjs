// "Upgrade your launch to post-quantum": a one-tap launch's creator role (where its LP fees go, and handing the role on)
// moves to QPQCreator, after which every change needs your wallet AND your QHooks account quantum key (SLH-DSA, opened
// with your sign-in, Face ID / Touch ID or passphrase). Fees always keep flowing to the payout address.
// Two transactions from the creator wallet, in this order: register(key), then factory.setCreator(launch, QPQCreator).
// The hand-over is refused unless QPQCreator already shows your wallet and key for that launch (an older entry left by a
// previous creator can't take over).
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';
import {mountAccountQuantum} from '/qx-account-quantum-control.mjs';
import {passphraseStrength} from '/qx-account-quantum.mjs';
import {abiEncode} from '/full-launch/packages/launchpad/abi-encode.mjs';
import {keccak_256} from '/full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

const CHAIN='4663',hub=getWalletHub(window),$=id=>document.getElementById('pqu-'+id);
const enc=new TextEncoder(),hex=b=>'0x'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join(''),unhex=s=>Uint8Array.from(s.slice(2).match(/../g)||[],x=>parseInt(x,16));
const sel=sig=>hex(keccak_256(enc.encode(sig))).slice(0,10),word=(d,i)=>'0x'+d.slice(2+64*i,66+64*i),addrAt=(d,i)=>'0x'+d.slice(26+64*i,66+64*i);
const dec=v=>typeof v==='bigint'?v.toString():typeof v==='number'?String(v):v;
const call=(sig,types=[],values=[])=>sel(sig)+abiEncode(types,values.map(dec)).slice(2);
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==false&&v!=null)n.setAttribute(k,v===true?'':v);n.append(...kids.filter(k=>k!=null));return n;};
let PQ=null,signer=null,busy=false,launches=[],note={text:'',tone:''},ownWallet=null,quantum=null,gnote={text:'',tone:''};
const savedKey=pk=>'qhooks:pq-backup-saved:'+pk;
const backupSaved=()=>{try{return !!signer&&sessionStorage.getItem(savedKey(signer.publicKeyHex))==='1';}catch{return false;}};
const chain=()=>chainById(CHAIN),FACTORY=()=>chain().simpleLaunch.toLowerCase();
async function rpc(method,params){const r=await fetch(chain().rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const j=await r.json();if(j.error)throw Error(j.error.message||'Network read failed');return j.result;}
const ethCall=(to,data)=>rpc('eth_call',[{to,data},'latest']);
async function launchOf(id){const d=await ethCall(FACTORY(),call('launchOf(bytes32)',['bytes32'],[id]));return {token:addrAt(d,0),creator:addrAt(d,7),payout:addrAt(d,8)};}
async function roleOf(id){const d=await ethCall(PQ,call('roleOf(address,bytes32)',['address','bytes32'],[FACTORY(),id]));
 return {wallet:addrAt(d,0),pk:word(d,1),nonce:BigInt(word(d,2)),eta:Number(BigInt(word(d,3))),by:Number(BigInt(word(d,4))),pendingWallet:addrAt(d,5),pendingPk:word(d,6)};}
const say=(text,tone='')=>{note={text,tone};render();};
async function send(to,data,label){
 let conn=hub.snapshot().current;if(!conn){hub.open();throw Error('Connect your wallet first.');}
 if(conn.chainId!==CHAIN){say('Switching your wallet to '+chain().name+'…');conn=await hub.switchChain(CHAIN);if(conn?.chainId!==CHAIN)throw Error('Switch your wallet to '+chain().name+', then try again.');}
 const from=conn.owner,provider=conn.entry.provider,tx={from,to,data,value:'0x0'};
 try{tx.gas='0x'+(BigInt(await rpc('eth_estimateGas',[{from,to,data,value:'0x0'}]))*13n/10n).toString(16);}catch{throw Error('This transaction would fail right now. Nothing was sent.');}
 try{const b=await rpc('eth_getBlockByNumber',['latest',false]),tip=BigInt(await provider.request({method:'eth_maxPriorityFeePerGas'}).catch(()=>'0x0'));if(b?.baseFeePerGas){tx.maxPriorityFeePerGas='0x'+tip.toString(16);tx.maxFeePerGas='0x'+(BigInt(b.baseFeePerGas)*2n+tip).toString(16);}}catch{}
 say('Confirm '+label+' in your wallet…');
 const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});
 say('Sent. Waiting for the network…');
 let r=null;for(let i=0;i<180&&!r;i++){r=await rpc('eth_getTransactionReceipt',[hash]).catch(()=>null);if(!r)await new Promise(res=>setTimeout(res,2000));}
 if(!r)throw Error('Still pending. Check your wallet activity, then reload.');if(r.status!=='0x1')throw Error('The network refused it. Only gas was spent.');
 return hash;
}
// Every key-protected action: rebuild and sign the exact message, then send it from the wallet.
async function pqAction(l,kind,types,values,fn,label){
 if(!signer)throw Error('Unlock your quantum key above first.');
 const me=hub.snapshot().current?.owner?.toLowerCase(),r=await roleOf(l.id);
 if(r.wallet!==me)throw Error('This launch is protected by another wallet.');
 if(r.pk.toLowerCase()!==signer.publicKeyHex.toLowerCase())throw Error('This launch uses a different quantum key than the one unlocked.');
 const validUntil=BigInt(Math.floor(Date.now()/1000)+600);
 say('Signing with your quantum key…');
 const s=signer.signCreatorAction({chainId:CHAIN,contract:PQ,factory:FACTORY(),id:l.id,kind,values,nonce:r.nonce,validUntil,wallet:me});
 // The contract builds the same message; refuse to send if they ever differ.
 const onchain=await ethCall(PQ,call('message(address,bytes32,uint8,bytes,uint64)',['address','bytes32','uint8','bytes','uint64'],[FACTORY(),l.id,kind,types.length?abiEncode(types,values.map(dec)):'0x',validUntil]));
 const decoded=abiDecodeBytes(onchain);
 if(decoded.toLowerCase()!==s.messageHex.toLowerCase())throw Error('The signed message did not match the contract. Nothing was sent.');
 return send(PQ,fn(validUntil,s.signatureHex),label);
}
function abiDecodeBytes(d){const off=Number(BigInt(word(d,0)))*2,len=Number(BigInt('0x'+d.slice(2+off,2+off+64)));return '0x'+d.slice(2+off+64,2+off+64+len*2);}
async function upgrade(l){
 if(!signer)throw Error('Unlock your quantum key above first.');
 const me=hub.snapshot().current?.owner?.toLowerCase(),pk=signer.publicKeyHex.toLowerCase();
 let r=await roleOf(l.id);
 if(r.wallet!==me||r.pk.toLowerCase()!==pk){await send(PQ,call('register(address,bytes32,bytes32)',['address','bytes32','bytes32'],[FACTORY(),l.id,pk]),'step 1 of 2 (register your key)');r=await roleOf(l.id);}
 if(r.wallet!==me||r.pk.toLowerCase()!==pk)throw Error('Your key is not registered for this launch yet. Nothing was handed over.');
 await send(FACTORY(),call('setCreator(bytes32,address)',['bytes32','address'],[l.id,PQ]),'step 2 of 2 (hand the creator role to the post-quantum contract)');
}
async function load(){
 const me=hub.snapshot().current?.owner?.toLowerCase()||null;ownWallet=me;launches=[];
 if(!me){render();return;}
 let list=[];try{list=(await (await fetch('/api/v1/markets',{cache:'no-store'})).json()).markets||[];}catch{}
 const ids=new Set();
 for(const m of list){if(String(m.chainId)!==CHAIN||m.kind!=='simple')continue;
  try{const meta=(await (await fetch('/api/v1/markets/'+CHAIN+'/'+m.controller,{cache:'no-store'})).json()).meta;const id=meta?.pools?.find(p=>p.key?.hooks?.toLowerCase()===FACTORY())?.id;if(id&&!ids.has(id)){ids.add(id);launches.push({id,symbol:meta.symbol||m.symbol,name:meta.name||m.name});}}catch{}}
 for(const l of launches){try{Object.assign(l,await launchOf(l.id));l.role=l.creator===PQ.toLowerCase()?await roleOf(l.id):null;}catch{l.error=true;}}
 launches=launches.filter(l=>!l.error&&(l.creator===me||l.role?.wallet===me));
 render();
}
function act(fn){return async()=>{if(busy)return;busy=true;say('');try{await fn();say('Done.','ok');await load();}catch(e){say(/reject|denied|cancel/i.test(e?.message||'')?'Cancelled in your wallet. Nothing was sent.':(e?.message||'That did not go through.'),'bad');}finally{busy=false;render();}};}
// Guided one-tap path (phone first): one primary button that always shows the next step.
// Two taps on iPhone: prepare (encrypt + check, about a second) then share immediately, so Safari keeps the tap's
// permission for the share sheet.
let prepared=null;
async function prepareBackup(pass,again){
 if(!signer)throw Error('Open your quantum key first.');
 if(!passphraseStrength(pass).ok)throw Error('Use a longer passphrase (a few words, 12+ characters). A password manager suggestion works.');
 if(pass!==again)throw Error('The two passphrases don’t match.');
 const text=await signer.exportBackup(pass);await signer.verifyBackup(text,pass);
 const name='qhooks-quantum-key-'+signer.publicKeyHex.slice(2,10)+'.json';
 prepared={pk:signer.publicKeyHex,file:new File([text],name,{type:'application/json'}),name};
}
async function saveBackup(){
 if(!prepared||prepared.pk!==signer?.publicKeyHex)throw Error('Prepare the backup first.');
 const {file,name}=prepared;
 if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'QHooks quantum key backup'});}catch(e){if(e?.name==='AbortError')throw Error('Backup not saved. Tap again and choose Save to Files.');throw e;}}
 else{const url=URL.createObjectURL(file),a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 try{sessionStorage.setItem(savedKey(signer.publicKeyHex),'1');}catch{}
}
function renderGuided(){
 const root=$('guided');if(!root)return;
 const me=hub.snapshot().current?.owner?.toLowerCase(),target=launches.find(l=>!l.role);
 const done=launches.find(l=>l.role&&l.role.wallet===me);
 const gsay=(t,tone='')=>{gnote={text:t,tone};renderGuided();};
 const step=(label,fn,extra=[])=>{const b=el('button',{type:'button',class:'qa-btn qa-btn-primary pqu-big',disabled:busy},label);
  b.addEventListener('click',async()=>{if(busy)return;busy=true;gsay('');render();try{await fn();gsay('');}catch(e){gsay(/reject|denied|cancel/i.test(e?.message||'')&&!/Backup not saved/.test(e.message)?'Cancelled in your wallet. Nothing was sent.':(e?.message||'That did not go through.'),'bad');}finally{busy=false;render();renderGuided();}});
  return [...extra,b];};
 let head,body=[];
 if(!me){head='Connect the wallet that created your launch.';body=step('Connect wallet',async()=>hub.open());}
 else if(!target&&done){head=(done.symbol||'Your launch')+' is post-quantum protected.';body=[el('p',{class:'qxc-fine'},'Changing where its LP fees go now needs your wallet and your quantum key. Manage it below.')];}
 else if(!target){head='No one-tap launch to upgrade for this wallet.';}
 else if(!signer){head='Step 1 of 3 · Open your quantum key';body=step('Open my quantum key',async()=>{let s=quantum.key.snapshot();if(s.canUnlockPasskey)s=await quantum.key.unlockWithPasskey();signer=s.ready&&s.signer?s.signer:null;quantum.render();if(!signer){document.getElementById('pqu-key')?.scrollIntoView({block:'center'});throw Error(s.hasKey?'Open your key in the key panel below with Face ID / Touch ID or your passphrase.':'Create your key with a passphrase in the key panel below.');}},[el('p',{class:'qxc-fine'},'Your key opens with Face ID / Touch ID or your passphrase. Your wallet alone never opens it.')]);}
 else if(!backupSaved()){head='Step 2 of 3 · Save a backup of your key';
  const p1=el('input',{type:'password',autocomplete:'new-password',placeholder:'Backup passphrase',maxlength:'1024','aria-label':'Backup passphrase'}),p2=el('input',{type:'password',autocomplete:'new-password',placeholder:'Passphrase again',maxlength:'1024','aria-label':'Backup passphrase again'});
  body=prepared&&prepared.pk===signer.publicKeyHex
   ?step('Save backup to Files',()=>saveBackup(),[el('p',{class:'qxc-fine'},'Ready. Tap below and choose “Save to Files” (or iCloud Drive).')])
   :step('Prepare backup',()=>prepareBackup(p1.value,p2.value),[el('p',{class:'qxc-fine'},'An encrypted file of your quantum key. Keep the passphrase in your password manager: the file needs it.'),p1,p2]);}
 else{head='Step 3 of 3 · Upgrade '+(target.symbol||'your launch');body=step('Upgrade '+(target.symbol||'launch')+' to post-quantum',async()=>{await upgrade(target);await load();},[el('p',{class:'qxc-fine'},'Two confirmations in your wallet: register your key, then hand the creator role to the post-quantum contract. Fees keep going to '+target.payout+'.')]);}
 root.replaceChildren(el('h2',{},head),...body,el('p',{class:'qas-status',role:'status','aria-live':'polite','data-tone':gnote.tone||false},gnote.text));
}
function render(){
 renderGuided();
 const root=$('launches');if(!root)return;
 const me=hub.snapshot().current?.owner?.toLowerCase(),ready=!!signer;
 const rows=[];
 if(!me)rows.push(el('p',{},'Connect the wallet that created your launch.'));
 else if(!launches.length)rows.push(el('p',{},'No one-tap launch on '+chain().name+' has this wallet as its creator.'));
 for(const l of launches){
  const protectedNow=!!l.role,eta=l.role?.eta||0;
  const card=el('section',{class:'pqu-launch'},el('h3',{},(l.symbol||'Launch')+(l.name?' · '+l.name:'')),
   el('dl',{},el('dt',{},'Creator role'),el('dd',{},protectedNow?'Post-quantum: your wallet + your quantum key':'Your wallet only'),
    el('dt',{},'LP fees go to'),el('dd',{},l.payout),el('dt',{},'Launch'),el('dd',{},l.id)));
  if(eta){
   const by=l.role.by===1?'your wallet (to set a new quantum key)':'your quantum key (to move the role to wallet '+l.role.pendingWallet+')';
   card.append(el('div',{class:'pqu-alert',role:'alert'},el('strong',{},'Recovery pending. '),'Started by '+by+'. It completes '+new Date(eta*1000).toUTCString()+' unless you cancel it. If you did not start it, cancel now.'));
   const cancel=el('button',{type:'button',class:'qtx-mini',disabled:busy||(l.role.by===1&&!ready)},'Cancel recovery');
   cancel.addEventListener('click',act(()=>l.role.by===1
    ?pqAction(l,6,['address','bytes32','uint64'],[l.role.pendingWallet,l.role.pendingPk,BigInt(eta)],(u,sig)=>call('cancelRecovery(address,bytes32,uint64,bytes)',['address','bytes32','uint64','bytes'],[FACTORY(),l.id,u,sig]),'the cancellation')
    :send(PQ,call('cancelRecovery(address,bytes32,uint64,bytes)',['address','bytes32','uint64','bytes'],[FACTORY(),l.id,0n,'0x']),'the cancellation')));
   card.append(cancel);
  }
  if(!protectedNow){
   const b=el('button',{type:'button',class:'qtx-mini pqu-go',disabled:busy||!ready},ready?'Upgrade to post-quantum':'Unlock your quantum key first');
   b.addEventListener('click',act(()=>upgrade(l)));card.append(el('p',{class:'qxc-fine'},'Two transactions: register your key, then hand the creator role over. Fees keep going to the same address.'),b);
  }else{
   const to=el('input',{type:'text',placeholder:'New payout address (0x…)',spellcheck:'false',autocomplete:'off','aria-label':'New payout address'});
   const pay=el('button',{type:'button',class:'qtx-mini',disabled:busy||!ready},'Change payout');
   pay.addEventListener('click',act(async()=>{const a=to.value.trim();if(!/^0x[0-9a-fA-F]{40}$/.test(a))throw Error('Enter a 0x address.');
    await pqAction(l,1,['address'],[a],(u,sig)=>call('setPayout(address,bytes32,address,uint64,bytes)',['address','bytes32','address','uint64','bytes'],[FACTORY(),l.id,a,u,sig]),'the payout change');}));
   const back=el('button',{type:'button',class:'qtx-mini',disabled:busy||!ready},'Hand the role back to my wallet');
   back.addEventListener('click',act(()=>pqAction(l,2,['address'],[me],(u,sig)=>call('handOver(address,bytes32,address,uint64,bytes)',['address','bytes32','address','uint64','bytes'],[FACTORY(),l.id,me,u,sig]),'the hand-back')));
   const lock=el('button',{type:'button',class:'qtx-mini',disabled:busy||!ready},'Lock fee routing forever');
   lock.addEventListener('click',act(async()=>{if(!confirm('Lock fee routing forever? Fees will always go to '+l.payout+'. This cannot be undone.'))throw Error('Not locked.');
    await pqAction(l,3,[],[],(u,sig)=>call('lockForever(address,bytes32,uint64,bytes)',['address','bytes32','uint64','bytes'],[FACTORY(),l.id,u,sig]),'the lock');}));
   card.append(el('div',{class:'pqu-manage'},el('label',{},'Change where LP fees go',to),pay,back,lock));
  }
  rows.push(card);
 }
 rows.push(el('p',{class:'qas-status',role:'status','aria-live':'polite','data-tone':note.tone||false},note.text));
 root.replaceChildren(...rows);
}
async function main(){
 PQ=(await (await fetch('/full-launch/pq-creator-v1.json',{cache:'no-store'})).json()).steps[1].address.toLowerCase();
 $('contracts').textContent='Post-quantum creator contract '+PQ+' · SLH-DSA verifier '+(await (await fetch('/full-launch/pq-creator-v1.json')).json()).steps[0].address+' · Robinhood Chain';
quantum=mountAccountQuantum($('key'),{hub,id:'pqu',mode:'account',onChange:s=>{const next=s.ready&&s.signer?s.signer:null;if(next!==signer){signer=next;render();}}});
 hub.subscribe(()=>{void quantum.refresh();const me=hub.snapshot().current?.owner?.toLowerCase()||null;if(me!==ownWallet)load();});
 void quantum.refresh();
 await load();
}
main().catch(e=>{const r=$('launches');if(r)r.textContent=e.message;});
