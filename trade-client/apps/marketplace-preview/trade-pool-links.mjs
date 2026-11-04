// Public pool discovery only. Every transaction still crosses fixed onchain admission.
import {readSwapPoolPackage} from '../../packages/multichain-swap/pool-package.mjs';
export const TRADE_POOLS_KEY='qhooks:trade-pools:v1';
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
export const poolIdentity=p=>p.chainId+':'+p.controller;
export function tradePoolLink(text){const p=readSwapPoolPackage(text);return '/trade.html#pool='+encodeURIComponent(JSON.stringify(p));}
export function readTradePoolLink(hash){
 ensure(typeof hash==='string'&&hash.length<=60000&&hash.startsWith('#pool=')&&!hash.includes('&'),'A single public pool link is required');
 const value=hash.slice(6);ensure(value.length>0,'Pool link is empty');
 return readSwapPoolPackage(decodeURIComponent(value));
}
export function readRecentPools(storage){
 const text=storage.getItem(TRADE_POOLS_KEY);if(text===null)return Object.freeze([]);
 ensure(typeof text==='string'&&text.length<=640000,'Saved pool list is too large');const rows=JSON.parse(text);
 ensure(Array.isArray(rows)&&rows.length<=32,'Bounded saved pool list required');
 const pools=rows.map(row=>readSwapPoolPackage(JSON.stringify(row)));
 ensure(new Set(pools.map(poolIdentity)).size===pools.length,'Duplicate saved pool identity');return Object.freeze(pools);
}
export function rememberTradePool(storage,text){
 const pool=readSwapPoolPackage(text),rows=readRecentPools(storage),identity=poolIdentity(pool),prior=rows.find(p=>poolIdentity(p)===identity);
 ensure(!prior||JSON.stringify(prior)===JSON.stringify(pool),'Saved pool identity has different configuration');
 const next=[pool,...rows.filter(p=>poolIdentity(p)!==identity)];ensure(next.length<=32,'Saved pool list is full; the shareable link still works');
 const value=JSON.stringify(next);storage.setItem(TRADE_POOLS_KEY,value);ensure(storage.getItem(TRADE_POOLS_KEY)===value,'Public pool details did not persist');return pool;
}
