// QHOOKS contract address strip (home + token page), shown from the launch-day release on (Randall: CA on the site
// at launch, not before). Wires the Copy button; styles live here so the pages need no extra stylesheet.
const css = `.qx-ca{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:18px 0 0;padding:12px 14px;border:1px solid var(--qx-brass,#9a7b4f);border-radius:12px;background:color-mix(in srgb,var(--qx-brass,#9a7b4f) 10%,transparent);max-width:100%;font-style:normal}
.qx-ca-k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.qx-ca-v{font-family:var(--qx-mono,ui-monospace,monospace);font-size:14px;overflow-wrap:anywhere;min-width:0;flex:1 1 280px}
.qx-ca-copy{font:inherit;font-size:13px;font-weight:600;padding:6px 14px;border-radius:99px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;min-height:36px}
.qx-ca-go{font-size:13px;font-weight:600;color:inherit}`;
// System A pages (body.qa) style the strip in their own page CSS: no pill, no box, no monospace.
if (!document.body?.classList.contains('qa') && !document.getElementById('qx-ca-style')) { const s = document.createElement('style'); s.id = 'qx-ca-style'; s.textContent = css; document.head.append(s); }
for (const b of document.querySelectorAll('.qx-ca-copy[data-copy]')) b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1600);
});
