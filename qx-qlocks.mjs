// QLocks page (/qlocks): look up any token's locks, lock tokens (one or a whole sheet), lock LP positions, manage
// your own locks, and, in a separate section, revocable staff grants (never shown or counted as locked).
// Reads go to public RPCs; every write is a transaction the connected wallet signs.
import { calldata, ethCall, rpc, words, toAddress, uintArray, parseUnits, formatUnits, erc20, send, ensureAllowance, connectedAddress, onWalletChange, CHAIN_NAME, codeAt, h } from '/qx-chain.mjs';
import { visibleChains, chainById } from '/chains.mjs';
import * as C from '/qx-qlocks-core.mjs';
import { extraAddress } from '/qx-extras.mjs';
import { openWallet } from '/qx-qlocks-wallet.mjs';

const root = document.getElementById('qlk-root');
let art, chainId = new URLSearchParams(location.search).get('chain') || '4663';
let tokenParam = (new URLSearchParams(location.search).get('token') || '').toLowerCase();
if (!chainById(chainId)) chainId = '4663';

async function artifact() {
  if (!art) art = fetch('/full-launch/qlocks-v2.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw Error('QLocks details unavailable'); return r.json(); })
    .then(a => { if (a.kind !== 'qhooks-qlocks-v2' || a.schemaVersion !== 1) throw Error('Unknown QLocks artifact'); return a; });
  return art;
}
const L = async () => (await artifact()).contracts.locksV2;
const G = async () => (await artifact()).contracts.grants;
const call = async (c, name, types = [], values = []) => ethCall(chainId, c.address, calldata(c.selectors[name], types, values));
const live = async c => (await codeAt(chainId, c.address)) !== '0x';
const chainNow = async () => Number(BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp));
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const when = ts => new Date(Number(ts) * 1000).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const isAddr = s => /^0x[0-9a-f]{40}$/.test(String(s).toLowerCase());

function decodeLock(id, hex) {
  const w = words(hex);
  return { id, token: toAddress(w[0]), start: Number(w[1]), cliff: Number(w[2]), beneficiary: toAddress(w[3]), span: Number(w[4]), notice: Number(w[5]), steps: Number(w[6]), kind: Number(w[7]), total: w[8], claimed: w[9], announced: w[10], readyAt: Number(w[11]) };
}
function decodeLp(id, hex) {
  const w = words(hex);
  return { id, manager: toAddress(w[0]), kind: Number(w[1]), unlockAt: Number(w[2]), beneficiary: toAddress(w[3]), notice: Number(w[4]), readyAt: Number(w[5]), token0: toAddress(w[6]), token1: toAddress(w[7]), tokenId: w[8] };
}
function decodeGrant(id, hex) {
  const w = words(hex);
  return { id, token: toAddress(w[0]), start: Number(w[1]), cliff: Number(w[2]), grantor: toAddress(w[3]), span: Number(w[4]), steps: Number(w[5]), revoked: w[6] !== 0n, recipient: toAddress(w[7]), total: w[8], claimed: w[9] };
}

