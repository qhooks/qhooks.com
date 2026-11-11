// Release admission for the new guided Create entrypoint only.
// Existing Expert Studio, launch engine and signing policies are unchanged.
export const CREATE_EXECUTION_ENABLED = true;
// SEV-1 2026-11-11: guided launches price the pool from the starting liquidity (start cap ≈ liquidity), so new guided and
// Studio launches are paused until start pricing is fixed. One-tap launches (fixed start-cap table) stay open; launches
// already underway can still resume.
export const GUIDED_NEW_LAUNCHES = false;
export const START_PRICING_HOLD = 'Launch paused while we fix start pricing. Quick launch above is open.';
export const CREATE_EXECUTION_HOLD = 'Guided launch signing is temporarily unavailable. You can configure and review your settings here, or use Expert Studio.';
