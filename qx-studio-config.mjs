import {normalizeWorkspaceFields} from './full-launch/packages/multichain-launch/workspace-fields.mjs';
import {chainById} from './chains.mjs';
import {stockPair} from './full-launch/packages/multichain-launch/stock-pairs.mjs';
const OWNER='0x0000000000000000000000000000000000000001';
export const STUDIO_CONFIG_LIMIT=12000;
const ensure=(ok,m)=>{if(!ok)throw Error(m);};
export function normalizeStudioConfiguration(input){
 ensure(input&&typeof input==='object'&&!Array.isArray(input),'Choose a public Studio configuration.');
 ensure(Object.keys(input).sort().join(',')==='chainId,fields,kind,pair,version'&&input.kind==='qhooks-expert-studio'&&input.version===1,'Unsupported Studio configuration.');
 const chain=chainById(input.chainId);ensure(chain&&['4663','8453','1','42161','56'].includes(chain.id),'Choose a Studio launch chain.');
 ensure(typeof input.pair==='string','Invalid quote pair.');const pair=input.pair?stockPair(chain.id,input.pair):null;ensure(!input.pair||pair,'Unsupported quote pair.');
 const blocks=input.fields?.blocks;ensure(typeof blocks==='string','Public blocks configuration required.');
 const fields=normalizeWorkspaceFields({...input.fields,blocks:blocks.replaceAll('"@owner"',JSON.stringify(OWNER))},pair?.decimals??chain.quote.decimals);
 return {kind:input.kind,version:1,chainId:chain.id,pair:input.pair,fields:{...fields,blocks}};
}
export function readStudioConfiguration(text){ensure(typeof text==='string'&&text.length<=STUDIO_CONFIG_LIMIT,'Choose a Studio JSON under 12 KB.');return normalizeStudioConfiguration(JSON.parse(text));}
export function studioAgentArguments(input){const c=normalizeStudioConfiguration(input);return {name:c.fields.tokenName,ticker:c.fields.symbol,chain:c.chainId,configuration:JSON.stringify(c)};}
export function normalizeStudioAgent(args){
 ensure(args&&typeof args==='object'&&!Array.isArray(args)&&Object.keys(args).every(k=>['name','ticker','chain','style','configuration','referrer'].includes(k)),'Unexpected agent launch arguments.');
 const c=readStudioConfiguration(args.configuration);ensure(args.name===c.fields.tokenName&&args.ticker===c.fields.symbol&&String(args.chain)===c.chainId,'Agent identity and configuration must match.');
 ensure(args.style===undefined,'A Studio configuration already defines its blocks; omit style.');return c;
}
export function studioConfigurationLink(input){const c=normalizeStudioConfiguration(input),bytes=new TextEncoder().encode(JSON.stringify(c));let s='';for(const b of bytes)s+=String.fromCharCode(b);return 'https://qhooks.com/qtoken-studio?chain='+c.chainId+'#studio='+btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function studioConfigurationFromHash(hash){const raw=/^#studio=([A-Za-z0-9_-]+)$/.exec(hash||'');if(!raw)return null;ensure(raw[1].length<=STUDIO_CONFIG_LIMIT*2,'Studio link is too large.');const bytes=Uint8Array.from(atob(raw[1].replaceAll('-','+').replaceAll('_','/')),s=>s.charCodeAt(0));return readStudioConfiguration(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
