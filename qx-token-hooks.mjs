import {LIVE} from './chains.mjs';
// A small, same-origin pool reader for token views and Discover profiles.
const ADDRESS = /^0x[\da-f]{40}$/i;
const ZERO = '0x' + '0'.repeat(40);
const mounted = new WeakMap();
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compact = value => String(value).slice(0,6) + '…' + String(value).slice(-4);
const chains = Object.fromEntries(LIVE.map(c=>[c.id,c.name]));
const marks = {'swap-amounts':'Swap amounts','swap-rules':'Swap','swap-callbacks':'Swap','add-liquidity':'Add liquidity','remove-liquidity':'Remove liquidity','liquidity-amounts':'Liquidity amounts','initialize':'Initialize','donate':'Donate'};

export function tokenHooksKey(input = {}) {
  const {chainId,token}=input || {};
  const chain = String(chainId ?? '');
  return /^[1-9]\d{0,14}$/.test(chain) && Number.isSafeInteger(Number(chain)) && ADDRESS.test(String(token ?? '')) ? {chainId:Number(chain),token:token.toLowerCase()} : null;
}

export function tokenHooksURL(input, cursor = null) {
  const key = tokenHooksKey(input);
  if (!key) throw new TypeError('Choose a chain and a complete token address.');
  const query = new URLSearchParams({limit:'50'});
  if (cursor != null && cursor !== '') query.set('cursor', String(cursor));
  return `/api/v1/tokens/${key.chainId}/${key.token}/hooks?${query}`;
}

export function createTokenHooksState() {
  return {pools:[],nextCursor:null,complete:null,source:null,observedAt:null,loaded:false,loading:false,error:null,visited:[],paginationPaused:false};
}

// Append by pool identity; an empty page can still advance the history cursor.
export function applyTokenHooksPage(state, page, requestedCursor = null) {
  if (!page || !Array.isArray(page.pools)) throw new TypeError('The pool response did not arrive.');
  const poolMap = new Map(state.pools.map(pool => [String(pool.poolId).toLowerCase(),pool]));
  for (const pool of page.pools) {
    if (pool && typeof pool.poolId === 'string' && pool.poolId && ADDRESS.test(currencyAddress(pool.currency0)) && ADDRESS.test(currencyAddress(pool.currency1))) poolMap.set(pool.poolId.toLowerCase(),pool);
  }
  const visited = [...state.visited];
  if (requestedCursor != null && !visited.includes(String(requestedCursor))) visited.push(String(requestedCursor));
  const cursor = page.nextCursor == null || page.nextCursor === '' ? null : String(page.nextCursor);
  const paginationPaused = cursor != null && visited.includes(cursor);
  return {...state,pools:[...poolMap.values()],nextCursor:paginationPaused?null:cursor,complete:typeof page.complete === 'boolean'?page.complete:null,source:page.source??null,observedAt:page.observedAt??null,loaded:true,loading:false,error:null,visited,paginationPaused};
}

