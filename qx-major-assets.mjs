import{LIVE}from'./chains.mjs';
// Exact identities only. The issuer/primary registry references are recorded in the G3 handoff.
const btc=[
 {chainId:'56',address:'0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c',symbol:'BTCB',name:'Binance Pegged Bitcoin'},
 ...['8453','1','42161'].map(chainId=>({chainId,address:'0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',symbol:'cbBTC',name:'Coinbase Wrapped Bitcoin'})),
 {chainId:'solana',address:'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',symbol:'cbBTC',name:'Coinbase Wrapped Bitcoin'},
];
const native=LIVE.filter(c=>/^0x[\da-f]{40}$/i.test(c.wrappedNative||'')).map(c=>({chainId:String(c.id),address:c.wrappedNative.toLowerCase(),symbol:'W'+c.native,name:'Wrapped '+c.native}));
export const MAJOR_ASSETS=Object.freeze([...btc,...native].map(Object.freeze));
export function majorAsset(chainId,address){const chain=String(chainId),key=chain==='solana'?String(address||''):String(address||'').toLowerCase();return MAJOR_ASSETS.find(a=>a.chainId===chain&&a.address===key)||null;}
export function majorAssetLink(asset){return '/terminal#t='+asset.chainId+':'+asset.address;}
