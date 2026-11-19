// Read-only quote lifetimes. Signing and transaction submission never enter this scope.
export function createRouteQuoteReads({setTimeout:later=globalThis.setTimeout,clearTimeout:clear=globalThis.clearTimeout}={}) {
  const pending=new Set();
  const failure=(message,code)=>Object.assign(new Error(message),{code,routeQuote:true});
  return {
    async run(work,{timeoutMs=15000}={}) {
      const controller=new AbortController();let finished=false,timer,rejectRead;
      const stopped=new Promise((_,reject)=>{rejectRead=reject;});
      const stop=error=>{if(finished)return;rejectRead(error);controller.abort();};
      const cancel=()=>stop(failure('Quote replaced. Refresh the quote.','quote_replaced'));
      pending.add(cancel);
      timer=later(()=>stop(failure('The route read timed out. Retry the quote.','quote_timeout')),timeoutMs);
      try {
        // The race includes response.json(), not just the response headers.
        return await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw failure('Quote replaced. Refresh the quote.','quote_replaced');return work(controller.signal);}),stopped]);
      } finally {finished=true;clear(timer);pending.delete(cancel);}
    },
    cancel(){for(const cancel of pending)cancel();}
  };
}
