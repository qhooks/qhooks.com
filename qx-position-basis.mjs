// Shared inventory qualification for the portfolio's public-history cost and token-page position.
// Observed holdings/markers remain useful when the basis cannot explain the inventory; numeric PnL does not.
const raw = value => { try { return /^(?:0x[\da-f]+|\d+)$/i.test(String(value)) ? BigInt(value) : null; } catch { return null; } };
export function inventoryBasis({heldRaw, boughtRaw, soldRaw, prior, pending = 0, bad = false, limited = false, decimals} = {}) {
  const held = raw(heldRaw), bought = raw(boughtRaw), sold = raw(soldRaw);
  if (bad) return {complete:false,state:'none',reason:'unclassified_inventory'};
  if (limited && prior !== '0') return {complete:false,state:'limited',reason:'history_unavailable'};
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || held == null || bought == null || sold == null || prior !== '0' || pending)
    return {complete:false,state:'pending',reason:'history_pending'};
  const net = bought - sold, gap = held > net ? held - net : net - held;
  if (net <= 0n || gap * 1_000_000n > net) return {complete:false,state:'pending',reason:'inventory_mismatch'};
  return {complete:true,state:'complete',reason:null};
}
const finite = n => typeof n === 'number' && Number.isFinite(n);
export const matchingInventory = (a,b) => finite(a) && finite(b) && a >= 0 && b >= 0 && Math.abs(a-b) <= Math.max(1e-10, Math.max(a,b) * 1e-6);
const markers = (a=[],b=[]) => {
  const out=[...(a||[])];
  for(const row of b||[]) if(!out.some(r=>String(r.tx||'').toLowerCase()===String(row.tx||'').toLowerCase()&&r.side===row.side))out.push(row);
  return out.sort((x,y)=>x.at-y.at);
};
const waiting = p => ({...p,complete:false,state:p.state==='complete'?'pending':p.state||'pending',
  averageEntryUsd:null,averageEntryQuote:null,unrealizedUsd:null,unrealizedQuote:null,unrealizedPercent:null,
  realizedUsd:null,realizedQuote:null,realizedPercent:null,pnlUsd:null,pnlPercent:null});
export function combinePositionEvidence(chain,server) {
  if(!chain&&!server)return null;
  const observedMarkers=markers(chain?.markers,server?.markers);
  if(chain?.complete)return {...chain,markers:observedMarkers};
  if(server?.complete && (!chain || matchingInventory(chain.quantity,server.quantity)))
    return {...server,...(chain?{quantity:chain.quantity,supplyPct:chain.supplyPct,valueUsd:chain.valueUsd}:{}),markers:observedMarkers};
  return {...waiting(chain||server),markers:observedMarkers};
}
