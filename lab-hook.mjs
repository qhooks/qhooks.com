// Share page for a hook deployed from the Lab. The link carries the deployment manifest (public data only); this
// page re-checks it against the chain on every visit, can re-check the code against the build, and gives the owner
// the two-key actions the template has: withdraw creator fees (Creator Revenue) or change the LP fee (Dynamic Fees).
// Keyless templates (TWAP Oracle) have no owner actions; the oracle's live reading is shown instead.
import { compareRuntime, buildHash, keccak, selector, isZero, sqrtPriceX96 } from './lab-deploy-core.mjs';
import { decodeManifest } from './lab-deploy.mjs';
import { CHAIN_NAME, NATIVE, rpc, ethCall, calldata, abi, send, signTypedData, decodeString, formatUnits, parseUnits, toAddress, h } from '/qx-chain.mjs';
import { restoreSigner } from '/full-launch/packages/multichain-launch/actions/signer.mjs';
import { typedGraduationAction } from '/full-launch/prototypes/pq-graduation/client/graduation-typed-data.mjs';
import { getWalletHub } from '/wallet-hub.mjs';

const EXPLORER = { '8453': 'https://basescan.org', '4663': 'https://explorer.chain.robinhood.com', '1': 'https://etherscan.io', '42161': 'https://arbiscan.io', '56': 'https://bscscan.com' };
const PROOF_T = '(uint256,uint64,uint64,bytes,bytes)';
const ZERO32 = '0x' + '0'.repeat(64);
const TAGS = { 21: 'QHOOKS/SLHVAULT/WITHDRAW/1', 22: 'QHOOKS/LPFEE/REPLACE/1', 23: 'QHOOKS/PRICEBAND/REPLACE/1', 24: 'QHOOKS/VOLEPOCH/OPEN/1', 25: 'QHOOKS/DIRFEE/SCHEDULE/1', 26: 'QHOOKS/CIRCUIT/RESUME/1' };
const $ = id => document.getElementById(id);
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const status = (el, text, error = false) => { el.textContent = text || ''; el.dataset.error = error ? 'true' : 'false'; };
const word = r => BigInt(r && r !== '0x' ? r.slice(0, 66) : '0x0');

let m;
try { m = decodeManifest(location.hash.slice(1)); if (m?.kind !== 'qhooks-hook-deployment' || m.schemaVersion !== 1) throw 0; }
catch { $('lh-title').textContent = 'No deployment in this link'; $('lh-lede').textContent = 'Open the share link the Lab gave you after deploying.'; throw new Error('No manifest'); }

const keyless = !m.publicKey;
const chainId = m.chainId, link = (kind, v) => h('a', { href: EXPLORER[chainId] + '/' + kind + '/' + v, target: '_blank', rel: 'noopener', class: 'ld-mono' }, short(v));
const call = (to, sig, args = '') => ethCall(chainId, to, selector(sig) + args);
document.title = `QHooks — ${m.projectName} on ${m.chainName}`;
$('lh-title').textContent = m.projectName;
$('lh-lede').textContent = `${m.templateTitle} hook on ${m.chainName}, deployed from the QHooks Lab.`;

// Wallet line read by qx-chain's send/sign helpers.
const hub = getWalletHub(window);
hub.subscribe(s => { const c = s.current; $('ql-connection').textContent = c ? (CHAIN_NAME[c.chainId] || 'Chain ' + c.chainId) + ' · ' + c.owner : 'No wallet connected'; $('lh-connect').hidden = !!c; });
$('lh-connect').addEventListener('click', () => $('qhc-trigger')?.click());

// ---- Facts ----
const pct = (n, d) => (Number(n) / d).toLocaleString('en-US', { maximumFractionDigits: 4 }) + '%';
const LABELS = { owner: ['Fee owner', v => v], currency0: ['Token 0', v => v], currency1: ['Token 1', v => v], feeBps: ['Creator fee', v => pct(v, 100) + ' of each swap'],
  poolFee: ['Pool LP fee', v => pct(v, 10000)], tickSpacing: ['Tick spacing', v => String(v)], initialLpFee: ['Starting LP fee', v => pct(v, 10000)], maxLpFee: ['Fee ceiling (permanent)', v => pct(v, 10000)],
  maxTickMove: ['Truncation', v => Number(v) ? v + ' ticks per second per observation' : 'off'], cardinality: ['History slots at launch', v => String(v)] };
