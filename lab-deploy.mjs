// Lab → public chain. Builds the host page's configuration for a real chain through the QHooks build service,
// enrols a post-quantum key (created, backed up and re-verified in this browser), lists every transaction with its
// network fee, sends each one from the builder's own wallet, then checks the deployed code byte for byte against
// the build. Template-agnostic: the build manifest's plan says what to deploy. A journal in this browser lets a
// builder stop and continue; the chain itself is the record of what is already done.
import { planTransactions, plannedChecks, wordMatches, compareRuntime, buildHash, sqrtPriceX96, deploymentManifest, keccak, selector, encode, isZero, toBytes } from './lab-deploy-core.mjs';
import { RPC, CHAIN_NAME, NATIVE, rpc, ethCall, send, decodeString, formatUnits, h } from '/qx-chain.mjs';
import { createSigner, restoreSigner } from '/full-launch/packages/multichain-launch/actions/signer.mjs';
import { getWalletHub } from '/wallet-hub.mjs';
import { chainMap, visibleChains } from '/chains.mjs';

// Chains the Lab build service builds for (chains.mjs `lab`), hidden ones only with the hidden-chain flag.
export const DEPLOY_CHAINS = visibleChains().filter(c => c.lab).map(c => c.id);
const ICON = chainMap(c => c.icon);
const EXPLORER = chainMap(c => c.explorer);
// Measured on mainnet forks; used only for steps that cannot be estimated until an earlier step exists.
const GAS_HINTS = { 'creator:verifier': 980_000, 'creator:vault': 1_990_000, 'creator:hook': 850_000, 'creator:pool': 55_000,
  'dynamic-fee:verifier': 980_000, 'dynamic-fee:controller': 3_460_000, 'dynamic-fee:hook': 1_250_000, 'dynamic-fee:pool': 90_000,
  'twap:hook': 1_800_000, 'volfee:hook': 1_000_000, 'volfee:pool': 70_000,
  'price-band:verifier': 980_000, 'price-band:controller': 4_400_000, 'price-band:hook': 1_300_000, 'price-band:pool': 90_000,
  'volume-epoch:verifier': 980_000, 'volume-epoch:controller': 5_000_000, 'volume-epoch:hook': 1_700_000, 'volume-epoch:pool': 90_000,
  'directional-fee:verifier': 980_000, 'directional-fee:controller': 4_700_000, 'directional-fee:hook': 1_600_000, 'directional-fee:pool': 90_000,
  'split:verifier': 980_000, 'split:vault': 1_990_000, 'split:vaultB': 1_990_000, 'split:hook': 1_000_000, 'split:pool': 55_000,
  'circuit:verifier': 980_000, 'circuit:controller': 4_600_000, 'circuit:hook': 1_500_000, 'circuit:pool': 90_000 };
// Pool creation runs the hook's afterInitialize; for the TWAP oracle that prepares `cardinality` history slots.
const poolGasHint = (template, config) => template === 'twap' ? 90_000 + 23_000 * Number(config?.cardinality || 1) : null;
// Field order of each template's build request (the build service checks the exact set).
const FIELDS = { creator: ['template', 'projectName', 'chainId', 'owner', 'currency0', 'currency1', 'feeBps', 'poolFee', 'tickSpacing'],
  'dynamic-fee': ['template', 'projectName', 'chainId', 'currency0', 'currency1', 'tickSpacing', 'initialLpFee', 'maxLpFee'],
  twap: ['template', 'projectName', 'chainId', 'currency0', 'currency1', 'poolFee', 'tickSpacing', 'maxTickMove', 'cardinality'],
  'price-band': ['template', 'projectName', 'chainId', 'currency0', 'currency1', 'poolFee', 'tickSpacing', 'minSqrtPriceX96', 'maxSqrtPriceX96'],
  'volume-epoch': ['template', 'projectName', 'chainId', 'currency0', 'currency1', 'poolFee', 'tickSpacing', 'epochSeconds', 'initialStartsAt', 'initialEndsAt', 'initialCap0For1', 'initialCap1For0'],
  'directional-fee': ['template', 'projectName', 'chainId', 'currency0', 'currency1', 'tickSpacing', 'initialFee0For1', 'initialFee1For0', 'maxLpFee'],
  circuit: ['template', 'projectName', 'chainId', 'currency0', 'currency1', 'poolFee', 'tickSpacing', 'cooldownSeconds', 'initialThreshold0For1', 'initialThreshold1For0'],
  split: ['template', 'projectName', 'chainId', 'owner', 'ownerB', 'publicKeyB', 'currency0', 'currency1', 'feeBps', 'shareBps', 'poolFee', 'tickSpacing'],
  volfee: ['template', 'projectName', 'chainId', 'currency0', 'currency1', 'tickSpacing', 'baseFee', 'maxFee', 'feePerTickCentiPips', 'halfLife'] };
