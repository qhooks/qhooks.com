import {discoveryCoverage} from './qx-discover-coverage.mjs';
import {LIVE} from './chains.mjs';
import {inspectorProfileMatches,mountInspectorRepoProof} from './qx-discover-repoproof.mjs';
// Shared Discover formatting, deterministic layout and same-origin page controllers.
import {projectSummary, projectLabURL} from './qx-discover-projects.mjs';
import {mountHookChanges, mountRecentChanges, renderTapeStatusCards, upgradeableLabel} from './qx-discover-monitor.mjs';
export const API = '/api/v1/hooks';
export const PERMISSIONS = Object.freeze(['beforeInitialize', 'afterInitialize', 'beforeAddLiquidity', 'afterAddLiquidity', 'beforeRemoveLiquidity', 'afterRemoveLiquidity', 'beforeSwap', 'afterSwap', 'beforeDonate', 'afterDonate', 'beforeSwapReturnDelta', 'afterSwapReturnDelta', 'afterAddLiquidityReturnDelta', 'afterRemoveLiquidityReturnDelta']);
export const CHAIN_NAMES = Object.freeze(Object.fromEntries(LIVE.map(c=>[c.id,c.name])));
export function addDiscoveryChains(select, option=(name,id)=>new Option(name,id)) {
  if(!select)return;
  for(const [id,name] of Object.entries(CHAIN_NAMES))if(![...select.options].some(o=>o.value===id))select.add(option(name,id));
}
export const GROUPS = Object.freeze(['Swap amounts', 'Swap callbacks', 'Liquidity', 'Pool lifecycle', 'No permission bits']);
const COLORS = ['var(--qx-sage)','var(--qx-brass)','#9d9e96','#8ca5b1','#b3a0b8','#9d9e96'];
const chainColor = id => ({8453:0,4663:1,1:2,42161:3,56:4}[Number(id)] ?? 5);
const WATCH_KEY = 'qhooks.discover.watchlist.v1';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function parseHookHash(hash) {
  let text; try { text = decodeURIComponent(String(hash).replace(/^#/, '')); } catch { return null; }
  const m = /^([1-9]\d{0,14})[:_](0x[\da-f]{40})$/i.exec(text.trim());
  return m && Number.isSafeInteger(Number(m[1])) ? {chainId:Number(m[1]), address:m[2].toLowerCase(), id:`${m[1]}_${m[2].toLowerCase()}`} : null;
}
export function parseCompareHash(hash) {
  let text; try { text = decodeURIComponent(String(hash).replace(/^#/, '')); } catch { return []; }
  const parts = text.split(',').map(x => parseHookHash(x));
  if (parts.some(x => !x) || parts.length < 2 || parts.length > 4) return [];
  return new Set(parts.map(x => x.id)).size === parts.length ? parts.map(x => x.id) : [];
}
export const hookId = hook => parseHookHash(hook.id || `${hook.chainId}:${hook.address || hook.hook || hook.hookAddress}`)?.id || '';
export const profileURL = hook => { const p = parseHookHash(typeof hook === 'string' ? hook : hookId(hook)); return p ? `/discover-hook#${p.chainId}:${p.address}` : '/discover-hook'; };
// Best available label: hook name, then verified name, then project, then a named hook with identical code; else "Unnamed hook"
// with what its permissions let it do. Never a bare address (the address stays on the row as secondary text).
export function hookLabel(h,{capability=false}={}){
  const named=h.name || h.verified?.name || h.project?.name || (h.sameCodeAs?'Same code as '+h.sameCodeAs:'');
  if(named)return named;
  const cap=(h.capabilities||[])[0]?.title;
  return capability&&cap?'Unnamed hook · '+cap.replace(/^Can /,'can '):'Unnamed hook';
}
export const short = (s, n = 8) => s ? String(s).length > n * 2 + 1 ? String(s).slice(0,n) + '…' + String(s).slice(-n) : String(s) : 'Not reported';
export const chainName = id => CHAIN_NAMES[id] || `Chain ${id}`;
export function filterState(query = '') {
  const p = query instanceof URLSearchParams ? query : new URLSearchParams(query);
  const integer = (key, fallback, min, max) => /^\d+$/.test(p.get(key) || '') ? Math.max(min,Math.min(max,Number(p.get(key)))) : fallback;
  return {q:(p.get('q') || '').slice(0,200),chain:/^[1-9]\d*$/.test(p.get('chain') || '') ? p.get('chain') : '',permission:PERMISSIONS.includes(p.get('permission')) ? p.get('permission') : '',project:(p.get('project') || '').slice(0,120),family:(p.get('family') || '').slice(0,64),qhooks:p.get('qhooks') === '1',new:p.get('new') === '1',sort:['swaps','pools','name'].includes(p.get('sort')) ? p.get('sort') : 'swaps',limit:integer('limit',50,1,200),offset:integer('offset',0,0,10000000)};
}
export function filterQuery(state) {
  const p = new URLSearchParams();
  for (const key of ['chain','q','permission','project','family']) if (state[key]) p.set(key,String(state[key]));
  for (const key of ['qhooks','new']) if (state[key]) p.set(key,'1');
  p.set('sort',state.sort || 'swaps'); p.set('limit',String(state.limit ?? 50)); p.set('offset',String(state.offset ?? 0));
  return p.toString();
}
export const boardURL = state => `${API}?${filterQuery(state)}`;
export function formatNumber(value, reason = '') {
  const missing=reason?`Not reported · ${reason}`:'Not reported';
  if (value === null || value === undefined || value === '' || (typeof value !== 'number' && typeof value !== 'bigint' && !/^-?\d+(\.\d+)?$/.test(String(value))) || !Number.isFinite(Number(value))) return missing;
  try { return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(typeof value === 'bigint' ? value : /^-?\d+$/.test(String(value)) ? BigInt(value) : Number(value)); } catch { return missing; }
}
export function formatTime(value) {
  if (value == null || value === '') return 'Time not reported';
  const d = new Date(value);
  if (Number.isNaN(+d)) return 'Time not reported';
  const date=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
  const time=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC',hour12:false});
  return `${date}, ${time} UTC`;
}
export function formatEvidenceText(value) {
  return String(value ?? '').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g,formatTime)
    .replace(/\b(blocks?\s+)(\d{4,})\b/gi,(_,label,n)=>label+formatNumber(n));
}
export function relativeTime(value, now=Date.now()) {
  const time=Date.parse(value);
  if (!Number.isFinite(time)) return 'Time not reported';
  const seconds=Math.max(0,Math.floor((Number(now)-time)/1000));
  if (seconds<60) return 'just now';
  const [amount,unit]=seconds<3600?[Math.floor(seconds/60),'minute']:seconds<86400?[Math.floor(seconds/3600),'hour']:[Math.floor(seconds/86400),'day'];
  return `${formatNumber(amount)} ${unit}${amount===1?'':'s'} ago`;
}
export function sourceText(record = {}, fallback = 'Source not reported') {
  const source = record.source || record.sources;
  const label = Array.isArray(source) ? source.map(x => typeof x === 'string' ? x : x.label).filter(Boolean).join(', ') : typeof source === 'object' ? source?.label || source?.used || source?.name : source;
  const at = record.snapshotAt ? `snapshot ${formatTime(record.snapshotAt)}` : record.observedAt || record.generatedAt ? formatTime(record.observedAt || record.generatedAt) : 'Time not reported';
  const named = label && /v4\.xyz/i.test(label) && !/indexed/i.test(label) ? 'Indexed by '+label : label || fallback;
  return `${named} · ${at}${record.block != null ? ` · block ${formatNumber(record.block)}` : ''}`;
}
export function safeURL(value, localOnly = false) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { const u = new URL(value, 'https://qhooks.com/'); if (!['https:','http:'].includes(u.protocol) || u.username || u.password || (localOnly && u.origin !== 'https://qhooks.com')) return ''; return u.origin === 'https://qhooks.com' ? u.pathname + u.search + u.hash : u.href; } catch { return ''; }
}
const link = (url, label, cls = '') => { const href = safeURL(url); return href ? `<a class="${esc(cls)}" href="${esc(href)}"${href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(label)}</a>` : `<span>${esc(label)} · no link</span>`; };
export function capabilityChips(capabilities) {
  if (!Array.isArray(capabilities) || !capabilities.length) return '<span class="qd-note">No capabilities reported from permission bits.</span>';
  return capabilities.map(c => `<span class="qd-chip" title="${esc(c.detail)}">${esc(c.title)}</span>`).join('');
}
const CAPABILITY_TOKENS=Object.freeze({'swap-amounts':'Swap amounts','swap-rules':'Swap','swap-callbacks':'Swap','add-liquidity':'Add liq.','remove-liquidity':'Remove liq.','liquidity-amounts':'Liq. amounts','initialize':'Init','donate':'Donate'});
export function capabilityMarks(capabilities=[]) {
  return capabilities.map(c=>{
    const flags=c.flags || [];
    const label=CAPABILITY_TOKENS[c.id] || (flags.some(f=>/LiquidityReturnDelta/.test(f))?'Liq. amounts':flags.some(f=>/AddLiquidity/.test(f))?'Add liq.':flags.some(f=>/RemoveLiquidity/.test(f))?'Remove liq.':flags.some(f=>/SwapReturnDelta/.test(f))?'Swap amounts':flags.some(f=>/Swap/.test(f))?'Swap':flags.some(f=>/Initialize/.test(f))?'Init':flags.some(f=>/Donate/.test(f))?'Donate':'Other');
    return `<span title="${esc([c.title,c.detail].filter(Boolean).join(' · '))}">${esc(label)}</span>`;
  }).join('') || '<span title="No permission bits reported">—</span>';
}
export function renderBoard(body,{watch=[],tray=[]}={}) {
  if (!body.hooks?.length) return empty('No hooks match these filters. Clear a filter or try another address.');
  return `<div class="qd-rows qd-board-rows" role="list">${body.hooks.map(h=>{
    const id=hookId(h), name=hookLabel(h), chain=h.chainName || chainName(h.chainId);
    return `<div class="qd-row qd-brow" role="listitem" data-hook-row>${groupGlyph(h)}<div class="qd-row__main"><a class="qd-record-name${name==='Unnamed hook'?' is-unnamed':''}" href="${profileURL(h)}" title="${esc(name)}">${esc(name)}</a><span class="qd-board-meta"><span>${esc(chain)}</span><span class="hl-addr" title="${esc(h.address)}">${esc(short(h.address,4))}</span>${h.qhooks?'<span class="qd-board-qhooks">QHooks</span>':''}</span></div><div class="qd-marks" aria-label="Capabilities">${capabilityMarks(h.capabilities)}</div><div class="qd-row__v" title="${esc(formatNumber(h.swaps))} swaps · ${esc(formatNumber(h.pools))} pools"><b>${esc(compactNumber(h.swaps))}</b><small>swaps · ${esc(compactNumber(h.pools))} pools</small></div><div class="qd-row-actions"><button type="button" class="qd-star" data-star="${id}" aria-label="${watch.includes(id)?'Unwatch':'Watch'} ${esc(name)}" title="Watch hook" aria-pressed="${watch.includes(id)}">${watch.includes(id)?'★':'☆'}</button><label class="qd-check" title="Compare ${esc(name)}"><input type="checkbox" data-compare="${id}" aria-label="Compare ${esc(name)}"${tray.includes(id)?' checked':''}><span>Compare</span></label></div></div>`;
  }).join('')}</div>`;
}

// System A marks: one glyph per capability group (sprite from /qx-a/pages/hooks-glyphs.mjs), compact numbers, relative ages.
const GROUP_GLYPH=['directional','impactFee','pool2','circuit','hook'];
export const groupGlyph=hook=>`<span class="hl-gt hl-gt--sm qd-g" aria-hidden="true"><svg class="hl-g" viewBox="0 0 24 24"><use href="#hl-g-${GROUP_GLYPH[capabilityGroup(hook)]}"/></svg></span>`;
export function compactNumber(value){const n=Number(value);if(!Number.isFinite(n))return '–';const a=Math.abs(n);return a>=1e9?(n/1e9).toFixed(2)+'B':a>=1e6?(n/1e6).toFixed(2)+'M':a>=1e4?(n/1e3).toFixed(1)+'K':n.toLocaleString('en-US');}
// Amounts without token decimals: compact base units (745T, 1.63×10¹⁶); the exact raw value stays in the row's title.
const SUP='⁰¹²³⁴⁵⁶⁷⁸⁹';
function baseUnits(x){if(x<1e12)return compactNumber(x);if(x<1e15)return (x/1e12).toFixed(2).replace(/\.?0+$/,'')+'T';const [m,e]=x.toExponential(2).split('e');return m.replace(/\.?0+$/,'')+'×10'+String(Number(e)).split('').map(d=>SUP[d]).join('');}
export function tokenAmount(value,token){
  try{if(value==null||String(value).trim()==='')return '–';const n=BigInt(value),neg=n<0n,abs=neg?-n:n;
    if(!token||!Number.isInteger(token.decimals)){const x=Number(abs);return (neg?'−':'+')+baseUnits(x);}
    const v=Number(abs)/10**token.decimals;return (neg?'−':'+')+(v>=1?compactNumber(Math.round(v*100)/100):v.toPrecision(3))+(token.symbol?' '+token.symbol:'');
  }catch{return '–';}
}
export function renderStats(body, directory = body) {
  const view=discoveryCoverage(body,directory),date=new Date(view.snapshotAt || NaN);
  const at=Number.isNaN(+date)?'date not reported':date.toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'});
  return `<div class="qa-stats__track">${[['Hooks in directory',view.hooks,view.includesTape?'Snapshot + newly observed Tape hooks':'Snapshot records'],['Snapshot chains',view.chains,'Activity snapshot · '+at],['Pools at snapshot',view.pools,'v4.xyz index · '+at],['Swaps at snapshot',view.swaps,'v4.xyz index · '+at]].map(([label,value,source])=>`<div class="qa-stat" title="${esc(formatNumber(value))} · ${esc(source)}"><b class="qa-stat__v">${esc(compactNumber(value))}</b><span class="qa-stat__l">${label}</span><small class="qd-stat-src">${esc(source)}</small></div>`).join('')}</div>`;
}
export function renderNewHooks(body,now=Date.now()) {
  return body.hooks?.length?`<div class="qd-rows" role="list">${body.hooks.slice(0,6).map(h=>`<div class="qd-row qd-new-card" role="listitem">${groupGlyph(h)}<div class="qd-row__main">${link(profileURL(h),hookLabel(h),'qd-record-name')}<span class="qd-board-meta"><span>${esc(h.chainName || chainName(h.chainId))}</span><span>first seen block ${esc(formatNumber(h.firstSeen?.block))}</span></span></div><div class="qd-row__v" title="${esc(formatTime(h.firstSeen?.at))}"><b>${esc(relativeTime(h.firstSeen?.at,now))}</b><small>first seen</small></div></div>`).join('')}</div>`:note('No first-seen hooks were returned by the Tape.');
}
export function renderMapLabels(nodes) {
  const centers=[[175,38],[500,38],[825,38],[330,260],[670,260]];
  return GROUPS.map((g,i)=>nodes.some(n=>n.group===i)?`<text x="${centers[i][0]}" y="${centers[i][1]}" text-anchor="middle">${g}</text>`:'').join('');
}
export function capabilityGroup(hook) {
  const p = hook.permissions || [];
  if (p.some(x => /SwapReturnDelta$/.test(x))) return 0;
  if (p.some(x => /Swap$/.test(x))) return 1;
  if (p.some(x => /Liquidity/.test(x))) return 2;
  return p.length ? 3 : 4;
}
const hash32 = s => { let n=2166136261; for (const c of s) { n ^= c.charCodeAt(0); n=Math.imul(n,16777619); } return n>>>0; };
export function mapLayout(hooks, cap = 300) {
  const unique = [...new Map(hooks.filter(h => hookId(h)).map(h => [hookId(h),h])).values()];
  unique.sort((a,b) => Number(Boolean(b.qhooks || b.firstSeen)) - Number(Boolean(a.qhooks || a.firstSeen)) || Number(b.swaps || 0) - Number(a.swaps || 0) || hookId(a).localeCompare(hookId(b)));
  const selected = unique.slice(0,Math.max(0,Math.min(300,cap)));
  const groups = GROUPS.map((_,group) => selected.filter(h => capabilityGroup(h) === group).sort((a,b) => hookId(a).localeCompare(hookId(b))));
  const centers = [[175,142],[500,142],[825,142],[330,355],[670,355]];
  return groups.flatMap((items, group) => items.map((hook,i) => {
    const seed=hash32(hookId(hook)), angle=i*2.3999632297+(seed%41)/100;
    const radius=items.length === 1 ? 0 : 112*Math.sqrt((i+.5)/items.length);
    return {hook,id:hookId(hook),group,x:+(centers[group][0]+Math.cos(angle)*radius).toFixed(3),y:+(centers[group][1]+Math.sin(angle)*radius*.68).toFixed(3),r:+Math.min(10,3+Math.log10(Math.max(0,Number(hook.swaps)||0)+1)*1.25).toFixed(3),color:COLORS[chainColor(hook.chainId)]};
  }));
}
export function normalizeWatchlist(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => parseHookHash(v)?.id).filter(Boolean))].slice(0,200);
}
export function toggleWatchlist(value, id) {
  const list = normalizeWatchlist(value), valid = parseHookHash(id)?.id;
  if (!valid) return list;
  if (list.includes(valid)) return list.filter(x => x !== valid);
  if (list.length >= 200) throw new Error('Your watchlist has 200 hooks. Remove one before adding another.');
  return [...list,valid];
}
// The community profile owns identity and persistence; this adapter never signs in or sends implicitly.
export function identity(host = globalThis.window) {
  try {
    const provider=host?.qhIdentity;
    const value=typeof provider==='function'?provider():typeof provider?.identity==='function'?provider.identity():provider;
    const wallet=value?.wallet;
    return /^0x[\da-f]{40}$/i.test(wallet || '') ? {wallet:wallet.toLowerCase()} : null;
  } catch {return null;}
}
export async function syncWatchlist(list, host = globalThis.window) {
  const provider=host?.qhIdentity, who=identity(host);
  if(!who)throw new Error('Sign in to your community profile before syncing.');
  if(typeof provider?.syncWatchlist!=='function')throw new Error('Profile sync is not available yet. Your browser watchlist is still saved.');
  return provider.syncWatchlist(normalizeWatchlist(list));
}
export function rawAmount(value, token) {
  try {
    if (value == null || String(value).trim() === '') return 'Not reported · amount missing';
    const n=BigInt(value), raw=n.toString();
    if (!token || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 36) return `${raw} raw · token decimals unknown`;
    const negative=n<0n, abs=(negative?-n:n).toString().padStart(token.decimals+1,'0');
    const display=token.decimals ? `${abs.slice(0,-token.decimals)}.${abs.slice(-token.decimals)}` : abs;
    return `${raw} raw · ${negative?'-':''}${display}${token.symbol ? ' '+token.symbol : ''}`;
  } catch { return 'Not reported · amount missing'; }
}
const unavailable = reason => `Not reported · ${reason || 'value not reported'}`;
const goodEvidence = h => h.evidence?.status === 'ok';
const liveValue = (h,key,suffix='') => goodEvidence(h) && h.evidence[key] != null ? `${['block','latencyMs','codeBytes'].includes(key) ? formatNumber(h.evidence[key]) : h.evidence[key]}${suffix}` : unavailable(h.evidence?.reason || 'live read did not report this value');
const livePermissions = h => goodEvidence(h) && Array.isArray(h.evidence.permissions?.names) ? h.evidence.permissions.names : null;
export const COMPARE_ROWS = Object.freeze([
 ['Identity','Name',h=>h.board?.name || 'Unnamed hook'],['Identity','Chain',h=>chainName(h.chainId)],['Identity','Address',h=>h.hook],['Identity','Project',h=>h.project?.name || 'No project linked'],['Identity','QHooks kind',h=>h.kind || (h.qhooks?.kind) || (h.qhooks === true ? 'QHooks' : '—')],
 ['Capabilities','Permission names',h=>livePermissions(h)?.slice().sort().join(', ') || (livePermissions(h) ? 'No permission bits set' : unavailable(h.evidence?.reason))],['Capabilities','Can do',h=>h.capabilities?.map(c=>c.title).sort().join(' · ') || 'No capabilities reported'],
 ['Evidence','Read status',h=>h.evidence?.status === 'ok' ? 'Read succeeded' : unavailable(h.evidence?.reason)],['Evidence','Block',h=>liveValue(h,'block')],['Evidence','Observed',h=>goodEvidence(h)?formatTime(h.evidence.observedAt):unavailable(h.evidence?.reason)],['Evidence','Read source',h=>`QHooks chain read · ${chainName(h.chainId)}`],['Evidence','Latency',h=>liveValue(h,'latencyMs',' ms')],['Evidence','Code size',h=>liveValue(h,'codeBytes',' bytes')],['Evidence','Fingerprint',h=>liveValue(h,'fingerprint')],['Evidence','Owner probe',h=>ownerText(h.evidence?.owner)],
 ['Activity','Indexed pools',h=>formatNumber(h.board?.pools,'no board snapshot for this hook')],['Activity','Indexed swaps',h=>formatNumber(h.board?.swaps,'no board snapshot for this hook')],['Activity','Snapshot source / time',h=>h.board?sourceText(h.board,'Indexed by v4.xyz'):unavailable('no board snapshot for this hook')],['Activity','Tape pools',h=>formatNumber(h.tape?.pools,'Tape coverage not reported')],['Activity','Tape swaps, 24h',h=>formatNumber(h.tape?.swaps24h,'Tape coverage not reported')],['Activity','Tape through block',h=>formatNumber(h.tape?.lastSwapBlock,'Tape boundary not reported')]
]);
export function normalizeCompareRecord(h) {
  const parsed=parseHookHash(h.id || `${h.chainId ?? h.evidence?.chainId}:${h.hook || h.address}`);
  return {...h,chainId:h.chainId ?? parsed?.chainId ?? h.evidence?.chainId,hook:h.hook ?? h.address ?? parsed?.address,qhooks:h.qhooks ?? Boolean(h.launch),kind:h.kind ?? (h.launch?'QHooks launch':null)};
}
export function compareDiff(hooks) {
  hooks=hooks.map(normalizeCompareRecord);
  return COMPARE_ROWS.map(([group,label,read]) => {const values=hooks.map(h=>String(read(h) ?? unavailable('value not reported'))); return {group,label,values,differs:new Set(values).size>1};});
}
export function ownerText(owner) {
  if (!owner) return unavailable('owner probe not reported');
  if (owner.status === 'ok') return owner.address || unavailable('owner address not reported');
  return {none:'No owner returned',reverted:'Owner probe reverted',unavailable:'Not reported · owner probe failed'}[owner.status] || unavailable('owner probe status unknown');
}
const fact = (name,value) => `<div><dt>${esc(name)}</dt><dd>${esc(formatEvidenceText(value))}</dd></div>`;
const panel = (title,body,id='') => `<section class="qd-panel"${id ? ` id="${id}"` : ''}><h2>${esc(title)}</h2>${body}</section>`;
const note = text => `<p class="qd-note">${esc(text)}</p>`;
const empty = text => `<p class="qd-empty">${esc(text)}</p>`;
export function permissionGrid(evidence) {
  const known=evidence?.status === 'ok' && Array.isArray(evidence.permissions?.names);
  return `<div class="qd-permissions">${PERMISSIONS.map((p,i)=>`<div class="${known && evidence.permissions.names.includes(p)?'is-on':''}"><span>${esc(p.replace(/([A-Z])/g,' $1'))}</span><b>${known ? evidence.permissions.names.includes(p)?'Enabled':'Off' : 'Unknown'}</b><span class="qd-note">bit ${13-i}</span></div>`).join('')}</div>`;
}
export function normalizeTradePage(value) {
  const rows=Array.isArray(value)?value:Array.isArray(value?.tokens)?value.tokens:[];
  const tokens=new Map();
  for(const row of rows){
    const parsed=parseHookHash(`${row?.chainId}:${row?.token}`),url=safeURL(row?.url,true);
    if(!parsed || /^0x0{40}$/.test(parsed.address) || !url || url.toLowerCase()!==`/terminal.html#t=${parsed.chainId}:${parsed.address}`)continue;
    tokens.set(parsed.id,{...row,chainId:parsed.chainId,token:parsed.address,url});
  }
  return {tokens:[...tokens.values()],total:Array.isArray(value)?tokens.size:Number.isSafeInteger(value?.total)&&value.total>=0?value.total:null,nextCursor:typeof value?.nextCursor==='string'&&value.nextCursor.length>0&&value.nextCursor.length<=2048?value.nextCursor:null};
}
export function appendTradePage(current, value, requestedCursor = null) {
  if(!Array.isArray(value)&&!Array.isArray(value?.tokens))throw new Error('Token records were not returned.');
  const page=normalizeTradePage(value),previous=normalizeTradePage(current),tokens=new Map(previous.tokens.map(t=>[`${t.chainId}:${t.token}`,t]));
  for(const row of page.tokens)tokens.set(`${row.chainId}:${row.token}`,row);
  if(requestedCursor && page.nextCursor===requestedCursor)throw new Error('The token cursor did not advance. Try Refresh live.');
  return {tokens:[...tokens.values()],total:page.total ?? previous.total,nextCursor:page.nextCursor};
}
export function tradeLinks(profile) {
  const rows = profile.launch ? [{...profile.launch, launch:true}] : normalizeTradePage(profile.trade).tokens;
  return rows.map(t => {
    const candidate=safeURL(t.url,true), expected=t.launch ? `#m=${t.chainId}:${String(t.controller).toLowerCase()}` : `#t=${t.chainId}:${String(t.token).toLowerCase()}`;
    if (!candidate || !/^\/terminal\.html#(?:t|m)=/.test(candidate) || candidate.toLowerCase() !== '/terminal.html'+expected.toLowerCase()) return '';
    return link(candidate,t.launch?'Open launch in the terminal →':`${chainName(t.chainId)} · ${short(t.token)} →`,'qd-button');
  }).filter(Boolean).join('');
}
export function renderTradeTokens(trade) {
  return normalizeTradePage(trade).tokens.map(t=>`<article class="qd-trade-token"><a class="qd-button" href="${esc(t.url)}">${esc(chainName(t.chainId))} · ${esc(short(t.token))} →</a><details data-trade-details><summary>Hooks this token trades through</summary><div data-trade-token-host data-chain="${t.chainId}" data-token="${t.token}"></div></details></article>`).join('');
}
export function renderTradeSection(profile) {
  const state=normalizeTradePage(profile.trade),launch=profile.launch?tradeLinks(profile):'';
  if(!state.tokens.length&&!state.nextCursor&&!launch)return '';
  return panel('Trade',`${launch?`<div class="qd-actions">${launch}</div>`:''}<div id="qd-trade-tokens" class="qd-trade-tokens">${renderTradeTokens(state)}</div><p id="qd-trade-count" class="qd-note">${esc(formatNumber(state.tokens.length))}${state.total===null?'':` of ${esc(formatNumber(state.total))}`} tokens returned by this hook’s pool records.</p><button type="button" id="qd-more-trade" class="qd-button"${state.nextCursor?'':' hidden'}>Load more tokens ↓</button><p id="qd-trade-status" class="qd-note" role="status"></p>`,'qd-trade');
}
export function renderProfile(h, watched = false) {
  const id=hookId(h), e=h.evidence, live=goodEvidence(h), p=livePermissions(h), title=h.board?.name || 'Unnamed hook';
  const evidenceNote=live ? `Read by QHooks from ${chainName(h.chainId)} · block ${formatNumber(e.block)} · ${formatTime(e.observedAt)}` : unavailable(e?.reason || 'live evidence not returned');
  const boardNote=h.board?sourceText(h.board,'Indexed by v4.xyz'):'No board snapshot exists for this hook.';
  const identity=`<section class="qd-identity qd-panel"><div><p class="qd-kicker">${esc(chainName(h.chainId))} · Hook record</p><h2>${esc(title)}</h2><p class="qd-address"><code>${esc(h.hook)}</code><button class="qd-button" type="button" data-copy="${esc(h.hook)}">Copy address</button></p><p>${h.project?link('/discover-projects#'+encodeURIComponent(h.project.id),h.project.name):'No project linked'}${h.qhooks?' · '+esc(h.kind || h.qhooks?.kind || 'QHooks'):''}</p>${upgradeableLabel(h)?`<span class="qd-chip qd-upgradeable">${esc(upgradeableLabel(h))}</span>`:''}</div><div class="qd-actions"><button class="qd-button" type="button" data-star="${id}" aria-pressed="${watched}">${watched?'★ Watching':'☆ Watch hook'}</button><button type="button" data-refresh class="qd-button">Refresh live ↻</button>${link(`${API}/${h.chainId}/${h.hook}`,'Raw JSON ↗','qx-link')}</div></section>`;
  const caps=panel('What it can do',note('Permission bits describe what this address can do, not what its code chooses to do.')+`<div class="qd-capabilities">${(h.capabilities || []).map(c=>`<article><h3>${esc(c.title)}</h3><p>${esc(c.detail)}</p></article>`).join('') || note('No capability descriptions were returned. Read the permission grid below.')}</div>`);
  const evidence=panel('Evidence',note(evidenceNote)+`<dl class="qd-facts">${fact('Status',live?'Read succeeded':unavailable(e?.reason))}${fact('Deployed',live && e.deployed != null ? e.deployed?'Yes':'No code at this block':unavailable(e?.reason))}${fact('Block',liveValue(h,'block'))}${fact('Observed',live?formatTime(e.observedAt):unavailable(e?.reason))}${fact('Latency',liveValue(h,'latencyMs',' ms'))}${fact('Code size',liveValue(h,'codeBytes',' bytes'))}${fact('Runtime fingerprint',liveValue(h,'fingerprint'))}${fact('Owner probe',ownerText(e?.owner))}${fact('Permission flags',p?formatNumber(e.permissions.flags):unavailable(e?.reason))}</dl>`+permissionGrid(e)+(!h.family?note(live?'Unique runtime among indexed hooks.':'Shared runtime lookup needs a successful live read.'):''),'qd-evidence');
  const proof=panel('Public contract report','<div id="qd-repoproof-host"></div>','qd-repoproof');
  const fam=h.family;
  const family=fam?panel('Shared code',note('Identical runtime fingerprints link these deployments; they do not establish common ownership.')+`<dl class="qd-facts">${fact('Family',fam.name || 'Unnamed runtime family')}${fact('Fingerprint',fam.fingerprint)}${fact('Deployments',formatNumber(fam.deploymentCount))}</dl>`+note(`Family registry · registry observation time not returned. Matched using the runtime fingerprint read by QHooks at block ${formatNumber(e?.block)} · ${formatTime(e?.observedAt)}`)+`<div class="qd-actions">${(fam.sample || []).map(id=>link(profileURL(id),short(id))).join('')}${link(`${API}/families/${encodeURIComponent(fam.fingerprint)}`,'All deployments · JSON ↗')}</div>`):'';
  const tape=h.tape;
  const tapeActivity=tape && tape.pools!=null && tape.swaps24h!=null && Number(tape.pools)===0 && Number(tape.swaps24h)===0
    ? note('No pools for this hook on the Tape yet.')
    : tape ? `<dl class="qd-facts">${fact('Tape pools',formatNumber(tape.pools))}${fact('Tape swaps, 24h',formatNumber(tape.swaps24h))}${tape.lastSwapBlock!=null?fact('Last swap block',formatNumber(tape.lastSwapBlock)):''}</dl>`+note(sourceText(tape,'QHooks confirmed PoolManager logs'))
    : note('No Tape coverage was returned for this hook.');
  const activity=panel('Activity',`<dl class="qd-facts">${fact('Indexed pools',formatNumber(h.board?.pools,'no snapshot for this hook'))}${fact('Indexed swaps',formatNumber(h.board?.swaps,'no snapshot for this hook'))}</dl>`+note(boardNote)+tapeActivity);
  const build=panel('Build one like this',`<div class="qd-build">${(h.buildLike || []).map(b=>`<article><p class="qd-kicker">${esc(b.kind)}</p><h3>${link(safeURL(b.url,true),b.title)}</h3><p>${esc(b.why)}</p></article>`).join('') || note('No matching Lab template, launch block or module was returned.')}</div>`);
  const trust=h.trust?panel('Trust',note('Labels come from the trust layer’s records, not a code audit.')+`<dl class="qd-facts">${fact('Verified creator',trustText(h.trust.verifiedCreator))}${fact('QProof',trustText(h.trust.repoproof))}</dl>`):h.launch?panel('Trust',note('Not reported · the trust layer did not return labels for this launch.')):'';
  const follow=panel('Follow',`<div class="qd-actions"><button type="button" class="qd-button" data-star="${id}" aria-pressed="${watched}">${watched?'★ Watching':'☆ Watch hook'}</button><button type="button" class="qd-button" data-follow="${id}">Follow on Telegram ↗</button></div><p class="qd-note">Stars stay in this browser. Telegram opens a bot link where you can choose to follow.</p><p id="qd-follow-status" class="qd-note" role="status"></p>`);
  const lists=panel('Measured / Planned',`<div class="qd-two"><div><h3>Measured</h3>${stringList(h.measured,'No measurements listed in the response.')}</div><div><h3>Planned</h3>${stringList(h.planned,'No planned items listed in the response.')}</div></div>`);
  const changes=panel('Change log','<div id="qd-hook-changes"><p class="qd-note">Reading watched hook changes…</p></div>','qd-change-log');
  return identity+`<div class="qd-profile-grid">${caps}${evidence}${proof}${family}${activity}${changes}${renderTradeSection(h)}${build}${trust}${follow}${lists}</div>`;
}
const stringList=(values,fallback)=>Array.isArray(values)&&values.length?`<ul class="qd-list">${values.map(v=>`<li>${esc(formatEvidenceText(v))}</li>`).join('')}</ul>`:note(fallback);
export function trustText(value) {
  if (value == null) return unavailable('label not returned');
  if (typeof value === 'boolean') return value?'Recorded':'Not recorded';
  if (typeof value === 'string') return value;
  return [value.status,value.label,value.reason].filter(Boolean).join(' · ') || 'Record returned · see Raw JSON';
}
export function renderComparison(body) {
  const hooks=(body.hooks || []).map(normalizeCompareRecord);
  if (hooks.length<2 || hooks.length>4) throw new Error('Compare response must contain two to four hook records.');
  const rows=compareDiff(hooks), shared=body.shared || {};
  const sharedNote=panel('In common',`<dl class="qd-facts">${fact('Runtime family',shared.family || 'No shared runtime family')}${fact('Permissions',Array.isArray(shared.permissions)?shared.permissions.join(', ') || 'None shared':'Not reported')}${fact('Capabilities',Array.isArray(shared.capabilities)?shared.capabilities.map(c=>typeof c==='string'?c:c.title || c.id).join(', ') || 'None shared':'Not reported')}</dl>`+note('Highlighted rows differ. Shared permissions describe the same allowed callbacks, not identical behavior.'));
  const groups=['Identity','Capabilities','Evidence','Activity'];
  const table=`<div class="qd-compare-desktop"><table class="qd-compare-table"><thead><tr><th scope="col">Evidence</th>${hooks.map(h=>`<th scope="col">${link(profileURL(h),h.board?.name || short(h.hook))}</th>`).join('')}</tr></thead>${groups.map(group=>`<tbody><tr class="qd-compare-group"><th colspan="${hooks.length+1}">${group}</th></tr>${rows.filter(r=>r.group===group).map(r=>`<tr class="${r.differs?'qd-diff':''}"><th scope="row">${esc(r.label)}${r.differs?' <span class="qd-note">· differs</span>':''}</th>${r.values.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>`).join('')}</table></div>`;
  return sharedNote+table+`<div class="qd-compare qd-compare-${hooks.length}">${hooks.map((h,i)=>`<article class="qd-compare-card qd-panel"><h2>${link(profileURL(h),h.board?.name || short(h.hook))}</h2>${['Identity','Capabilities','Evidence','Activity'].map(group=>`<section><h3>${group}</h3><dl>${rows.filter(r=>r.group===group).map(r=>`<div class="${r.differs?'qd-diff':''}"><dt>${esc(r.label)}${r.differs?' <span class="qd-note">· differs</span>':''}</dt><dd>${esc(r.values[i])}</dd></div>`).join('')}</dl></section>`).join('')}</article>`).join('')}</div>`;
}
export function renderProjectCards(projects) {
  return projects.length?`<div class="qd-rows" role="list">${projects.map(p=>`<div class="qd-row qd-project-card" role="listitem"><span class="hl-gt hl-gt--sm qd-g" aria-hidden="true"><svg class="hl-g" viewBox="0 0 24 24"><use href="#hl-g-${p.qhooks?'hook':'module'}"/></svg></span><div class="qd-row__main"><span class="qd-kicker">${esc(p.qhooks?'QHooks · '+p.category:p.category)}</span>${link('/discover-projects#'+encodeURIComponent(p.id),p.name,'qd-record-name')}<p>${esc(projectSummary(p))}</p><span class="qd-board-meta"><span>${esc(p.provenance || 'Provenance not reported')}</span></span><div class="qd-project-links">${projectLabURL(p)?link(projectLabURL(p),'Open in the Lab →','qx-link'):''}${link('/discover-projects#'+encodeURIComponent(p.id),'Sources & deployments →','qx-link')}</div></div></div>`).join('')}</div>`:empty('No projects match this search.');
}
export function renderProjectDetail(p) {
  const observations=p.observations || [];
  return panel(p.name,`<p>${esc(projectSummary(p))}</p><p>${esc(p.provenance || 'Provenance not reported')}</p><div class="qd-actions">${(p.sources || []).map(s=>link(s.url,s.label+' ↗')).join('')}${p.website?link(p.website,'Project website ↗'):''}${link(`${API}/projects/${encodeURIComponent(p.id)}`,'Raw JSON ↗')}</div><h3 class="qd-section-label">Deployments & live observations</h3>${(p.deployments || []).map(d=>{const o=observations.find(o=>Number(o.chainId)===Number(d.chainId) && o.address?.toLowerCase()===d.address?.toLowerCase()); return `<article class="qd-deployment"><h4>${link(profileURL(d),chainName(d.chainId)+' · '+short(d.address))}</h4><p>${esc(d.role || 'Deployment')}</p>${note(typeof d.source === 'object'? d.source.label || 'Source label not reported':d.source || 'Deployment source not reported')}${note(o?`QHooks chain read · ${chainName(o.chainId)} · ${o.status} · block ${formatNumber(o.block)} · ${formatNumber(o.codeBytes)} bytes · fingerprint ${o.fingerprint || 'not reported'} · owner: ${ownerText(o.owner)}`:'Not reported · no observation returned; live reads are bounded to eight deployments per request.')}</article>`;}).join('') || note('No deployments are registered.')}`,'qd-selected-project');
}
export function tapeStatuses(body) {
  if (Array.isArray(body.chains)) return body.chains;
  if (body.chains && typeof body.chains === 'object') return Object.entries(body.chains).map(([chainId,s])=>({...s,chainId:s.chainId || Number(chainId)}));
  return [body];
}
export function renderCoverage(body, options) {
  return renderTapeStatusCards(body, options);
}
export function normalizeTapeRow(row) {
  return {...row,
    currencies:Array.isArray(row.currencies)?row.currencies:[row.currency0,row.currency1].filter(Boolean),
    amount0:row.amount0 ?? row.poolDeltas?.amount0,
    amount1:row.amount1 ?? row.poolDeltas?.amount1,
    feeMode:row.feeMode ?? row.poolFee?.mode,
    feeRaw:row.feeRaw ?? row.poolFeeRaw ?? row.poolFee?.raw ?? row.poolManagerFee?.raw,
  };
}
const tapeName=(row,names)=>names?.get(hookId({chainId:row.chainId,address:row.hookAddress})) || short(row.hookAddress);
export function renderTapeRows(body, kind, knownPools=[], names=new Map()) {
  const rows=body[kind] || [];
  if (!rows.length) return empty(`No ${kind} returned for this scope.`);
  return `<div class="qd-tape" role="list">${rows.map(row=>{
    const r=normalizeTapeRow(row), pool=knownPools.find(p=>Number(p.chainId)===Number(r.chainId) && p.poolId===r.poolId), tokens=pool?.tokens;
    const currencies=r.currencies.length?r.currencies:(pool?normalizeTapeRow(pool).currencies:[]);
    const fee=r.feeMode==='dynamic'?'Dynamic LP fee':r.feeRaw!=null?formatNumber(Number(r.feeRaw)/10000)+'% LP fee':row.poolFee?.percent!=null?formatNumber(row.poolFee.percent)+'% LP fee':'LP fee not recorded';
    const sym=i=>tokens?.[i]?.symbol || short(currencies[i],4);
    const what=kind==='swaps'?`<span class="qd-trow__amt"><span title="${esc(rawAmount(r.amount0,tokens?.[0]))}">${esc(tokenAmount(r.amount0,tokens?.[0]))}${tokens?.[0]?.symbol?'':' '+esc(sym(0))}</span><span title="${esc(rawAmount(r.amount1,tokens?.[1]))}">${esc(tokenAmount(r.amount1,tokens?.[1]))}${tokens?.[1]?.symbol?'':' '+esc(sym(1))}</span></span>`:`<span class="qd-trow__amt"><span title="${esc(currencies.join(' / '))}">${currencies.map((c,i)=>esc(sym(i))).join(' / ') || 'Currencies not recorded'}</span></span>`;
    const when=r.blockAt||row.blockAt||r.observedAt;
    const hookCell=/^0x0{40}$/i.test(r.hookAddress||'')?'<b class="qd-nohook">No hook</b>':link(profileURL({chainId:r.chainId,address:r.hookAddress}),tapeName(r,names),'qd-record-name');
    return `<div class="qd-trow${kind==='pools'?' is-pool':''}" role="listitem" data-event="${esc(r.eventId || r.transactionHash+':'+r.logIndex)}"><span class="qd-trow__k" aria-hidden="true"></span><div class="qd-trow__main">${hookCell}<span class="qd-board-meta"><span>${esc(chainName(r.chainId))}</span><span title="${esc(r.poolId)}">Pool ${esc(short(r.poolId,4))}</span><span>${esc(fee)}</span></span></div>${what}<div class="qd-trow__ev"><b title="${esc(formatTime(when))}">${esc(relativeTime(when))}</b><span title="${esc(r.transactionHash)}">Block ${esc(formatNumber(r.blockNumber))} · tx ${esc(short(r.transactionHash,4))}</span></div></div>`;
  }).join('')}</div>`;
}
export function tapeActivityGroups(body) {
  if (Array.isArray(body.windows)) return body.windows.map(window=>({chainId:window.chainId,window,summary:body.summaries?.find(s=>Number(s.chainId)===Number(window.chainId)),generatedAt:body.generatedAt}));
  if (Array.isArray(body.chains)) return body.chains;
  return [{chainId:body.chainId ?? body.window?.chainId,window:body.window,summary:body.summary,generatedAt:body.generatedAt}];
}
export function tapeActivityRows(body) {
  return Array.isArray(body.chains)?body.chains.flatMap(a=>(a.hooks || []).map(h=>({...h,chainId:h.chainId ?? a.chainId}))):body.hooks || [];
}
export function renderTapeWindow(body) {
  const parts=tapeActivityGroups(body).map(a=>{
    const w=a.window,counts=a.summary,name=a.chainId!=null?chainName(a.chainId)+': ':'';
    if(!w||!Number.isFinite(Number(w.fromBlock))||!Number.isFinite(Number(w.toBlock)))return name+'no window yet';
    return `${name}blocks ${formatNumber(w.fromBlock)}–${formatNumber(w.toBlock)}${w.complete?'':' (still filling)'}${counts?`, ${formatNumber(counts.swaps)} swaps in ${formatNumber(counts.pools)} pools`:''}`;
  });
  return parts.join(' · ')+` · confirmed PoolManager logs, ${formatTime(body.generatedAt)}`;
}
export function renderTapeActivity(body,names=new Map()) {
  const hooks=tapeActivityRows(body).slice().sort((a,b)=>b.swaps-a.swaps), top=Math.max(1,...hooks.map(h=>Number(h.swaps)||0));
  return hooks.length?`<div class="qd-rows" role="list">${hooks.map((h,i)=>`<div class="qd-row qd-act" role="listitem" data-w="${Math.round((Number(h.swaps)||0)/top*100)}"><span class="qa-rank${i<3?' is-top':''}">${i+1}</span><div class="qd-row__main">${link(profileURL({chainId:h.chainId,address:h.hookAddress}),tapeName(h,names),'qd-record-name')}<span class="qd-board-meta"><span>${esc(chainName(h.chainId))}</span><span>${esc(formatNumber(h.pools))} pools</span></span></div><div class="qd-row__v"><b>${esc(compactNumber(h.swaps))}</b><small>swaps</small></div></div>`).join('')}</div>`:empty('No hook activity returned in this block window.');
}
export function createHookNameResolver(fetcher=requestJSON,limit=20) {
  const names=new Map(),requests=new Map(),cap=Math.min(20,Math.max(0,limit));
  return {names,async resolve(rows){
    const pending=[];
    for(const row of rows){
      const parsed=parseHookHash(`${row.chainId}:${row.hookAddress}`);
      if(!parsed)continue;
      if(requests.has(parsed.id)){pending.push(requests.get(parsed.id));continue;}
      if(requests.size>=cap)continue;
      const query=new URLSearchParams({q:parsed.address,limit:'1',chain:String(parsed.chainId)});
      const request=Promise.resolve().then(()=>fetcher(API+'?'+query)).then(body=>{
        const hook=body.hooks?.find(h=>Number(h.chainId)===parsed.chainId && h.address?.toLowerCase()===parsed.address);
        if(hook?.name)names.set(parsed.id,hook.name);
      }).catch(()=>{});
      requests.set(parsed.id,request);pending.push(request);
    }
    await Promise.all(pending);return names;
  }};
}
// Server error codes are shown as plain words; a temporary outage reads as refreshing.
export const plainError=v=>v==null?'':String(v).replace(/_/g,' ').replace(/\bunavailable\b/gi,'refreshing').replace(/\bstale\b/gi,'refreshing');
// First paint (2026-11-12, main's finish sweep: the hook pages sat on skeletons past 6 s while D1 was slow). Reads made
// with {keep:true} leave their last good body in this browser; peekJSON hands it to the page at once, and the live read
// then replaces it. Degraded answers (the Tape down) are never kept.
const LOCAL='qhooks.qd.v1:',LOCAL_MAX=864e5,LOCAL_BYTES=300000;
export function peekJSON(path){try{const v=JSON.parse(localStorage.getItem(LOCAL+path)||'null');return v&&Date.now()-v.at<LOCAL_MAX?v.body:null;}catch{return null;}}
function keepJSON(path,body){if(!body||body.error||body.status==='unavailable'||body.coverage?.tapeAvailable===false)return;try{const s=JSON.stringify({at:Date.now(),body});if(s.length<=LOCAL_BYTES)localStorage.setItem(LOCAL+path,s);}catch{}}
export async function requestJSON(path, options = {}, fetcher = globalThis.fetch) {
  const {keep,...init}=options;
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
  try { const r=await fetcher(path,{...init,signal:controller.signal,headers:{Accept:'application/json',...init.headers}}).catch(e=>{throw e?.name==='AbortError'?new Error('the read took longer than 12 seconds'):e;});const body=await r.json();if (!r.ok) {const e=new Error(plainError(body.error) || `HTTP ${r.status}`); e.status=r.status; e.body=body; throw e;}if(keep)keepJSON(path,body);return body; } finally {clearTimeout(timer);}
}

// DOM controllers run only in a page; exported render helpers remain usable in Node.
// Details open in place: long fact lists sit behind a quiet disclosure so the verdict reads first.
function disclose(target,label,cls){if(!target||target.closest('details'))return;const d=document.createElement('details');d.className='hl-more '+cls;const s=document.createElement('summary');s.textContent=label;d.append(s);target.replaceWith(d);d.append(target);let n=d.nextSibling;while(n&&cls==='qd-cov-more'){const next=n.nextSibling;d.append(n);n=next;}}
function boot() {
  const main=document.querySelector('[data-discover]'); if (!main) return;
  // Shared helpers (change monitor, contract report, token pools) still print "unavailable"; say it plainly here until they are updated.
  const plain=root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);for(let n=w.nextNode();n;n=w.nextNode())if(/unavailable/i.test(n.nodeValue))n.nodeValue=n.nodeValue.replace(/\bUnavailable\b/g,'Not reported').replace(/\bunavailable\b/gi,'refreshing');};
  new MutationObserver(ms=>{for(const m of ms)plain(m.target.nodeType===3?m.target.parentNode||main:m.target);}).observe(main,{subtree:true,childList:true,characterData:true});
  const $=id=>document.getElementById(id), status=text=>{if($('qd-status')) $('qd-status').textContent=text;};
  for(const select of main.querySelectorAll('select[name="chain"],select[name="chainId"]'))addDiscoveryChains(select);
  let watch=[];try {watch=normalizeWatchlist(JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'));}catch{}
  const watched=id=>watch.includes(id);
  const saveWatch=(id)=>{const next=toggleWatchlist(watch,id);try{localStorage.setItem(WATCH_KEY,JSON.stringify(next));watch=next;}catch{throw new Error('Browser storage is off. This hook could not be saved.');} document.querySelectorAll('[data-star]').forEach(b=>{const yes=watched(b.dataset.star);b.setAttribute('aria-pressed',String(yes));b.textContent=b.classList.contains('qd-star')?(yes?'★':'☆'):(yes?'★ Watching':'☆ Watch');});renderWatch();};
  function renderWatch(){if($('qd-watchlist')) $('qd-watchlist').innerHTML=watch.length?watch.map(id=>`<article class="qd-mini">${link(profileURL(id),short(id))}<button class="qd-button" data-star="${id}" aria-pressed="true" type="button">★ Remove</button></article>`).join(''):note('Star a hook to keep its profile here.');}
  const syncButton=$('qd-sync-watchlist'),syncStatus=$('qd-sync-status');
  if(syncButton){
    const updateIdentity=()=>{syncButton.hidden=!window.qhIdentity;};
    updateIdentity();
    // The future identity module can announce readiness or sign-in changes without a polling loop.
    window.addEventListener('qhidentitychange',updateIdentity);
    window.addEventListener('qhidentityready',updateIdentity);
    window.addEventListener('pageshow',updateIdentity);
    syncButton.onclick=async()=>{
      syncButton.disabled=true;syncStatus.textContent='Syncing your browser watchlist…';
      try{await syncWatchlist(watch);syncStatus.textContent='Watchlist synced to your profile. Your browser copy is still saved.';}
      catch(e){syncStatus.textContent=e.message;}
      finally{syncButton.disabled=false;updateIdentity();}
    };
  }
  let refresh=()=>{}, loadSerial=0;
  main.addEventListener('click',async event=>{
    const b=event.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.star) saveWatch(b.dataset.star);
      if (b.dataset.copy) {await navigator.clipboard.writeText(b.dataset.copy);b.textContent='Copied';}
      if (b.hasAttribute('data-refresh')) await refresh();
      if (b.dataset.follow) {
        const p=parseHookHash(b.dataset.follow); b.disabled=true;
        const target=$('qd-follow-status'); target.textContent='Preparing your Telegram link…';
        try {const out=await requestJSON('/api/alerts/hook-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chainId:p.chainId,hook:p.address})});const u=new URL(out.url); if(u.protocol!=='https:' || u.hostname!=='t.me' || u.username || u.password) throw new Error('Alert link was not a valid Telegram URL.');target.innerHTML=link(u.href,'Open Telegram to follow →','qx-link');}
        catch(e){target.textContent=e.status===503 && e.body?.error==='alerts_off'?'Alerts are off for now. You can still star this hook in your browser.':`No Telegram link · ${e.message}`;}
        finally{b.disabled=false;}
      }
    } catch(e){status(e.message);}
  });
  const fail=(e,target)=>{status(`Could not refresh · ${e.message}. Last loaded records remain visible.`);if(target && !target.children.length)target.innerHTML=empty('No records loaded yet. Try Refresh or reload this page.');};
  const formState=form=>Object.fromEntries(new FormData(form));
  const updateURL=state=>history.replaceState(null,'',location.pathname+'?'+filterQuery(state)+location.hash);
  if(main.dataset.discover==='board') {
    const form=$('qd-filters');let state=filterState(location.search), board=null, tray=[];
    mountRecentChanges($('qd-recent-changes'));
    for(const p of PERMISSIONS) form.elements.permission.add(new Option(p.replace(/([A-Z])/g,' $1'),p));
    const fillForm=()=>{for(const k of ['q','chain','permission','project','sort','limit']) {const el=form.elements[k];if(state[k] && el.tagName==='SELECT' && ![...el.options].some(o=>o.value===String(state[k]))) el.add(new Option(String(state[k]),String(state[k])));el.value=state[k];}form.elements.qhooks.checked=state.qhooks;};fillForm();renderWatch();
    function renderTray(){const el=$('qd-tray');el.hidden=!tray.length;el.innerHTML=`<span>${tray.length} of 4 hooks selected</span>${tray.length>=2?link('/discover-compare#'+tray.join(','),'Compare hooks →','qd-button qd-primary'):note('Choose at least two to compare.')}<button class="qd-button" type="button" id="qd-clear-tray">Clear</button>`;$('qd-clear-tray')?.addEventListener('click',()=>{tray=[];drawBoard();});}
    function drawBoard(){
      if(!board)return;
      $('qd-board-source').hidden=true;
      $('qd-board').innerHTML=renderBoard(board,{watch,tray});
      $('qd-page').textContent=board.total && board.hooks.length?`${formatNumber(board.offset+1)}–${formatNumber(board.offset+board.hooks.length)} of ${formatNumber(board.total)}`:board.total?`No rows at offset ${formatNumber(state.offset)} · ${formatNumber(board.total)} total`:'No results';
      $('qd-prev').disabled=state.offset===0;$('qd-next').disabled=board.offset+board.hooks.length>=board.total;$('qd-export').href=boardURL(state);renderTray();
    }
    $('qd-board').addEventListener('change',event=>{const el=event.target;if(!el.dataset.compare)return;if(el.checked){if(tray.length===4){el.checked=false;status('Compare up to four hooks. Remove one before adding another.');return;}tray.push(el.dataset.compare);}else tray=tray.filter(x=>x!==el.dataset.compare);renderTray();});
    const showBoard=(next,directory)=>{board=next;drawBoard();
      for(const c of next.chains || [])if(![...form.elements.chain.options].some(o=>o.value===String(c.chainId)))form.elements.chain.add(new Option(c.name,String(c.chainId)));fillForm();
      $('qd-stats').innerHTML=renderStats(next,directory);$('qd-stats-source').textContent='Directory total includes new Tape records. Activity totals are from '+formatTime(directory.snapshotAt)+'.';};
    async function load(){const serial=++loadSerial;
      const seen=[peekJSON(boardURL(state)),peekJSON(API+'?limit=1')];if(seen[0]&&seen[1]&&!board){showBoard(seen[0],seen[1]);status('Refreshing hook records…');}else status('Loading hook records…');
      try{
      const [next,directory]=await Promise.all([requestJSON(boardURL(state),{keep:true}),requestJSON(API+'?limit=1',{keep:true})]);if(serial!==loadSerial)return;showBoard(next,directory);status(`${formatNumber(next.total)} matching hooks.`);
    }catch(e){if(serial===loadSerial)fail(e,$('qd-board'));}}
    form.addEventListener('submit',e=>{e.preventDefault();state=filterState(new URLSearchParams({...formState(form),offset:'0'}));updateURL(state);void load();});
    $('qd-prev').onclick=()=>{state.offset=Math.max(0,state.offset-state.limit);updateURL(state);void load();};$('qd-next').onclick=()=>{state.offset+=state.limit;updateURL(state);void load();};
    addEventListener('popstate',()=>{state=filterState(location.search);fillForm();void load();});
    const addProjects=body=>{for(const p of body.projects || [])if(![...form.elements.project.options].some(o=>o.value===p.id))form.elements.project.add(new Option(p.name,p.id));fillForm();};
    {const seen=peekJSON(API+'/projects');if(seen)addProjects(seen);}
    void requestJSON(API+'/projects',{keep:true}).then(addProjects).catch(e=>status('Project filter did not load · '+e.message));
    {const seen=peekJSON(API+'?new=1&limit=12');if(seen)$('qd-new').innerHTML=renderNewHooks(seen);}
    void requestJSON(API+'?new=1&limit=12',{keep:true}).then(body=>{$('qd-new').innerHTML=renderNewHooks(body);}).catch(e=>{if(!$('qd-new').querySelector('a'))$('qd-new').innerHTML=note('First-seen records did not load · '+e.message);});
    $('qd-refresh')?.addEventListener('click',()=>void load());refresh=load;void load();
    // The newest finalized swaps on the Tape, refreshed every 30 seconds while the page is visible.
    const liveHost=$('qd-live-swaps');
    if(liveHost){
      const seenLive=new Set(),names=createHookNameResolver();let primed=false,liveAt=0,rows=[];
      const draw=()=>{liveHost.innerHTML=renderTapeRows({swaps:rows},'swaps',[],names.names);for(const el of liveHost.querySelectorAll('[data-event]')){if(!seenLive.has(el.dataset.event)){if(primed)el.classList.add('is-enter');seenLive.add(el.dataset.event);}}primed=primed||rows.length>0;};
      {const seen=peekJSON(API+'/tape/swaps?limit=6');if(Array.isArray(seen?.swaps)){rows=seen.swaps;draw();void names.resolve(rows).then(draw);}}
      const loadLive=async()=>{if(document.hidden)return;try{const body=await requestJSON(API+'/tape/swaps?limit=6',{keep:true});rows=Array.isArray(body.swaps)?body.swaps:[];draw();liveAt=Date.now();void names.resolve(rows).then(draw);}catch{if(!liveHost.querySelector('[data-event]'))liveHost.innerHTML=note('The Tape is refreshing. Open it for coverage by chain.');}};
      setInterval(()=>void loadLive(),30000);
      setInterval(()=>{const l=$('qd-live');if(l&&liveAt){const s=Math.round((Date.now()-liveAt)/1000);l.textContent=s<2?'Refreshed just now':`Refreshed ${s}s ago`;}},1000);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)void loadLive();});void loadLive();
    }
  }
  if(main.dataset.discover==='hook') {
    const form=$('qd-inspect');let changesController=null,proofController=null,tokenControllers=new Set();
    const clearProfileControllers=()=>{proofController?.dispose();proofController=null;changesController?.destroy?.();changesController=null;for(const c of tokenControllers)c.destroy?.();tokenControllers.clear();};
    function wireTrade(p,h,serial){
      let trade=normalizeTradePage(h.trade),busy=false;const seenCursors=new Set();
      const list=$('qd-trade-tokens'),more=$('qd-more-trade'),message=$('qd-trade-status');
      const wireDetails=root=>{for(const details of root.querySelectorAll('[data-trade-details]')){
        if(details.dataset.tradeListening)continue;details.dataset.tradeListening='1';
        details.addEventListener('toggle',async()=>{
          if(!details.open)return;
          const host=details.querySelector('[data-trade-token-host]');
          if(host.dataset.tokenMounted)return;
          host.dataset.tokenMounted='loading';host.innerHTML=note('Reading pools for this token…');
          try{
            const {renderTokenHooks}=await import('./qx-token-hooks.mjs');
            if(serial!==loadSerial || !host.isConnected)return;
            host.setAttribute('data-token-hooks','');
            const controller=renderTokenHooks(host,{chainId:Number(host.dataset.chain),token:host.dataset.token});tokenControllers.add(controller);host.dataset.tokenMounted='ready';
          }catch(e){delete host.dataset.tokenMounted;host.innerHTML=note('Token pools did not load · '+e.message+'. Close and reopen to retry.');}
        });
      }};
      if(!list || !more)return;wireDetails(list);
      more.onclick=async()=>{
        if(busy || !trade.nextCursor)return;
        const cursor=trade.nextCursor;busy=true;more.disabled=true;message.textContent='Reading more token records…';
        try{
          const page=await requestJSON(`${API}/${p.chainId}/${p.address}?`+new URLSearchParams({tradeCursor:cursor}));
          if(serial!==loadSerial)return;
          if(seenCursors.has(normalizeTradePage(page.trade).nextCursor))throw new Error('The token cursor repeated. Refresh live to try again.');
          const next=appendTradePage(trade,page.trade,cursor),before=new Set(trade.tokens.map(t=>`${t.chainId}:${t.token}`));
          list.insertAdjacentHTML('beforeend',renderTradeTokens({tokens:next.tokens.filter(t=>!before.has(`${t.chainId}:${t.token}`))}));
          // Newly appended details have no listener; existing token widgets keep their loaded pages.
          wireDetails(list);
          seenCursors.add(cursor);trade=next;more.hidden=!trade.nextCursor;
          $('qd-trade-count').textContent=`${formatNumber(trade.tokens.length)}${trade.total===null?'':` of ${formatNumber(trade.total)}`} tokens returned by this hook’s pool records.`;
          message.textContent=trade.nextCursor?'More token records are available.':'All returned token records loaded.';
        }catch(e){if(serial===loadSerial)message.textContent='Could not read more tokens · '+e.message+'. Loaded records remain visible; try again.';}
        finally{busy=false;more.disabled=false;}
      };
    }
    async function load(){
      const serial=++loadSerial,p=parseHookHash(location.hash);
      clearProfileControllers();
      if(!p){$('qd-profile').innerHTML='';status(location.hash?'This hook link is invalid. Enter a chain and a full 20-byte address.':'Enter an address, or open a hook from the board.');return;}
      if(![...form.elements.chainId.options].some(o=>o.value===String(p.chainId)))form.elements.chainId.add(new Option(chainName(p.chainId)+' · board only',String(p.chainId)));
      form.elements.chainId.value=p.chainId;form.elements.address.value=p.address;status('Reading the chain and matching sources…');
      try{
        const h=await requestJSON(`${API}/${p.chainId}/${p.address}`,{cache:'no-store'});if(serial!==loadSerial||parseHookHash(location.hash)?.id!==p.id)return;
        if(!inspectorProfileMatches(h,p))throw new Error('The returned hook record did not match the requested chain and address');
        $('qd-profile').innerHTML=renderProfile(h,watched(p.id));disclose($('qd-profile').querySelector('.qd-permissions'),'All 14 permission bits','qd-perm-more');
        proofController=mountInspectorRepoProof($('qd-repoproof-host'),{profile:h,selection:p,revision:serial,getSelection:()=>({...parseHookHash(location.hash),revision:loadSerial})});
        changesController=mountHookChanges($('qd-hook-changes'),{chainId:p.chainId,hook:p.address,watched:watched(p.id)});wireTrade(p,h,serial);
        status(h.evidence?.status==='ok'?'Live evidence loaded. Each section keeps its own source.':`Live read did not answer · ${h.evidence?.reason || 'reason not returned'}. Snapshot records remain visible.`);
      }catch(e){if(serial===loadSerial){$('qd-profile').innerHTML=empty('Could not read this hook · '+e.message+'. Refresh or try another address.');status('Hook read failed. The address above identifies the requested hook.');}}
    }
    form.addEventListener('submit',e=>{e.preventDefault();const p=parseHookHash(form.elements.chainId.value+':'+form.elements.address.value);if(!p){status('Enter a full 20-byte hook address.');return;}const hash=`#${p.chainId}:${p.address}`;if(location.hash===hash)void load();else location.hash=hash;});addEventListener('hashchange',()=>void load());refresh=load;void load();
  }
  if(main.dataset.discover==='projects') {
    const form=$('qd-project-filters');let registry=[];const initial=new URLSearchParams(location.search);form.elements.q.value=initial.get('q') || '';form.elements.category.value=initial.get('category') || '';
    function draw(){const q=form.elements.q.value.toLowerCase(),category=form.elements.category.value;const items=registry.filter(p=>(!category || p.category===category)&&(!q || [p.name,p.summary,...(p.tags || [])].join(' ').toLowerCase().includes(q))).sort((a,b)=>Number(b.qhooks)-Number(a.qhooks)||a.name.localeCompare(b.name));$('qd-projects').innerHTML=renderProjectCards(items);status(`${items.length} projects shown. QHooks entries come first.`);}
    async function detail(){const serial=++loadSerial;let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{status('Project link is invalid.');return;}if(!id){$('qd-project-detail').innerHTML='';return;}status('Reading project deployments…');try{const p=await requestJSON(`${API}/projects/${encodeURIComponent(id)}`);if(serial!==loadSerial)return;$('qd-project-detail').innerHTML=renderProjectDetail(p);status('Project sources and returned live observations loaded.');}catch(e){if(serial===loadSerial){$('qd-project-detail').innerHTML=empty('Project did not load · '+e.message);status('The selected project could not be read. Choose another project or retry.');}}}
    form.onsubmit=e=>{e.preventDefault();const p=new URLSearchParams(formState(form));history.replaceState(null,'',location.pathname+'?'+p+location.hash);draw();};form.elements.q.oninput=draw;form.elements.category.onchange=()=>form.requestSubmit();addEventListener('hashchange',()=>void detail());
    let detailed=false;const showRegistry=p=>{registry=p.projects || [];for(const c of [...new Set(registry.map(p=>p.category))].filter(Boolean).sort())if(![...form.elements.category.options].some(o=>o.value===c))form.elements.category.add(new Option(c,c));form.elements.category.value=initial.get('category') || '';draw();if(!detailed){detailed=true;void detail();}};
    {const seen=peekJSON(API+'/projects');if(seen)showRegistry(seen);}
    void requestJSON(API+'/projects',{keep:true}).then(showRegistry).catch(e=>{if(!registry.length)fail(e,$('qd-projects'));});refresh=detail;
  }
  if(main.dataset.discover==='compare') {
    const form=$('qd-compare-form');async function load(){const serial=++loadSerial,ids=parseCompareHash(location.hash);if(!ids.length){$('qd-comparison').innerHTML='';status(location.hash?'Enter two to four different valid hook IDs.':'Choose two to four hooks on the board, or enter their IDs above.');return;}form.elements.ids.value=ids.join(',');status('Reading each hook…');try{const b=await requestJSON(API+'/compare?ids='+encodeURIComponent(ids.join(',')));if(serial!==loadSerial)return;$('qd-comparison').innerHTML=renderComparison(b);status('Comparison loaded. Differing rows are highlighted.');}catch(e){if(serial===loadSerial){$('qd-comparison').innerHTML=empty('Comparison did not load · '+e.message);status('The requested hooks could not be compared. Try again or change the IDs.');}}}
    form.onsubmit=e=>{e.preventDefault();const ids=parseCompareHash(form.elements.ids.value);if(!ids.length){status('Use two to four different IDs: chainId_0xaddress, separated by commas.');return;}const hash='#'+ids.join(',');if(location.hash===hash)void load();else location.hash=hash;};addEventListener('hashchange',()=>void load());refresh=load;void load();
  }
  if(main.dataset.discover==='tape') {
    const form=$('qd-tape-filters'), initial=new URLSearchParams(location.search);
    form.elements.chain.value=Object.keys(CHAIN_NAMES).includes(initial.get('chain'))?initial.get('chain'):'';
    form.elements.blocks.value=['1800','10800','43200'].includes(initial.get('blocks'))?initial.get('blocks'):'1800';
    let busy=false, cursors={},generation=0,records={pools:[],swaps:[],activity:null};
    const resolver=createHookNameResolver();
    const params=()=>new URLSearchParams({chain:form.elements.chain.value,blocks:form.elements.blocks.value});
    // New finalized records drop in with a flash; rows already shown stay still.
    const seen={pools:new Set(),swaps:new Set()},primed={pools:false,swaps:false};
    function drawRows(){
      for(const kind of ['pools','swaps']){
        $('qd-'+kind).innerHTML=renderTapeRows({[kind]:records[kind]},kind,records.pools,resolver.names);
        for(const el of $('qd-'+kind).querySelectorAll('[data-event]')){const id=el.dataset.event;if(!seen[kind].has(id)){if(primed[kind])el.classList.add('is-enter');seen[kind].add(id);}}
        if(records[kind].length)primed[kind]=true;
      }
      if(records.activity){$('qd-window').textContent=renderTapeWindow(records.activity);$('qd-activity').innerHTML=renderTapeActivity(records.activity,resolver.names);for(const el of $('qd-activity').querySelectorAll('[data-w]'))el.style.setProperty('--w',el.dataset.w+'%');}
    }
    let refreshedAt=0;const liveEl=$('qd-live');
    if(liveEl)setInterval(()=>{if(!refreshedAt||busy)return;const s=Math.round((Date.now()-refreshedAt)/1000);liveEl.textContent=s<2?'Refreshed just now':`Refreshed ${s}s ago`;},1000);
    function resolveNames(current){
      void resolver.resolve([...records.pools,...records.swaps,...(records.activity?tapeActivityRows(records.activity):[])]).then(()=>{if(current===generation)drawRows();});
    }
    async function load(){
      if(busy)return;busy=true;const current=++generation;
      status('Refreshing confirmed records…');if(liveEl)liveEl.textContent='Refreshing…';$('qd-refresh').disabled=true;for(const el of form.elements)el.disabled=true;
      try{
        const p=params(),kinds=['status','pools','swaps','activity'];
        const urlOf=kind=>API+'/tape/'+kind+'?'+(kind==='activity'?p:new URLSearchParams(kind==='status'?{}:{chain:p.get('chain'),limit:'25'}));
        if(!refreshedAt){const seen=kinds.map(kind=>peekJSON(urlOf(kind)));if(seen.every(Boolean))apply(kinds,seen.map(value=>({status:'fulfilled',value})),p,true);}
        const results=await Promise.allSettled(kinds.map(kind=>requestJSON(urlOf(kind),{keep:true})));
        if(current!==generation)return;
        const failures=apply(kinds,results,p,false);
        drawRows();resolveNames(current);refreshedAt=Date.now();liveEl?.classList.add('is-on');
        status(failures.length?'Some records could not refresh · '+failures.join('; ')+'. Last loaded records remain visible.':'Confirmed records refreshed · '+formatTime(new Date().toISOString()));
      }catch(e){fail(e);}
      finally{busy=false;$('qd-refresh').disabled=false;for(const el of form.elements)el.disabled=false;}
    }
    function apply(kinds,results,p,early){
        const failures=[];
        for(let i=0;i<results.length;i++){
          const kind=kinds[i],result=results[i];
          if(result.status==='rejected'){failures.push(kind+': '+result.reason.message);continue;}
          const body=result.value;
          if(body.error||body.status==='unavailable'){failures.push(kind+': '+plainError(body.reason||body.error||'no answer'));continue;}
          if(kind==='status'){$('qd-coverage').innerHTML=renderTapeStatusCards(body);for(const f of $('qd-coverage').querySelectorAll('.qd-tape-status .qd-facts'))disclose(f,'Coverage details','qd-cov-more');}
          if(kind==='pools'||kind==='swaps'){
            records[kind]=body[kind] || [];cursors[kind]=body.nextCursor;
            $('qd-more-'+kind).hidden=!body.nextCursor;
            $('qd-'+kind+'-json').href=API+'/tape/'+kind+'?'+new URLSearchParams({chain:p.get('chain'),limit:'25'});
          }
          if(kind==='activity'){records.activity=body;$('qd-activity-json').href=API+'/tape/activity?'+p;}
        }
        if(early){drawRows();resolveNames(generation);}
        return failures;
    }
    for(const kind of ['pools','swaps'])$('qd-more-'+kind).onclick=async()=>{
      if(busy || !cursors[kind])return;busy=true;const button=$('qd-more-'+kind);button.disabled=true;
      try{
        const body=await requestJSON(API+'/tape/'+kind+'?'+new URLSearchParams({chain:form.elements.chain.value,limit:'25',cursor:cursors[kind]}));
        records[kind].push(...body[kind]);cursors[kind]=body.nextCursor;button.hidden=!body.nextCursor;drawRows();resolveNames(generation);
      }catch(e){fail(e);}finally{busy=false;button.disabled=false;}
    };
    form.onsubmit=e=>{e.preventDefault();if(busy)return;history.replaceState(null,'',location.pathname+'?'+params());for(const kind of ['coverage','pools','swaps','activity'])$('qd-'+kind).innerHTML='';cursors={};records={pools:[],swaps:[],activity:null};void load();};
    $('qd-refresh').onclick=()=>void load();let timer;
    const startTimer=()=>{clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)void load();},30000);};
    startTimer();addEventListener('pagehide',()=>clearInterval(timer));addEventListener('pageshow',startTimer);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});refresh=load;void load();
  }
}
if(typeof document!=='undefined')boot();
