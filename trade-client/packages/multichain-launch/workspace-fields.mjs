import {startSelection,optionalQuoteRaw} from '../../../qx-guided-start-core.mjs';
// Strict public launch configuration. Amounts are human units except totalSupply.
import {normalizeLaunchFields} from './launch-fields.mjs';
import {parseDecimalAmount} from '../crosschain/decimal-amount.mjs';
import {ensure,shape,freeze} from '../token-launch/artifact.mjs';
const names=['tokenName','symbol','decimals','totalSupply','notice','lpFeePpm','tokenAmount','quoteAmount','graduationMode','threshold','destinationFeePpm'];
function decimal(s,max){ensure(typeof s==='string'&&s.length>0&&s.length<=78&&!/[^0-9]/.test(s)&&BigInt(s).toString()===s&&BigInt(s)<=max,'Canonical bounded integer required');return BigInt(s);}
function amount(s,decimals){ensure(typeof s==='string'&&s.length>0&&s.length<=100&&!/[^0-9.]/.test(s),'Plain decimal amount required');return BigInt(parseDecimalAmount(s,decimals));}
export function normalizeWorkspaceFields(input,quoteDecimals){
 const hasSelection=input&&Object.hasOwn(input,'startTier');
 const accepted=[...names,...(hasSelection?['startTier','startSteps']:[]),...(input&&Object.hasOwn(input,'startUsd')?['startUsd']:[])];
 ensure(shape(input,accepted),'Exact public launch fields required');ensure(Number.isInteger(quoteDecimals)&&quoteDecimals>=0&&quoteDecimals<=18,'Quote units required');
 ensure(!Object.hasOwn(input,'startUsd')||hasSelection,'A custom cap needs its start selection');
 const selection=hasSelection?startSelection(input.startTier,input.startSteps,input.startUsd):null;
 const fixed=normalizeLaunchFields(Object.fromEntries(names.slice(0,6).map(k=>[k,input[k]])));
 for(const k of ['decimals','totalSupply','notice','lpFeePpm'])ensure(fixed[k]===input[k]&&decimal(input[k],(1n<<256n)-1n)>=0n,'Canonical launch settings required');
 ensure(['0','1','2'].includes(input.graduationMode),'Select threshold, manual or stay graduation');
 const token=amount(input.tokenAmount,Number(fixed.decimals)),quote=BigInt(optionalQuoteRaw(input.quoteAmount,quoteDecimals)),threshold=input.threshold==='0'?0n:amount(input.threshold,quoteDecimals),fee=decimal(input.destinationFeePpm,100000n);
 ensure(token>0n&&token<=BigInt(fixed.totalSupply)&&quote>=0n&&fee>0n,'Nonzero liquidity within total supply and valid destination fee required');
 ensure(input.graduationMode==='0'?threshold>0n:threshold===0n,'Only threshold graduation uses a positive quote target');
 return freeze({...fixed,tokenAmount:input.tokenAmount,quoteAmount:input.quoteAmount,graduationMode:input.graduationMode,threshold:input.threshold,destinationFeePpm:input.destinationFeePpm,...(selection||{})});
}
export const workspaceTokenFields=f=>freeze(Object.fromEntries(['tokenName','symbol','decimals','totalSupply'].map(k=>[k,f[k]])));
