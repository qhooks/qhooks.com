import{LIVE}from'./chains.mjs';
import{STOCK_PAIRS}from'./full-launch/packages/multichain-launch/stock-pairs.mjs';
// Exact identities only. The issuer/primary registry references are recorded in the G3 handoff.
const btc=[
 {chainId:'56',address:'0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c',symbol:'BTCB',name:'Binance Pegged Bitcoin'},
 ...['8453','1','42161'].map(chainId=>({chainId,address:'0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',symbol:'cbBTC',name:'Coinbase Wrapped Bitcoin'})),
 {chainId:'solana',address:'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',symbol:'cbBTC',name:'Coinbase Wrapped Bitcoin'},
];
// Coinbase-wrapped assets and wrapped SOL on Base (symbol/name read on chain 2026-11-18, Base mainnet).
const wrapped=[
 ['0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22','cbETH','Coinbase Wrapped Staked ETH'],
 ['0xcb585250f852c6c6bf90434ab21a00f02833a4af','cbXRP','Coinbase Wrapped XRP'],
 ['0xcb17c9db87b595717c857a08468793f5bab6445f','cbLTC','Coinbase Wrapped LTC'],
 ['0xb2000000000000000000008501b13360000cb2ec','cbZEC','Coinbase Wrapped ZEC'],
 ['0x311935cd80b76769bf2ecc9d8ab7635b2139cf82','SOL','Solana (wrapped on Base)'],
].map(([address,symbol,name])=>({chainId:'8453',address,symbol,name}));
const native=LIVE.filter(c=>/^0x[\da-f]{40}$/i.test(c.wrappedNative||'')).map(c=>({chainId:String(c.id),address:c.wrappedNative.toLowerCase(),symbol:'W'+c.native,name:'Wrapped '+c.native}));
export const MAJOR_ASSETS=Object.freeze([...btc,...wrapped,...native].map(Object.freeze));
export function majorAsset(chainId,address){const chain=String(chainId),key=chain==='solana'?String(address||''):String(address||'').toLowerCase();return MAJOR_ASSETS.find(a=>a.chainId===chain&&a.address===key)||null;}
export function majorAssetLink(asset){return '/terminal#t='+asset.chainId+':'+asset.address;}

// Discovery-only classes (never used for trading, pairing or launch validation; stockPair() stays the exact
// Robinhood launch registry). A row leaves meme discovery when it is:
//  - an exact major above;
//  - a Coinbase-wrapped asset: symbol cb + ticker AND name "Coinbase Wrapped …";
//  - a tokenized stock: a listed US ticker plus the issuer suffix c (Coinbase, GOOGLc) or x (xStocks, NVDAx),
//    e.g. GOOGLc/NVDAc/TSLAx (two letters or more). The ticker list is the Robinhood stock registry's, so meme tickers are not caught.
export const STOCK_TICKERS=Object.freeze(new Set(Object.values(STOCK_PAIRS).flatMap(c=>c.tokens.map(([,symbol])=>symbol)).concat(['GOOG','BRK.B','BRKB','JPM','MA','WMT','XOM','HOOD','UNH','KO','PEP','DIS','NKE','ARM','SMCI','ASML','ADBE','CRM','PYPL','SQ','UBER','ABNB','CRWD','PANW','MCD','SBUX','VZ','CVX','BAC','GS','MS','WFC','TLT','IWM','DIA','VOO','VTI'])));
const clean=v=>typeof v==='string'?v.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,'').trim():'';
export function coinbaseWrapped(token={}){const symbol=clean(token.symbol),name=clean(token.name);return /^cb[A-Z0-9]{2,8}$/.test(symbol)&&/^coinbase wrapped\b/i.test(name);}
export function tokenizedStock(token={}){const m=clean(token.symbol).match(/^([A-Z][A-Z.]{1,5})(c|x)$/);return !!m&&STOCK_TICKERS.has(m[1]);}
/** 'major' | 'wrapped' | 'stock' | null for a feed row. Pure. */
export function discoveryAssetClass(row){
 if(!row?.token?.address)return null;
 if(majorAsset(row.chainId,row.token.address))return 'major';
 if(coinbaseWrapped(row.token))return 'wrapped';
 if(tokenizedStock(row.token))return 'stock';
 return null;
}
export const discoveryExcludedAsset=row=>discoveryAssetClass(row)!==null;