const configRows = Object.entries(m.configuration).filter(([k]) => !['template', 'projectName', 'chainId'].includes(k) && !(k === 'owner' && m.configuration.owner === m.owner))
  .map(([k, v]) => [LABELS[k]?.[0] || k, isZero(v) && k === 'currency0' ? NATIVE[chainId] + ' (native)' : LABELS[k] ? LABELS[k][1](v) : v]);
$('lh-facts').replaceChildren(...[
  row('Hook', link('address', m.hook.address)), row('Chain', `${m.chainName} (${chainId})`),
  row('Permissions', m.hook.permissions.join(', ') + ` (flags ${m.hook.flags})`), row('PoolManager', link('address', m.poolManager)),
  m.pool ? row('Pool ID', h('span', { class: 'ld-mono' }, short(m.pool.poolId))) : null,
  row('Build hash', h('span', { class: 'ld-mono', title: m.buildHash }, m.buildHash.slice(0, 20) + '…')),
  keyless ? null : row('Key profile', m.profile), row(keyless ? 'Deployed by' : 'Owner', link('address', m.owner)),
  ...configRows.map(([k, v]) => row(k, isAddr(v) ? link('address', v) : String(v)))].filter(Boolean));
$('lh-contracts').replaceChildren(...Object.entries(m.contracts).map(([role, c]) => h('li', {}, h('strong', {}, c.name), ' ', link('address', c.address), c.shared ? ' (shared verifier)' : '')),
  ...m.transactions.filter(t => t.hash).map(t => h('li', { class: 'ld-muted' }, 'Transaction (' + t.step + ') · ', link('tx', t.hash))));
function row(k, v) { return v == null ? null : h('div', { class: 'lh-row' }, h('dt', {}, k), h('dd', {}, v)); }
function isAddr(v) { return typeof v === 'string' && /^0x[0-9a-f]{40}$/.test(v); }

// ---- Live re-check against the chain ----
async function liveCheck() {
  const out = [], add = (ok, text) => out.push(h('li', { 'data-ok': String(ok) }, text));
  for (const [role, c] of Object.entries(m.contracts)) {
    const code = await rpc(chainId, 'eth_getCode', [c.address, 'latest']);
    add(code !== '0x' && keccak(code) === c.runtimeKeccak, `${c.name}: on-chain code ${code === '0x' ? 'missing' : keccak(code) === c.runtimeKeccak ? 'unchanged since the verified deployment' : 'differs from the verified deployment'}`);
  }
  add((BigInt(m.hook.address) & 0x3fffn) === BigInt(m.hook.flags), `Hook address carries exactly its permission bits (${m.hook.flags})`);
  if (m.pool) {
    const sv = (await (await fetch('/full-launch/dependencies.json')).json()).chains.find(c => c.chainId === chainId)?.contracts?.StateView?.address;
    const w = (await ethCall(chainId, sv, selector('getSlot0(bytes32)') + m.pool.poolId.slice(2))).slice(2).match(/.{64}/g) || [];
    const price = BigInt('0x' + (w[0] || '0')), fee = Number(BigInt('0x' + (w[3] || '0')));
    add(price !== 0n, `Pool initialised · LP fee now ${fee} pips (${(fee / 10000).toFixed(2)}%)`);
  }
  const auth = m.contracts.vault || m.contracts.controller;
  if (auth) {
    const [o, k, e] = await Promise.all(['currentOwner()', 'currentPublicKey()', 'authEpoch()'].map(s => call(auth.address, s)));
    add(true, `Keys acting now: wallet ${short(toAddress(word(o)))}, post-quantum key ${short(k)} (epoch ${word(e)})`);
  }
  $('lh-live').replaceChildren(...out);
}
liveCheck().catch(e => status($('lh-live-note'), 'Chain check failed: ' + e.message, true));
if (keyless) $('lh-owner').hidden = true;

