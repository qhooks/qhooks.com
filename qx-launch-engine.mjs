// Shared callable seam. The actual Studio workspace and its guarded public steps
// remain the default engine; Create never automates or clones Studio DOM controls.
import {plan,engineFor,SIMPLE_LAUNCH,launchError} from './qx-create-plan.mjs';
export {plan,engineFor,SIMPLE_LAUNCH};
export async function loadStudioClient() {
 return Object.assign({createRegistryWorkspace},...await Promise.all([
  import('./full-launch/packages/multichain-launch/l129-workspace-public-r2.mjs'),
  import('./full-launch/packages/multichain-launch/workspace-fields.mjs'),
  import('./full-launch/packages/multichain-launch/guided-management.mjs'),
  import('./full-launch/packages/multichain-launch/dependencies.mjs'),
  import('./full-launch/packages/multichain-launch/actions/signer.mjs'),
  import('./full-launch/packages/multichain-launch/l129-remembered-session.mjs'),
  import('./full-launch/packages/crosschain/decimal-amount.mjs')
 ]));
}
// Reuse the same orchestration core and production services with the registry's
// default quote. An expert Studio's saved stock-pair choice stays untouched.
export async function createRegistryWorkspace(options) {
 const [standard,arc,{createLaunchDependencies},{createTokenDeployment},{createLaunchDeployment},{createConnectedLaunchAction}]=await Promise.all([
  import('./full-launch/packages/multichain-launch/l129-workspace-complete-core-r2.mjs'),
  import('./full-launch/packages/multichain-launch/l129-workspace-arc-compatible-core-r2.mjs'),
  import('./full-launch/packages/multichain-launch/dependencies.mjs'),
  import('./full-launch/packages/token-launch/deployment.mjs'),
  import('./full-launch/packages/multichain-launch/deployment.mjs'),
  import('./full-launch/packages/multichain-launch/actions/l129-connected-r2.mjs')
 ]);
 const services={dependencies:chainId=>createLaunchDependencies({chainId,policyText:options.policyText}),token:createTokenDeployment,deployment:createLaunchDeployment,action:args=>createConnectedLaunchAction({...args,policyText:options.policyText})};
 return (options.chainId==='5042'?arc:standard).createLaunchWorkspaceCore({...options,services});
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const activeStage=s=>Object.values(s.deployments||{}).findLast(d=>d.stage===s.current)?.stages?.at(-1)||s.action?.stage;
export async function runStudioStep(step,ctx) {
 const workspace=await ctx.workspace();
 for(let i=0;i<100;i++) {
  await ctx.check();await workspace.reconcile();let s=workspace.snapshot();
  if(s.completed.includes(step.id))return ctx.engineResult(step.id,s);
  if(s.current!==step.id)throw Error('The engine is waiting for '+s.current+'. Resume from that step.');
  const stage=activeStage(s);
  if(stage?.status==='unknown'||stage?.status==='submitting')throw Error('This transaction may have been sent. Enter its transaction hash to recover it before retrying.');
  if(stage?.hash&&stage.status==='submitted'){await ctx.wait(stage.hash);continue;}
  if(stage?.status==='reverted'){
   if(['token','verifier','collector','blocks','controller'].includes(s.current))await workspace.retryRevertedDeployment();
   else await workspace.prepareNext();
  }else await workspace.prepareNext();
  s=workspace.snapshot();if(s.completed.includes(step.id))return ctx.engineResult(step.id,s);
  if(s.action?.action&&!s.action.approved)await workspace.approve();
  const review=await workspace.review();await ctx.check();
  // The user's one review covers this plan. The unchanged engine still checks
  // the exact fee quote, nonce, wallet, dependencies and both-key approval.
  workspace.acceptFees(review);await workspace.submit(review);
  s=workspace.snapshot();const tx=activeStage(s);if(tx?.hash)await ctx.wait(tx.hash);
  await pause(0);
 }
 throw Error('This launch step took too long. Retry to check its saved transaction.');
}
export async function runStep(step,ctx) {
 if(step.kind==='simple')throw Error('Simple launch placeholder: the blocks owner has not supplied an address and ABI.');
 if(step.kind==='engine')return runStudioStep(step,ctx);
 const handler=ctx.handlers[step.kind];if(!handler)throw Error('Unknown launch step: '+step.id);return handler(step,ctx);
}
export async function runSteps({steps,record,verify,execute,save,onStep=()=>{}}) {
 record.steps||={};
 for(const step of steps) {
  let prior=record.steps[step.id];
  record.current=step.id;
  try {
   if(prior?.status==='done'&&await verify(step,prior)){await onStep(step,prior);continue;}
   record.status='running';record.steps[step.id]={...prior,status:'running',error:null};await save();await onStep(step,record.steps[step.id]);
   const result=await execute(step)||{};
   record.steps[step.id]={...record.steps[step.id],...result,status:'done',error:null};await save();await onStep(step,record.steps[step.id]);
  }catch(error){record.status='stopped';record.steps[step.id]={...record.steps[step.id],status:'failed',error:launchError(error)};await save();await onStep(step,record.steps[step.id]);throw error;}
 }
 record.status='done';record.current=null;await save();return record;
}
