// Pure route selection. Failed/empty quotes are skipped; equal outputs keep main-first order.
export function bestPool(quotes) {
 let best = null, amount = 0n;
 for (const q of quotes) {
  if (!q || q.error) continue;
  let out; try { out = BigInt(q.out); } catch { continue; }
  if (out > amount) { best = q; amount = out; }
 }
 return best;
}
const Z = '0x' + '0'.repeat(40), TIERS = [[500, 10], [3000, 60], [100, 1]];
const USDT = '0x55d398326f99059ff775485246999027b3197955', USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
export const plainPoolKey = (a, b, fee, tickSpacing) => {
 const [currency0, currency1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
 return {currency0, currency1, fee, tickSpacing, hooks: Z};
};
// Native-input buy paths and direct quote-token sells. No network or wallet dependency.
export function nativePoolPlans(chain, pool, token, side = 'buy') {
 if (side === 'sell') return [directPoolPlan(pool, token)];
 const key = pool.key, quote = pool.quote || (key.currency0 === token ? key.currency1 : key.currency0), id = String(chain.id);
 const hop = (key, input) => ({key, zeroForOne: key.currency0.toLowerCase() === input.toLowerCase()});
 const last = hop(key, quote), make = (hops, wrap = null) => ({hops, wrap, pool});
 let plans;
 if (quote === Z) plans = [make([last])];
 else if (quote.toLowerCase() === chain.wrappedNative?.toLowerCase()) {
  return [make([last], quote)];
 } else {
  const row = chain.simpleLaunchMulti?.quotes?.find(q => q[2].toLowerCase() === quote.toLowerCase());
  if (id === '4663' && row?.[4] === 'stock') {
   plans = [[100, 1], [500, 10]].flatMap(([f1, t1]) => [[3000, 60], [100, 1], [10000, 200]].map(([f2, t2]) => make([hop(plainPoolKey(Z, USDG, f1, t1), Z), hop(plainPoolKey(USDG, quote, f2, t2), USDG), last])));
  } else if (quote.toLowerCase() === chain.quote?.address?.toLowerCase() && chain.quote?.symbol === 'USDC' || id === '4663' && quote.toLowerCase() === USDG || id === '56' && quote.toLowerCase() === USDT) {
   plans = TIERS.map(([f, t]) => make([hop(plainPoolKey(Z, quote, f, t), Z), last]));
  } else return [];
 }
 return plans;
}
const KEY_T = '(address,address,uint24,int24,address)';
const keyTuple = k => [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks];
export function poolQuoteArgs(plan, amount, data = () => '0x') {
 const [first] = plan.hops;
 if (plan.hops.length === 1) return {selector:'0xaa9d21cb',types:[`(${KEY_T},bool,uint128,bytes)`],values:[[keyTuple(first.key),first.zeroForOne,amount,data(first.key)]]};
 const input = first.zeroForOne ? first.key.currency0 : first.key.currency1;
 const path = plan.hops.map(h => [h.zeroForOne ? h.key.currency1 : h.key.currency0,h.key.fee,h.key.tickSpacing,h.key.hooks,data(h.key)]);
 return {selector:'0xca253dc9',types:['(address,(address,uint24,int24,address,bytes)[],uint128)'],values:[[input,path,amount]]};
}

export const directPoolPlan = (pool, token, side = 'sell') => ({pool,wrap:null,hops:[{key:pool.key,zeroForOne:pool.key.currency0.toLowerCase()===(side==='sell'?token:pool.quote).toLowerCase()}]});
export function poolQuoteInfo(chain, pool) {
 const quote=pool.quote.toLowerCase(),row=[...(chain.simpleLaunchMulti?.quotes||[]),...(chain.simpleLaunchPairs?.quotes||[])].find(q=>q[2].toLowerCase()===quote),standard=quote===chain.quote?.address?.toLowerCase();
 const quoteSymbol=row?.[1]||(standard?chain.quote.symbol:quote===Z?chain.native:pool.quoteSymbol||''),quoteDecimals=row?.[3]??(standard?chain.quote.decimals:pool.quoteDecimals??(quote===Z||quote===chain.wrappedNative?.toLowerCase()?18:null));
 const kind=row?.[4]||(quote===chain.wrappedNative?.toLowerCase()||quote===Z?'weth':standard&&/^(USDC|USDT|USDG)$/.test(chain.quote.symbol)?'stable':'custom');
 return {quoteSymbol,quoteDecimals,kind};
}
export function sellQuoteUsd(chain, pool, nativeUsd) {
 const info=poolQuoteInfo(chain,pool);
 return info.kind==='custom'?(Number.isFinite(pool.quoteUsd)&&pool.quoteUsd>0?pool.quoteUsd:null):info.kind==='stable'?1:info.kind==='weth'&&Number.isFinite(nativeUsd)&&nativeUsd>0?nativeUsd:null;
}
export function sellPoolCandidates(chain, pools, nativeUsd, quoteToken = null) {
 const priced=p=>poolQuoteInfo(chain,p).kind!=='custom'||sellQuoteUsd(chain,p,nativeUsd)>0;
 if(quoteToken)return pools.filter(p=>p.quote.toLowerCase()===quoteToken.toLowerCase()&&priced(p));
 if(!Number.isFinite(nativeUsd)||nativeUsd<=0)return [pools.find(p=>p.main)||pools[0]].filter(p=>p&&priced(p));
 return pools.filter(p=>['stable','weth'].includes(poolQuoteInfo(chain,p).kind)||poolQuoteInfo(chain,p).kind==='custom'&&priced(p));
}
// Compare USD values by cross multiplication, retaining bigint precision across different quote decimals.
export function bestSellPool(quotes, {chain,nativeUsd,pools=quotes.filter(Boolean).map(q=>q.pool),quoteToken=null}) {
 const eligible=sellPoolCandidates(chain,pools,nativeUsd,quoteToken),valid=quotes.filter(q=>q&&eligible.some(p=>p.quote.toLowerCase()===q.pool.quote.toLowerCase())&&bestPool([q]));
 if(quoteToken||!Number.isFinite(nativeUsd)||nativeUsd<=0)return bestPool(valid);
 let best=null,num=0n,den=1n;
 for(const q of valid){const price=sellQuoteUsd(chain,q.pool,nativeUsd),d=poolQuoteInfo(chain,q.pool).quoteDecimals,scaled=Math.round(price*1e8);
  if(!(price>0)||!Number.isSafeInteger(scaled)||scaled<=0||!Number.isInteger(d)||d<0||d>36)continue;
  const n=BigInt(q.out)*BigInt(scaled),unit=10n**BigInt(d);
  if(!best||n*den>num*unit){best=q;num=n;den=unit;}
 }
 return best;
}
