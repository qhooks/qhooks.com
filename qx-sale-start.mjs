// Sale tier adapter: the same factory step zero and USD prices as one-tap, paid in native coin.
import {chainById} from './chains.mjs';
import {startCapFactory,multiFactory,multiLive,primeCleanFactory,primeMultiFactory} from './qx-quick-launch-core.mjs';
import {selectedStart,START_PRICE_HOLD} from './qx-guided-start-core.mjs';
import {readFactoryStart} from './qx-guided-start.mjs';
import {readCreateNativeUSD} from './qx-create-prices.mjs';
import {salePriceForCap} from './qx-sale-core.mjs';

export async function readSaleStart({chainId,tier='standard',customUsd='',request,readUsd=readCreateNativeUSD}) {
  try {
    const c=chainById(chainId);
    await Promise.all([primeCleanFactory(chainId,a=>request('eth_getCode',[a,'latest'])),primeMultiFactory(chainId,a=>request('eth_getCode',[a,'latest']))]);
    const factory=multiLive(chainId)?multiFactory(chainId):startCapFactory(chainId);
    // Reuse a single USD observation when the factory quote and sale payment are the same coin.
    const prices=new Map(),usd=symbol=>{if(!prices.has(symbol))prices.set(symbol,Promise.resolve(readUsd(symbol)));return prices.get(symbol);};
    const [base,paymentUsd]=await Promise.all([readFactoryStart({chainId,quote:c.quote,factory,steps:0,request,readUsd:usd}),/USD/.test(c.native)?1:usd(c.native)]);
    if(tier==='custom'&&!customUsd)throw Error();
    const selected=selectedStart({tier,customUsd,standardUsd:base.capUsd});
    return {...selected,tier,customUsd,standardUsd:base.capUsd,paymentUsd,factory,price:salePriceForCap({capUsd:selected.selectedCapUsd,paymentUsd})};
  } catch {throw new TypeError(START_PRICE_HOLD);}
}
