// QHooks JavaScript SDK v1 — https://qhooks.com/sdk/qhooks.mjs
// One ES module, no dependencies, no build step. Works in browsers, Node 18+, Deno, Bun and Workers.
//   import { createClient } from 'https://qhooks.com/sdk/qhooks.mjs';
//   const q = createClient({ rpc: { '8453': 'https://mainnet.base.org' } });
//   const pools = await q.pools({ chain: '8453' });
//   const out = await q.quote({ pool: pools[0], zeroForOne: true, amountIn: 10n ** 6n, trader: '0x0000000000000000000000000000000000000001' });
//   const tx = q.feeRouterSwap({ pool: pools[0], zeroForOne: true, amountIn: 10n ** 6n, minOut: q.withSlippage(out.amountOut, 100) });
// Reads use the public API (https://qhooks.com/api.html) and, for quotes, the chain's own RPC when given.
// The SDK never holds keys or sends transactions: it returns { to, data, value } for your wallet to send.

export const VERSION = '1.2.1';
export const API = 'https://qhooks.com/api/v1';
const Z = '0x0000000000000000000000000000000000000000';
export const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
export const FEE_ROUTER = '0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff';
export const CREATE2_DEPLOYER = '0x4e59b44847b379578588920ca78fbf26c0b4956c';
/// Uniswap v4 per chain: PoolManager, V4Quoter, Universal Router (extended = single-pool params carry an extra word).
export const CHAINS = Object.freeze({
  "8453": {
    "name": "Base",
    "manager": "0x498581ff718922c3f8e6a244956af099b2652b2b",
    "quoter": "0x0d5e0f971ed27fbff6c2837bf31316121532048d",
    "router": "0x6ff5693b99212da76ad316178a184ab56d299b43",
    "feeRouter": "0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff"
  },
  "4663": {
    "name": "Robinhood Chain",
    "manager": "0x8366a39cc670b4001a1121b8f6a443a643e40951",
    "quoter": "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
    "router": "0x06afba43fd06227fa663b0daecf536f6eaa6bf99",
    "extended": true,
    "feeRouter": "0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff"
  },
  "1": {
    "name": "Ethereum",
    "manager": "0x000000000004444c5dc75cb358380d2e3de08a90",
    "quoter": "0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203",
    "router": "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
    "feeRouter": "0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff"
  },
  "42161": {
    "name": "Arbitrum One",
    "manager": "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
    "quoter": "0x3972c00f7ed4885e145823eb7c655375d275a1c5",
    "router": "0x96b2fd2f80e9428daa65d859653117d453981ab4",
    "feeRouter": "0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff"
  },
  "56": {
    "name": "BNB Chain",
    "manager": "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df",
    "quoter": "0x9f75dd27d6664c475b90e105573e550ff69437b0",
    "router": "0x91bf3bfaef8d771a74e1a8fe460b3ee646b2e588",
    "feeRouter": "0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff"
  },
  "99901": {
    "name": "Elysium",
    "manager": "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1",
    "quoter": "0x379f556c5a748bd7cc9baf0f7a344094ac1814f5",
    "router": "0xa13f7611115752deb2b13813bdde16a5073e4b45",
    "feeRouter": "0xff208831ed6f0c4e3e3224effa45fae7906dc6c2"
  },
  "143": {
    "name": "Monad",
    "manager": "0x188d586ddcf52439676ca21a244753fa19f9ea8e",
    "quoter": "0xa222dd357a9076d1091ed6aa2e16c9742dd26891",
    "router": "0xa6ce4f10d83dbddac17e68e1837ca9ce6a1b596e",
    "feeRouter": null
  }
});