// The last result stays on screen after the page refreshes its numbers.
let flash = '';
async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = '';
  try { await fn(s => { status.textContent = s; }); status.textContent ||= 'Done.'; flash = status.textContent; setTimeout(() => render().catch(() => {}), 1500); }
  catch (e) { status.textContent = e.message || 'That did not go through'; }
  finally { btn.disabled = false; }
}
const status = () => h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
const field = (label, input, hint) => h('label', { class: 'qlk-field' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);
const input = (attrs = {}) => h('input', { type: 'text', autocomplete: 'off', ...attrs });
const select = (label, opts, def) => h('select', { ariaLabel: label }, ...opts.map(([v, t]) => h('option', { value: String(v), selected: String(v) === String(def) }, t)));

// ---------------------------------------------------------------- chain + token picker

function chainPicker() {
  const s = select('Network', visibleChains().map(c => [c.id, c.name]), chainId);
  s.addEventListener('change', () => { chainId = s.value; render(); });
  return s;
}

// ---------------------------------------------------------------- lookup: badge, summary, lists

// The original QLocks contract (v1): same rules, cliff + drip only. Read-only here; its beneficiaries manage it on Trade.
const V1 = { get: '0x9507d39a', locksOf: '0xc3f9ab58', summary: '0x9522a80a', count: '0x06661abd' };
function decodeV1(id, hex) {
  const w = words(hex);
  return { id, v1: true, kind: C.KIND.LINEAR, steps: 0, token: toAddress(w[0]), start: Number(w[1]), cliff: Number(w[2]), beneficiary: toAddress(w[3]), span: Number(w[4]), notice: Number(w[5]), total: w[6], claimed: w[7], announced: w[8], readyAt: Number(w[9]) };
}
const ZERO5 = [0n, 0n, 0n, 0n, 0n];

/// One token's locks across QLocks v2 (`c`, null when not set up on this chain) and v1 (`v1`, null when absent).
async function tokenSection(c, v1, token) {
  const t = await erc20(chainId, token);
  const supply = BigInt(await ethCall(chainId, token, '0x18160ddd'));
  const sum = c ? words(await call(c, 'summary', ['address'], [token])) : ZERO5;
  const s1 = v1 ? words(await ethCall(chainId, v1, calldata(V1.summary, ['address'], [token]))) : ZERO5;
  const lpw = c ? words(await call(c, 'lpSummary', ['address'], [token])) : [0n, 0n, 0n, 0n];
  const now = await chainNow();
  const model = C.badgeModel({ supply, summary: { locked: sum[0] + s1[0], unlocked: sum[1] + s1[1], announced: sum[2] + s1[2], nextReady: [sum[3], s1[3]].filter(Boolean).map(Number).sort((a, b) => a - b)[0] || 0 }, lp: { positions: lpw[0], permanent: lpw[1], nextUnlock: lpw[2], nextReady: lpw[3] }, now });
  const fmt = n => formatUnits(n, t.decimals, 2) + ' ' + (t.symbol || 'tokens');
  const ids = c ? uintArray(await call(c, 'locksOf', ['address'], [token])).slice(-40) : [];
  const locks = await Promise.all(ids.map(async id => decodeLock(id, await call(c, 'get', ['uint256'], [id]))));
  const pts = await Promise.all(locks.map(l => l.kind === C.KIND.CUSTOM ? call(c, 'points', ['uint256'], [l.id]).then(x => C.unpackPoints(uintArray(x))) : []));
  const ids1 = v1 ? uintArray(await ethCall(chainId, v1, calldata(V1.locksOf, ['address'], [token]))).slice(-40) : [];
  const locks1 = await Promise.all(ids1.map(async id => decodeV1(id, await ethCall(chainId, v1, calldata(V1.get, ['uint256'], [id])))));
  const lpIds = c ? uintArray(await call(c, 'lpLocksOf', ['address'], [token])).slice(-20) : [];
  const lps = (await Promise.all(lpIds.map(async id => decodeLp(id, await call(c, 'getLp', ['uint256'], [id]))))).filter(p => p.beneficiary !== '0x0000000000000000000000000000000000000000');

  const badge = h('div', { class: 'qlk-badge qlk-' + model.level }, h('b', {}, model.title), ...model.lines.map(x => h('span', {}, x)));
  const notices = model.notices.map(n => h('p', { class: 'qtx-alert' }, n.kind === 'tokens'
    ? fmt(n.amount) + ' announced for sale, ' + (n.ready ? 'can be sold now' : 'can be sold from ' + when(n.readyAt)) + '.'
    : 'An LP position has a withdrawal notice: it can leave ' + (n.ready ? 'now' : 'from ' + when(n.readyAt)) + '.'));
  const row = (l, p) => {
    const pending = l.announced && now <= l.readyAt + C.WINDOW ? ' · ' + fmt(l.announced) + ' announced, ready ' + when(l.readyAt) : '';
    return h('li', {},
      h('div', {}, h('b', {}, fmt(l.total - l.claimed)), h('span', {}, ' for ' + short(l.beneficiary))),
      h('span', { class: 'qtx-meta' }, C.describeSchedule(l, p) + ' · notice ' + (l.notice ? Math.round(l.notice / C.DAY) + ' d' : 'none') + ' · ends ' + when(C.unlockTimeline(l, p).reduce((m, x) => Math.max(m, x.dripUntil || x.at), 0)) + pending));
  };
  const list = locks.map((l, i) => [l, pts[i]]).filter(([l]) => l.total > l.claimed).map(([l, p]) => row(l, p));
  const list1 = locks1.filter(l => l.total > l.claimed).map(l => row(l, []));
  const lpList = lps.map(p => h('li', {}, h('div', {}, h('b', {}, (p.kind === C.KIND.LP_V4 ? 'Uniswap v4' : 'Uniswap v3') + ' position #' + p.tokenId), h('span', {}, ' for ' + short(p.beneficiary))),
    h('span', { class: 'qtx-meta' }, (p.unlockAt ? 'locked until ' + when(p.unlockAt) : 'locked for good') + ' · fees go to the beneficiary, liquidity cannot be removed')));

  const all = [...locks, ...locks1].filter(l => l.total > l.claimed);
  const shareBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: !model.any }, 'Share card');
  shareBtn.addEventListener('click', () => shareCard({ symbol: t.symbol || 'token', model, schedule: all.length === 1 ? C.describeSchedule(all[0], all[0].v1 ? [] : pts[0]) : '', contract: c ? c.address : v1 }));
  const n = sum[4] + s1[4];
  return h('section', { class: 'qlk-card' },
    h('h2', {}, (t.symbol || 'Token') + ' on ' + CHAIN_NAME[chainId]),
    badge, ...notices,
    h('p', { class: 'qtb-note' }, n ? fmt(sum[0] + s1[0]) + ' in ' + n + ' lock' + (n === 1n ? '' : 's') + ' (' + C.fmtPct(model.lockedPct) + ' of supply), ' + fmt(sum[1] + s1[1]) + ' released and not yet withdrawn.' : 'No tokens are locked for this token yet.'),
    list.length ? h('ul', { class: 'qtx-locks' }, ...list) : null,
    list1.length ? h('h3', {}, 'Original QLocks') : null,
    list1.length ? h('p', { class: 'qtb-note' }, 'Contract ' + short(v1) + '. Same rules: no cancel, longer only, and every sale needs an on-chain notice first. Beneficiaries manage these on the token\'s Trade page.') : null,
    list1.length ? h('ul', { class: 'qtx-locks' }, ...list1) : null,
    lpList.length ? h('h3', {}, 'LP positions') : null, lpList.length ? h('ul', { class: 'qtx-locks' }, ...lpList) : null,
    h('div', { class: 'qtx-actions' }, shareBtn));
}

