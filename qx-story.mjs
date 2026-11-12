// Launch story: token page + metadata, campaign plan and avatar family, built from the real launch recipe or trade link.
// Reads only this browser's saved drafts and what the person pastes or imports. No wallet, no network writes.
import {hiddenChainsOn} from './chains.mjs';
const $ = id => document.getElementById(id);
const CHAINS = [
 {id: '8453', name: 'Base', slug: 'base', quote: 'USDC', native: 'ETH', explorer: 'https://basescan.org'},
 {id: '4663', name: 'Robinhood Chain', slug: 'robinhood', quote: 'WETH', native: 'ETH', explorer: 'https://robinhoodchain.blockscout.com'},
 {id: '1', name: 'Ethereum', slug: 'ethereum', quote: 'USDC', native: 'ETH', explorer: 'https://etherscan.io'},
 {id: '42161', name: 'Arbitrum One', slug: 'arbitrum', quote: 'USDC', native: 'ETH', explorer: 'https://arbiscan.io'},
 {id: '56', name: 'BNB Chain', slug: 'bnb', quote: 'WBNB', native: 'BNB', explorer: 'https://bscscan.com'},
 {id: '5042', name: 'Arc', slug: 'arc', quote: 'USDC', native: 'USDC', explorer: 'https://explorer.arc.io'},
 {id: '99801', name: 'Elysium Testnet', slug: 'elysium', quote: 'WHYPE', native: 'HYPE', explorer: 'https://explorer-elysium-testnet.t.conduit.xyz'},
];
const chainOf = id => CHAINS.find(c => c.id === String(id)) || CHAINS[0];
const store = (() => { try { return window.localStorage; } catch { return null; } })();
const session = (() => { try { return window.sessionStorage; } catch { return null; } })();
const KEY = 'qhooks:story:v1';
const saved = (() => { try { return JSON.parse(store?.getItem(KEY) || '{}'); } catch { return {}; } })();
const persist = () => { try { store?.setItem(KEY, JSON.stringify(state.ui)); } catch {} };

const state = {launch: null, deployed: null, ui: Object.assign({tagline: '', desc: '', site: '', x: '', tg: '', perks: ['fees', 'graduate', 'notice'], time: '', voice: 'builder', seed: '', size: 48, avatar: null}, saved)};

// ---------- launch source ----------
const pct = ppm => (Number(ppm) / 10000).toLocaleString(undefined, {maximumFractionDigits: 2}) + '%';
const units = (raw, dec = 18) => { try { const v = BigInt(raw), d = 10n ** BigInt(dec); const w = v / d; return w.toLocaleString(); } catch { return String(raw); } };
function readRecipe(text) {
 const j = JSON.parse(text); const f = j.fields || j.launch?.fields || j.tokenFields || j;
 if (!f || typeof f.tokenName !== 'string' || typeof f.symbol !== 'string') throw Error('That file is not a QHooks launch recipe.');
 return {chainId: String(j.chainId || j.launch?.chainId || $('st-chain').value), fields: f};
}
function fromStorage(chainId) {
 for (const [s, k] of [[session, 'qhooks:journey-draft:v1:' + chainId], [store, 'qhooks:lab:graduation-recipe:v1:' + chainId]]) {
  try { const t = s?.getItem(k); if (t) return readRecipe(t); } catch {}
 }
 return null;
}
function fromLink(link) {
 const i = link.indexOf('#pool='); if (i < 0) throw Error('Paste the trade link Studio gave you after launch.');
 const p = JSON.parse(decodeURIComponent(link.slice(i + 6)));
 if (p.kind !== 'qhooks-trade-pool' || !p.constructor || !p.tokenFields) throw Error('That link is not a QHooks trade link.');
 const c = p.constructor, token = [c.currency0, c.currency1].find(a => a.toLowerCase() !== c.quote.toLowerCase());
 const draft = fromStorage(String(p.chainId)), same = draft && draft.fields.symbol === p.tokenFields.symbol && draft.fields.tokenName === p.tokenFields.tokenName;
 return {launch: {chainId: String(p.chainId), fields: {...(same ? draft.fields : {}), ...p.tokenFields, notice: p.tokenFields.notice ?? (same ? draft.fields.notice : c.notice)}}, deployed: {token, controller: p.controller, owner: c.owner, manager: c.manager, quote: c.quote, link: link.slice(i)}};
}
function setSource(text, ok = true) { $('st-source-text').textContent = text; $('st-chip').dataset.ok = String(ok); }