// Templates whose host form has no token fields: the panel asks for the pair.
const PAIR_IN_PANEL = ['dynamic-fee', 'price-band', 'volume-epoch', 'directional-fee', 'circuit'];
const JOURNAL = 'qhooks.lab.deploy.v1';
const BASE_ORACLE = '0x420000000000000000000000000000000000000f';
const ZERO = '0x0000000000000000000000000000000000000000';

const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const txLink = (chainId, hash) => h('a', { href: EXPLORER[chainId] + '/tx/' + hash, target: '_blank', rel: 'noopener' }, short(hash));
const addrLink = (chainId, a) => h('a', { href: EXPLORER[chainId] + '/address/' + a, target: '_blank', rel: 'noopener', class: 'ld-mono' }, short(a));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sha256Hex(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''); }

// ---- Journal (this browser only; public data, never key material) ----
function readJournal() { try { const j = JSON.parse(localStorage.getItem(JOURNAL) || '[]'); return Array.isArray(j) ? j : []; } catch { return []; } }
function writeJournal(entries) { try { localStorage.setItem(JOURNAL, JSON.stringify(entries.slice(-12))); } catch {} }
function saveEntry(entry) { const all = readJournal().filter(e => e.id !== entry.id); all.push({ ...entry, updatedAt: Date.now() }); writeJournal(all); }

// ---- Chain reads ----
async function tokenInfo(chainId, address) {
  if (isZero(address)) return { symbol: NATIVE[chainId], decimals: 18, native: true };
  const code = await rpc(chainId, 'eth_getCode', [address, 'latest']);
  if (!code || code === '0x') throw new Error(short(address) + ' is not a token on ' + CHAIN_NAME[chainId]);
  const [s, d] = await Promise.all([ethCall(chainId, address, selector('symbol()')).catch(() => '0x'), ethCall(chainId, address, selector('decimals()'))]);
  let symbol = short(address); try { symbol = decodeString(s) || symbol; } catch {}
  return { symbol, decimals: Number(BigInt(d)) };
}
async function dependencies() {
  const r = await fetch('/full-launch/dependencies.json'); if (!r.ok) throw new Error('Chain dependencies could not be read');
  return (await r.json()).chains;
}
/// The PoolManager on the wallet's network must be the canonical one the build is bound to, with the runtime hash
/// pinned in the site's dependency list.
async function checkPoolManager(chainId, poolManager) {
  const dep = (await dependencies()).find(c => c.chainId === chainId)?.contracts?.PoolManager;
  if (!dep || dep.address !== poolManager) throw new Error('This build is not bound to the known PoolManager for ' + CHAIN_NAME[chainId]);
  const code = await rpc(chainId, 'eth_getCode', [poolManager, 'latest']);
  if (await sha256Hex(toBytes(code)) !== dep.runtimeSha256) throw new Error('The PoolManager on ' + CHAIN_NAME[chainId] + ' does not match its pinned runtime');
  return dep;
}
async function stateView(chainId) { return (await dependencies()).find(c => c.chainId === chainId)?.contracts?.StateView?.address; }
async function slot0(chainId, poolId) {
  const sv = await stateView(chainId);
  const r = await ethCall(chainId, sv, selector('getSlot0(bytes32)') + poolId.slice(2));
  const w = r.slice(2).match(/.{64}/g) || [];
  return { sqrtPriceX96: BigInt('0x' + (w[0] || '0')), lpFee: Number(BigInt('0x' + (w[3] || '0'))) };
}
async function feeQuote(chainId, from, tx, gasHint) {
  const [block, tip] = await Promise.all([rpc(chainId, 'eth_getBlockByNumber', ['latest', false]), rpc(chainId, 'eth_maxPriorityFeePerGas', []).catch(() => '0x0')]);
  const price = BigInt(block.baseFeePerGas || '0x0') + BigInt(tip || 0);
  let gas = null, estimated = false;
  // A call into a contract an earlier step creates cannot be estimated yet (it would estimate an empty call).
  const target = await rpc(chainId, 'eth_getCode', [tx.to, 'latest']).catch(() => '0x');
  if (target && target !== '0x') { try { gas = BigInt(await rpc(chainId, 'eth_estimateGas', [{ from, to: tx.to, data: tx.data }])); estimated = true; } catch {} }
  if (gas === null) gas = BigInt(gasHint);
  let l1 = 0n;
  if (chainId === '8453') { try { l1 = BigInt(await ethCall(chainId, BASE_ORACLE, '0x49948e0e' + encode(['uint256', 'uint256'], [32, (tx.data.length - 2) / 2]) + tx.data.slice(2).padEnd(Math.ceil((tx.data.length - 2) / 64) * 64, '0'))); } catch {} }
  return { gas, estimated, fee: gas * price + l1, l1, price };
}