/// Tokens with recent locks on this chain (v2 and v1), so a visitor can pick one without pasting an address.
async function recentTokens(c, v1) {
  const seen = new Map();
  const scan = async (addr, sel, n, decode) => {
    for (let i = Number(n) - 1; i >= 0 && i >= Number(n) - 30; i--) {
      const l = decode(BigInt(i), await ethCall(chainId, addr, calldata(sel, ['uint256'], [BigInt(i)])));
      if (l.total > l.claimed && !seen.has(l.token)) seen.set(l.token, l);
    }
  };
  if (c) await scan(c.address, c.selectors.get, words(await call(c, 'count'))[0], decodeLock);
  if (v1) await scan(v1, V1.get, words(await ethCall(chainId, v1, V1.count))[0], decodeV1);
  if (!seen.size) return null;
  const items = await Promise.all([...seen.keys()].slice(0, 12).map(async tk => {
    const t = await erc20(chainId, tk).catch(() => ({ symbol: '' }));
    return h('li', {}, h('a', { href: '/qlocks?chain=' + chainId + '&token=' + tk }, (t.symbol || short(tk))), h('span', { class: 'qtx-meta' }, ' ' + short(tk)));
  }));
  return h('section', { class: 'qlk-card' }, h('h2', {}, 'Locked on ' + CHAIN_NAME[chainId]), h('ul', { class: 'qtx-locks qlk-recent' }, ...items));
}

