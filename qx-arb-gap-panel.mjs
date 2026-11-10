// "Arb this gap" panel (QHooks Arb): on a Robinhood token with reviewed routes, checks them in the browser and offers one
// button per gap. Runs through the open executor from the person's own wallet (wallet hub). Approved copy only.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {loadArbRoutes, createArbClient, fmtEth} from '/qx-arb-open.mjs';
export const ARB_COPY = ['You keep 85% of the gap; 15% buys QHOOKS and burns it.', 'Gaps close fast; the trade cancels itself if the gap is gone.'];
export const ARB_COPY_LIQ = ['You keep 85% of the gap; 15% goes to the QHOOKS floor as liquidity.', 'Gaps close fast; the trade cancels itself if the gap is gone.'];
const mounts = new WeakMap();
export function renderArbList(host, gaps, onRun, busy) {
  const doc = host.ownerDocument, kids = [];
  if (!gaps.length) { const p = doc.createElement('p'); p.textContent = 'No gap right now.'; kids.push(p); }
  for (const g of gaps) {
    const row = doc.createElement('div'); row.className = 'qxa-row';
    const t = doc.createElement('span'); t.textContent = 'Gap ' + fmtEth(g.gap) + ' ETH at ' + fmtEth(g.size) + ' ETH in';
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'qtx-mini'; b.textContent = 'Arb this gap'; b.disabled = !!busy; b.addEventListener('click', () => onRun(g));
    row.append(t, b); kids.push(row);
  }
  host.replaceChildren(...kids);
}
export function mountArbGapPanel(anchor, meta, {fetchImpl = globalThis.fetch} = {}) {
  if (!anchor) return;
  const key = meta?.chainId === '4663' && meta?.token ? String(meta.token).toLowerCase() : null, prev = mounts.get(anchor);
  if (prev?.key === key) return;
  prev?.root.remove(); mounts.delete(anchor); if (!key) return;
  const doc = anchor.ownerDocument, root = doc.createElement('section'); root.className = 'qxa-panel'; root.hidden = true; anchor.after(root);
  const rec = {key, root}; mounts.set(anchor, rec);
  loadArbRoutes(fetchImpl).then(async d => {
    const routes = d.routes.filter(r => r.token.toLowerCase() === key);
    if (mounts.get(anchor) !== rec || !routes.length) return;
    const client = createArbClient({chainId: '4663', fetchImpl}), hub = getWalletHub(window);
    const h = doc.createElement('h3'); h.textContent = 'Arb this gap';
    const copy = (d.liquidity ? ARB_COPY_LIQ : ARB_COPY).map(c => { const p = doc.createElement('p'); p.textContent = c; return p; });
    const list = doc.createElement('div'), status = doc.createElement('p'); status.setAttribute('role', 'status'); status.className = 'qxa-status';
    const again = doc.createElement('button'); again.type = 'button'; again.className = 'qtx-mini'; again.textContent = 'Check again';
    let busy = false, gaps = [];
    const say = t => { status.textContent = t; };
    // keep: leave the last result message (after a run) in place instead of the progress text.
    const check = async (keep = false) => { if (busy) return; busy = true; if (!keep) say('Checking ' + routes.length + ' route' + (routes.length > 1 ? 's' : '') + '…');
      try { gaps = await client.scan(routes, d.executor, {from: hub.snapshot().current?.owner}); if (!keep) say(''); } catch (e) { if (!keep) say(e.message); } busy = false; renderArbList(list, gaps, runOne, busy); };
    const runOne = async g => { const conn = hub.snapshot().current; if (!conn) { hub.open(); return; } if (busy) return; busy = true; renderArbList(list, gaps, runOne, busy);
      try { if (conn.chainId !== '4663') { const c2 = await hub.switchChain('4663'); if (c2?.chainId !== '4663') throw Error('Switch your wallet to Robinhood Chain, then try again.'); }
        const r = await client.run(hub.snapshot().current, d.executor, g, {say});
        say(r.ok ? 'Done: the gap is closed.' : r.ok === false ? 'The gap was gone before it landed; the trade cancelled itself (only gas was spent).' : 'Still pending. Check your wallet activity.');
      } catch (e) { say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : e.message); }
      busy = false; await check(true); };
    again.addEventListener('click', () => check());
    const more = doc.createElement('a'); more.href = '/arb'; more.textContent = 'How QHooks Arb works';
    root.append(h, ...copy, list, again, status, more); root.hidden = false;
    if (!doc.getElementById('qxa-style')) { const st = doc.createElement('style'); st.id = 'qxa-style'; st.textContent = '.qxa-panel{margin:12px 0;padding:12px;border:1px solid var(--qx-line,#33362f);border-radius:10px}.qxa-panel h3{margin:0 0 6px;font-size:15px}.qxa-panel p{margin:4px 0;font-size:13px;overflow-wrap:anywhere}.qxa-row{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0;font-size:13px}.qxa-panel .qtx-mini{min-height:36px}'; doc.head.append(st); }
    check();
  }).catch(() => {});
}
