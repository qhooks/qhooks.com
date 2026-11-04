// Request import/return around the unchanged QWallet UI. Never signs or submits.
import {PROTOCOL,ZERO,exact,uuid,origin,request,format,proof} from './messenger-protocol.mjs';
const ids=['prepare','approve','action-review','send'];
export function bindMessengerWallet({document:d=document,target=window,controller,allowedOrigins,clock=Date.now}) {
  const $=id=>d.getElementById('qw-'+id), ui=id=>d.getElementById('mw-'+id);
  const allowed=new Set(allowedOrigins.map(origin));
  if(!allowed.size)throw Error('No trusted messenger origin configured.');
  const opener=target.opener;
  let active=null,loaded=null,boundAction=null,seq=0,last='',loading=false,dead=false,timer;
  const note=text=>{ui('status').textContent=text;};
  const current=()=>controller.snapshot();
  function post(status,evidence=null) {
    if(!active||!opener)return;
    opener.postMessage({protocol:PROTOCOL,kind:'update',sessionId:active.sessionId,request:active.request,seq:++seq,status,evidence},active.origin);
  }
  function end(message,status='uncertain') {
    if(dead)return;
    try{post(status);}catch{/* Public tracking can fail without changing a transaction. */}
    dead=true;target.clearInterval(timer);controller.dispose();ui('load').disabled=true;
    for(const id of ids)$(id).disabled=true;
    note(message+' Tracking stopped, not a transaction cancellation. Recover any submitted action in QWallet; never resend blindly.');
  }
  function valid() { if(!active||dead)return false;try{request(active.request,clock());return true;}catch{end('Request expired.');return false;} }
  function exactInputs() { const r=active.request;return $('chain').value===r.chainId&&$('kind').value==='withdraw'&&$('asset').value===r.asset&&$('amount').value===format(r.amount,r.decimals)&&$('recipient').value===r.recipient; }
  function matching(snapshot) {const r=active.request,w=snapshot.wallet;return snapshot.connected&&w&&!w.locked&&w.backupVerified&&w.fields?.kind==='withdraw'&&w.fields.asset===r.asset&&w.fields.amount===r.amount&&w.fields.recipient===r.recipient&&w.action&&w.action.asset===r.asset&&String(w.action.amount)===r.amount&&w.action.recipient===r.recipient;}
  const actionKey=action=>JSON.stringify(['asset','amount','recipient','nonce','accountId','policyHash','keyEpoch'].map(k=>String(action?.[k])));
  function guard(event) {
    // Normal setup/enrollment still use QWallet's own manual fee/consent gates.
    if(valid()&&!loaded&&$('kind').value!=='withdraw')return;
    if(!valid()||!loaded||!exactInputs()) {event.preventDefault();event.stopImmediatePropagation();if(!dead)note('Load the unchanged request first. Edited requests need a fresh messenger handoff.');return;}
    const s=current(),w=s.wallet;
    if(!s.connected||w?.connected?.owner!==loaded.owner||w.connected.chainId!==active.request.chainId||w.chainId!==active.request.chainId||w.publicKeyHex!==loaded.publicKey||w.locked||!w.backupVerified||w.busy||s.busy) {event.preventDefault();event.stopImmediatePropagation();note('Unlock and verify the same QWallet before continuing.');return;}
    if(event.currentTarget===$('prepare'))return; // Existing core prepares unsigned fields only.
    if(!matching(s)) {event.preventDefault();event.stopImmediatePropagation();note('QWallet prepared different units or fields. Do not approve. Check token decimals and recipient, then cancel this request.');return;}
    const key=actionKey(w.action);
    if(event.currentTarget===$('approve'))boundAction=key;
    else if(!boundAction||boundAction!==key) {event.preventDefault();event.stopImmediatePropagation();note('Approve this exact requested withdrawal with both keys first.');}
  }
  function poll() {
    if(!valid())return;
    const s=current(),w=s.wallet,r=active.request;
    ui('load').disabled=!!loaded||!s.connected||!w||s.busy||w.busy||w.locked||!w.backupVerified||!!w.execution?.journal||$('chain').value!==r.chainId;
    if(!loaded)return;
    if(!exactInputs()||!s.connected||w?.connected?.owner!==loaded.owner||w.connected.chainId!==r.chainId||w.chainId!==r.chainId||w.publicKeyHex!==loaded.publicKey||w.locked) {end('QWallet identity, key state or request fields changed.');return;}
    const e=w.execution,j=e?.journal;
    if(!j)return;
    let status='uncertain',evidence=null;
    if(j.status==='submitted')status='submitted';
    else if(j.status==='confirmed'&&e.outcome&&matching(s)&&boundAction===actionKey(w.action)) {
      const o=e.outcome;
      if(o.kind==='withdraw'&&o.asset===r.asset&&o.amount===r.amount&&o.recipient===r.recipient&&o.transactionHash===j.hash) {
        try{evidence=proof({chainId:r.chainId,vault:w.pool,owner:loaded.owner,asset:o.asset,amount:o.amount,recipient:o.recipient,nonce:String(w.action.nonce),transactionHash:o.transactionHash,blockHash:o.blockHash,blockNumber:o.blockNumber,logIndex:o.logIndex},r);status='included';}catch{/* Missing/mismatched evidence is never success. */}
      }
    }
    const marker=JSON.stringify([status,evidence]);
    if(marker!==last){last=marker;post(status,evidence);note(status==='included'?'QWallet checked exact withdrawal and canonical inclusion. This is an inclusion snapshot, not a finality guarantee.':status==='submitted'?'Submitted. Keep QWallet open and check the action receipt.':'Uncertain or reverted. Recover in QWallet; do not resend.');}
  }
  function load() {
    if(!valid()||loaded)return;
    const s=current(),w=s.wallet,r=active.request;
    if(!s.connected||!w||s.busy||w.busy||w.locked||!w.backupVerified||w.execution?.journal||$('chain').value!==r.chainId||!w.connected?.owner||w.connected.chainId!==r.chainId||w.chainId!==r.chainId) {note('Connect on the requested network, open/unlock QWallet, verify its backup, and clear or recover earlier actions first.');return;}
    if(r.recipient===w.pool||r.recipient===w.connected.owner) {note('Do not pay this custody contract or the connected payer address. Check the intended receiving address.');return;}
    if(!Array.from($('asset').options).some(option=>option.value===r.asset)) {note('This asset is outside the opened QWallet policy.');return;}
    const key='qhooks:messenger-request:v1:'+active.origin+':'+r.requestId;
    try {
      if(target.localStorage.getItem(key)!==null)throw Error('This request was already loaded. Recover its original action; do not reload or resend.');
      let count=0;for(let i=0;i<target.localStorage.length;i++)if(target.localStorage.key(i)?.startsWith('qhooks:messenger-request:v1:'))count++;
      if(count>=1000)throw Error('Request replay ledger is full. Resolve saved progress before accepting more requests.');
      target.localStorage.setItem(key,'seen');if(target.localStorage.getItem(key)!=='seen')throw Error('Could not retain request replay guard.');
    }catch(error){note(error.message||'Public progress storage is unavailable.');return;}
    loading=true;
    try {
      $('kind').value='withdraw';$('kind').dispatchEvent(new Event('change'));
      $('amount').value=format(r.amount,r.decimals);$('amount').dispatchEvent(new Event('input'));
      $('recipient').value=r.recipient;$('recipient').dispatchEvent(new Event('input'));
      $('asset').value=r.asset;$('asset').dispatchEvent(new Event('change'));
      loaded={owner:w.connected.owner,publicKey:w.publicKeyHex};boundAction=null;
      ui('load').disabled=true;post('loaded');note('Unsigned fields loaded. Review the recipient and actual asset units, then use the existing Prepare, both-key approval and fee-consent steps. Nothing has been signed or submitted.');
    }finally{loading=false;}
  }
  function handle(event) {
    if(dead||event.source!==opener||!allowed.has(event.origin)||event.data?.protocol!==PROTOCOL)return false;
    const data=event.data;
    if(active&&exact(data,['protocol','kind','sessionId','requestId'])&&data.kind==='stop'&&data.sessionId===active.sessionId&&data.requestId===active.request.requestId){end('Messenger stopped tracking.');return true;}
    if(active||!exact(data,['protocol','kind','sessionId','request'])||data.kind!=='request'||!uuid(data.sessionId))return false;
    try {
      const r=request(data.request,clock());active={origin:event.origin,sessionId:data.sessionId,request:r};
      ui('summary').textContent=`${format(r.amount,r.decimals)} ${r.asset===ZERO?'native units':'token units'} on chain ${r.chainId}\nAsset: ${r.asset}\nRecipient: ${r.recipient}\nExpires: ${new Date(r.expiresAt).toISOString()}\nThe address is not authenticated as a messenger contact.`;
      note('Check the recipient independently. Connect and open QWallet on this network to load the unsigned withdrawal.');post('received');poll();return true;
    }catch{note('Invalid, expired or unsupported messenger payment request.');return false;}
  }
  const edit=()=>{if(loaded&&!loading)end('The imported withdrawal was edited.');};
  for(const id of ids)$(id).addEventListener('click',guard,true);
  for(const id of ['kind','asset','amount','recipient'])for(const type of ['input','change'])$(id).addEventListener(type,edit);
  ui('load').addEventListener('click',load);ui('cancel').addEventListener('click',()=>end('Request declined.','declined'));
  target.addEventListener('message',handle);target.addEventListener('pagehide',()=>end('QWallet page closed.'));
  if(!opener){end('Open this dedicated page from the messenger.','declined');}
  else {timer=target.setInterval(()=>{if(active)poll();},250);for(const trusted of allowed)opener.postMessage({protocol:PROTOCOL,kind:'ready'},trusted);}
  return Object.freeze({handle,poll,load,dispose:()=>end('Tracking disposed.'),snapshot:()=>({active:!!active,loaded:!!loaded,dead})});
}
