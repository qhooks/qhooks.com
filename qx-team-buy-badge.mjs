// Team buy (2026-11-21): the "Disclosed team buy" line on the token page, from /api/v1/team-buy/<chain>/<token>.
// Shown only when the team chose to disclose; it lists the wallets so anyone can check them. Not a QProof verdict.
import {TEAM_TEXT} from './qx-team-buy-core.mjs';
const seen = new Map();
export function paintTeamBuy(anchor, chainId, token) {
  if (!anchor || !chainId || !token) return;
  const id = String(chainId) + ':' + String(token).toLowerCase();
  let node = document.getElementById('qxt-team-buy');
  if (!node) { node = document.createElement('details'); node.id = 'qxt-team-buy'; node.className = 'qxt-launch-caps qxt-team-buy'; node.hidden = true; anchor.after(node); }
  if (node.dataset.token !== id) { node.dataset.token = id; node.hidden = true; node.replaceChildren(); }
  if (!seen.has(id)) seen.set(id, fetch('/api/v1/team-buy/' + encodeURIComponent(String(chainId)) + '/' + encodeURIComponent(String(token))).then(r => r.ok ? r.json() : null).catch(() => { seen.delete(id); return null; }));
  seen.get(id).then(t => {
    if (node.dataset.token !== id || !t?.disclosed || !Array.isArray(t.wallets)) return;
    const summary = document.createElement('summary'); summary.textContent = TEAM_TEXT.badge(t.wallets.length, Number((t.supplyBps / 100).toFixed(2)));
    const list = document.createElement('ul');
    for (const w of t.wallets) { const li = document.createElement('li'); li.textContent = w.address + ' · ' + Number((w.supplyBps / 100).toFixed(2)) + '% of supply'; list.append(li); }
    node.replaceChildren(summary, list); node.hidden = false;
  });
}