// ---- The panel ----
/// options: { container, template ('creator' | 'dynamic-fee' | 'twap' | …), readConfig(): template fields from the host form
/// (throws with a message when the form is incomplete), ownerFromConfig: true when the build fixes the owner,
/// fields: the build request's field order (defaults per template), needsPair: show token inputs in the panel,
/// keyless: the template has no owner keys (no post-quantum key step) }
export function mountLabDeploy({ container, template, readConfig, ownerFromConfig = false, title = 'Deploy to a public chain',
  fields = FIELDS[template], needsPair = PAIR_IN_PANEL.includes(template), keyless = false }) {
  const hub = getWalletHub(window);
  const st = { chainId: '8453', artifact: null, hash: null, request: null, signer: null, publicKey: null, plan: null, entry: null, stop: false, busy: false, sqrtPriceX96: null, tokens: null };
  const status = (el, text, error = false) => { el.textContent = text || ''; el.dataset.error = error ? 'true' : 'false'; };
  if (!fields) throw new Error('Unknown Lab template ' + template);

  // Chain choice
  const chips = h('div', { class: 'ld-chains', role: 'radiogroup', ariaLabel: 'Chain' }, DEPLOY_CHAINS.map(id => {
    const input = h('input', { type: 'radio', name: 'ld-chain-' + template, value: id, checked: id === st.chainId, onchange: () => { st.chainId = id; reset('chain'); } });
    return h('label', { class: 'ld-chain' }, input, h('img', { src: '/chain-symbol-icons/' + ICON[id] + '.svg', alt: '', width: 18, height: 18 }), h('span', {}, CHAIN_NAME[id]));
  }));
  const token0 = h('input', { type: 'text', maxLength: 42, spellcheck: false, autocomplete: 'off', placeholder: '0x… (0x000…000 for native ETH/BNB)', ariaLabel: 'Pool token 0', oninput: () => reset('pair') });
  const token1 = h('input', { type: 'text', maxLength: 42, spellcheck: false, autocomplete: 'off', placeholder: '0x…', ariaLabel: 'Pool token 1', oninput: () => reset('pair') });
  const pairBox = needsPair ? h('div', { class: 'ld-grid' }, h('label', {}, h('span', {}, 'Token 0 (lower address)'), token0), h('label', {}, h('span', {}, 'Token 1'), token1)) : null;
  const price = h('input', { type: 'text', inputMode: 'decimal', value: '', placeholder: 'e.g. 0.0005', ariaLabel: 'Starting price', oninput: () => reset('price') });
  const priceUnit = h('span', { class: 'ld-unit' }, '');
  const priceLabel = h('span', {}, 'Starting price: 1 token 0 =');
  const buildBtn = h('button', { type: 'button', class: 'workspace-button', onclick: () => run(build) }, 'Build for Base');
  const buildNote = h('p', { class: 'lab-feedback', role: 'status', ariaLive: 'polite' });

  // Post-quantum key
  const pass = h('input', { type: 'password', autocomplete: 'new-password', ariaLabel: 'New key passphrase', placeholder: 'At least 16 characters' });
  const pass2 = h('input', { type: 'password', autocomplete: 'new-password', ariaLabel: 'Repeat passphrase' });
  const createBtn = h('button', { type: 'button', class: 'workspace-button', onclick: () => run(createKey) }, 'Create key and download backup');
  const savedFile = h('input', { type: 'file', accept: '.json,application/json', ariaLabel: 'Saved key backup' });
  const verifyBtn = h('button', { type: 'button', class: 'workspace-button', disabled: true, onclick: () => run(verifyKey) }, 'Verify saved backup');
  const oldFile = h('input', { type: 'file', accept: '.json,application/json', ariaLabel: 'Existing key backup' });
  const oldPass = h('input', { type: 'password', autocomplete: 'current-password', ariaLabel: 'Existing key passphrase' });
  const useOldBtn = h('button', { type: 'button', class: 'workspace-button', onclick: () => run(useExistingKey) }, 'Use this key');
  const keyNote = h('p', { class: 'lab-feedback', role: 'status', ariaLive: 'polite' });

  // Review and deploy
  const connection = h('p', { id: 'ql-connection', class: 'ld-connection' }, 'No wallet connected');
  const connectBtn = h('button', { type: 'button', class: 'workspace-button', onclick: () => document.getElementById('qhc-trigger')?.click() }, 'Connect wallet');
  const reviewBtn = h('button', { type: 'button', class: 'workspace-button', disabled: true, onclick: () => run(review) }, 'Review transactions');
  const table = h('div', { class: 'ld-review', hidden: true });
  const deployBtn = h('button', { type: 'button', class: 'workspace-button ld-primary', disabled: true, onclick: () => run(deploy) }, 'Deploy');
  const stopBtn = h('button', { type: 'button', class: 'workspace-button', disabled: true, onclick: () => { st.stop = true; status(deployNote, 'Stopping after the current transaction. Your progress is saved in this browser.'); } }, 'Stop after this transaction');
  const deployNote = h('p', { class: 'lab-feedback', role: 'status', ariaLive: 'polite' });
  const result = h('div', { class: 'ld-result', hidden: true });
  const resumeBox = h('div', { class: 'ld-resume' });

  const section = h('section', { class: 'ld', id: 'lab-deploy-' + template, 'aria-labelledby': 'ld-h-' + template },
    h('h2', { id: 'ld-h-' + template }, title),
    h('p', {}, keyless ? 'Build this configuration for a real chain, then approve each transaction in your own wallet. The hook has no owner and no keys; QHooks never holds your funds.'
      : 'Build this configuration for a real chain, enrol your post-quantum key, then approve each transaction in your own wallet. QHooks never holds your keys or funds.'),
    resumeBox,
    h('ol', { class: 'ld-steps' },
      h('li', {}, h('h3', {}, 'Chain and pool'), chips, pairBox, h('label', { class: 'ld-price' }, priceLabel, price, priceUnit),
        h('div', { class: 'lab-actions' }, buildBtn), buildNote),
      keyless ? null : h('li', {}, h('h3', {}, 'Post-quantum key'),
        h('p', { class: 'ld-muted' }, 'Fee withdrawals and policy changes need your wallet and this key. Its public half is written into the contract; the private key stays in this browser and in your encrypted backup.'),
        h('div', { class: 'ld-grid' }, h('label', {}, h('span', {}, 'Backup passphrase'), pass), h('label', {}, h('span', {}, 'Repeat passphrase'), pass2)),
        h('div', { class: 'lab-actions' }, createBtn),
        h('div', { class: 'ld-grid' }, h('label', {}, h('span', {}, 'Choose the backup you just saved'), savedFile)),
        h('div', { class: 'lab-actions' }, verifyBtn),
        h('details', {}, h('summary', {}, 'Use a key you already have'),
          h('div', { class: 'ld-grid' }, h('label', {}, h('span', {}, 'Key backup'), oldFile), h('label', {}, h('span', {}, 'Passphrase'), oldPass)),
          h('div', { class: 'lab-actions' }, useOldBtn)),
        keyNote),
      h('li', {}, h('h3', {}, 'Review and deploy'), connection, h('div', { class: 'lab-actions' }, connectBtn, reviewBtn), table,
        h('div', { class: 'lab-actions' }, deployBtn, stopBtn), deployNote),
      h('li', {}, h('h3', {}, 'Verify and share'), result)));
  container.replaceChildren(section);

  // Wallet line: the shared helpers in qx-chain read the connected address from #ql-connection.
  hub.subscribe(s => { const c = s.current; connection.textContent = c ? (CHAIN_NAME[c.chainId] || 'Chain ' + c.chainId) + ' · ' + c.owner : 'No wallet connected'; connectBtn.hidden = !!c; refresh(); });
  const owner = () => (ownerFromConfig ? st.artifact?.configuration?.owner : (hub.snapshot().current?.owner || '').toLowerCase()) || null;

  function refresh() {
    buildBtn.textContent = 'Build for ' + CHAIN_NAME[st.chainId];
    buildBtn.disabled = st.busy;
    verifyBtn.disabled = st.busy || !st.signer || st.signer.backupVerified;
    reviewBtn.disabled = st.busy || !st.artifact || (!keyless && !st.publicKey) || !hub.snapshot().current;
    deployBtn.disabled = st.busy || !st.plan || st.plan.pending === 0;
    stopBtn.disabled = !st.busy || !st.deploying;
  }
  function reset(scope) {
    if (st.busy) return;
    if (scope !== 'price') { st.artifact = null; st.hash = null; st.tokens = null; status(buildNote, ''); }
    st.plan = null; table.hidden = true; result.hidden = true; status(deployNote, '');
    refresh();
  }
  async function run(fn) {
    if (st.busy) return; st.busy = true; refresh();
    try { await fn(); } catch (e) { const target = fn === build ? buildNote : fn === createKey || fn === verifyKey || fn === useExistingKey ? keyNote : deployNote; status(target, e?.message || String(e), true); }
    finally { st.busy = false; st.deploying = false; refresh(); }
  }

  function request() {
    const cfg = readConfig();
    const req = { template, projectName: cfg.projectName, chainId: st.chainId };
    if (needsPair) { req.currency0 = token0.value.trim().toLowerCase(); req.currency1 = token1.value.trim().toLowerCase(); }
    for (const [k, v] of Object.entries(cfg)) if (k !== 'projectName' && k !== 'chainId' && k !== 'template') req[k] = String(v).trim();
    return Object.fromEntries(fields.map(k => { if (typeof req[k] !== 'string' || !req[k]) throw new Error('Fill in ' + k); return [k, req[k]]; }));
  }

  async function fetchBuild(req) {
    const post = await fetch('/api/lab/deploy/build', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) });
    let job = await post.json(); if (!post.ok) throw new Error(job.error || 'The build could not start');
    const deadline = Date.now() + 370000;
    while (job.status === 'building') {
      if (Date.now() > deadline) throw new Error('The build is taking too long. Try again to collect the cached result.');
      await sleep(900);
      const r = await fetch('/api/lab/deploy/build/' + job.id); job = await r.json(); if (!r.ok) throw new Error(job.error || 'Build status could not be read');
    }
    if (job.status !== 'ready' || !job.artifact) throw new Error(job.error || 'The build failed');
    const a = job.artifact, hash = await buildHash(a);
    if (hash !== a.buildHash || a.chainId !== req.chainId || a.template !== req.template) throw new Error('The build manifest did not check out');
    return { artifact: a, hash };
  }

  async function build() {
    const req = request();
    status(buildNote, 'Checking the pool tokens on ' + CHAIN_NAME[st.chainId] + '…');
    const [t0, t1] = await Promise.all([tokenInfo(st.chainId, req.currency0), tokenInfo(st.chainId, req.currency1)]);
    if ((template === 'creator' || template === 'split') && (t0.native || t1.native)) throw new Error((template === 'split' ? 'Revenue Split' : 'Creator Revenue') + ' needs two ERC-20 tokens');
    st.tokens = [t0, t1]; priceLabel.textContent = 'Starting price: 1 ' + t0.symbol + ' ='; priceUnit.textContent = t1.symbol;
    status(buildNote, 'Building for ' + CHAIN_NAME[st.chainId] + ' in the isolated compiler…');
    const { artifact, hash } = await fetchBuild(req);
    st.request = req; st.artifact = artifact; st.hash = hash;
    status(buildNote, `Built for ${artifact.chain.name}: ${Object.values(artifact.contracts).map(c => c.name).join(', ')}. Build hash ${hash.slice(0, 16)}…, checked in this browser. Bound to PoolManager ${short(artifact.chain.poolManager)}.`);
  }

  async function createKey() {
    if (pass.value !== pass2.value) throw new Error('The passphrases do not match');
    st.signer?.lock(); st.signer = createSigner(); st.publicKey = null;
    const backup = await st.signer.exportBackup(pass.value);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([backup], { type: 'application/json' })); a.download = 'qhooks-lab-key-' + st.signer.publicKeyHex.slice(2, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    status(keyNote, 'Backup downloaded. Choose the saved file and verify it before the key is used.');
  }
  async function verifyKey() {
    const f = savedFile.files?.[0]; if (!f) throw new Error('Choose the backup file you saved');
    await st.signer.verifyBackup(await f.text(), pass.value);
    st.publicKey = st.signer.publicKeyHex; pass2.value = '';
    status(keyNote, 'Verified: the saved backup restores key ' + short(st.publicKey) + '. Keep the file and passphrase safe; QHooks cannot recover them.');
  }
  async function useExistingKey() {
    const f = oldFile.files?.[0]; if (!f) throw new Error('Choose your key backup');
    st.signer?.lock(); st.signer = await restoreSigner(await f.text(), oldPass.value);
    st.publicKey = st.signer.publicKeyHex; oldPass.value = '';
    status(keyNote, 'Restored and verified key ' + short(st.publicKey) + '.');
  }

  function inputs() {
    const o = owner(); if (!o) throw new Error('Connect the wallet that will own this hook');
    if (!st.tokens) throw new Error('Build first');
    return { owner: o, publicKey: st.publicKey, sqrtPriceX96: sqrtPriceX96(price.value, st.tokens[0].decimals, st.tokens[1].decimals) };
  }
  function entryId() { return st.hash.slice(0, 16) + '-' + (keyless ? 'nokey' : st.publicKey.slice(2, 12)); }

  async function review() {
    const from = hub.snapshot().current?.owner?.toLowerCase(); if (!from) throw new Error('Connect your wallet');
    const inp = inputs();
    status(deployNote, 'Checking ' + CHAIN_NAME[st.chainId] + '’s PoolManager and planning…');
    await checkPoolManager(st.chainId, st.artifact.chain.poolManager);
    const plan = planTransactions(st.artifact, inp);
    if (plan.txs.some(t => t.onlyOwner) && from !== inp.owner) throw new Error('Connect the owner wallet ' + short(inp.owner) + ': it creates the hook');
    const rows = [], states = {};
    let total = 0n, pending = 0;
    for (const t of plan.txs) {
      const done = await stepDone(t, inp);
      states[t.id] = done;
      let q = null;
      if (!done.done) { q = await feeQuote(st.chainId, from, t, (t.kind === 'initialize' && poolGasHint(template, st.artifact.configuration)) || GAS_HINTS[template + ':' + t.id] || 1_000_000); total += q.fee; pending++; }
      rows.push(h('tr', { 'data-step': t.id },
        h('td', {}, String(rows.length + 1)),
        h('td', {}, h('strong', {}, t.label), h('small', {}, t.detail || '')),
        h('td', { class: 'ld-mono' }, t.creates ? addrLink(st.chainId, t.creates) : t.kind === 'initialize' ? 'PoolManager ' + short(t.to) : short(t.to)),
        h('td', {}, q ? (q.estimated ? '' : '≈ ') + q.gas.toLocaleString('en-US') : '—'),
        h('td', {}, q ? '≈ ' + formatUnits(q.fee, 18, 6) + ' ' + NATIVE[st.chainId] : '—'),
        h('td', { class: 'ld-state' }, done.done ? (done.note || 'Already done') : 'Waiting')));
    }
    table.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, ['#', 'Transaction', 'Address', 'Gas', 'Network fee', 'Status'].map(x => h('th', {}, x)))), h('tbody', {}, rows)),
      h('p', { class: 'ld-muted' }, `${pending} transaction${pending === 1 ? '' : 's'} to approve, about ${formatUnits(total, 18, 6)} ${NATIVE[st.chainId]} in network fees at current prices (≈ marks an estimate made before the earlier step exists). No QHooks fee. Each transaction opens in your wallet; nothing is sent until you approve it.`));
    table.hidden = false;
    st.plan = { ...plan, inputs: inp, states, pending, from };
    st.entry = { id: entryId(), template, title: st.artifact.templateTitle, chainId: st.chainId, projectName: st.artifact.configuration.projectName, request: st.request, buildHash: st.hash,
      publicKey: st.publicKey, owner: inp.owner, price: price.value, receipts: readJournal().find(e => e.id === entryId())?.receipts || {}, complete: false };
    saveEntry(st.entry); renderResume();
    deployBtn.textContent = pending ? `Deploy ${pending} transaction${pending === 1 ? '' : 's'}` : 'Deployed';
    status(deployNote, pending ? 'Review the list, then deploy. You can stop between transactions and continue later from this browser.' : 'Everything is already on chain. Checking it…');
    if (!pending) await verify();
  }

  /// Whether a step is already on chain (resume), from the chain itself.
  async function stepDone(t, inp) {
    if (t.creates) {
      const code = await rpc(st.chainId, 'eth_getCode', [t.creates, 'latest']);
      if (code && code !== '0x') return { done: true, note: t.shared ? 'Already on this chain (shared)' : 'Deployed' };
      return { done: false };
    }
    if (t.kind === 'initialize') {
      const s = await slot0(st.chainId, t.poolId);
      if (s.sqrtPriceX96 === 0n) return { done: false };
      return { done: true, note: s.sqrtPriceX96 === BigInt(t.sqrtPriceX96) ? 'Initialised' : 'Initialised (at another price)' };
    }
    return { done: false };
  }

  function setRow(id, text) { const td = table.querySelector(`tr[data-step="${id}"] .ld-state`); if (td) td.replaceChildren(...(Array.isArray(text) ? text : [text])); }

  async function deploy() {
    const plan = st.plan; if (!plan) throw new Error('Review first');
    const from = hub.snapshot().current?.owner?.toLowerCase();
    if (from !== plan.from) throw new Error('The connected wallet changed. Review again.');
    st.stop = false; st.deploying = true; refresh();
    await checkPoolManager(st.chainId, st.artifact.chain.poolManager);
    for (const t of plan.txs) {
      if (st.stop) { status(deployNote, 'Stopped. Continue any time from “Saved deployments” in this browser.'); return; }
      const done = await stepDone(t, plan.inputs);
      if (done.done) { setRow(t.id, done.note || 'Already done'); if (!st.entry.receipts[t.id]) st.entry.receipts[t.id] = { skipped: true }; continue; }
      setRow(t.id, 'Confirm in your wallet…');
      status(deployNote, `${t.label}: confirm in your wallet.`);
      const r = await send(st.chainId, { to: t.to, data: t.data }, msg => setRow(t.id, msg));
      st.entry.receipts[t.id] = { hash: r.transactionHash, block: Number(BigInt(r.blockNumber)) };
      saveEntry(st.entry);
      const after = await stepDone(t, plan.inputs);
      if (!after.done) throw new Error(t.label + ' was mined but its result is not on chain');
      setRow(t.id, ['Done · ', txLink(st.chainId, r.transactionHash)]);
    }
    st.plan.pending = 0;
    await verify();
  }

  async function verify() {
    status(deployNote, 'Checking the deployed code against the build, byte for byte…');
    const plan = st.plan, a = st.artifact, contracts = {}, lines = [];
    let ok = true;
    const block = await rpc(st.chainId, 'eth_blockNumber', []);
    for (const t of plan.txs) {
      if (!t.creates) continue;
      const code = await rpc(st.chainId, 'eth_getCode', [t.creates, block]);
      const r = compareRuntime(code, a.contracts[t.contract]);
      contracts[t.contract] = { runtimeKeccak: keccak(code), ok: r.ok };
      ok &&= r.ok;
      lines.push(h('li', { 'data-ok': String(r.ok) }, h('strong', {}, a.contracts[t.contract].name), ' ', addrLink(st.chainId, t.creates), ' — ',
        r.ok ? `code matches the build byte for byte (${r.bytes.toLocaleString('en-US')} bytes; ${r.immutables.length} constructor-set values)` : 'MISMATCH: ' + r.reason));
    }
    for (const c of plannedChecks(a, plan.inputs, plan.addresses)) {
      const ret = await ethCall(st.chainId, c.to, c.data).catch(() => '0x');
      const good = wordMatches(ret, c.expected); ok &&= good;
      lines.push(h('li', { 'data-ok': String(good) }, `${a.contracts[c.contract].name}.${c.read} = ${typeof c.expected === 'string' && c.expected.length > 42 ? short(c.expected) : c.expected}`, good ? '' : ' — MISMATCH'));
    }
    const poolTx = plan.txs.find(t => t.kind === 'initialize');
    if (poolTx) {
      const s = await slot0(st.chainId, poolTx.poolId), good = s.sqrtPriceX96 !== 0n; ok &&= good;
      lines.push(h('li', { 'data-ok': String(good) }, `Pool ${short(poolTx.poolId)} initialised on the PoolManager; LP fee ${s.lpFee} pips`));
    }
    const verification = { ok, checkedAt: new Date().toISOString(), block: Number(BigInt(block)), contracts };
    const manifest = deploymentManifest({ artifact: a, hash: st.hash, inputs: plan.inputs, plan, receipts: st.entry.receipts, verification, deployer: plan.from });
    manifest.buildRequest = st.request;
    st.entry.complete = ok; st.entry.manifest = manifest; saveEntry(st.entry); renderResume();
    const link = new URL('/lab-hook#' + encodeManifest(manifest), location.href).href;
    const download = h('button', { type: 'button', class: 'workspace-button', onclick: () => { const x = document.createElement('a'); x.href = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })); x.download = 'qhooks-deployment-' + manifest.hook.address.slice(2, 10) + '.json'; x.click(); } }, 'Download deployment manifest');
    result.replaceChildren(
      h('p', { class: ok ? 'ld-ok' : 'ld-bad' }, ok ? `${a.templateTitle} is live on ${a.chain.name}. Hook ${manifest.hook.address}.` : 'Some checks failed. Do not use this deployment until they pass.'),
      h('ul', { class: 'ld-checks' }, lines),
      h('div', { class: 'lab-actions' }, h('a', { class: 'workspace-button ld-primary', href: link, id: 'ld-share-' + template }, 'Open the share page'), download));
    result.hidden = false;
    status(deployNote, ok ? 'Deployed and verified.' : 'Deployed, but verification failed.', !ok);
  }

  function renderResume() {
    const open = readJournal().filter(e => e.template === template).reverse();
    resumeBox.replaceChildren(...(open.length ? [h('details', { open: open.some(e => !e.complete) },
      h('summary', {}, 'Saved deployments in this browser (' + open.length + ')'),
      h('ul', {}, open.map(e => h('li', {}, `${e.projectName} · ${CHAIN_NAME[e.chainId]} · ${e.complete ? 'deployed' : 'in progress'} `,
        e.complete && e.manifest ? h('a', { href: '/lab-hook#' + encodeManifest(e.manifest) }, 'Share page') : h('button', { type: 'button', class: 'workspace-button', onclick: () => run(() => resume(e)) }, 'Continue')))))] : []));
  }
  async function resume(e) {
    st.chainId = e.chainId; chips.querySelectorAll('input').forEach(i => { i.checked = i.value === e.chainId; });
    if (needsPair) { token0.value = e.request.currency0; token1.value = e.request.currency1; }
    price.value = e.price;
    status(buildNote, 'Collecting the saved build…');
    const [t0, t1] = await Promise.all([tokenInfo(e.chainId, e.request.currency0), tokenInfo(e.chainId, e.request.currency1)]);
    st.tokens = [t0, t1]; priceLabel.textContent = 'Starting price: 1 ' + t0.symbol + ' ='; priceUnit.textContent = t1.symbol;
    const { artifact, hash } = await fetchBuild(e.request);
    if (hash !== e.buildHash) throw new Error('The rebuilt contracts differ from the saved build');
    st.request = e.request; st.artifact = artifact; st.hash = hash; st.publicKey = e.publicKey;
    status(buildNote, 'Saved build restored (build hash ' + hash.slice(0, 16) + '…).');
    if (!keyless) status(keyNote, 'Continuing with key ' + short(e.publicKey) + '. Its public half is all deployment needs; keep its backup for withdrawals and changes.');
    if (!ownerFromConfig && (hub.snapshot().current?.owner || '').toLowerCase() !== e.owner) throw new Error('Connect the wallet ' + short(e.owner) + ' to continue');
    await review();
  }
  renderResume(); refresh();
  return { state: st };
}

export function encodeManifest(m) {
  const bytes = new TextEncoder().encode(JSON.stringify(m));
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeManifest(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0))));
}
