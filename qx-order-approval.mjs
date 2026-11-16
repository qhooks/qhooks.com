import {connectedAddress,ethCall,calldata,send,rpc} from './qx-chain.mjs';
import {PERMIT2} from './qx-order-policy.mjs';
import {tradePrefs} from './qx-trade-prefs.mjs';
import {oneClickPlan,withOneClick} from './qx-instant-bridge.mjs';
import {getWalletHub} from './wallet-hub.mjs';
import {waitTransactionReceipt,pendingTransaction} from './qx-transaction-receipt.mjs';
export const MAX_ORDER_APPROVAL=(1n<<256n)-1n;
const key=(owner,chain,token)=>'qhooks.order-approval.pending.v1:'+owner.toLowerCase()+':'+chain+':'+token.toLowerCase();
const memory=new Map();
function saved(owner,chain,token){const k=key(owner,chain,token);let p=memory.get(k);if(!p)try{p=JSON.parse(localStorage.getItem(k)||'null');}catch{}return typeof p?.hash==='string'&&/^0x[0-9a-f]{64}$/i.test(p.hash)&&typeof p?.amount==='string'&&/^\d+$/.test(p.amount)?p:null;}
function remember(owner,chain,token,value){const k=key(owner,chain,token);if(value)memory.set(k,value);else memory.delete(k);try{if(value)localStorage.setItem(k,JSON.stringify(value));else localStorage.removeItem(k);}catch{}}
export async function orderAllowance(chain,token,owner){const value=await ethCall(chain,token,calldata('0xdd62ed3e',['address','address'],[owner,PERMIT2]),undefined,{purpose:'transaction',signal:AbortSignal.timeout(8000)});if(typeof value!=='string'||!/^0x[0-9a-f]{1,64}$/i.test(value))throw Error('Your trading approval could not refresh.');return BigInt(value);}
export async function orderApprovalState(chain,token,owner){const pending=saved(owner,chain,token);let allowance;try{allowance=await orderAllowance(chain,token,owner);}catch(error){if(!pending)throw error;return{mode:tradePrefs(owner).orderApproval,enabled:false,allowance:null,pending,refreshing:true};}return{mode:tradePrefs(owner).orderApproval,enabled:!pending&&allowance>=MAX_ORDER_APPROVAL,allowance,pending};}
function stillPending(chain,pending,cause){return Object.assign(pendingTransaction(chain,pending.hash),cause?{cause}:{});}
// A saved hash fences every allowance shortcut. Only its own receipt AND the observed target allowance settle it.
async function settlePending(chain,token,owner,onStatus,assert){
 const pending=saved(owner,chain,token);if(!pending)return;
 const guard=()=>{assert();if(connectedAddress()!==owner)throw Error('Your wallet changed. Reopen trading access.');};guard();try{await waitTransactionReceipt(chain,pending.hash,{rpc,onStatus,assert:guard});}catch(error){if(error.code==='transaction_reverted')remember(owner,chain,token,null);throw error;}guard();
 let after;try{after=await orderAllowance(chain,token,owner);}catch(error){throw stillPending(chain,pending,error);}guard();
 if(after!==BigInt(pending.amount))throw stillPending(chain,pending);
 remember(owner,chain,token,null);
}
async function approve(chain,token,amount,onStatus,assert,bounded=false){
 const owner=connectedAddress(),mode=bounded?'bounded':'once';if(!owner)throw Error('Connect your wallet first');
 const guard=()=>{assert();if(connectedAddress()!==owner||tradePrefs(owner).orderApproval!==mode)throw Error('Your trading approval preference changed. Review it again.');};guard();
 await settlePending(chain,token,owner,onStatus,guard);guard();
 const current=await orderAllowance(chain,token,owner);guard();
 if(current>=amount&&(!bounded||current!==MAX_ORDER_APPROVAL))return;
 let submitted=null;
 const receipt=await send(chain,{to:token,data:calldata('0x095ea7b3',['address','uint256'],[PERMIT2,amount])},onStatus,guard,{onSubmitted:hash=>{submitted=hash;remember(owner,chain,token,{hash,amount:String(amount)});}});
 guard();const pending={hash:submitted||receipt.transactionHash,amount:String(amount)};
 let after;try{after=await orderAllowance(chain,token,owner);}catch(error){throw stillPending(chain,pending,error);}guard();
 if(after!==amount)throw stillPending(chain,pending);
 remember(owner,chain,token,null);
}
export async function prepareOrderWallet(owner,chain,onStatus=()=>{},assert=()=>{}){
 assert();const hub=getWalletHub(window),start=hub.snapshot().current;if(!owner||start?.owner?.toLowerCase()!==owner)throw Error('Connect the wallet that reviewed this order.');
 if(String(start.chainId)===String(chain))return start;
 if(typeof hub.switchChain!=='function')throw Error('Switch your wallet to the order network first.');
 onStatus('Switching to the order network…');assert();await hub.switchChain(String(chain));assert();
 const until=Date.now()+6000;for(;;){assert();const current=hub.snapshot().current;if(current?.owner&&current.owner.toLowerCase()!==owner)throw Error('Your wallet changed. Review this order again.');if(current?.owner?.toLowerCase()===owner&&String(current.chainId)===String(chain)&&current.entry?.provider?.request&&(start.entry?.rdns!=='io.qhooks.privy'||current.entry.provider!==start.entry.provider))return current;if(Date.now()>=until)throw Error('Your wallet is still switching networks. Try again when it is ready.');await new Promise(r=>setTimeout(r,50));}
}
export async function checkOrderApproval(chain,token,onStatus=()=>{},assert=()=>{}){
 const owner=connectedAddress(),hub=getWalletHub(window),provider=hub.snapshot().current?.entry?.provider;
 const guard=()=>{assert();if(!owner||connectedAddress()!==owner||hub.snapshot().current?.entry?.provider!==provider)throw Error('Your wallet changed. Reopen trading access.');};guard();
 await settlePending(chain,token,owner,onStatus,guard);guard();
}
export async function enableOrderTrading(chain,token,onStatus=()=>{},assert=()=>{}){
 const owner=connectedAddress(),hub=getWalletHub(window),initial=hub.snapshot().current,pref=tradePrefs(owner);
 const before=()=>{assert();const c=hub.snapshot().current;if(!owner||connectedAddress()!==owner||c?.owner?.toLowerCase()!==owner||tradePrefs(owner).orderApproval!=='once'||tradePrefs(owner).mode!==pref.mode||tradePrefs(owner).capUsd!==pref.capUsd||c?.entry?.rdns!==initial?.entry?.rdns||c?.entry?.uuid!==initial?.entry?.uuid)throw Error('Trading access changed. Review it again.');};before();
 const start=await prepareOrderWallet(owner,chain,onStatus,before),provider=start?.entry?.provider;
 const guard=()=>{before();const c=hub.snapshot().current;if(c?.entry?.provider!==provider||String(c.chainId)!==String(chain))throw Error('Your wallet changed. Review trading access again.');};guard();
 // This explicit Enable button authorizes the token allowance, not an order. Trade caps still apply to placement.
 return withOneClick(oneClickPlan(owner,start?.entry,null),()=>approve(chain,token,MAX_ORDER_APPROVAL,onStatus,guard));
}
export async function ensureOrderAllowance(chain,token,spender,amount,onStatus=()=>{},assert=()=>{}){
 if(spender.toLowerCase()!==PERMIT2)throw Error('This trading approval does not match Permit2.');
 const owner=connectedAddress();if(!owner)throw Error('Connect your wallet first');assert();
 await settlePending(chain,token,owner,onStatus,assert);assert();
 const mode=tradePrefs(owner).orderApproval;
 if(mode==='bounded')return approve(chain,token,amount,onStatus,assert,true);
 const allowance=await orderAllowance(chain,token,owner);assert();
 if(connectedAddress()!==owner||tradePrefs(owner).orderApproval!==mode)throw Error('Your trading approval preference changed. Review it again.');
 if(allowance<MAX_ORDER_APPROVAL)throw Object.assign(Error('Enable trading for this token first.'),{code:'order_enable_required'});
}
