// QCaster core (pure, no I/O): the launch-idea catalog as QCaster sees it, plain facts per idea, the Design validator
// and the "Review in Create" link. Everything is read from Create's own sources (qx-quick-launch-core ideaCards, the
// block catalog presets, chains.mjs, qx-launch-prefill) so QCaster can only ever propose what Create offers.
// The model only extracts what the person asked for (each want quoted from their words); picking the idea is done
// here, over the real cards, and the existing assisted-language vetoes still apply.
import {QCASTER} from './qcaster-name.mjs';
import {chainById, visibleChains} from './chains.mjs';
import {ideaCards, startCapFactory, pqFactory, multiLive, pairsLive} from './qx-quick-launch-core.mjs';
import {PRESETS} from './qx-block-catalog.mjs';
import {launchLink} from './qx-launch-prefill.mjs';
import {explicitVetoes, validateLanguageRequest} from './qx-assisted-language.mjs';

export {QCASTER};
const ensure = (ok, message) => { if (!ok) throw new TypeError(message); };

export const SALE_FIRST = Object.freeze({id: 'sale-first', group: 'kits', name: 'Sale first', style: 'sale',
 what: 'A fair sale before trading opens, at a fixed or falling price. Under the minimum, everyone gets a full refund.',
 why: 'Everyone pays the same price, so there is nothing to snipe, and the pool opens with the money raised on both sides.', blocks: []});
export const SOLANA_IDEA = Object.freeze({id: 'dbc', group: 'tokens', name: 'Solana bonding curve', style: 'dbc',
 what: 'A fixed one-billion-supply coin on a Meteora bonding curve. Trading fee 1.2% per trade. Anti-snipe starts at 50% and falls to 1.2% over the first 60 seconds.',
 why: 'At 85 SOL the coin moves to a Meteora DAMM v2 pool and that liquidity is locked forever.', blocks: []});

/// Chains where Create has one-tap ideas (plus Solana's single bonding-curve launch).
export function designChains() {
 return [...visibleChains(false).filter(c => ideaCards(c.id).length).map(c => ({id: c.id, name: c.name})), {id: 'solana', name: 'Solana'}];
}
const saleOn = id => /^0x[0-9a-f]{40}$/i.test(chainById(id)?.saleLaunch?.address || '');
/// Every idea Create offers on a chain, in Create's own order, with Sale first after the kits.
export function ideasFor(chainId) {
 const id = String(chainId);
 if (id === 'solana') return [SOLANA_IDEA];
 const cards = ideaCards(id).map(c => ({id: c.id, group: c.group, name: c.name, style: c.style, kit: c.kit || null, snipe: c.snipe, what: c.what, why: c.why, blocks: c.blocks.map(b => ({id: b.id, name: b.name}))}));
 if (!saleOn(id)) return cards;
 const at = cards.findLastIndex(c => c.group === 'kits') + 1;
 return [...cards.slice(0, at), {...SALE_FIRST}, ...cards.slice(at)];
}
export const ideaHref = (chainId, ideaId) => String(chainId) === 'solana' ? '/create?chain=solana' : ideaId === 'sale-first' ? '/create?chain=' + chainId + '#qsf-root' : '/create?chain=' + chainId + '#quick-' + ideaId;

// ---- Facts: what each idea really does, as numbers the validator can check ----
export const FACT_FIELDS = Object.freeze(['openingProtection', 'guardSeconds', 'buyTaxPercent', 'sellTaxPercent', 'burn', 'buyback', 'sandwich', 'walletCap', 'growingLiquidity', 'floor', 'holderRewards', 'sale', 'flipPenalty', 'pots']);
export const FACT_LABELS = Object.freeze({openingProtection: 'anti-snipe at the open', guardSeconds: 'anti-snipe window (seconds)', buyTaxPercent: 'buy tax %', sellTaxPercent: 'sell tax %',
 burn: 'burns on trades', buyback: 'buybacks', sandwich: 'sandwich charge', walletCap: 'wallet cap at the open', growingLiquidity: 'liquidity that grows from fees', floor: 'a rising floor (buy wall)',
 holderRewards: 'income for holders or stakers', sale: 'a fair sale before trading', flipPenalty: 'quick flips pay more', pots: 'pots and games'});
