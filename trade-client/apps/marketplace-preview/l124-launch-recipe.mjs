// Public recipe data only. Existing launch validation remains authoritative.
import {normalizeWorkspaceFields} from '../../packages/multichain-launch/workspace-fields.mjs';
const rows=[
 ['8453','Base','USDC',6,'ETH'],['4663','Robinhood Chain','WETH',18,'ETH'],
 ['1','Ethereum','USDC',6,'ETH'],['42161','Arbitrum One','USDC',6,'ETH'],
 ['56','BNB Chain','WBNB',18,'BNB'],['5042','Arc','USDC',6,'USDC']
];
export const recipeChains=Object.freeze(rows.map(([id,name,quoteSymbol,quoteDecimals,nativeSymbol])=>Object.freeze({id,name,quoteSymbol,quoteDecimals,nativeSymbol})));
export const recipeLimit=8192;
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
export function recipeChain(id){ensure(typeof id==='string','Select a chain');const chain=recipeChains.find(c=>c.id===id);ensure(chain,'Unsupported recipe chain');return chain;}
export function exactRecipeData(input,keys){
 ensure(input!==null&&typeof input==='object'&&Object.getPrototypeOf(input)===Object.prototype,'Expected plain public recipe data');
 const descriptors=Object.getOwnPropertyDescriptors(input),own=Reflect.ownKeys(descriptors);
 ensure(own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k)),'Unexpected recipe fields');
 for(const key of keys)ensure(descriptors[key]?.enumerable&&Object.hasOwn(descriptors[key],'value'),'Recipe data properties required');
 return Object.fromEntries(keys.map(k=>[k,descriptors[k].value]));
}
export function createLaunchRecipe(chainId,input){
 const chain=recipeChain(chainId),fields=normalizeWorkspaceFields(input,chain.quoteDecimals);
 ensure(['6','18'].includes(fields.decimals),'The launch workspace supports 6 or 18 token decimals');
 ensure(['3600','86400','604800'].includes(fields.notice),'Choose a one-hour, one-day or seven-day notice');
 return Object.freeze({schemaVersion:1,kind:'qhooks-qgraduation-launch-recipe',chainId,fields});
}
export function normalizeLaunchRecipe(input){
 const d=exactRecipeData(input,['schemaVersion','kind','chainId','fields']);
 ensure(d.schemaVersion===1&&d.kind==='qhooks-qgraduation-launch-recipe','Unsupported launch recipe format');
 return createLaunchRecipe(d.chainId,d.fields);
}
export function readLaunchRecipe(text){
 ensure(typeof text==='string'&&text.length>0&&text.length<=recipeLimit,'Choose a public recipe JSON file up to 8192 characters');
 let input;try{input=JSON.parse(text);}catch{throw new TypeError('Invalid public recipe JSON. Choose a Lab recipe, not a key backup.');}
 return normalizeLaunchRecipe(input);
}
export function writeLaunchRecipe(recipe){return JSON.stringify(normalizeLaunchRecipe(recipe),null,2)+'\n';}
