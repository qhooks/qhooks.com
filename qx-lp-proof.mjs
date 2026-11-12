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
    el('div', {class: 'lpp-crow'},
      el('span', {class: 'lpp-ok', 'aria-hidden': 'true'}),
      el('div', {class: 'lpp-cmain'},
        el('h3', {}, NAMES[chain] + ' · launch contract ' + short(c.address)),
        el('p', {class: 'lpp-sub'}, 'No remove or withdraw function · ' + (c.launches == null ? '–' : String(c.launches)) + ' launches'))),
    el('details', {class: 'hl-more lpp-more'}, el('summary', {}, 'Read the contract'),
      el('dl', {class: 'lpp-facts'},
        el('div', {}, el('dt', {}, 'Address'), el('dd', {class: 'hl-addr-full'}, c.address)),
        el('div', {}, el('dt', {}, 'Launches'), el('dd', {}, c.launches == null ? '–' : String(c.launches))),
        el('div', {}, el('dt', {}, 'Verified source'), el('dd', {}, ...Object.entries(c.source).flatMap(([n, u], i) => [i ? ' · ' : '', link(u, n)]))),
        el('div', {}, el('dt', {}, 'Calls that change a position'), el('dd', {}, c.liquidityCalls.map(x => (x.line ? 'line ' + x.line + ': ' : '') + x.change).join('; '))),
        el('div', {}, el('dt', {}, 'Remove or withdraw function'), el('dd', {}, 'None'))),
      c.note ? el('p', {class: 'lpp-note'}, c.note) : null,
      el('details', {class: 'hl-more lpp-more'}, el('summary', {}, 'All ' + c.functions.length + ' external functions (' + writes.length + ' write, ' + views.length + ' read-only)'),
        el('div', {class: 'lpp-fns'}, ...[...writes, ...views].map(f => el('div', {class: 'lpp-fn'}, el('span', {class: 'lpp-sig'}, f.signature), el('span', {}, f.liquidity)))))));
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
      el('div', {class: 'lpp-hhead'}, el('strong', {}, KIND[x.kind] || x.kind), el('span', {class: 'lpp-bar', 'aria-hidden': 'true', 'data-share': String(x.valueShare)}), el('strong', {class: 'lpp-share'}, x.valueShare + '%')),
      el('p', {class: 'lpp-sub'}, x.reason),
      el('details', {class: 'hl-more lpp-more'}, el('summary', {}, 'Owner and source'),
        el('dl', {class: 'lpp-facts'},
          el('div', {}, el('dt', {}, 'Owner'), el('dd', {}, el('span', {class: 'hl-addr-full'}, x.owner), el('br'), el('span', {class: 'lpp-sub'}, x.name))),
          el('div', {}, el('dt', {}, 'Share'), el('dd', {}, x.valueShare + '% of value · ' + (x.inRange ? x.activeLiquidityShare + '% of in-range liquidity' : 'out of range')
            + (syms ? ' · ' + amt(x.amount0Raw, syms[0]) + ' + ' + amt(x.amount1Raw, syms[1]) : ''))),
          el('div', {}, el('dt', {}, 'Why it can\'t be removed'), el('dd', {}, x.reason)),
          el('div', {}, el('dt', {}, 'Verified source'), el('dd', {}, ...Object.entries(x.source).flatMap(([n, u], i) => [i ? ' · ' : '', link(u, n)]))))))),
    el('p', {class: 'lpp-note'}, h.method + ' Scanned from block ' + h.scannedFromBlock.toLocaleString('en-US') + '. In-range liquidity of these positions: ' + fmtL(h.knownActiveLiquidity) + ' of the pool\'s ' + fmtL(h.activeLiquidity) + '.'));
}

// Verdict first: who owns the launch position and whether anything can pull it. The full chain read sits underneath.
function launchCard(j) {
  return el('section', {class: 'lpp-launch'},
    el('div', {class: 'lpp-verdict'},
      el('span', {class: 'lpp-seal', 'aria-hidden': 'true'}),
      el('div', {},
        el('h2', {}, j.poolId === OFFICIAL.pool ? 'Official QHOOKS pool' : (j.quoteSymbol || 'Quote') + ' pool' + (j.main ? ' · main' : '')),
        el('p', {class: 'lpp-verdict-line'}, 'Launch liquidity is held by the launch contract. Remove or withdraw function: none.'))),
    el('ul', {class: 'qa-checks lpp-checks'},
      el('li', {}, 'Position owner is the launch contract (' + short(j.position.owner) + ')'),
      el('li', {}, 'Pool hook is the launch contract (' + short(j.poolKey.hooks) + ')'),
      el('li', {}, 'Liquidity now ' + fmtL(j.position.liquidity) + ', read from Uniswap StateView'),
      el('li', {}, 'LP fees go to ' + j.payout)),
    el('p', {class: 'lpp-statement'}, j.statement),
    holdersCard(j),
    el('details', {class: 'hl-more lpp-more'}, el('summary', {}, 'Every value read from chain'),
      el('dl', {class: 'lpp-facts'},
        el('div', {}, el('dt', {}, 'Token'), el('dd', {}, el('span', {class: 'hl-addr-full'}, j.token), j.poolId === OFFICIAL.pool ? ' (QHOOKS, official pool)' : '')),
        el('div', {}, el('dt', {}, 'Chain'), el('dd', {}, NAMES[j.chain] || j.chain)),
        el('div', {}, el('dt', {}, 'Pool id'), el('dd', {}, el('span', {class: 'hl-addr-full'}, j.poolId))),
        el('div', {}, el('dt', {}, 'Pool hook'), el('dd', {}, el('span', {class: 'hl-addr-full'}, j.poolKey.hooks), ' (the launch contract)')),
        el('div', {}, el('dt', {}, 'Position owner'), el('dd', {}, el('span', {class: 'hl-addr-full'}, j.position.owner), ' (the launch contract)')),
        el('div', {}, el('dt', {}, 'Position range'), el('dd', {}, 'ticks ' + j.position.tickLower + ' to ' + j.position.tickUpper + ', salt 0')),
        el('div', {}, el('dt', {}, 'Liquidity now'), el('dd', {}, fmtL(j.position.liquidity) + ' (read from Uniswap StateView ' + short(j.position.stateView) + ')')),
        el('div', {}, el('dt', {}, 'LP fees go to'), el('dd', {}, j.payout)),
        el('div', {}, el('dt', {}, 'Remove or withdraw function'), el('dd', {}, 'None')))),
    el('p', {class: 'lpp-note'}, 'Read at ' + j.readAt + '. Machine-readable: ', link('/api/v1/lp-proof?chain=' + j.chain + '&pool=' + j.poolId, '/api/v1/lp-proof?chain=' + j.chain + '&pool=' + j.poolId.slice(0, 10) + '…')));
}

