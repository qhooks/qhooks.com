// Shared display/execution constant. Keep integer truncation identical to QFeeRouter quotes.
export const FEE_BPS = 100n;
export const feePercent = () => Number(FEE_BPS) / 100;
export const tradeFee = amount => BigInt(amount) * FEE_BPS / 10000n;
export const cashbackShare = (fee, holder = false) => BigInt(fee) * (holder ? 40n : 30n) / 100n;
