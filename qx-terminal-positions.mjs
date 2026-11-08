// Wallet holdings, not a synthetic trade ledger. Outside-token cost basis stays unavailable.
import { chainById } from './chains.mjs';
const EVM = /^0x[0-9a-f]{40}$/i, SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const known = n => typeof n === 'number' && Number.isFinite(n);
const positive = n => known(n) && n > 0 ? n : null;
const decimals = n => Number.isInteger(n) && n >= 0 && n <= 36 ? n : null;
const rawBalance = n => typeof n === 'string' && /^\d{1,78}$/.test(n) && BigInt(n) < 1n << 256n ? n : null;
const address = (chain, a) => typeof a === 'string' && (chain === 'solana' ? SOL.test(a) : EVM.test(a)) ? chain === 'solana' ? a : a.toLowerCase() : null;
const sameOwner = (chain, a, b) => address(chain, a) !== null && address(chain, a) === address(chain, b);
const ownerKey = owners => [owners.evm || '', owners.solana || ''].join('|');
const chainName = chain => chain === 'solana' ? 'Solana' : chainById(chain)?.short || String(chain);
const rowKey = row => row.chainId + ':' + (row.native ? 'native' : row.token);
const targetKey = s => s?.token ? String(s.chainId) + ':' + (address(String(s.chainId), s.token) || '') : '';
const selectedKey = s => targetKey(s) + ':' + (s?.revision ?? '') + ':' + (s?.controller || '');
const quantity = n => known(n) ? n.toLocaleString('en-US', { maximumSignificantDigits: 7 }) : 'Unavailable';
const money = n => known(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n > 0 && n < .01 ? 6 : 2 }) : 'Unavailable';
const text = (s, fallback = '') => typeof s === 'string' && s.trim() ? s.slice(0, 100) : fallback;
const units = (balance, dec) => balance !== null && dec !== null && known(Number(balance) / 10 ** dec) ? Number(balance) / 10 ** dec : null;

export function indexedPositionCost(row) {
  const c = row.cost, held = units(row.balance, row.decimals);
  if (!c || held === null || !known(c.boughtUnits) || c.boughtUnits <= 0 || !known(c.soldUnits) ||
      c.soldUnits < 0 || c.soldUnits > c.boughtUnits || !known(c.spentQuote) || c.spentQuote < 0 ||
      !known(c.receivedQuote) || c.receivedQuote < 0 || !known(c.pnlQuote) || !text(c.quoteSymbol)) return null;
  const net = c.boughtUnits - c.soldUnits;
  // A creator allocation or a transfer cannot be assigned a zero purchase price. Incomplete trade
  // coverage also cannot establish P&L for the actual holding.
  if (Math.abs(held - net) > Math.max(1, held, net) * 1e-8) return null;
  return { average: c.spentQuote / c.boughtUnits, pnlQuote: c.pnlQuote, pnlUsd: known(c.pnlUsd) ? c.pnlUsd : null,
    quoteSymbol: text(c.quoteSymbol), approximate: true };
}

function holding(input, chain, owner, at) {
  if (!input || typeof input !== 'object') return null;
  const token = address(chain, input.address), dec = decimals(input.decimals), balance = rawBalance(input.balance);
  if (!token) return null;
  const priceUsd = positive(input.priceUsd), amount = units(balance, dec);
  const controller = address(chain, input.qhooks?.controller);
  return { chainId: chain, token, owner, native: false, balance, decimals: dec, units: amount,
    symbol: text(input.symbol, token.slice(0, 6) + '…' + token.slice(-4)), name: text(input.name), priceUsd,
    valueUsd: amount === 0 ? 0 : amount !== null && priceUsd !== null ? amount * priceUsd : null,
    kind: controller ? 'launch' : 'external', controller, cost: controller ? input.cost || null : null,
    flagged: input.spam === true, flagReason: text(input.spamReason), at };
}

