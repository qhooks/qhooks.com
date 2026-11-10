// Shared state evaluation. All I/O is supplied by the caller.
import {chainById} from './chains.mjs';
import {FUND, SEL as DROP_SEL, decodeLock, vestedAt, fundStep} from './qdrops-fund.mjs';
import {FOUNDING, grantBatch, dayCut} from './founding-config.mjs';
import {decodeGrant, grantedSet, SEL as GRANT_SEL} from './founding-fund.mjs';

export const GROUPS = [{id: 'wallet', label: 'Your wallet'}, {id: 'safe', label: 'Safe, both signers'}];
const pad = a => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const word = n => BigInt(n).toString(16).padStart(64, '0');
async function allReads(promises) {
  const values = await Promise.allSettled(promises);
  const problem = values.find(v => v.status === 'rejected');
  if (problem) throw problem.reason;
  return values.map(v => v.value);
}
const missing = e => e?.status === 404 || e?.code === 'ENOENT';
const call = (rpc, chain, to, data) => rpc(String(chain), 'eth_call', [{to, data}, 'latest']);
const uint = h => { if (!/^0x[0-9a-f]+$/i.test(h)) throw Error('Incomplete integer read'); return BigInt(h); };
const tuple = h => {
  if (!/^0x(?:[0-9a-f]{64})+$/i.test(h)) throw Error('Incomplete tuple read');
  return h.slice(2).match(/.{64}/g);
};
export function chainInfo(id, network) {
  const c = chainById(id) || network || {};
  return {id: String(id), name: c.name || `Chain ${id}`, icon: c.icon || null, symbol: c.native || 'ETH', rpc: c.rpc || null};
}
export async function runtimeSha256(code) {
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(code)) throw Error('Incomplete code read');
  const bytes = Uint8Array.from(code.slice(2).match(/../g), b => parseInt(b, 16));
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function checkCode(step, chain, rpc) {
  if (!/^0x[0-9a-f]{40}$/i.test(step.address || '') || step.predict) return {status: 'unknown', reason: 'This step needs a wallet-specific address on its setup page'};
  const code = await rpc(String(chain), 'eth_getCode', [step.address, 'latest']);
  if (code === '0x') return {status: 'pending'};
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(code)) throw Error('Incomplete code read');
  if (step.runtimeSha256 && await runtimeSha256(code) !== step.runtimeSha256.toLowerCase()) return {status: 'pending', reason: 'Runtime differs from the setup manifest'};
  return {status: 'done'};
}
export function parseNative(value) {
  if (!/^\d+(?:\.\d{1,18})?$/.test(String(value))) throw Error('Invalid native amount');
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
}
export function keeperAmount(target, balance) {
  const gap = parseNative(target) - BigInt(balance), quantum = 10n ** 15n;
  const wei = gap <= 0n ? 0n : (gap + quantum - 1n) / quantum * quantum;
  const amount = `${wei / 10n ** 18n}.${(wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 3)}`;
  return {wei: wei.toString(), amount};
}
export function keeperTransaction(step, connection) {
  if (step.kind !== 'balanceMin' || step.status !== 'pending' || !connection?.owner || String(connection.chainId) !== step.chainId || BigInt(step.wei || 0) <= 0n)
    throw Error('Connect the wallet on this chain and check the amount again');
  return {from: connection.owner, to: step.address, value: '0x' + BigInt(step.wei).toString(16)};
}
export async function checkBalance(row, chain, rpc) {
  const balance = uint(await rpc(String(chain.id), 'eth_getBalance', [row.address, 'latest']));
  return {status: balance >= parseNative(chain.target) ? 'done' : 'pending', balance: balance.toString(), ...keeperAmount(chain.target, balance)};
}
export function expects(value, expect) {
  const n = uint(value), kind = typeof expect === 'string' ? expect : expect.kind;
  if (kind === 'nonzero') return n > 0n;
  if (kind === 'equals') return n === BigInt(expect.value);
  if (kind === 'gte') return n >= BigInt(expect.value);
  throw Error('Unknown call expectation');
}
export async function checkCalls(checks, chain, rpc) {
  // Read every check, even when an earlier allowance is zero.
  const values = await allReads(checks.map(async c => expects(await call(rpc, chain, c.to, c.data), c.expect)));
  return {status: values.every(Boolean) ? 'done' : 'pending'};
}
export function allowChecks(allow, remove) {
  if (String(allow.chainId) !== String(remove.chainId) || allow.hookList.toLowerCase() !== remove.hookList.toLowerCase()) throw Error('The two hook lists do not match');
  const removed = new Set(remove.hooks.map(a => a.toLowerCase()));
  const hooks = [...new Set([...allow.hooks, ...remove.hooks].map(a => a.toLowerCase()))];
  return hooks.map(h => ({to: allow.hookList, data: '0xbabcc539' + pad(h), expect: {kind: 'equals', value: removed.has(h) ? '0' : '1'}}));
}
export function floorChecks(art) {
  if (!art.liquidity?.address || !art.safe || !art.weth || !art.qhooks) throw Error('Incomplete floor setup manifest');
  return [art.weth, art.qhooks].map(to => ({to, data: '0xdd62ed3e' + pad(art.safe) + pad(art.liquidity.address), expect: 'nonzero'}));
}
export async function checkQDrops(rpc) {
  const [raw, vestedHex, block] = await allReads([
    call(rpc, FUND.chain, FUND.qlocks, '0x' + DROP_SEL.get + word(FUND.lockId)),
    call(rpc, FUND.chain, FUND.qlocks, '0x' + DROP_SEL.vested + word(FUND.lockId)),
    rpc(FUND.chain, 'eth_getBlockByNumber', ['latest', false]),
  ]);
  if (tuple(raw).length !== 10) throw Error('Incomplete lock read');
  const lock = decodeLock(raw), now = Number(uint(block.timestamp));
  const step = fundStep(lock, now, uint(vestedHex) - lock.claimed);
  const detail = {fundStep: step.step, scheduleVested: vestedAt(lock, now).toString()};
  if (step.step === 'not_safe') return {status: 'unknown', reason: 'The lock beneficiary differs from the funding page', ...detail};
  return {status: ['announce', 'short', 'release'].includes(step.step) ? 'pending' : 'done', ...detail};
}
export async function checkFounding(rpc, fetchJson) {
  const g = FOUNDING.grant, chain = FOUNDING.pay.chain;
  const [block, api, raw] = await allReads([
    rpc(chain, 'eth_getBlockByNumber', ['latest', false]), fetchJson('/api/founding'),
    call(rpc, chain, g.qgrants, '0x' + GRANT_SEL.grantsBy + pad(g.grantor)),
  ]);
  if (!Array.isArray(api.launches)) throw Error('Incomplete founding summary');
  const ids = tuple(raw);
  if (ids.length < 2 || uint('0x' + ids[0]) !== 32n || uint('0x' + ids[1]) !== BigInt(ids.length - 2)) throw Error('Incomplete grant list');
  const grants = await allReads(ids.slice(2).map(id => call(rpc, chain, g.qgrants, '0x' + GRANT_SEL.get + id).then(h => {
    if (tuple(h).length !== 10) throw Error('Incomplete grant read');
    return decodeGrant(h);
  })));
  const granted = grantedSet(grants), cut = dayCut(Number(uint(block.timestamp)));
  const due = api.launches.filter(l => l.qualifiedAt && l.qualifiedAt < cut && !granted.has(l.creator));
  const eligibility = await allReads(due.map(async l => {
    const d = await fetchJson('/api/founding/eligibility?wallet=' + encodeURIComponent(l.creator));
    if (typeof d.eligible !== 'boolean') throw Error('Incomplete eligibility read');
    return d.eligible ? l.creator : null;
  }));
  const holding = new Set(eligibility.filter(Boolean));
  const {rows} = grantBatch(api.launches.filter(l => holding.has(l.creator)), granted, cut);
  const wethWaiting = BigInt(api.wethWaiting || '0');
  return {status: rows.length || wethWaiting > 0n ? 'pending' : 'done', grantsDue: rows.length, wethWaiting: wethWaiting.toString()};
}

