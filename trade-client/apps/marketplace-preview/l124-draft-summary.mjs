import {normalizeLaunchRecipe,recipeChain,exactRecipeData} from './l124-launch-recipe.mjs';
export function formatRecipeUnits(raw,decimals){
 if(typeof raw!=='string'||raw.length>78||!/^(0|[1-9][0-9]*)$/.test(raw)||!Number.isInteger(decimals)||decimals<0||decimals>18)throw new TypeError('Canonical bounded units required');
 if(BigInt(raw)>(1n<<256n)-1n)throw new TypeError('Amount exceeds uint256');
 if(!decimals)return raw;
 const padded=raw.padStart(decimals+1,'0'),fraction=padded.slice(-decimals).replace(/0+$/,'');
 return padded.slice(0,-decimals)+(fraction?'.'+fraction:'');
}
export function launchDraftSummary(draft,chain){
 const normalized=normalizeLaunchRecipe(draft),expected=recipeChain(normalized.chainId);
 const checked=exactRecipeData(chain,['id','name','quoteSymbol','quoteDecimals','nativeSymbol']);
 for(const k of Object.keys(expected))if(checked[k]!==expected[k])throw new TypeError('Chain metadata mismatch');
 const fields=normalized.fields;
 let graduationText;
 switch(fields.graduationMode){
  case '0':graduationText='Net quote-inflow target: '+fields.threshold+' '+chain.quoteSymbol;break;
  case '1':graduationText='Owner-approved graduation';break;
  case '2':graduationText='Keep source pool';break;
 }
 return Object.freeze([
  {label:'Chain',value:chain.name},
  {label:'Token',value:fields.tokenName+' ('+fields.symbol+')'},
  {label:'Supply',value:formatRecipeUnits(fields.totalSupply,Number(fields.decimals))},
  {label:'Initial liquidity',value:fields.tokenAmount+' '+fields.symbol+' + '+fields.quoteAmount+' '+chain.quoteSymbol},
  {label:'Graduation',value:graduationText},
  {label:'Policy notice',value:fields.notice+' seconds'},
  {label:'Creator LP fee',value:formatRecipeUnits(fields.lpFeePpm,4)+'%'},
  {label:'Destination LP fee',value:formatRecipeUnits(fields.destinationFeePpm,4)+'%'}
 ].map(Object.freeze));
}
