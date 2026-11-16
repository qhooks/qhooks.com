// Keep a token's Buy target in place while the visitor is choosing a row.
const identity=r=>String(r.chainId)+':'+(r.chainId==='solana'?r.token?.address:String(r.token?.address||'').toLowerCase());
export function createDiscoveryUpdates({apply,changed=()=>{}}){
 let current=null,pending=null;const holds=new Set();
 const notify=()=>{const have=new Set((current?.data?.rows||[]).map(identity));changed({held:holds.size>0,manual:holds.has('manual'),pending:!!pending,newTokens:(pending?.data?.rows||[]).filter(r=>!have.has(identity(r))).length});};
 const flush=()=>{if(!holds.size&&pending){const next=pending;pending=null;current=next;apply(next);}notify();};
 return {
  receive(update){
   if(current?.key!==update.key){pending=null;for(const reason of ['pointer','focus','press'])holds.delete(reason);current=update;apply(update);notify();return;}
   if(holds.size&&current?.data?.rows?.length){pending=update;notify();return;}
   current=update;apply(update);notify();
  },
  hold(reason,on){if(holds.has(reason)===!!on)return;on?holds.add(reason):holds.delete(reason);flush();},
  get held(){return holds.size>0;},
 };
}