export function ideaFacts(idea) {
 const blocks = new Set((idea.blocks || []).map(b => b.id)), preset = PRESETS.find(p => p.id === idea.style), set = preset?.set || {};
 const tax = side => blocks.has('tax') ? Number(set[side + 'TaxBps'] ?? 0) : 0;
 if (idea.id === 'dbc') return {openingProtection: 1, guardSeconds: 60, buyTaxPercent: 0, sellTaxPercent: 0, burn: 0, buyback: 0, sandwich: 0, walletCap: 0, growingLiquidity: 0, floor: 0, holderRewards: 0, sale: 0, flipPenalty: 0, pots: 0};
 return {
  openingProtection: blocks.has('antiSnipe') || idea.id === 'sale-first' ? 1 : 0,
  guardSeconds: blocks.has('antiSnipe') ? Number(idea.snipe) || 0 : 0,
  buyTaxPercent: tax('buy'), sellTaxPercent: tax('sell'),
  burn: blocks.has('autoBurn') || idea.id === 'arb-burns' ? 1 : 0, buyback: blocks.has('buyback') || idea.id === 'arb-burns' ? 1 : 0,
  sandwich: blocks.has('sandwich') ? 1 : 0, walletCap: blocks.has('walletCap') ? 1 : 0,
  growingLiquidity: idea.kit === 'range' ? 1 : 0, floor: idea.kit === 'floor' ? 1 : 0,
  holderRewards: idea.style === 'flywheel' ? 1 : 0, sale: idea.id === 'sale-first' ? 1 : 0,
  flipPenalty: blocks.has('exitClock') ? 1 : 0, pots: blocks.has('king') || blocks.has('clockPot') ? 1 : 0
 };
}

// ---- Chain words in the person's text (deterministic; the model may not move the chain elsewhere) ----
const CHAIN_WORDS = [['4663', /\b(robinhood|rh chain|on rh|rhc)\b/i], ['8453', /\bbase\b/i], ['56', /\b(bnb|bsc|binance)\b/i], ['42161', /\barbitrum\b/i],
 ['99901', /\belysium\b/i], ['1', /\b(ethereum|eth mainnet|mainnet)\b/i], ['143', /\bmonad\b/i], ['solana', /\b(solana|sol chain|on sol)\b/i]];
export function chainsInText(text) { return CHAIN_WORDS.filter(([, re]) => re.test(text)).map(([id]) => id); }
export const chainName = id => id === 'solana' ? 'Solana' : chainById(id)?.name || id;

// ---- Search-only want extraction (used when the model is at today's limit, and as a cross-check) ----
const WANT_WORDS = [
 ['openingProtection', /\b(anti[- ]?snip\w*|snip\w+|bots?|bundl\w+|fair (?:launch|start)|protect\w*)\b/i],
 ['burn', /\bburn\w*\b/i], ['buyback', /\bbuy ?backs?\b/i],
 ['growingLiquidity', /\b(auto[- ]?range|liquidity that grows|growing liquidity|liquidity (?:grows|keeps growing)|range liquidity|bands?)\b/i],
 ['floor', /\b(rising floor|price floor|buy wall|bid wall|floor(?!\s+start))\b/i],
 ['holderRewards', /\b(stak\w+|holders? (?:earn|get paid|income|rewards?)|reward holders|real yield|dividends?)\b/i],
 ['sale', /\b(pre-?sale|presale|token sale|fair sale|sale first|raise)\b/i],
 ['flipPenalty', /\b(flip\w*|paper hands?|diamond hands?)\b/i], ['pots', /\b(pots?|king|last[- ]buyer|games?|arena)\b/i]
];
export function keywordWants(text) {
 const t = String(text || ''), wants = [];
 for (const [field, re] of WANT_WORDS) { const m = re.exec(t); if (m && !new RegExp('\\b(no|without|not)\\s+(?:\\w+\\s+){0,2}' + m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t)) wants.push({field, op: 'eq', value: 1, quote: m[0]}); }
 if (/\b(no|zero|without)\s+(?:buy\s*(?:and|or|\/)\s*sell\s+|ongoing\s+)?tax(?:es)?\b/i.test(t)) wants.push({field: 'buyTaxPercent', op: 'eq', value: 0, quote: /\b(no|zero|without)\s+(?:buy\s*(?:and|or|\/)\s*sell\s+|ongoing\s+)?tax(?:es)?\b/i.exec(t)[0]}, {field: 'sellTaxPercent', op: 'eq', value: 0, quote: /\b(no|zero|without)\s+(?:buy\s*(?:and|or|\/)\s*sell\s+|ongoing\s+)?tax(?:es)?\b/i.exec(t)[0]});
 if (/\bbundl\w+/i.test(t)) wants.push({field: 'guardSeconds', op: 'gte', value: 300, quote: /\bbundl\w+/i.exec(t)[0]});
 return wants;
}
export function startInText(text) {
 const t = String(text || '').toLowerCase();
 if (/\$?\s?50\s?k\b|50,000|fifty thousand/.test(t)) return 'high';
 if (/\$?\s?20\s?k\b|20,000|twenty thousand/.test(t)) return 'floor';
 return null;
}

