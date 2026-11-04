export function estimateGasUsd({gas,gasPriceWei,ethUsdCents,additionalFeeWei='0'}) {
 const regex=/^(0|[1-9][0-9]{0,77})$/;
 for(const value of [gas,gasPriceWei,ethUsdCents,additionalFeeWei])if(typeof value!=='string'||!regex.test(value))throw new TypeError('Expected a canonical unsigned decimal string');
 const g=BigInt(gas),p=BigInt(gasPriceWei),e=BigInt(ethUsdCents),a=BigInt(additionalFeeWei);
 if(e<=0n)throw new TypeError('ETH/USD price must be positive');
 const feeWei=g*p+a,centsRoundedUp=(feeWei*e+10n**18n-1n)/(10n**18n);
 return Object.freeze({feeWei:feeWei.toString(),usdCents:centsRoundedUp.toString(),usd:'$'+(centsRoundedUp/100n).toString()+'.'+(centsRoundedUp%100n).toString().padStart(2,'0')});
}
