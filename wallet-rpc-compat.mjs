const providers=new WeakMap();
export function compatibleWalletProvider(provider){
 if(providers.has(provider))return providers.get(provider);
 if(!provider||typeof provider!=='object'||!['request','on','removeListener'].every(k=>typeof provider[k]==='function'))throw TypeError('Invalid provider');
 const wrapper=Object.freeze({
  async request(args){
   const method=args.method,result=await provider.request(args);
   if(method==='eth_getTransactionCount'&&typeof result==='number'){
    if(!Number.isSafeInteger(result)||result<0||Object.is(result,-0))throw TypeError('Invalid wallet transaction count');
    return '0x'+result.toString(16);
   }
   return result;
  },
  on(event,listener){return provider.on(event,listener);},
  removeListener(event,listener){return provider.removeListener(event,listener);}
 });providers.set(provider,wrapper);return wrapper;
}