export function portfolioHoldings(report, { family, owner }) {
  if (report?.version !== 1 || !sameOwner(family, report.address, owner) || !Array.isArray(report.chains)) throw new Error('The holdings response does not match this wallet.');
  const rows = [], notes = []; let partial = report.partial === true;
  for (const chain of report.chains) {
    const id = String(chain?.chainId), native = chain?.native;
    if ((family === 'solana' ? id !== 'solana' : !chainById(id)) || !Array.isArray(chain.tokens)) { partial = true; notes.push('Some reported chains are not supported in this view.'); continue; }
    if (chain.error) { partial = true; notes.push(chainName(id) + ': some balances, prices or indexed history are unavailable.'); }
    if (chain.source === 'index-only') { partial = true; notes.push(chainName(id) + ': token discovery covers indexed launches and stablecoins; the selected token is also read directly.'); }
    if (native) {
      const balance = rawBalance(native.balance), dec = decimals(native.decimals), amount = units(balance, dec), priceUsd = positive(native.priceUsd);
      if (balance === null || BigInt(balance) > 0n) rows.push({ chainId: id, token: null, owner, native: true, kind: 'native',
        symbol: text(native.symbol, chainById(id)?.native || 'SOL'), name: 'Network coin', balance, decimals: dec, units: amount,
        priceUsd, valueUsd: amount === 0 ? 0 : amount !== null && priceUsd !== null ? amount * priceUsd : null, cost: null, at: report.at });
    }
    for (const token of chain.tokens) { const row = holding(token, id, owner, report.at); if (row && (row.balance === null || BigInt(row.balance) > 0n)) rows.push(row); }
  }
  return { rows, partial, notes, at: known(report.at) ? report.at : null };
}

async function boundedRead(work, signal, ms = 12000) {
  const controller = new AbortController(); let timer, rejectCancel;
  const cancelled = new Promise((_, reject) => { rejectCancel = reject; });
  const cancel = () => { controller.abort(); rejectCancel(new Error('This holdings read was replaced.')); };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    return await Promise.race([work(controller.signal), cancelled, new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new Error('Holdings took too long. Refresh to try again.'));
    }, ms); })]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

export async function readSelectedHolding({ selection, owner, signal }, { fetchImpl = (...args) => globalThis.fetch(...args),
  loadChain = () => import('/qx-chain.mjs'), now = Date.now } = {}) {
  const chain = String(selection?.chainId), token = address(chain, selection?.token);
  if (!token || !sameOwner(chain, owner, owner) || chain !== 'solana' && !chainById(chain)) throw new Error('This selected holding is not supported.');
  let data;
  if (chain === 'solana') {
    const response = await fetchImpl('/api/terminal/sol/balance/' + owner + '?mint=' + token, { cache: 'no-store', signal });
    if (!response.ok) throw new Error('Selected token balance is unavailable.');
    const body = await response.json().catch(() => null);
    data = { balance: body?.token, decimals: body?.decimals, symbol: selection.symbol, name: selection.name };
  } else {
    let body;
    try { const { erc20 } = await loadChain(); body = await erc20(chain, token, owner); }
    catch { throw new Error('Selected token balance is unavailable. Refresh holdings or reopen this token.'); }
    data = { balance: typeof body?.balance === 'bigint' ? body.balance.toString() : null,
      decimals: body?.decimals, symbol: body?.symbol || selection.symbol, name: selection.name };
  }
  if (rawBalance(data.balance) === null || decimals(data.decimals) === null) throw new Error('Selected token balance or precision is unavailable.');
  const row = holding({ ...data, address: token, priceUsd: selection.priceUsd,
    qhooks: selection.kind === 'launch' ? { controller: selection.controller } : null }, chain, owner, now());
  return { ...row, direct: true };
}