export const ETHEREUM_FIRST = ['order-executor', 'x-receiver'];
export const ETHEREUM_SETUP_HREF = '/chain-setup?chain=1&go=1&factory=1&first=order-executor,x-receiver';
const isDeployment = s => s.kind === 'manifest' || s.kind === 'arbliq';
export function dedupeSteps(steps) {
  const winners = new Map();
  const priority = s => ['instant', 'copyvault'].includes(s.set) ? 2 : s.catalogueId === 'base-setup' ? 1 : 0;
  for (const s of steps) {
    if (!isDeployment(s) || !s.address) continue;
    const key = `${s.chainId}:${s.address.toLowerCase()}`, old = winners.get(key);
    if (!old || priority(s) > priority(old)) winners.set(key, s);
  }
  return steps.filter(s => !isDeployment(s) || !s.address || winners.get(`${s.chainId}:${s.address.toLowerCase()}`) === s);
}
export function ethereumCost(gas, gasPrice, ethUsd) {
  if (gas == null || gasPrice == null) return null;
  const units = BigInt(gas), price = BigInt(gasPrice);
  if (units <= 0n || price < 0n) return null;
  const wei = units * price, value = Number(wei) / 1e18;
  const eth = value.toLocaleString('en-US', {useGrouping: false, minimumSignificantDigits: 4, maximumSignificantDigits: 4});
  const rate = Number(ethUsd), usd = Number.isFinite(rate) && rate > 0 ? (value * rate).toFixed(2) : null;
  return {wei: wei.toString(), eth, usd, text: `${eth} ETH${usd == null ? '' : ` · $${usd}`}`};
}
function ethereumEstimates(steps, gasPrice, ethUsd) {
  const ethereum = steps.filter(s => isDeployment(s) && s.chainId === '1');
  const pending = ethereum.filter(s => s.status !== 'done');
  const ready = ethereum.length > 0 && ethereum.every(s => !s.reading && s.status !== 'unknown') && gasPrice != null;
  if (!pending.length) return {pending: 0, estimated: 0, ready, cost: null, text: ''};
  let gasTotal = 0n, estimated = 0;
  for (const step of pending) {
    if (step.reading) continue;
    step.cost = ethereumCost(step.gas, gasPrice, ethUsd);
    step.costText = step.cost?.text || 'Refreshing…';
    if (step.cost) { gasTotal += BigInt(step.gas); estimated++; }
  }
  const cost = estimated ? ethereumCost(gasTotal, gasPrice, ethUsd) : null;
  const remaining = pending.length - estimated;
  const text = 'Estimated Ethereum total: ' + (cost ? cost.text + (remaining ? ` + ${remaining} step${remaining === 1 ? '' : 's'} Refreshing…` : '') : 'Refreshing…');
  return {pending: pending.length, estimated, ready, gasPrice, cost, text};
}

