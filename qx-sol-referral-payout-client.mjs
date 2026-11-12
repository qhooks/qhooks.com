import {solAddress} from './qx-solana.mjs';
import {prepareSolTransaction,sendPreparedSol} from './qx-sol-launch-client.mjs';
import {requirePayoutReview} from './qx-sol-referral-payout-core.mjs';

export async function sendReferralPayout(batch,{runtime,onStatus=()=>{}}={}){
 requirePayoutReview(batch,solAddress());
 const tx=runtime.Transaction.from(Uint8Array.from(atob(batch.transaction),c=>c.charCodeAt(0)));
 // Keep the exact preview's blockhash and instructions through local simulation.
 // The treasury is the sole signer; the shared helper uses wallet sign-and-send.
 const prepared=await prepareSolTransaction(runtime,tx,[],solAddress(),{fixedLast:batch.last});
 requirePayoutReview(batch,solAddress());
 if(prepared.serialized!==batch.transaction)throw Error('The payout changed. Refresh the preview before signing.');
 onStatus('Simulation passed. Approve the exact payout in your wallet.');
 return sendPreparedSol(runtime,prepared);
}
