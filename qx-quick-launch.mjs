// Quick launch: one card on top of Studio. The creator picks chain, name, ticker, style and starting liquidity,
// sets the quantum-key passphrase and consents once; the card then drives Studio's own steps (the same checks,
// reviews and wallet confirmations as the manual flow), so the creator only approves each wallet pop-up.
// The key backup still downloads; it is also handed to Studio's verification so the creator needn't re-upload it.
// If any step stops, the message shows here and the full Studio below takes over where it stopped.
import { PRESETS, QUOTE_ASSETS, presetVisible } from '/qx-block-catalog.mjs';
import { connectedAddress } from '/qx-chain.mjs';
import { menuChains } from '/chains.mjs';
import { STOCK_PAIRS, selectedPair, choosePair, stockPair } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
import { listedModules, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';

const $ = id => document.getElementById(id);
const can = id => { const b = $(id); return !!b && !b.disabled && !!b.offsetParent; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (test, ms, step = 250) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await sleep(step); } return false; };
const setValue = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); } e.append(...kids.flat().filter(x => x != null)); return e; };

// Live chains, plus hidden/testnet ones when the hidden-chain flag is on (chains.mjs).
const CHAINS = menuChains().map(c => [c.id, c.id === '56' ? 'BNB Chain' : c.id === '42161' ? 'Arbitrum' : c.name]);
const STYLES = PRESETS.filter(p => ['fair', 'flywheel', 'degen', 'community', 'burn', 'hours'].includes(p.id) || (p.hidden && presetVisible(p)));
const DEFAULT_QUOTE = { USDC: '50', WETH: '0.02', WBNB: '0.1', WHYPE: '0.5' };
const STAGES = ['Create token', 'Deploy verifier', 'Deploy fee collector', 'Deploy launch blocks', 'Deploy launch controller', 'Fund liquidity', 'Launch protected pool'];

const main = $('launch-workspace');
if (main && !$('qql')) mount();

