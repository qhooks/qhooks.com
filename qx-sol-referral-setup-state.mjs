import {SOL_MINT,USDC_MINT} from './qx-sol-referral-policy.mjs';
import {QHOOKS_SOL_TREASURY} from './qx-sol-treasury.mjs';
export function solReferralSetupState(referral,owner,{busy=false,pending=false}={}){
 const missing=(referral?.missingFeeMints||[]).filter(m=>[SOL_MINT,USDC_MINT].includes(m)),show=referral?.ready===true&&referral.feeAccountsReady===false&&missing.length>0;
 return {showFeeStep:show,canCreateFees:show&&owner===QHOOKS_SOL_TREASURY&&!busy&&!pending,done:referral?.ready===true&&referral.feeAccountsReady===true,missing};
}