// ---- The Design contract the model fills (JSON). It cannot name hooks, fees, contracts or amounts. ----
export const DESIGN_SCHEMA = Object.freeze({type: 'object', required: ['outcome', 'chainId', 'ideaId', 'start', 'wants', 'question'], properties: {
 outcome: {enum: ['design', 'clarify', 'unsupported']}, chainId: {type: 'string'}, ideaId: {type: ['string', 'null']}, start: {enum: ['standard', 'floor', 'high', null]},
 wants: {type: 'array', maxItems: 10, items: {type: 'object', required: ['field', 'op', 'value', 'quote'], properties: {field: {enum: FACT_FIELDS}, op: {enum: ['eq', 'gte', 'lte']}, value: {type: 'number'}, quote: {type: 'string'}}}},
 question: {type: 'string'}}});

const satisfies = (facts, w) => { const a = facts[w.field]; return w.op === 'eq' ? a === w.value : w.op === 'gte' ? a >= w.value : a <= w.value; };
/// Drop wants that don't quote the person's own words, or use fields/ops the facts don't have.
export function cleanWants(raw, text) {
 const out = [], seen = new Set();
 for (const w of Array.isArray(raw) ? raw.slice(0, 10) : []) {
  if (!w || typeof w !== 'object' || !FACT_FIELDS.includes(w.field) || !['eq', 'gte', 'lte'].includes(w.op) || typeof w.value !== 'number' || !Number.isFinite(w.value)) continue;
  if (typeof w.quote !== 'string' || !w.quote.trim() || w.quote.length > 200 || !text.toLowerCase().includes(w.quote.trim().toLowerCase())) continue;
  const key = w.field + w.op + w.value; if (seen.has(key)) continue; seen.add(key);
  out.push({field: w.field, op: w.op, value: w.value, quote: w.quote.trim()});
 }
 return out;
}
/// The assisted-language vetoes (no tax / no sandwich charge / no fees), mapped onto the idea facts.
function vetoWants(text) {
 const out = [];
 for (const v of explicitVetoes(text)) {
  if (v.field === 'buyTaxPercent' || v.field === 'sellTaxPercent') out.push({field: v.field, op: 'eq', value: 0, quote: 'no tax'});
  else if (v.field === 'sandwichMaxPercent') out.push({field: 'sandwich', op: 'eq', value: 0, quote: 'no sandwich charge'});
  else if (v.field === 'poolFeePercent') out.push({field: 'poolFee', op: 'eq', value: 0, quote: 'no fees'});
 }
 return out;
}

