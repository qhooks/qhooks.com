// A read-only comparison with the exact pinned preparation. No deployment, wallet or signing API.
import {compareRuntime,keccak} from './lab-deploy-core.mjs';
import {catalogChain} from './qx-lab-catalog-chains.mjs';
import {chainById} from './chains.mjs';
import {mountRepoProofCheck} from './qx-repoproof.mjs';
import {entrypointStyles} from './qx-repoproof-entrypoints.mjs';
const HEX=/^0x(?:[0-9a-f]{2})*$/i,ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i;
const abort=()=>Object.assign(Error('Build comparison cancelled.'),{name:'AbortError'});
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const el=(doc,tag,text,attrs={})=>{const node=doc.createElement(tag);if(text!=null)node.textContent=text;for(const[key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
function validate(prepared){
  ensure(prepared?.kind==='qhooks-prepared-catalogue-template'&&prepared.executionEnabled===false&&prepared.request?.chainId===prepared.artifact?.chainId,'Prepare the exact chain build first.');
  const profile=catalogChain(prepared.request.chainId);ensure(profile.status==='live'&&chainById(profile.chainId)?.rpc,'Choose a live catalogue chain.');
  const roles=Object.keys(prepared.artifact.contracts||{}),target=prepared.artifact.hook?'hook':'module',address=prepared.plan?.addresses?.[target];
  ensure(roles.length>0&&ADDRESS.test(address||'')&&BigInt(address)>0n&&prepared.checks?.length>0,'The prepared deployment identity is incomplete.');
  ensure(prepared.checks.every(check=>roles.includes(check.contract)&&check.to?.toLowerCase()===prepared.plan.addresses[check.contract]?.toLowerCase()&&HEX.test(check.data)&&check.data.length>=10&&/^0x(?:[0-9a-f]{64})+$/i.test(check.expectedReturn)),'The exact prepared getter checks are incomplete.');
  return{roles,target,address:address.toLowerCase(),chainId:profile.chainId,chainName:profile.name};
}
async function publicRead(chainId,method,params,{signal,fetcher=globalThis.fetch}={}){
  ensure(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call'].includes(method),'Only public read methods are allowed.');
  const response=await fetcher(chainById(chainId).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal});
  const name=catalogChain(chainId).name;ensure(response.ok,name+' public read did not answer.');const body=await response.json();ensure(!body.error&&Object.hasOwn(body,'result'),name+' public read failed.');return body.result;
}
export async function verifyPreparedDeployment(prepared,{rpc,fetcher=globalThis.fetch,signal,now=Date.now}={}){
  const{roles,target,address,chainId,chainName}=validate(prepared),read=(method,params)=>{if(signal?.aborted)throw abort();return rpc?rpc(method,params,{signal}):publicRead(chainId,method,params,{signal,fetcher});};
  ensure(await read('eth_chainId',[])==='0x'+BigInt(chainId).toString(16),'The read endpoint did not confirm '+chainName+'.');
  const block=await read('eth_getBlockByNumber',['latest',false]);ensure(/^0x[0-9a-f]+$/i.test(block?.number||'')&&HASH.test(block?.hash||''),'A canonical '+chainName+' block is unavailable.');
  const tag=block.number,contracts=await Promise.all(roles.map(async role=>{
    const to=prepared.plan.addresses[role];ensure(ADDRESS.test(to||''),'A prepared contract address is missing.');
    try{const code=await read('eth_getCode',[to,tag]);ensure(typeof code==='string'&&HEX.test(code),'Invalid deployed code response.');
      if(code==='0x')return{role,address:to,state:'not_deployed',deployed:false,comparison:null,runtimeKeccak:null};
      const comparison=compareRuntime(code,prepared.artifact.contracts[role]);return{role,address:to,state:comparison.ok?'matches':'mismatch',deployed:true,comparison,runtimeKeccak:keccak(code)};
    }catch(error){if(signal?.aborted)throw abort();return{role,address:to,state:'unavailable',deployed:null,comparison:null,runtimeKeccak:null};}
  }));
  // Every admitted check is read, including indexed ranges/beneficiaries/caps and signed values.
  const checks=await Promise.all(prepared.checks.map(async check=>{
    try{const actual=await read('eth_call',[{to:check.to,data:check.data},tag]);ensure(typeof actual==='string'&&/^0x(?:[0-9a-f]{64})+$/i.test(actual),'Invalid getter response.');return{...structuredClone(check),actual,state:actual.toLowerCase()===check.expectedReturn.toLowerCase()?'matches':'mismatch'};}
    catch(error){if(signal?.aborted)throw abort();return{...structuredClone(check),actual:null,state:'unavailable'};}
  }));
  const canonical=await read('eth_getBlockByNumber',[tag,false]);ensure(canonical?.number===tag&&canonical?.hash?.toLowerCase()===block.hash.toLowerCase(),'The '+chainName+' block changed. Compare the build again.');
  if(signal?.aborted)throw abort();
  const actual=contracts.find(contract=>contract.role===target),complete=contracts.every(contract=>contract.state==='matches')&&checks.every(check=>check.state==='matches');
  return{kind:'qhooks-prepared-deployment-comparison',chainId,address,target,block:{number:tag,hash:block.hash},observedAt:new Date(now()).toISOString(),buildHash:prepared.buildHash,sourceVersion:prepared.sourceVersion,artifactInputSHA256:prepared.artifact.configuration?.catalogueBinding?.artifactInputSHA256||null,contracts,checks,complete,deployed:actual?.deployed===true,executionEnabled:false};
}

export function mountPreparedDeploymentCheck(container,prepared,{document:doc=container.ownerDocument,rpc,fetcher,mount=mountRepoProofCheck}={}){
  const identity=validate(prepared);entrypointStyles(doc);let dead=false,sequence=0,controller=null,proof=null,result=null;
  const element=el(doc,'section',null,{class:'qre-lab','aria-label':'Deployed build comparison'}),status=el(doc,'p','No chain comparison yet.',{role:'status','aria-live':'polite'}),list=el(doc,'ul',null,{class:'qre-lab-results'}),proofHost=el(doc,'div'),button=el(doc,'button','Compare deployed build',{type:'button'});
  const buildIdentity=el(doc,'details',null,{class:'qre-build-identity'});buildIdentity.append(el(doc,'summary','Build identity'),el(doc,'p','Build '+prepared.buildHash,{class:'qre-address'}),el(doc,'p','Source snapshot '+prepared.sourceVersion,{class:'qre-address'}),el(doc,'p','Artifact input SHA-256 '+(prepared.artifact.configuration?.catalogueBinding?.artifactInputSHA256||'unavailable'),{class:'qre-address'}));
  element.append(el(doc,'h3','Compare your deployed build'),el(doc,'p','Predicted '+identity.target+' address · '+identity.chainName),el(doc,'code',identity.address,{class:'qre-address'}),el(doc,'p','Check for deployed code and compare the exact runtime and all '+prepared.checks.length+' prepared getters at one '+identity.chainName+' block. This does not deploy the build.'),button,buildIdentity,status,list,proofHost);container.append(element);
  async function compare(){
    if(dead)return;const mine=++sequence;controller?.abort();controller=new AbortController();proof?.dispose();proof=null;proofHost.replaceChildren();list.replaceChildren();result=null;button.disabled=true;status.textContent='Reading '+identity.chainName+' code and every prepared getter…';
    const ownedController=controller,timer=setTimeout(()=>ownedController.abort(),12000);
    try{
      const value=await verifyPreparedDeployment(prepared,{rpc,fetcher,signal:ownedController.signal});if(dead||mine!==sequence)return;result=value;
      const block=identity.chainName+' block '+BigInt(value.block.number).toString()+' · '+value.block.hash;
      status.textContent=block+'. '+(value.complete?'Runtime and every prepared getter match this build.':value.deployed?'Deployed code found. Some build comparisons differ or are unavailable.':'No deployed target was confirmed. The address remains a prediction.');
      for(const contract of value.contracts)list.append(el(doc,'li',contract.role+' runtime: '+({matches:'matches the build',mismatch:'differs from the build',not_deployed:'no deployed code',unavailable:'read unavailable'}[contract.state]),{'data-state':contract.state}));
      for(const check of value.checks)list.append(el(doc,'li',check.read+(check.arguments?.length?' ['+check.arguments.join(', ')+']':'')+': '+({matches:'exact return matches',mismatch:'return differs',unavailable:'read unavailable'}[check.state]),{'data-state':check.state}));
      if(value.deployed){proofHost.append(el(doc,'p','RepoProof findings describe this public deployed address separately from the build comparison.'));const target=el(doc,'div');proofHost.append(target);proof=mount(target,{subject:{kind:'contract',chainId:identity.chainId,address:identity.address,revision:mine},getSubject:()=>!dead&&mine===sequence&&result?.deployed?{kind:'contract',chainId:identity.chainId,address:identity.address,revision:mine}:null,document:doc,fetcher});}
    }catch(error){if(!dead&&mine===sequence)status.textContent=error.name==='AbortError'?'The comparison stopped before it completed. Try again.':(error.message||'The deployed build could not be compared. Try again.');}
    finally{clearTimeout(timer);if(!dead&&mine===sequence)button.disabled=false;}
  }
  button.addEventListener('click',()=>void compare());
  return{element,compare,getResult:()=>result?structuredClone(result):null,dispose(){dead=true;sequence++;controller?.abort();proof?.dispose();element.remove();}};
}
