// Quick-launch pool fees on the classic terminal's token view (terminal.html#m=<chain>:<token>), 2026-11-28 LAUNCHLIST.
// Same panel as /creator and the main app's #/token (qx-simple-collect.mjs): launchOf lookup on chain, pending amount by
// eth_simulateV1, one collect(key) transaction sent through the site's wallet hub (qx-chain.mjs send), shown only to the
// launch's creator or payout wallet. Nothing is read for visitors without a wallet: the lookup runs only once a wallet is
// connected, at most once per token per page visit.
import {findLaunch, mountCollect, canCollect, supported} from '/qx-simple-collect.mjs';
import {connectedAddress, onWalletChange, send} from '/qx-chain.mjs';
import {publicReadFetch} from '/qx-public-read.mjs';

const ADDR = /^0x[0-9a-f]{40}$/i;
const found = new Map(); // chain:token -> Promise<launch|null>
let current = null, redraw = null, watching = false;

function lookup(chainId, token) {
  const k = chainId + ':' + token;
  if (!found.has(k)) found.set(k, findLaunch(chainId, token, {fetchJson: async u => { const r = await publicReadFetch(u, {cache: 'no-store'}); return r.ok ? r.json() : null; }}).catch(() => null));
  return found.get(k);
}

async function paint(rec) {
  const me = connectedAddress();
  if (!me) { rec.box.hidden = true; rec.box.replaceChildren(); return; }
  const launch = await lookup(rec.chainId, rec.token);
  if (current !== rec) return;
  if (!launch || !canCollect(launch, connectedAddress())) { rec.box.hidden = true; rec.box.replaceChildren(); return; }
  if (rec.mounted) { redraw?.(); return; }
  rec.mounted = true;
  mountCollect(rec.box, launch, {address: connectedAddress, send: (tx, on) => send(rec.chainId, tx, on), onChange: cb => { redraw = cb; }});
}

/// Mounts (or keeps) the panel after `anchor` for the token in `meta` ({chainId, token}); null meta removes it.
export function mountTerminalCollect(anchor, meta) {
  const chainId = meta?.chainId != null ? String(meta.chainId) : '', token = String(meta?.token || '').toLowerCase();
  const key = anchor && supported(chainId) && ADDR.test(token) ? chainId + ':' + token : null;
  if (current?.key === key && current?.box.isConnected) return;
  current?.box.remove(); current = null; redraw = null;
  if (!key) return;
  const doc = anchor.ownerDocument;
  if (!doc.getElementById('qxt-collect-style')) { const st = doc.createElement('style'); st.id = 'qxt-collect-style'; st.textContent = '.qxt-collect{margin:10px 0;padding:12px 14px;border:1px solid var(--qa-line,var(--qx-line,rgba(127,127,127,.28)))}.qxt-collect .qsc-title{font-size:14px}'; doc.head.append(st); }
  const box = doc.createElement('section');
  box.id = 'qxt-collect'; box.className = 'qxt-collect qsc'; box.hidden = true;
  box.setAttribute('aria-label', 'Pool fees');
  anchor.after(box);
  current = {key, chainId, token, box, mounted: false};
  if (!watching) { watching = true; onWalletChange(() => { if (current) { current.mounted = false; redraw = null; void paint(current); } }); }
  void paint(current);
}
