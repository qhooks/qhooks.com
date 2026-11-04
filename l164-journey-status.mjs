export function launchJourneyStatus(s = {}) {
  const l = s.launch;
  const busy = s.busy === true || l?.busy === true;
  const blocked = Boolean(l?.saveFailed || ['save-failed', 'connection-changed'].includes(l?.attention));
  const complete = s.connected === true && !busy && !blocked && Array.isArray(l?.completed) && l.completed.includes('bootstrap') && ['1', '2'].includes(l?.state?.phase);
  return Object.freeze({
    complete,
    busy,
    blocked,
    hasLaunch: !!l,
    canConfigure: !l && !busy,
    needsWallet: s.connected !== true
  });
}
