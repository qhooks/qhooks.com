// Setup taps: the meter under "N of M done" fills from qx-taps.mjs's own progress line, and the first row still
// waiting carries the one gold action. Read-only: it never taps, checks or sends anything itself.
const line = document.getElementById('taps-progress'), fill = document.getElementById('mn-taps-fill'), root = document.getElementById('taps-root');
const paint = () => {
  const m = /(\d+)\s+of\s+(\d+)/.exec(line?.textContent || '');
  if (m && fill) fill.parentElement.style.setProperty('--done', (+m[2] ? Math.min(100, +m[1] / +m[2] * 100) : 0).toFixed(1) + '%');
  const rows = root ? [...root.querySelectorAll('.taps-row')] : [];
  rows.forEach((r, i) => r.classList.toggle('mn-first', i === 0));
};
if (line) new MutationObserver(paint).observe(line, { childList: true, characterData: true, subtree: true });
if (root) new MutationObserver(paint).observe(root, { childList: true, subtree: true });
paint();