// ---------- token page ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const PERKS = {fees: 'Creator fees fund the roadmap, claimed with two keys', graduate: 'Liquidity graduates on a published rule', notice: 'Policy changes wait out a public notice period', gated: 'Holder-only access to tools or channels', drops: 'Avatar family drops for early holders'};
function facts() {
 const f = state.launch?.fields || {}, ch = chainOf(state.launch?.chainId || $('st-chain').value);
 const mode = {'0': 'At a ' + (f.threshold && f.threshold !== '0' ? f.threshold + ' ' + ch.quote : 'quote') + ' inflow target', '1': 'Owner-approved, two keys', '2': 'Stays in its source pool'}[String(f.graduationMode)] || 'Owner-approved, two keys';
 return [['Supply', f.totalSupply ? units(f.totalSupply, Number(f.decimals || 18)) : '—'], ['Opening liquidity', f.tokenAmount ? `${Number(f.tokenAmount).toLocaleString()} ${f.symbol || ''} + ${f.quoteAmount} ${ch.quote}` : '—'], ['Creator LP fee', f.lpFeePpm ? pct(f.lpFeePpm) : '—'], ['Graduation', mode], ['Policy notice', f.notice ? (Number(f.notice) / 3600 >= 24 ? Number(f.notice) / 86400 + ' day(s)' : Number(f.notice) / 3600 + ' hour(s)') : '—'], ['Chain', ch.name]];
}
function renderPage() {
 const f = state.launch?.fields || {}, ch = chainOf(state.launch?.chainId || $('st-chain').value), u = state.ui;
 $('tp-name').textContent = f.tokenName || 'Your token'; $('tp-sym').textContent = '$' + (f.symbol || 'TOKEN');
 $('tp-chain').innerHTML = `<img src="/chain-symbol-icons/${ch.slug}.svg" width="16" height="16" alt=""> ${esc(ch.name)}`;
 $('tp-tag').textContent = u.tagline || 'One line people repeat.'; $('tp-desc').textContent = u.desc || '';
 $('tp-facts').innerHTML = facts().filter(([, v]) => v !== '—').map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
 $('tp-protected').innerHTML = ['Creator-fee withdrawals', 'Liquidity graduation', 'Policy changes'].map(x => `<li>${x}</li>`).join('');
 $('tp-perks').innerHTML = u.perks.map(p => `<li>${esc(PERKS[p])}</li>`).join('');
 const links = [u.site && ['Website', u.site], u.x && ['X', 'https://x.com/' + u.x.replace(/^@/, '')], u.tg && ['Telegram', u.tg], state.deployed && ['Trade', '/trade' + state.deployed.link]].filter(Boolean);
 $('tp-links').innerHTML = links.map(([k, h]) => `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${esc(k)} ↗</a>`).join('');
 const d = state.deployed;
 $('tp-addr').innerHTML = d ? `<span>Token <a href="${ch.explorer}/address/${d.token}" target="_blank" rel="noopener noreferrer"><code>${d.token.slice(0, 6)}…${d.token.slice(-4)}</code></a></span><span>Controller <a href="${ch.explorer}/address/${d.controller}" target="_blank" rel="noopener noreferrer"><code>${d.controller.slice(0, 6)}…${d.controller.slice(-4)}</code></a></span>` : '<span>Addresses appear here after launch. Paste your trade link above.</span>';
 $('tp-avatar').innerHTML = u.avatar ? specimenSvg(u.avatar.seed, u.avatar.index).svg : specimenSvg(seedFor(), 0).svg;
}
function metadata() {
 const f = state.launch?.fields || {}, ch = chainOf(state.launch?.chainId || $('st-chain').value), u = state.ui, d = state.deployed;
 const img = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent((u.avatar ? specimenSvg(u.avatar.seed, u.avatar.index) : specimenSvg(seedFor(), 0)).svg)));
 return {schemaVersion: 1, kind: 'qhooks-token-metadata', chainId: Number(ch.id), address: d?.token || null, name: f.tokenName || '', symbol: f.symbol || '', decimals: Number(f.decimals || 18), description: u.desc, tagline: u.tagline, image: img,
  links: {website: u.site || null, x: u.x ? 'https://x.com/' + u.x.replace(/^@/, '') : null, telegram: u.tg || null, trade: d ? 'https://qhooks.com/trade' + d.link : null},
  pool: {controller: d?.controller || null, quote: ch.quote, creatorLpFee: f.lpFeePpm ? pct(f.lpFeePpm) : null, graduationMode: f.graduationMode ?? null, noticeSeconds: f.notice ? Number(f.notice) : null, protectedActions: ['fees', 'graduation', 'policy'], authorization: 'wallet + post-quantum (SLH-DSA-SHA2-128s)'},
  holderPerks: u.perks.map(p => PERKS[p]), status: d ? 'launched' : 'draft'};
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 500); }

