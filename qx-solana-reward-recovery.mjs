const KEY='qhooks:sol-reward-pending:v1';

export function createSwapRewardRecovery({storage=()=>localStorage,reconcile}={}) {
  let memory=[],flight=null,dirty=false;
  const valid=row=>row&&typeof row.requestId==='string'&&row.requestId.length<=160&&typeof row.signature==='string'&&row.signature.length<=100;
  function read() {
    try { if(dirty)return memory.map(row=>({...row})); const saved=JSON.parse(storage().getItem(KEY)||'[]'); if(Array.isArray(saved))memory=saved.filter(valid).slice(-20); } catch {}
    return memory.map(row=>({...row}));
  }
  function write(items) {
    memory=items.slice(-20);
    dirty=true;
    try { const target=storage(),text=JSON.stringify(memory);target.setItem(KEY,text);dirty=target.getItem(KEY)!==text; } catch {}
  }
  function record(requestId,result) {
    const row={requestId,signature:result?.signature};if(!valid(row))return;
    const items=read().filter(item=>item.requestId!==requestId);
    if(!result.rewards?.credited)items.push(row);
    write(items);
  }
  function run() {
    if(flight)return flight;
    flight=(async()=>{
      const snapshot=read(),settled=new Set();
      for(let i=0;i<snapshot.length;i+=4) {
        await Promise.all(snapshot.slice(i,i+4).map(async row=>{
          try { if((await reconcile(row)).credited)settled.add(row.requestId+'|'+row.signature); } catch {}
        }));
      }
      // Only remove receipts we checked. A swap recorded during these requests
      // must survive this reconciliation, including a changed signature.
      write(read().filter(row=>!settled.has(row.requestId+'|'+row.signature)));
    })().finally(()=>{flight=null;});
    return flight;
  }
  return {read,record,run};
}
