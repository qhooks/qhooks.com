import {SOL_LAUNCH_CONFIG as C,solLaunchReview} from './qx-sol-launch-config.mjs';
import {normalizeTokenProfile} from './qx-token-profile-core.mjs';
import {solWallet} from './qx-solana-identity.mjs';
export function normalizeSolMetadata(value){
 if(!value||!solWallet(value.mint))throw Error('invalid_mint');
 const name=typeof value.name==='string'?value.name.trim():'',symbol=typeof value.symbol==='string'?value.symbol.trim().toUpperCase():'';
 if(!name||/[\p{C}<>]/u.test(name)||new TextEncoder().encode(name).length>32)throw Error('Use a name of 1–32 UTF-8 bytes, without angle brackets.');
 if(!/^[A-Z0-9]{1,10}$/.test(symbol))throw Error('Use 1–10 letters or digits for the ticker.');
 const p=normalizeTokenProfile(value);if(!p.image)throw Error('Add a token image.');if(!p.banner)throw Error('Add a banner for your token.');
 return {mint:value.mint,name,symbol,description:p.description,image:p.image,banner:p.banner,links:p.links};
}
export function solAmount(value){if(!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,9})?$/.test(String(value)))throw Error('Enter SOL with up to 9 decimal places.');const[w,f='']=String(value).split('.');return BigInt(w)*1000000000n+BigInt(f.padEnd(9,'0'));}
export const solText=value=>{const n=BigInt(value);return ((n/1000000000n)+'.'+(n%1000000000n).toString().padStart(9,'0').replace(/0+$/,'')).replace(/\.$/,'');};
export function solReviewLines(){const f=solLaunchReview();const pct=n=>Number(n.toFixed(2))+'%';return [
 ['Supply',C.totalSupply.toLocaleString('en-US')+' · '+C.tokenDecimals+' decimals · SPL'],
 ['Token authority','Mint authority revoked · No freeze authority · Metadata immutable'],
 ['Allocations','None · No team reserve · No vesting'],
 ['Anti-snipe','Starts at '+pct(C.startingFeeBps/100)+' and falls to '+pct(f.steadyFeePercent)+' over the first '+C.schedulerSeconds+' seconds. Your own first buy pays it too.'],
 ['Trading fee',pct(f.steadyFeePercent)+' per trade.'],
 ['Split','You '+pct(f.creatorPercent)+' · QHooks '+pct(f.partnerPercent)+' · Meteora '+pct(f.meteoraPercent)+' of each trade.'],
 ['Graduation','At '+C.migrationQuoteThreshold+' SOL the coin moves to a Meteora DAMM v2 pool at the curve’s last price.'],
 ['Liquidity','Locked forever. Nobody can withdraw it.'],
 ['Rewards','Traders get '+C.cashbackPercentage+'% of the QHooks share back; referrers get '+C.referralPercentage+'%.'],
 ];}
