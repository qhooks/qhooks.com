// Display adapters for the launch index. Quote amounts remain in their native
// unit; chart USD is a revaluation at the explicitly dated quote observation.
export function ownChartView(data){
 const quote=data.nativeQuote;
 if(!quote)return {bars:data.candles,unit:null};
 const usd=Number.isFinite(quote.usd)&&quote.usd>0;
 return {unit:usd?'USD':quote.symbol,bars:usd?data.candles.map(c=>({...c,open:c.open*quote.usd,high:c.high*quote.usd,low:c.low*quote.usd,close:c.close*quote.usd})):data.candles};
}
export function ownHolderLabel(data,address){
 return data?.meta?.holderLabels?.[address?.toLowerCase()]||data?.holders?.find(h=>h.holder===address?.toLowerCase())?.label||null;
}
export function ownTapeValue(trade,money){
 if(!trade.quoteSymbol)return null;
 const native=money(trade.quote,trade.quoteSymbol);
 // No dollar value without a dated ETH/USD sample: show the native amount alone (no "unavailable" wording).
 return Number.isFinite(trade.valueUsd)?native+' · '+money(trade.valueUsd,'USD'):native;
}
export function ownTapeRows(rows,data){
 return data.meta?.ownTransfers===1?[...rows].sort((a,b)=>b.block-a.block||b.idx-a.idx):rows;
}
