import {chainById} from './chains.mjs';
import {abi} from './qx-launch-route-codec.mjs';
import {createEcosystemRoutePlanner} from './qx-ecosystem-routes-core.mjs';
const ZERO='0x'+'0'.repeat(40),ROUTER='0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff';
const KEY='(address,address,uint24,int24,address)',PATH='(address,uint24,int24,address,bytes)';
const ensure=(v,m)=>{if(!v)throw Error(m);};
const keyTuple=k=>[k.currency0,k.currency1,k.fee,k.tickSpacing,k.hooks];
// Existing published QFeeRouter generation only. No wallet, approval or send seam.
export async function compareQHooksNativeRoutes({chainId,poolKey,owner,amountIn,slippageBps,deadline,referrer=ZERO},{fetch:fetcher=globalThis.fetch,signal,clock=()=>Math.floor(Date.now()/1000)}={}){
 const chain=chainById(chainId);ensure(chain?.status==='live'&&chain.router,'This chain’s current QHooks route is not available.');
 ensure(poolKey&&Object.getPrototypeOf(poolKey)===Object.prototype,'Supply the exact launched pool key.');
 const key=structuredClone(poolKey),quote=chain.quote.address.toLowerCase();for(const name of ['currency0','currency1','hooks']){ensure(typeof key[name]==='string'&&/^0x[0-9a-f]{40}$/i.test(key[name]),'Use an exact '+name);key[name]=key[name].toLowerCase();}
 ensure([key.currency0,key.currency1].includes(quote),'This reader only supports the chain’s current launch quote; other ecosystem pairs need their own qualified adapter.');
 const token=key.currency0===quote?key.currency1:key.currency0;ensure(token!==ZERO&&token!==quote,'The pool must contain a separate launch token.');let serial=0;
 async function read(method,params){
  const id=++serial,response=await fetcher(chain.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),credentials:'omit',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
  ensure(response.ok,'The selected chain’s read endpoint is unavailable.');ensure(response.body?.getReader,'A streaming chain read response is required.');const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072){await reader.cancel();throw Error('Chain read response is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));ensure(body&&body.jsonrpc==='2.0'&&body.id===id,'The RPC response identity or version did not match this request.');ensure(!body.error&&Object.hasOwn(body,'result'),'The chain could not quote this exact pool.');return body.result;
 }
 ensure(BigInt(await read('eth_chainId',[])).toString()===String(chainId),'The read endpoint returned another chain.');const block=await read('eth_getBlockByNumber',['latest',false]);ensure(block&&/^0x[0-9a-f]+$/i.test(block.number)&&/^0x[0-9a-f]{64}$/i.test(block.hash)&&/^0x[0-9a-f]+$/i.test(block.timestamp),'A complete source block is required.');
 const state={chainId:String(chainId),number:BigInt(block.number).toString(),hash:block.hash.toLowerCase(),timestamp:BigInt(block.timestamp).toString()};
 const route=(id,path,wrap,single)=>({id,chainId:String(chainId),manager:chain.contracts.manager.toLowerCase(),router:ROUTER,wrap,path,sourceRef:'qhooks-current-registry:'+chainId+':'+id,async quote({amountIn:net},{signal:quoteSignal}){
  if(quoteSignal?.aborted)throw Error('Quote cancelled');let call;
  if(single)call='0xaa9d21cb'+abi([`(${KEY},bool,uint128,bytes)`],[[keyTuple(key),key.currency0===quote,net,'0x']]).slice(2);
  else{const first=path[0].key,stages=[[quote,first.fee,first.tickSpacing,ZERO,'0x'],[token,key.fee,key.tickSpacing,key.hooks,'0x']];call='0xca253dc9'+abi([`(address,${PATH}[],uint128)`],[[ZERO,stages,net]]).slice(2);}
  const result=await read('eth_call',[{to:chain.contracts.quoter,data:call,from:owner},block.number]);ensure(typeof result==='string'&&/^0x[0-9a-f]{64}(?:[0-9a-f]{64})*$/i.test(result),'The quoter returned invalid output.');
  return{amountOut:BigInt(result.slice(0,66)).toString(),block:state,expiresAt:String(Math.min(Number(deadline),Number(state.timestamp)+120,clock()+60))};
 }});
 const final={key,zeroForOne:key.currency0===quote,hookData:'0x'};
 const adapters=chain.quote.wrapNative?[route('wrapped-native-direct',[final],chain.wrappedNative.toLowerCase(),true)]:[[100,1],[500,10],[3000,60]].map(([fee,tickSpacing])=>route('native-usdc-'+fee,[{key:{currency0:ZERO,currency1:quote,fee:String(fee),tickSpacing:String(tickSpacing),hooks:ZERO},zeroForOne:true,hookData:'0x'},final],ZERO,false));
 const planner=createEcosystemRoutePlanner({adapters,clock}),comparison=await planner.compare({chainId:String(chainId),owner,currencyIn:ZERO,currencyOut:token,amountIn,slippageBps,deadline,feeOnInput:true,referrer},{signal});
 return Object.freeze({comparison,verifyUnsigned:planner.verifyUnsigned});
}
