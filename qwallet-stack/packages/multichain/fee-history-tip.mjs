const ensure=(ok,message)=>{if(!ok)throw TypeError(message);};
const quantity=x=>typeof x==='string'&&x.length<=66&&x.match(/^0x(?:0|[1-9a-f][0-9a-f]*)$/)?.[0]===x;
function field(object,name){const d=Object.getOwnPropertyDescriptor(object,name);ensure(d&&Object.hasOwn(d,'value'),'Own fee-history data required');return d.value;}
function values(array,min,max){
 ensure(Array.isArray(array),'Fee-history array required');const n=array.length;
 ensure(n>=min&&n<=max,'Invalid fee-history array length');
 return Array.from({length:n},(_,index)=>field(array,String(index)));
}
export function feeHistoryTip(history,newest){
 ensure(history&&Object.getPrototypeOf(history)===Object.prototype,'Plain fee history required');
 ensure(quantity(newest),'Canonical fee-history end block required');
 const oldest=field(history,'oldestBlock');ensure(quantity(oldest),'Canonical oldest fee block required');
 const rows=values(field(history,'reward'),1,5),count=rows.length;
 const base=values(field(history,'baseFeePerGas'),count+1,count+1),ratios=values(field(history,'gasUsedRatio'),count,count);
 ensure(base.every(quantity),'Canonical base-fee history required');
 ensure(ratios.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1),'Invalid gas-used ratio');
 ensure(BigInt(oldest)+BigInt(count)-1n===BigInt(newest),'Fee history does not end at the requested block');
 let tip=0n;
 for(const row of rows){const [value]=values(row,1,1);ensure(quantity(value),'Canonical priority-fee history required');const next=BigInt(value);if(next>tip)tip=next;}
 return '0x'+tip.toString(16);
}
