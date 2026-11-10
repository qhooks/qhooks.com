// /lp-proof: shows, from chain, that QHooks launch liquidity is held by the launch contract with no remove path.
// Renders /api/v1/lp-proof (the same JSON scanners read). ?chain=&token= (or &pool=) shows one launch.
const root = document.getElementById('lpp-root'), qs = new URLSearchParams(location.search);
const NAMES = {'4663': 'Robinhood Chain', '8453': 'Base', '42161': 'Arbitrum One', '56': 'BNB Chain', '99901': 'Elysium'};
const ORDER = ['4663', '8453', '42161', '56', '99901'];
const el = (t, a = {}, ...k) => { const n = document.createElement(t); for (const [x, v] of Object.entries(a)) { if (v == null || v === false) continue; if (x.startsWith('on')) n.addEventListener(x.slice(2), v); else n.setAttribute(x, v === true ? '' : v); } n.append(...k.flat().filter(c => c != null && c !== false)); return n; };
const link = (href, text) => el('a', {href, target: '_blank', rel: 'noopener'}, text);
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const fmtL = s => { try { return BigInt(s).toLocaleString('en-US'); } catch { return s; } };

function contractCard(chain, c) {
  const writes = c.functions.filter(f => f.writes), views = c.functions.filter(f => !f.writes);
  return el('section', {class: 'lpp-contract'},
    el('h3', {}, NAMES[chain] + ' · launch contract ' + short(c.address)),
    el('dl', {class: 'lpp-facts'},
      el('dt', {}, 'Address'), el('dd', {}, c.address),
      el('dt', {}, 'Launches'), el('dd', {}, c.launches == null ? '–' : String(c.launches)),
      el('dt', {}, 'Verified source'), el('dd', {}, ...Object.entries(c.source).flatMap(([n, u], i) => [i ? ' · ' : '', link(u, n)])),
      el('dt', {}, 'Calls that change a position'), el('dd', {}, c.liquidityCalls.map(x => 'line ' + x.line + ': ' + x.change).join('; ')),
      el('dt', {}, 'Remove or withdraw function'), el('dd', {}, 'None')),
    c.note ? el('p', {class: 'lpp-note'}, c.note) : null,
    el('details', {}, el('summary', {}, 'All ' + c.functions.length + ' external functions (' + writes.length + ' write, ' + views.length + ' read-only)'),
      el('table', {class: 'lpp-fns'}, el('thead', {}, el('tr', {}, el('th', {}, 'Function'), el('th', {}, 'Effect on liquidity'))),
        el('tbody', {}, ...[...writes, ...views].map(f => el('tr', {}, el('td', {}, el('code', {}, f.signature)), el('td', {}, f.liquidity)))))));
}

function launchCard(j) {
  return el('section', {class: 'lpp-launch'},
    el('h2', {}, 'This launch'),
    el('dl', {class: 'lpp-facts'},
      el('dt', {}, 'Token'), el('dd', {}, j.token),
      el('dt', {}, 'Chain'), el('dd', {}, NAMES[j.chain] || j.chain),
      el('dt', {}, 'Pool id'), el('dd', {}, j.poolId),
      el('dt', {}, 'Pool hook'), el('dd', {}, j.poolKey.hooks + ' (the launch contract)'),
      el('dt', {}, 'Position owner'), el('dd', {}, j.position.owner + ' (the launch contract)'),
      el('dt', {}, 'Position range'), el('dd', {}, 'ticks ' + j.position.tickLower + ' to ' + j.position.tickUpper + ', salt 0'),
      el('dt', {}, 'Liquidity now'), el('dd', {}, fmtL(j.position.liquidity) + ' (read from Uniswap StateView ' + short(j.position.stateView) + ')'),
      el('dt', {}, 'LP fees go to'), el('dd', {}, j.payout),
      el('dt', {}, 'Remove or withdraw function'), el('dd', {}, 'None')),
    el('p', {}, j.statement),
    el('p', {class: 'lpp-note'}, 'Read at ' + j.readAt + '. Machine-readable: ', link('/api/v1/lp-proof?chain=' + j.chain + '&pool=' + j.poolId, '/api/v1/lp-proof?chain=' + j.chain + '&pool=' + j.poolId.slice(0, 10) + '…')));
}

async function render() {
  const chain = qs.get('chain') || '4663', token = (qs.get('token') || '').trim(), pool = (qs.get('pool') || '').trim();
  const kids = [];
  const sel = el('select', {'aria-label': 'Chain'}, ...ORDER.map(id => el('option', {value: id, selected: id === chain}, NAMES[id])));
  const inp = el('input', {placeholder: '0x… token address', value: token, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Token address'});
  const go = el('button', {type: 'button', class: 'qtx-mini qas-go'}, 'Check this launch');
  go.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('chain', sel.value); u.searchParams.delete('pool'); if (inp.value.trim()) u.searchParams.set('token', inp.value.trim()); else u.searchParams.delete('token'); location.href = u.toString(); });
  kids.push(el('div', {class: 'lpp-row'}, sel, inp, go));
  if (token || pool) {
    const r = await fetch('/api/v1/lp-proof?chain=' + encodeURIComponent(chain) + (pool ? '&pool=' + encodeURIComponent(pool) : '&token=' + encodeURIComponent(token)));
    const j = await r.json().catch(() => ({}));
    kids.push(r.ok ? launchCard(j) : el('p', {class: 'lpp-note', 'data-tone': 'bad'}, j.hint || 'That could not be read right now.'));
  }
  const all = await (await fetch('/api/v1/lp-proof')).json();
  kids.push(el('h2', {}, 'Launch contracts'), el('p', {}, all.statement));
  for (const id of ORDER) { const c = all.chains.find(x => x.chain === id); if (c) for (const k of c.contracts) kids.push(contractCard(id, k)); }
  kids.push(el('p', {class: 'lpp-note'}, 'Machine-readable for scanners: ', link('/api/v1/lp-proof', '/api/v1/lp-proof'), ' (add ?chain=<id>&token=<address> for one launch). Read at ' + all.readAt + '.'));
  root.replaceChildren(...kids);
}
render().catch(() => { root.textContent = 'This could not be read right now. Try again in a moment.'; });