export function setupHref(set, steps) {
  const pending = steps.filter(s => s.status !== 'done');
  const chains = [...new Set(pending.map(s => s.chainId))];
  const factory = [...new Set(pending.filter(s => ['Launch contract', 'Terminal trading'].includes(s.stepGroup)).map(s => s.chainId))];
  const parts = [];
  if (set) parts.push('set=' + encodeURIComponent(set));
  parts.push('chains=' + chains.join(','), 'go=' + chains.join(','));
  if (factory.length) parts.push('factory=' + factory.join(','));
  return '/chain-setup?' + parts.join('&');
}
const describe = (name, chains) => `${name} on ${chains.map(c => c.name).join(', ')}.`;
export function groupSteps(steps) {
  const result = GROUPS.map(g => ({...g, rows: [], checking: steps.filter(s => s.group === g.id && s.reading).length}));
  const done = steps.filter(s => !s.reading && s.status === 'done' && s.counted !== false);
  const pending = steps.filter(s => !s.reading && s.status !== 'done' && s.counted !== false);
  const heads = new Map(), buckets = new Map();
  for (const s of pending) {
    const ethereum = s.kind === 'manifest' && s.catalogueId === 'base-setup' && s.chainId === '1';
    const segment = ethereum ? (ETHEREUM_FIRST.includes(s.stepId) ? 'trading' : 'other') : '';
    const chainKey = `${s.catalogueId}:${s.chainId}:${segment}`;
    const ordered = isDeployment(s);
    const parent = ordered ? heads.get(chainKey) : null;
    if (parent) { parent.next.push({...s, presentation: 'next', href: null, button: null, text: `Next: ${s.name} on ${s.chain.name} — after the step above.${s.status === 'unknown' ? ' Refreshing…' : ''}${s.costText ? ` Estimated gas: ${s.costText}` : ''}`}); continue; }
    const key = ethereum ? `${s.catalogueId}:1:${segment}` : ordered ? `${s.catalogueId}:${s.stepId}` : s.id;
    let row = buckets.get(key);
    if (!row) {
      row = {...s, ethereumSection: segment, chains: [], steps: [], next: [], presentation: 'action', button: s.kind === 'balanceMin' ? `Send ${s.amount || '…'} ${s.chain.symbol}` : 'Open setup'};
      buckets.set(key, row); result.find(g => g.id === s.group).rows.push(row);
    }
    row.steps.push(s); row.chains.push(s.chain);
    if (ordered) heads.set(chainKey, row);
  }
  for (const group of result) for (const row of group.rows) {
    if (row.kind === 'manifest') {
      const relevant = steps.filter(s => s.status !== 'done' && s.catalogueId === row.catalogueId && row.chains.some(c => c.id === s.chainId));
      row.href = row.ethereumSection ? ETHEREUM_SETUP_HREF : setupHref(row.set, relevant);
    }
    row.status = row.steps.some(s => s.status === 'unknown') ? 'unknown' : row.steps[0].status;
    row.text = row.ethereumSection ? (row.ethereumSection === 'trading' ? 'Turn on one-click trading on Ethereum.' : 'Finish the chain setup on Ethereum.') : row.kind === 'balanceMin'
      ? (row.amount ? `Top up keeper gas on ${row.chain.name}: send ${row.amount} ${row.chain.symbol}` : `Top up keeper gas on ${row.chain.name}.`)
      : describe(row.sentence || row.name, row.chains);
    if (row.status === 'unknown') row.text += ' Refreshing…';
  }
  for (const group of result) {
    const first = group.rows.findIndex(r => r.ethereumSection);
    if (first < 0) continue;
    const ethereum = group.rows.filter(r => r.ethereumSection);
    group.rows = group.rows.filter(r => !r.ethereumSection);
    group.rows.splice(first, 0, ...ethereum);
  }
  const totalKnown = steps.filter(s => s.recurring).every(s => !s.reading);
  const total = steps.filter(s => s.counted !== false).length;
  return {groups: result, done, progress: {done: done.length, total: totalKnown ? total : null}};
}