function mount() {
  const chain = h('select', { id: 'qql-chain', 'aria-label': 'Chain' }, ...CHAINS.map(([v, t]) => h('option', { value: v }, t)));
  const name = h('input', { id: 'qql-name', type: 'text', maxlength: '64', placeholder: 'Token name', autocomplete: 'off' });
  const symbol = h('input', { id: 'qql-symbol', type: 'text', maxlength: '10', placeholder: 'TICKER', autocomplete: 'off' });
  const style = h('select', { id: 'qql-style', 'aria-label': 'Launch style' }, ...STYLES.map(p => h('option', { value: p.id }, p.name)));
  const styleLine = h('small', { class: 'qql-hint' });
  // Holder staking: part of the style's income (tax and charges) goes to the launch's staking vault.
  const stakers = h('select', { id: 'qql-stakers', 'aria-label': 'Stakers share' }, ...[['0', 'None'], ['10', '10%'], ['20', '20%'], ['25', '25%'], ['50', '50%']].map(([v, t]) => h('option', { value: v }, t)));
  const stakersRow = h('label', {}, h('span', {}, "Stakers' share"), stakers, h('small', { class: 'qql-hint' }, 'Of the launch income, paid to holders who stake the token.'));
  // Builder marketplace: one reviewed module (other than staking, which has its own row) can take a share too.
  const moduleSel = h('select', { id: 'qql-module', 'aria-label': 'Marketplace module' }, h('option', { value: '' }, 'None'));
  const moduleShare = h('select', { id: 'qql-module-share', 'aria-label': 'Module share' }, ...[['10', '10%'], ['20', '20%'], ['30', '30%']].map(([v, t]) => h('option', { value: v }, t)));
  const fillModules = () => { const keep = moduleSel.value; moduleSel.replaceChildren(h('option', { value: '' }, 'None'), ...listedModules().filter(m => m.panel !== 'stake').map(m => h('option', { value: m.slug }, m.name))); moduleSel.value = [...moduleSel.options].some(o => o.value === keep) ? keep : ''; };
  fillModules(); loadModules().then(fillModules);
  const moduleRow = h('label', {}, h('span', {}, 'Module'), h('div', { class: 'qql-amount' }, moduleSel, moduleShare), h('small', { class: 'qql-hint' }, h('a', { href: '/builders.html#modules' }, 'Reviewed modules'), ' get a share of the launch income and a panel on the launch page.'));
  // Creator vesting: the creator's own share of that income reaches their wallet through a public vesting stream.
  const vest = h('select', { id: 'qql-vest', 'aria-label': 'Your share pays out' }, ...[['0', 'At once'], ['30', 'Over 30 days'], ['90', 'Over 90 days'], ['180', 'Over 180 days'], ['365', 'Over 1 year']].map(([v, t]) => h('option', { value: v }, t)));
  const vestRow = h('label', {}, h('span', {}, 'Your share pays out'), vest, h('small', { class: 'qql-hint' }, 'Vesting shows holders your income reaches you slowly, on a schedule nobody can change.'));
  const tokens = h('input', { id: 'qql-tokens', type: 'text', inputmode: 'decimal', value: '700000000', 'aria-label': 'Tokens in the pool' });
  const quote = h('input', { id: 'qql-quote', type: 'text', inputmode: 'decimal', 'aria-label': 'Starting liquidity' });
  const unit = h('span', { class: 'qql-unit' });
  // Robinhood Chain: trade against WETH or a tokenized stock.
  const pair = h('select', { id: 'qql-pair', 'aria-label': 'Pair' });
  const pairRow = h('label', {}, h('span', {}, 'Pair'), pair, h('small', { class: 'qql-hint' }, 'What the token trades against. A stock pool is funded with that stock token.'));
  const pass = h('input', { id: 'qql-pass', type: 'password', minlength: '16', autocomplete: 'new-password', placeholder: 'At least 16 characters' });
  const pass2 = h('input', { id: 'qql-pass2', type: 'password', autocomplete: 'new-password', placeholder: 'Type it again' });
  const consent = h('input', { id: 'qql-consent', type: 'checkbox' });
  const go = h('button', { id: 'qql-go', type: 'button', class: 'workspace-button qtd-primary' }, 'Launch');
  const status = h('p', { id: 'qql-status', role: 'status', 'aria-live': 'polite' });
  const steps = h('ol', { class: 'qql-steps' }, ...STAGES.map(s => h('li', {}, s)));
  const done = h('div', { class: 'qql-done', hidden: true });
  const syncQuote = () => {
    const set = STOCK_PAIRS[chain.value]; pairRow.hidden = !set;
    if (set && pair.options.length <= 1) pair.replaceChildren(h('option', { value: '' }, 'WETH (ETH)'), ...set.tokens.map(([a, s, n]) => h('option', { value: a }, s + ' · ' + n)));
    if (set) pair.value = selectedPair(chain.value) || '';
    const stock = set && pair.value ? stockPair(chain.value, pair.value) : null;
    const [sym] = stock ? [stock.symbol] : QUOTE_ASSETS[chain.value] || ['USDC']; unit.textContent = sym;
    if (!quote.dataset.touched) quote.value = stock ? '0.1' : DEFAULT_QUOTE[sym] || '50';
  };
  pair.addEventListener('change', () => { choosePair(chain.value, pair.value); quote.dataset.touched = ''; syncQuote(); });
  const earns = id => (PRESETS.find(p => p.id === id)?.on || []).includes('tax');
  const syncStyle = () => { styleLine.textContent = STYLES.find(p => p.id === style.value)?.line || ''; stakersRow.hidden = !earns(style.value) || !!PRESETS.find(p => p.id === style.value)?.payees; if (stakersRow.hidden) stakers.value = '0'; else stakers.value = String(PRESETS.find(p => p.id === style.value)?.stakers || 0); vestRow.hidden = stakersRow.hidden; if (vestRow.hidden) vest.value = '0'; moduleRow.hidden = stakersRow.hidden; if (moduleRow.hidden) moduleSel.value = ''; };
  quote.addEventListener('input', () => { quote.dataset.touched = '1'; });
  consent.addEventListener('change', () => { if (consent.checked && /Tick the box/.test(status.textContent)) status.textContent = ''; });
  chain.addEventListener('change', syncQuote); style.addEventListener('change', syncStyle);
  const fromUrl = new URLSearchParams(location.search).get('chain'); if (CHAINS.some(([v]) => v === fromUrl)) chain.value = fromUrl;
  // ?style=<id> (a hidden style) preselects it, on its own chain if the style names one.
  const hiddenPick = STYLES.find(p => p.hidden) || STYLES.find(p => p.id === new URLSearchParams(location.search).get('style'));
  if (hiddenPick) { style.value = hiddenPick.id; if (hiddenPick.chain && [...chain.options].some(o => o.value === hiddenPick.chain)) chain.value = hiddenPick.chain; }
  syncQuote(); syncStyle();

  const card = h('section', { id: 'qql', class: 'qql', 'aria-labelledby': 'qql-title' },
    h('div', { class: 'qql-head' }, h('h2', { id: 'qql-title' }, 'Quick launch'), h('p', {}, 'One screen, then approve each step in your wallet. Prefer every setting? Use the full Studio below.')),
    h('div', { class: 'qql-grid' },
      h('label', {}, h('span', {}, 'Chain'), chain),
      h('label', {}, h('span', {}, 'Style'), style),
      pairRow,
      h('label', {}, h('span', {}, 'Name'), name),
      h('label', {}, h('span', {}, 'Ticker'), symbol),
      h('label', {}, h('span', {}, 'Tokens in the pool'), tokens, h('small', { class: 'qql-hint' }, 'Of a 1,000,000,000 supply; the rest stays in your wallet.')),
      h('label', {}, h('span', {}, 'Starting liquidity'), h('div', { class: 'qql-amount' }, quote, unit)),
      stakersRow, moduleRow, vestRow),
    styleLine,
    h('div', { class: 'qql-grid' },
      h('label', {}, h('span', {}, 'Quantum key passphrase'), pass, h('small', { class: 'qql-hint' }, 'Encrypts the second key that protects fee claims and graduation. Its backup file downloads during the launch; keep both.')),
      h('label', {}, h('span', {}, 'Passphrase again'), pass2)),
    h('label', { class: 'qql-consent' }, consent, h('span', {}, 'I will confirm up to 7 transactions in my wallet. Each one shows its network fee there, and the 0.0002 ETH launch fee (0.0007 BNB on BNB Chain) is part of the launch-blocks step.')),
    h('div', { class: 'qql-actions' }, go, status), steps, done);
  main.querySelector('.qj-nav')?.before(card);

  go.addEventListener('click', async () => {
    const say = t => { status.textContent = t; };
    const problem = !name.value.trim() ? 'Enter a token name.' : !/^[A-Za-z0-9]{1,10}$/.test(symbol.value.trim()) ? 'Enter a ticker of up to 10 letters or digits.'
      : !(Number(tokens.value) > 0) || !(Number(quote.value) > 0) ? 'Enter the pool amounts.' : pass.value.length < 16 ? 'Use a passphrase of at least 16 characters.'
      : pass.value !== pass2.value ? 'The two passphrases differ.' : !consent.checked ? 'Tick the box to confirm the wallet steps.' : '';
    if (problem) { say(problem); return; }
    for (const el of card.querySelectorAll('input,select,button')) el.disabled = true;
    try { await autopilot({ chain: chain.value, name: name.value.trim(), symbol: symbol.value.trim().toUpperCase(), style: style.value, stakers: Number(stakers.value), module: moduleSel.value, moduleShare: Number(moduleShare.value), vest: Number(vest.value), tokens: tokens.value, quote: quote.value, pass: pass.value }, say, steps, done); }
    catch (e) { say((e?.message || 'The launch stopped.') + ' The full Studio below shows where it is; you can carry on there.'); for (const el of card.querySelectorAll('input,select,button')) el.disabled = false; }
  });
}

