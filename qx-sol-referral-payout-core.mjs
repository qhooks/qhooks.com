import {QHOOKS_SOL_TREASURY} from './qx-sol-treasury.mjs';
export function requirePayoutWallet(owner){if(owner!==QHOOKS_SOL_TREASURY)throw Error('Connect the QHooks treasury wallet.');}
export function requirePayoutReview(batch,owner,now=Date.now()){
 requirePayoutWallet(owner);
 if(!batch?.batchId||!batch.items?.length||batch.treasury!==owner||batch.expired||batch.expiresAt<=now||batch.simulated!==true||batch.packetBytes>1232)throw Error('Refresh the payout preview before signing.');
 return batch;
}
export function payoutAmount(raw,mint){const decimals=mint==='So11111111111111111111111111111111111111112'?9:6,n=BigInt(raw),unit=10n**BigInt(decimals);return String(n/unit)+'.'+String(n%unit).padStart(decimals,'0');}

export function solDiscountCopy(feeBps){if(![60,70].includes(Number(feeBps)))throw Error('Refreshing the fee. Refresh the quote.');return Number(feeBps)===60?'Fee 0.60% · 40% back, instantly':'Fee 0.70% · 30% back, instantly';}
export const solOrderFeeCopy=order=>order.platformFee===true?solDiscountCopy(order.feeBps):'Jupiter route · Fee shown in your wallet';
