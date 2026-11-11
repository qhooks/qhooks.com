// Display adapters for the launch index. Quote amounts remain in their native
// unit; chart USD is a revaluation at the explicitly dated quote observation.
export function ownCandleOptions(up,down){
 return {upColor:up,downColor:down,borderVisible:true,borderUpColor:up,borderDownColor:down,wickVisible:true,wickUpColor:up,wickDownColor:down};
}
export function ownChartRange(count){
 return {from:Math.max(-2,count-90),to:Math.max(10,count+4)};
}
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
 // Dollars first, the quote amount after it (2026-11-10, quoteusd).
 return Number.isFinite(trade.valueUsd)&&!/^USD/.test(trade.quoteSymbol)?money(trade.valueUsd,'USD')+' · '+native:native;
}
// Tape PRICE column (2026-11-10, holder: "the Price section should show the actual price"): USD per token at the time
// of the trade — the trade's dated USD value ÷ its token amount; outside tokens already carry a USD price. The quote-token
// price moves to the hover title, and is the main value only when no USD is known for that trade.
export function ownTapePrice(trade,{ext=false,quoteSymbol=''}={},price=v=>String(v)){
 const usd=ext?trade.price:Number.isFinite(trade.valueUsd)&&trade.token>0?trade.valueUsd/trade.token:null;
 const quote=Number.isFinite(trade.price)&&trade.price>0&&!ext?price(trade.price)+(quoteSymbol?' '+quoteSymbol:''):null;
 if(Number.isFinite(usd)&&usd>0)return {text:'$'+price(usd),title:quote?quote+' per token':undefined};
 return {text:quote||(Number.isFinite(trade.price)?price(trade.price):'—'),title:undefined};
}
export function ownTapeRows(rows,data){
 return data.meta?.ownTransfers===1?[...rows].sort((a,b)=>b.block-a.block||b.idx-a.idx):rows;
}