/// Validates a Design proposal against Create's real ideas. Returns a plain, reviewable plan or a question.
/// The idea is picked here: every want must hold for the idea's real facts; the model's pick only breaks ties.
export function planDesign({text, chainId = null, proposal = null, source = 'model'}) {
 ensure(typeof text === 'string' && text.isWellFormed() && text.trim().length >= 3 && text.length <= 1600, 'Describe your launch in 3–1600 characters.');
 ensure(!/\b(?:private\s*key|seed\s*phrase|recovery\s*phrase|mnemonic|backup\s*passphrase)\b/i.test(text) && !/(?:^|\s)(?:0x)?[0-9a-f]{64}(?:$|\s)/i.test(text), 'Remove wallet secrets from this request. Describe only your launch.');
 const named = chainsInText(text), chains = designChains().map(c => c.id);
 let chain = named[0] || (chainId && chains.includes(String(chainId)) ? String(chainId) : null) || (proposal?.chainId && chains.includes(String(proposal.chainId)) ? String(proposal.chainId) : null) || '4663';
 if (named.length > 1) return {outcome: 'clarify', chainId: chain, question: 'Which chain should it launch on: ' + named.map(chainName).join(' or ') + '?'};
 if (!chains.includes(chain)) return {outcome: 'unsupported', chainId: chain, question: 'One-tap launches are not on ' + chainName(chain) + ' yet. Pick Robinhood Chain, Base, BNB Chain, Arbitrum, Elysium or Solana.', alternatives: designChains()};
 if (chain !== 'solana') validateLanguageRequest({version: 1, text: text.trim(), chainId: chain});
 let wants = proposal ? cleanWants(proposal.wants, text) : [];
 for (const w of keywordWants(text)) if (!wants.some(x => x.field === w.field)) wants.push(w); // a plainly named want the model skipped still counts
 const vetoes = vetoWants(text);
 if (vetoes.some(v => v.field === 'poolFee')) return {outcome: 'unsupported', chainId: chain, question: 'Every launch pool has a trading fee, so a launch with no fees at all is not possible. The Plain token idea has no tax, caps or launch games.', wants};
 for (const v of vetoes) { wants = wants.filter(w => w.field !== v.field); wants.push(v); } // an explicit "no …" always wins
 const ideas = ideasFor(chain).map(i => ({idea: i, facts: ideaFacts(i)}));
 // The model's question is used only when nothing in the text names a want (and the chain has more than one idea).
 if (proposal && proposal.outcome === 'clarify' && typeof proposal.question === 'string' && proposal.question.trim() && !wants.length && ideas.length > 1) return {outcome: 'clarify', chainId: chain, question: proposal.question.trim().slice(0, 300)};
 const score = x => wants.filter(w => satisfies(x.facts, w)).length;
 const extras = x => FACT_FIELDS.filter(f => !['guardSeconds', 'buyTaxPercent', 'sellTaxPercent'].includes(f) && x.facts[f] && !wants.some(w => w.field === f)).length + (x.facts.buyTaxPercent > 0 && !wants.some(w => /TaxPercent/.test(w.field)) ? 1 : 0);
 const preferred = proposal?.ideaId ? String(proposal.ideaId) : null;
 const ranked = ideas.slice().sort((a, b) => score(b) - score(a) || (b.idea.id === preferred) - (a.idea.id === preferred) || extras(a) - extras(b));
 if (!wants.length && !preferred && ideas.length > 1) return {outcome: 'clarify', chainId: chain, question: 'What matters most for this launch: stopping snipers, burns, holder income, liquidity that grows, or a fair sale first?', wants};
 const best = ranked[0], full = score(best) === wants.length;
 const unmet = wants.filter(w => !satisfies(best.facts, w));
 const startable = chain !== 'solana' && best.idea.id !== 'sale-first' && !!startCapFactory(chain);
 const askedStart = startInText(text) || (proposal?.start && ['standard', 'floor', 'high'].includes(proposal.start) ? proposal.start : null);
 const start = startable ? askedStart || (chain === '99901' ? 'floor' : 'standard') : null;
 const pq = chain === 'solana' || best.idea.id === 'sale-first' ? null : (pqFactory(chain) || multiLive(chain) || pairsLive(chain) ? true : null);
 return {outcome: full ? 'design' : 'partial', chainId: chain, chainName: chainName(chain), idea: best.idea, facts: best.facts, wants, unmet, start, pq, source,
  alternatives: ranked.slice(1, 3).filter(x => score(x) > 0).map(x => ({id: x.idea.id, name: x.idea.name, href: ideaHref(chain, x.idea.id)})),
  link: designLink(chain, best.idea.id, start), studio: full ? null : '/qtoken-studio'};
}
/// The Create link. Same shape as the agent API's prepare_launch link (qx-launch-prefill launchLink); the person adds
/// name, ticker and image in Create, reviews and signs there.
export function designLink(chain, ideaId, start, {name, ticker} = {}) {
 if (chain !== 'solana' && ideaId !== 'sale-first' && name && ticker) {
  const full = new URL(launchLink({name, ticker, chain, style: ideaId}));
  if (start && start !== 'standard') full.searchParams.set('start', start);
  return full.pathname + full.search + full.hash;
 }
 const base = ideaHref(chain, ideaId);
 if (!start || start === 'standard' || chain === 'solana' || ideaId === 'sale-first') return base;
 const [p, h] = base.split('#'); return p + '&start=' + start + (h ? '#' + h : '');
}
export const START_LABEL = Object.freeze({standard: 'Standard start', floor: '$20K start', high: '$50K start'});
/// One plain summary of a validated design, no promises beyond the idea's own copy.
export function designSummary(plan) {
 if (!plan.idea) return plan.question || '';
 const lines = [plan.idea.name + ' on ' + plan.chainName + '.', plan.idea.what];
 if (plan.start) lines.push('Start: ' + START_LABEL[plan.start] + '.');
 if (plan.pq) lines.push('Post-quantum key: on. Changing where your fees go needs a second key.');
 if (plan.unmet?.length) lines.push('Not in this idea: ' + plan.unmet.map(w => FACT_LABELS[w.field] || w.field).join(', ') + '. For every rule, use Expert Studio.');
 return lines.join(' ');
}

