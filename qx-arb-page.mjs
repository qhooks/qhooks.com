// /arb: QHooks Arb. Scans every reviewed Robinhood route in the browser (real fee fields) and offers one button per gap;
// the builders section below is static HTML.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {loadArbRoutes, createArbClient} from '/qx-arb-open.mjs';
import {renderArbList} from '/qx-arb-gap-panel.mjs';
const root = document.getElementById('qxa-root'), hub = getWalletHub(window);
const el = (t, a = {}, ...k) => { const n = document.createElement(t); for (const [x, v] of Object.entries(a)) n.setAttribute(x, v); n.append(...k); return n; };
const d = await loadArbRoutes(), client = createArbClient({chainId: '4663'});
// Once the liquidity executor is on chain (loadArbRoutes checks its exact code), the static copy and address follow it.
if (d.liquidity) {
  for (const n of document.querySelectorAll('[data-arb-liq]')) n.textContent = n.getAttribute('data-arb-liq');
  for (const n of document.querySelectorAll('[data-arb-exec]')) n.textContent = d.executor;
}
const list = el('div'), status = el('p', {role: 'status', class: 'qxa-status'}), btn = el('button', {type: 'button', class: 'qtx-mini qas-go'}, 'Scan all ' + d.routes.length + ' routes');
let busy = false, gaps = [], ctl = null;
const say = t => { status.textContent = t; };
async function scan() {
  if (busy) return; busy = true; btn.disabled = true; ctl = new AbortController();
  try { gaps = await client.scan(d.routes, d.executor, {from: hub.snapshot().current?.owner, signal: ctl.signal,
    onProgress: (n, t, found) => { say('Checked ' + n + ' of ' + t + ' routes · ' + found.length + ' gap' + (found.length === 1 ? '' : 's') + ' so far'); renderArbList(list, found, run, true); }});
    say('Checked all ' + d.routes.length + ' routes at ' + new Date().toLocaleTimeString() + '.');
  } catch (e) { say(e.message); }
  busy = false; btn.disabled = false; renderArbList(list, gaps, run, false);
}
async function run(g) {
  const conn = hub.snapshot().current; if (!conn) { hub.open(); return; } if (busy) return; busy = true; renderArbList(list, gaps, run, true);
  try { if (conn.chainId !== '4663') { const c2 = await hub.switchChain('4663'); if (c2?.chainId !== '4663') throw Error('Switch your wallet to Robinhood Chain, then try again.'); }
    const r = await client.run(hub.snapshot().current, d.executor, g, {say});
    say(r.ok ? 'Done: the gap is closed.' : r.ok === false ? 'The gap was gone before it landed; the trade cancelled itself (only gas was spent).' : 'Still pending. Check your wallet activity.');
    gaps = gaps.filter(x => x !== g);
  } catch (e) { say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : e.message); }
  busy = false; renderArbList(list, gaps, run, false);
}
btn.addEventListener('click', scan);
root.replaceChildren(btn, status, list);
