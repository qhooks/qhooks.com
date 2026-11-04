// Lead-owned exact CREATE graph and account-domain binding. No RPC/signing/sends.
import {canonicalGraduationConstructor} from '../../prototypes/pq-graduation/client/graduation-constructor.mjs';
import {predictGraduationCreate,hash,bytes,ownFields} from '../../prototypes/pq-graduation/client/graduation-setup-plan.mjs';
import {abiEncode} from '../launchpad/abi-encode.mjs';
import {networkProfile} from '../multichain/profiles.mjs';
import {readLaunchToolkit,LAUNCH_BLOCKS} from './artifact.mjs';
import {createLaunchRuntime} from './runtime.mjs';
const ensure=(ok,m)=>{if(!ok)throw new TypeError(m);},address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0{40}$/.test(x);
const baseProps=['verifier','owner','publicKey','manager','currency0','currency1','quote','notice','collector'];
const baseTypes=['address','address','bytes32','address','address','address','address','uint64','address'];
// Blocks launches add the blocks contract (zero when the creator picked none) as a tenth constructor argument.
export const launchConstructorProps=()=>LAUNCH_BLOCKS?[...baseProps,'blocks']:baseProps;
const launchConstructorTypes=()=>LAUNCH_BLOCKS?[...baseTypes,'address']:baseTypes;
const zeroAddress='0x'+'0'.repeat(40);
const word=v=>'0x'+BigInt(v).toString(16).padStart(64,'0');
const tag=s=>'0x'+Array.from(new TextEncoder().encode(s),b=>b.toString(16).padStart(2,'0')).join('').padEnd(64,'0');
const moduleId=tag('QHOOKS/QGRAD/SLH128S/V1'),profileId=tag('SLH-DSA-SHA2-128s/FIPS205');
export function canonicalLaunchConstructor(input){
 ensure(input&&Object.hasOwn(input,'blocks')===LAUNCH_BLOCKS,'Launch generation differs from this pool');
 const props=launchConstructorProps(),c=ownFields(input,props),base=canonicalGraduationConstructor(Object.fromEntries(baseProps.slice(0,-1).map(k=>[k,c[k]])));
 ensure(address(c.collector)&&![base.verifier,base.owner,base.manager,base.currency0,base.currency1].includes(c.collector),'Distinct protocol collector required');
 if(!LAUNCH_BLOCKS)return Object.freeze({...base,collector:c.collector});
 ensure(c.blocks===zeroAddress||address(c.blocks)&&![base.verifier,base.owner,base.manager,base.currency0,base.currency1,c.collector].includes(c.blocks),'Distinct blocks contract required');
 return Object.freeze({...base,collector:c.collector,blocks:c.blocks});
}
export function launchControllerGraph({chainId,nonce,constructor}){
 networkProfile(chainId);const c=canonicalLaunchConstructor(constructor);
 ensure(typeof nonce==='string'&&nonce.length<=20&&/^(0|[1-9][0-9]*)$/.test(nonce)&&BigInt(nonce)<(1n<<64n)-1n,'Canonical controller nonce required');
 const controller=predictGraduationCreate(c.owner,BigInt(nonce)),escrow=predictGraduationCreate(controller,1n),factory=predictGraduationCreate(controller,2n);
 const identities=[c.owner,c.verifier,c.manager,c.currency0,c.currency1,c.collector,controller,escrow,factory];ensure(new Set(identities).size===identities.length,'Launch graph collision');
 const accountId=hash(bytes(abiEncode(['uint256','address','bytes32','bytes32','address','bytes32'],[chainId,controller,moduleId,profileId,c.owner,c.publicKey])));
 return Object.freeze({chainId,nonce,constructor:c,controller,escrow,factory,accountId});
}
export async function prepareLaunchController({chainId,nonce,constructor,toolkitText,metadataText}){
 const g=launchControllerGraph({chainId,nonce,constructor}),c=g.constructor,toolkit=await readLaunchToolkit(toolkitText),runtime=await createLaunchRuntime({toolkitText,metadataText});
 const bindings={
  controller:{collector:word(c.collector),manager:word(c.manager),currency0:word(c.currency0),currency1:word(c.currency1),quoteCurrency:word(c.quote),escrow:word(g.escrow),hookFactory:word(g.factory),noticeSeconds:word(c.notice),owner:word(c.owner),publicKey:c.publicKey,accountId:g.accountId,verifier:word(c.verifier)},
  escrow:{controller:word(g.controller),payer:word(c.owner),manager:word(c.manager),currency0:word(c.currency0),currency1:word(c.currency1)},
  factory:{controller:word(g.controller),escrow:word(g.escrow),collector:word(c.collector),manager:word(c.manager),currency0:word(c.currency0),currency1:word(c.currency1),quote:word(c.quote),...(LAUNCH_BLOCKS?{blocks:word(c.blocks)}:{})},
  collector:{manager:word(c.manager),currency0:word(c.currency0),currency1:word(c.currency1)},verifier:{}
 };
 const data=toolkit.contracts.controller.bytecode+abiEncode(launchConstructorTypes(),launchConstructorProps().map(k=>c[k])).slice(2);ensure(data.length<=98306,'Controller initcode too large');
 const expected=Object.freeze(Object.fromEntries(Object.entries(bindings).map(([stage,v])=>[stage,runtime.expected(stage,v)])));
 return Object.freeze({graph:g,data,expected,artifactSha256:toolkit.sha256});
}
