// Seeds and program ID verified against the pinned referral SDK in vendor/referral/source/index.mjs.
import {solWallet} from './qx-solana-identity.mjs';
import {LOST_SOL_REFERRALS,LOST_SOL_WALLETS} from './qx-sol-treasury.mjs';
export const REFERRAL_PROGRAM = 'REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3';
export const REFERRAL_PROJECT = 'DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc';
export const REFERRAL_NAME = 'qhooks';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const SOL_ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const bytes = text => new TextEncoder().encode(text);
export function jupiterReferral(env={}){
 const value=env.QHOOKS_JUP_REFERRAL;
 return solWallet(value)&&!LOST_SOL_REFERRALS.includes(value)&&!LOST_SOL_WALLETS.includes(value)?value:null;
}
export function referralAccountAddress(PublicKey){return PublicKey.findProgramAddressSync([bytes('referral'),new PublicKey(REFERRAL_PROJECT).toBytes(),bytes(REFERRAL_NAME)],new PublicKey(REFERRAL_PROGRAM))[0].toBase58();}
export function referralTokenAddresses(PublicKey,referral){
 // Swap v2 uses initializeReferralTokenAccountV2: the referral's ATA,
 // including allowOwnerOffCurve, under the mint's token program. Both our
 // supported mints are classic SPL Token (SDK 0.3.0 source:1089,1401).
 return Object.fromEntries([SOL_MINT,USDC_MINT].map(mint=>[mint,PublicKey.findProgramAddressSync([new PublicKey(referral).toBytes(),new PublicKey(SOL_TOKEN_PROGRAM).toBytes(),new PublicKey(mint).toBytes()],new PublicKey(SOL_ATA_PROGRAM))[0].toBase58()]));
}
export function legacyReferralTokenAddresses(PublicKey,referral){
 return Object.fromEntries([SOL_MINT,USDC_MINT].map(mint=>[mint,PublicKey.findProgramAddressSync([bytes('referral_ata'),new PublicKey(referral).toBytes(),new PublicKey(mint).toBytes()],new PublicKey(REFERRAL_PROGRAM))[0].toBase58()]));
}
