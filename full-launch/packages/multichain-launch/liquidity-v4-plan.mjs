// v4 integration boundary. Retains the preliminary math module unchanged.
// Pool.tickSpacingToMaxLiquidityPerTick floors the negative tick quotient,
// unlike TickMath.minUsableTick's truncation. Thus spacing60 counts29576 ticks.
import {planLaunchLiquidity,launchRange} from './liquidity-plan.mjs';
export const v4LaunchRange=Object.freeze({...launchRange,maxLiquidity:((2n**128n-1n)/29576n).toString()});
export function planV4LaunchLiquidity(input){
 const plan=planLaunchLiquidity(input);
 if(BigInt(plan.position.liquidity)>BigInt(v4LaunchRange.maxLiquidity))throw new TypeError('Funding exceeds actual Uniswap v4 per-tick liquidity limit');
 return plan;
}
