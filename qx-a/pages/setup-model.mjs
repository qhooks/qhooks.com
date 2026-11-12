// Presentation decisions only; this module has no wallet or network access.
export const shortAddress = value => value.slice(0, 6) + '…' + value.slice(-4);
export const addressPattern = () => /(?<![A-Za-z0-9])(?:0x[0-9a-fA-F]{40}(?![0-9a-fA-F])|[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9]))/g;
export function stateTone(text) {
  if (/different code|other code|stop|failed|refused|not enough|could not/i.test(text)) return 'warning';
  if (/waiting|refreshing|not yet|not approved|not set up|not on the list|after the step|checking/i.test(text)) return 'waiting';
  if (/\bready\b|cleared to set up/i.test(text)) return 'ready';
  if (/already done|set up|approved|confirmed|completed|verified|on the list|deployed/i.test(text)) return 'done';
  return '';
}
export function choosePrimary(controls) {
  const available = controls.filter(c => !c.hidden && !c.disabled && !c.utility);
  return available.find(c => c.preferred)?.key ?? available[0]?.key ?? null;
}
