// Launch-week QHOOKS drop banner (Randall approved copy, 2026-11-09). Home + terminal.
// Phase 1 until the window closes (2026-11-14 00:00 UTC): countdown. Phase 2 after: list + claims timing.
// Hidden from 2026-11-21. Mounts on [data-drop-banner].
const CLOSE = Date.UTC(2026, 10, 14, 0, 0, 0), HIDE = Date.UTC(2026, 10, 21, 0, 0, 0);
export function bannerText(now) {
  if (now >= HIDE) return null;
  if (now < CLOSE) {
    const m = Math.max(1, Math.ceil((CLOSE - now) / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60;
    return {text: 'Launch-week drop: 1,000,000 QHOOKS. Window closes in ' + (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + mm + 'm.', link: true};
  }
  return {text: 'Launch-week drop window closed. The list publishes next; claims open 24 hours after.', link: true};
}
function render(root) {
  const b = bannerText(Date.now());
  if (!b) { root.hidden = true; return false; }
  const p = document.createElement('p'); p.className = 'qx-drop-text'; p.textContent = b.text + ' ';
  if (b.link) { const a = document.createElement('a'); a.href = '/qhooks-token#qdr-h'; a.textContent = 'How it works'; p.append(a); }
  root.replaceChildren(p); root.hidden = false; return true;
}
if (typeof document !== 'undefined') {
  if (!document.querySelector('link[data-qx-drop]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/qx-drop-banner.css'; l.dataset.qxDrop = ''; document.head.append(l); }
  for (const root of document.querySelectorAll('[data-drop-banner]')) { if (render(root)) setInterval(() => render(root), 30000); }
}
