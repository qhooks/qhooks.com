const ADDRESS=/^0x[0-9a-f]{40}$/i, WORD=/^0x[0-9a-f]{64}$/i;
const SELECTORS={callerBps:'0xf4bd7446',floor:'0x40695363',weth:'0x3fc8cef3',hookList:'0xc9b00535'};
const address=value=>{if(!WORD.test(value)||!/^0x0{24}/i.test(value))throw Error('Invalid contract address');const result='0x'+value.slice(-40).toLowerCase();if(BigInt(result)===0n)throw Error('Missing contract address');return result;};
const digest=async code=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(code.slice(2).match(/../g),b=>parseInt(b,16))))].map(b=>b.toString(16).padStart(2,'0')).join('');
// Page-owned, read-only verification. A failed read never selects the legacy burn executor.
export async function loadVerifiedArbRoutes({rpc,fetchImpl=globalThis.fetch,signal,timeoutMs=10000}={}){
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason),timer=setTimeout(()=>controller.abort(),timeoutMs);let serial=0;
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const read=async(url,init={})=>{const response=await fetchImpl(url,{...init,signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('Contract read unavailable');return response.json();};
 const batch=async calls=>{const requests=calls.map(([method,params])=>({jsonrpc:'2.0',id:++serial,method,params})),body=await read(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(requests)});
  if(!Array.isArray(body)||body.length!==requests.length)throw Error('Incomplete contract read');
  const answers=new Map(body.map(row=>[row.id,row]));if(answers.size!==requests.length)throw Error('Invalid contract read');
  return requests.map(req=>{const row=answers.get(req.id);if(row?.jsonrpc!=='2.0'||row.error||typeof row.result!=='string')throw Error('Contract read failed');return row.result;});};
 try{
  const routes=await read('/arb-routes-rh.json'),candidate=routes.next;
  if(String(routes.chainId)!=='4663'||!Array.isArray(routes.routes)||!ADDRESS.test(candidate?.executor||'')||!/^([0-9a-f]{64})$/i.test(candidate?.runtimeSha256||'')||!ADDRESS.test(routes.hookList||'')||typeof candidate.abi!=='string'||!candidate.abi.startsWith('function recapture('))throw Error('Unrecognized arb contract');
  const [chainId,block]=await batch([['eth_chainId',[]],['eth_blockNumber',[]]]);
  if(!/^0x[0-9a-f]+$/i.test(chainId)||BigInt(chainId)!==4663n||!/^0x[0-9a-f]+$/i.test(block))throw Error('Wrong contract network');
  const executor=candidate.executor.toLowerCase(),names=Object.keys(SELECTORS);
  const [code,...values]=await batch([['eth_getCode',[executor,block]],...names.map(name=>['eth_call',[{to:executor,data:SELECTORS[name]},block]])]);
  if(!/^0x(?:[0-9a-f]{2}){1,65536}$/i.test(code)||await digest(code)!==candidate.runtimeSha256.toLowerCase())throw Error('Arb contract code does not match');
  const fields=Object.fromEntries(names.map((name,i)=>[name,values[i]]));
  if(!WORD.test(fields.callerBps))throw Error('Invalid caller share');
  const callerBps=Number(BigInt(fields.callerBps));if(callerBps<=0||callerBps>=10000||callerBps!==candidate.callerBps)throw Error('Unexpected caller share');
  const floor=address(fields.floor),weth=address(fields.weth),hookList=address(fields.hookList);
  if(hookList!==routes.hookList.toLowerCase())throw Error('Unexpected hook list');
  return {...routes,executor,callerBps,floor,weth,hookList,abi:candidate.abi,liquidity:true,verified:true,block,checkedAt:Date.now(),runtimeSha256:candidate.runtimeSha256};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function arbContractCopy(state){
 if(!state?.verified)throw Error('Verify the contract first');
 const caller=state.callerBps/100,rest=(10000-state.callerBps)/100;
 return {summary:`You keep ${caller}% of the gap; ${rest}% goes to the QHOOKS floor in WETH.`,
  terms:`The caller receives ${caller}% of the gap in the start currency. The remaining ${rest}% is sent to the QHOOKS floor in WETH. This executor does not buy or burn QHOOKS.`};
}
