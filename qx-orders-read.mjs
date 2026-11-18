import {createReadFetch} from './qx-community-retry.mjs';
export async function readOwnedOrders(me, {required=false,fetcher=globalThis.fetch}={}) {
 fetcher=createReadFetch(fetcher);
  try {
    if(!/^0x[0-9a-f]{40}$/i.test(me||'')){if(required)throw Error('Connect to read your orders.');return [];}
    const r=await fetcher('/api/orders?trader='+me,{cache:'no-store'});
    if(!r.ok){if(required)throw Error('Orders read failed');return [];}
    const body=await r.json();
    if(required){
      if(!Array.isArray(body.orders))throw Error('Orders are incomplete');
      for(const x of body.orders)if(x?.status==='open'){
        const o=x.order;
        if(typeof x.chainId!=='string'||!/^\d+$/.test(x.chainId)||!/^0x[0-9a-f]{40}$/i.test(o?.tokenIn||'')||!/^\d+$/.test(String(o?.amountIn))||!/^\d+$/.test(String(o?.nonce)))throw Error('Orders are incomplete');
      }
    }
    return body.orders||[];
  }catch(e){if(required)throw Object.assign(Error('order_reservations_refresh',{cause:e}),{code:'order_reservations_refresh'});throw e;}
}