// First paint (2026-11-12, main's finish sweep: /lp-proof sat on "Loading…" past 6 s while the chain read ran). The last
// good answer this browser saw, or for the default view the snapshot shipped with the page (/lp-proof-first.json), paints
// at once with its own "Read at" time; the live read replaces it, and a failed live read leaves it in place.
const LOCAL = 'qhooks.lpp.v1:', LOCAL_MAX = 7 * 864e5;
const peek = k => { try { const v = JSON.parse(localStorage.getItem(LOCAL + k) || 'null'); return v && Date.now() - v.at < LOCAL_MAX ? v.body : null; } catch { return null; } };
const keep = (k, body) => { try { localStorage.setItem(LOCAL + k, JSON.stringify({at: Date.now(), body})); } catch {} };

function page(one, all, lookup) {
  const kids = [];
  kids.push(...(one.ok ? (one.body.pools || [one.body]).map(p => launchCard({...p, readAt: one.body.readAt})) : [el('p', {class: 'lpp-note', 'data-tone': 'bad'}, one.body?.hint || 'That could not be read right now.')]));
  // The verdict comes first; looking up another launch follows it.
  kids.push(lookup);
  if (all) {
    kids.push(el('h2', {class: 'lpp-h2'}, 'Launch contracts'), el('p', {class: 'lpp-statement'}, all.statement));
    for (const id of ORDER) { const c = all.chains.find(x => x.chain === id); if (c) for (const k of c.contracts) kids.push(contractCard(id, k)); }
    kids.push(el('p', {class: 'lpp-note'}, 'Machine-readable for scanners: ', link('/api/v1/lp-proof', '/api/v1/lp-proof'), ' (add ?chain=<id>&token=<address> for one launch). Read at ' + all.readAt + '.'));
  }
  return kids;
}

async function render() {
  const chain = qs.get('chain') || '4663', token = (qs.get('token') || '').trim(), pool = (qs.get('pool') || '').trim();
  const sel = el('select', {'aria-label': 'Chain'}, ...ORDER.map(id => el('option', {value: id, selected: id === chain}, NAMES[id])));
  const inp = el('input', {placeholder: '0x… token address', value: token, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Token address'});
  const go = el('button', {type: 'button', class: 'qa-btn qa-btn--secondary qtx-mini qas-go'}, 'Check this launch');
  go.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('chain', sel.value); u.searchParams.delete('pool'); if (inp.value.trim()) u.searchParams.set('token', inp.value.trim()); else u.searchParams.delete('token'); location.href = u.toString(); });
  const lookup = el('div', {class: 'lpp-lookup'}, el('h3', {class: 'lpp-lookup-t'}, 'Check another launch'), el('div', {class: 'lpp-row hl-form'}, el('label', {}, 'Chain', sel), el('label', {}, 'Token address', inp), go));
  const paint = (one, all) => {
    root.replaceChildren(...page(one, all, lookup));
    for (const b of root.querySelectorAll('.lpp-bar')) b.style.setProperty('--share', Math.max(0, Math.min(100, Number(b.dataset.share) || 0)) + '%');
  };
  const key = token || pool ? chain + ':' + (pool || token).toLowerCase() : 'official';
  let painted = false;
  const first = peek(key) || (key === 'official' ? await fetch('/lp-proof-first.json').then(r => r.ok ? r.json() : null).catch(() => null) : null);
  if (first?.one?.ok) { paint(first.one, first.all); painted = true; }
  const oneURL = '/api/v1/lp-proof?chain=' + encodeURIComponent(token || pool ? chain : OFFICIAL.chain) + (pool ? '&pool=' + encodeURIComponent(pool) : token ? '&token=' + encodeURIComponent(token) : '&pool=' + OFFICIAL.pool);
  const [one, all] = await Promise.all([
    fetch(oneURL).then(async r => ({ok: r.ok, body: await r.json().catch(() => ({}))})).catch(() => null),
    fetch('/api/v1/lp-proof').then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  if (!one) { if (!painted) throw new Error('read failed'); return; }
  if (!one.ok && painted) return; // keep the last good verdict on screen
  paint(one, all || first?.all || null);
  if (one.ok && all) keep(key, {one, all});
}
render().catch(() => { root.textContent = 'This could not be read right now. Try again in a moment.'; });
