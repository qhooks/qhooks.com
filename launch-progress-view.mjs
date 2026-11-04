export function launchProgressRows(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('Invalid snapshot');
  const { completed, current, busy, attention } = snapshot;
  const ids = ['token','verifier','collector','controller','funding','bootstrap'];
  const labels = ['Create token','Deploy verifier','Deploy fee collector','Deploy launch controller','Fund liquidity','Launch protected pool'];
  if (!Array.isArray(completed)) throw new TypeError('Invalid completed');
  if (completed.some(id => !ids.includes(id)) || new Set(completed).size !== completed.length) throw new TypeError('Unknown/duplicate names');
  if (current !== null && !ids.includes(current)) throw new TypeError('Unknown current');
  if (typeof busy !== 'boolean') throw new TypeError('Invalid busy');
  if (attention !== null && typeof attention !== 'string') throw new TypeError('Invalid attention');
  return ids.map((id,i) => ({id,label:labels[i],
    state:completed.includes(id)?'complete':current===id?'active':'upcoming',
    detail:completed.includes(id)?'Confirmed':current===id?(attention!==null?attention:busy?'Working…':'Ready for your review'):'Waiting'
  }));
}