function currencyAddress(currency) { return typeof currency === 'string' ? currency : String(currency?.address ?? ''); }
function currencyHTML(currency) {
  const address=currencyAddress(currency);
  const label=address.toLowerCase()===ZERO?'Native token':typeof currency==='object'&&currency?.symbol?currency.symbol:compact(address);
  return `<span title="${escapeHTML(address)}">${escapeHTML(label)}</span>`;
}
function time(value) {
  if (value == null || value === '') return 'time not reported';
  const date=new Date(value);
  return Number.isNaN(+date)?'time not reported':date.toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' UTC';
}
function number(value) { return value==null||value===''||!Number.isFinite(Number(value))?'not reported':Number(value).toLocaleString('en-US',{maximumFractionDigits:4}); }
function sourceName(source) {
  if (Array.isArray(source)) return source.map(sourceName).join(', ');
  if (source && typeof source==='object') return String(source.label || source.name || source.used || 'Source not reported');
  return source ? String(source) : 'Source not reported';
}
export function tokenPoolFee(pool = {}) {
  const mode=String(pool.feeMode || '').toLowerCase(), fee=pool.fee;
  if (mode==='dynamic' || (Number.isSafeInteger(fee) && Boolean(fee & 0x800000))) return 'Dynamic LP fee · can vary per swap';
  if (mode==='fixed' || mode==='static') return `Fixed LP fee · ${fee!=null&&fee!==''&&Number.isFinite(Number(fee))?number(Number(fee)/10000)+'%':'rate not reported'}`;
  return `LP fee mode not reported${fee!=null&&fee!==''&&Number.isFinite(Number(fee))?' · '+number(Number(fee)/10000)+'%':''}`;
}
function poolHTML(pool, key, tags = null) {
  const hook=pool.hook, hookAddress=typeof hook?.address==='string'?hook.address.toLowerCase():null;
  const hasHook=hookAddress && ADDRESS.test(hookAddress) && hookAddress!==ZERO;
  const noHook=hook===null || hookAddress===ZERO;
  const label=hasHook?hook.name||compact(hookAddress):noHook?'No hook':'Hook not reported';
  const capabilities=hasHook&&Array.isArray(hook.capabilities)?hook.capabilities:[];
  return `<li class="qth-pool"><div class="qth-pool-top"><strong>${escapeHTML(label)}</strong>${officialTagHTML(pool, tags)}<span class="qth-fee">${escapeHTML(tokenPoolFee(pool))}</span></div><p class="qth-pair">${currencyHTML(pool.currency0)} <span aria-label="paired with">/</span> ${currencyHTML(pool.currency1)}</p><div class="qth-capabilities" aria-label="Permission capabilities">${capabilities.map(cap=>`<span title="${escapeHTML([cap.title,cap.detail].filter(Boolean).join(' · '))}">${escapeHTML(marks[cap.id]||cap.title||'Capability')}</span>`).join('') || `<span class="qth-muted">${hasHook?'No capability tokens reported':noHook?'No hook callbacks':'Capabilities not reported'}</span>`}</div><div class="qth-pool-bottom"><span class="qth-muted" title="${escapeHTML(pool.poolId)}">Pool ${escapeHTML(compact(pool.poolId))}${pool.initializedAt?.block!=null?' · block '+escapeHTML(number(pool.initializedAt.block)):''}${pool.initializedAt?.at?' · '+escapeHTML(time(pool.initializedAt.at)):''}</span>${hasHook?`<span class="qth-links"><a href="/discover-hook#${key.chainId}:${hookAddress}">Profile ↗</a><a href="/discover?chain=${key.chainId}&amp;q=${hookAddress}">Hook board ↗</a></span>`:''}</div></li>`;
}

// For a QHooks launch token: its own pools say "Official QHooks pool"; any other pool "Unofficial · <fee>%".
function officialTagHTML(pool, tags) {
  if (!tags?.official) return '';
  const id = String(pool.poolId || '').toLowerCase();
  if (tags.own.has(id)) return '<span class="qth-official">Official QHooks pool</span>';
  const fee = Number.isSafeInteger(pool.fee) && !(pool.fee & 0x800000) ? pool.fee / 10000 : null;
  return '<span class="qth-unofficial">Unofficial' + (fee != null ? ' · ' + escapeHTML(String(Math.round(fee * 10) / 10)) + '%' : '') + '</span>';
}
export function tokenHooksHTML(state, input, tags = null) {
  const key=tokenHooksKey(input);
  if (!key) return '<div class="qth-widget"><p class="qth-message" role="status">Choose a chain and a complete token address.</p></div>';
  const history=state.complete===false?'History is still being read.':state.complete===true?'History read complete.':'History coverage not reported.';
  const source=state.loaded?`${sourceName(state.source)} · ${time(state.observedAt)} · ${history}`:'Reading finalized pool records…';
  const body=state.pools.length?`<ul class="qth-pools">${state.pools.map(pool=>poolHTML(pool,key,tags)).join('')}</ul>`:state.loaded?`<p class="qth-message">${state.complete===true?'No v4 pools found for this token.':state.complete===false?'No v4 pools found so far. History is still being read.':'No v4 pools were returned. History coverage not reported.'}</p>`:'';
  const action=state.error?'retry':state.paginationPaused?'reload':state.nextCursor!=null?'more':state.loaded&&state.complete!==true?'reload':null;
  const actionLabel=state.error?'Retry':state.paginationPaused?'Refresh history':action==='more'?'Load more':'Read more history';
  return `<div class="qth-widget" aria-label="Hooks this token trades through"><div class="qth-heading"><span>V4 pools <span class="qth-muted">· ${escapeHTML(chains[key.chainId]||'Chain '+key.chainId)}</span></span>${state.loaded?`<span class="qth-count">${state.pools.length} shown</span>`:''}</div><p class="qth-source" role="status">${escapeHTML(source)}</p>${body}${state.paginationPaused?'<p class="qth-message">The history cursor has not advanced. Refresh to try again.</p>':''}${state.error?`<p class="qth-message qth-error" role="status">Pool read unavailable · ${escapeHTML(state.error)}${state.pools.length?'. Previously read pools remain visible.':''}</p>`:''}${action?`<button type="button" class="qth-more" data-qth-action="${action}"${state.loading?' disabled':''}>${state.loading?'Reading…':actionLabel}</button>`:''}</div>`;
}