function shareCard({ symbol, model, schedule, contract }) {
  const url = 'qhooks.com/qlocks?chain=' + chainId;
  const svg = C.shareCardSvg({ symbol, chainName: CHAIN_NAME[chainId], model, schedule, contract, url });
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 630; cv.getContext('2d').drawImage(img, 0, 0);
    cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = symbol + '-locked-with-qlocks.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const text = '$' + symbol + ' is locked with QLocks: ' + model.lines.join(', ') + '. Any sale needs a public on-chain notice first.';
  window.open('https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent('https://' + url + '&token=' + tokenParam), '_blank', 'noopener');
}

// ---------------------------------------------------------------- lock tokens: one, or a whole sheet

function lockForm(c, me) {
  const st = status();
  const token = input({ placeholder: 'Token address', value: tokenParam, ariaLabel: 'Token address' });
  const amount = input({ inputMode: 'decimal', placeholder: '0.0', ariaLabel: 'Amount' });
  const who = input({ placeholder: me || '0x…', ariaLabel: 'Beneficiary' });
  const preset = select('Schedule', [...C.PRESETS.map(p => [p.key, p.label]), ['custom-steps', 'Custom steps'], ['custom-points', 'Custom dates']], 'monthly-12');
  const cliff = input({ value: '6m', ariaLabel: 'Cliff' }), every = input({ value: '30d', ariaLabel: 'Time between unlocks' }), steps = input({ value: '12', inputMode: 'numeric', ariaLabel: 'Number of unlocks' });
  const points = h('textarea', { rows: 3, placeholder: 'One per line: time after the cliff, percent unlocked by then\n0d, 10\n3m, 40\n1y, 100', ariaLabel: 'Custom unlock points' });
  const notice = select('Sell notice', [[86400, '1 day'], [259200, '3 days'], [604800, '7 days'], [1209600, '14 days'], [2592000, '30 days']], 259200);
  const custom = h('div', { class: 'qtx-row', hidden: true }, field('Cliff', cliff, 'e.g. 6m, 90d, 1y'), field('Every', every), field('Unlocks', steps));
  const customPts = h('div', { hidden: true }, field('Cliff', cliff.cloneNode()), field('Unlock points', points, 'Cumulative percent; the last line must be 100'));
  preset.addEventListener('change', () => { custom.hidden = preset.value !== 'custom-steps'; customPts.hidden = preset.value !== 'custom-points'; });
  const btn = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, me ? 'Lock tokens' : 'Connect a wallet to lock');
  btn.addEventListener('click', () => act(btn, st, async s => {
    const tk = token.value.trim().toLowerCase(); if (!isAddr(tk)) throw new TypeError('Enter the token address');
    const t = await erc20(chainId, tk, me), amt = parseUnits(amount.value, t.decimals);
    if (amt === 0n || amt > t.balance) throw new TypeError('Enter an amount you hold');
    const ben = (who.value.trim() || me).toLowerCase(); if (!isAddr(ben)) throw new TypeError('Enter a valid beneficiary address');
    await ensureAllowance(chainId, tk, c.address, amt, s);
    let data;
    if (preset.value === 'custom-points') {
      const lines = points.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split(/[,;\s]+/));
      const off = lines.map(([d]) => BigInt(C.parseDuration(d))), bps = lines.map(([, p]) => BigInt(Math.round(Number(p) * 100)));
      data = calldata(c.selectors.lockCustom, ['address', 'address', 'uint256', 'uint64', 'uint32', 'uint32', 'uint32[]', 'uint16[]'], [tk, ben, amt, 0n, BigInt(C.parseDuration(customPts.querySelector('input').value)), BigInt(notice.value), off, bps]);
    } else {
      const p = preset.value === 'custom-steps' ? { cliff: C.parseDuration(cliff.value), span: C.parseDuration(every.value), steps: Number(steps.value) } : C.PRESETS.find(x => x.key === preset.value);
      C.checkSchedule(p);
      data = p.steps
        ? calldata(c.selectors.lockSteps, ['address', 'address', 'uint256', 'uint64', 'uint32', 'uint32', 'uint16', 'uint32'], [tk, ben, amt, 0n, BigInt(p.cliff), BigInt(p.span), BigInt(p.steps), BigInt(notice.value)])
        : calldata(c.selectors.lock, ['address', 'address', 'uint256', 'uint64', 'uint32', 'uint32', 'uint32'], [tk, ben, amt, 0n, BigInt(p.cliff), BigInt(p.span), BigInt(notice.value)]);
    }
    await send(chainId, { to: c.address, data }, s);
    s('Locked. Nobody can cancel it or make it shorter.');
  }));
  return h('section', { class: 'qlk-card' }, h('h2', {}, 'Lock tokens'),
    h('p', { class: 'qtb-note' }, 'Pick a schedule. Released tokens still need a public sell notice before they can leave, and a lock can only be made longer.'),
    h('div', { class: 'qtx-row' }, field('Token', token), field('Amount', amount), field('Beneficiary', who, 'Defaults to you')),
    h('div', { class: 'qtx-row' }, field('Schedule', preset), field('Sell notice', notice)), custom, customPts, btn, st);
}

