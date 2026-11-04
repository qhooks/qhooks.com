// Public discovery/handoff data only. This never proves runtime, liquidity or safety.
// The fixed connected-swap boundary must derive the CREATE graph and admit it onchain.
import {normalizeTokenFields} from '../token-launch/token-fields.mjs';
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
const chains=['8453','4663','1','42161','56','5042'];
function exact(value,names){
 ensure(value&&Object.getPrototypeOf(value)===Object.prototype,'Plain pool data required');
 const keys=Reflect.ownKeys(value),d=Object.getOwnPropertyDescriptors(value);
 ensure(keys.length===names.length&&keys.every(k=>typeof k==='string'&&names.includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value')),'Exact public pool fields required');
 return Object.fromEntries(names.map(k=>[k,d[k].value]));
}
function hex(value,bytes){ensure(typeof value==='string'&&value.length===2+bytes*2&&value.startsWith('0x')&&!/[^0-9a-f]/.test(value.slice(2))&&BigInt(value)>0n,'Canonical nonzero pool identity required');return value;}
function decimal(value,min,max){ensure(typeof value==='string'&&value.length>0&&value.length<=78&&!/[^0-9]/.test(value)&&BigInt(value).toString()===value&&BigInt(value)>=min&&BigInt(value)<=max,'Canonical bounded pool integer required');return value;}
export function readSwapPoolPackage(text){
 ensure(typeof text==='string'&&text.length>0&&text.length<=20000,'Bounded public pool package required');
 const p=exact(JSON.parse(text),['version','kind','chainId','controller','nonce','constructor','tokenFields']);
 ensure(p.version===1&&p.kind==='qhooks-trade-pool'&&chains.includes(p.chainId),'Unknown pool package');
 hex(p.controller,20);decimal(p.nonce,0n,(1n<<64n)-2n);
 // Blocks launches name their blocks contract (the zero address when the creator picked none).
 const withBlocks=p.constructor&&Object.hasOwn(p.constructor,'blocks');
 const c=exact(p.constructor,['verifier','owner','publicKey','manager','currency0','currency1','quote','notice','collector',...(withBlocks?['blocks']:[])]);
 if(withBlocks)ensure(typeof c.blocks==='string'&&/^0x[0-9a-f]{40}$/.test(c.blocks)&&![p.controller,c.verifier,c.owner,c.manager,c.currency0,c.currency1,c.collector].includes(c.blocks),'Canonical blocks contract required');
 for(const key of ['verifier','owner','manager','currency0','currency1','quote','collector'])hex(c[key],20);hex(c.publicKey,32);decimal(c.notice,3600n,2592000n);
 ensure(BigInt(c.currency0)<BigInt(c.currency1)&&[c.currency0,c.currency1].includes(c.quote),'Sorted token and quote pair required');
 ensure(new Set([p.controller,c.verifier,c.owner,c.manager,c.currency0,c.currency1,c.collector]).size===7,'Distinct launch graph identities required');
 const raw=exact(p.tokenFields,['tokenName','symbol','decimals','totalSupply']),fields=normalizeTokenFields(raw);
 for(const k of Object.keys(raw))ensure(raw[k]===fields[k]&&!/\r|\n|\u2028|\u2029/.test(raw[k]),'Canonical token metadata required');
 return Object.freeze({...p,constructor:Object.freeze(c),tokenFields:fields});
}
export function exportSwapPoolPackage(workspace){
 ensure(workspace&&typeof workspace.snapshot==='function'&&typeof workspace.journal==='function','Launch workspace required');
 const s=workspace.snapshot();ensure(s.completed?.includes('bootstrap')&&['1','2'].includes(s.state?.phase),'A launched pool is required');
 const text=workspace.journal();ensure(typeof text==='string'&&text.length<=2000000,'Bounded launch history required');const j=JSON.parse(text);
 ensure(j.kind==='qhooks-full-launch'&&j.chainId===s.chainId&&j.owner===s.owner&&j.publicKey===s.publicKey,'Launch snapshot/history identity differs');
 const row=j.deployments?.controller?.at(-1),stage=row?.stages?.[0],tx=stage?.transaction;
 ensure(stage?.status==='confirmed'&&typeof stage.hash==='string'&&tx?.from===s.owner&&(tx.to===undefined||tx.to===null),'Confirmed controller CREATE transaction required');
 ensure(typeof tx.nonce==='string'&&tx.nonce.length<=18&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(tx.nonce),'Canonical controller nonce required');
 const pair=[s.addresses.token,s.quote.address].sort();
 const p={version:1,kind:'qhooks-trade-pool',chainId:s.chainId,controller:s.addresses.controller,nonce:BigInt(tx.nonce).toString(),constructor:{verifier:s.addresses.verifier,owner:s.owner,publicKey:s.publicKey,manager:row.fields?.manager,currency0:pair[0],currency1:pair[1],quote:s.quote.address,notice:s.fields.notice,collector:s.addresses.collector,...(row.fields&&Object.hasOwn(row.fields,'blocks')?{blocks:s.addresses.blocks}:{})},tokenFields:Object.fromEntries(['tokenName','symbol','decimals','totalSupply'].map(k=>[k,s.fields[k]]))};
 ensure(Object.keys(p.constructor).every(k=>row.fields?.[k]===p.constructor[k]),'Controller constructor and launch snapshot differ');
 return JSON.stringify(readSwapPoolPackage(JSON.stringify(p)),null,2);
}
