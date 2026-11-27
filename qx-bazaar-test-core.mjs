export const BASE={network:'eip155:8453',asset:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',payTo:'0xaf48a5ab32ef96ee7a72ed6ed4534be1bc928c73'};
export const ROUTES={stored:{path:'/api/x402/v1/qproof',amount:'20000'},fresh:{path:'/api/x402/v1/qproof/scan',amount:'250000'}};
export const decode=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0))));
export const encode=value=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));
export function validateChallenge(challenge,url,mode){
  const offer=challenge?.accepts?.find(a=>a.network===BASE.network);
  if(challenge?.x402Version!==2||challenge.resource?.url!==url||!challenge.extensions?.bazaar||offer?.scheme!=='exact'||offer.asset?.toLowerCase()!==BASE.asset||offer.payTo?.toLowerCase()!==BASE.payTo||offer.amount!==ROUTES[mode]?.amount||!Number.isInteger(offer.maxTimeoutSeconds)||offer.maxTimeoutSeconds<30||offer.maxTimeoutSeconds>120||offer.extra?.name!=='USD Coin'||offer.extra?.version!=='2'||offer.extra?.assetTransferMethod!=='eip3009')throw Error('The Base USDC offer does not match this purchase. Nothing was signed.');
  return offer;
}
export function typedAuthorization(offer,from,now=Date.now(),random=bytes=>crypto.getRandomValues(bytes)){
  const t=Math.floor(now/1000);
  return {domain:{name:offer.extra.name,version:offer.extra.version,chainId:8453,verifyingContract:offer.asset},primaryType:'TransferWithAuthorization',types:{
    EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],
    TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}],
  },message:{from,to:offer.payTo,value:offer.amount,validAfter:'0',validBefore:String(t+offer.maxTimeoutSeconds-10),nonce:'0x'+Array.from(random(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')}};
}
export function createPurchase({hub,fetcher=(...args)=>fetch(...args),storage=globalThis.sessionStorage,now=Date.now,random,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  let busy=false;
  async function guard(current){
    const c=hub.snapshot().current;
    if(!c||c.owner!==current.owner||c.entry.provider!==current.entry.provider)throw Error('Wallet changed. Reconnect before continuing.');
    const p=c.entry.provider,accounts=await p.request({method:'eth_accounts'}),chain=await p.request({method:'eth_chainId'});
    if(accounts?.[0]?.toLowerCase()!==c.owner.toLowerCase()||Number(chain)!==8453)throw Error('Connect your wallet on Base.');
  }
  return async function purchase(mode,chain,address){
    if(busy)throw Error('A payment is already in progress.');
    if(!ROUTES[mode]||!/^[1-9][0-9]*$/.test(chain)||!/^0x[0-9a-f]{40}$/i.test(address)||BigInt(address)===0n)throw Error('Enter an EVM chain ID and token contract address.');
    busy=true;
    try{
      const url='https://qhooks.com'+ROUTES[mode].path+'?'+new URLSearchParams({chain,address:address.toLowerCase()});
      const key='qhooks:bazaar-payment:'+url;
      // Read before any wallet prompt. Uncertain submissions reuse the signed
      // header in this tab; a reload never silently creates another payment.
      let saved=JSON.parse(storage.getItem(key)||'null');
      if(saved?.result)return saved.result;
      const c=hub.snapshot().current;
      if(!c)throw Error('Connect a wallet first.');
      await guard(c);
      if(saved&&saved.payer!==c.owner.toLowerCase())throw Error('Use the wallet that signed this saved payment.');
      if(!saved){
        storage.setItem(key+':check','1');if(storage.getItem(key+':check')!=='1')throw Error('Payment recovery storage is unavailable.');storage.removeItem(key+':check');
        const r=await fetcher(url,{method:'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});
        if(r.status!==402)throw Error('This report is not ready for purchase ('+r.status+'). Nothing was signed.');
        const challenge=decode(r.headers.get('payment-required')),accepted=validateChallenge(challenge,url,mode);
        const date=Date.parse(r.headers.get('date')||''),offset=Number.isFinite(date)?date-now():0;
        const typed=typedAuthorization(accepted,c.owner,now()+offset,random);
        await guard(c);
        const signature=await c.entry.provider.request({method:'eth_signTypedData_v4',params:[c.owner,JSON.stringify(typed)]});
        await guard(c);
        if(!/^0x[0-9a-f]{130}$/i.test(signature||''))throw Error('Wallet returned an invalid signature. Nothing was sent.');
        if(now()+offset>=Number(typed.message.validBefore)*1000-5000)throw Error('Authorization expired before submission. Nothing was sent.');
        saved={payer:c.owner.toLowerCase(),header:encode({x402Version:2,resource:challenge.resource,accepted,payload:{authorization:typed.message,signature},extensions:challenge.extensions})};
        const text=JSON.stringify(saved);storage.setItem(key,text);if(storage.getItem(key)!==text)throw Error('Could not save payment recovery. Nothing was sent.');
      }
      let r,body;
      for(let attempt=0;attempt<6;attempt++){
        r=await fetcher(url,{method:'GET',headers:{'PAYMENT-SIGNATURE':saved.header},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000)});
        body=await r.json();
        if(r.status!==202||attempt===5)break;
        const delay=Number(r.headers.get('retry-after'));
        await wait(Math.max(1000,Math.min(5000,Number.isFinite(delay)&&delay>0?delay*1000:3000)));
      }
      // CDPFIX2: a 402 after signing is a refused payment, not an uncertain one: clear the saved header and say why.
      const REASONS={self_send_not_allowed:'This wallet is the payee. Pay from a different wallet.',insufficient_funds:'This wallet needs at least the price in USDC on Base.',invalid_signature:'The wallet signature was not accepted. Try again.'};
      if(r.status===402){storage.removeItem(key);throw Error((REASONS[body?.error]||'The payment was not accepted ('+(body?.error||'402')+').')+' Nothing was charged.');}
      if(r.status!==200)throw Error('Payment status '+r.status+'. Tap the same route to check the saved authorization; no new signature will be requested.');
      const receipt=decode(r.headers.get('payment-response'));
      if(receipt.success!==true||receipt.network!==BASE.network||receipt.payer?.toLowerCase()!==saved.payer||!/^0x[0-9a-f]{64}$/i.test(receipt.transaction||'')||body.subject?.address?.toLowerCase()!==address.toLowerCase())throw Error('Receipt could not be confirmed. Keep this tab and check the same payment.');
      const result={body,transaction:receipt.transaction};
      storage.setItem(key,JSON.stringify({...saved,result}));return result;
    }finally{busy=false;}
  };
}
