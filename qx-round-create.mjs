// Contributor round on /create (2026-11-21): an optional section beside Team buy on EVM launches. It collects the
// wallets and caps (up to 8), the minimum and deadline, an optional reserve (0-30%) and optional vesting; the launch
// fields (name, ticker, meta, style, anti-snipe, start steps) come from the one-tap form. It shows maxRaiseFor live and
// refuses caps above it, shows the 1% pool fee, and sends RoundFactory.createRound from the connected wallet with a
// fresh salt. Hidden unless the RoundFactory has code on the chain and the launch goes to a known launch contract;
// any read error keeps it hidden. Strings: ROUND_TEXT in qx-round-core.mjs.
import {chainById} from './chains.mjs';
import {ROUND_FACTORY, ROUND, ROUND_TEXT as T, roundChain, knownLaunch, checkConfig, encodeCreateRound, maxRaiseFor, projectRound, toUnits, fromUnits, pct, parseRoundCreated, roundPath, dA} from './qx-round-core.mjs';
import {rpcBatch, factoryLive, readStart} from './qx-round-read.mjs';

const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } n.append(...kids.flat().filter(x => x != null)); return n; };
const pctToBps = v => { const s = String(v ?? '').trim().replace(',', '.'); if (s === '') return 0; if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(s)) return NaN; const [w, f = ''] = s.split('.'); return Number(w) * 100 + Number((f + '00').slice(0, 2)); };
const daysToSec = v => { const s = String(v ?? '').trim().replace(',', '.'); if (s === '') return 0; if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(s)) return NaN; return Math.round(Number(s) * 86400); };
const localInput = d => { const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); };
export const rpcUrl = id => String(id) === '4663' ? '/api/rpc/4663' : chainById(id)?.rpc;
const DRAFT = 'qhooks:round:draft';

