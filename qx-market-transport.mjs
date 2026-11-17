import{validMarketState,applyMarketArrays}from'./qx-market-array.mjs';
const REV=/^m1-[0-9a-f]{64}$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validData=v=>plain(v)&&plain(v.meta)&&Object.hasOwn(v,'summary')&&Object.keys(v).length<=64&&!Object.hasOwn(v,'__proto__');
const copy=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const abortError=()=>new DOMException('The market read was cancelled.','AbortError');
const protocolError=()=>Error('Market data could not be reconciled. Refresh to retry.');
const manifest=body=>validMarketState(body.state)&&JSON.stringify(body.state).length<=4096?JSON.stringify(body.state):null;

export function createMarketTransport({fetcher=(...args)=>globalThis.fetch(...args),origin=globalThis.location?.origin||'https://qhooks.com',maxEntries=4}={}){
  const snapshots=new Map(),inflight=new Map();
  function remember(key,snapshot){snapshots.delete(key);snapshots.set(key,snapshot);while(snapshots.size>maxEntries)snapshots.delete(snapshots.keys().next().value);}
  async function execute(input,init,key,signal){
    const previous=snapshots.get(key);
    for(let attempt=0;attempt<2;attempt++){
      const headers=new Headers(init.headers);headers.set('x-qhooks-market-protocol','1');if(!attempt&&previous){headers.set('x-qhooks-market-base',previous.revision);if(previous.manifest)headers.set('x-qhooks-market-state',previous.manifest);}
      const response=await fetcher(input,{...init,headers,signal});if(signal.aborted)throw abortError();
      if(!response.ok)throw Object.assign(Error(response.status===404?'This launch is not listed yet.':'Refreshing market data…'),{status:response.status});
      const body=await response.json();if(signal.aborted)throw abortError();
      if(response.headers.get('x-qhooks-market-protocol')!=='1'){
        if(!validData(body))throw protocolError();snapshots.delete(key);return body;
      }
      if(!plain(body)||body.version!==1||body.key!==key||!REV.test(body.revision||''))throw protocolError();
      if(body.kind==='full'){
        if(!validData(body.data))throw protocolError();remember(key,{revision:body.revision,manifest:manifest(body),state:body.state,data:body.data});return body.data;
      }
      if(previous&&body.base===previous.revision){
        let data;
        if(body.kind==='same'&&body.revision===body.base)data=previous.data;
        else if(body.kind==='delta'&&plain(body.set)&&Array.isArray(body.remove)&&Object.keys(body.set).length<=64&&body.remove.length<=64&&!Object.hasOwn(body.set,'__proto__')&&body.remove.every(k=>typeof k==='string'&&k!=='__proto__')){
          try{
            const arrays=body.arrays===undefined?{}:applyMarketArrays(previous.data,previous.state,body.arrays);
            if(Object.keys(arrays).some(name=>Object.hasOwn(body.set,name)||body.remove.includes(name)))throw protocolError();
            data=Object.fromEntries([...Object.entries(previous.data).filter(([k])=>!body.remove.includes(k)),...Object.entries(body.set),...Object.entries(arrays)]);
          }catch{}
        }
        if(validData(data)){remember(key,{revision:body.revision,manifest:manifest(body),state:body.state,data});return data;}
      }
      // One protocol resync, never a provider-error retry or a last-good success.
      if(attempt)throw protocolError();
    }
  }
  function wait(job,signal){
    if(signal?.aborted){if(!job.users)job.controller.abort();return Promise.reject(abortError());}job.users++;
    return new Promise((resolve,reject)=>{
      let done=false;
      const settle=(fn,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',cancel);job.users--;fn(value);};
      const cancel=()=>{settle(reject,abortError());if(!job.users)job.controller.abort();};
      signal?.addEventListener('abort',cancel,{once:true});
      job.promise.then(data=>{try{settle(resolve,copy(data));}catch(error){settle(reject,error);}},error=>settle(reject,error));
    });
  }
  return async function readMarket(input,init={}){
    if(init.signal?.aborted)throw abortError();
    const u=new URL(input,origin),key=u.pathname+u.search;
    if(u.username||u.password||u.hash||u.origin!==new URL(origin).origin||!/^\/api\/terminal\/market\/\d+\/0x[\da-f]{40}$/i.test(u.pathname)||[...u.searchParams.keys()].some(k=>k!=='tf')||u.searchParams.getAll('tf').length>1||(u.searchParams.has('tf')&&!/^\d{1,6}$/.test(u.searchParams.get('tf')))||(init.method||'GET')!=='GET'||Object.keys(init).some(k=>!['method','cache','headers','signal'].includes(k))||[...new Headers(init.headers).keys()].some(k=>k!=='accept'))throw protocolError();
    let job=inflight.get(key);
    if(job?.controller.signal.aborted){inflight.delete(key);job=null;}
    if(!job){
      if(inflight.size>=maxEntries)throw Error('Too many markets are loading. Retry in a moment.');
      job={users:0,controller:new AbortController()};
      job.promise=execute(input,init,key,job.controller.signal).finally(()=>{if(inflight.get(key)===job)inflight.delete(key);});inflight.set(key,job);
    }
    return wait(job,init.signal);
  };
}
export const readMarket=createMarketTransport();
