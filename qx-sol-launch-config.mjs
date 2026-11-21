import {QHOOKS_SOL_TREASURY,solTreasuryReady} from './qx-sol-treasury.mjs';
// One public policy for every QHooks Solana coin. Amounts in SOL unless labelled otherwise.
export const SOL_LAUNCH_CONFIG = Object.freeze({
 sdkVersion: '2.0.0', // Exact installed DBC SDK version; see vendor/dbc/package-lock.json.
 programId: 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN', // SDK constants.ts DBC program.
 dammV2ProgramId: 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', // SDK constants.ts DAMM v2 program.
 treasury: QHOOKS_SOL_TREASURY, // Fee claimer and leftover receiver.
 quoteMint: 'So11111111111111111111111111111111111111112', // Wrapped native SOL.
 tokenType: 0, // TokenType.SPLToken; no Token-2022 extensions.
 tokenDecimals: 6, // Fixed base token precision.
 quoteDecimals: 9, // Native SOL precision.
 totalSupply: 1_000_000_000, // Fixed pre- and post-migration supply, no mint authority.
 tokenUpdateAuthority: 1, // TokenAuthorityOption.Immutable; no freeze authority.
 leftover: 0, // No reserved or allocated tokens.
 initialMarketCap: 26.5625, // SOL; sqrt(initial / migration) = 1/4 gives 80% curve sales.
 migrationMarketCap: 425, // SOL; 20% of supply seeds the final-price pool.
 migrationQuoteThreshold: 85, // SOL reserves required to graduate; fees excluded.
 migrationQuoteThresholdLamports: '85000000000', // Exact on-chain threshold.
 activationType: 1, // ActivationType.Timestamp, measured from pool activation.
 startingFeeBps: 5000, // 50% at activation, including a creator's first buy.
 steadyFeeBps: 120, // 1.2% total trading fee before Meteora's cut.
 schedulerPeriods: 60, // Finest timestamp granularity: sixty one-second steps.
 schedulerSeconds: 60, // FeeSchedulerLinear; numerator floors its reduction per step.
 schedulerMode: 0, // BaseFeeMode.FeeSchedulerLinear.
 feeDenominator: 1_000_000_000, // SDK fee numerator denominator.
 creatorTradingFeePercentage: 83, // SDK u8 percentage; nearest whole percent to 83 1/3%.
 protocolFeePercentage: 20, // SDK PROTOCOL_FEE_PERCENT, taken before creator/partner split.
 collectFeeMode: 0, // CollectFeeMode.QuoteToken: fees and rewards in SOL on both directions.
 dynamicFeeEnabled: false, // No volatility surcharge above the scheduler.
 enableFirstSwapWithMinFee: false, // First buys pay the anti-snipe schedule too.
 migrationOption: 1, // MigrationOption.MET_DAMM_V2.
 migrationFeeOption: 6, // MigrationFeeOption.Customizable supports the steady 120 bps.
 migrationFeePercentage: 0, // No optional partner/creator migration charge.
 creatorMigrationFeePercentage: 0, // No optional creator migration charge.
 protocolLiquidityMigrationFeeBps: 20, // SDK's separate 0.2% liquidity migration charge.
 migratedDynamicFee: 0, // DAMM v2 dynamic fee disabled.
 partnerPermanentLockedLiquidityPercentage: 17, // Partner fee-bearing liquidity, locked forever.
 creatorPermanentLockedLiquidityPercentage: 83, // Creator fee-bearing liquidity, locked forever.
 partnerLiquidityPercentage: 0, // No withdrawable partner LP.
 creatorLiquidityPercentage: 0, // No withdrawable creator LP.
 vestingAmount: 0, // No team supply, cliff, allocation or vesting schedule.
 poolCreationFee: 0, // DBC optional creation charge disabled; flat transfer below is separate.
 flatLaunchUsd: 0.45, // Converted with the existing fresh native USD price route.
 cashbackPercentage: 30, // Share of QHooks partner fee credited to the trader.
 referralPercentage: 20, // Share of QHooks partner fee credited to an enrolled referrer.
});
// solcfg2 (2026-11-21, Randall: "Yep have it built"): fee policies by version. SOL_LAUNCH_CONFIG above stays policy 1,
// the config AFBWu… that every existing coin trades on. Policy 2 changes only the anti-snipe schedule and the creator's
// bundled first buy; supply, curve, graduation, fee split and claimer are identical, so both curves are the same.
// Meteora limits (SDK 2.0.0 helpers/feeParams.ts + validation.ts, program fee_scheduler.rs): timestamp activation counts
// whole seconds; periodFrequency = floor(totalDuration / numberOfPeriod) >= 1 s; numberOfPeriod 1..65535; every fee
// numerator within [MIN_FEE_NUMERATOR 0.25%, MAX_FEE_NUMERATOR 99%]. So the finest fade is one step per second:
// 15 one-second steps from 50% to 1.2%, the EVM 50%-over-15 s. The first-swap discount applies only to a swap bundled
// at top level in the pool-initialize transaction, without CPI and without a referral account (program
// validate_contain_initialize_pool_ix_and_no_cpi); it pays the minimum base fee (1.2%).
export const SOL_LAUNCH_POLICIES = Object.freeze({
 1: SOL_LAUNCH_CONFIG,
 2: Object.freeze({...SOL_LAUNCH_CONFIG, policy: 2, schedulerPeriods: 15, schedulerSeconds: 15, enableFirstSwapWithMinFee: true}),
});
export const SOL_LAUNCH_POLICY_NEXT = 2; // The policy the setup page offers next; switching needs Randall's signature.
export function solPolicy(version = 1) { const p = SOL_LAUNCH_POLICIES[Number(version) || 1]; if (!p) throw Error('unknown_sol_policy'); return p; }
// Browser display state: launch pages set it from /api/sol-launch/config (policyVersion); defaults to the live policy 1.
let activeVersion = 1;
export function setSolActivePolicy(version) { activeVersion = SOL_LAUNCH_POLICIES[Number(version)] ? Number(version) : 1; return solPolicy(activeVersion); }
export const solActivePolicy = () => solPolicy(activeVersion);
export function solLaunchFeeLamports(price) {
 if (!(Number.isFinite(price) && price > 0)) throw Error('Refreshing the SOL price. Refresh before launching.');
 const amount=Math.ceil(SOL_LAUNCH_CONFIG.flatLaunchUsd / price * 1e9);if(!Number.isSafeInteger(amount)||amount<=0)throw Error('SOL price is outside the supported range.');return BigInt(amount);
}
export function solScheduledFeeNumerator(seconds, c = SOL_LAUNCH_CONFIG) {
 const period=Math.min(c.schedulerPeriods,Math.max(0,Math.floor(seconds)));
 return BigInt(c.startingFeeBps)*100000n-BigInt(period)*(BigInt(c.startingFeeBps-c.steadyFeeBps)*100000n/BigInt(c.schedulerPeriods));
}
export function solLaunchReview(c = SOL_LAUNCH_CONFIG) {
 const fee=Number(solScheduledFeeNumerator(c.schedulerSeconds, c))/1e7;
 return {steadyFeePercent:fee,meteoraPercent:fee*c.protocolFeePercentage/100,creatorPercent:fee*(100-c.protocolFeePercentage)*c.creatorTradingFeePercentage/10000,partnerPercent:fee*(100-c.protocolFeePercentage)*(100-c.creatorTradingFeePercentage)/10000};
}

export const solLaunchConfigReady = config => solTreasuryReady() && config?.ready===true;
