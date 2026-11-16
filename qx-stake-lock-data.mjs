// Timed-lock positions are independent of bonus, balance and reward reads.
const addr=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/i.test(x);
const W=n=>BigInt(n).toString(16).padStart(64,'0');
const words=h=>{if(typeof h!=='string'||!/^0x(?:[0-9a-f]{64})+$/i.test(h))throw Error('Incomplete lock read');return h.slice(2).match(/.{64}/g).map(x=>BigInt('0x'+x));};
export function normalizeTimedLocks(rows){
 if(!Array.isArray(rows))throw Error('Lock list unavailable');const seen=new Set();
 return rows.map(l=>{const id=BigInt(l.id),amount=BigInt(l.amount);if(amount===0n)return null;const term=Number(l.term),end=BigInt(l.end);if(id<1n||amount<0n||amount>=(1n<<256n)||end<1n||![1,2,3].includes(term)||seen.has(String(id)))throw Error('Invalid lock row');seen.add(String(id));return{id,amount,term,end,q:null,t:null,bonus:null};}).filter(Boolean);
}
export async function readTimedLocks({owner,cfg,rpc,fetchImpl=globalThis.fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=5000}){
 if(!addr(owner))throw Error('Wallet required');
 for(const wait of [0,500]){if(wait)await sleep(wait);try{const r=await fetchImpl('/api/stake-lock/locks?owner='+owner.toLowerCase(),{cache:'no-store',signal:AbortSignal.timeout(timeoutMs)}),j=await r.json();if(!r.ok||String(j.chainId)!==String(cfg.chainId)||String(j.lock).toLowerCase()!==cfg.lock||String(j.owner).toLowerCase()!==owner.toLowerCase())throw Error('Unexpected lock list');return normalizeTimedLocks(j.locks);}catch{}}
 // Existing JSON-RPC reader batches these bounded direct storage reads, with public fallback/retry.
 const call=data=>rpc(cfg.chainId,'eth_call',[{to:cfg.lock,data},'latest']);
 const next=words(await call('0x61b8ce8c'))[0];if(next<1n||next>1001n)throw Error('Lock list needs another refresh');
 const out=[];
 for(let start=1n;start<next;start+=20n){const ids=[];for(let id=start;id<next&&id<start+20n;id++)ids.push(id);
  const rows=await Promise.all(ids.map(async id=>{const w=words(await call(cfg.sel.locks+W(id)));if(w.length<6)throw Error('Incomplete lock row');return {id,owner:'0x'+w[0].toString(16).padStart(40,'0'),term:Number(w[1]),end:w[3],amount:w[5]};}));out.push(...rows.filter(l=>l.owner.toLowerCase()===owner.toLowerCase()));}
 return normalizeTimedLocks(out);
}