function sheetForm(c, me, kind) {
  const grants = kind === 'grants', st = status();
  const token = input({ placeholder: 'Token address', value: tokenParam, ariaLabel: 'Token address' });
  const area = h('textarea', { rows: 6, placeholder: C.SAMPLE_SHEET, ariaLabel: 'Sheet' });
  const file = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', ariaLabel: 'Upload a CSV' });
  file.addEventListener('change', async () => { area.value = await file.files[0].text(); preview(); });
  const sample = h('a', { href: 'data:text/csv;charset=utf-8,' + encodeURIComponent(C.SAMPLE_SHEET), download: grants ? 'qgrants-sheet.csv' : 'qlocks-sheet.csv' }, 'Download a sample sheet');
  const table = h('div', { class: 'qlk-preview' });
  let parsed = null, dec = 18, sym = '';
  async function preview() {
    table.replaceChildren(); parsed = null;
    const tk = token.value.trim().toLowerCase(); if (!isAddr(tk) || !area.value.trim()) return;
    try { const t = await erc20(chainId, tk); dec = t.decimals; sym = t.symbol || ''; } catch { table.append(h('p', { class: 'qtx-alert' }, 'That token was not found on ' + CHAIN_NAME[chainId] + '.')); return; }
    parsed = C.parseLockSheet(area.value, s => parseUnits(s, dec));
    const bad = parsed.errors.filter(e => !e.warning);
    table.append(
      h('p', { class: bad.length ? 'qtx-alert' : 'qtb-note' }, parsed.rows.length + ' row' + (parsed.rows.length === 1 ? '' : 's') + ', ' + formatUnits(C.sumRows(parsed.rows), dec, 2) + ' ' + sym + ' in ' + C.chunkRows(parsed.rows).length + ' transaction' + (C.chunkRows(parsed.rows).length === 1 ? '' : 's') + (bad.length ? '. Fix ' + bad.length + ' line' + (bad.length === 1 ? '' : 's') + ' first.' : '.')),
      ...parsed.errors.map(e => h('p', { class: e.warning ? 'qtb-note' : 'qtx-alert' }, 'Line ' + e.line + ': ' + e.error)),
      h('ul', { class: 'qtx-locks' }, ...parsed.rows.slice(0, 200).map(r => h('li', {}, h('div', {}, h('b', {}, formatUnits(r.amount, dec, 2) + ' ' + sym), h('span', {}, ' for ' + short(r.beneficiary) + (r.label ? ' (' + r.label + ')' : ''))), h('span', { class: 'qtx-meta' }, C.describeSchedule(r) + (grants ? '' : ' · notice ' + Math.round(r.notice / C.DAY) + ' d'))))));
  }
  area.addEventListener('input', () => { clearTimeout(area._t); area._t = setTimeout(preview, 300); });
  token.addEventListener('change', preview);
  const btn = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, me ? (grants ? 'Create grants' : 'Lock every row') : 'Connect a wallet first');
  btn.addEventListener('click', () => act(btn, st, async s => {
    await preview();
    if (!parsed || !parsed.rows.length) throw new TypeError('Add at least one row');
    if (parsed.errors.some(e => !e.warning)) throw new TypeError('Fix the lines marked above first');
    const tk = token.value.trim().toLowerCase(), total = C.sumRows(parsed.rows);
    const bal = (await erc20(chainId, tk, me)).balance; if (total > bal) throw new TypeError('You hold ' + formatUnits(bal, dec, 2) + ' ' + sym + '; the sheet needs ' + formatUnits(total, dec, 2));
    await ensureAllowance(chainId, tk, c.address, total, s);
    const chunks = C.chunkRows(parsed.rows);
    for (let i = 0; i < chunks.length; i++) {
      s('Transaction ' + (i + 1) + ' of ' + chunks.length + '…');
      const data = grants
        ? calldata(c.selectors.grantMany, ['address', C.GRANT_ROW_T], [tk, C.grantRowValues(chunks[i])])
        : calldata(c.selectors.lockMany, ['address', C.LOCK_ROW_T], [tk, C.lockRowValues(chunks[i])]);
      await send(chainId, { to: c.address, data }, s);
    }
    s(grants ? 'Grants created.' : 'All rows locked.');
  }));
  return h('details', { class: 'qtx-details' }, h('summary', {}, grants ? 'Grant to many people from a sheet' : 'Lock for many people from a sheet'),
    h('p', { class: 'qtb-note' }, 'One row per wallet: address, amount, cliff, schedule (linear, monthly, quarterly, weekly, once, or a time such as 45d), length for linear, number of unlocks for steps' + (grants ? '.' : ', and sell notice.') + ' Up to 50 rows go in each transaction.'),
    field('Token', token), h('div', { class: 'qtx-row' }, field('Paste the sheet', area), field('Or upload a CSV', file)), sample, table, btn, st);
}

// ---------------------------------------------------------------- LP positions

