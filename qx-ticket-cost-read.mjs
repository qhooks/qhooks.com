// Read-only, per-quote estimates. Never prepares, approves, signs, sends or changes an allowance.
const ZERO='0x0000000000000000000000000000000000000000';
const word = value => value.toLowerCase().replace(/^0x/,'').padStart(64,'0');
export function ticketCostEnvelope({state:s,trade:c,router,deadline,external,encoders}) {
  const {feeSwapCall,nativeHops,viaSwapCall}=encoders;
  if(external){const {sell,buy,q}=external,tin=sell==='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'?ZERO:sell,tout=buy==='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'?ZERO:buy;
    return {tokenIn:tin,tx:{to:router,data:viaSwapCall(q.tx.to,q.tx.data,tin,tout,c.a,c.minOut,c.side==='buy',deadline),value:tin===ZERO?c.a:0n}};}
  if(s.multi)return {tokenIn:c.side==='buy'?(c.payAsset?.address||c.pay==='native'&&ZERO||c.route.pool.quote):s.token,
    tx:{to:router,data:feeSwapCall(s.chainId,c.route.hops,c.a,c.minOut,c.route.wrap,c.side==='buy',deadline),value:c.side==='buy'&&c.pay==='native'?c.a:0n}};
  if(c.side==='buy'&&c.payAsset)return {tokenIn:c.payAsset.address,tx:{to:router,data:feeSwapCall(s.chainId,c.route.hops,c.a,c.minOut,null,true,deadline)}};
  if(c.side==='buy'&&s.nativePool)return {tokenIn:ZERO,tx:{to:router,data:feeSwapCall(s.chainId,[{key:s.key,zeroForOne:BigInt(s.key.currency0)===0n}],c.a,c.minOut,null,true,deadline),value:c.a}};
  if(c.side==='buy'&&c.pay==='native'){const {hops,wrap}=nativeHops(s.chainId,s.key,s.quote,c.route);return {tokenIn:ZERO,tx:{to:router,data:feeSwapCall(s.chainId,hops,c.a,c.minOut,wrap,true,deadline),value:c.a}};}
  const tokenIn=c.side==='buy'?s.quote:s.token;
  return {tokenIn,tx:{to:router,data:feeSwapCall(s.chainId,[{key:s.key,zeroForOne:s.key.currency0===tokenIn}],c.a,c.minOut,null,c.side==='buy',deadline)}};
}
export function createTicketCostReader({rpc,timeoutMs=6000}) {
  let active=null;
  const cancel=()=>{active?.abort();active=null;};
  return {cancel,async read({chainId,owner,amount,router,nativeAsset,envelope,ordinary=true,isCurrent=()=>true}) {
    cancel();const controller=new AbortController();active=controller;let reads=0,timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
    const call=async(method,params)=>{if(controller.signal.aborted||!isCurrent())throw Error('obsolete');if(++reads>5)throw Error('read bound');const value=await rpc(chainId,method,params,{signal:controller.signal,purpose:'ticket-cost'});if(controller.signal.aborted||!isCurrent())throw Error('obsolete');return value;};
    try{
      const tokenIn=envelope.tokenIn.toLowerCase(),native=tokenIn===ZERO;
      const [price,code,allowance]=await Promise.all([call('eth_gasPrice',[]),call('eth_getCode',[router,'latest']),native?Promise.resolve(null):call('eth_call',[{to:tokenIn,data:'0xdd62ed3e'+word(owner)+word(router)},'latest'])]);
      const gasPrice=BigInt(price);if(gasPrice<=0n)throw Error('unavailable');
      const setupNeeded=!code||/^0x0*$/.test(code),approvalNeeded=!native&&BigInt(allowance)<amount;
      const buffered=units=>(units*13n+9n)/10n;
      const budget={state:'estimated',kind:'budget',asset:nativeAsset,amount:buffered(650000n)*gasPrice,
        approval:approvalNeeded?buffered(100000n)*gasPrice:0n,setup:setupNeeded?buffered(3000000n)*gasPrice:0n,
        gasPrice,reads,reason:'Current gas-price budget · not a transaction simulation'};
      if(!ordinary||setupNeeded||approvalNeeded)return budget;
      try{
      const block=await call('eth_getBlockByNumber',['latest',false]);
      const tx=envelope.build(BigInt(block.timestamp));
      const gas=BigInt(await call('eth_estimateGas',[{...tx,from:owner,...tx.value!==undefined?{value:'0x'+tx.value.toString(16)}:{}}]));
      if(gas<=0n)throw Error('unavailable');
      return {...budget,kind:'simulation',amount:gas*gasPrice,gas,reads,reason:'Unsigned router gas estimate × current gas price'};
      }catch{if(!isCurrent()||controller.signal.aborted&&!timedOut)return null;return {...budget,reads,reason:(timedOut?'Simulation timed out':'Simulation unavailable')+' · current gas-price budget'};}
    }catch(error){return !isCurrent()||controller.signal.aborted&&!timedOut?null:{state:'unknown',reads,reason:timedOut?'Network estimate timed out · check your wallet before signing':'Network estimate unavailable · check your wallet before signing'};}
    finally{clearTimeout(timer);controller.abort();if(active===controller)active=null;}
  }};
}
