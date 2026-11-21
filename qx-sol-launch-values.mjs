import {requireLaunchTicker} from './qx-launch-ticker.mjs';
import {SOL_LAUNCH_CONFIG as C,solLaunchReview,solActivePolicy} from './qx-sol-launch-config.mjs';
import {normalizeTokenProfile} from './qx-token-profile-core.mjs';
import {solWallet} from './qx-solana-identity.mjs';
import {normalizeTeamBuy,teamMeta} from './qx-team-buy-core.mjs';
export function normalizeSolMetadata(value){
 if(!value||!solWallet(value.mint))throw Error('invalid_mint');
 const name=typeof value.name==='string'?value.name.trim():'',symbol=typeof value.symbol==='string'?value.symbol.toUpperCase():'';
 if(!name||/[\p{C}<>]/u.test(name)||new TextEncoder().encode(name).length>32)throw Error('Use a name of 1–32 UTF-8 bytes, without angle brackets.');
 requireLaunchTicker(symbol);
 const p=normalizeTokenProfile(value);if(!p.image)throw Error('Add a token image.');if(!p.banner)throw Error('Add a banner for your token.');
 // Team buy: a disclosed team list is published in the token metadata (planned shares of the creator's first buy).
 const team=teamMeta(normalizeTeamBuy(value.teamBuy,{chain:'solana'}));
 return {mint:value.mint,name,symbol,description:p.description,image:p.image,banner:p.banner,links:p.links,...(team?{teamBuy:team}:{})};
}
export function solAmount(value){if(!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,9})?$/.test(String(value)))throw Error('Enter SOL with up to 9 decimal places.');const[w,f='']=String(value).split('.');return BigInt(w)*1000000000n+BigInt(f.padEnd(9,'0'));}
export const solText=value=>{const n=BigInt(value);return ((n/1000000000n)+'.'+(n%1000000000n).toString().padStart(9,'0').replace(/0+$/,'')).replace(/\.$/,'');};
// solcfg2: the rules of the config new launches use (policy from /api/sol-launch/config; policy 1 until it switches).
export function solFirstBuyNote(p=solActivePolicy()){const f=solLaunchReview(p);return p.enableFirstSwapWithMinFee?'Included in the launch transaction at the '+Number(f.steadyFeePercent.toFixed(2))+'% base fee, before anyone else can buy; 1% price tolerance. Leave 0 to launch without buying.':'Included in the launch transaction. The opening '+Number((p.startingFeeBps/100).toFixed(2))+'% anti-snipe fee applies; 1% price tolerance. Leave 0 to launch without buying.';}
export function solReviewLines(p=solActivePolicy()){const C=p,f=solLaunchReview(p);const pct=n=>Number(n.toFixed(2))+'%';return [
 ['Supply',C.totalSupply.toLocaleString('en-US')+' · '+C.tokenDecimals+' decimals · SPL'],
 ['Token authority','Mint authority revoked · No freeze authority · Metadata immutable'],
 ['Allocations','None · No team reserve · No vesting'],
 ['Anti-snipe','Starts at '+pct(C.startingFeeBps/100)+' and falls to '+pct(f.steadyFeePercent)+' over the first '+C.schedulerSeconds+' seconds. '+(C.enableFirstSwapWithMinFee?'Your own first buy at launch pays only '+pct(f.steadyFeePercent)+'.':'Your own first buy pays it too.')],
 ['Trading fee',pct(f.steadyFeePercent)+' per trade.'],
 ['Split','You '+pct(f.creatorPercent)+' · QHooks '+pct(f.partnerPercent)+' · Meteora '+pct(f.meteoraPercent)+' of each trade.'],
 ['Graduation','At '+C.migrationQuoteThreshold+' SOL the coin moves to a Meteora DAMM v2 pool at the curve’s last price.'],
 ['Liquidity','Locked forever. Nobody can withdraw it.'],
 ['Rewards','Traders get '+C.cashbackPercentage+'% of the QHooks share back; referrers get '+C.referralPercentage+'%.'],
 ];}
