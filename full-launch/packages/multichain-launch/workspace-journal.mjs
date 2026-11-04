// Structural import only; every saved deployment/action is subsequently re-read
// by its accepted adapter. Saved status never establishes confirmation authority.
import {ensure,shape,freeze} from '../token-launch/artifact.mjs';
import {normalizeWorkspaceFields} from './workspace-fields.mjs';
import {LAUNCH_TOOLKIT_SHA,LEGACY_LAUNCH_TOOLKIT_SHA,LAUNCH_BLOCKS} from './artifact.mjs';
import {LAUNCH_IMMUTABLES_SHA,LEGACY_LAUNCH_IMMUTABLES_SHA} from './runtime.mjs';
import {TOKEN_ARTIFACT_SHA} from '../token-launch/artifact.mjs';
import {LAUNCH_DEPENDENCY_POLICY_SHA} from './dependencies.mjs';
const baseDeployments=Object.freeze(['token','verifier','collector','controller']),blocksDeployments=Object.freeze(['token','verifier','collector','blocks','controller']);
// Follows the selected launch generation: blocks launches deploy their blocks contract before the controller.
export const launchDeployments=new Proxy([],{get(_,p){const a=LAUNCH_BLOCKS?blocksDeployments:baseDeployments,v=Reflect.get(a,p);return typeof v==='function'?v.bind(a):v;},has(_,p){return Reflect.has(LAUNCH_BLOCKS?blocksDeployments:baseDeployments,p);}});
const deploymentIds=()=>[...(LAUNCH_BLOCKS?blocksDeployments:baseDeployments)];
const canonicalHex=(x,n)=>typeof x==='string'&&x.length===n&&x.startsWith('0x')&&!/[^0-9a-f]/.test(x.slice(2))&&BigInt(x)!==0n;
export function newWorkspaceJournal({chainId,owner,publicKey,fields,quoteDecimals}){
 ensure(canonicalHex(owner,42)&&canonicalHex(publicKey,66),'Canonical owner and quantum key required');
 return {version:1,kind:'qhooks-full-launch',chainId,owner,publicKey,fields:normalizeWorkspaceFields(fields,quoteDecimals),artifacts:{toolkit:LAUNCH_TOOLKIT_SHA,metadata:LAUNCH_IMMUTABLES_SHA,token:TOKEN_ARTIFACT_SHA,dependencies:LAUNCH_DEPENDENCY_POLICY_SHA},deployments:Object.fromEntries(deploymentIds().map(k=>[k,[]])),pools:null,actions:[]};
}
export function parseWorkspaceJournal(text,{chainId,owner,quoteDecimals}){
 ensure(typeof text==='string'&&text.length>0&&text.length<=2000000,'Bounded public launch progress required');const j=JSON.parse(text);
 ensure(shape(j,['version','kind','chainId','owner','publicKey','fields','artifacts','deployments','pools','actions'])&&j.version===1&&j.kind==='qhooks-full-launch'&&j.chainId===chainId&&j.owner===owner,'Launch progress identity mismatch');
 const base=newWorkspaceJournal({chainId,owner,publicKey:j.publicKey,fields:j.fields,quoteDecimals});const legacy={...base.artifacts,toolkit:LEGACY_LAUNCH_TOOLKIT_SHA,metadata:LEGACY_LAUNCH_IMMUTABLES_SHA};ensure((JSON.stringify(j.artifacts)===JSON.stringify(base.artifacts)||JSON.stringify(j.artifacts)===JSON.stringify(legacy))&&JSON.stringify(j.fields)===JSON.stringify(base.fields),'Fixed artifact/configuration binding mismatch');
 ensure(shape(j.deployments,deploymentIds()),'Exact launch stages required');
 for(const id of deploymentIds()){const rows=j.deployments[id];ensure(Array.isArray(rows)&&rows.length<=8,'Bounded deployment attempts required');for(const row of rows)ensure(row&&Object.getPrototypeOf(row)===Object.prototype,'Public deployment data required');}
 ensure(Array.isArray(j.actions)&&j.actions.length<=64,'Bounded public action history required');for(const row of j.actions)ensure(row&&Object.getPrototypeOf(row)===Object.prototype,'Public action data required');
 ensure(j.pools===null||shape(j.pools,['source','destination']),'Exact pool descriptor pair required');return freeze(j);
}
