import {chainById} from './chains.mjs';
import {plan,runStep,runSteps,loadStudioClient} from './qx-launch-engine.mjs';
import {allocationAmounts,workspaceFields,units,validateConfig,validateAllocations,listingBody,MARKET_METADATA_GAPS,profileFromConfig,fundingPreflight,human} from './qx-create-plan.mjs';
import {allocationLockData,readAllocationLock,lockMatches} from './launch-allocation.mjs';
import {abiEncode} from './full-launch/packages/launchpad/abi-encode.mjs';
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';
import {createLaunchSignerLease} from './qx-create-account-signer.mjs';
export const RECORD_PREFIX='qhooks:create:launch:v1:';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const hex=n=>'0x'+BigInt(n).toString(16);
const call=(selector,types,values)=>selector+abiEncode(types,values).slice(2);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const digest=text=>'0x'+Array.from(keccak_256(Uint8Array.from(text.slice(2).match(/../g)||[],x=>parseInt(x,16))),b=>b.toString(16).padStart(2,'0')).join('');
const selector=text=>'0x'+Array.from(keccak_256(new TextEncoder().encode(text)),b=>b.toString(16).padStart(2,'0')).join('').slice(0,8);
export function newLaunchRecord(config,owner,id=globalThis.crypto.randomUUID()) {
 validateConfig(config,owner);
 return {version:1,id,owner:owner.toLowerCase(),chainId:config.chainId,config:structuredClone(config),steps:{},studio:null,addresses:{},status:'ready',current:null,metadata:profileFromConfig(config),metadataGaps:[...MARKET_METADATA_GAPS],createdAt:Date.now()};
}
export function saveLaunchRecord(storage,record) {
 const key=RECORD_PREFIX+record.id,text=JSON.stringify(record);
 ensure(text.length<=3000000,'Launch progress is too large. Download it before continuing.');
 storage.setItem(key,text);ensure(storage.getItem(key)===text,'Could not save launch progress. Free some browser storage, then retry.');
}
export async function loadCreateArtifacts(fetcher=globalThis.fetch) {
 const files=[['toolkitText','toolkit.json',1000000],['metadataText','metadata.json',100000],['tokenText','token.json',20000],['policyText','dependencies.json',100000],['extrasText','extras.json',1000000]];
 return Object.fromEntries(await Promise.all(files.map(async([key,path,limit])=>{const r=await fetcher('/full-launch/'+path,{cache:'no-store',redirect:'error'});ensure(r.ok,'Could not load the launch toolkit. Retry.');const t=await r.text();ensure(t.length<=limit,'Launch toolkit exceeded its size limit.');return [key,t];})));
}
export const LISTING_WAITING='Your token is live. Adding it to Markets as soon as its first price shows up, usually a minute or two. Nothing else to sign.';
const LISTING_RETRYABLE=/market_observation_unavailable|unavailable|timeout|rate|network|^5\d\d$|^429$|^404$/i;
// A launch that worked on-chain is listed as soon as the market can read its first price:
// retry every 30 s for up to 10 min before asking the creator to press Try again.
export async function submitListing({fetcher,sleep,body,alive=()=>true,onWaiting=()=>{},now=Date.now,windowMs=10*60_000,everyMs=30_000}){
 const until=now()+windowMs;
 for(let attempt=0;;attempt++){
  ensure(alive(),'Launch page closed.');
  let response=null,failure='network';
  try{response=await fetcher('/api/markets',{method:'POST',headers:{'content-type':'application/json'},body});failure=response.ok?'':String((await response.json().catch(()=>({}))).error||response.status);}catch{}
  if(response?.ok)return response;
  if(!LISTING_RETRYABLE.test(failure)||now()+everyMs>until)throw Error(failure==='network'||LISTING_RETRYABLE.test(failure)?'market_observation_unavailable':'Markets refused this listing. Check the launch record in My QHooks.');
  if(attempt===0)await onWaiting();
  await sleep(everyMs);
 }
}
export function createLaunchContext({record,hub,signer,save,onChange=()=>{},fetcher=globalThis.fetch,loadClient=loadStudioClient,loadArtifacts=()=>loadCreateArtifacts(fetcher),sleep=pause}) {
 const chain=chainById(record.chainId),allocations=allocationAmounts(record.config.supply,record.config.allocations).allocations;
 let joined=null,engine=null,client=null,artifacts=null,extras=null,disposed=false,workspaceSigner=signer?createLaunchSignerLease(signer):null;
 const persist=async()=>{await save();await onChange(record);};
 const row=id=>record.steps[id]||={};
 async function check(){ensure(!disposed,'Launch page closed.');const c=hub.snapshot().current;ensure(c?.owner===record.owner&&c.chainId===record.chainId,'Reconnect your launch wallet on '+chain.name+'.');
  const p=c.entry.provider;const [id,accounts]=await Promise.all([p.request({method:'eth_chainId'}),p.request({method:'eth_accounts'})]);ensure(BigInt(id).toString()===record.chainId&&accounts?.[0]?.toLowerCase()===record.owner,'Wrong network or wallet. Reconnect your launch wallet.');return p;
 }
 async function request(method,params=[]){const p=await check();return p.request({method,params});}
 async function publicRead(method,params=[]){ensure(chain.rpc,'No public network endpoint.');const r=await fetcher(chain.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});ensure(r.ok,'RPC timeout.');const j=await r.json();ensure(!j.error&&j.result!=null,'RPC timeout.');return j.result;}
 async function load(){if(!artifacts){artifacts=await loadArtifacts();extras=JSON.parse(artifacts.extrasText);ensure(extras.kind==='qhooks-launch-extras'&&extras.schemaVersion===1,'Unrecognized launch extras.');}return artifacts;}
 async function workspace(){
  await check();if(engine)return engine;
  client??=await loadClient();await load();
  const connection=hub.snapshot().current;
  joined=client.createRememberedLaunchConnection(connection.entry.provider,()=>{engine?.invalidate();});
  const c=await joined.session.connect();ensure(c.owner===record.owner&&c.chainId===record.chainId,'Launch connection changed.');
  engine=await (client.createRegistryWorkspace||client.createLaunchWorkspace)({provider:joined.provider,session:joined.session,chainId:record.chainId,owner:record.owner,
   fields:record.studio?undefined:workspaceFields(record.config,record.owner),publicKey:signer?.publicKeyHex,signer:workspaceSigner,saved:record.studio,
   save:async text=>{record.studio=text;await persist();},onChange:()=>{if(engine){record.addresses={...engine.snapshot().addresses};onChange(record);}},...artifacts});
  const expected=workspaceFields(record.config,record.owner),snapshot=engine.snapshot();
  ensure(Object.keys(expected).every(k=>snapshot.fields[k]===expected[k])&&(!record.publicKey||snapshot.publicKey===record.publicKey),'Saved engine settings differ from this launch review. Use the matching launch record.');
  await engine.save();record.addresses={...engine.snapshot().addresses};await persist();return engine;
 }
 async function receipt(hash){
  const r=await request('eth_getTransactionReceipt',[hash]);if(!r)return null;
  ensure(r.transactionHash?.toLowerCase()===hash.toLowerCase(),'Network returned a different transaction receipt.');
  const b=await request('eth_getBlockByNumber',[r.blockNumber,false]);ensure(b?.hash===r.blockHash,'Network receipt changed. Retry after confirmation.');return r;
 }
 async function wait(hash){for(let i=0;i<120;i++){const r=await receipt(hash);if(r){ensure(r.status==='0x1','The contract reverted. '+(r.revertReason||'Check the transaction, then retry.'));return r;}await sleep(1500);}throw Error('RPC timeout while waiting for '+hash+'. Retry to check it.');}
 function verifyTx(expected,actual){return actual&&actual.from?.toLowerCase()===record.owner&&String(actual.to||'').toLowerCase()===String(expected.to||'').toLowerCase()&&String(actual.input??actual.data??'0x').toLowerCase()===String(expected.data||'0x').toLowerCase()&&BigInt(actual.value||0)===BigInt(expected.value||0)&&BigInt(actual.nonce)===BigInt(expected.nonce);}
 async function checkRecorded(id){const r=row(id);if(!r.hash)return null;const receiptValue=await receipt(r.hash);if(!receiptValue)return null;
  ensure(verifyTx(r.transaction,await request('eth_getTransactionByHash',[r.hash])),'Saved transaction does not match this launch step.');
  if(receiptValue.status==='0x0')return {reverted:true};
  ensure(receiptValue.status==='0x1','The network has not confirmed this transaction.');return receiptValue;
 }
 async function sendRecorded(id,transaction){
  const r=row(id);if(r.hash){let prior=await checkRecorded(id);if(!prior){await wait(r.hash);prior=await checkRecorded(id);}if(!prior.reverted)return prior;
   r.attempts=[...(r.attempts||[]),{hash:r.hash,transaction:r.transaction,status:'reverted'}];delete r.hash;r.uncertain=false;await persist();}
  ensure(!r.uncertain,'This transaction may have been sent. Enter its hash to recover it before retrying.');
  const provider=await check(),tx={from:record.owner,...transaction,value:hex(transaction.value||0),chainId:chain.hex};
  const [nonce,gas,price]=await Promise.all([request('eth_getTransactionCount',[record.owner,'pending']),request('eth_estimateGas',[tx]),request('eth_gasPrice')]);
  tx.nonce=nonce;tx.gas=hex(BigInt(gas)*13n/10n);const [block,tip]=await Promise.all([request('eth_getBlockByNumber',['latest',false]),request('eth_maxPriorityFeePerGas').catch(()=> '0x0')]);
  if(block.baseFeePerGas){const base=BigInt(block.baseFeePerGas)*2n+BigInt(tip),floor=BigInt(price)*2n;tx.maxFeePerGas=hex(base>floor?base:floor);tx.maxPriorityFeePerGas=tip;}
  ensure(BigInt(await request('eth_getBalance',[record.owner,'latest']))>=BigInt(tx.value)+BigInt(tx.gas)*BigInt(tx.maxFeePerGas||price),'Not enough '+chain.native+' for the amount and network gas.');
  r.transaction=tx;r.uncertain=true;await persist();
  try {await check();const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});ensure(/^0x[0-9a-f]{64}$/i.test(hash),'Wallet did not return a transaction hash.');r.hash=hash;r.uncertain=false;await persist();}
  catch(e){if(Number(e?.code)===4001){r.uncertain=false;await persist();}throw e;}
  await wait(r.hash);return checkRecorded(id);
 }
 async function locksReady(){await load();const a=extras.contracts.locks;const code=await request('eth_getCode',[a.address,'latest']);if(code==='0x')return false;ensure(digest(code)===a.runtimeKeccak,'QLocks code does not match the launch toolkit.');return true;}
 async function lockAt(id){return readAllocationLock(await request('eth_call',[{to:extras.contracts.locks.address,data:call('0x9507d39a',['uint256'],[id])},'latest']));}
 const handlers={
  async switch(){ensure(hub.snapshot().current?.owner===record.owner,'Connect the wallet that started this launch.');await hub.switchChain(record.chainId);
   // Privy may swap its underlying SDK provider after chainChanged. Its stable
   // facade survives, but open the Studio session after that handoff settles.
   await sleep(750);await check();return {chainId:record.chainId};},
  async preflight(){
   // Completed bootstrap is verified through the existing engine on reload;
   // its spent liquidity must not be requested again while finishing locks.
   if(record.studio){const w=await workspace();await w.reconcile();if(w.snapshot().completed.includes('bootstrap'))return {skipped:true,detail:'Pool funding already confirmed.'};}
   const reads=via=>Promise.all([via('eth_call',[{to:chain.quote.address,data:call('0x70a08231',['address'],[record.owner])},'latest']),via('eth_getBalance',[record.owner,'latest']),via('eth_gasPrice',[])]);
   let quote,native,price;
   try{[quote,native,price]=await reads(request);}catch(walletError){
    // Embedded wallets can refuse plain reads; ask the network directly, then carry on: the wallet shows the real amount before each approval.
    try{[quote,native,price]=await reads(publicRead);}catch{return {checked:false,unread:true,detail:'We couldn\'t read your balance just now. You can carry on; your wallet will show the real amount before you approve.'};}
   }
   const value=fundingPreflight(record.config,{quoteBalance:BigInt(quote),nativeBalance:BigInt(native),gasPriceWei:BigInt(price)});
   ensure(BigInt(value.missingQuote)===0n,'Add '+human(value.missingQuote,chain.quote.decimals)+' '+chain.quote.symbol+' on '+chain.name+' for starting liquidity before launching. Your native '+chain.native+' pays network fees.');
   ensure(BigInt(native)>=BigInt(value.requiredNative),'Not enough '+chain.native+' for starting liquidity, the launch fee and estimated network gas. Estimated need: '+human(value.requiredNative)+' '+chain.native+'.');
   return {checked:true,quoteUnit:chain.quote.symbol};
  },
  async wrap(step){await load();const q=chain.quote;ensure(q.wrapNative&&q.address===chain.wrappedNative,'This quote cannot wrap native currency.');
   ensure(!row(step.id).uncertain,'This transaction may have been sent. Enter its hash to recover it before retrying.');
   if(row(step.id).hash){const saved=await checkRecorded(step.id);if(saved&&!saved.reverted)return {hash:row(step.id).hash};}
   const bal=BigInt(await request('eth_call',[{to:q.address,data:call('0x70a08231',['address'],[record.owner])},'latest'])),needed=units(record.config.liquidity,q.decimals);
   if(bal>=needed&&!row(step.id).hash)return {skipped:true,detail:'Wrapped balance already covers liquidity.'};
   // Verify the official quote's runtime and units before sending a deposit.
   client??=await loadClient();const deps=await client.createLaunchDependencies({chainId:record.chainId,policyText:artifacts.policyText});await deps.verify({request,live:check});
   await sendRecorded(step.id,{to:q.address,data:'0xd0e30db0',value:needed>bal?needed-bal:0n});
   ensure(BigInt(await request('eth_call',[{to:q.address,data:call('0x70a08231',['address'],[record.owner])},'latest']))>=needed,'The wrap receipt confirmed but the liquidity balance is still short. Check the transaction before retrying.');
   return {hash:row(step.id).hash};},
  async 'locks-setup'(step){ensure(!row(step.id).uncertain,'This transaction may have been sent. Enter its hash to recover it before retrying.');if(await locksReady())return {skipped:!row(step.id).hash};await sendRecorded(step.id,{to:extras.deployer,data:extras.salt+extras.contracts.locks.initCode.slice(2)});ensure(await locksReady(),'QLocks setup is still pending.');return {hash:row(step.id).hash};},
  async 'locks-approve'(step){await workspace();ensure(await locksReady(),'Set up QLocks first.');
   ensure(!row(step.id).uncertain,'This transaction may have been sent. Enter its hash to recover it before retrying.');
   const limits=await Promise.all(['MAX_SPAN()','MAX_NOTICE()'].map(name=>request('eth_call',[{to:extras.contracts.locks.address,data:selector(name)},'latest']).then(v=>Number(BigInt(v)))));
   validateAllocations(record.config.allocations,record.config.supply,{span:limits[0],notice:limits[1]});
   const total=allocations.reduce((n,r)=>n+BigInt(r.amount),0n),token=engine.snapshot().addresses.token,spender=extras.contracts.locks.address;
   const allowance=BigInt(await request('eth_call',[{to:token,data:call('0xdd62ed3e',['address','address'],[record.owner,spender])},'latest']));
   if(allowance<total)await sendRecorded(step.id,{to:token,data:call('0x095ea7b3',['address','uint256'],[spender,total.toString()])});return {hash:row(step.id).hash,skipped:!row(step.id).hash};},
  async allocation(step){await workspace();ensure(await locksReady(),'QLocks is unavailable.');const a=allocations.find(r=>r.id===step.allocationId),token=engine.snapshot().addresses.token;
   const r=await sendRecorded(step.id,{to:extras.contracts.locks.address,data:allocationLockData(token,a.wallet,a.amount,a)});
   // Read the emitted indexed id, then verify all lock fields on chain. The
   // exact event signature is taken from the artifact, so ABI edits stay visible.
   const event=extras.contracts.locks.abi.find(x=>x.type==='event'&&x.name==='Locked');
   const eventTopic='0x'+Array.from(keccak_256(new TextEncoder().encode('Locked('+event.inputs.map(x=>x.type).join(',')+')')),b=>b.toString(16).padStart(2,'0')).join('');
   const log=r.logs?.find(l=>l.address?.toLowerCase()===extras.contracts.locks.address&&l.topics?.[0]===eventTopic);ensure(log?.topics?.[1],'QLocks did not confirm the allocation id.');const lockId=BigInt(log.topics[1]).toString();
   ensure(lockMatches(await lockAt(lockId),a,token),'Confirmed lock differs from your allocation.');return {hash:row(step.id).hash,lockId};},
  async listing(){await workspace();const {exportSwapPoolPackage}=await import('./trade-client/packages/multichain-swap/pool-package.mjs');
   const pool=exportSwapPoolPackage(engine);record.pool=JSON.parse(pool);await persist();
   const r=row('list-market');
   try{await submitListing({fetcher,sleep,body:listingBody(pool,record.metadata),alive:()=>!disposed,onWaiting:async()=>{r.note=LISTING_WAITING;await persist();}});}
   finally{if(r.note){delete r.note;await persist();}}
   const listed=await fetcher('/api/markets/'+record.chainId+'/'+record.pool.controller,{cache:'no-store'});
   ensure(listed.ok,'Your token is live. It isn\'t on Markets yet. Try again in a minute; nothing else to sign.');const body=await listed.json();ensure(body.pool?.controller===record.pool.controller&&body.pool?.chainId===record.chainId,'Market listing returned a different pool.');return {listed:true};}
 };
 async function engineResult(id,s){const j=JSON.parse(engine.journal()),stages=id==='funding'?j.actions.filter(r=>r.fields?.kind==='approve-token').map(r=>r.stage):id==='bootstrap'?j.actions.filter(r=>r.fields?.kind==='bootstrap').map(r=>r.stage):j.deployments[id]?.flatMap(r=>r.stages)||[];
  return {hashes:stages.filter(Boolean).map(r=>r.hash).filter(Boolean),address:s.addresses[id]||null,verified:true};}
 async function verify(step,prior){
  if(step.kind==='switch')return hub.snapshot().current?.owner===record.owner&&hub.snapshot().current?.chainId===record.chainId;
  if(step.kind==='engine'){const w=await workspace();await w.reconcile();return w.snapshot().completed.includes(step.id);}
  if(step.kind==='listing'){if(!record.pool)return false;const response=await fetcher('/api/markets/'+record.chainId+'/'+record.pool.controller,{cache:'no-store'});if(!response.ok)return false;const b=await response.json();return b.pool?.controller===record.pool.controller&&b.pool?.chainId===record.chainId;}
  if(prior.hash){const r=await checkRecorded(step.id);if(!r)return false;if(r.reverted)return false;}
  if(step.kind==='preflight')return false; // Refresh balances before unfinished sends.
  if(step.kind==='wrap'){if(prior.hash)return true;if(record.studio){const w=await workspace();await w.reconcile();if(w.snapshot().completed.includes('bootstrap'))return true;}const bal=BigInt(await request('eth_call',[{to:chain.quote.address,data:call('0x70a08231',['address'],[record.owner])},'latest']));return bal>=units(record.config.liquidity,chain.quote.decimals);}
  if(step.kind==='locks-setup')return locksReady();
  if(step.kind==='locks-approve'){await workspace();await load();return prior.hash?true:false;}
  if(step.kind==='allocation'){await workspace();await load();return prior.lockId&&lockMatches(await lockAt(prior.lockId),allocations.find(r=>r.id===step.allocationId),engine.snapshot().addresses.token);}
  return false;
 }
 const ctx={handlers,workspace,check,wait,engineResult,verify,
  setSigner(next){ensure(next?.backupVerified&&!next.locked&&(!record.publicKey||next.publicKeyHex===record.publicKey),'Restore the matching backup for this launch.');if(signer===next&&workspaceSigner&&!workspaceSigner.locked)return;signer=next;workspaceSigner?.lock();workspaceSigner=createLaunchSignerLease(next);engine?.attachSigner(workspaceSigner);},
  async recover(hash){ensure(/^0x[0-9a-f]{64}$/i.test(hash),'Enter the transaction hash from your wallet.');const step=plan(record.config).find(s=>s.id===record.current);ensure(step,'No stopped launch step.');
   if(step.kind==='engine'){await(await workspace()).recover(hash);return;}
   const r=row(step.id);ensure(r.uncertain&&r.transaction,'No transaction needs a recovery hash.');ensure(verifyTx(r.transaction,await request('eth_getTransactionByHash',[hash])),'This transaction does not match the stopped step.');r.hash=hash;r.uncertain=false;await persist();await wait(hash);},
  run:()=>runSteps({steps:plan(record.config),record,verify,execute:step=>runStep(step,ctx),save:persist,onStep:()=>onChange(record)}),
  dispose(){disposed=true;workspaceSigner?.lock();engine?.dispose();joined?.session.dispose();}
 };return ctx;
}