export function createPositionsPanel({ h, pane, getOwner, getSolOwner = () => null, getSelection = () => null,
  onOpen, onSell, onConnect, isVisible = () => true, fetchImpl = (...args) => globalThis.fetch(...args),
  readSelectedBalance = input => readSelectedHolding(input, { fetchImpl, now }), now = Date.now,
  document = pane?.ownerDocument || globalThis.document } = {}) {
  let revision = 0, actionRevision = 0, disposed = false, aborter, signature = null, selectionSignature = null;
  let reports = [], direct = null, pending = 0, failures = [], actionMessage = '', actionBusy = false, limit = 20;
  if (document?.head && !document.getElementById('qxt-positions-style')) document.head.append(h('link', {
    id: 'qxt-positions-style', rel: 'stylesheet', href: '/qx-terminal-positions.css',
  }));
  const owners = () => ({ evm: address('evm', getOwner?.()), solana: address('solana', getSolOwner?.()) });
  const currentOwner = row => row.chainId === 'solana' ? owners().solana : owners().evm;
  const selection = () => getSelection?.() || null;
  const supported = row => !row.native && (row.kind === 'launch' ? chainById(row.chainId)?.router === true : ['1', '8453', '42161', '56', '4663', 'solana'].includes(row.chainId));

  function rows() {
    const out = new Map();
    for (const report of reports) for (const row of report.rows) out.set(rowKey(row), row);
    if (direct) {
      const prior = out.get(rowKey(direct));
      const priceUsd = positive(direct.priceUsd) ?? positive(prior?.priceUsd);
      out.set(rowKey(direct), { ...prior, ...direct, cost: prior?.cost || null, flagged: prior?.flagged || false,
        flagReason: prior?.flagReason || '', priceUsd, valueUsd: direct.units === 0 ? 0 : direct.units !== null && priceUsd !== null ? direct.units * priceUsd : null });
    }
    const chosen = targetKey(selection());
    return [...out.values()].sort((a, b) => Number(rowKey(b) === chosen) - Number(rowKey(a) === chosen) || (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
  }

  async function act(row, percent = null) {
    if (disposed || actionBusy || !supported(row) || !sameOwner(row.chainId, row.owner, currentOwner(row))) return false;
    const mine = ++actionRevision, owner = currentOwner(row), target = { kind: row.kind, chainId: row.chainId,
      token: row.token, address: row.token, ...(row.controller ? { controller: row.controller } : {}) };
    actionBusy = true; actionMessage = percent ? 'Opening a fresh sell review…' : 'Opening this market…'; paint();
    const alive = () => !disposed && mine === actionRevision && sameOwner(row.chainId, owner, currentOwner(row));
    try {
      if (!await onOpen?.(target) || !alive()) { if (alive()) actionMessage = 'This market could not be opened. Finish any active trade or refresh and try again.'; return false; }
      const current = selection();
      if (targetKey(current) !== targetKey(target) || row.kind === 'launch' && current.controller?.toLowerCase() !== row.controller) { actionMessage = 'Selection changed. Choose the holding again to prepare a sell.'; return false; }
      if (percent !== null) {
        if (!await onSell?.({ target, owner, percent }) || !alive()) { if (alive()) actionMessage = 'The sell was not prepared. Review the current market or refresh holdings.'; return false; }
        actionMessage = 'Sell ' + percent + '% prepared. Review the fresh quote in the trade ticket.';
      } else actionMessage = 'Market opened.';
      return true;
    } catch (error) { if (alive()) actionMessage = error?.message || 'Could not prepare this market. Refresh and try again.'; return false; }
    finally { if (mine === actionRevision) { actionBusy = false; paint(); } }
  }

  function paint() {
    if (disposed || !isVisible()) return;
    if (ownerKey(owners()) !== signature) { void refresh(); return; }
    const me = owners(), items = rows(), chosen = targetKey(selection());
    const refreshButton = h('button', { type: 'button', class: 'qxt-mini', disabled: pending > 0,
      onclick: () => { void refresh(); } }, pending ? 'Reading…' : 'Refresh holdings');
    const head = h('div', { class: 'qxpos-head' }, h('div', {}, h('b', {}, 'Your holdings'),
      h('span', { class: 'qxpos-sub' }, 'Wallet balances · reviewed exits')), refreshButton);
    const identities = h('div', { class: 'qxpos-wallets' }, ...Object.entries(me).filter(([, owner]) => owner).map(([family, owner]) =>
      h('span', {}, family === 'solana' ? 'Solana ' : 'EVM ', h('code', { title: owner }, owner))));
    if (!me.evm && !me.solana) {
      pane.replaceChildren(h('section', { class: 'qxpos' }, head, h('p', { class: 'qxt-empty' }, 'Connect a wallet to read holdings and prepare a sell.'),
        ...(onConnect ? [h('button', { type: 'button', class: 'qxt-mini', onclick: () => onConnect(selection()?.chainId === 'solana' ? 'solana' : 'evm') }, 'Connect wallet')] : [])));
      return;
    }
    const note = pending ? 'Reading supported holdings…' : reports.some(r => r.partial) || failures.length ? 'Partial coverage · unavailable data is not a zero balance.' : 'Supported holdings returned by this reading.';
    const notes = [...new Set([...failures, ...reports.flatMap(r => r.notes)])];
    const list = items.slice(0, limit).map(row => {
      const cost = indexedPositionCost(row), canSell = supported(row) && row.balance !== null && BigInt(row.balance) > 0n && row.decimals !== null;
      const readTime = Number.isSafeInteger(row.at) && row.at > 0 && row.at <= now() + 60_000 ? new Date(row.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
      const cell = (label, value) => h('div', { class: 'qxpos-stat' }, h('span', {}, label), h('b', {}, value));
      return h('article', { class: 'qxpos-row' + (rowKey(row) === chosen ? ' selected' : ''), 'data-position': rowKey(row) },
        h('div', { class: 'qxpos-identity' }, h('b', {}, row.symbol), h('span', {}, chainName(row.chainId), row.native ? ' · Network coin' : rowKey(row) === chosen ? ' · Selected token' : ''),
          ...(!row.native ? [h('code', { title: row.token }, row.token)] : [])),
        h('div', { class: 'qxpos-stats' }, cell(row.stale ? 'Last balance' : 'Available', quantity(row.units)), cell('Est. price', money(row.priceUsd)), cell('Est. value', money(row.valueUsd)),
          cell('Indexed avg buy', cost ? quantity(cost.average) + ' ' + cost.quoteSymbol : 'Unavailable'),
          cell('Est. P&L', cost ? (cost.pnlQuote > 0 ? '+' : '') + quantity(cost.pnlQuote) + ' ' + cost.quoteSymbol : 'Unavailable')),
        row.flagged ? h('p', { class: 'qxpos-note' }, 'Needs review: ' + (row.flagReason || 'flagged by the data source')) : null,
        cost ? h('p', { class: 'qxpos-note' }, 'Approximate P&L from indexed QHooks trades only. It is not complete wallet history.') : null,
        h('p', { class: 'qxpos-note' }, (row.stale ? 'Last observed balance ' : row.direct ? 'Balance checked ' : 'Portfolio snapshot read ') + (readTime || 'time unavailable') + '. Price and P&L estimates may have different coverage.'),
        h('div', { class: 'qxpos-actions' },
          row.native ? h('span', { class: 'qxpos-note' }, 'Native balance is separate from wrapped-token holdings.') :
            supported(row) ? h('button', { type: 'button', class: 'qxt-mini', disabled: actionBusy, onclick: () => { void act(row); } }, 'Open market') : h('span', { class: 'qxpos-note' }, 'Trading is unavailable for this asset here.'),
          ...(supported(row) && onSell ? [25, 50, 100].map(percent => h('button', { type: 'button', class: 'qxt-mini', disabled: actionBusy || !canSell,
            'aria-label': 'Review selling ' + percent + '% of ' + row.symbol + ' on ' + chainName(row.chainId), onclick: () => { void act(row, percent); } }, 'Sell ' + percent + '%')) : [])));
    });
    pane.replaceChildren(h('section', { class: 'qxpos', 'aria-busy': String(pending > 0) }, head, identities,
      h('p', { class: 'qxpos-status', role: 'status', 'aria-live': 'polite' }, actionMessage || note),
      ...(!items.length ? [h('p', { class: 'qxt-empty' }, pending ? 'Reading wallet balances…' : failures.length ? 'Holdings are unavailable. Refresh to try again.' : 'No nonzero holdings were returned. Select a token to check its balance directly.')] : list),
      ...(items.length > limit ? [h('button', { type: 'button', class: 'qxt-mini', onclick: () => { limit += 20; paint(); } }, 'Show more holdings')] : []),
      h('p', { class: 'qxpos-note' }, 'Sell buttons fill a fresh ticket for review. They never submit a trade. Cost basis and P&L are unavailable when indexed history does not cover the holding.'),
      ...notes.map(note => h('p', { class: 'qxpos-note' }, note))));
  }

  async function refresh() {
    if (disposed) return;
    const me = owners(), key = ownerKey(me), chosen = selection(), mine = ++revision, priorSelection = selectionSignature;
    if (key !== signature) { reports = []; direct = null; actionMessage = ''; actionBusy = false; actionRevision++; }
    signature = key; selectionSignature = selectedKey(chosen);
    aborter?.abort(); aborter = new AbortController();
    // Keep this owner's last observation visible until a fresh read replaces it.
    // A failed read is not a zero balance. Direct reads belong to an exact selection.
    reports = reports.map(report => ({ ...report, stale: true, rows: report.rows.map(row => ({ ...row, stale: true })) }));
    direct = direct && selectedKey(chosen) === priorSelection ? { ...direct, stale: true } : null;
    failures = []; pending = 0;
    const jobs = [];
    const alive = () => !disposed && mine === revision && ownerKey(owners()) === key;
    const job = work => { pending++; jobs.push((async () => { try { await work(); } catch (error) { if (alive()) failures.push(error?.message || 'Some holdings are unavailable.'); }
      finally { if (alive()) { pending--; paint(); } } })()); };
    for (const [family, owner] of Object.entries(me)) if (owner) job(async () => {
      const report = await boundedRead(async signal => {
        const response = await fetchImpl('/api/portfolio/' + family + '/' + owner, { cache: 'no-store', signal });
        if (!response.ok) throw new Error((family === 'evm' ? 'EVM' : 'Solana') + ' holdings are unavailable. Refresh to try again.');
        return portfolioHoldings(await response.json(), { family, owner });
      }, aborter.signal);
      if (alive()) reports = [...reports.filter(previous => previous.family !== family), { ...report, family }];
    });
    const family = chosen?.chainId === 'solana' ? 'solana' : 'evm', owner = me[family];
    if (chosen?.token && owner) job(async () => {
      const row = await boundedRead(signal => readSelectedBalance({ selection: chosen, owner, signal }), aborter.signal);
      if (alive() && selectedKey(selection()) === selectedKey(chosen)) {
        if (row.chainId !== String(chosen.chainId) || row.token !== address(String(chosen.chainId), chosen.token) || !sameOwner(row.chainId, row.owner, owner)) throw new Error('Selected holding identity changed. Refresh to try again.');
        direct = row;
      }
    });
    else if (chosen?.token && !owner) failures.push(chosen.chainId === 'solana' ? 'Connect the Solana wallet in the trade ticket to check this token.' : 'Connect an EVM wallet to check the selected token.');
    paint(); await Promise.allSettled(jobs);
  }

  return { render() {
    if (disposed) return;
    if (ownerKey(owners()) !== signature || selectedKey(selection()) !== selectionSignature) { void refresh(); return; }
    paint();
  }, refresh, dispose() { disposed = true; revision++; actionRevision++; aborter?.abort(); } };
}
