// Keep a token's Buy target in place while the visitor is choosing a row.
// D4: a live poll (update.live) still lands while the pointer, a press or keyboard focus is on the list, as {frozen:true}:
// the numbers change in place but the order and the set of rows hold until the hold ends ({released:true}). Only the
// manual "Pause updates" queues a live poll whole, as every other update is queued while held.
const identity=r=>String(r.chainId)+':'+(r.chainId==='solana'?r.token?.address:String(r.token?.address||'').toLowerCase());
export function createDiscoveryUpdates({apply,changed=()=>{}}){
 let current=null,pending=null,frozen=false,shown=null;const holds=new Set();
 const notify=()=>{const have=new Set(((frozen?shown:current)?.data?.rows||[]).map(identity));const next=pending||(frozen?current:null);changed({held:holds.size>0,manual:holds.has('manual'),pending:!!pending||frozen,newTokens:(next?.data?.rows||[]).filter(r=>!have.has(identity(r))).length});};
 const flush=()=>{if(!holds.size){if(pending){const next=pending;pending=null;frozen=false;current=next;apply(next);}else if(frozen){frozen=false;apply({...current,released:true});}}notify();};
 return {
  receive(update){
   if(current?.key!==update.key){pending=null;frozen=false;for(const reason of ['pointer','focus','press'])holds.delete(reason);current=update;apply(update);notify();return;}
   if(holds.size&&current?.data?.rows?.length){
    if(update.live&&!holds.has('manual')&&!pending){if(!frozen)shown=current;frozen=true;current=update;apply({...update,frozen:true});notify();return;}
    pending=update;notify();return;
   }
   current=update;apply(update);notify();
  },
  hold(reason,on){if(holds.has(reason)===!!on)return;on?holds.add(reason):holds.delete(reason);flush();},
  get held(){return holds.size>0;},
  get frozen(){return frozen;},
 };
}