async function lpForm(c, me) {
  const st = status();
  const [v3, v4] = words(await call(c, 'positionManagers')).map(toAddress);
  const zero = '0x0000000000000000000000000000000000000000';
  if (v3 === zero && v4 === zero) return h('section', { class: 'qlk-card' }, h('h2', {}, 'Lock an LP position'), h('p', { class: 'qtb-note' }, 'Uniswap positions are not on ' + CHAIN_NAME[chainId] + ' yet, so LP locks are off here. Token locks work.'));
  const ver = select('Uniswap version', [[v4, 'Uniswap v4'], [v3, 'Uniswap v3']], v4);
  const id = input({ inputMode: 'numeric', placeholder: 'Position ID', ariaLabel: 'Position ID' });
  const who = input({ placeholder: me || '0x…', ariaLabel: 'Beneficiary' });
  const how = select('How long', [['0', 'For good (recommended)'], [String(365 * C.DAY), '1 year'], [String(730 * C.DAY), '2 years'], [String(1825 * C.DAY), '5 years']], '0');
  const btn = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, me ? 'Lock position' : 'Connect a wallet first');
  btn.addEventListener('click', () => act(btn, st, async s => {
    const tid = BigInt(id.value.trim() || '0'); const mgr = ver.value;
    const owner = toAddress(BigInt(await ethCall(chainId, mgr, calldata('0x6352211e', ['uint256'], [tid]))));
    if (owner !== me) throw new TypeError('That position is not in your wallet');
    const ben = (who.value.trim() || me).toLowerCase(); if (!isAddr(ben)) throw new TypeError('Enter a valid beneficiary address');
    const approved = toAddress(BigInt(await ethCall(chainId, mgr, calldata('0x081812fc', ['uint256'], [tid]))));
    if (approved !== c.address) { s('Approve the position in your wallet…'); await send(chainId, { to: mgr, data: calldata('0x095ea7b3', ['address', 'uint256'], [c.address, tid]) }, s); }
    const unlockAt = how.value === '0' ? 0n : BigInt((await chainNow()) + Number(how.value));
    await send(chainId, { to: c.address, data: calldata(c.selectors.lockLp, ['address', 'uint256', 'address', 'uint64', 'uint32'], [mgr, tid, ben, unlockAt, 7n * 86400n]) }, s);
    s('Position locked. Trading fees stay yours to collect; the liquidity cannot be removed.');
  }));
  return h('section', { class: 'qlk-card' }, h('h2', {}, 'Lock an LP position'),
    h('p', { class: 'qtb-note' }, 'Locks a Uniswap position NFT. You keep collecting its trading fees; nobody, including you, can remove its liquidity while it is locked. Timed locks need a 7-day public notice before the position can leave.'),
    h('div', { class: 'qtx-row' }, field('Version', ver), field('Position ID', id), field('Fees and control go to', who, 'Defaults to you'), field('Lock', how)), btn, st);
}

// ---------------------------------------------------------------- your locks

