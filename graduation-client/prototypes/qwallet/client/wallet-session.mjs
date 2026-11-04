export function createWalletSession(p,onInvalidate=()=>{}) {
  if(!p||['request','on','removeListener'].some(k=>typeof p[k]!=='function')||typeof onInvalidate!=='function')throw new TypeError('Invalid wallet provider');
  const s={revision:0,dead:false,snapshot:null,busy:false};
  const A=a=>{
    if(!Array.isArray(a)||a.length<1||a.length>100||a.some(v=>typeof v!=='string'||!/^0x[0-9a-f]{40}$/i.test(v)||/^0x0{40}$/i.test(v)))throw new TypeError('Invalid wallet accounts');
    return a[0].toLowerCase();
  };
  const C=v=>{
    if(typeof v!=='string'||v.length>66||!/^0x[1-9a-f][0-9a-f]*$/i.test(v))throw new TypeError('Invalid chain ID');
    return BigInt(v).toString();
  };
  const invalidate=()=>{s.revision++;s.snapshot=null;try{onInvalidate();}catch{/* State invalidation must finish. */}};
  const events=['accountsChanged','chainChanged','disconnect'];
  const h={
    async connect(){
      if(s.dead||s.busy)throw new Error('Connection unavailable');
      s.busy=true;invalidate();const rev=s.revision;
      try{
        const a=A(await p.request({method:'eth_requestAccounts'}));
        const c=C(await p.request({method:'eth_chainId'}));
        const b=A(await p.request({method:'eth_accounts'}));
        if(s.dead||rev!==s.revision||a!==b)throw new Error('Stale connection');
        return s.snapshot=Object.freeze({owner:a,chainId:c,revision:s.revision});
      }catch{throw new Error('Connection could not be established');}
      finally{s.busy=false;}
    },
    async refresh(e){
      try{
        if(!e||e!==s.snapshot||s.dead)throw new Error('Stale connection');
        const c=C(await p.request({method:'eth_chainId'}));
        const a=A(await p.request({method:'eth_accounts'}));
        if(s.dead||e!==s.snapshot||e.revision!==s.revision||c!==e.chainId||a!==e.owner)throw new Error('Stale connection');
        return e;
      }catch{invalidate();throw new Error('Stale connection');}
    },
    invalidate,
    dispose(){
      if(s.dead)return;s.dead=true;invalidate();
      for(const event of events){try{p.removeListener(event,invalidate);}catch{/* Other listeners still need removal. */}}
    },
    get current(){return s.snapshot;},
    get revision(){return s.revision;}
  };
  for(const event of events)p.on(event,invalidate);
  return Object.freeze(h);
}
