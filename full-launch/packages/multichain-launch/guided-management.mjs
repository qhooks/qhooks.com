// Human-unit convenience boundary only. The accepted workspace independently
// reads canonical state, validates the plan and requires both signatures/consent.
import {ensure,shape,address} from '../token-launch/artifact.mjs';
import {parseDecimalAmount} from '../crosschain/decimal-amount.mjs';
import {planV4LaunchLiquidity} from './liquidity-v4-plan.mjs';
import {launchRange} from './liquidity-plan.mjs';
import {createLaunchActionContext} from './actions/context.mjs';
const zeroAddress='0x'+'0'.repeat(40),zero32='0x'+'0'.repeat(64);
const schemas={cancel:['kind'],apply:['kind'],fees:['kind','recipient','minToken','minQuote'],exit:['kind','recipient','minToken','minQuote'],migrate:['kind','recipient','minToken','minQuote','tokenAmount','quoteAmount'],announce:['kind','mode','threshold','destinationFee']};
function amount(s,d,{zero=false}={}){ensure(typeof s==='string'&&s.length>0&&s.length<=100&&!/[^0-9.]/.test(s),'Enter a plain decimal amount');return zero&&s==='0'?'0':parseDecimalAmount(s,d);}
export async function prepareGuidedLaunchAction({workspace,input,toolkitText,metadataText}){
 ensure(input&&Object.hasOwn(schemas,input.kind)&&shape(input,schemas[input.kind]),'Exact management form fields required');
 for(const v of Object.values(input))ensure(typeof v==='string','Management fields must be text');
 if(input.kind==='cancel'||input.kind==='apply')return workspace.prepareAction({kind:input.kind});
 // prepareAction always performs a fresh canonical reconciliation itself.
 // Only planning that consumes current liquidity/timestamp needs a pre-read;
 // simple claims, exits and cancel/apply must not run that whole read twice.
 if(input.kind==='announce'||input.kind==='migrate')await workspace.reconcile();
 const s=workspace.snapshot();
 ensure(s.completed.includes('bootstrap')&&['1','2'].includes(s.state.phase),'Active protected pool required');
 if(input.kind==='announce'){
  ensure(['0','1','2'].includes(input.mode),'Select a graduation mode');
  const threshold=amount(input.threshold,s.quote.decimals,{zero:input.mode!=='0'}),fee=amount(input.destinationFee,4);ensure(input.mode==='0'?BigInt(threshold)>0n:threshold==='0','Only quote-target mode uses a positive threshold');
  const j=JSON.parse(workspace.journal()),row=j.deployments.controller.at(-1),context=await createLaunchActionContext({chainId:s.chainId,nonce:BigInt(row.stages[0].transaction.nonce).toString(),constructor:row.fields,toolkitText,metadataText});
  ensure(context.plan.graph.controller===s.addresses.controller,'Launch context changed');
  const destination=input.mode==='2'?{key:{currency0:zeroAddress,currency1:zeroAddress,fee:'0',tickSpacing:'0',hooks:zeroAddress},hookSalt:zero32}:await context.planner.find({fee,tickSpacing:'60',start:(BigInt(s.state.source.descriptor.hookSalt)+1n).toString()},()=>workspace.snapshot().keyReady);
  const policy=context.planner.policy({mode:input.mode,threshold,destination});
  // The entire 15-minute signing window is additional to the contract notice.
  return workspace.prepareAction({kind:'announce',policy,destination,eta:(BigInt(s.state.timestamp)+BigInt(s.fields.notice)+900n).toString()});
 }
 ensure(address(input.recipient),'Enter a canonical lowercase EVM recipient');
 const tokenMin=amount(input.minToken,Number(s.fields.decimals),{zero:true}),quoteMin=amount(input.minQuote,s.quote.decimals,{zero:true}),token0=s.addresses.token===s.funding.currency0;
 const minAmount0=token0?tokenMin:quoteMin,minAmount1=token0?quoteMin:tokenMin;
 if(input.kind==='fees'||input.kind==='exit')return workspace.prepareAction({kind:input.kind,withdrawal:{minAmount0,minAmount1,recipient:input.recipient}});
 // Graduation moves the whole position: the contract requires the destination to open at the source pool's
 // current price and take at least 98% of each asset, and burns the rounding. So the plan is derived from the
 // source position itself (99.75% of its liquidity, full range, at the current price); typed amounts are ignored.
 const src=s.state.source,word=s.state.poolStates?.[src.descriptor.key.hooks]?.[0];ensure(typeof word==='string','Source pool price unavailable');
 ensure(src.position.tickLower===launchRange.tickLower&&src.position.tickUpper===launchRange.tickUpper,'Full-range source position required');
 const sqrtP=BigInt(word)&((1n<<160n)-1n),Q96=1n<<96n,lo=BigInt(launchRange.sqrtLower),hi=BigInt(launchRange.sqrtUpper);ensure(sqrtP>lo&&sqrtP<hi,'Source price out of range');
 const keep=BigInt(s.state.sourceLiquidity)*9975n/10000n;ensure(keep>0n,'Source liquidity required');
 const need0=keep*Q96*(hi-sqrtP)/(sqrtP*hi),need1=keep*(sqrtP-lo)/Q96,cap=x=>(x+x/1000n+2n).toString();
 return workspace.prepareAction({kind:'migrate',migration:{sourceLiquidity:s.state.sourceLiquidity,sqrtPriceX96:sqrtP.toString(),destinationPosition:{tickLower:launchRange.tickLower,tickUpper:launchRange.tickUpper,salt:zero32,liquidity:keep.toString()},limits:{minRemoved0:minAmount0,minRemoved1:minAmount1,maxAdded0:cap(need0),maxAdded1:cap(need1),minLiquidity:keep.toString(),recipient:input.recipient}}});
}
