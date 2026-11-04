// Trust layer on token pages: who made this launch (a creator verified on X), whether it copies an earlier verified
// launch, RepoProof's pre-buy verdict, and the launch's own facts read from its contracts just now.
// Used by the Launch terms card (qx-terms.mjs), the terminal's header, list and risk banner, and verify.html.
// Labels only: nothing here blocks or slows a trade.
import { ethCall, calldata, words, toAddress, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS, BLOCK_BITS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { modulesAmong, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';
import { BLOCKS, AUCTION_ADDRESS } from '/qx-block-catalog.mjs';
import { extraAddress, isLive } from '/qx-extras.mjs';

const SEL = { config: '0x79502c55', previewRate: '0xb9c3fc44', currentOwner: '0xb387ef92', recoveryEta: '0x1479b3da', recoveryBy: '0xaa19ddc3', locksSummary: '0x9522a80a', totalSupply: '0x18160ddd' };
const ZERO = '0x' + '0'.repeat(40);
// Its own stylesheet, so every page that shows a launch (Trade, terminal, creator dashboard) gets it without an edit.
if (!document.querySelector('link[href="/qx-trust.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/qx-trust.css' }));
const pad = v => BigInt(v).toString(16).padStart(64, '0');
const cache = new Map();
const once = (key, ms, fn) => { const c = cache.get(key); if (c && Date.now() - c.at < ms) return c.p; const p = fn().catch(e => { cache.delete(key); throw e; }); cache.set(key, { at: Date.now(), p }); return p; };
const getJson = async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const pct = bps => (Number(bps) / 100).toFixed(2).replace(/\.?0+$/, '') + '%';
const share = (n, d) => { if (!d) return '0%'; const p = Number(n * 1000000n / d) / 10000; return (p === 0 ? '0' : p < 1 ? p.toFixed(2) : p.toFixed(1).replace(/\.0$/, '')) + '%'; };
const keyOf = (chainId, controller) => chainId + ':' + String(controller).toLowerCase();

// ---- Server data ----
export const trustOf = (chainId, controller) => once('t:' + keyOf(chainId, controller), 20000, () => getJson(`/api/trust/market/${chainId}/${String(controller).toLowerCase()}`)).catch(() => null);
export const verdictOf = (chainId, controller) => once('v:' + keyOf(chainId, controller), 60000, () => getJson(`/api/trust/verdict/${chainId}/${String(controller).toLowerCase()}`)).catch(() => null);
export const trustList = () => once('list', 20000, () => getJson('/api/trust/list')).then(j => j.markets || {}).catch(() => ({}));
export const forget = (chainId, controller) => { cache.delete('t:' + keyOf(chainId, controller)); cache.delete('list'); };

// ---- Small labels ----
export function badge(v, { compact = false } = {}) {
  if (!v?.handle) return null;
  const text = compact ? '✓ @' + v.handle : 'Verified creator @' + v.handle;
  const el = v.postUrl ? h('a', { class: 'qtr-badge', href: v.postUrl, target: '_blank', rel: 'noopener', title: 'The creator\'s wallet signed a code that @' + v.handle + ' posted on X' }, text)
    : h('span', { class: 'qtr-badge', title: 'The creator\'s wallet signed a code that @' + v.handle + ' posted on X' }, text);
  return el;
}
export function copyLabel(c, { compact = false } = {}) {
  if (!c) return null;
  return h('span', { class: 'qtr-copy', title: 'Same ' + c.same + ' as $' + c.symbol + ', launched earlier by the verified creator @' + c.handle }, compact ? 'Copy of $' + c.symbol : 'Same ' + c.same + ' as an earlier verified launch');
}
const LEVEL = { danger: ['High risk', 'danger'], caution: ['Caution', 'caution'], clear: ['No red flags', 'clear'], unknown: ['Not enough data', 'unknown'] };
export function verdictChip(v) {
  if (!v || !v.level) return h('span', { class: 'qtr-chip' }, v?.unsupported ? 'Not covered' : 'Unavailable');
  const [t, c] = LEVEL[v.level] || ['Unknown', 'unknown'];
  return h('span', { class: 'qtr-chip ' + c }, t);
}

// ---- The launch's own facts, read from chain ----
/** Blocks on, what a trade pays now, liquidity, team locks, keys and recovery, modules. */
export function factsOf(pool) {
  return once('f:' + keyOf(pool.chainId, pool.controller), 30000, async () => {
    const { chainId, controller } = pool, c = pool.constructor, blocks = c.blocks, quote = c.quote.toLowerCase();
    const token = (c.currency0.toLowerCase() === quote ? c.currency1 : c.currency0).toLowerCase(), owner = String(c.owner).toLowerCase();
    const call = (to, data) => ethCall(chainId, to, data).catch(() => null);
    const hasBlocks = blocks && BigInt(blocks) !== 0n;
    const [raw, buy, sell, curOwner, eta, by, supplyHex, ownerBal] = await Promise.all([hasBlocks ? call(blocks, SEL.config) : null,
      hasBlocks ? call(blocks, SEL.previewRate + pad(1) + pad(0) + pad(0)) : null, hasBlocks ? call(blocks, SEL.previewRate + pad(0) + pad(0) + pad(0)) : null,
      call(controller, SEL.currentOwner), call(controller, SEL.recoveryEta), call(controller, SEL.recoveryBy), call(token, SEL.totalSupply), call(token, calldata('0x70a08231', ['address'], [owner]))]);
    const facts = [];
    facts.push({ k: 'Liquidity', v: hasBlocks ? 'Permanent: nobody can withdraw it, the creator included' : 'The creator can withdraw graduated liquidity with both keys', tone: hasBlocks ? 'good' : 'warn' });
    let on = [], cfg = null;
    if (raw && raw.length > 2) {
      const w = words(raw); cfg = Object.fromEntries(BLOCK_FIELDS.map(([k], i) => [k, w[i]]));
      on = Object.entries(BLOCK_BITS).filter(([, b]) => (cfg.mask >> BigInt(b)) & 1n).map(([id]) => id);
      if (on.includes('holderGate') && cfg.gateToken === BigInt(AUCTION_ADDRESS)) on = on.map(x => x === 'holderGate' ? 'openingAuction' : x);
      const names = on.map(id => BLOCKS.find(b => b.id === id)?.name || id);
      facts.push({ k: 'Blocks on', v: names.length ? names.length + ': ' + names.join(', ') : 'None', tone: '' });
    }
    if (buy && sell) { const b = BigInt(buy), s = BigInt(sell); facts.push({ k: 'Charges now', v: 'A buy pays ' + pct(b) + ', a sell pays ' + pct(s) + ' (on top of pool fees)', tone: s >= 1000n || b >= 1000n ? 'warn' : '' }); }
    // Team tokens: locked in the chain's QLocks, and what the creator wallet holds with no lock at all.
    const supply = supplyHex ? BigInt(supplyHex) : 0n;
    if (supply) {
      let locked = 0n;
      try { if (await isLive(chainId, 'locks')) locked = words(await ethCall(chainId, await extraAddress('locks'), calldata(SEL.locksSummary, ['address'], [token])))[0]; } catch {}
      const free = ownerBal ? BigInt(ownerBal) : 0n;
      facts.push({ k: 'Team tokens', v: share(locked, supply) + ' locked with public notice; the creator wallet holds ' + share(free, supply) + ' unlocked', tone: free * 20n > supply ? 'warn' : '' });
    }
    // Keys: who acts for the launch now, and any key recovery under way.
    const now = curOwner && curOwner.length === 66 ? toAddress(BigInt(curOwner)) : owner, etaN = eta ? Number(BigInt(eta)) : 0;
    const keys = etaN > 0 ? 'A recovery started by the creator\'s ' + (Number(BigInt(by || '0x0')) === 1 ? 'wallet' : 'post-quantum key') + ' replaces both keys from ' + new Date(etaN * 1000).toLocaleDateString() + ' unless the other key cancels it'
      : (now !== owner ? 'Keys were rotated to a new wallet. ' : '') + 'Creator actions need the wallet and a post-quantum key together; no recovery pending';
    facts.push({ k: 'Creator keys', v: keys, tone: etaN > 0 ? 'warn' : '' });
    if (cfg) {
      try {
        await loadModules();
        const w = words(raw), payees = w.slice(BLOCK_FIELDS.length, BLOCK_FIELDS.length + 8).map(toAddress).filter(x => x !== ZERO);
        const found = modulesAmong(payees, token, quote);
        facts.push({ k: 'Modules', v: found.length ? found.map(f => f.module.name + (f.module.builderBps ? ' (builder keeps ' + pct(f.module.builderBps) + ')' : '')).join(', ') : 'None', tone: '' });
      } catch {}
    }
    return { facts, token, owner, current: now, recovery: etaN > 0, sellBps: sell ? Number(BigInt(sell)) : null, buyBps: buy ? Number(BigInt(buy)) : null };
  });
}

// ---- The Launch terms card's trust section ----
const verifyHref = pool => '/verify.html#m=' + pool.chainId + ':' + pool.controller;
function verdictBlock(v) {
  const head = h('div', { class: 'qtr-row' }, h('b', {}, 'Pre-buy check'), verdictChip(v));
  if (!v || !v.level) return h('div', { class: 'qtr-verdict' }, head,
    h('p', { class: 'qtb-note' }, v?.unsupported ? 'RepoProof does not cover this chain yet.' : 'RepoProof could not be reached just now. The facts below are read from the launch\'s contracts.'),
    v?.url ? h('a', { class: 'qtr-link', href: v.url, target: '_blank', rel: 'noopener' }, 'Run the check on RepoProof ↗') : null);
  return h('div', { class: 'qtr-verdict ' + v.level }, head,
    h('p', { class: 'qtr-headline' }, 'RepoProof: ' + v.headline + (v.counts ? ' · ' + v.counts.danger + ' red, ' + v.counts.caution + ' watch, ' + v.counts.clear + ' clear' : '') + (v.stale ? ' (from an earlier check)' : '')),
    v.checks?.length ? h('ul', { class: 'qtr-checks' }, ...v.checks.slice(0, 4).map(c => h('li', { class: c.status }, c.title))) : null,
    v.url ? h('a', { class: 'qtr-link', href: v.url, target: '_blank', rel: 'noopener' }, 'Evidence on RepoProof ↗') : null);
}
/** Fills `el` with the trust section for `pool` (creator, copy warning, verdict, facts). */
export async function renderTrust(el, pool) {
  const key = keyOf(pool.chainId, pool.controller); el.dataset.key = key;
  el.className = 'qtr';
  el.replaceChildren(h('p', { class: 'qtb-note' }, 'Checking who made this launch…'));
  const [t, v, f] = await Promise.all([trustOf(pool.chainId, pool.controller), verdictOf(pool.chainId, pool.controller), factsOf(pool).catch(() => null)]);
  if (el.dataset.key !== key) return;
  const creator = t?.verified
    ? h('div', { class: 'qtr-row' }, h('b', {}, 'Creator'), badge(t.verified))
    : h('div', { class: 'qtr-row' }, h('b', {}, 'Creator'), h('span', { class: 'qtr-muted' }, 'Not verified on X'), h('a', { class: 'qtr-link', href: verifyHref(pool) }, 'Are you the creator? Verify'));
  const copy = t?.copyOf ? h('div', { class: 'qtr-warn', role: 'note' }, h('b', {}, 'Check you have the right token'),
    h('span', {}, 'Same ' + t.copyOf.same + ' as $' + t.copyOf.symbol + ' (' + t.copyOf.name + '), launched earlier by the verified creator @' + t.copyOf.handle + '. '),
    h('a', { href: '/terminal.html#m=' + t.copyOf.chainId + ':' + t.copyOf.controller }, 'Open the earlier launch')) : null;
  // Liquidity has its own row in the terms below, so it is left out here.
  const facts = f ? h('div', {}, h('p', { class: 'qtr-sub' }, 'Read from the launch’s contracts just now'),
    h('ul', { class: 'qtb-list qtr-facts' }, ...f.facts.filter(x => x.k !== 'Liquidity').map(x => h('li', { class: x.tone }, h('b', {}, x.k), h('span', {}, x.v))))) : null;
  el.replaceChildren(...[creator, copy, verdictBlock(v), facts].filter(Boolean));
}

// ---- The terminal's risk banner for a QHooks launch ----
/** Fills the ticket's banner: copy warning first, then RepoProof's verdict, then the facts that matter at the moment of trading. */
export async function renderRisk(el, pool) {
  const key = keyOf(pool.chainId, pool.controller); el.dataset.key = key;
  const [t, v, f] = await Promise.all([trustOf(pool.chainId, pool.controller), verdictOf(pool.chainId, pool.controller), factsOf(pool).catch(() => null)]);
  if (el.dataset.key !== key) return;
  const level = t?.copyOf ? 'danger' : v?.level === 'danger' ? 'danger' : v?.level === 'caution' || f?.recovery ? 'caution' : v?.level === 'clear' ? 'ok' : '';
  const title = t?.copyOf ? 'Copy warning: same ' + t.copyOf.same + ' as $' + t.copyOf.symbol + ' by @' + t.copyOf.handle
    : v?.level === 'danger' ? 'RepoProof: ' + v.headline : v?.level === 'caution' ? 'Trade with care: ' + v.headline : v?.level === 'clear' ? 'RepoProof found no red flags' : 'Pre-buy check unavailable';
  const lines = [];
  if (t?.verified) lines.push(h('li', {}, 'Creator verified on X: ', badge(t.verified, { compact: true })));
  else lines.push(h('li', {}, 'Creator not verified on X'));
  for (const c of (v?.checks || []).filter(c => c.status === 'danger' || c.status === 'caution').slice(0, 2)) lines.push(h('li', {}, c.title));
  if (f) {
    lines.push(h('li', {}, 'Liquidity permanent' + (f.buyBps != null ? ' · buy pays ' + pct(f.buyBps) + ', sell pays ' + pct(f.sellBps) : '')));
    if (f.recovery) lines.push(h('li', {}, 'A creator key recovery is under way'));
  }
  el.className = 'qxt-risk ' + level;
  el.replaceChildren(h('b', {}, title), h('ul', {}, ...lines.filter(Boolean)),
    h('a', { href: v?.url || 'https://repoproof.online/proof#q=' + encodeURIComponent('https://qhooks.com/l/' + pool.chainId + '/' + pool.controller), target: '_blank', rel: 'noopener' }, v?.url && v.level ? 'Evidence on RepoProof ↗' : 'Full check on RepoProof ↗'));
  el.hidden = false;
}
