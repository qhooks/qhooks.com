export function transitionStage(current, event, hash = null) {
  const edges = {
    pending:{submit:'submitting'}, rejected:{submit:'submitting'},
    submitting:{accepted:'submitted',uncertain:'unknown',rejected:'rejected'},
    unknown:{recovered:'submitted'}, submitted:{confirmed:'confirmed',reverted:'reverted'},
    confirmed:{reorg:'submitted'}, reverted:{reorg:'submitted'}
  };
  if(typeof current!=='string'||typeof event!=='string'||!Object.hasOwn(edges,current)||!Object.hasOwn(edges[current],event)) throw new TypeError('Invalid edge');
  if(event==='accepted'||event==='recovered'){
    if(typeof hash!=='string'||!/^0x[0-9a-f]{64}$/.test(hash))throw new TypeError('Invalid hash');
  }else if(hash!==null)throw new TypeError('Hash must be null');
  return Object.freeze({status:edges[current][event],hash});
}
