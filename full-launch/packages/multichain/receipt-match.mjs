const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const digest=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
const address=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x);
const sameAddress=(a,b)=>address(a)&&address(b)&&a.toLowerCase()===b.toLowerCase();
const quantity=x=>typeof x==='string'&&x.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x);
export function matchesReviewedTransaction(expected,actual,hash){
 if(!object(expected)||!object(actual)||!digest(hash)||actual.hash!==hash)return false;
 if(!sameAddress(expected.from,actual.from))return false;
 if(expected.to===undefined?actual.to!==null:!sameAddress(expected.to,actual.to))return false;
 if(typeof expected.data!=='string'||!/^0x(?:[0-9a-f]{2})*$/.test(expected.data)||actual.input!==expected.data)return false;
 if(!['chainId','type','value','nonce','gas'].every(k=>quantity(expected[k])&&actual[k]===expected[k]))return false;
 if(expected.type==='0x2')return ['maxFeePerGas','maxPriorityFeePerGas'].every(k=>quantity(expected[k])&&actual[k]===expected[k]);
 if(expected.type==='0x0')return quantity(expected.gasPrice)&&actual.gasPrice===expected.gasPrice;
 return false;
}
export function matchesReceipt(tx,receipt,hash){
 if(!object(tx)||!object(receipt)||!digest(hash)||receipt.transactionHash!==hash||tx.hash!==hash)return false;
 if(!digest(tx.blockHash)||receipt.blockHash!==tx.blockHash)return false;
 if(!quantity(tx.blockNumber)||receipt.blockNumber!==tx.blockNumber)return false;
 if(!sameAddress(tx.from,receipt.from))return false;
 if(tx.to===null?receipt.to!==null:!sameAddress(tx.to,receipt.to))return false;
 return receipt.status==='0x0'||receipt.status==='0x1';
}
