// Order failures use the shared wallet error/debug boundary, including reads and validation before approval.
import {asTradeError} from './qx-chain-guard.mjs';
const generic='The request did not complete. Check your wallet activity and try again.';
const notes={executor_not_deployed:'Orders are not set up on this chain yet.',needs_approval_or_balance:'Your wallet needs the balance and the one-time approval first.',invalid_signature:'The signature did not match. Try again.',too_many_orders:'You have 50 open orders. Withdraw some first.',slow_down:'Too many orders this hour. Try again shortly.',order_rejected:'This order would not go through on chain. Check the amount and price.',invalid_deadline:'Choose how long the order stays open.',sign_in:'Sign in to withdraw orders.',not_cancellable:'That order is no longer open.',try_again:'The network is slow right now. Your order was not placed; try again.',request_failed:'The order service could not complete the request. Try again shortly.',order_amount_required:'Enter an amount greater than zero.',order_amount_format:'Enter a valid amount using the token’s decimal places.',order_price_required:'Enter a limit price or choose a percentage below.',order_price_format:'Enter a valid limit price greater than zero.',order_expiry:'Choose how long the order stays open.',order_balance_refresh:'Your token balance could not refresh. Try again before approving.',order_reservations_refresh:'Your open orders could not refresh. Try again before signing this order.'};
const normalized=new WeakSet();
export function asOrderError(error){
 if(error&&typeof error==='object'&&normalized.has(error))return error;
 const mapped=asTradeError(error); // Logs the original cause only with __qhooksDev or on localhost.
 const known=[error?.code,error?.message].map(k=>Object.hasOwn(notes,k)?notes[k]:null).find(Boolean);
 if(error?.placed?.length&&typeof error.message==='string')mapped.message=error.message;
 else if(known)mapped.message=known+(error?.status?' (HTTP '+error.status+')':'');
 else if(mapped.message===generic){
  const causes=[],seen=new Set();for(let e=error;e&&typeof e==='object'&&!seen.has(e)&&causes.length<12;e=e.cause||e.error||e.data?.originalError){seen.add(e);causes.push(e);}
  const reason=[...causes.flatMap(e=>[e.shortMessage,e.reason,e.message]),typeof error==='string'?error:null].find(v=>typeof v==='string'&&v.trim()&&v!==generic);
  mapped.message=reason?reason.replace(/[\u0000-\u001f\u007f]+/g,' ').trim().slice(0,300):'The order request failed without a reason. Check wallet activity before retrying.';
 }
 // These existing recovery contracts must survive error normalization.
 for(const key of ['recovery','placed','retryable','status','pending'])if(error?.[key]!==undefined)mapped[key]=error[key];
 normalized.add(mapped);return mapped;
}
export const orderErrorText=error=>asOrderError(error).message;
