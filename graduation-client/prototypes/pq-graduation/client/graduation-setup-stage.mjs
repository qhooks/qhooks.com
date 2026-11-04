function shape(value,names){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new TypeError('Plain object required');
 const d=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(d);
 if(keys.length!==names.length||keys.some(k=>!names.includes(k))||names.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))throw new TypeError('Exact own data fields');
}
const quantity=x=>typeof x==='string'&&x.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x);
export function assertGraduationSetupStage(s,owner){
 shape(s,['schemaVersion','planId','transaction','expectedContractAddress','status','hash']);
 if(s.schemaVersion!==1)throw new TypeError('schemaVersion===1');
 if(typeof s.planId!=='string'||!/^0x[0-9a-f]{64}$/.test(s.planId))throw new TypeError('planId');
 if(typeof s.expectedContractAddress!=='string'||!/^0x[0-9a-f]{40}$/.test(s.expectedContractAddress)||/^0x0{40}$/.test(s.expectedContractAddress))throw new TypeError('expectedContractAddress');
 const st=s.status;
 if(!['pending','submitting','unknown','submitted','confirmed','reverted','rejected'].includes(st))throw new TypeError('status');
 if(['submitted','confirmed','reverted'].includes(st)?typeof s.hash!=='string'||!/^0x[0-9a-f]{64}$/.test(s.hash):s.hash!==null)throw new TypeError('hash');
 const t=s.transaction;shape(t,['chainId','from','to','input','value','nonce','gas']);
 if(t.chainId!=='0x7a69'||t.from!==owner||t.to!==null||t.value!=='0x0')throw new TypeError('Transaction scope');
 if(typeof t.input!=='string'||t.input.length<2||t.input.length>98306||!/^0x(?:[0-9a-f]{2})*$/.test(t.input))throw new TypeError('input');
 if(!quantity(t.nonce)||!quantity(t.gas)||BigInt(t.gas)===0n||BigInt(t.gas)>29000000n)throw new TypeError('nonce or gas');
 if(typeof owner!=='string'||!/^0x[0-9a-f]{40}$/.test(owner)||/^0x0{40}$/.test(owner))throw new TypeError('owner');
 return s;
}
