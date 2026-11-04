// Exact artifact-bound action context. Production manager/quote admission is
// additionally required by the connected workflow, not inferred from this plan.
import {createLaunchPoolPlanner} from '../descriptor.mjs';
import {readLaunchToolkit} from '../artifact.mjs';
import {freeze,hashObject} from '../../../prototypes/pq-graduation/client/graduation-setup-plan.mjs';
const contexts=new WeakSet();
export async function createLaunchActionContext(args){
 const [planner,toolkit]=await Promise.all([createLaunchPoolPlanner(args),readLaunchToolkit(args.toolkitText)]),g=planner.graph,c=g.constructor;
 const plan=freeze({id:hashObject({chainId:g.chainId,nonce:g.nonce,constructor:c,artifactSha256:toolkit.sha256}),chainId:g.chainId,
  constructor:c,graph:{...g,manager:c.manager,quote:c.quote,verifier:c.verifier,collector:c.collector},
  profile:{owner:c.owner,publicKey:c.publicKey,fields:{notice:c.notice}},contracts:toolkit.contracts});
 const context=Object.freeze({planner,plan,binding:freeze({codes:planner.expected,setupPlanId:plan.id})});contexts.add(context);return context;
}
export function requireLaunchActionContext(context){if(!contexts.has(context))throw new TypeError('Locally derived launch action context required');return context;}
