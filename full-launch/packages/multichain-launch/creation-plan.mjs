// Fixed constructors and full expected runtime graph for each explicit setup step.
import {abiEncode} from '../launchpad/abi-encode.mjs';
import {readLaunchToolkit} from './artifact.mjs';
import {createLaunchRuntime} from './runtime.mjs';
import {canonicalLaunchConstructor,prepareLaunchController,launchConstructorProps} from './graph.mjs';
import {normalizeBlocks,encodeBlocksConstructor} from './launch-blocks.mjs';
import {LAUNCH_BLOCKS} from './artifact.mjs';
import {predictGraduationCreate,ownFields} from '../../prototypes/pq-graduation/client/graduation-setup-plan.mjs';
import {networkProfile} from '../multichain/profiles.mjs';
const ensure=(ok,m)=>{if(!ok)throw new TypeError(m);},address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0{40}$/.test(x),word=x=>'0x'+BigInt(x).toString(16).padStart(64,'0');
export function normalizeLaunchCreation(stage,input,owner){
 ensure(address(owner),'Connected owner required');
 if(stage==='controller'){const c=canonicalLaunchConstructor(input);ensure(c.owner===owner,'Controller owner differs from wallet');return c;}
 if(stage==='verifier')return Object.freeze(ownFields(input,[]));
 if(stage==='blocks'){ensure(LAUNCH_BLOCKS,'This launch generation has no blocks');const c=ownFields(input,['token','quote','config']);ensure(address(c.token)&&address(c.quote)&&c.token!==c.quote&&![c.token,c.quote].includes(owner),'Blocks need the launch token and quote');ensure(normalizeBlocks(c.config)===c.config&&c.config!=='','Canonical blocks configuration required');return Object.freeze(c);}
 ensure(stage==='collector','Known launch creation stage required');const c=ownFields(input,['manager','currency0','currency1']);
 ensure(Object.values(c).every(address)&&new Set([owner,...Object.values(c)]).size===4&&BigInt(c.currency0)<BigInt(c.currency1),'Distinct sorted collector binding required');return Object.freeze(c);
}
export async function launchCreationInput({stage,fields,owner,toolkitText}){
 const c=normalizeLaunchCreation(stage,fields,owner),a=await readLaunchToolkit(toolkitText);
 if(stage==='blocks')return a.contracts.blocks.bytecode+encodeBlocksConstructor(c.config,c.token,c.quote);
 const names=stage==='controller'?launchConstructorProps():stage==='collector'?['manager','currency0','currency1']:[];
 const types=stage==='controller'?['address','address','bytes32','address','address','address','address','uint64','address','address'].slice(0,names.length):names.map(()=>'address');
 return a.contracts[stage].bytecode+(names.length?abiEncode(types,names.map(n=>c[n])).slice(2):'');
}
export async function prepareLaunchCreation({chainId,stage,fields,owner,nonce,toolkitText,metadataText}){
 networkProfile(chainId);const c=normalizeLaunchCreation(stage,fields,owner);
 ensure(typeof nonce==='string'&&nonce.length<=20&&/^(0|[1-9][0-9]*)$/.test(nonce)&&BigInt(nonce)<(1n<<64n)-1n,'Canonical creation nonce required');
 if(stage==='controller'){
  const p=await prepareLaunchController({chainId,nonce,constructor:c,toolkitText,metadataText});
  return Object.freeze({address:p.graph.controller,graph:p.graph,data:p.data,contracts:Object.freeze({[p.graph.controller]:p.expected.controller,[p.graph.escrow]:p.expected.escrow,[p.graph.factory]:p.expected.factory,[c.verifier]:p.expected.verifier,[c.collector]:p.expected.collector})});
 }
 const target=predictGraduationCreate(owner,BigInt(nonce));ensure(!Object.values(c).includes(target),'Creation address collision');
 const runtime=await createLaunchRuntime({toolkitText,metadataText});
 if(stage==='blocks')return Object.freeze({address:target,graph:null,data:await launchCreationInput({stage,fields:c,owner,toolkitText}),contracts:Object.freeze({[target]:runtime.expected('blocks',{})})});
 const values=Object.fromEntries(Object.entries(c).map(([k,v])=>[k,word(v)]));
 return Object.freeze({address:target,graph:null,data:await launchCreationInput({stage,fields:c,owner,toolkitText}),contracts:Object.freeze({[target]:runtime.expected(stage,values)})});
}
