// Scanner flag explained (Randall, 2026-11-08: "Caution flag explanation sure").
// GoPlus reports "Owner can change balances" (owner_change_balance=1) for Simple launches because the token's one-time
// setup minted the supply. The flag stays visible exactly as the scanner returns it; this only adds one plain line under
// it, and only when the token's runtime code on chain is the EIP-1167 clone of QSimpleToken. Code is checked, never a list,
// so every Simple launch is covered and an impostor never is.
import {chainById} from '/chains.mjs';
const IMPL = 'db3b3544d95cf445e869bf3bb9a2d1dfb1d7007f';
export const CLONE_CODE = '0x363d3d373d3d3d363d73' + IMPL + '5af43d82803e903d91602b57fd5bf3';
const FLAG = /owner can change balances/i;
export const NOTE = 'Scanner flag explained: the one-time setup that created the supply at launch can’t run again. No owner, mint, pause or blacklist.';
const verdicts = new Map();

/** The token in view, from the terminal's hash (#t=chain:token or #m=chain:token; Simple launches use the token as key). */
export function tokenInView(hash = location.hash) {
  const m = /^#[tm]=(\d+):(0x[0-9a-fA-F]{40})/.exec(hash || '');
  return m ? {chainId: m[1], token: m[2].toLowerCase()} : null;
}
export async function isSimpleClone(chainId, token, {fetchImpl = (...a) => fetch(...a), rpcUrl} = {}) {
  const key = chainId + ':' + token;
  if (!verdicts.has(key)) verdicts.set(key, (async () => {
    const url = rpcUrl || chainById(String(chainId))?.rpc;
    if (!url) return false;
    const r = await fetchImpl(url, {method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [token, 'latest']})});
    const j = await r.json();
    return typeof j?.result === 'string' && j.result.toLowerCase() === CLONE_CODE;
  })().catch(() => { verdicts.delete(key); return false; }));
  return verdicts.get(key);
}
function noteNode(doc) {
  const p = doc.createElement('p'); p.className = 'qx-flag-note';
  p.append(NOTE + ' ');
  const a = doc.createElement('a'); a.href = '/contracts'; a.textContent = 'How the contracts work →'; p.append(a);
  return p;
}
/** Elements whose own text shows the flag (any panel that renders scanner flags). */
function flagElements(root) {
  const out = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (FLAG.test(n.textContent || '')) out.push(n.parentElement);
  return out.filter(e => e && !e.closest('.qx-flag-note'));
}
export async function annotate(doc = document, opts = {}) {
  const els = flagElements(doc.body);
  if (!els.length) return 0;
  const t = tokenInView(opts.hash ?? location.hash);
  if (!t || !(await isSimpleClone(t.chainId, t.token, opts))) return 0;
  let added = 0;
  for (const el of els) {
    const host = el.closest('li') || el;
    if (host.dataset.qxFlagNote === t.chainId + ':' + t.token) continue;
    host.querySelectorAll(':scope > .qx-flag-note').forEach(n => n.remove());
    host.dataset.qxFlagNote = t.chainId + ':' + t.token; host.append(noteNode(doc)); added++;
  }
  return added;
}
if (typeof document !== 'undefined' && document.body) {
  const s = document.createElement('style'); s.id = 'qx-flag-note-style';
  s.textContent = '.qx-flag-note{margin:4px 0 0;font-size:12.5px;line-height:1.45;color:var(--qx-muted,#9aa39a);font-style:normal}.qx-flag-note a{color:inherit;text-decoration:underline}';
  document.head.append(s);
  let queued = false;
  const run = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; annotate().catch(() => {}); }, 150); };
  new MutationObserver(run).observe(document.body, {childList: true, subtree: true, characterData: true});
  addEventListener('hashchange', () => { document.querySelectorAll('.qx-flag-note').forEach(n => n.remove()); document.querySelectorAll('[data-qx-flag-note]').forEach(n => delete n.dataset.qxFlagNote); run(); });
  run();
}