// ---- Ideas: re-rank the real cards by a steer ("agents, stocks, snipers…"). Card content is never changed. ----
const STEER_WORDS = {snipe: ['snip', 'bot', 'bundl', 'fair', 'protect', 'whale'], burn: ['burn', 'deflat', 'supply'], hold: ['hold', 'stak', 'income', 'yield', 'reward', 'diamond', 'flip'],
 liquid: ['liquid', 'range', 'floor', 'wall', 'lp', 'pool'], sale: ['sale', 'presale', 'raise', 'ico', 'fair price'], game: ['game', 'pot', 'king', 'degen', 'arena', 'fun'],
 stock: ['stock', 'equity', 'market hour', 'session', 'robinhood', 'tsla', 'nvda'], agent: ['agent', 'ai', 'bot', 'autom', 'arb'], simple: ['simple', 'plain', 'meme', 'no tax', 'clean'], solana: ['solana', 'sol', 'meteora']};
const IDEA_TAGS = {'locked-pool': 'snipe liquid hold', 'auto-range': 'liquid snipe', 'bundle-shield': 'snipe', plain: 'simple', fair: 'snipe simple', 'fair-slow': 'snipe', hours: 'stock', burn: 'burn',
 community: 'hold', arena: 'game burn', stakers: 'hold snipe', 'arb-burns': 'agent burn liquid', 'sale-first': 'sale snipe', dbc: 'solana simple'};
export function rankIdeas(ideas, steer) {
 const s = String(steer || '').toLowerCase().slice(0, 200);
 if (!s.trim()) return ideas.map(i => ({...i, match: 0}));
 const topics = Object.entries(STEER_WORDS).filter(([, ws]) => ws.some(w => s.includes(w))).map(([k]) => k);
 const words = s.split(/[^a-z0-9]+/).filter(w => w.length > 2);
 const scored = ideas.map((i, n) => {
  const tags = (IDEA_TAGS[i.id] || '').split(' '), body = (i.name + ' ' + i.what + ' ' + i.why + ' ' + (i.blocks || []).map(b => b.name).join(' ')).toLowerCase();
  const match = topics.reduce((a, t) => a + (tags[0] === t ? 3 : tags.includes(t) ? 2 : 0), 0) + words.reduce((a, w) => a + (body.includes(w) ? 1 : 0), 0);
  return {...i, match, n};
 });
 return scored.sort((a, b) => b.match - a.match || a.n - b.n).map(({n, ...i}) => i);
}