/// mountRoundCreate({hub, context, prepare, onChange}) -> {node, refresh(), get on()}
/// context() -> null (not offered for this launch) or {chainId, factory, steps, style, snipe, pqKey}
/// prepare(conn) -> Promise<{name, symbol, meta}>: the one-tap form's checked fields (throws a plain sentence).
export function mountRoundCreate({hub, context, prepare, onChange = () => {}, fetchImpl = (...a) => globalThis.fetch(...a)}) {
  let draft = null; try { draft = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch {}
  const live = new Map(), starts = new Map();
  let ctx = null, start = null, busy = false, result = null, statusText = '', statusBad = false, lastKey = '';
  const toggle = el('input', {type: 'checkbox', id: 'qrd-on'}), rows = el('div', {class: 'qtb-rows qrd-rows'});
  const min = el('input', {id: 'qrd-min', inputmode: 'decimal', autocomplete: 'off'}), deadline = el('input', {id: 'qrd-deadline', type: 'datetime-local'});
  const reserve = el('input', {id: 'qrd-reserve', inputmode: 'decimal', autocomplete: 'off', placeholder: '0'});
  const vestOn = el('input', {type: 'checkbox', id: 'qrd-vest'}), cliff = el('input', {id: 'qrd-cliff', inputmode: 'decimal', autocomplete: 'off', placeholder: '0'}), duration = el('input', {id: 'qrd-duration', inputmode: 'decimal', autocomplete: 'off', placeholder: '30'});
  const unitMin = el('span'), sumLine = el('p', {class: 'qxc-fine qrd-sum', role: 'status'}), limitLine = el('p', {class: 'qxc-fine qrd-limit'}), projLine = el('p', {class: 'qxc-fine qrd-proj'}), pqLine = el('p', {class: 'qxc-fine', hidden: true}, T.pqNote);
  const vestBox = el('div', {class: 'qrd-vest-body', hidden: true}, el('label', {}, T.cliff, cliff), el('label', {}, T.duration, duration), el('p', {class: 'qxc-fine'}, T.vestNote));
  const button = el('button', {type: 'button', id: 'qrd-create', class: 'qxc-primary', onclick: () => void create()}, T.create);
  const status = el('p', {class: 'qxc-message qrd-status', role: 'status', 'aria-live': 'polite'}), done = el('p', {class: 'qrd-done', hidden: true});
  const unitCap = [];
  const save = () => { try { localStorage.setItem(DRAFT, JSON.stringify({on: toggle.checked, rows: [...rows.children].map(r => ({address: r.querySelector('.qrd-wallet').value, cap: r.querySelector('.qrd-cap').value})), min: min.value, deadline: deadline.value, reserve: reserve.value, vest: vestOn.checked, cliff: cliff.value, duration: duration.value})); } catch {} };
  const changed = () => { result = null; done.hidden = true; statusText = ''; statusBad = false; paint(); save(); onChange(); };
  const row = (address = '', cap = '') => {
    const u = el('span'); unitCap.push(u);
    const r = el('div', {class: 'qtb-row qrd-row'},
      el('label', {}, T.wallet, el('input', {class: 'qrd-wallet', autocomplete: 'off', spellcheck: 'false', value: address, oninput: changed})),
      el('label', {}, u, el('input', {class: 'qrd-cap', inputmode: 'decimal', autocomplete: 'off', value: cap, oninput: changed})),
      el('button', {type: 'button', class: 'qtb-remove', onclick: () => { r.remove(); changed(); }}, T.remove));
    rows.append(r);
  };
  const add = el('button', {type: 'button', class: 'qtb-add', onclick: () => { row(); changed(); }}, T.add);
  for (const r of draft?.rows || []) row(r.address, r.cap);
  if (!rows.children.length) row();
  toggle.checked = !!draft?.on; min.value = draft?.min || ''; reserve.value = draft?.reserve || ''; vestOn.checked = !!draft?.vest; cliff.value = draft?.cliff || ''; duration.value = draft?.duration || '';
  const defaultDeadline = () => { const d = new Date(Date.now() + 7 * 86400000); d.setMinutes(0, 0, 0); return localInput(d); };
  deadline.value = draft?.deadline && Date.parse(draft.deadline) > Date.now() ? draft.deadline : defaultDeadline();
  for (const n of [min, deadline, reserve, cliff, duration]) n.addEventListener('input', changed);
  toggle.addEventListener('change', changed); vestOn.addEventListener('change', changed);
  const body = el('div', {class: 'qtb-body qrd-body', hidden: true},
    el('p', {class: 'qxc-fine'}, T.intro), el('p', {class: 'qxc-fine'}, T.replaces), rows, add, sumLine, limitLine,
    el('label', {}, el('span', {}, unitMin), min), el('p', {class: 'qxc-fine'}, T.minNote),
    el('label', {}, T.deadline, deadline), el('p', {class: 'qxc-fine'}, T.deadlineNote),
    el('label', {}, T.reserve, reserve), el('p', {class: 'qxc-fine'}, T.reserveNote),
    el('label', {class: 'qtb-disclose'}, vestOn, ' ', T.vest), vestBox,
    el('p', {class: 'qxc-fine qrd-fee'}, T.fee), projLine, pqLine, status, button, done);
  const node = el('fieldset', {class: 'qtb qrd', id: 'qrd', hidden: true}, el('legend', {}, el('label', {}, toggle, ' ', T.toggle)), body);

  const unit = () => { if (!ctx || !start) return ''; const c = chainById(ctx.chainId); return start.wrapsNative ? c.native : c.quote.symbol; };
  const decimals = () => !start ? 18 : start.wrapsNative ? 18 : chainById(ctx.chainId).quote.decimals;
  /// The config the form describes, or a plain sentence (thrown). Name, ticker and meta are filled in at send.
  function draftConfig(extra = {}) {
    if (!ctx || !start) throw new TypeError(T.unavailable);
    const d = decimals(), wallets = [], caps = [];
    [...rows.children].forEach((r, i) => {
      const a = r.querySelector('.qrd-wallet').value.trim(), c = r.querySelector('.qrd-cap').value.trim();
      if (!a && !c) return;
      const v = toUnits(c, d); if (v == null || v <= 0n) throw new TypeError('Enter a cap for wallet ' + (i + 1) + ' as a number, like 0.5.');
      wallets.push(a); caps.push(v);
    });
    const m = toUnits(min.value, d); if (m == null) throw new TypeError('Enter the minimum as a number, like 0.5.');
    const r = pctToBps(reserve.value); if (!Number.isInteger(r)) throw new TypeError('Enter the reserve as a percent, like 10.');
    const t = Date.parse(deadline.value); if (!Number.isFinite(t)) throw new TypeError('Choose a deadline.');
    const cl = vestOn.checked ? daysToSec(cliff.value) : 0, du = vestOn.checked ? daysToSec(duration.value) : 0;
    if (!Number.isInteger(cl) || !Number.isInteger(du)) throw new TypeError('Enter the vesting in days, like 30.');
    if (vestOn.checked && du === 0) throw new TypeError('Enter how many days the vesting lasts, or turn vesting off.');
    return {chainId: ctx.chainId, launchFactory: ctx.factory, name: 'x', symbol: 'X', meta: '', style: ctx.style, fee: ROUND.maxFee, salt: '0x' + '0'.repeat(64),
      snipeSeconds: ctx.snipe, startSteps: ctx.steps, reserveBps: r, wallets, caps, minRaise: m, deadline: Math.floor(t / 1000), vestCliff: cl, vestDuration: du, startCap: start.startCap, ...extra};
  }
  function paint() {
    const on = !node.hidden && toggle.checked; body.hidden = !toggle.checked;
    add.disabled = rows.children.length >= ROUND.maxWallets || busy;
    const u = unit(), d = decimals();
    unitMin.textContent = T.minField(u); for (const x of unitCap) x.textContent = T.cap(u);
    pqLine.hidden = !ctx?.pqKey;
    let err = '', sum = 0n, max = start ? maxRaiseFor(start.startCap, Math.max(0, pctToBps(reserve.value) || 0)) : 0n;
    for (const r of rows.children) { const v = toUnits(r.querySelector('.qrd-cap').value, d); if (v) sum += v; }
    sumLine.textContent = start ? T.total(fromUnits(sum, d), u) : '';
    limitLine.textContent = start ? (sum > max ? T.overLimit(fromUnits(max, d), u) : T.limit(fromUnits(max, d), u)) : '';
    limitLine.dataset.error = String(!!start && sum > max);
    const p = start && sum > 0n ? projectRound({pot: sum, startCap: start.startCap, reserveBps: Math.max(0, pctToBps(reserve.value) || 0)}) : null;
    projLine.textContent = p ? T.projectFull(p.avgRatio.toFixed(2), pct(p.share)) : '';
    try { checkConfig(draftConfig()); } catch (e) { err = e.message; }
    vestBox.hidden = !vestOn.checked;
    if (!busy && !result) { status.textContent = statusText || (on ? err : ''); status.dataset.error = String(statusBad || !!err); }
    button.disabled = busy || !on || !!err;
    for (const n of node.querySelectorAll('input,button.qtb-remove')) n.disabled = busy;
  }
  // Called on every form render: cheap after the first read per chain/factory/steps (cached), and it calls onChange only
  // when the section appears or disappears, so a render loop can't start.
  let shown = false;
  const settle = () => { const now = !node.hidden; if (now !== shown) { shown = now; onChange(); } };
  async function refresh() { await refreshInner(); settle(); }
  async function refreshInner() {
    const c = context(), key = c ? [c.chainId, c.factory, c.steps].join('|') : '';
    ctx = c && roundChain(c.chainId) && knownLaunch(c.chainId, c.factory).known ? c : null;
    if (!ctx) { node.hidden = true; start = null; paint(); return; }
    if (key !== lastKey) { lastKey = key; start = null; statusText = ''; statusBad = false; }
    const url = rpcUrl(ctx.chainId); if (!url) { node.hidden = true; return; }
    const batch = rpcBatch(url, {fetchImpl});
    try {
      if (!live.has(ctx.chainId)) live.set(ctx.chainId, factoryLive(batch).catch(e => { live.delete(ctx.chainId); throw e; }));
      const ok = await live.get(ctx.chainId);
      if (!ok) { live.delete(ctx.chainId); node.hidden = true; paint(); return; }
      if (!starts.has(key)) starts.set(key, readStart(batch, ctx.chainId, ctx.factory, ctx.steps).catch(e => { starts.delete(key); throw e; }));
      const s = await starts.get(key), q = chainById(ctx.chainId)?.quote;
      // The quote must be the chain's own (native wrapper or its USDC) so units and decimals are known.
      if (key !== lastKey || !q || s.quote !== String(q.address).toLowerCase() || s.wrapsNative !== !!q.wrapNative || s.startCap <= 0n) { node.hidden = true; paint(); return; }
      start = s; node.hidden = false;
    } catch { node.hidden = true; start = null; }
    paint();
  }
  const say = (text, isBad = false) => { statusText = text; statusBad = isBad; status.textContent = text; status.dataset.error = String(isBad); };
  async function rpc(chainId, method, params) { const [v] = await rpcBatch(rpcUrl(chainId), {fetchImpl})([{method, params}]); return v; }
  async function create() {
    if (busy || !ctx || !start) return;
    let conn = hub.snapshot().current; if (!conn) { hub.open(); return; }
    busy = true; say(''); paint();
    try {
      const chainId = ctx.chainId;
      if (conn.chainId !== chainId) { say('Switching your wallet to ' + chainById(chainId).name + '…'); conn = await hub.switchChain(chainId); if (conn?.chainId !== chainId) throw Error('Switch your wallet to ' + chainById(chainId).name + ', then try again.'); }
      const f = await prepare(conn);
      const salt = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
      const cfg = draftConfig({name: f.name, symbol: f.symbol, meta: f.meta, salt});
      const data = encodeCreateRound(cfg), from = conn.owner, tx = {from, to: ROUND_FACTORY, data, value: '0x0'};
      // The exact call first (reverts here mean nothing is sent), then the network's own gas estimate.
      let predicted;
      try { predicted = dA(await rpc(chainId, 'eth_call', [tx, 'latest'])); tx.gas = '0x' + (BigInt(await rpc(chainId, 'eth_estimateGas', [tx])) * 13n / 10n).toString(16); }
      catch { throw Error('Creating this round would fail right now. Check the wallets, caps and deadline. Nothing was sent.'); }
      try { const b = await rpc(chainId, 'eth_getBlockByNumber', ['latest', false]), tip = BigInt(await conn.entry.provider.request({method: 'eth_maxPriorityFeePerGas'}).catch(() => '0x0'));
        if (b?.baseFeePerGas) { tx.maxPriorityFeePerGas = '0x' + tip.toString(16); tx.maxFeePerGas = '0x' + (BigInt(b.baseFeePerGas) * 2n + tip).toString(16); } } catch {}
      if (hub.snapshot().current?.owner !== from) throw Error('Your wallet changed. Try again.');
      say(T.creating);
      const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [tx]});
      say('Sent. Waiting for the network…');
      let r = null; for (let i = 0; i < 240 && !r; i++) { r = await conn.entry.provider.request({method: 'eth_getTransactionReceipt', params: [hash]}).catch(() => null); if (!r) await new Promise(res => setTimeout(res, i < 20 ? 750 : 2000)); }
      if (!r) throw Error('Still pending. Check your wallet activity, then reload this page.');
      if (r.status !== '0x1') throw Error('The network refused it. Only network gas was spent.');
      const log = (r.logs || []).map(l => parseRoundCreated(l)).find(Boolean);
      const round = log?.round || predicted, block = r.blockNumber != null ? Number(BigInt(r.blockNumber)) : null;
      result = {chainId, round, block};
      // Keep its launch details on the site so /round can settle it however old (best effort; the log lookup is the fallback).
      fetch('/api/v1/rounds/record', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({chain: String(chainId), tx: hash})}).catch(() => {});
      try { localStorage.removeItem(DRAFT); } catch {}
      busy = false; say(T.created);
      done.replaceChildren(el('a', {class: 'qxc-primary', href: roundPath(chainId, round, block)}, T.open), ' ', el('span', {class: 'qxc-fine'}, round));
      done.hidden = false;
    } catch (e) { say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : (e?.message || 'That did not go through.'), true); }
    finally { busy = false; paint(); onChange(); }
  }
  paint();
  return {node, refresh, get on() { return !node.hidden && toggle.checked; }};
}