// ---------- campaign ----------
const nowPlus = h => { const d = new Date(Date.now() + h * 3600e3); d.setUTCMinutes(0, 0, 0); return d.toISOString().slice(0, 16); };
function beats() {
 const f = state.launch?.fields || {}, ch = chainOf(state.launch?.chainId || $('st-chain').value), u = state.ui, sym = '$' + (f.symbol || 'TOKEN'), name = f.tokenName || 'our token';
 const t0 = new Date((u.time || nowPlus(24)) + ':00Z').getTime(), fee = f.lpFeePpm ? pct(f.lpFeePpm) : '1%';
 const grad = String(f.graduationMode) === '0' ? `when inflow hits ${f.threshold} ${ch.quote}` : String(f.graduationMode) === '2' ? 'never, it stays in its source pool' : 'only with the owner\'s two keys';
 const v = {
  builder: [`${name} (${sym}) launches on ${ch.name} in 24 hours. Uniswap v4 pool, ${fee} creator fee, and every money move needs a wallet key plus a post-quantum key.`, `${sym} is live on ${ch.name}. Pool's open, fees route to a two-key vault, and the graduation rule is public: it moves ${grad}. Trade it here:`, `Day one for ${sym}: first creator fees claimed with two keys, on chain, in the open. Next up is graduation, ${grad}.`],
  degen: [`${sym} on ${ch.name}. 24h. v4 pool, ${fee} fee, liquidity can't be pulled without two keys. Set alarms.`, `${sym} LIVE on ${ch.name}. LP locked behind wallet + quantum key. Graduates ${grad}. Aping is your call:`, `${sym} fees just got claimed with two keys, receipts on chain. Graduation ${grad}. Still early.`],
  calm: [`Tomorrow we open ${name} on ${ch.name}: a Uniswap v4 pool with a ${fee} creator fee and two-key protection on anything that moves funds.`, `${name} is open on ${ch.name}. The rules are fixed and public: fees go to a protected vault, and liquidity graduates ${grad}.`, `A first look at ${name}: fees claimed in the open with both keys. Graduation remains ${grad}.`],
 }[u.voice] || [];
 return [{label: 'Teaser', at: t0 - 24 * 3600e3, text: v[0]}, {label: 'Launch', at: t0, text: v[1] + (state.deployed ? ' qhooks.com/trade' : '')}, {label: 'Day one', at: t0 + 24 * 3600e3, text: v[2]}].map(b => ({...b, text: b.text.replace(/—/g, ',')}));
}
const fmt = ms => new Date(ms).toUTCString().replace(':00 GMT', ' UTC').slice(5);
function renderCampaign() {
 const bs = beats(), min = bs[0].at, max = bs[bs.length - 1].at;
 $('cp-timeline').innerHTML = `<div class="cp-rail"><i></i></div>` + bs.map((b, i) => `<div class="cp-node" style="--x:${((b.at - min) / (max - min || 1) * 100).toFixed(2)}%"><b>${esc(b.label)}</b><span>${esc(fmt(b.at))}</span></div>`).join('');
 $('cp-beats').innerHTML = bs.map((b, i) => `<li class="cp-beat"><header><span class="cp-n">0${i + 1}</span><strong>${esc(b.label)}</strong><time>${esc(fmt(b.at))}</time></header><textarea data-beat="${i}" maxlength="280" rows="4">${esc(b.text)}</textarea><footer><span class="cp-count" data-count="${i}">${b.text.length}/280</span><button type="button" class="qx-link" data-copy="${i}">Copy post</button></footer></li>`).join('');
}