async function mine(c, me) {
  const st = status(), now = await chainNow();
  const ids = uintArray(await call(c, 'locksFor', ['address'], [me]));
  const locks = (await Promise.all([...new Set(ids.map(String))].map(BigInt).map(async id => decodeLock(id, await call(c, 'get', ['uint256'], [id]))))).filter(l => l.beneficiary === me && l.total > l.claimed);
  const lpIds = uintArray(await call(c, 'lpLocksFor', ['address'], [me]));
  const lps = (await Promise.all([...new Set(lpIds.map(String))].map(BigInt).map(async id => decodeLp(id, await call(c, 'getLp', ['uint256'], [id]))))).filter(p => p.beneficiary === me);
  if (!locks.length && !lps.length) return null;
  const tx = (btn, data) => btn.addEventListener('click', () => act(btn, st, s => send(chainId, { to: c.address, data: data() }, s)));
  const rows = await Promise.all(locks.map(async l => {
    const t = await erc20(chainId, l.token), fmt = n => formatUnits(n, t.decimals, 2) + ' ' + (t.symbol || '');
    const v = BigInt(await call(c, 'vested', ['uint256'], [l.id]));
    const amt = input({ inputMode: 'decimal', placeholder: 'amount', class: 'qtx-mini-input', ariaLabel: 'Amount to announce' });
    const ann = h('button', { type: 'button', class: 'qtx-mini' }, 'Announce sale'); tx(ann, () => calldata(c.selectors.announce, ['uint256', 'uint256'], [l.id, parseUnits(amt.value, t.decimals)]));
    const acts = [amt, ann];
    if (l.announced && now >= l.readyAt && now <= l.readyAt + C.WINDOW) { const wd = h('button', { type: 'button', class: 'qtx-mini' }, 'Withdraw'); tx(wd, () => calldata(c.selectors.withdraw, ['uint256'], [l.id])); acts.push(wd); }
    const ext = h('button', { type: 'button', class: 'qtx-mini' }, 'Extend 30 days'); tx(ext, () => calldata(c.selectors.extend, ['uint256', 'uint32'], [l.id, BigInt(l.cliff + 30 * C.DAY)])); acts.push(ext);
    return h('li', {}, h('div', {}, h('b', {}, fmt(l.total - l.claimed)), h('span', {}, ' · lock #' + l.id)),
      h('span', { class: 'qtx-meta' }, C.describeSchedule(l) + ' · ' + fmt(v - l.claimed) + ' released' + (l.announced && now <= l.readyAt + C.WINDOW ? ' · ' + fmt(l.announced) + ' announced, ready ' + when(l.readyAt) : '')),
      h('div', { class: 'qtx-actions' }, ...acts));
  }));
  const lpRows = lps.map(p => {
    const fees = h('button', { type: 'button', class: 'qtx-mini' }, 'Collect fees'); tx(fees, () => calldata(c.selectors.collectLpFees, ['uint256', 'address'], [p.id, me]));
    const acts = [fees];
    if (p.unlockAt) {
      const ann = h('button', { type: 'button', class: 'qtx-mini' }, 'Announce withdrawal'); tx(ann, () => calldata(c.selectors.announceLp, ['uint256'], [p.id])); acts.push(ann);
      if (p.readyAt && now >= p.readyAt && now >= p.unlockAt && now <= p.readyAt + C.WINDOW) { const wd = h('button', { type: 'button', class: 'qtx-mini' }, 'Withdraw position'); tx(wd, () => calldata(c.selectors.withdrawLp, ['uint256'], [p.id])); acts.push(wd); }
      const perm = h('button', { type: 'button', class: 'qtx-mini' }, 'Lock for good'); tx(perm, () => calldata(c.selectors.extendLp, ['uint256', 'uint64'], [p.id, 0n])); acts.push(perm);
    }
    return h('li', {}, h('div', {}, h('b', {}, (p.kind === C.KIND.LP_V4 ? 'v4' : 'v3') + ' position #' + p.tokenId), h('span', {}, ' · LP lock #' + p.id)),
      h('span', { class: 'qtx-meta' }, p.unlockAt ? 'locked until ' + when(p.unlockAt) : 'locked for good'), h('div', { class: 'qtx-actions' }, ...acts));
  });
  return h('section', { class: 'qlk-card' }, h('h2', {}, 'Your locks'), h('ul', { class: 'qtx-locks' }, ...rows, ...lpRows), st);
}

// ---------------------------------------------------------------- staff grants (revocable, never "locked")

async function grantsSection(g, me) {
  const st = status();
  const liveG = await live(g);
  const head = [h('h2', {}, 'Staff grants'), h('p', { class: 'qtb-note' }, 'Revocable vesting for staff and contributors. The grantor can take back what has not vested, so grants are not locks: they are never counted or shown as locked tokens.')];
  if (!liveG) return h('section', { class: 'qlk-card qlk-grants' }, ...head, h('p', { class: 'qtb-note' }, 'Grants are not set up on ' + CHAIN_NAME[chainId] + ' yet.'));
  const parts = [...head, sheetForm(g, me, 'grants')];
  if (me) {
    const forMe = uintArray(await ethCall(chainId, g.address, calldata(g.selectors.grantsFor, ['address'], [me])));
    const byMe = uintArray(await ethCall(chainId, g.address, calldata(g.selectors.grantsBy, ['address'], [me])));
    const load = async ids => Promise.all([...new Set(ids.map(String))].map(BigInt).map(async id => decodeGrant(id, await ethCall(chainId, g.address, calldata(g.selectors.get, ['uint256'], [id])))));
    const items = [...(await load(forMe)).filter(x => x.recipient === me).map(x => ({ ...x, role: 'recipient' })), ...(await load(byMe)).filter(x => x.grantor === me && !x.revoked).map(x => ({ ...x, role: 'grantor' }))];
    const rows = await Promise.all(items.map(async x => {
      const t = await erc20(chainId, x.token), fmt = n => formatUnits(n, t.decimals, 2) + ' ' + (t.symbol || '');
      const v = BigInt(await ethCall(chainId, g.address, calldata(g.selectors.vested, ['uint256'], [x.id])));
      const b = h('button', { type: 'button', class: 'qtx-mini' }, x.role === 'recipient' ? 'Claim ' + fmt(v - x.claimed) : 'Revoke');
      b.disabled = x.role === 'recipient' && v === x.claimed;
      b.addEventListener('click', () => act(b, st, s => send(chainId, { to: g.address, data: calldata(g.selectors[x.role === 'recipient' ? 'claim' : 'revoke'], ['uint256'], [x.id]) }, s)));
      return h('li', {}, h('div', {}, h('b', {}, fmt(x.total)), h('span', {}, x.role === 'recipient' ? ' granted to you by ' + short(x.grantor) : ' granted by you to ' + short(x.recipient))),
        h('span', { class: 'qtx-meta' }, (x.revoked ? 'revoked, ' : '') + C.describeSchedule(x) + ' · ' + fmt(v) + ' vested'), h('div', { class: 'qtx-actions' }, b));
    }));
    if (rows.length) parts.push(h('ul', { class: 'qtx-locks' }, ...rows));
  }
  return h('section', { class: 'qlk-card qlk-grants' }, ...parts, st);
}