// ---- TWAP Oracle: what any contract reading it gets right now ----
if (m.template === 'twap') {
  const box = h('section', { class: 'build-summary', id: 'lh-oracle' }, h('h2', {}, 'Oracle now'), h('ul', { class: 'ld-checks ld-plain', id: 'lh-oracle-list' }),
    h('p', { class: 'ld-muted' }, 'consult(seconds) returns the average tick over that window; a window longer than the recorded history reverts. History grows by one observation per block that trades.'));
  $('lh-live').closest('section').after(box);
  (async () => {
    const hook = m.hook.address, tick = v => { let n = BigInt(v && v !== '0x' ? v.slice(0, 66) : '0x0'); if (n >= 1n << 255n) n -= 1n << 256n; return Number(n); };
    const age = Number(word(await call(hook, 'oldestAge()'))), slots = Number(word(await call(hook, 'cardinalityNext()')));
    const rows = [h('li', {}, `History: ${age.toLocaleString('en-US')} s recorded · ${slots} slots`)];
    for (const w of [60, 300, 1800, 3600, 86400]) {
      if (w > age) { rows.push(h('li', { class: 'ld-muted' }, `consult(${w}): not enough history yet`)); continue; }
      const t = tick(await call(hook, 'consult(uint32)', abi(['uint32'], [w]).slice(2)));
      rows.push(h('li', {}, `consult(${w}) = tick ${t} · price ${Math.pow(1.0001, t).toPrecision(6)} (token 1 per token 0, raw units)`));
    }
    $('lh-oracle-list').replaceChildren(...rows);
  })().catch(e => $('lh-oracle-list').replaceChildren(h('li', { 'data-ok': 'false' }, 'Oracle read failed: ' + e.message)));
}

$('lh-rebuild').addEventListener('click', async () => {
  const note = $('lh-rebuild-note');
  try {
    if (!m.buildRequest) throw new Error('This link has no build request');
    status(note, 'Rebuilding from the configuration in this link…');
    const post = await fetch('/api/lab/deploy/build', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m.buildRequest) });
    let job = await post.json(); if (!post.ok) throw new Error(job.error || 'Build unavailable');
    while (job.status === 'building') { await new Promise(r => setTimeout(r, 900)); job = await (await fetch('/api/lab/deploy/build/' + job.id)).json(); }
    if (job.status !== 'ready') throw new Error(job.error || 'Build failed');
    const a = job.artifact, hash = await buildHash(a);
    if (hash !== m.buildHash || a.buildHash !== hash) throw new Error('The rebuilt contracts have a different build hash');
    const lines = [];
    for (const [role, c] of Object.entries(m.contracts)) {
      const r = compareRuntime(await rpc(chainId, 'eth_getCode', [c.address, 'latest']), a.contracts[role]);
      lines.push(`${c.name}: ${r.ok ? 'byte-for-byte match (' + r.bytes + ' bytes)' : 'MISMATCH ' + r.reason}`);
    }
    status(note, 'Build hash matches. ' + lines.join(' · '));
  } catch (e) { status(note, e.message, true); }
});

$('lh-manifest').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' })); a.download = 'qhooks-deployment-' + m.hook.address.slice(2, 10) + '.json'; a.click(); });

// ---- Two-key actions ----
async function twoKey(contract, kind, types, values, note) {
  const f = $('lh-key-file').files?.[0]; if (!f) throw new Error('Choose your post-quantum key backup');
  const [o, k, e, n, id, mod, prof] = await Promise.all(['currentOwner()', 'currentPublicKey()', 'authEpoch()', 'nextNonce()', 'accountId()', 'MODULE()', 'PROFILE()'].map(s => call(contract, s)));
  const owner = toAddress(word(o)), me = (hub.snapshot().current?.owner || '').toLowerCase();
  if (me !== owner) throw new Error('Connect the owner wallet ' + short(owner));
  status(note, 'Restoring your key (this takes a few seconds)…');
  const signer = await restoreSigner(await f.text(), $('lh-key-pass').value);
  try {
    if (signer.publicKeyHex !== k) throw new Error('That backup is not the key acting for this contract');
    const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);
    const action = { schemaVersion: 1n, chainId: BigInt(chainId), controller: contract, moduleId: mod, profileId: prof, accountId: id, owner, publicKey: k, actionType: BigInt(kind),
      authEpoch: word(e), policyVersion: 0n, policyHash: ZERO32, operationHash: keccak(abi(['string', ...types], [TAGS[kind], ...values])), nonce: word(n), validAfter: now - 30n, validUntil: now + 600n };
    status(note, 'Sign the action in your wallet…');
    const wallet = await signTypedData(chainId, typedGraduationAction(action));
    status(note, 'Signing with your post-quantum key…');
    const pq = signer.signLabAction(action, { types, values });
    return [action.nonce, action.validAfter, action.validUntil, wallet, pq.signatureHex];
  } finally { signer.lock(); $('lh-key-pass').value = ''; }
}