function loadStyles(doc) {
  if (!doc?.head || doc.querySelector('link[data-qth-styles]')) return;
  const link=doc.createElement('link'); link.rel='stylesheet'; link.href=new URL('./qx-token-hooks.css',import.meta.url).href; link.dataset.qthStyles=''; doc.head.append(link);
}

export function renderTokenHooks(el, {chainId, token, fetcher = globalThis.fetch, timeoutMs = 12000} = {}) {
  if (!el || typeof el.addEventListener!=='function') throw new TypeError('A token-hooks element is required.');
  const key=tokenHooksKey({chainId,token}), previous=mounted.get(el);
  if (previous && previous.key===JSON.stringify(key)) return previous;
  previous?.destroy();
  loadStyles(el.ownerDocument || globalThis.document);
  let state=createTokenHooksState(), destroyed=false, controller, retryCursor=null, retryReset=false, request, tags=null;
  if (key) fetcher('/api/terminal/official-pools?chain='+key.chainId+'&token='+key.token,{headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():null).then(d=>{if(d?.official){tags={official:true,own:new Set((d.officialPools||[]).map(p=>String(p.id).toLowerCase()))};draw();}}).catch(()=>{});
  const draw=()=>{if(!destroyed){el.innerHTML=tokenHooksHTML(state,key,tags);el.setAttribute('aria-busy',String(state.loading));}};
  const load=async(cursor=null, reset=false)=>{
    if (destroyed || state.loading || !key) return;
    state={...state,loading:true,error:null}; retryCursor=cursor; retryReset=reset; draw();
    request=new AbortController();
    const currentRequest=request,timer=setTimeout(()=>currentRequest.abort('timeout'),timeoutMs);
    try {
      const cancelled=new Promise((_,reject)=>currentRequest.signal.addEventListener('abort',()=>reject(new Error(currentRequest.signal.reason==='timeout'?'Pool read timed out':'Pool read cancelled')),{once:true}));
      const read=async()=>{const response=await fetcher(tokenHooksURL(key,cursor),{headers:{Accept:'application/json'},signal:currentRequest.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();};
      const page=await Promise.race([read(),cancelled]);
      if (page.status==='unavailable' || page.error) throw new Error(page.reason || page.error || 'Pool read did not answer');
      const pageKey=tokenHooksKey(page);
      if (!pageKey || pageKey.chainId!==key.chainId || pageKey.token!==key.token) throw new Error('The pool response belongs to another token.');
      if (destroyed) return;
      // A refresh keeps already read rows, including when a history scan is partial.
      const base=reset?{...state,visited:[],paginationPaused:false}:state;
      state=applyTokenHooksPage(base,page,cursor);
    } catch (error) {
      if (destroyed) return;
      state={...state,loading:false,error:error?.message || 'Pool read did not answer'};
    } finally {clearTimeout(timer);}
    draw();
    return state;
  };
  const click=event=>{
    const button=event.target?.closest?.('[data-qth-action]');
    if (!button || !el.contains(button)) return;
    const action=button.dataset.qthAction;
    if (action==='retry') void load(retryCursor,retryReset);
    else if (action==='more') void load(state.nextCursor);
    else if (action==='reload') void load(null,true);
  };
  el.addEventListener('click',click);
  controller={key:JSON.stringify(key),get state(){return state;},loadMore:()=>state.nextCursor==null?Promise.resolve(state):load(state.nextCursor),reload:()=>load(null,true),retry:()=>load(retryCursor,retryReset),destroy(){if(destroyed)return;destroyed=true;request?.abort();el.removeEventListener('click',click);if(mounted.get(el)===controller)mounted.delete(el);},ready:null};
  mounted.set(el,controller); draw(); controller.ready=key?load():Promise.resolve(state);
  return controller;
}

export function mountTokenHooks(root = globalThis.document) {
  if (!root?.querySelectorAll) return [];
  const targets=[...(root.matches?.('[data-token-hooks]')?[root]:[]),...root.querySelectorAll('[data-token-hooks]')];
  return targets.map(el=>renderTokenHooks(el,{chainId:el.dataset.chain,token:el.dataset.token}));
}

if (typeof document!=='undefined') {
  const boot=()=>{
    mountTokenHooks(document);
    if (typeof MutationObserver==='function') new MutationObserver(records=>{
      for (const record of records) {
        if (record.type==='attributes') mountTokenHooks(record.target);
        for (const node of record.addedNodes || []) if (node.nodeType===1) mountTokenHooks(node);
      }
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-chain','data-token']});
  };
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
}
