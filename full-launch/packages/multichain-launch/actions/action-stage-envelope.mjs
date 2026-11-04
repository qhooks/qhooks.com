// Lead repair after L73-C01's bounded local worker timed out with no source.
// Data-only parser; validates public transaction fields, not chain outcomes.
const fail=()=>{throw new TypeError('Invalid connected action stage');};
function exact(o,names){
 if(!o||Object.getPrototypeOf(o)!==Object.prototype)fail();const d=Object.getOwnPropertyDescriptors(o),keys=Reflect.ownKeys(d);
 if(keys.length!==names.length||keys.some(k=>typeof k!=='string'||!names.includes(k)||!d[k].enumerable||!Object.hasOwn(d[k],'value')))fail();
 return Object.fromEntries(names.map(k=>[k,d[k].value]));
}
const hex=(v,length)=>typeof v==='string'&&v.length===length&&v.startsWith('0x')&&!/[^0-9a-f]/.test(v.slice(2));
function quantity(v){if(typeof v!=='string'||v.length<3||v.length>66||!v.startsWith('0x')||/[^0-9a-f]/.test(v.slice(2)))fail();const n=BigInt(v);if('0x'+n.toString(16)!==v)fail();return n;}
export function parseActionStage(input,policy,owner){
 const s=exact(input,['transaction','status','hash']),t=exact(s.transaction,'type chainId from to data value nonce gas maxFeePerGas maxPriorityFeePerGas'.split(' '));
 if(!hex(owner,42)||t.type!=='0x2'||t.chainId!==policy.hexId||t.from!==owner||t.value!=='0x0'||!hex(t.to,42)||BigInt(t.to)===0n)fail();
 if(typeof t.data!=='string'||t.data.length<2||t.data.length>98306||t.data.length%2||!t.data.startsWith('0x')||/[^0-9a-f]/.test(t.data.slice(2)))fail();
 const n=quantity(t.nonce),g=quantity(t.gas),f=quantity(t.maxFeePerGas),tip=quantity(t.maxPriorityFeePerGas);
 if(n>=(1n<<64n)-1n||g===0n||g>policy.maxGas||f===0n||f>policy.maxPrice||tip>f)fail();
 if(!['pending','submitting','unknown','submitted','confirmed','reverted','rejected'].includes(s.status))fail();
 if(['submitted','confirmed','reverted'].includes(s.status)?!hex(s.hash,66):s.hash!==null)fail();
 return {transaction:t,status:s.status==='submitting'?'unknown':s.status,hash:s.hash};
}