export async function evaluateCatalogue(catalogue, io, {onUpdate} = {}) {
  const skipped = [], networks = {}, cache = new Map();
  const json = url => {
    if (!cache.has(url)) cache.set(url, Promise.resolve().then(() => io.fetchJson(url)));
    return cache.get(url);
  };
  const prepare = async row => {
    const items = [], chainIds = row.chains?.map(c => String(typeof c === 'object' ? c.id : c)) || [String(row.chainId || '4663')];
    const base = id => ({catalogueId: row.id, id: row.id + ':' + id, kind: row.kind, group: row.group, name: row.title, sentence: row.sentence, href: row.href, recurring: !!row.recurring, chainId: String(id), chain: chainInfo(id, networks[id]), status: 'unknown', reading: true, counted: true});
    const add = (step, check) => items.push({step, check});
    try {
      for (const source of row.sources || (row.source ? [row.source] : [])) {
        if (!io.sourceExists) continue;
        let exists;
        try { exists = await io.sourceExists(source); } catch (e) { if (missing(e)) exists = false; else throw e; }
        if (!exists) { skipped.push({id: row.id, reason: 'Source page is missing', source}); return items; }
      }
      if (row.kind === 'manifest' || row.kind === 'arbliq') {
        const manifest = await json(row.manifest);
        for (const id of chainIds) {
          const source = row.kind === 'manifest' ? manifest.chains?.[id] : manifest;
          if (!source?.steps?.length) { skipped.push({id: row.id + ':' + id, reason: 'Source chain steps are missing', source: row.manifest}); continue; }
          if (source.network) { networks[id] = source.network; io.registerNetwork?.(id, source.network); }
          let selected = row.stepIds ? source.steps.filter(s => row.stepIds.includes(s.id)) : source.steps;
          if (row.id === 'base-setup' && id === '1') selected = [...selected].sort((a, b) => {
            const rank = s => ETHEREUM_FIRST.includes(s.id) ? ETHEREUM_FIRST.indexOf(s.id) : 2;
            return rank(a) - rank(b);
          });
          for (const [sequence, step] of selected.entries()) add({...base(id), id: `${row.id}:${id}:${step.id}`, name: step.short || step.name || step.id, address: step.address, gas: step.gas ?? null, set: row.set || '', stepId: step.id, stepGroup: step.group, sequence}, () => checkCode(step, id, io.rpc));
        }
      } else if (row.kind === 'balanceMin') {
        for (const c of row.chains) add({...base(c.id), address: row.address, target: c.target}, () => checkBalance(row, c, io.rpc));
      } else if (row.kind === 'qdropsFund') {
        add(base(FUND.chain), () => checkQDrops(io.rpc));
      } else if (row.kind === 'foundingFund') {
        add(base(FOUNDING.pay.chain), () => checkFounding(io.rpc, json));
      } else if (row.kind === 'call') {
        let checks = row.checks, chain = row.chainId;
        if (row.adapter === 'arbAllow') {
          const [allow, remove] = await allReads([json(row.manifest), json(row.removeManifest)]);
          checks = allowChecks(allow, remove); chain = allow.chainId;
        } else if (row.adapter === 'floorAllowances') {
          const art = await json(row.manifest); checks = floorChecks(art); chain = art.chainId;
        }
        add(base(chain), () => checkCalls(checks, chain, io.rpc));
      } else add(base(chainIds[0]), async () => ({status: 'unknown', reason: 'This catalogue check is not supported'}));
    } catch (e) {
      if (missing(e)) skipped.push({id: row.id, reason: 'Source manifest is missing', source: row.manifest});
      else for (const id of chainIds) add(base(id), async () => ({status: 'unknown', reason: 'Source data could not be read'}));
    }
    return items;
  };
  // Resolve metadata first, so the total and dedicated-set ownership are fixed before reads start.
  const items = (await allReads(catalogue.steps.map(prepare))).flat();
  const owners = new Map(items.map(item => [item.step, item]));
  const unique = dedupeSteps(items.map(item => item.step));
  const ethereumSteps = unique.filter(s => isDeployment(s) && s.chainId === '1').sort((a, b) => {
    const rank = s => ETHEREUM_FIRST.includes(s.stepId) ? ETHEREUM_FIRST.indexOf(s.stepId) : s.catalogueId === 'base-setup' ? 2 : 3;
    return rank(a) - rank(b);
  });
  let ethIndex = 0, gasPrice = null, ethUsd = null;
  const steps = unique.map(s => isDeployment(s) && s.chainId === '1' ? ethereumSteps[ethIndex++] : s);
  function snapshot() {
    const copy = steps.map(step => ({...step}));
    const ethereum = ethereumEstimates(copy, gasPrice, ethUsd);
    return {steps: copy, ethereum, skipped: [...skipped].sort((a, b) => a.id.localeCompare(b.id)), networks: {...networks}, ...groupSteps(copy)};
  }
  const emit = () => onUpdate?.(snapshot());
  emit();
  // Start every chain together; the transport combines these calls into batches.
  const checks = steps.map(async step => {
    let value;
    try { value = await owners.get(step).check(); }
    catch { value = {status: 'unknown', reason: 'Chain or funding read could not be completed'}; }
    Object.assign(step, value, {reading: false, counted: !(step.recurring && value.status === 'done')});
    emit();
  });
  if (ethereumSteps.length) {
    checks.push((async () => {
      try { gasPrice = uint(await io.rpc('1', 'eth_gasPrice', [])).toString(); } catch {}
      emit();
    })());
    checks.push((async () => {
      try { ethUsd = (await json('/api/funding/native-prices?symbols=ETH'))?.prices?.ETH; } catch {}
      emit();
    })());
  }
  await allReads(checks);
  return snapshot();
}
