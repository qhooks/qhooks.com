// "Get Telegram alerts" for one launch: asks the worker for a one-time Telegram link that subscribes the chat
// to that launch's key events (recovery started, cancelled or completed; keys replaced). Used by the Keys panel
// and the Terms card.
import { h } from '/qx-chain.mjs';

export function alertsButton(pool) {
  const note = h('small', { class: 'qtb-note', role: 'status' });
  const btn = h('button', { type: 'button', class: 'workspace-button' }, 'Get Telegram alerts');
  btn.addEventListener('click', async () => {
    btn.disabled = true; note.textContent = '';
    try {
      const r = await fetch('/api/alerts/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: String(pool.chainId), controller: pool.controller }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) { window.open(j.url, '_blank', 'noopener'); note.textContent = 'Telegram opened. Tap Start there to turn alerts on.'; }
      else note.textContent = j.error === 'not_listed' ? 'List this launch on Markets first, then turn on alerts.' : j.error === 'alerts_off' ? 'Telegram alerts are not switched on yet.' : 'Could not create the link. Try again.';
    } catch { note.textContent = 'Could not create the link. Try again.'; }
    btn.disabled = false;
  });
  return h('div', { class: 'qtx-alerts' }, btn, note);
}
