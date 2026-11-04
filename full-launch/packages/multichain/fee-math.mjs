const MAX_UINT256=2n**256n-1n;
function requireBigInt(x,name){
 if(typeof x!=='bigint'||x<0n||x>MAX_UINT256)throw new TypeError(name+' must be a uint256 bigint');return x;
}
function positive(x,name){requireBigInt(x,name);if(x===0n)throw new TypeError(name+' must be positive');return x;}
export function rpcQuantity(x){
 if(typeof x!=='string'||x.length>66||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x))throw new TypeError('Canonical lowercase RPC quantity required');return BigInt(x);
}
export function formatNative(x){
 if(typeof x!=='string'||x.length>78||!/^(?:0|[1-9][0-9]*)$/.test(x))throw new TypeError('Canonical decimal uint256 required');
 const n=requireBigInt(BigInt(x),'value'),unit=10n**18n,whole=n/unit,fraction=(n%unit).toString().padStart(18,'0').replace(/0+$/,'');
 return whole.toString()+(fraction?'.'+fraction:'');
}
export function feeBudget({estimate,price,value,balance,maxGas,maxPrice}){
 estimate=positive(estimate,'estimate');price=positive(price,'price');value=requireBigInt(value,'value');balance=requireBigInt(balance,'balance');maxGas=positive(maxGas,'maxGas');maxPrice=positive(maxPrice,'maxPrice');
 const gas=(estimate*125n+99n)/100n;if(gas>maxGas)throw new TypeError('Gas exceeds review limit');if(price>maxPrice)throw new TypeError('Price exceeds review limit');
 const fee=gas*price,required=value+fee;if(fee>MAX_UINT256||required>MAX_UINT256)throw new TypeError('Fee budget overflow');if(required>balance)throw new TypeError('Insufficient balance');
 return Object.freeze({gas,fee,required});
}
