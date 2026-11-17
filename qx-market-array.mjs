// Public observation transport only. Reuse is accepted only after the server
// hashes an unchanged segment; financial reads never use this codec.
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const exact=(value,n)=>plain(value)&&Object.keys(value).length===n;
const names=['candles','trades','holders'];
const HOLDER_BUCKETS=16;
const compareHolders=(a,b)=>a.units>b.units?-1:a.units<b.units?1:a.holder<b.holder?-1:a.holder>b.holder?1:0;
function holderBucket(address){let hash=2166136261;for(let i=0;i<address.length;i++)hash=Math.imul(hash^address.charCodeAt(i),16777619);return(hash>>>0)%HOLDER_BUCKETS;}
function holderBuckets(rows){
  if(!Array.isArray(rows)||!integer(rows.length,1,4096))return null;
  const buckets=Array.from({length:HOLDER_BUCKETS},()=>[]),seen=new Set();
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    if(!plain(row)||!/^0x[0-9a-f]{40}$/.test(row.holder)||typeof row.units!=='number'||!Number.isFinite(row.units)||row.units<0||seen.has(row.holder)||(i&&compareHolders(rows[i-1],row)>0))return null;
    seen.add(row.holder);buckets[holderBucket(row.holder)].push(row);
  }
  return buckets;
}
function validDescriptor(name,value){
  if(!plain(value)||!integer(value.n,1,10000))return false;
  if(name==='candles')return exact(value,4)&&value.codec==='tail-v1'&&integer(value.keep,1,value.n)&&hex(value.hash);
  if(name==='trades')return exact(value,6)&&value.codec==='range-v1'&&integer(value.start,0,value.n-1)&&integer(value.count,1,value.n-value.start)&&typeof value.anchor==='string'&&/^[\x21-\x7e]{1,160}$/.test(value.anchor)&&hex(value.hash);
  return name==='holders'&&exact(value,3)&&value.codec==='holders-v1'&&value.n<=4096&&Array.isArray(value.hashes)&&value.hashes.length===HOLDER_BUCKETS&&value.hashes.every(hex);
}
export function validMarketState(state){
  return exact(state,3)&&state.v===2&&plain(state.h)&&Object.keys(state.h).length<=64&&Object.entries(state.h).every(([name,hash])=>name!=='__proto__'&&name.length<=64&&hex(hash))&&plain(state.a)&&Object.entries(state.a).every(([name,value])=>names.includes(name)&&Object.hasOwn(state.h,name)&&validDescriptor(name,value));
}
export function canonicalMarketState(state){
  const sort=value=>Array.isArray(value)?value.map(sort):plain(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,sort(item)])):value;
  return sort(state);
}
export async function describeMarketArrays(data,digest){
  const descriptors={},candles=data.candles,trades=data.trades;
  if(Array.isArray(candles)&&integer(candles.length,17,10000)){
    const keep=candles.length-8;descriptors.candles={codec:'tail-v1',n:candles.length,keep,hash:await digest(JSON.stringify(candles.slice(0,keep)))};
  }
  if(Array.isArray(trades)&&integer(trades.length,20,10000)){
    const start=Math.floor(trades.length*.05),count=Math.floor(trades.length*.9),anchor=trades[start]?.id;
    if(typeof anchor==='string'&&/^[\x21-\x7e]{1,160}$/.test(anchor)&&trades.filter(row=>row?.id===anchor).length===1)descriptors.trades={codec:'range-v1',n:trades.length,start,count,anchor,hash:await digest(JSON.stringify(trades.slice(start,start+count)))};
  }
  const buckets=holderBuckets(data.holders);
  if(buckets)descriptors.holders={codec:'holders-v1',n:data.holders.length,hashes:await Promise.all(buckets.map(rows=>digest(JSON.stringify(rows))))};
  return descriptors;
}
export async function diffMarketArrays(oldState,data,changed,digest){
  const patches={};
  for(const name of names){
    const descriptor=oldState.a[name],rows=data[name];if(!descriptor||!changed.has(name)||!Array.isArray(rows)||rows.length>10000)continue;
    let patch;
    if(descriptor.codec==='tail-v1'&&rows.length>=descriptor.keep&&await digest(JSON.stringify(rows.slice(0,descriptor.keep)))===descriptor.hash)patch={codec:'tail-v1',keep:descriptor.keep,items:rows.slice(descriptor.keep)};
    else if(descriptor.codec==='range-v1'){
      const start=rows.findIndex(row=>row?.id===descriptor.anchor);
      if(start>=0&&start+descriptor.count<=rows.length&&rows.filter(row=>row?.id===descriptor.anchor).length===1&&await digest(JSON.stringify(rows.slice(start,start+descriptor.count)))===descriptor.hash)patch={codec:'range-v1',start:descriptor.start,count:descriptor.count,prefix:rows.slice(0,start),suffix:rows.slice(start+descriptor.count)};
    }else if(descriptor.codec==='holders-v1'){
      const buckets=holderBuckets(rows);
      if(buckets){
        const hashes=await Promise.all(buckets.map(items=>digest(JSON.stringify(items))));
        patch={codec:'holders-v1',buckets:Object.fromEntries(buckets.flatMap((items,index)=>hashes[index]===descriptor.hashes[index]?[]:[[index,items]]))};
      }
    }
    if(patch&&JSON.stringify(patch).length<JSON.stringify(rows).length)patches[name]=patch;
  }
  return patches;
}
export function applyMarketArrays(previous,state,patches){
  if(!validMarketState(state)||!plain(patches)||Object.keys(patches).length>3)throw Error('Invalid market array state.');
  const result={};
  for(const [name,patch]of Object.entries(patches)){
    const descriptor=state.a[name],old=previous[name];
    if(!names.includes(name)||!descriptor||!plain(patch)||patch.codec!==descriptor.codec||!Array.isArray(old)||old.length!==descriptor.n)throw Error('Invalid market array base.');
    let rows;
    if(patch.codec==='tail-v1'){
      if(!exact(patch,3)||patch.keep!==descriptor.keep||!Array.isArray(patch.items))throw Error('Invalid candle tail.');
      rows=old.slice(0,patch.keep).concat(patch.items);
    }else if(patch.codec==='range-v1'){
      if(!exact(patch,5)||patch.start!==descriptor.start||patch.count!==descriptor.count||!Array.isArray(patch.prefix)||!Array.isArray(patch.suffix))throw Error('Invalid trade range.');
      rows=patch.prefix.concat(old.slice(patch.start,patch.start+patch.count),patch.suffix);
    }else{
      const buckets=holderBuckets(old);
      if(!exact(patch,2)||!buckets||!plain(patch.buckets)||Object.entries(patch.buckets).some(([index,items])=>! /^(?:[0-9]|1[0-5])$/.test(index)||!Array.isArray(items)||items.length>4096||items.some(row=>!plain(row)||typeof row.holder!=='string'||holderBucket(row.holder)!==Number(index))))throw Error('Invalid holder buckets.');
      for(const [index,items]of Object.entries(patch.buckets))buckets[Number(index)]=items;
      rows=buckets.flat().sort(compareHolders);
      if(!holderBuckets(rows))throw Error('Invalid holder rows.');
    }
    if(rows.length>10000)throw Error('Market array is too large.');
    result[name]=rows;
  }
  return result;
}