// BEGIN bundled noble Keccak-256 (build input: scripts/hash-entry.mjs)
/*
The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
var qhooksKeccak=(()=>{var y=Object.defineProperty;var V=Object.getOwnPropertyDescriptor;var D=Object.getOwnPropertyNames;var Y=Object.prototype.hasOwnProperty;var z=(t,e,n)=>e in t?y(t,e,{enumerable:!0,configurable:!0,writable:!0,value:n}):t[e]=n;var K=(t,e)=>{for(var n in e)y(t,n,{get:e[n],enumerable:!0})},q=(t,e,n,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of D(e))!Y.call(t,i)&&i!==n&&y(t,i,{get:()=>e[i],enumerable:!(r=V(e,i))||r.enumerable});return t};var C=t=>q(y({},"__esModule",{value:!0}),t);var f=(t,e,n)=>z(t,typeof e!="symbol"?e+"":e,n);var xt={};K(xt,{hashHex:()=>ht});var w=BigInt(4294967295),O=BigInt(32);function G(t,e=!1){return e?{h:Number(t&w),l:Number(t>>O&w)}:{h:Number(t>>O&w)|0,l:Number(t&w)|0}}function T(t,e=!1){let n=t.length,r=new Uint32Array(n),i=new Uint32Array(n);for(let o=0;o<n;o++){let{h:s,l:u}=G(t[o],e);[r[o],i[o]]=[s,u]}return[r,i]}function B(t){return t instanceof Uint8Array||ArrayBuffer.isView(t)&&t.constructor.name==="Uint8Array"&&"BYTES_PER_ELEMENT"in t&&t.BYTES_PER_ELEMENT===1}var g=t=>t?`"${t}" `:"";function h(t,e=""){if(typeof t!="number")throw new TypeError(g(e)+"expected number, got "+typeof t);if(!Number.isSafeInteger(t)||t<0)throw new RangeError(g(e)+"expected integer >= 0, got "+t);return t}function U(t,e=""){if(typeof t!="boolean")throw new TypeError(g(e)+"expected boolean, got type="+typeof t);return t}function b(t,e,n=""){if(B(t)&&(e===void 0||t.length===e))return t;e!==void 0&&h(e,"length");let r=B(t),i=e!==void 0?` of length ${e}`:"",o=r?`length=${t.length}`:`type=${typeof t}`,s=g(n)+"expected Uint8Array"+i+", got "+o;throw r?new RangeError(s):new TypeError(s)}var J=(t,e)=>{if(t===null||typeof t!="object"||Array.isArray(t))throw new TypeError((e==="object"?"":`"${e}" `)+"expected object, got type="+typeof t)},I=(t,e)=>{J(t,e);let n=Object.getPrototypeOf(t);if(n!==Object.prototype&&n!==null)throw new TypeError(`"${e}" expected plain object`);if(Object.hasOwn(t,"__proto__"))throw new TypeError(`"${e}.__proto__" is not allowed`)};function m(t,e=!0){if(t.destroyed)throw new Error("hash was destroyed");if(e&&t.finished)throw new Error("digest() was already called")}function H(t,e){b(t,void 0,"output");let n=e.outputLen;if(!(t.length>=n))throw new RangeError('"output" expected length >= '+n)}function A(t){return new Uint32Array(t.buffer,t.byteOffset,Math.floor(t.byteLength/4))}function L(...t){for(let e=0;e<t.length;e++)t[e].fill(0)}var Q=new Uint8Array(new Uint32Array([287454020]).buffer)[0]===68;function W(t){return t<<24&4278190080|t<<8&16711680|t>>>8&65280|t>>>24&255}function Z(t){for(let e=0;e<t.length;e++)t[e]=W(t[e]);return t}var E=Q?t=>t:Z;function S(t,e,n="opts"){return I(t,"defaults"),e!==void 0&&I(e,n),Object.assign(Object.create(null),t,e)}function j(t,e={}){if(typeof t!="function")throw new TypeError('"hashCons" expected function, got type='+typeof t);e=S({},e,"info");let n=(i,o)=>t(o).update(i).digest(),r=t(void 0);return n.outputLen=r.outputLen,n.blockLen=r.blockLen,n.canXOF=r.canXOF,n.create=i=>t(i),Object.assign(n,e),Object.freeze(n)}var v=BigInt(0),d=BigInt(1),tt=BigInt(2),et=BigInt(7),nt=BigInt(256),ot=BigInt(113),F=[],X=[],N=[];for(let t=0,e=d,n=1,r=0;t<24;t++){[n,r]=[r,(2*n+3*r)%5],F.push(2*(5*r+n)),X.push((t+1)*(t+2)/2%64);let i=v;for(let o=0;o<7;o++)e=(e<<d^(e>>et)*ot)%nt,e&tt&&(i^=d<<(d<<BigInt(o))-d);N.push(i)}var P=T(N,!0),rt=P[0],it=P[1],st=(t,e,n)=>t<<n|e>>>32-n,ct=(t,e,n)=>e<<n|t>>>32-n,ft=(t,e,n)=>e<<n-32|t>>>64-n,ut=(t,e,n)=>t<<n-32|e>>>64-n,$=(t,e,n)=>n>32?ft(t,e,n):st(t,e,n),R=(t,e,n)=>n>32?ut(t,e,n):ct(t,e,n),l=new Uint32Array(10);function at(t,e=24){if(!(t instanceof Uint32Array))throw new TypeError('"s" expected Uint32Array(50), got type='+typeof t);if(t.length!==50)throw new RangeError('"s" expected Uint32Array(50), got length='+t.length);if(h(e,"rounds"),e<1||e>24)throw new Error('"rounds" expected integer 1..24');for(let n=24-e;n<24;n++){for(let o=0;o<10;o++)l[o]=t[o]^t[o+10]^t[o+20]^t[o+30]^t[o+40];for(let o=0;o<10;o+=2){let s=(o+8)%10,u=(o+2)%10,a=l[u],c=l[u+1],k=$(a,c,1)^l[s],p=R(a,c,1)^l[s+1];for(let x=0;x<50;x+=10)t[o+x]^=k,t[o+x+1]^=p}let r=t[2],i=t[3];for(let o=0;o<24;o++){let s=X[o],u=$(r,i,s),a=R(r,i,s),c=F[o];r=t[c],i=t[c+1],t[c]=u,t[c+1]=a}for(let o=0;o<50;o+=10){let s=t[o],u=t[o+1],a=t[o+2],c=t[o+3];t[o]^=~t[o+2]&t[o+4],t[o+1]^=~t[o+3]&t[o+5],t[o+2]^=~t[o+4]&t[o+6],t[o+3]^=~t[o+5]&t[o+7],t[o+4]^=~t[o+6]&t[o+8],t[o+5]^=~t[o+7]&t[o+9],t[o+6]^=~t[o+8]&s,t[o+7]^=~t[o+9]&u,t[o+8]^=~s&a,t[o+9]^=~u&c}t[0]^=rt[n],t[1]^=it[n]}L(l)}var _=class t{constructor(e,n,r,i=!1,o=24){f(this,"state");f(this,"pos",0);f(this,"posOut",0);f(this,"finished",!1);f(this,"state32");f(this,"destroyed",!1);f(this,"blockLen");f(this,"suffix");f(this,"outputLen");f(this,"canXOF");f(this,"enableXOF",!1);f(this,"rounds");if(h(e,"blockLen"),h(n,"suffix"),h(o,"rounds"),U(i,"enableXOF"),this.blockLen=e,this.suffix=n,this.outputLen=r,this.enableXOF=i,this.canXOF=i,this.rounds=o,h(r,"outputLen"),!(0<e&&e<200))throw new Error('"blockLen" must be 1..199');this.state=new Uint8Array(200),this.state32=A(this.state)}clone(){return this._cloneInto()}keccak(){E(this.state32),at(this.state32,this.rounds),E(this.state32),this.posOut=0,this.pos=0}update(e){m(this),b(e);let{blockLen:n,state:r,state32:i}=this,o=e.length,s=n%4===0&&e.byteOffset%4===0,u=n/4,a=s&&o>=n?A(e):void 0;for(let c=0;c<o;){if(a!==void 0&&this.pos===0&&c%4===0&&o-c>=n){for(let p=0,x=c/4;p<u;p++)i[p]^=a[x+p];c+=n,this.pos=n,this.keccak();continue}let k=Math.min(n-this.pos,o-c);for(let p=0;p<k;p++)r[this.pos++]^=e[c++];this.pos===n&&this.keccak()}return this}finish(){if(this.finished)return;this.finished=!0;let{state:e,suffix:n,pos:r,blockLen:i}=this;e[r]^=n,(n&128)!==0&&r===i-1&&this.keccak(),e[i-1]^=128,this.keccak()}writeInto(e){m(this,!1),b(e),this.finish();let n=this.state,{blockLen:r}=this;for(let i=0,o=e.length;i<o;){this.posOut>=r&&this.keccak();let s=Math.min(r-this.posOut,o-i);e.set(n.subarray(this.posOut,this.posOut+s),i),this.posOut+=s,i+=s}return e}xofInto(e){if(!this.enableXOF)throw new Error("XOF is not enabled");return this.writeInto(e)}xof(e){return h(e),this.xofInto(new Uint8Array(e))}digestInto(e){if(H(e,this),this.finished)throw new Error("digest() was already called");this.writeInto(e.length===this.outputLen?e:e.subarray(0,this.outputLen)),this.destroy()}digest(){let e=new Uint8Array(this.outputLen);return this.digestInto(e),e}destroy(){this.destroyed=!0,L(this.state)}_cloneInto(e){let{blockLen:n,suffix:r,outputLen:i,rounds:o,enableXOF:s}=this;return e||(e=new t(n,r,i,s,o)),e.blockLen=n,e.state32.set(this.state32),e.pos=this.pos,e.posOut=this.posOut,e.finished=this.finished,e.rounds=o,e.suffix=r,e.outputLen=i,e.enableXOF=s,e.canXOF=this.canXOF,e.destroyed=this.destroyed,e}},pt=(t,e,n,r={})=>j(()=>new _(e,t,n),r);var M=pt(1,136,32);var ht=t=>"0x"+Array.from(M(Uint8Array.from(t.slice(2).match(/../g)||[],e=>parseInt(e,16))),e=>e.toString(16).padStart(2,"0")).join("");return C(xt);})();
// END bundled noble Keccak-256

// ---- ABI encoding: address, bool, uintN, intN, bytes32, bytes, string, T[], tuples "(a,b)" ----
const W = 64, pad = h => h.padStart(W, '0');
function split(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
const isArr = t => t.endsWith('[]'), isTup = t => t.startsWith('('), members = t => split(t.slice(1, -1));
const dyn = t => t === 'bytes' || t === 'string' || isArr(t) || (isTup(t) && members(t).some(dyn));
const headSize = t => !dyn(t) && isTup(t) ? members(t).reduce((n, x) => n + headSize(x), 0) : 32;
function word(t, v) {
  if (t === 'address') { const h = String(v).toLowerCase().replace(/^0x/, ''); if (!/^[0-9a-f]{40}$/.test(h)) throw new TypeError('Bad address ' + v); return pad(h); }
  if (t === 'bool') return pad(v ? '1' : '0');
  if (t === 'bytes32') { const h = String(v).toLowerCase().replace(/^0x/, ''); if (!/^[0-9a-f]{64}$/.test(h)) throw new TypeError('Bad bytes32'); return h; }
  const m = /^(u?)int(\d*)$/.exec(t); if (!m) throw new TypeError('Unsupported type ' + t);
  let n = BigInt(v); const bits = BigInt(m[2] || 256);
  if (m[1]) { if (n < 0n || n >= 1n << bits) throw new RangeError(t + ' out of range'); } else { if (n < -(1n << (bits - 1n)) || n >= 1n << (bits - 1n)) throw new RangeError(t + ' out of range'); if (n < 0n) n += 1n << 256n; }
  return pad(n.toString(16));
}
function one(t, v) {
  if (t === 'bytes' || t === 'string') { const h = t === 'string' ? Array.from(new TextEncoder().encode(v), b => b.toString(16).padStart(2, '0')).join('') : String(v).replace(/^0x/, ''); return pad((h.length / 2).toString(16)) + h.padEnd(Math.ceil(h.length / W) * W, '0'); }
  if (isArr(t)) return pad(v.length.toString(16)) + list(v.map(() => t.slice(0, -2)), v);
  if (isTup(t)) return list(members(t), v);
  return word(t, v);
}
function list(types, values) {
  if (types.length !== values.length) throw new TypeError('ABI arity');
  const heads = [], tails = []; let off = types.reduce((n, t) => n + headSize(t), 0);
  types.forEach((t, i) => { const e = one(t, values[i]); if (dyn(t)) { heads.push(pad(off.toString(16))); tails.push(e); off += e.length / 2; } else heads.push(e); });
  return heads.join('') + tails.join('');
}
export const encode = (types, values) => '0x' + list(types, values);
export const calldata = (selector, types, values) => selector + list(types, values);
const KEY_T = '(address,address,uint24,int24,address)';
const keyTuple = k => [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks];
const keyOf = pool => pool.key || pool;
function chainOf(pool, chainId) {
  const declared = pool?.chainId;
  if (chainId !== undefined && declared !== undefined && String(chainId) !== String(declared)) throw new TypeError('chainId override disagrees with pool chain.');
  const id = String(chainId ?? declared ?? '');
  if (!/^[1-9][0-9]*$/.test(id) || !CHAINS[id]) throw new TypeError('Unsupported chain ' + id);
  return id;
}
function basisPoints(value, maximum, name) {
  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(maximum)) return Number(value);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new RangeError(name + ' must be an integer from 0 to ' + maximum + '.');
  return value;
}
export function predictCreate2Address(deployer, salt, initCode) {
  if (typeof deployer !== 'string' || !/^0x[0-9a-f]{40}$/i.test(deployer) || typeof salt !== 'string' || !/^0x[0-9a-f]{64}$/i.test(salt) || typeof initCode !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(initCode) || initCode.length > 98306) throw new TypeError('Invalid CREATE2 deployment parameters.');
  return '0x' + qhooksKeccak.hashHex('0xff' + deployer.slice(2) + salt.slice(2) + qhooksKeccak.hashHex(initCode).slice(2)).slice(-40);
}


/// minOut for `amountOut` with `bps` slippage (100 = 1%).
export const withSlippage = (amountOut, bps) => BigInt(amountOut) * (10000n - BigInt(basisPoints(bps, 10000, 'Slippage bps'))) / 10000n;
/// The input currency of a swap direction.
export const currencyIn = (pool, zeroForOne) => zeroForOne ? keyOf(pool).currency0 : keyOf(pool).currency1;

// ---- Transactions (returned, never sent) ----
/// ERC-20 approve(spender, amount).
export const approve = (token, spender, amount) => ({ to: token, data: calldata('0x095ea7b3', ['address', 'uint256'], [spender, amount]), value: 0n });
/// Permit2 approve(token, spender, amount, expiration) — needed once per token before Universal Router swaps.
export const permit2Approve = (token, spender, amount, expiration) => ({ to: PERMIT2, data: calldata('0x87517c45', ['address', 'address', 'uint160', 'uint48'], [token, spender, amount, expiration]), value: 0n });

/// A swap through QFeeRouter (the router the QHooks terminal uses): exact input along `hops`, at least `minOut` of the
/// last output after the router fee. ERC-20 input: approve FEE_ROUTER first. Native input: sent as value.
/// feeBps is the router fee (the terminal uses 100 = 1%; capped on chain); feeOnInput takes it from the input
/// (use true when paying with the quote token). `referrer` is credited on the trader's first referred trade.
export function feeRouterSwap({ chainId, pool, hops, zeroForOne, amountIn, minOut, feeOnInput = true, feeBps = 100, deadline, referrer = Z, wrapNative = Z, hookData = '0x' }) {
  const path = hops || [{ key: keyOf(pool), zeroForOne, hookData }];
  const c = chainOf(pool || path[0], chainId); if (!CHAINS[c]) throw new TypeError('Unsupported chain ' + c);
  if (!Array.isArray(path) || path.length < 1 || path.length > 3) throw new TypeError('Supply one to three swap hops.');
  for (const hop of path) if (hop.chainId !== undefined) chainOf(hop, c);
  basisPoints(feeBps, 100, 'Fee bps');
  if (CHAINS[c].feeRouter === null) throw new TypeError('Fee router unavailable on chain ' + c);
  const first = path[0], inCurrency = first.zeroForOne ? first.key.currency0 : first.key.currency1;
  const dl = BigInt(deadline ?? Math.floor(Date.now() / 1000) + 600);
  return { to: CHAINS[c].feeRouter || FEE_ROUTER, value: BigInt(inCurrency) === 0n || wrapNative !== Z ? BigInt(amountIn) : 0n,
    data: calldata('0xf5ec7c4b', ['address', `(${KEY_T},bool,bytes)[]`, 'uint128', 'uint128', 'address', 'bool', 'uint16', 'uint256', 'address'],
      [CHAINS[c].manager, path.map(h => [keyTuple(h.key), h.zeroForOne, h.hookData || '0x']), amountIn, minOut, wrapNative, feeOnInput, feeBps, dl, referrer]) };
}

/// A direct exact-input swap on one v4 pool through Uniswap's Universal Router (what aggregators use), with no
/// QHooks router fee. ERC-20 input: approve PERMIT2, then permit2Approve(token, CHAINS[chainId].router, …). Native input: value.
export function universalRouterSwap({ chainId, pool, zeroForOne, amountIn, minOut, deadline, hookData = '0x' }) {
  const c = chainOf(pool, chainId), r = CHAINS[c]; if (!r) throw new TypeError('Unsupported chain ' + c);
  const k = keyOf(pool), [cin, cout] = zeroForOne ? [k.currency0, k.currency1] : [k.currency1, k.currency0];
  const single = r.extended
    ? encode([`(${KEY_T},bool,uint128,uint128,uint256,bytes)`], [[keyTuple(k), zeroForOne, amountIn, minOut, 0n, hookData]])
    : encode([`(${KEY_T},bool,uint128,uint128,bytes)`], [[keyTuple(k), zeroForOne, amountIn, minOut, hookData]]);
  // V4_SWAP: SWAP_EXACT_IN_SINGLE (0x06), SETTLE_ALL (0x0c), TAKE_ALL (0x0f)
  const v4 = encode(['bytes', 'bytes[]'], ['0x060c0f', [single, encode(['address', 'uint256'], [cin, amountIn]), encode(['address', 'uint256'], [cout, minOut])]]);
  const dl = BigInt(deadline ?? Math.floor(Date.now() / 1000) + 600);
  return { to: r.router, value: BigInt(cin) === 0n ? BigInt(amountIn) : 0n, data: calldata('0x3593564c', ['bytes', 'bytes[]', 'uint256'], ['0x10', [v4], dl]) };
}

// ---- Client ----
/// options: { api = API, rpc: { [chainId]: url } | (chainId) => url, fetch = globalThis.fetch }
export function createClient({ api = API, rpc = {}, fetch: f = globalThis.fetch.bind(globalThis) } = {}) {
  async function readJSON(response) {
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const e = new Error(typeof body?.error === 'string' ? body.error : 'HTTP ' + response.status);
      e.status = response.status; e.body = body; throw e;
    }
    try { return await response.json(); }
    catch (cause) { const e = new Error('Invalid JSON response (HTTP ' + response.status + ').', {cause}); e.status = response.status; throw e; }
  }
  const get = async path => readJSON(await f(api + path));
  const query = params => { const q = new URLSearchParams(); for (const [key, value] of Object.entries(params || {})) if (value !== undefined && value !== null && value !== '' && value !== false) q.set(key, value === true ? '1' : String(value)); return q.size ? '?' + q : ''; };
  const segment = value => encodeURIComponent(String(value));
  // client.hook(chainId, hook) is the routing view (QHooks pools behind a hook, for routers).
  // client.hooks.get(chainId, hook) is the discovery view: live evidence, capabilities, shared code, Tape activity.
  const hooks = Object.freeze({
    list: params => get('/hooks' + query(params)),
    get: (chainId, address) => get('/hooks/' + segment(chainId) + '/' + segment(address.toLowerCase())),
    compare: ids => get('/hooks/compare' + query({ ids: Array.isArray(ids) ? ids.join(',') : ids })),
    family: fp => get('/hooks/families/' + segment(fp)),
    projects: params => get('/hooks/projects' + query(params)),
    project: id => get('/hooks/projects/' + segment(id)),
    tape: Object.freeze({
      status: params => get('/hooks/tape/status' + query(params)),
      pools: params => get('/hooks/tape/pools' + query(params)),
      swaps: params => get('/hooks/tape/swaps' + query(params)),
      activity: params => get('/hooks/tape/activity' + query(params))
    })
  });
  // Public captured-template preparation, using the configured API's origin.
  // This namespace is transport only; it does not sign, compile source or deploy.
  async function labRequest(path, input, { signal } = {}) {
    signal?.throwIfAborted();
    const url = new URL('/api/lab/catalog' + path, api);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Use an HTTP(S) API origin without credentials.');
    const posting = path === '/build';
    const response = await f(url.href, { method: posting ? 'POST' : 'GET', mode: 'cors', credentials: 'omit', redirect: 'manual', cache: 'no-store', signal,
      headers: { accept: 'application/json', ...(posting ? { 'content-type': 'application/json' } : {}) }, ...(posting ? { body: JSON.stringify(input) } : {}) });
    signal?.throwIfAborted();
    if (response.type === 'opaqueredirect' || response.status >= 300 && response.status < 400) {
      const error = new Error('Lab API redirects are refused.'); error.code = 'redirect_refused'; error.status = response.status; throw error;
    }
    const body = await response.json().catch(() => null); signal?.throwIfAborted();
    if (!response.ok) {
      const error = new Error(body?.error?.message || 'Lab API HTTP ' + response.status);
      error.status = response.status; error.code = body?.error?.code || 'lab_api_error'; error.body = body; throw error;
    }
    const envelope = body?.schemaVersion === 1 && /^[0-9a-f]{64}$/i.test(body?.sourceVersion || '');
    const valid = posting ? envelope && body.kind === 'qhooks-lab-catalog-build' && body.sourceVersion === input?.sourceVersion &&
      body.request?.kind === 'qhooks-lab-template-request' && body.request.schemaVersion === 1 && body.request.sourceVersion === input?.sourceVersion && body.request.template === input?.template && body.request.chainId === '8453' && input?.chainId === '8453' &&
      body.artifact?.chainId === '8453' && body.artifact.template === 'catalogue/' + input?.template && body.artifact.sourceVersion === body.sourceVersion && body.artifact.prepared === true && body.artifact.executionEnabled === false && body.artifact.signingEnabled === false && body.artifact.compilerInput === null &&
      body.artifactInput?.kind === 'qhooks-lab-template-artifact-input' && body.artifactInput.sourceVersion === body.sourceVersion && Array.isArray(body.additionalChecks)
      : envelope && body.kind === 'qhooks-lab-catalog' && body.chainId === '8453' && Array.isArray(body.templates);
    if (!valid) { const error = new Error('The Lab API response did not match this preparation.'); error.code = 'invalid_response'; error.status = response.status; throw error; }
    return body;
  }
  const lab = Object.freeze({ catalog: options => labRequest('', undefined, options), prepareTemplate: (request, options) => labRequest('/build', request, options) });
  const rpcUrl = c => typeof rpc === 'function' ? rpc(c) : rpc[c];
  async function rpcCall(chainId, method, params) {
    const url = rpcUrl(chainId); if (!url) throw new Error('No RPC for chain ' + chainId);
    const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await readJSON(r); if (j.error) { const e = new Error(j.error.message || method + ' failed'); e.data = j.error.data; throw e; } return j.result;
  }
  async function call(chainId, req) {
    const url = rpcUrl(chainId); if (!url) throw new Error('No RPC for chain ' + chainId);
    const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [req, 'latest'] }) });
    const j = await readJSON(r); if (j.error) { const e = new Error(j.error.message || 'eth_call failed'); e.data = j.error.data; throw e; } return j.result;
  }
  const client = Object.freeze({
    hooks, lab,
    chains: () => get('/chains').then(j => j.chains),
    markets: ({ chain } = {}) => get('/markets' + (chain ? '?chain=' + chain : '')).then(j => j.markets),
    market: (chainId, controller) => get(`/markets/${chainId}/${controller.toLowerCase()}`),
    trades: (chainId, controller) => get(`/markets/${chainId}/${controller.toLowerCase()}/trades`).then(j => j.trades),
    holders: (chainId, controller) => get(`/markets/${chainId}/${controller.toLowerCase()}/holders`),
    candles: (chainId, controller, tf = 3600) => get(`/markets/${chainId}/${controller.toLowerCase()}/candles?tf=${tf}`).then(j => j.candles),
    pools: ({ chain } = {}) => get('/pools' + (chain ? '?chain=' + chain : '')).then(j => j.pools),
    hook: (chainId, hook) => get(`/hooks/${chainId}/${hook.toLowerCase()}`),
    wallet: address => get('/wallets/' + address.toLowerCase()),
    /// Reviewed builder-marketplace modules (Studio's list).
    modules: () => f(new URL('/market/modules.json', api).href).then(readJSON),
    /// Exact-input quote through the hook (charges included). With an RPC for the chain it simulates on the V4Quoter
    /// with from = trader, so wallet-keyed launch rules (tx.origin) are applied as for the real swap; otherwise it
    /// asks the API, which does the same.
    async quote({ chainId, pool, zeroForOne, amountIn, trader = Z }) {
      const c = chainOf(pool, chainId), k = keyOf(pool);
      if (rpcUrl(c)) {
        const r = await call(c, { from: trader, to: CHAINS[c].quoter, data: calldata('0xaa9d21cb', [`(${KEY_T},bool,uint128,bytes)`], [[keyTuple(k), zeroForOne, amountIn, '0x']]) });
        return { amountOut: BigInt('0x' + r.slice(2, 66)), gasEstimate: BigInt('0x' + r.slice(66, 130)), source: 'rpc' };
      }
      const id = pool.poolId; if (!id) throw new Error('Pass a pool from pools() or an RPC URL for chain ' + c);
      const j = await get(`/quote?chain=${c}&pool=${id}&zeroForOne=${!!zeroForOne}&amountIn=${BigInt(amountIn)}&trader=${trader.toLowerCase()}`);
      return { amountOut: BigInt(j.amountOut), gasEstimate: BigInt(j.gasEstimate), source: 'api' };
    },
    /// Whether QFeeRouter exists on a chain yet (it is created by the first trade that needs it). When it does not,
    /// `setup` is the one-time transaction that creates it at FEE_ROUTER (deterministic deployer, anyone may send it).
    async feeRouterStatus(chainId) {
      const id = chainOf(undefined, chainId), router = CHAINS[id].feeRouter;
      if (router === null) return {deployed: false, setup: null, reason: 'Fee router unavailable on this chain.'};
      const expected = router || FEE_ROUTER;
      const code = rpcUrl(id) ? await rpcCall(id, 'eth_getCode', [expected, 'latest']) : (await get('/chains')).chains.find(c => String(c.chainId) === id)?.feeRouterDeployed ? '0x01' : '0x';
      if (code && code !== '0x') return { deployed: true, setup: null };
      if (expected !== FEE_ROUTER) throw new Error('No verified router setup is available for chain ' + id + '.');
      const x = await f(new URL('/full-launch/extras.json', api).href).then(readJSON);
      if (typeof x?.deployer !== 'string' || x.deployer.toLowerCase() !== CREATE2_DEPLOYER || predictCreate2Address(x.deployer, x.salt, x.contracts?.feeRouter?.initCode) !== expected || x.contracts.feeRouter.address?.toLowerCase() !== expected) throw new Error('Fee-router deployment does not match the pinned CREATE2 address.');
      return { deployed: false, setup: { to: CREATE2_DEPLOYER, data: x.salt + x.contracts.feeRouter.initCode.slice(2), value: 0n } };
    },
    /// feeRouterSwap, refusing to build a swap for a chain where QFeeRouter does not exist yet (that call would do nothing).
    async prepareFeeRouterSwap(opts) {
      const c = chainOf(opts.pool || opts.hops?.[0], opts.chainId);
      if (!(await client.feeRouterStatus(c)).deployed) throw new Error('QFeeRouter is not deployed on chain ' + c + ' yet: send feeRouterStatus(' + c + ').setup first, or use universalRouterSwap');
      return feeRouterSwap(opts);
    },
    withSlippage, feeRouterSwap, universalRouterSwap, approve, permit2Approve, currencyIn
  });
  return client;
}
