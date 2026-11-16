import {STAMP} from './qx-stamp-vault-artifact.mjs';
import {chainById} from './chains.mjs';
import {keccak,word,selector} from './lab-deploy-core.mjs';
export {STAMP};
const HASH=/^0x[0-9a-f]{64}$/i, ADDR=/^0x[0-9a-f]{40}$/i;
export const JOURNAL_KEY='qhooks:stamp-vault-v2:4663:'+STAMP.initCodeHash;
export const deploymentData=()=>STAMP.creationCode+STAMP.constructorArgs;
const hashText=s=>keccak(new TextEncoder().encode(s));
export function domainFor(address){return keccak('0x'+[hashText('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),hashText('QStampVault'),hashText('2')].map(x=>x.slice(2)).join('')+word('uint256',4663)+word('address',address));}
export function runtimeFor(address,genesis){
  if(!ADDR.test(address)||BigInt(genesis)<=0n)throw Error('Invalid deployment identity.');
  let bytes=STAMP.runtimeTemplate.slice(2);
  const values={...STAMP.config,genesis:String(genesis),_chainId:'4663',_domainSeparator:domainFor(address)};
  for(const [name,refs] of Object.entries(STAMP.immutables)){
    const type=name==='_domainSeparator'?'bytes32':STAMP.addressFields.includes(name)?'address':'uint256';
    const value=word(type,values[name]);
    for(const {start,length}of refs){if(length!==32)throw Error('Unexpected immutable width.');bytes=bytes.slice(0,start*2)+value+bytes.slice((start+length)*2);}
  }
  return '0x'+bytes;
}
export function normalizedCodeHash(code){
  if(!/^0x(?:[0-9a-f]{2})+$/i.test(code)||code.length!==STAMP.runtimeTemplate.length)throw Error('The vault code size differs.');
  let s=code.slice(2);for(const refs of Object.values(STAMP.immutables))for(const {start,length}of refs)s=s.slice(0,start*2)+'0'.repeat(length*2)+s.slice((start+length)*2);return keccak('0x'+s);
}
function pinned(){if(keccak(deploymentData())!==STAMP.initCodeHash||normalizedCodeHash(STAMP.runtimeTemplate)!==STAMP.templateHash)throw Error('The deployment build does not match. Nothing will be sent.');}
export function publicStampRpc(fetchImpl=globalThis.fetch){let id=0;return async(method,params)=>{
  for(const endpoint of STAMP.rpc){try{const r=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)continue;const j=await r.json();if(!j.error&&Object.hasOwn(j,'result'))return j.result;}catch{}}
  throw Error('Robinhood Chain is refreshing. Retry the check; no second deployment will be sent.');
};}
export const deploymentLock=fn=>{if(!globalThis.navigator?.locks)throw Error('Open this page in a browser that supports safe deployment recovery.');return navigator.locks.request(JOURNAL_KEY,{ifAvailable:true},l=>{if(!l)throw Error('Deployment is open in another tab. Check that tab.');return fn();});};
export function createStampVaultSetup({rpc=publicStampRpc(),hub,storage=globalThis.localStorage,lock=deploymentLock,onChange=()=>{}}={}){
  let state={phase:'checking',message:'Checking Robinhood Chain…'},busy=false,epoch=0,memory=null;
  const emit=p=>{state={...state,...p,busy};onChange(Object.freeze({...state}));return state;};
  function load(){if(memory)return memory;let raw;try{raw=storage.getItem(JOURNAL_KEY);}catch{throw Error('Browser storage is unavailable. Nothing will be sent.');}if(!raw)return null;let j;try{j=JSON.parse(raw);}catch{throw Error('Saved deployment cannot be read. Check your wallet activity.');}if(j.initCodeHash!==STAMP.initCodeHash||j.chainId!==4663||!ADDR.test(j.from)||!['wallet','pending','done'].includes(j.stage)||j.hash!==null&&!HASH.test(j.hash))throw Error('The saved request differs. Do not deploy again.');return j;}
  function save(j){const raw=JSON.stringify(j);storage.setItem(JOURNAL_KEY,raw);if(storage.getItem(JOURNAL_KEY)!==raw)throw Error('Browser storage cannot save the request.');memory=j;}
  function clear(){storage.removeItem(JOURNAL_KEY);if(storage.getItem(JOURNAL_KEY)!==null)throw Error('Saved request could not be cleared.');memory=null;}
  async function prerequisites(){
    const completed=[];const step=(key,message)=>emit({checklist:[...completed,key],message});
    step('Validate audited deployment build','Checking the audited creation code and constructor settings…');pinned();completed.push('✓ Audited deployment build matches');
    step('Confirm Robinhood Chain 4663','Checking the read network is Robinhood Chain 4663…');if(BigInt(await rpc('eth_chainId',[]))!==4663n)throw Error('The read network is not Robinhood Chain.');completed.push('✓ Robinhood Chain 4663 confirmed');
    const block=await rpc('eth_blockNumber',[]);
    for(const [label,addr]of [['QHooks Safe',STAMP.config.admin],['USDG',STAMP.config.usdg]]){step('Verify '+label+' code','Checking '+label+' code at block '+Number(BigInt(block)).toLocaleString()+'…');const code=await rpc('eth_getCode',[addr,block]);if(!/^0x[0-9a-f]{2,}$/i.test(code))throw Error(label+' code could not be verified. Deployment stays disabled. Retry the check.');completed.push('✓ '+label+' code present');}
    step('Confirm USDG uses 6 decimals','Checking USDG decimals…');const decimals=await rpc('eth_call',[{to:STAMP.config.usdg,data:selector('decimals()')},block]);if(BigInt(decimals)!==6n)throw Error('USDG decimals differ. Nothing will be sent.');completed.push('✓ USDG has 6 decimals');emit({checklist:completed});
  }
  function matchingTx(tx,j){return tx&&tx.to==null&&tx.from?.toLowerCase()===j.from.toLowerCase()&&(tx.input||tx.data)?.toLowerCase()===deploymentData().toLowerCase()&&BigInt(tx.value)===0n&&(tx.chainId==null||BigInt(tx.chainId)===4663n);}
  async function verifyReceipt(j){
    const r=await rpc('eth_getTransactionReceipt',[j.hash]);if(!r)return emit({phase:'pending',hash:j.hash,message:'Deployment is pending. Its hash is saved; you can return to this page.'});
    const tx=await rpc('eth_getTransactionByHash',[j.hash]);if(!matchingTx(tx,j)||r.transactionHash?.toLowerCase()!==j.hash.toLowerCase()||r.from?.toLowerCase()!==j.from.toLowerCase()||r.to!=null||!['0x0','0x1'].includes(r.status))throw Error('That receipt is not the exact vault deployment. Do not send again.');
    if(r.status==='0x0'){clear();return emit({phase:'ready',hash:j.hash,message:'The deployment reverted. No vault was created; retry only after checking your wallet.'});}
    if(!ADDR.test(r.contractAddress)||!HASH.test(r.blockHash))throw Error('The deployment receipt is incomplete. Retry the check.');
    const b=await rpc('eth_getBlockByNumber',[r.blockNumber,false]);if(b?.hash?.toLowerCase()!==r.blockHash.toLowerCase())throw Error('The deployment block changed. Retry verification.');
    const address=r.contractAddress.toLowerCase(),genesis=BigInt(b.timestamp),expected=runtimeFor(address,genesis),actual=await rpc('eth_getCode',[address,r.blockNumber]);
    if(actual.toLowerCase()!==expected.toLowerCase())throw Error('The deployed runtime or its immutables differ. Do not use this vault.');
    const checks={};for(const [name,value] of Object.entries({...STAMP.config,genesis:String(genesis),domainSeparator:domainFor(address)})){
      const result=await rpc('eth_call',[{to:address,data:selector(name+'()')},r.blockNumber]);
      const want='0x'+word(name==='domainSeparator'?'bytes32':STAMP.addressFields.includes(name)?'address':'uint256',value);
      if(result?.toLowerCase()!==want.toLowerCase())throw Error('Vault setting '+name+' does not match. Do not use it.');checks[name]=String(value);
    }
    save({...j,stage:'done',address,blockNumber:r.blockNumber});
    return emit({phase:'done',hash:j.hash,address,codeHash:keccak(expected),checks,message:'Vault deployed. Exact runtime, every immutable and the initial credit issuer are verified. Next: verify the source on Blockscout.'});
  }
  async function verifyKnownVault(known){
    if(known.version!==STAMP.version||!ADDR.test(known.address))throw Error('The registered vault version or address differs. Do not deploy again.');
    const block=await rpc('eth_blockNumber',[]),address=known.address.toLowerCase();emit({message:'Checking the existing vault runtime and every immutable…'});
    const genesis=BigInt(await rpc('eth_call',[{to:address,data:selector('genesis()')},block]));if(genesis!==BigInt(known.genesis))throw Error('The registered vault deployment timestamp differs. Do not use it.');
    const expected=runtimeFor(address,genesis),actual=await rpc('eth_getCode',[address,block]);if(actual.toLowerCase()!==expected.toLowerCase())throw Error('The deployed runtime or its immutables differ. Do not use this vault.');
    const checks={};for(const [name,value]of Object.entries({...STAMP.config,genesis:String(genesis),domainSeparator:domainFor(address)})){
      const result=await rpc('eth_call',[{to:address,data:selector(name+'()')},block]),want='0x'+word(name==='domainSeparator'?'bytes32':STAMP.addressFields.includes(name)?'address':'uint256',value);
      if(result?.toLowerCase()!==want.toLowerCase())throw Error('Vault setting '+name+' does not match. Do not use it.');checks[name]=String(value);
    }
    return emit({phase:'done',hash:null,address,codeHash:keccak(expected),checks,message:'The existing vault is verified. Exact runtime, every immutable and the credit issuer match the audited deployment.'});
  }
  async function checkInternal(){await prerequisites();const j=load();if(!j){const known=chainById('4663')?.stampVault;if(known)return verifyKnownVault(known);return emit({phase:'ready',message:'Ready. Your wallet deploys the fixed vault and pays deployment gas in ETH.',hash:null});}if(!j.hash)return emit({phase:'ambiguous',message:'A deployment request was started. Check wallet activity and enter its hash below. Do not deploy again.'});return verifyReceipt(j);}
  async function check(){if(busy)return state;busy=true;emit({phase:'checking',message:'Checking the network and saved deployment…'});try{return await checkInternal();}catch(e){let j;try{j=load();}catch{}return emit({phase:j?.hash?'pending':j?'ambiguous':'error',hash:j?.hash,message:e.message});}finally{busy=false;emit({});}}
  const context=()=>{const c=hub.snapshot().current;if(!c||!ADDR.test(c.owner)||String(c.chainId)!=='4663')throw Error('Connect your wallet on Robinhood Chain.');return c;};
  async function assertContext(c,rev){const now=context();const [accounts,chain]=await Promise.all([c.entry.provider.request({method:'eth_accounts'}),c.entry.provider.request({method:'eth_chainId'})]);if(epoch!==rev||now.owner!==c.owner||now.entry.provider!==c.entry.provider||accounts?.[0]?.toLowerCase()!==c.owner.toLowerCase()||BigInt(chain)!==4663n)throw Error('Your wallet changed. Nothing new will be sent.');}
  async function deploy(){if(busy)return state;if(!hub.snapshot().current){hub.open();return state;}busy=true;emit({phase:'checking',message:'Checking the exact vault deployment…'});try{return await lock(async()=>{
    if(load()||chainById('4663')?.stampVault)return checkInternal();await prerequisites();const c=context(),rev=epoch;await assertContext(c,rev);const tx={from:c.owner,data:deploymentData(),value:'0x0'};
    const simulation=await rpc('eth_call',[tx,'latest']);if(normalizedCodeHash(simulation)!==STAMP.templateHash)throw Error('The deployment simulation differs. Nothing was sent.');
    const estimate=BigInt(await rpc('eth_estimateGas',[tx]));if(estimate<=0n||estimate>10000000n)throw Error('Deployment gas could not be estimated.');await assertContext(c,rev);
    const j={chainId:4663,initCodeHash:STAMP.initCodeHash,from:c.owner.toLowerCase(),stage:'wallet',hash:null};save(j);emit({phase:'wallet',message:'Confirm deployment in your wallet. Estimated gas: '+estimate.toLocaleString()+' units.'});
    let hash;try{hash=await c.entry.provider.request({method:'eth_sendTransaction',params:[{...tx,gas:'0x'+((estimate*12n+9n)/10n).toString(16),chainId:'0x1237'}]});}catch(e){if(Number(e?.code)===4001){clear();return emit({phase:'ready',message:'Cancelled in your wallet. Nothing was sent.'});}throw Error('Wallet status is unknown. Check its activity; do not deploy again.');}
    if(!HASH.test(hash))throw Error('The wallet returned no transaction hash. Check activity before continuing.');memory={...j,stage:'pending',hash:hash.toLowerCase()};try{save(memory);}catch{return emit({phase:'pending',hash,message:'Sent. Save this transaction hash; browser storage could not persist it. Do not deploy again.'});}return verifyReceipt(memory);
  });}catch(e){let j;try{j=load();}catch{}return emit({phase:j?.hash?'pending':j?'ambiguous':'error',hash:j?.hash,message:e.message});}finally{busy=false;emit({});}}
  async function track(hash){if(busy)return state;if(!HASH.test(hash))return emit({message:'Enter the complete deployment transaction hash.'});busy=true;try{const tx=await rpc('eth_getTransactionByHash',[hash]),j=load()||{chainId:4663,initCodeHash:STAMP.initCodeHash,from:tx?.from,stage:'pending',hash};if(!matchingTx(tx,j))throw Error('This hash does not deploy the exact QStampVault v2 configuration.');save({...j,stage:'pending',hash:hash.toLowerCase()});return await verifyReceipt({...j,hash:hash.toLowerCase()});}catch(e){return emit({phase:'ambiguous',message:e.message});}finally{busy=false;emit({});}}
  return {check,deploy,track,snapshot:()=>({...state}),walletChanged(){epoch++;}};
}
