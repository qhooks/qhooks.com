export const circuitRecoveryCopy = Object.freeze({
 name:'Circuit Recovery',
 summary:'Pause trading when a trade reaches your circuit threshold. Resume after cooldown with wallet and post-quantum approval.',
 action:'Cooldown recovery and threshold replacement',
 detail:'The triggering trade completes before the pause latches. After the immutable cooldown, explicitly signed recovery resumes trading and replaces the thresholds for this pool. There is no automatic recovery. Only the latest trip is stored; older generations remain in event history.',
 protectedAction:'Resuming a tripped pool and replacing its thresholds after the immutable cooldown requires wallet AND ML-DSA-65 authorization over the same complete 22-word action.',
 unprotectedActions:Object.freeze([
  'Normal swaps do not verify PQ signatures. The triggering trade completes before the pause latches; this is not automatic loss prevention.',
  'Anyone able to execute a threshold trade can pause the pool. LP exits remain available. There is no liveness, oracle, MEV or principal-protection guarantee.'
 ]),
 limitations:Object.freeze([
  'Local prototype with no public deployment; not independently externally audited.',
  'No integrated owner enrollment, key rotation or key recovery workflow for this bundle.',
  'Fixed local core and controlled plain ERC20 tokens; no arbitrary-composition or active reentrancy-trigger claim.',
  'Production manager/token selection, helper provenance and chain-specific deployment costs remain unresolved.'
 ])
});
