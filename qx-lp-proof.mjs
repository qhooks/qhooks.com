// /lp-proof: shows, from chain, that QHooks launch liquidity is held by the launch contract with no remove path.
// Renders /api/v1/lp-proof (the same JSON scanners read). ?chain=&token= (or &pool=) shows one launch.
const root = document.getElementById('lpp-root'), qs = new URLSearchParams(location.search);
const NAMES = {'4663': 'Robinhood Chain', '8453': 'Base', '42161': 'Arbitrum One', '1': 'Ethereum', '56': 'BNB Chain', '99901': 'Elysium'};
const ORDER = ['1', '4663', '8453', '42161', '56', '99901'];
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
      el('dt', {}, 'Calls that change a position'), el('dd', {}, c.liquidityCalls.map(x => (x.line ? 'line ' + x.line + ': ' : '') + x.change).join('; ')),
      el('dt', {}, 'Remove or withdraw function'), el('dd', {}, 'None')),
    c.note ? el('p', {class: 'lpp-note'}, c.note) : null,
    el('details', {}, el('summary', {}, 'All ' + c.functions.length + ' external functions (' + writes.length + ' write, ' + views.length + ' read-only)'),
      el('table', {class: 'lpp-fns'}, el('thead', {}, el('tr', {}, el('th', {}, 'Function'), el('th', {}, 'Effect on liquidity'))),
        el('tbody', {}, ...[...writes, ...views].map(f => el('tr', {}, el('td', {}, el('code', {}, f.signature)), el('td', {}, f.liquidity)))))));
}

const OFFICIAL = {chain: '4663', pool: '0x007d77e43164a5d7d1251457f47f556c2be7f865942c7ec7a91c3cbbf50e53fe', symbols: ['WETH', 'QHOOKS']};
const amt = (raw, sym) => { const n = Number(raw) / 1e18; return (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toLocaleString('en-US', {maximumSignificantDigits: 4})) + ' ' + sym; };
const KIND = {launch: 'Launch contract', flywheel: 'Liquidity flywheel', floor: 'Floor bid', unknown: 'Other'};

function holdersCard(j) {
  const h = j.holders; if (!h) return null;
  const syms = j.poolId === OFFICIAL.pool ? OFFICIAL.symbols : null;
  return el('section', {class: 'lpp-holders'},
    el('h3', {}, 'Who holds this pool\'s liquidity'),
    h.total ? el('p', {class: 'lpp-total'}, h.total + '.') : el('p', {class: 'lpp-note', 'data-tone': h.complete ? 'bad' : null},
      h.complete ? 'Not every position in this pool belongs to a contract with no withdraw path. See the list below.' : 'The full position list could not be read right now. Try again in a moment.'),
    ...h.positions.map(x => el('div', {class: 'lpp-holder', 'data-kind': x.kind},
      el('div', {class: 'lpp-hhead'}, el('strong', {}, KIND[x.kind] || x.kind), el('strong', {class: 'lpp-share'}, x.valueShare + '%')),
      el('dl', {class: 'lpp-facts'},
        el('dt', {}, 'Owner'), el('dd', {}, el('code', {}, x.owner), el('br'), el('span', {class: 'lpp-sub'}, x.name)),
        el('dt', {}, 'Share'), el('dd', {}, x.valueShare + '% of value · ' + (x.inRange ? x.activeLiquidityShare + '% of in-range liquidity' : 'out of range')
          + (syms ? ' · ' + amt(x.amount0Raw, syms[0]) + ' + ' + amt(x.amount1Raw, syms[1]) : '')),
        el('dt', {}, 'Why it can\'t be removed'), el('dd', {}, x.reason),
        el('dt', {}, 'Verified source'), el('dd', {}, ...Object.entries(x.source).flatMap(([n, u], i) => [i ? ' · ' : '', link(u, n)]))))),
    el('p', {class: 'lpp-note'}, h.method + ' Scanned from block ' + h.scannedFromBlock.toLocaleString('en-US') + '. In-range liquidity of these positions: ' + fmtL(h.knownActiveLiquidity) + ' of the pool\'s ' + fmtL(h.activeLiquidity) + '.'));
}

function launchCard(j) {
  return el('section', {class: 'lpp-launch'},
    el('h2', {}, j.poolId === OFFICIAL.pool ? 'Official QHOOKS pool' : (j.quoteSymbol || 'Quote') + ' pool' + (j.main ? ' · main' : '')),
    el('dl', {class: 'lpp-facts'},
      el('dt', {}, 'Token'), el('dd', {}, j.token + (j.poolId === OFFICIAL.pool ? ' (QHOOKS, official pool)' : '')),
      el('dt', {}, 'Chain'), el('dd', {}, NAMES[j.chain] || j.chain),
      el('dt', {}, 'Pool id'), el('dd', {}, j.poolId),
      el('dt', {}, 'Pool hook'), el('dd', {}, j.poolKey.hooks + ' (the launch contract)'),
      el('dt', {}, 'Position owner'), el('dd', {}, j.position.owner + ' (the launch contract)'),
      el('dt', {}, 'Position range'), el('dd', {}, 'ticks ' + j.position.tickLower + ' to ' + j.position.tickUpper + ', salt 0'),
      el('dt', {}, 'Liquidity now'), el('dd', {}, fmtL(j.position.liquidity) + ' (read from Uniswap StateView ' + short(j.position.stateView) + ')'),
      el('dt', {}, 'LP fees go to'), el('dd', {}, j.payout),
      el('dt', {}, 'Remove or withdraw function'), el('dd', {}, 'None')),
    el('p', {}, j.statement),
    holdersCard(j),
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
  {
    const r = await fetch('/api/v1/lp-proof?chain=' + encodeURIComponent(token || pool ? chain : OFFICIAL.chain) + (pool ? '&pool=' + encodeURIComponent(pool) : token ? '&token=' + encodeURIComponent(token) : '&pool=' + OFFICIAL.pool));
    const j = await r.json().catch(() => ({}));
    kids.push(...(r.ok ? (j.pools || [j]).map(p => launchCard({...p, readAt:j.readAt})) : [el('p', {class: 'lpp-note', 'data-tone': 'bad'}, j.hint || 'That could not be read right now.')]));
  }
  const all = await (await fetch('/api/v1/lp-proof')).json();
  kids.push(el('h2', {}, 'Launch contracts'), el('p', {}, all.statement));
  for (const id of ORDER) { const c = all.chains.find(x => x.chain === id); if (c) for (const k of c.contracts) kids.push(contractCard(id, k)); }
  kids.push(el('p', {class: 'lpp-note'}, 'Machine-readable for scanners: ', link('/api/v1/lp-proof', '/api/v1/lp-proof'), ' (add ?chain=<id>&token=<address> for one launch). Read at ' + all.readAt + '.'));
  root.replaceChildren(...kids);
}
render().catch(() => { root.textContent = 'This could not be read right now. Try again in a moment.'; });
