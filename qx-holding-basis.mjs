// Allocate average acquisition basis only to inventory still in the wallet. Moved
// inventory is not a realized sale or a wallet loss. Unknown incoming basis stays unknown.
const known=n=>typeof n==='number'&&Number.isFinite(n);
export function allocateHoldingBasis(row,quoteUsd){
 const c=row.cost;if(!row.qhooks||!c)return row;
 const bought=c.boughtUnits,sold=c.soldUnits||0,spent=c.spentQuote,received=c.receivedQuote||0,held=row.units;
 if(![bought,sold,spent,received,held].every(known)||bought<=0||spent<=0||held<0)return row;
 const remaining=Math.max(0,bought-sold),tolerance=Math.max(1e-9,remaining*1e-6),incoming=held>remaining+tolerance;
 const avg=spent/bought,remainingCostQuote=incoming?null:Math.min(held,remaining)*avg;
 const realizedQuote=sold<=bought+tolerance?received-Math.min(sold,bought)*avg:null;
 const valueQuote=known(row.valueUsd)&&quoteUsd>0?row.valueUsd/quoteUsd:null;
 const unrealizedQuote=remainingCostQuote!==null&&valueQuote!==null?valueQuote-remainingCostQuote:null;
 const pnlQuote=realizedQuote!==null&&unrealizedQuote!==null?realizedQuote+unrealizedQuote:null;
 return {...row,cost:{...c,basisMethod:'average-proportional-wallet-v1',basisIncomplete:incoming||realizedQuote===null,basisMovedUnits:Math.max(0,remaining-held),remainingCostQuote,realizedQuote,unrealizedQuote,quoteUsd:quoteUsd>0?quoteUsd:null,pnlQuote,pnlUsd:pnlQuote!==null&&quoteUsd>0?pnlQuote*quoteUsd:null,approximate:true}};
}
export function allocatePortfolioBasis(report){
 for(const chain of report.chains||[]){
  const quotePrice=symbol=>{if(['ETH','WETH'].includes(symbol)&&chain.native?.symbol==='ETH')return chain.native.priceUsd;if(symbol===chain.native?.symbol)return chain.native.priceUsd;return chain.tokens?.find(t=>t.symbol===symbol)?.priceUsd;};
  chain.tokens=(chain.tokens||[]).map(row=>allocateHoldingBasis(row,quotePrice(row.cost?.quoteSymbol)));
 }
 return report;
}