// ---------- avatar family (seeded, deterministic) ----------
function rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } let a = h >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const TRAITS = {
 Metal: [['Brass', 30, ['#e9c88f', '#a9844c']], ['Titanium', 30, ['#d8dde0', '#7d878d']], ['Copper', 18, ['#f0a37a', '#9a5a3a']], ['Gold', 12, ['#ffe08a', '#c8962d']], ['Obsidian', 10, ['#b7b2c9', '#4a4658']]],
 Field: [['Moss', 34, ['#1d2a22', '#0b100d']], ['Night', 30, ['#141a2a', '#070910']], ['Ember', 20, ['#2e1712', '#0f0806']], ['Bone', 16, ['#e8e1d0', '#b9ae96']]],
 Form: [['Hook', 40], ['Twin hook', 22], ['Spiral', 22], ['Anchor', 16]],
 Core: [['Lattice', 35], ['Chain', 30], ['Seal', 20], ['Prism', 15]],
 Aura: [['None', 50], ['Halo', 30], ['Shards', 20]],
};
function pick(r, list) { const total = list.reduce((s, x) => s + x[1], 0); let n = r() * total; for (const x of list) { if ((n -= x[1]) < 0) return x; } return list[0]; }
function specimen(seed, index) { const r = rng(seed + '#' + index); const t = Object.fromEntries(Object.entries(TRAITS).map(([k, list]) => [k, pick(r, list)])); return {index, traits: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v[0]])), raw: t, r}; }
let svgSerial = 0;
function specimenSvg(seed, index) {
 const s = specimen(seed, index), [m1, m2] = s.raw.Metal[2], [f1, f2] = s.raw.Field[2], r = s.r, id = 'g' + index + '_' + (++svgSerial);
 const rot = Math.floor(r() * 50 - 25), form = s.traits.Form, core = s.traits.Core, aura = s.traits.Aura;
 const hookPath = 'M60 22 v46 a22 22 0 1 1 -38 -15 l-6 -8 m6 8 l9 -3';
 const forms = {Hook: `<path d="${hookPath}" />`, 'Twin hook': `<path d="${hookPath}" /><path d="M70 30 v34 a16 16 0 1 0 22 -12 l5 -6" opacity=".75"/>`, Spiral: `<path d="M60 60 m-4 0 a4 4 0 1 1 8 0 a10 10 0 1 1 -20 0 a16 16 0 1 1 32 0 a22 22 0 1 1 -44 0 a28 28 0 1 1 56 0"/>`, Anchor: `<path d="M60 22 v62 M42 40 h36 M30 66 a30 30 0 0 0 60 0 M24 64 l6 2 l2 -6 M96 64 l-6 2 l-2 -6"/><circle cx="60" cy="20" r="5"/>`};
 const cores = {Lattice: Array.from({length: 7}, (_, i) => `<circle cx="${60 + 13 * Math.cos(i * 0.9)}" cy="${62 + 13 * Math.sin(i * 0.9)}" r="2.2" fill="url(#m${id})" stroke="none"/>`).join(''), Chain: Array.from({length: 5}, (_, i) => `<rect x="${51 + (i % 2) * 6}" y="${36 + i * 9}" width="10" height="7" rx="3.5" />`).join(''), Seal: `<circle cx="60" cy="62" r="11"/><path d="M54 62 l4 4 l8 -9"/>`, Prism: `<path d="M60 47 l13 22 h-26 z"/><path d="M60 47 v22"/>`};
 const auras = {None: '', Halo: `<circle cx="60" cy="60" r="52" fill="none" stroke="url(#m${id})" stroke-width="1" opacity=".6" stroke-dasharray="2 5"/>`, Shards: Array.from({length: 6}, (_, i) => { const a = i * 1.047 + r(); return `<path d="M${60 + 50 * Math.cos(a)} ${60 + 50 * Math.sin(a)} l4 -9 l4 9 z" fill="url(#m${id})" stroke="none" opacity=".8"/>`; }).join('')};
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${esc(form)} specimen ${index + 1}"><defs><radialGradient id="f${id}" cx="35%" cy="30%"><stop offset="0" stop-color="${f1}"/><stop offset="1" stop-color="${f2}"/></radialGradient><linearGradient id="m${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m1}"/><stop offset=".55" stop-color="${m2}"/><stop offset="1" stop-color="${m1}"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="url(#f${id})"/>${auras[aura]}<g transform="rotate(${rot} 60 60)" fill="none" stroke="url(#m${id})" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${forms[form]}</g><g fill="none" stroke="url(#m${id})" stroke-width="1.6" stroke-linecap="round">${cores[core]}</g></svg>`;
 return {svg, traits: s.traits};
}
const seedFor = () => state.ui.seed || ((state.launch?.fields?.symbol || 'QHOOKS') + '-' + (state.launch?.chainId || '8453'));
function renderFamily() {
 const seed = seedFor(), n = Number(state.ui.size) || 48; $('fm-seed').value = seed;
 const family = Array.from({length: n}, (_, i) => ({i, ...specimenSvg(seed, i)}));
 const counts = {}; for (const s of family) for (const [k, v] of Object.entries(s.traits)) { counts[k] ??= {}; counts[k][v] = (counts[k][v] || 0) + 1; }
 const rarity = s => Object.entries(s.traits).reduce((sum, [k, v]) => sum + n / counts[k][v], 0);
 const ranked = family.map(s => ({...s, score: rarity(s)})).sort((a, b) => b.score - a.score).map((s, rank) => [s.i, rank + 1]); const rankOf = Object.fromEntries(ranked);
 $('fm-grid').innerHTML = family.map(s => `<button type="button" role="option" class="fm-cell" data-i="${s.i}" aria-selected="${state.ui.avatar?.seed === seed && state.ui.avatar?.index === s.i}" style="--d:${(s.i % 24) * 22}ms">${s.svg}<span>#${s.i + 1}</span></button>`).join('');
 $('fm-freq').innerHTML = Object.entries(counts).map(([k, vals]) => `<div class="fm-trait"><h3>${esc(k)}</h3>${Object.entries(vals).sort((a, b) => b[1] - a[1]).map(([v, c]) => `<p><span>${esc(v)}</span><i style="--w:${(c / n * 100).toFixed(1)}%"></i><b>${c}</b></p>`).join('')}</div>`).join('');
 const inspect = i => { const s = family[i]; $('fm-inspect').innerHTML = `<div class="fm-big">${s.svg}</div><h3>Specimen #${i + 1}</h3><p class="fm-rank">Rarity rank ${rankOf[i]} of ${n}</p><dl>${Object.entries(s.traits).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)} <small>${(counts[k][v] / n * 100).toFixed(0)}%</small></dd></div>`).join('')}</dl><button type="button" class="qx-btn qx-btn-primary" data-use="${i}">Use as token avatar<span class="qx-btn-dot" aria-hidden="true">→</span></button>`; };
 inspect(state.ui.avatar?.seed === seed ? state.ui.avatar.index : 0);
 $('fm-grid').onclick = e => { const b = e.target.closest('.fm-cell'); if (b) inspect(Number(b.dataset.i)); };
 $('fm-inspect').onclick = e => { const b = e.target.closest('[data-use]'); if (!b) return; state.ui.avatar = {seed, index: Number(b.dataset.use)}; persist(); renderFamily(); renderPage(); $('fm-inspect').querySelector('.fm-rank').textContent += ' · now your avatar'; };
 state.family = {seed, size: n, specimens: family.map(s => ({index: s.i, traits: s.traits, rarityRank: rankOf[s.i]}))};
}

// ---------- wiring ----------
function load() {
 const chainId = $('st-chain').value, found = fromStorage(chainId);
 if (found) { state.launch = found; setSource(`${found.fields.tokenName} ($${found.fields.symbol}) · draft from Studio · ${chainOf(found.chainId).name}`); }
 else if (!state.deployed) { state.launch = null; setSource('No Studio draft for this chain yet. Import a recipe, paste a trade link, or start in Studio.', false); }
 renderAll();
}
function renderAll() { renderPage(); renderCampaign(); renderFamily(); }
const selectableChains = CHAINS.filter(c => c.id !== '99801' || hiddenChainsOn());
$('st-chain').innerHTML = selectableChains.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
const qsChain = new URLSearchParams(location.search).get('chain'); if (qsChain && selectableChains.some(c => c.id === qsChain)) $('st-chain').value = qsChain;
$('st-chain').addEventListener('change', load);
$('st-recipe').addEventListener('change', async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 20000) throw Error('Recipe file is too large.'); state.launch = readRecipe(await file.text()); $('st-chain').value = state.launch.chainId; setSource(`${state.launch.fields.tokenName} ($${state.launch.fields.symbol}) · imported recipe`); renderAll(); } catch (err) { setSource(err.message, false); } });
$('st-link').addEventListener('change', e => { try { const r = fromLink(e.target.value.trim()); state.launch = r.launch; state.deployed = r.deployed; $('st-chain').value = r.launch.chainId; setSource(`${r.launch.fields.tokenName} ($${r.launch.fields.symbol}) · launched on ${chainOf(r.launch.chainId).name}`); renderAll(); } catch (err) { setSource(err.message, false); } });
const bindField = (id, key) => { const el = $(id); el.value = state.ui[key] || ''; el.addEventListener('input', () => { state.ui[key] = el.value.trim(); persist(); renderPage(); }); };
bindField('pg-tagline', 'tagline'); bindField('pg-desc', 'desc'); bindField('pg-site', 'site'); bindField('pg-x', 'x'); bindField('pg-tg', 'tg');
document.querySelectorAll('.st-perks input').forEach(cb => { cb.checked = state.ui.perks.includes(cb.value); cb.addEventListener('change', () => { state.ui.perks = [...document.querySelectorAll('.st-perks input:checked')].map(x => x.value); persist(); renderPage(); }); });
$('pg-meta').addEventListener('click', () => { const m = metadata(); download(`${(m.symbol || 'token').toLowerCase()}-metadata.json`, JSON.stringify(m, null, 2) + '\n', 'application/json'); $('pg-status').textContent = m.address ? 'Metadata downloaded with your deployed token address.' : 'Draft metadata downloaded. Paste your trade link after launch to bind the real address.'; });
$('pg-html').addEventListener('click', () => { const m = metadata(); const css = [...document.styleSheets].filter(s => /qx-(site|story)|\/qx-a\/(tokens|components)\.css|home-launch-story/.test(s.href || '')).map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n'); download(`${(m.symbol || 'token').toLowerCase()}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.name)} ($${esc(m.symbol)})</title><meta name="description" content="${esc(m.tagline || m.description)}"><style>${css}body{padding:40px 16px;background:#0c100e}</style></head><body class="qx qa hd">${$('tp').outerHTML}</body></html>`, 'text/html'); $('pg-status').textContent = 'Standalone page downloaded. Host it anywhere.'; });
$('cp-time').value = state.ui.time || nowPlus(24); $('cp-voice').value = state.ui.voice;
$('cp-time').addEventListener('change', () => { state.ui.time = $('cp-time').value; persist(); renderCampaign(); });
$('cp-voice').addEventListener('change', () => { state.ui.voice = $('cp-voice').value; persist(); renderCampaign(); });
$('cp-beats').addEventListener('input', e => { const i = e.target.dataset.beat; if (i !== undefined) document.querySelector(`[data-count="${i}"]`).textContent = e.target.value.length + '/280'; });
$('cp-beats').addEventListener('click', async e => { const i = e.target.dataset.copy; if (i === undefined) return; try { await navigator.clipboard.writeText(document.querySelector(`[data-beat="${i}"]`).value); e.target.textContent = 'Copied'; setTimeout(() => e.target.textContent = 'Copy post', 1500); } catch { e.target.textContent = 'Copy blocked'; } });
const plan = () => beats().map((b, i) => ({...b, at: new Date(b.at).toISOString(), text: document.querySelector(`[data-beat="${i}"]`)?.value || b.text}));
$('cp-json').addEventListener('click', () => download('campaign-plan.json', JSON.stringify({schemaVersion: 1, kind: 'qhooks-campaign-plan', token: state.launch?.fields?.symbol || null, chainId: state.launch?.chainId || $('st-chain').value, beats: plan()}, null, 2) + '\n', 'application/json'));
$('cp-ics').addEventListener('click', () => { const z = d => d.replace(/[-:]/g, '').replace(/\.\d+/, ''); download('campaign.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QHooks//Campaign//EN', ...plan().flatMap((b, i) => ['BEGIN:VEVENT', `UID:${i}-${z(b.at)}@qhooks.com`, `DTSTAMP:${z(new Date().toISOString())}`, `DTSTART:${z(b.at)}`, `SUMMARY:${b.label}: post on X`, `DESCRIPTION:${b.text.replace(/\n/g, ' ').replace(/[,;]/g, m => '\\' + m)}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n'), 'text/calendar'); });
$('fm-seed').addEventListener('change', () => { state.ui.seed = $('fm-seed').value.trim(); persist(); renderFamily(); renderPage(); });
$('fm-size').value = String(state.ui.size); $('fm-size').addEventListener('change', () => { state.ui.size = Number($('fm-size').value); persist(); renderFamily(); });
$('fm-reroll').addEventListener('click', () => { state.ui.seed = (state.launch?.fields?.symbol || 'Q') + '-' + Math.random().toString(36).slice(2, 8); persist(); renderFamily(); renderPage(); });
$('fm-export').addEventListener('click', () => download('avatar-family.json', JSON.stringify({schemaVersion: 1, kind: 'qhooks-avatar-family', ...state.family, avatar: state.ui.avatar}, null, 2) + '\n', 'application/json'));
for (const t of document.querySelectorAll('.st-tabs [role=tab]')) t.addEventListener('click', () => { for (const o of document.querySelectorAll('.st-tabs [role=tab]')) { o.setAttribute('aria-selected', String(o === t)); $(o.getAttribute('aria-controls')).hidden = o !== t; } });
load();
const tabFor = {'#page': 'tab-page', '#campaign': 'tab-campaign', '#family': 'tab-family'}[location.hash];
if (tabFor) $(tabFor).click();
if (location.hash.startsWith('#trade=')) { const l = decodeURIComponent(location.hash.slice(7)); $('st-link').value = location.origin + l; $('st-link').dispatchEvent(new Event('change')); }
