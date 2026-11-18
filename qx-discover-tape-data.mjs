const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function tapeSuccessTime(text) {
  const m = /^(\d{2}) ([A-Z][a-z]{2}) (\d{4}), (\d{2}):(\d{2}) UTC$/.exec(text || '');
  return m && months.includes(m[2]) ? Date.UTC(+m[3], months.indexOf(m[2]), +m[1], +m[4], +m[5]) : null;
}
export function tapePublicState({status, successAt, detail = ''}, now = Date.now()) {
  // "Live" only for data under 30 s (copy rule). Last success is minute-truncated, so this is conservative.
  const fresh = status === 'healthy' && Number.isFinite(successAt) && successAt <= now && now-successAt < 30000;
  return {text: fresh ? 'Live' : 'Refreshing', title: [status, detail].filter(Boolean).join(' · '), fresh};
}
export function simplifyTapeCard(card, {now = Date.now()} = {}) {
  const chip = card.querySelector('[data-tape-status]'); if (!chip) return null;
  if (!chip.dataset.sourceDetail) {
    const issue = card.querySelector('.qd-source-issue');
    const success = [...card.querySelectorAll('dt')].find(n => n.textContent === 'Last success')?.nextElementSibling?.textContent;
    chip.dataset.successAt = String(tapeSuccessTime(success) || '');
    chip.dataset.sourceDetail = [chip.textContent, issue?.textContent].filter(Boolean).join(' · ') || chip.dataset.tapeStatus;
    issue?.remove(); card.querySelector('.qd-tape-pending')?.remove();
  }
  const state = tapePublicState({status: chip.dataset.tapeStatus, successAt: Number(chip.dataset.successAt) || null, detail: chip.dataset.sourceDetail}, now);
  if (chip.textContent !== state.text) chip.textContent = state.text;
  chip.title = state.title; chip.className = 'qd-status-chip qd-status-' + (state.fresh ? 'success' : 'neutral');
  return state;
}
