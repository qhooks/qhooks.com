import {solWallet} from './qx-solana-identity.mjs';

export const QHOOKS_SOL_TREASURY = 'Coqq8o1uYxrAFggNtLCcUcGZWDUF3aUPkaFEMezCMwHh';
export const LOST_SOL_WALLETS = Object.freeze(['CEACkaNKdHVupnaiEMLGppw8RthjCdoMj8kdxJeg3MfV']);
export const LOST_SOL_REFERRALS = Object.freeze(['CAhs68qUBmRVg4i8kh6L6VzDqAWsMtNrE8acoTo3K3Vd']);
export const SOL_TREASURY_WAIT = 'Waiting for the new QHooks treasury wallet.';
export const validSolTreasury = value => !!solWallet(value) && !LOST_SOL_WALLETS.includes(value);
export const solTreasuryReady = () => validSolTreasury(QHOOKS_SOL_TREASURY);
export function requireSolTreasury(){if(!solTreasuryReady())throw Error(SOL_TREASURY_WAIT);}
