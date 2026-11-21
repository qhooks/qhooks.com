// Contributor round (2026-11-21): the "Contributor round · N wallets · X% of supply" line on the token page, from
// /api/v1/rounds/<chain>/<token>. Shown whenever the token came from a round (rounds are public on chain); the Worker
// answers only after RoundFactory code, isRound(round) and round.token() == token check out. Any error: no line.
import {ROUND_TEXT, roundChain, roundPath, pct} from './qx-round-core.mjs';
const seen = new Map();
export function paintRound(anchor, chainId, token) {
  if (!anchor || !chainId || !token || !roundChain(chainId) || !/^0x[0-9a-f]{40}$/i.test(String(token))) { document.getElementById('qxt-round')?.setAttribute('hidden', ''); return; }
  const id = String(chainId) + ':' + String(token).toLowerCase();
  let node = document.getElementById('qxt-round');
  if (!node) { node = document.createElement('p'); node.id = 'qxt-round'; node.className = 'qxt-launch-caps qxt-round'; node.hidden = true; }
  if (node.previousElementSibling !== anchor) anchor.after(node);
  if (node.dataset.token !== id) { node.dataset.token = id; node.hidden = true; node.replaceChildren(); }
  if (!seen.has(id)) seen.set(id, fetch('/api/v1/rounds/' + encodeURIComponent(String(chainId)) + '/' + encodeURIComponent(String(token).toLowerCase())).then(r => r.ok ? r.json() : null).catch(() => { seen.delete(id); return null; }));
  seen.get(id).then(t => {
    if (node.dataset.token !== id || !t || !/^0x[0-9a-f]{40}$/.test(t.round || '') || !Array.isArray(t.wallets) || !Number.isFinite(t.sharesBps)) return;
    const a = document.createElement('a'); a.href = roundPath(chainId, t.round); a.textContent = ROUND_TEXT.badge(t.wallets.length, pct(t.sharesBps / 10000, 2));
    node.replaceChildren(a); node.hidden = false;
  });
}
