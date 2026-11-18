import {contextFromBlockConfig,setGlossaryContext} from './qx-glossary-context.mjs';
import {studioImpact} from './qx-studio-impact.mjs';
import {currentGuidedStart} from './qx-guided-start-control.mjs';
import {STUDIO_KITS} from './qx-block-catalog.mjs';
import {studioGas} from './qx-studio-gas.mjs';
import {chainById} from './chains.mjs';
import {blockQuoteBudget} from './qx-create-plan.mjs';
// Studio launch-blocks picker. Writes the canonical blocks configuration into #ql-blocks,
// with "@owner" standing for the connected wallet until the launch is opened.
import { BLOCKS, CATEGORIES, PRESETS, QUOTE_ASSETS, AUCTION_ADDRESS, AUCTION_CONFLICTS, presetVisible } from '/qx-block-catalog.mjs';
import { isLive, setUp } from '/qx-extras.mjs';
import { selectedPair, stockPair } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
import { connectedAddress, onWalletChange } from '/qx-chain.mjs';
import { BLOCK_BITS, emptyBlocks, blocksText, checkBlocks, STAKERS_PAYEE } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { VEST_DAYS, vestOver, findVests } from '/full-launch/packages/multichain-launch/vest.mjs';
import { listedModules, moduleById, moduleIdOfPayee, modulePayee, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';

const d = document;
const root = d.getElementById('qx-blocks');
const out = d.getElementById('ql-blocks');
const OWNER = '@owner';
const RULE_TERMS = {stormFee:'storm-fee',sandwich:'sandwich-guard'};
// A payee paid through a vesting stream (QVest) of the connected wallet, before the wallet connects. The stream's address
// needs the wallet, so this stands in until then; a launch can never be encoded with it (it is not an address).
const OWNER_VEST = '@owner-vest';
const isAddr = a => /^0x[0-9a-f]{40}$/.test(a);
// Marketplace modules (and the original staking vault) are payees whose address is fixed by the token and pair, so Studio
// writes a placeholder that the launch encoding swaps for the address. They are never vested.
const isModulePayee = a => a === STAKERS_PAYEE || moduleIdOfPayee(a) >= 0;
const STAKING_MODULE = 0;
const vestLabel = n => n >= 365 ? 'Vests over 1 year' : 'Vests over ' + n + ' days';
const STORE = 'qhooks:studio-blocks:v1';
const UNIT = { pct: 100, supplyPct: 100, sec: 1, min: 60, hr: 3600, day: 86400 };
const el = (tag, attrs = {}, ...kids) => {
  const n = d.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
};

if (root && out) {
  const state = load() || fresh();
  let quiet = false;

  function fresh() {
    const values = {};
    for (const b of BLOCKS) for (const p of b.params) values[p.k] = p.def;
    return { on: [], values, guardMin: 10, payees: [{ addr: OWNER, pct: 100 }], preset: 'none' };
  }
  function load() { try { const s = JSON.parse(sessionStorage.getItem(STORE)); return s && Array.isArray(s.on) ? s : null; } catch { return null; } }
  function remember() { try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch {} }
  const chainId = () => d.getElementById('ql-chain')?.value || '8453';
  const quoteAsset = () => { const p = selectedPair(chainId()); return p ? [stockPair(chainId(), p).symbol, 18] : QUOTE_ASSETS[chainId()] || ['USDC', 6]; };
  const startingQuote = () => Number(blockQuoteBudget(d.getElementById('ql-quote-funding')?.value, /^(WETH|WBNB|WHYPE)$/.test(quoteAsset()[0])));
  const isOn = id => state.on.includes(id);
  const autoQuote = k => { const s = startingQuote(); return k === 'maxBuyPerBlock' ? s * 0.005 : k === 'buybackMax' ? s * 0.01 : k === 'clockMinBuy' ? s * 0.001 : 0; };
  const valueOf = p => (p.def === 'auto' && (state.values[p.k] === 'auto' || state.values[p.k] === '')) ? autoQuote(p.k) : state.values[p.k];

  function toBase(human, decimals) {
    const s = String(human ?? '').trim(); if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return '0';
    const [i, f = ''] = s.split('.'); return (BigInt(i || '0') * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
  }
  const fixed = (n, dp = 6) => Number(n).toFixed(dp).replace(/\.?0+$/, '');

  function config() {
    const c = emptyBlocks(OWNER);
    let mask = 0n;
    for (const id of state.on) if (id in BLOCK_BITS) mask |= 1n << BigInt(BLOCK_BITS[id]);
    c.mask = mask.toString();
    const usesGuard = state.on.some(id => BLOCKS.find(b => b.id === id)?.guard);
    c.guardSeconds = usesGuard ? String(Math.round(Number(state.guardMin) * 60)) : '0';
    const [, decimals] = quoteAsset();
    for (const b of BLOCKS) {
      if (!isOn(b.id) || b.id === 'openingAuction') continue;
      for (const p of b.params) {
        const v = valueOf(p);
        if (p.unit === 'addr') c[p.k] = String(v || '').toLowerCase();
        else if (p.unit === 'quote') c[p.k] = toBase(fixed(v, decimals), decimals);
        else if (p.unit === 'raw') c[p.k] = String(Math.max(0, Math.floor(Number(v) || 0)));
        else c[p.k] = String(Math.round(Number(v || 0) * UNIT[p.unit]));
      }
    }
    if (isOn('antiSnipe') && Number(c.snipeDecay) > Number(c.guardSeconds)) c.snipeDecay = c.guardSeconds;
    if (isOn('openingAuction')) {
      c.mask = (BigInt(c.mask) | (1n << BigInt(BLOCK_BITS.holderGate))).toString();
      c.gateToken = AUCTION_ADDRESS; c.gateMin = '1'; c.gateSeconds = String(Math.round(Number(state.values.auctionMin || 30) * 60));
    }
    const me = String(connectedAddress() || '').toLowerCase();
    c.payees = state.payees.map(p => {
      const base = p.addr === OWNER ? OWNER : String(p.addr).toLowerCase(), share = String(Math.round(Number(p.pct) * 100));
      if (!p.vestDays || isModulePayee(p.addr)) return [base, share];
      const who = base === OWNER ? me : base;
      return [isAddr(who) ? vestOver(who, p.vestDays) : base === OWNER ? OWNER_VEST : base, share];
    });
    return c;
  }

  let auctionLive = null;
  async function checkAuction() {
    if (!isOn('openingAuction')) { renderSetupBox(); return; }
    const chain = chainId(); auctionLive = null;
    try { auctionLive = (await isLive(chain, 'openingAuction')) ? chain : false; } catch { auctionLive = false; }
    write(); renderSetupBox();
  }
  const needsSetup = () => isOn('openingAuction') && auctionLive !== chainId();
  async function runSetup(btn, note) {
    if (!connectedAddress()) { note.textContent = 'Connect your wallet first.'; return; }
    btn.disabled = true;
    try { await setUp(chainId(), 'openingAuction', t => { note.textContent = t; }); note.textContent = 'Ready.'; await checkAuction(); render(); }
    catch (err) { note.textContent = err.message || 'Setup did not go through'; btn.disabled = false; }
  }
  // The wallet connects after the picker, so the setup prompt also sits under the wallet's connection line.
  const setupBox = el('div', { class: 'qxb-setup qxb-setup-wallet', id: 'qxb-auction-setup', hidden: true });
  d.getElementById('ql-connection')?.after(setupBox);
  function renderSetupBox() {
    setupBox.hidden = !(isOn('openingAuction') && auctionLive === false);
    if (setupBox.hidden) return;
    const note = el('small', { role: 'status' });
    const btn = el('button', { type: 'button', class: 'workspace-button', disabled: !connectedAddress(), onclick: () => runSetup(btn, note) }, 'Set up opening auctions');
    setupBox.replaceChildren(el('b', { text: 'One transaction before launch' }),
      el('p', { text: 'Your launch runs an opening auction, and auctions have not been used on this chain yet. Set them up once for everyone on this chain: one transaction from your wallet.' }),
      btn, connectedAddress() ? note : el('small', { text: 'Connect your wallet above first.' }));
  }
  // Streams of the connected wallet get their address once it connects (and a new one if the wallet changes).
  onWalletChange(() => { renderSetupBox(); if (state.payees.some(p => p.vestDays)) { render(); write(); } });
  d.getElementById('ql-begin')?.addEventListener('click', () => { if (state.payees.some(p => p.vestDays)) write(); }, true);
  // Launching without the auction contract would fail at the blocks step, so stop here instead.
  for (const id of ['qj-next-key', 'ql-begin']) d.getElementById(id)?.addEventListener('click', e => {
    if (!needsSetup()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    renderSetupBox(); setupBox.scrollIntoView({ block: 'center' });
    setupBox.querySelector('small').textContent = 'Set up opening auctions on this chain first.';
  }, true);
  function problems(c) {
    if (isOn('openingAuction') && auctionLive !== chainId()) return auctionLive === null ? 'Checking the opening auction contract on this chain…' : 'Set up opening auctions on this chain before launching (one transaction, once per chain).';
    if (isOn('openingAuction') && Number(state.values.auctionMin) < 5) return 'The opening auction needs at least 5 minutes.';
    const test = { ...c, payees: c.payees.map(([a, s]) => [a === OWNER ? '0x000000000000000000000000000000000000a11c' : a === OWNER_VEST ? '0x000000000000000000000000000000000000a11d' : a, s]) };
    try { if (!test.payees.every(([a]) => /^0x[0-9a-f]{40}$/.test(a))) throw new Error('Each payee needs a wallet address'); checkBlocks(test, test.payees); return ''; }
    catch (e) { return e.message; }
  }

  function write() {
    const c = config(), issue = problems(c);
    out.value = state.on.length ? blocksText(c) : '';
    out.dataset.problem = issue;
    remember();
    if (!quiet) out.dispatchEvent(new Event('input', { bubbles: true }));
    renderSummary(c, issue);
  }

  // ---------------------------------------------------------------- simulator
  // ---------------------------------------------------------------- render
  const summary = el('aside', { class: 'qxb-sim', 'aria-live': 'polite' });
  const simTime=el('input',{type:'number',min:'0',max:'43200',value:'0','aria-label':'Minute after launch',oninput:()=>renderSummary(config(),out.dataset.problem)});
  const simSize=el('input',{type:'number',min:'0',step:'any',value:'0.01','aria-label':'Trade size',oninput:()=>renderSummary(config(),out.dataset.problem)});
  const sinceBuy=el('input',{type:'number',min:'0',value:'0','aria-label':'Seconds since last buy',oninput:()=>renderSummary(config(),out.dataset.problem)});
  const fmt=n=>Number(n).toLocaleString('en-US',{maximumSignificantDigits:5});
  function renderSummary(c,issue){
   setGlossaryContext(root,contextFromBlockConfig(c,{kind:'draft'}));
   const [sym,decimals]=quoteAsset(),lp=Number(d.getElementById('ql-fee')?.value??1),minutes=Number(simTime.value),size=Number(simSize.value);
   const result=studioImpact({config:c,on:isOn,size,minutes,lpPercent:lp,quoteDecimals:decimals,supply:Number(d.getElementById('ql-supply')?.value),tokenAmount:d.getElementById('ql-token-funding')?.value,tokenDecimals:Number(d.getElementById('ql-decimals')?.value||18),quoteFunding:d.getElementById('ql-quote-funding')?.value||'0',pricing:currentGuidedStart(d.getElementById('ql-start-cap')),quote:(selectedPair(chainId())?stockPair(chainId(),selectedPair(chainId())):null)?.address||chainById(chainId())?.quote.address, sinceBuy:Number(sinceBuy.value)});
   const row=(label,value)=>el('li',{},el('span',{text:label}),el('b',{text:value}));
   const col=r=>el('div',{class:'qxb-col'},el('h4',{text:(r.isBuy?'Buy':'Sell')+' · '+fmt(size)+' '+sym+' at minute '+minutes}),
    el('ul',{},r.parts.map(([label,bps])=>row(label,fmt(bps/100)+'%')),row('Creator LP',fmt(r.lpBps/100)+'%'),row('Protocol',fmt(r.protocolBps/100)+'%')),
    el('p',{class:'qxb-total'},el('span',{text:'Nominal charges'}),el('b',{text:fmt(r.fees)+' '+sym})),
    el('ul',{class:'qs-impact'},row('Average price impact',r.impact===null?'Needs starting price':fmt(r.impact)+'%'),row('Estimated spot move',r.move===null?'—':fmt(r.move)+'%'),row('Creator LP receives',fmt(r.lpAmount)+' '+sym),row('Protocol receives',fmt(r.protocolAmount)+' '+sym),r.buckets.map(b=>row(b.label,fmt(b.amount)+' '+sym)),r.payees.flatMap(pay=>{const module=moduleById(moduleIdOfPayee(pay.address)),cut=module?.builderBps?pay.amount*module.builderBps/10000:0;return [row(pay.address==='@owner'?'Launch wallet':pay.address===STAKERS_PAYEE?'Stakers':module?.name||pay.address.slice(0,8)+'…',fmt(pay.amount-cut)+' '+sym),...(cut?[row(module.builderName+' · builder',fmt(cut)+' '+sym)]:[])];})),
    r.hits.map(text=>el('p',{class:'qs-hit',text})));
   const gas=studioGas(state.on);
   summary.replaceChildren(el('div',{class:'qxb-sim-head'},el('p',{class:'qx-eyebrow',text:'Impact simulator'}),el('h3',{text:'Try a buy. Try a sell.'}),el('div',{class:'qxb-sim-ctl'},el('label',{},'Size ('+sym+' equivalent)',simSize),el('label',{},'Minute after launch',simTime),el('label',{},'Seconds since last buy',sinceBuy))),result.error?el('p',{class:'qxb-issue',text:result.error}):el('div',{class:'qxb-cols'},result.cols.map(col)),el('p',{class:'qs-sim-note',text:'Hypothetical independent trades at the configured start price; a blocked swap reverts. Fees and recipient amounts are nominal quote-equivalents, not a live quote. Sell size is quote-equivalent. Same wallet bought the entered seconds ago; no earlier block volume or prior wallet buys. Price impact estimates use the initial liquidity range, not live quotes. Output-side impact/sandwich fees and changing volatility are shown separately.'}),el('p',{class:'qs-gas-total',text:gas.label}),el('p',{class:'qs-sim-note',text:'Gas estimates cover the added work from these rules. Actual gas depends on the trade and chain. Review the network fee before approval.'}),el('p',{class:issue?'qxb-issue':'qxb-ok',text:issue||'Edit any rule to see the change. Launch blocks are fixed at launch.'}));
  }

  function field(p, block) {
    const auto = p.def === 'auto', v = state.values[p.k];
    const unitText = p.unit === 'quote' ? quoteAsset()[0] : { pct: '%', supplyPct: '% of supply', sec: 'sec', min: 'min', hr: 'hours', day: 'days', raw: '', addr: '' }[p.unit];
    const input = el('input', { type: 'text', inputmode: p.unit === 'addr' ? 'text' : 'decimal', id: 'qxb-' + p.k, value: auto && (v === 'auto' || v === '') ? '' : String(v),
      placeholder: auto ? fixed(autoQuote(p.k), 4) + ' (auto)' : p.unit === 'addr' ? '0x…' : '', spellcheck: 'false', autocomplete: 'off',
      oninput: e => { state.values[p.k] = e.target.value === '' && auto ? 'auto' : e.target.value; state.preset = 'custom'; markPreset(); write(); } });
    return el('label', { class: 'qxb-param', for: 'qxb-' + p.k }, el('span', { text: p.label }), el('span', { class: 'qxb-input' }, input, unitText ? el('i', { text: unitText }) : null), p.hint ? el('small', { text: p.hint }) : null);
  }

  function card(b) {
    const active = b.always || isOn(b.id);
    const blocked = !active && isOn('openingAuction') && AUCTION_CONFLICTS.includes(b.id);
    const toggle = b.always ? null : el('button', { type: 'button', class: 'qxb-toggle', role: 'switch', 'aria-checked': String(active), 'aria-label': (active ? 'Turn off ' : 'Turn on ') + b.name, disabled: blocked,
      onclick: () => {
        state.on = isOn(b.id) ? state.on.filter(x => x !== b.id) : [...state.on, b.id];
        if (b.id === 'openingAuction' && isOn(b.id)) { state.on = state.on.filter(x => !AUCTION_CONFLICTS.includes(x)); checkAuction(); }
        state.preset = 'custom'; render(); write();
      } }, el('span'));
    const setup = b.id === 'openingAuction' && active && auctionLive === false ? el('div', { class: 'qxb-setup' },
      el('p', { text: 'Opening auctions have not been used on this chain yet. Setting them up is one transaction anyone can send, once per chain.' }),
      el('button', { type: 'button', class: 'qxb-add', onclick: e => runSetup(e.currentTarget, e.currentTarget.nextElementSibling) }, 'Set up opening auctions'),
      el('small', { role: 'status', text: connectedAddress() ? '' : 'You can also do this after connecting your wallet in the next step.' })) : null;
    const body = active && b.params.length ? el('div', { class: 'qxb-params' }, b.params.map(p => field(p, b))) : null;
    return el('article', { class: 'qxb-card' + (active ? ' on' : ''), 'data-block': b.id },
      el('header', {}, el('div', {}, el('h4', { text: b.name, ...(RULE_TERMS[b.id] ? {'data-glossary-term':RULE_TERMS[b.id],'data-glossary-owned':''} : {}) }), el('p', { text: b.line })), toggle),
      active ? el('p', { class: 'qxb-how', text: b.how }) : null, blocked ? el('p', { class: 'qxb-how', text: 'Off while the opening auction is on: it would treat the whole batch as one trader.' }) : null, body, setup,
      b.id === 'payees' ? payees() : null,el('small',{class:'qs-block-meta','data-qs-usage':b.id,text:studioGas([b.id]).label+' · Launch count not loaded'}));
  }

  function payees() {
    const total = state.payees.reduce((s, p) => s + Number(p.pct || 0), 0);
    const rows = state.payees.map((p, i) => el('div', { class: 'qxb-payee' },
      isModulePayee(p.addr) ? moduleLabel(p.addr) : el('input', { type: 'text', value: p.addr === OWNER ? '' : p.addr, placeholder: p.addr === OWNER ? 'Your wallet (filled in when you connect)' : '0x…', spellcheck: 'false', 'aria-label': 'Payee ' + (i + 1) + ' address',
        oninput: e => { p.addr = e.target.value.trim() === '' && i === 0 ? OWNER : e.target.value.trim(); write(); } }),
      el('span', { class: 'qxb-input' }, el('input', { type: 'text', inputmode: 'decimal', value: String(p.pct), 'aria-label': 'Payee ' + (i + 1) + ' share', oninput: e => { p.pct = e.target.value; write(); renderPayeeTotal(); } }), el('i', { text: '%' })),
      isModulePayee(p.addr) ? el('span') : el('select', { class: 'qxb-vest', 'aria-label': 'Payee ' + (i + 1) + ' payout',
        onchange: e => { p.vestDays = Number(e.target.value) || 0; render(); write(); } },
        el('option', { value: '0', text: 'Paid at once', selected: !p.vestDays }), VEST_DAYS.map(n => el('option', { value: String(n), text: vestLabel(n), selected: p.vestDays === n }))),
      state.payees.length > 1 ? el('button', { type: 'button', class: 'qxb-x', 'aria-label': 'Remove payee ' + (i + 1), onclick: () => { state.payees.splice(i, 1); render(); write(); } }, '×') : el('span'),
      p.vestDays && !isModulePayee(p.addr) ? vestNote(p) : null));
    const add = state.payees.length < 8 ? el('button', { type: 'button', class: 'qxb-add', onclick: () => { state.payees.push({ addr: '', pct: 0 }); render(); write(); } }, '+ Add payee') : null;
    // Holder staking: the marketplace's first-party staking module (address fixed by token and pair).
    const stakers = state.payees.length < 8 && !state.payees.some(p => p.addr === STAKERS_PAYEE || moduleIdOfPayee(p.addr) === STAKING_MODULE)
      ? el('button', { type: 'button', class: 'qxb-add', onclick: () => addModule(STAKING_MODULE) }, '+ Share with stakers') : null;
    const pick = state.payees.length < 8 ? el('button', { type: 'button', class: 'qxb-add', 'aria-expanded': String(modulesOpen), 'aria-controls': 'qxb-modules', onclick: () => { modulesOpen = !modulesOpen; render(); } }, modulesOpen ? '− Modules' : '+ Modules') : null;
    return el('div', { class: 'qxb-payees' },el('p',{class:'qs-split-help',text:'These percentages divide the creator block income after pots, buyback and referrals. Creator LP fees are separate. A module’s builder can keep up to 10% of that module’s allocation, fixed in code—not 10% of the trade. Example: a 20% module share with a 10% builder cut sends 2% of this bucket to the builder and 18% to the module.'}), rows, el('div', { class: 'qxb-payee-foot' }, el('span', { class: 'qxb-payee-adds' }, add, stakers, pick), el('small', { id: 'qxb-payee-total', text: 'Total ' + fixed(total, 2) + '%' })),
      modulesOpen && state.payees.length < 8 ? modulePicker() : null);
  }
  // Builder marketplace: reviewed modules a launch can pay. Each takes a share of the split like any payee; its builder
  // keeps at most 10% of what the module receives, enforced in the module's code.
  let modulesOpen = false;
  const bpsText = bps => (bps / 100).toString() + '%';
  function moduleLabel(addr) {
    const m = addr === STAKERS_PAYEE ? null : moduleById(moduleIdOfPayee(addr));
    if (addr === STAKERS_PAYEE || m?.panel === 'stake') return el('span', { class: 'qxb-stakers qxb-module' }, el('b', { text: 'Stakers' }), ' holders who stake the token earn this share, paid out over a day');
    if (!m) return el('span', { class: 'qxb-stakers qxb-module', text: 'Unknown module: remove it or reload Studio' });
    return el('span', { class: 'qxb-module' }, el('b', { text: m.name }), ' ' + m.summary + (m.builderBps ? ' Builder ' + m.builderName + ' keeps ' + bpsText(m.builderBps) + ' of it.' : ''));
  }
  function addModule(id) {
    const first = state.payees[0], cut = Math.min(20, Number(first.pct) || 0);
    first.pct = Number(first.pct) - cut; state.payees.push({ addr: modulePayee(id), pct: cut || 0 });
    modulesOpen = false; render(); write();
  }
  function modulePicker() {
    const used = new Set(state.payees.map(p => moduleIdOfPayee(p.addr)));
    const cards = listedModules().map(m => el('article', { class: 'qxb-mod', 'data-module': m.slug },
      el('div', {}, el('h5', { text: m.name }), el('p', { text: m.summary }),
        el('small', { text: 'Built by ' + m.builderName + ' · ' + (m.builderBps ? 'builder keeps ' + bpsText(m.builderBps) + ' of this share' : 'no builder share') + ' · reviewed by QHooks' })),
      used.has(m.id) ? el('span', { class: 'qxb-mod-on', text: 'Added' }) : el('button', { type: 'button', class: 'qxb-add', 'aria-label': 'Add ' + m.name, onclick: () => addModule(m.id) }, 'Add')));
    return el('div', { class: 'qxb-modules', id: 'qxb-modules' },
      el('p', { class: 'qxb-mod-head', text: 'Modules are reviewed contracts that earn a share of your launch income for your holders. Each one gets its own panel on your launch page.' }),
      cards.length ? cards : el('p', { text: 'No modules are listed yet.' }),
      el('small', {}, 'Built one? ', el('a', { href: '/builders', text: 'Submit a module' })));
  }
  loadModules().then(() => { if (modulesOpen || state.payees.some(p => moduleIdOfPayee(p.addr) >= 0)) render(); });
  // A vesting payee: its share goes to a public stream contract that pays the wallet evenly over the period.
  function vestNote(p) {
    const me = String(connectedAddress() || '').toLowerCase(), who = p.addr === OWNER ? me : String(p.addr).toLowerCase();
    const days = p.vestDays >= 365 ? 'a year' : p.vestDays + ' days';
    const text = isAddr(who)
      ? 'Paid through vesting stream ' + vestOver(who, p.vestDays) + ': each payout reaches ' + (p.addr === OWNER ? 'your wallet' : who.slice(0, 6) + '…' + who.slice(-4)) + ' evenly over ' + days + '. Public, ownerless, nobody can change it.'
      : p.addr === OWNER ? 'Each payout reaches your wallet evenly over ' + days + ', through a public vesting stream. Its address is set when you connect.' : 'Enter the wallet this stream pays.';
    return el('small', { class: 'qxb-vest-note', text });
  }
  function renderPayeeTotal() { const t = d.getElementById('qxb-payee-total'); if (t) t.textContent = 'Total ' + fixed(state.payees.reduce((s, p) => s + Number(p.pct || 0), 0), 2) + '%'; }

  function applyPreset(p) {
    const base = fresh();
    state.values = { ...base.values, ...(p.set || {}) };
    state.on = [...p.on];
    state.guardMin = p.guardMin || 10;
    if (p.payees) state.payees = p.payees.map(x => ({ ...x }));
    state.preset = p.id;
    render(); write(); checkAuction();
  }
  function markPreset() { for (const b of root.querySelectorAll('.qxb-preset')) b.setAttribute('aria-pressed', String(b.dataset.preset === state.preset)); }

  function render() {
    const usesGuard = state.on.some(id => BLOCKS.find(b => b.id === id)?.guard);
    const kitButton=p=>el('button',{type:'button',class:'qxb-preset','data-preset':p.id,'aria-pressed':String(state.preset===p.id),onclick:()=>applyPreset(p)},el('b',{text:p.name}),el('span',{text:p.line}),el('small',{text:'Use kit · then edit'}));
    const presets=el('div',{},el('div',{class:'qxb-presets',role:'group','aria-label':'Fork a starter kit'},[PRESETS.find(p=>p.id==='fair'),...STUDIO_KITS].map(kitButton)),el('details',{class:'qs-more-kits'},el('summary',{text:'More starter kits'}),el('div',{class:'qxb-presets'},PRESETS.filter(p=>p.id!=='fair'&&(presetVisible(p)||state.preset===p.id)).map(kitButton))));
    const guard = usesGuard ? el('label', { class: 'qxb-guard' }, el('span', { text: 'Launch guard' }),
      el('span', { class: 'qxb-input' }, el('input', { type: 'text', inputmode: 'decimal', value: String(state.guardMin), 'aria-label': 'Launch guard length in minutes', oninput: e => { state.guardMin = e.target.value; write(); } }), el('i', { text: 'min' })),
      el('small', { text: 'Anti-snipe, wallet cap and cooldown run for this long after launch.' })) : null;
    const groups = CATEGORIES.filter(c => c.id !== 'built').map(c => el('section', { class: 'qxb-group' },
      el('h3', { text: c.name }), el('p', { class: 'qxb-group-line', text: c.line }),
      el('div', { class: 'qxb-cards' }, BLOCKS.filter(b => b.cat === c.id).map(card))));
    root.replaceChildren(
      el('div', { class: 'qxb-head' }, el('div', {}, el('p', { class: 'qx-eyebrow', text: 'Launch blocks' }), el('h2', { text: 'What runs on every trade' }),
        el('p', { text: 'Pick blocks and tune them. They are fixed when you launch: no owner, no admin key, no changes later. Anyone can read them on chain.' }))),
      el('section',{class:'qs-kits'},el('h3',{text:'Start with a kit'}),el('p',{text:'Pick a starting point, then tune every block. Your edits make it yours.'}),presets),
      el('div', { class: 'qxb-layout' }, el('div', { class: 'qxb-main' }, guard, groups), summary));
  }

  d.addEventListener('qhooks:studio-pricing',()=>renderSummary(config(),out.dataset.problem));
  out.addEventListener('qx-blocks-load', () => {
    // A saved launch: show its exact blocks.
    if (!out.value) { state.on = []; quiet = true; render(); write(); quiet = false; return; }
    try {
      const c = JSON.parse(out.value), [, decimals] = quoteAsset();
      state.on = Object.entries(BLOCK_BITS).filter(([, bit]) => (BigInt(c.mask) >> BigInt(bit)) & 1n).map(([id]) => id);
      if (state.on.includes('holderGate') && String(c.gateToken).toLowerCase() === AUCTION_ADDRESS) { state.on = state.on.map(x => x === 'holderGate' ? 'openingAuction' : x); state.values.auctionMin = Number(c.gateSeconds) / 60; auctionLive = chainId(); }
      state.guardMin = Number(c.guardSeconds) / 60 || 10;
      for (const b of BLOCKS) for (const p of b.params) {
        const raw = c[p.k]; if (raw === undefined) continue;
        state.values[p.k] = p.unit === 'addr' ? raw : p.unit === 'quote' ? Number(raw) / 10 ** decimals : p.unit === 'raw' ? Number(raw) : Number(raw) / UNIT[p.unit];
      }
      const me = String(connectedAddress() || '').toLowerCase(), owner = isAddr(me) ? [me] : [];
      state.payees = c.payees.map(([a, s]) => { const v = findVests([a], owner)[0]; return v ? { addr: OWNER, pct: Number(s) / 100, vestDays: v.days } : { addr: a, pct: Number(s) / 100 }; });
      state.preset = 'custom';
      const saved = out.value; quiet = true; render(); renderSummary(c, ''); out.value = saved; quiet = false;
    } catch {}
  });
  for (const id of ['ql-chain', 'ql-quote-funding', 'ql-fee']) d.getElementById(id)?.addEventListener('input', () => { render(); write(); });
  d.addEventListener('qhooks:pair', () => { render(); write(); });
  d.getElementById('ql-chain')?.addEventListener('change', () => { render(); write(); checkAuction(); });
  quiet = true; render(); write(); quiet = false;
  // Hooks page presets link here as ?blocks=<preset>.
  const wanted = PRESETS.find(p => p.id === new URLSearchParams(location.search).get('blocks'));
  if (wanted) { quiet = true; applyPreset(wanted); quiet = false; }
}
