import {followedWallet,followedAsset} from './qx-followed-wallets-core.mjs';
import {chainById} from './chains.mjs';
export const COPY_REVIEW_SCALE=1000000000;
export function copyUnits(value){if(typeof value!=='string'||!/^\d{1,6}(?:\.\d{1,9})?$/.test(value))return null;const [a,b='']=value.split('.'),n=Number(a)*COPY_REVIEW_SCALE+Number(b.padEnd(9,'0'));return Number.isSafeInteger(n)&&n>0&&n<=1000*COPY_REVIEW_SCALE?n:null;}
export function copyAmount(units){if(!Number.isSafeInteger(units)||units<0)return null;return (BigInt(units)/1000000000n).toString()+(units%COPY_REVIEW_SCALE?'.'+String(units%COPY_REVIEW_SCALE).padStart(9,'0').replace(/0+$/,''):'');}
export function copyUnit(chainId){const c=chainById(String(chainId));return String(chainId)==='solana'?{symbol:'SOL',decimals:9}:c?.status==='live'&&typeof c.native==='string'?{symbol:c.native,decimals:18}:null;}
export function copyProfile(raw){const leader=followedWallet(raw?.leader),chainId=String(raw?.chainId||''),unit=copyUnit(chainId),perTrade=copyUnits(raw?.perTrade),perDay=copyUnits(raw?.perDay),slippageBps=Number(raw?.slippageBps),tpPct=Number(raw?.tpPct),slPct=Number(raw?.slPct);if(!leader||!unit||leader.startsWith('solana:')!==(chainId==='solana')||!perTrade||!perDay||perDay<perTrade||!Number.isInteger(slippageBps)||slippageBps<1||slippageBps>5000||!Number.isInteger(tpPct)||tpPct<0||tpPct>1000||!Number.isInteger(slPct)||slPct<0||slPct>99||typeof raw.on!=='boolean')return null;return {leader,chainId,perTrade,perDay,slippageBps,tpPct,slPct,on:raw.on};}
export function copyReviewContext(raw,now=Date.now()){
 const owner=followedWallet(raw?.owner),leader=followedWallet(raw?.leader),asset=followedAsset(raw?.chainId,raw?.token),unit=copyUnit(raw?.chainId),units=raw?.units;
 if(!owner||!leader||!asset||!unit||owner.startsWith('solana:')!==(asset.chainId==='solana')||!/^cr1_[0-9a-f]{64}$/.test(raw?.id||'')||!Number.isSafeInteger(units)||units<1||units>1000*COPY_REVIEW_SCALE||!Number.isSafeInteger(raw.expiresAt)||raw.expiresAt<=now||!Number.isInteger(raw.slippageBps)||raw.slippageBps<1||raw.slippageBps>5000||!Number.isInteger(raw.tpPct)||raw.tpPct<0||raw.tpPct>1000||!Number.isInteger(raw.slPct)||raw.slPct<0||raw.slPct>99)return null;
 return {...raw,...asset,owner,leader,unit,amount:copyAmount(units),maximum:BigInt(units)*10n**BigInt(unit.decimals-9)};
}
export function copyQuoteAllowed(context,quote,{owner,now=Date.now(),silent=false}={}){if(!context||silent||now>=context.expiresAt)return false;const w=followedWallet(owner);return w===context.owner&&quote?.chainId===context.chainId&&quote.token===context.token&&quote.side==='buy'&&quote.pay==='native'&&!quote.funding&&!quote.home&&!quote.homeRequired&&!quote.payAsset&&typeof quote.a==='bigint'&&quote.a>0n&&quote.a<=context.maximum&&Number.isInteger(quote.toleranceBps)&&quote.toleranceBps>0&&quote.toleranceBps<=context.slippageBps;}
export const copyReviewHref=(wallet,chainId)=>{const w=followedWallet(wallet);return w?'/mirror?'+new URLSearchParams({w,...(copyUnit(chainId)?{chain:String(chainId)}:{})}):null;};

export const COPY_RISK="Copying a wallet can lose money. Their past trades don't predict yours.";