// ---------------------------------------------------------------- page

let seq = 0;
async function render() {
  const mineSeq = ++seq, me = connectedAddress();
  const c = await L(), g = await G();
  const picker = chainPicker();
  const lookup = input({ placeholder: 'Token address', value: tokenParam, ariaLabel: 'Look up a token' });
  const go = h('button', { type: 'button', class: 'qtx-mini' }, 'Look up');
  go.addEventListener('click', () => { tokenParam = lookup.value.trim().toLowerCase(); history.replaceState(null, '', '?chain=' + chainId + (tokenParam ? '&token=' + tokenParam : '')); render(); });
  const top = h('div', { class: 'qlk-top' }, field('Network', picker), field('Token', lookup), go);
  const v1addr = await extraAddress('locks').catch(() => null);
  const [v2on, v1on] = await Promise.all([live(c), v1addr ? codeAt(chainId, v1addr).then(x => x !== '0x') : false]);
  const lc = v2on ? c : null, l1 = v1on ? v1addr : null;
  if (!lc && !l1) {
    if (mineSeq !== seq) return;
    root.replaceChildren(top, h('section', { class: 'qlk-card' }, h('h2', {}, 'QLocks is not on ' + CHAIN_NAME[chainId] + ' yet'), h('p', { class: 'qtb-note' }, 'Pick another network, or check back soon.')));
    return;
  }
  const parts = [top, flash ? h('p', { class: 'qlk-flash', role: 'status' }, flash) : null];
  if (isAddr(tokenParam)) parts.push(await tokenSection(lc, l1, tokenParam).catch(() => h('section', { class: 'qlk-card' }, h('p', { class: 'qtx-alert' }, 'That token could not be read on ' + CHAIN_NAME[chainId] + '.'))));
  else parts.push(await recentTokens(lc, l1).catch(() => null));
  if (lc) {
    if (me) { const m = await mine(c, me); if (m) parts.push(m); }
    else { const b = h('button', { type: 'button', class: 'workspace-button' }, 'Connect your wallet'); b.addEventListener('click', () => openWallet()); parts.push(h('section', { class: 'qlk-card qlk-connect' }, h('p', { class: 'qtb-note' }, 'Connect your wallet to lock tokens or manage your locks.'), b)); }
    parts.push(h('div', { class: 'qlk-card qlk-forms' }, lockForm(c, me), sheetForm(c, me, 'locks')));
    parts.push(await lpForm(c, me));
    parts.push(await grantsSection(g, me));
  } else {
    parts.push(h('section', { class: 'qlk-card' }, h('h2', {}, 'New locks'), h('p', { class: 'qtb-note' }, 'Step schedules, batch locks from a sheet and LP locks come to ' + CHAIN_NAME[chainId] + ' with the next QLocks contract. Until then, lock team tokens from your token\'s Trade page.')));
  }
  if (mineSeq !== seq) return;
  root.replaceChildren(...parts.filter(Boolean));
}

render().catch(e => { root.replaceChildren(h('section', { class: 'qlk-card' }, h('p', { class: 'qtx-alert' }, e.message || 'QLocks could not load. Refreshing…'))); setTimeout(() => render().catch(() => {}), 8000); });
onWalletChange(() => render().catch(() => {}));