async function autopilot(o, say, steps, done) {
  const stopIfError = () => { const t = [$('ql-feedback')?.innerText, $('qj-message')?.innerText, $('ql-tx-feedback')?.innerText].filter(Boolean).join(' '); if (/Couldn.t continue|revert|refused|failed|Insufficient/i.test(t)) throw new Error(t.replace(/\s+/g, ' ').slice(0, 220)); };
  // 1. Token and rules, through Studio's own fields.
  say('Setting up your token…');
  document.querySelector(`[data-qtd-chain="${o.chain}"]`)?.click(); await sleep(300);
  if ($('ql-chain') && $('ql-chain').value !== o.chain) setValue($('ql-chain'), o.chain);
  setValue($('ql-supply'), '1000000000'); setValue($('ql-name'), o.name); setValue($('ql-symbol'), o.symbol); setValue($('ql-token-funding'), o.tokens); setValue($('ql-quote-funding'), o.quote);
  await sleep(300); if (!can('qj-next-token')) throw new Error('Studio did not accept the token details.'); $('qj-next-token').click();
  if (!await until(() => document.querySelector(`.qxb-preset[data-preset="${o.style}"]`), 8000)) throw new Error('Launch styles did not load.');
  document.querySelector(`.qxb-preset[data-preset="${o.style}"]`).click(); await sleep(400);
  if (o.stakers) {
    const add = [...document.querySelectorAll('.qxb-payees .qxb-add')].find(b => /stakers/i.test(b.textContent));
    if (!add) throw new Error('Studio could not add the stakers share.');
    add.click(); await sleep(300);
  }
  if (o.module) {
    [...document.querySelectorAll('.qxb-payees .qxb-add')].find(b => /Modules/.test(b.textContent))?.click(); await sleep(300);
    const add = document.querySelector(`.qxb-mod[data-module="${o.module}"] button`);
    if (!add) throw new Error('Studio could not add the module.');
    add.click(); await sleep(300);
  }
  if (o.stakers || o.module) {
    const rows = [...document.querySelectorAll('.qxb-payee')], pctOf = row => row.querySelector('.qxb-input input');
    const mine = rows.find(r => !r.querySelector('.qxb-module')), staking = rows.find(r => r.querySelector('.qxb-stakers')), mod = rows.find(r => r.querySelector('.qxb-module:not(.qxb-stakers)'));
    if (staking) setValue(pctOf(staking), String(o.stakers));
    if (mod) setValue(pctOf(mod), String(o.moduleShare));
    setValue(pctOf(mine), String(100 - (o.stakers || 0) - (o.module ? o.moduleShare : 0))); await sleep(300);
  }
  if (o.vest) {
    const row = [...document.querySelectorAll('.qxb-payee')].find(r => !r.querySelector('.qxb-module')), pick = row?.querySelector('.qxb-vest');
    if (!pick) throw new Error('Studio could not set your share to vest.');
    setValue(pick, String(o.vest)); await sleep(300);
  }
  if (!await until(() => can('qj-next-rules'), 8000)) throw new Error('Studio did not accept the launch rules.'); $('qj-next-rules').click();
  // 2. Wallet.
  const connected = () => /0x[0-9a-fA-F]{40}/.test($('ql-connection')?.textContent || '');
  if (!connected()) {
    say('Connect your wallet to continue.');
    if (!await until(() => connected() || can('ql-connect'), 4000)) $('qhc-trigger')?.click();
    if (!await until(async () => { if (can('ql-connect')) { $('ql-connect').click(); await sleep(1500); } return connected(); }, 180000, 800)) throw new Error('No wallet connected.');
  }
  stopIfError();
  // 3. Quantum key: create, download the backup, and hand the same backup to Studio's check.
  say('Creating your quantum key…');
  if (!await until(() => can('ql-password'), 15000)) throw new Error('The key step did not open.');
  setValue($('ql-password'), o.pass); await sleep(200);
  if (!can('ql-generate')) throw new Error('Studio did not accept the passphrase.'); $('ql-generate').click();
  if (!await until(() => can('ql-export-key'), 60000)) throw new Error('The quantum key was not created.');
  let backup = null; const original = URL.createObjectURL;
  URL.createObjectURL = function (blob) { if (blob instanceof Blob) backup = blob; return original.apply(this, arguments); };
  try { $('ql-export-key').click(); await until(() => backup, 8000); } finally { URL.createObjectURL = original; }
  if (!backup) throw new Error('The key backup did not download.');
  say('Key backup downloaded. Checking it…');
  if (!$('ql-password').value) setValue($('ql-password'), o.pass);
  await until(() => !$('ql-backup-file')?.disabled, 8000);
  const dt = new DataTransfer(); dt.items.add(new File([await backup.text()], 'qhooks-launch-key-backup.json', { type: 'application/json' }));
  $('ql-backup-file').files = dt.files; $('ql-backup-file').dispatchEvent(new Event('change', { bubbles: true }));
  if (!await until(() => can('ql-verify-key'), 8000)) throw new Error('The backup check did not open.'); $('ql-verify-key').click();
  if (!await until(() => can('qj-next-key'), 60000)) throw new Error('The key backup did not verify.'); $('qj-next-key').click();
  // 4. The seven launch transactions: Studio prepares, reviews and sends each one; the wallet confirms it.
  if (!await until(() => can('ql-begin'), 20000)) throw new Error('The review step did not open.');
  $('ql-begin').click(); await sleep(1500);
  const progress = () => $('ql-progress')?.innerText || '';
  const mark = () => { const p = progress(); STAGES.forEach((s, i) => { const li = steps.children[i], m = new RegExp(s + '\\s*·?\\s*(\\S+)').exec(p.replace(/\s+/g, ' ')); li.dataset.state = /Confirmed/.test(m?.[1] || '') ? 'done' : /pending|Ready|Working/i.test(m?.[1] || '') ? 'now' : ''; }); };
  // Studio's order for each transaction: prepare → (both keys, for the pool launch) → review fees → send → check.
  let phase = 'next';
  const label = { next: 'preparing', approve: 'signing with your quantum key', review: 'checking network fees', send: 'confirm it in your wallet', check: 'waiting for the network' };
  for (let guard = 0, idle = 0; guard < 600; guard++) {
    mark(); stopIfError();
    const confirmed = (progress().match(/Confirmed/g) || []).length;
    if (confirmed >= STAGES.length) break;
    if (/Working|pending/i.test(progress()) && !/pending-or-replaced/.test(progress()) && phase !== 'check') { await sleep(1000); continue; }
    let btn = null;
    if (phase === 'check' && !can('ql-check') && can('ql-next')) phase = 'next';
    if (phase === 'next') btn = can('ql-next') ? 'next' : can('ql-check') ? 'check' : null;
    else if (phase === 'approve') btn = can('ql-approve') ? 'approve' : can('ql-review') ? 'review' : null;
    else if (phase === 'review') btn = can('ql-review') ? 'review' : null;
    else if (phase === 'send') {
      // Studio enables Send only once its consent box is ticked; the creator consented above.
      const c = $('ql-consent'); if (c && !c.disabled && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); c.dispatchEvent(new Event('input', { bubbles: true })); await sleep(300); }
      btn = can('ql-send') ? 'send' : null;
    }
    else if (phase === 'check') btn = can('ql-check') ? 'check' : null;
    if (!btn) { if (++idle > 240) throw new Error('The launch is waiting on a step it cannot take.'); await sleep(1000); continue; }
    idle = 0;
    say(`Step ${Math.min(confirmed + 1, 7)} of 7: ${label[btn]}…`);
    if (btn === 'send' && $('ql-consent') && !$('ql-consent').checked) { $('ql-consent').checked = true; $('ql-consent').dispatchEvent(new Event('change', { bubbles: true })); await sleep(200); }
    $('ql-' + btn).click();
    await sleep(btn === 'send' ? 5000 : btn === 'approve' ? 8000 : 2000);
    phase = { next: 'approve', approve: 'review', review: 'send', send: 'check', check: 'next' }[btn];
  }
  mark();
  if ((progress().match(/Confirmed/g) || []).length < STAGES.length) throw new Error('The launch did not finish.');
  // 5. Done: the share link and the terminal.
  say('Launched.');
  await until(() => $('qj-share')?.value, 60000, 1000);
  const share = $('qj-share')?.value || '';
  done.replaceChildren(h('p', {}, h('b', {}, 'Your token is live. '), 'Keep the key backup file and your passphrase: fee claims and graduation need them.'),
    share ? (() => { let link = share; try { const pool = JSON.parse(decodeURIComponent(share.split('#pool=')[1])); link = 'https://qhooks.com/l/' + pool.chainId + '/' + pool.controller + (connectedAddress() ? '?ref=' + connectedAddress().toLowerCase() : ''); } catch {}
      return h('p', {}, h('a', { href: share, class: 'workspace-button qtd-primary' }, 'Open your pool'), ' ', h('button', { type: 'button', class: 'workspace-button', onclick: () => navigator.clipboard?.writeText(link) }, 'Copy share link'), ' ',
        h('a', { class: 'workspace-button', target: '_blank', rel: 'noopener', href: 'https://x.com/intent/post?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('Just launched $' + o.symbol + ' on QHooks: liquidity locked permanently.') }, 'Post on X')); })() : null);
  done.hidden = false;
}