if (m.contracts.vault) {
  let vault = m.contracts.vault.address;
  const currencies = [m.configuration.currency0, m.configuration.currency1];
  $('lh-withdraw').hidden = false;
  // Revenue Split: two vaults, one per payee; each payee withdraws from their own with their own keys.
  if (m.contracts.vaultB) {
    const pick = h('select', { id: 'lh-vault' }, h('option', { value: m.contracts.vault.address }, 'Payee 1 vault (' + short(m.configuration.owner) + ')'),
      h('option', { value: m.contracts.vaultB.address }, 'Payee 2 vault (' + short(m.configuration.ownerB) + ')'));
    $('lh-claims').before(h('div', { class: 'ld-grid' }, h('label', {}, h('span', {}, 'Vault'), pick)));
    pick.addEventListener('change', () => { vault = pick.value; claims().catch(e => status($('lh-withdraw-note'), e.message, true)); });
    const me = () => (hub.snapshot().current?.owner || '').toLowerCase();
    hub.subscribe(() => { if (me() === m.configuration.ownerB && vault !== m.contracts.vaultB.address) { pick.value = m.contracts.vaultB.address; pick.dispatchEvent(new Event('change')); } });
  }
  const info = {};
  async function claims() {
    const rows = [];
    for (const c of currencies) {
      const [bal, s, d] = await Promise.all([ethCall(chainId, m.poolManager, selector('balanceOf(address,uint256)') + abi(['address', 'uint256'], [vault, BigInt(c)]).slice(2)),
        ethCall(chainId, c, selector('symbol()')).catch(() => '0x'), ethCall(chainId, c, selector('decimals()'))]);
      let symbol = short(c); try { symbol = decodeString(s) || symbol; } catch {}
      info[c] = { amount: word(bal), symbol, decimals: Number(word(d)) };
      rows.push(h('li', {}, `${formatUnits(info[c].amount, info[c].decimals, 8)} ${symbol}`));
    }
    $('lh-claims').replaceChildren(...rows);
    const pick = currencies.find(c => info[c].amount > 0n) || currencies[0];
    $('lh-currency').replaceChildren(...currencies.map(c => h('option', { value: c }, info[c].symbol)));
    $('lh-currency').value = pick;
    $('lh-amount').value = formatUnits(info[pick].amount, info[pick].decimals, 18).replace(/,/g, '');
  }
  claims().catch(e => status($('lh-withdraw-note'), e.message, true));
  $('lh-currency').addEventListener('change', () => { const c = $('lh-currency').value; $('lh-amount').value = formatUnits(info[c].amount, info[c].decimals, 18).replace(/,/g, ''); });
  $('lh-withdraw-go').addEventListener('click', async () => {
    const note = $('lh-withdraw-note'), btn = $('lh-withdraw-go'); btn.disabled = true;
    try {
      const c = $('lh-currency').value, amount = parseUnits($('lh-amount').value, info[c].decimals);
      if (amount <= 0n || amount > info[c].amount) throw new Error('Enter an amount up to the vault’s balance');
      const to = ($('lh-recipient').value.trim() || hub.snapshot().current?.owner || '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(to)) throw new Error('Enter the address to pay');
      const proof = await twoKey(vault, 21, ['address', 'uint256', 'address'], [c, amount.toString(), to], note);
      const r = await send(chainId, { to: vault, data: calldata(selector('withdrawClaim(address,uint256,address,' + PROOF_T + ')'), ['address', 'uint256', 'address', PROOF_T], [c, amount, to, proof]) }, s => status(note, s));
      status(note, `Withdrawn: ${formatUnits(amount, info[c].decimals, 8)} ${info[c].symbol} to ${short(to)} (tx ${short(r.transactionHash)}).`);
      await claims(); await liveCheck();
    } catch (e) { status(note, e.message || String(e), true); } finally { btn.disabled = false; }
  });
}

if (m.template === 'dynamic-fee') {
  const controller = m.contracts.controller.address, hook = m.hook.address;
  $('lh-fee').hidden = false;
  let fee = 0, version = 0n, max = 0;
  async function feeState() {
    const [f, v, x] = await Promise.all(['currentLpFee()', 'version()', 'maxLpFee()'].map(s => call(hook, s)));
    fee = Number(word(f)); version = word(v); max = Number(word(x));
    $('lh-fee-now').textContent = `${fee} pips (${(fee / 10000).toFixed(2)}%) · ceiling ${max} pips (${(max / 10000).toFixed(2)}%) · change #${version}`;
  }
  feeState().catch(e => status($('lh-fee-note'), e.message, true));
  $('lh-fee-go').addEventListener('click', async () => {
    const note = $('lh-fee-note'), btn = $('lh-fee-go'); btn.disabled = true;
    try {
      await feeState();
      const next = Number($('lh-fee-new').value);
      if (!Number.isInteger(next) || next < 0 || next > max || next === fee) throw new Error(`Enter a new fee from 0 to ${max} pips, different from today’s`);
      const poolId = m.pool.poolId;
      const values = [hook, poolId, version.toString(), String(fee), (version + 1n).toString(), String(next), String(max)];
      const proof = await twoKey(controller, 22, ['address', 'bytes32', 'uint256', 'uint24', 'uint256', 'uint24', 'uint24'], values, note);
      const r = await send(chainId, { to: controller, data: calldata(selector('replaceFee(uint256,uint24,uint256,uint24,' + PROOF_T + ')'), ['uint256', 'uint24', 'uint256', 'uint24', PROOF_T], [version, fee, version + 1n, next, proof]) }, s => status(note, s));
      status(note, `Fee changed to ${next} pips (tx ${short(r.transactionHash)}).`);
      await feeState(); await liveCheck();
    } catch (e) { status(note, e.message || String(e), true); } finally { btn.disabled = false; }
  });
}

// ---- Governed templates (Price Bands, Volume Epochs, Directional Fees, Circuit Recovery) ----
const GOVERNED = ['price-band', 'volume-epoch', 'directional-fee', 'circuit'];
if (GOVERNED.includes(m.template)) {
  const controller = m.contracts.controller.address, hook = m.hook.address, poolId = m.pool?.poolId;
  const words = r => (r && r !== '0x' ? r.slice(2).match(/.{64}/g) || [] : []).map(w => BigInt('0x' + w));
  const read = async (sig, args = '') => words(await call(hook, sig, args));
  const one = async sig => (await read(sig))[0];
  const now = async () => BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);
  const decimals = async c => isZero(c) ? 18 : Number(word(await ethCall(chainId, c, selector('decimals()'))));
  const symbol = async c => { if (isZero(c)) return NATIVE[chainId]; try { return decodeString(await ethCall(chainId, c, selector('symbol()'))) || short(c); } catch { return short(c); } };
  const [d0, d1, s0, s1] = await Promise.all([decimals(m.configuration.currency0), decimals(m.configuration.currency1), symbol(m.configuration.currency0), symbol(m.configuration.currency1)]);
  const human = sqrt => { const p = (Number(sqrt) / 2 ** 96) ** 2 * 10 ** (d0 - d1); return p.toPrecision(6) + ' ' + s1 + ' per ' + s0; };
  const when = t => new Date(Number(t) * 1000).toISOString().replace('.000Z', 'Z').replace('T', ' ');
  const box = h('div', { id: 'lh-gov' }), info = h('p', { id: 'lh-gov-now' }), fields = h('div', { class: 'ld-grid' }), go = h('button', { type: 'button', id: 'lh-gov-go', class: 'workspace-button ld-primary' }), note = h('p', { id: 'lh-gov-note', class: 'lab-feedback', role: 'status', ariaLive: 'polite' });
  const input = (id, label, value = '') => { const i = h('input', { type: 'text', id: 'lh-gov-' + id, value, inputMode: 'decimal' }); fields.append(h('label', {}, h('span', {}, label), i)); return i; };
  $('lh-owner').append(box);
  const amountIn = (text, d) => parseUnits(String(text).trim(), d);
  let spec;
  if (m.template === 'price-band') {
    const lo = input('min', 'New lower price (' + s1 + ' per ' + s0 + ')'), hi = input('max', 'New upper price (' + s1 + ' per ' + s0 + ')');
    spec = { title: 'Price band', button: 'Change the band with both keys',
      async state() { const [v, mn, mx] = await Promise.all([one('version()'), one('minSqrtPriceX96()'), one('maxSqrtPriceX96()')]); return { v, mn, mx, text: `Band #${v}: ${human(mn)} to ${human(mx)}` }; },
      async run(st) {
        const nmn = sqrtPriceX96(lo.value, d0, d1), nmx = sqrtPriceX96(hi.value, d0, d1);
        if (!(nmn < nmx)) throw new Error('Enter a lower price below the upper price');
        const values = [hook, poolId, st.v.toString(), st.mn.toString(), st.mx.toString(), (st.v + 1n).toString(), nmn.toString(), nmx.toString()];
        const proof = await twoKey(controller, 23, ['address', 'bytes32', 'uint256', 'uint160', 'uint160', 'uint256', 'uint160', 'uint160'], values, note);
        await send(chainId, { to: controller, data: calldata(selector('replaceBand(uint256,uint160,uint160,uint256,uint160,uint160,' + PROOF_T + ')'), ['uint256', 'uint160', 'uint160', 'uint256', 'uint160', 'uint160', PROOF_T], [st.v, st.mn, st.mx, st.v + 1n, nmn, nmx, proof]) }, t => status(note, t));
        return 'Band changed';
      } };
  } else if (m.template === 'volume-epoch') {
    const c0 = input('cap0', 'Next budget, ' + s0 + ' in (' + s0 + ' → ' + s1 + ')'), c1 = input('cap1', 'Next budget, ' + s1 + ' in (' + s1 + ' → ' + s0 + ')');
    spec = { title: 'Volume epochs', button: 'Open the next epoch with both keys',
      async state() {
        const e = await one('currentEpoch()'), len = await one('epochSeconds()');
        const [st, en, k0, k1, u0, u1] = await read('epochs(uint256)', abi(['uint256'], [e]).slice(2));
        const t = await now();
        return { e, st, en, k0, k1, len, t, text: `Epoch #${e}: ${when(st)} to ${when(en)} · used ${formatUnits(u0, d0, 6)} of ${formatUnits(k0, d0, 6)} ${s0} and ${formatUnits(u1, d1, 6)} of ${formatUnits(k1, d1, 6)} ${s1}` + (t >= en ? ' · ended: the next epoch can be opened' : ' · open until ' + when(en)) };
      },
      async run(st) {
        if (st.t < st.en) throw new Error('The current epoch ends at ' + when(st.en) + '; open the next one after that');
        const n0 = amountIn(c0.value, d0), n1 = amountIn(c1.value, d1); if (n0 <= 0n || n1 <= 0n) throw new Error('Enter both budgets');
        const start = st.t > st.en ? st.t : st.en, end = start + st.len;
        const oldE = [st.e, st.st, st.en, st.k0, st.k1], newE = [st.e + 1n, start, end, n0, n1];
        const proof = await twoKey(controller, 24, ['address', 'bytes32', 'uint256', 'uint64', 'uint64', 'uint128', 'uint128', 'uint256', 'uint64', 'uint64', 'uint128', 'uint128'], [hook, poolId, ...oldE.map(String), ...newE.map(String)], note);
        const E = '(uint256,uint64,uint64,uint128,uint128)';
        await send(chainId, { to: controller, data: calldata(selector('openEpoch(' + E + ',' + E + ',' + PROOF_T + ')'), [E, E, PROOF_T], [oldE, newE, proof]) }, t => status(note, t));
        return 'Epoch opened';
      } };
  } else if (m.template === 'directional-fee') {
    const f0 = input('fee0', 'New fee ' + s0 + ' → ' + s1 + ' (pips)'), f1 = input('fee1', 'New fee ' + s1 + ' → ' + s0 + ' (pips)'), delay = input('delay', 'Takes effect in (minutes, 1 to 10080)', '2');
    spec = { title: 'Directional fees', button: 'Schedule the fees with both keys',
      async state() {
        const [v, a, b] = await read('effectiveFees()'), max = await one('maxLpFee()'), pend = await one('pending()'), at = await one('pendingActivateAt()'), t = await now();
        return { v, a, b, max, pend: pend && t < at, at, t, text: `Fees #${v}: ${a} pips ${s0} → ${s1}, ${b} pips ${s1} → ${s0} · ceiling ${max} pips` + (pend && t < at ? ` · a change is scheduled for ${when(at)}` : '') };
      },
      async run(st) {
        if (st.pend) throw new Error('A fee change is already scheduled for ' + when(st.at));
        const n0 = Number(f0.value), n1 = Number(f1.value), mins = Number(delay.value);
        if (![n0, n1].every(n => Number.isInteger(n) && n >= 0 && n <= Number(st.max))) throw new Error('Enter fees from 0 to ' + st.max + ' pips');
        if (!(Number.isInteger(mins) && mins >= 1 && mins <= 10080)) throw new Error('Enter a delay from 1 minute to 7 days');
        const at = st.t + BigInt(mins * 60) + 30n;
        const values = [hook, poolId, st.v.toString(), String(st.a), String(st.b), (st.v + 1n).toString(), String(n0), String(n1), at.toString(), String(st.max)];
        const proof = await twoKey(controller, 25, ['address', 'bytes32', 'uint256', 'uint24', 'uint24', 'uint256', 'uint24', 'uint24', 'uint64', 'uint24'], values, note);
        await send(chainId, { to: controller, data: calldata(selector('scheduleFees(uint256,uint24,uint24,uint256,uint24,uint24,uint64,' + PROOF_T + ')'), ['uint256', 'uint24', 'uint24', 'uint256', 'uint24', 'uint24', 'uint64', PROOF_T], [st.v, st.a, st.b, st.v + 1n, n0, n1, at, proof]) }, t => status(note, t));
        return 'Fees scheduled for ' + when(at);
      } };
  } else {
    const t0 = input('t0', 'New threshold, ' + s0 + ' in'), t1 = input('t1', 'New threshold, ' + s1 + ' in');
    spec = { title: 'Circuit', button: 'Resume trading with both keys',
      async state() {
        const [tr, g, at, dir, inp, k0, k1, cd] = await Promise.all(['tripped()', 'generation()', 'trippedAt()', 'tripDirection()', 'tripActualInput()', 'threshold0For1()', 'threshold1For0()', 'cooldownSeconds()'].map(one));
        const t = await now(), ready = tr && t >= at + cd;
        return { tr, g, at, dir, inp, k0, k1, cd, t, ready, text: tr ? `Tripped (#${g}) at ${when(at)} by ${formatUnits(inp, dir === 0n ? d0 : d1, 6)} ${dir === 0n ? s0 : s1} in · ` + (ready ? 'cooldown over: it can be resumed' : 'cooldown ends ' + when(at + cd)) : `Running · thresholds ${formatUnits(k0, d0, 6)} ${s0} and ${formatUnits(k1, d1, 6)} ${s1} per swap · cooldown ${cd} s` };
      },
      async run(st) {
        if (!st.tr) throw new Error('The circuit is running; nothing to resume');
        if (!st.ready) throw new Error('The cooldown ends at ' + when(st.at + st.cd));
        const n0 = amountIn(t0.value, d0), n1 = amountIn(t1.value, d1); if (n0 <= 0n || n1 <= 0n) throw new Error('Enter both thresholds');
        const trip = [st.g, st.at, st.dir, st.inp, st.k0, st.k1];
        const proof = await twoKey(controller, 26, ['address', 'bytes32', 'uint256', 'uint64', 'uint8', 'uint128', 'uint128', 'uint128', 'uint128', 'uint128'], [hook, poolId, ...trip.map(String), n0.toString(), n1.toString()], note);
        const T = '(uint256,uint64,uint8,uint128,uint128,uint128)';
        await send(chainId, { to: controller, data: calldata(selector('resumeCircuit(' + T + ',uint128,uint128,' + PROOF_T + ')'), [T, 'uint128', 'uint128', PROOF_T], [trip, n0, n1, proof]) }, t => status(note, t));
        return 'Resumed';
      } };
  }
  go.textContent = spec.button;
  box.append(h('h3', {}, spec.title), info, fields, h('div', { class: 'lab-actions' }, go), note);
  const refresh = async () => { const st = await spec.state(); info.textContent = st.text; return st; };
  refresh().catch(e => status(note, e.message, true));
  go.addEventListener('click', async () => {
    go.disabled = true;
    try { const st = await refresh(); const done = await spec.run(st); await refresh(); status(note, done + '.'); await liveCheck(); }
    catch (e) { status(note, e.message || String(e), true); } finally { go.disabled = false; }
  });
}
