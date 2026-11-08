// A native exit may continue only for the wallet and launch that initiated it.
export function bindNativeExit({state,getState,owner,getOwner,trade=null}){
 const address=x=>typeof x==='string'&&/^0x[\da-f]{40}$/i.test(x)?x.toLowerCase():null;
 const chain=String(state?.chainId),token=address(state?.token),wallet=address(owner);
 const assert=()=>{
  if(!state||!token||!wallet||getState()!==state||String(state.chainId)!==chain||address(state.token)!==token||address(getOwner())!==wallet||trade&&(String(trade.chainId)!==chain||address(trade.token)!==token||address(trade.owner)!==wallet))throw Error('Exit context changed. Reopen TP/SL for the owning wallet and token.');
 };
 assert();return assert;
}
