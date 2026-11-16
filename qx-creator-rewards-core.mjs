const A=/^0x[0-9a-f]{40}$/i;
export function rewardEntries(launches){
 if(!Array.isArray(launches))throw Error('Invalid launch list');const seen=new Set();return launches.slice(0,400).filter(l=>{const key=String(l.chainId)+':'+String(l.controller).toLowerCase();if(!/^\d{1,8}$/.test(String(l.chainId))||!A.test(l.controller||'')||seen.has(key))return false;seen.add(key);return true;});
}
export function walletIncome(snapshot,wallet){
 if(!A.test(wallet||'')||!snapshot?.currencies||!snapshot.payees)throw Error('Invalid wallet income');const owner=wallet.toLowerCase(),payee=snapshot.payees.find(p=>p.address===owner);
 return snapshot.currencies.map(a=>{const mine=a.payees.find(p=>p.address===owner);return {chainId:snapshot.chainId,address:a.address,decimals:a.decimals,symbol:a.symbol,bps:payee?.bps||0,pending:mine?.pending??'0',paid:snapshot.complete?(mine?.paid??'0'):null,earned:snapshot.complete?(mine?.earned??'0'):null,block:snapshot.block,stale:snapshot.stale};});
}
// Only the rows on the current page, and only the connected wallet's direct share.
// Identity deduplication prevents two launch references counting one income bucket twice.
export function rewardTotals(rows){
 const seen=new Set(),totals=new Map();for(const row of rows){if(!row.snapshot)continue;const id=row.snapshot.chainId+':'+row.snapshot.address;if(seen.has(id))continue;seen.add(id);
 for(const a of row.assets||[]){const key=a.chainId+':'+a.address;let t=totals.get(key);if(!t){t={...a,pending:0n,paid:0n,earned:0n,unknown:0,count:0,stale:false};totals.set(key,t);}if(a.decimals!==t.decimals)throw Error('Asset decimals changed');t.count++;t.stale||=!!a.stale;t.pending+=BigInt(a.pending);if(a.paid==null||a.earned==null)t.unknown++;else{t.paid+=BigInt(a.paid);t.earned+=BigInt(a.earned);}}
 }return [...totals.values()].map(a=>({...a,pending:String(a.pending),paid:a.unknown?null:String(a.paid),earned:a.unknown?null:String(a.earned)}));
}
export function rewardUnits(raw,decimals){
 if(raw==null||!Number.isInteger(decimals)||decimals<0||decimals>36)return '—';const n=BigInt(raw),scale=10n**BigInt(decimals),whole=n/scale,part=(n%scale).toString().padStart(decimals,'0'),digits=part.slice(0,Math.min(6,decimals)).replace(/0+$/,'');
 if(n&&whole===0n&&!digits)return '<'+(decimals?'0.'+'0'.repeat(Math.min(6,decimals)-1)+'1':'1');return whole.toLocaleString()+(digits?'.'+digits:'');
}
