import {chainById} from './chains.mjs';
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {evaluateCatalogue, checkBalance, keeperTransaction, GROUPS, MANUAL_KEY} from './qx-taps-core.mjs';

// Coalesce reads into batches of 20; each chain drains independently.
export function createReadClient({fetchImpl = globalThis.fetch, origin = '', relay = true, elysiumInterval = 250, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now} = {}) {
  const chains = new Map(), memo = new Map(), networks = {};
  let nextId = 0;
  const url = path => origin ? new URL(path, origin).href : path;
  async function fetchTimed(path, options = {}) {
    const r = await fetchImpl(url(path), {...options, signal: AbortSignal.timeout(8000)});
    if (!r.ok) throw Object.assign(Error(`Read returned HTTP ${r.status}`), {status: r.status});
    return r;
  }
  const fetchJson = async path => (await fetchTimed(path, {cache: 'no-store'})).json();
  const envelope = task => ({jsonrpc: '2.0', id: task.id, method: task.method, params: task.params});
  function decode(entry, task) {
    if (entry?.error) {
      const error = Object.assign(Error(entry.error.message || 'RPC read did not complete'), {data: entry.error.data});
      error.semantic = /revert/i.test(entry.error.message || '') || [-32600, -32601, -32602].includes(entry.error.code);
      return {error};
    }
    if (!entry || !Object.hasOwn(entry, 'result') || (entry.result == null && task.method !== 'eth_getTransactionReceipt')) return {error: Error('Incomplete RPC response')};
    return {value: entry.result};
  }
  async function request(queue, endpoint, body) {
    if (queue.id === '99901') {
      const pause = elysiumInterval - (now() - queue.last);
      if (pause > 0) await sleep(pause);
    }
    try {
      const response = await fetchTimed(endpoint, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
      return await response.json();
    } finally { queue.last = now(); }
  }
  async function batch(queue, endpoint, tasks) {
    const entries = await request(queue, endpoint, tasks.map(envelope));
    if (!Array.isArray(entries) || entries.length !== tasks.length) throw Error('RPC batch was not accepted');
    const byId = new Map(entries.map(entry => [String(entry?.id), entry]));
    if (byId.size !== tasks.length || tasks.some(task => !byId.has(String(task.id)))) throw Error('Incomplete RPC batch');
    return tasks.map(task => decode(byId.get(String(task.id)), task));
  }
  const settle = (task, answer) => answer.error ? task.reject(answer.error) : task.resolve(answer.value);
  async function single(queue, endpoint, task) {
    if (queue.stopped) { task.reject(queue.stopped); return; }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const answer = decode(await request(queue, endpoint, envelope(task)), task);
        if (answer.error) throw answer.error;
        task.resolve(answer.value); return;
      } catch (e) {
        if (e.semantic) { task.reject(e); return; }
        if (attempt === 2) { queue.stopped = e; task.reject(e); return; }
        await sleep(400 * 2 ** attempt);
      }
    }
  }
  async function singles(queue, endpoint, tasks) {
    if (!tasks.length) return;
    // Probe before fanning out: a down endpoint should not receive 20 retries at once.
    await single(queue, endpoint, tasks[0]);
    if (queue.id === '99901') for (const task of tasks.slice(1)) await single(queue, endpoint, task);
    else await Promise.all(tasks.slice(1).map(task => single(queue, endpoint, task)));
  }
  async function readGroup(queue, tasks) {
    if (queue.stopped) { for (const task of tasks) task.reject(queue.stopped); return; }
    let network = chainById(queue.id) || networks[queue.id];
    if (!network) network = (await fetchJson('/full-launch/chain-setup-v1.json')).chains?.[queue.id]?.network;
    if (!network?.rpc) throw Error('No read network in the setup manifest');
    let remaining = tasks;
    if (relay && ['4663', '99901'].includes(queue.id)) {
      try {
        const answers = await batch(queue, '/api/rpc/' + queue.id, tasks);
        remaining = tasks.filter((task, i) => {
          if (answers[i].error && !answers[i].error.semantic) return true;
          settle(task, answers[i]); return false;
        });
      } catch { /* Read the public endpoint when the relay cannot answer this batch. */ }
    }
    if (!remaining.length) return;
    if (!queue.single) {
      try {
        const answers = await batch(queue, network.rpc, remaining);
        remaining = remaining.filter((task, i) => {
          if (answers[i].error && !answers[i].error.semantic) return true;
          settle(task, answers[i]); return false;
        });
      } catch { /* A public endpoint may support individual calls only. */ }
      if (!remaining.length) return;
      queue.single = true;
    }
    await singles(queue, network.rpc, remaining);
  }
  async function drain(queue) {
    if (queue.running) return;
    queue.running = true;
    try {
      while (queue.pending.length) {
        const tasks = queue.pending.splice(0, 20);
        try { await readGroup(queue, tasks); }
        catch (e) { queue.stopped = e; for (const task of tasks) task.reject(e); }
      }
    } finally { queue.running = false; }
  }
  function rpc(chainId, method, params) {
    if (!['eth_getCode', 'eth_getBalance', 'eth_call', 'eth_getBlockByNumber', 'eth_getTransactionReceipt', 'eth_gasPrice'].includes(method)) return Promise.reject(Error('Only checklist reads are allowed'));
    const id = String(chainId), key = JSON.stringify([id, method, params]);
    if (memo.has(key)) return memo.get(key);
    let queue = chains.get(id);
    if (!queue) { queue = {id, pending: [], running: false, single: false, last: -Infinity, stopped: null}; chains.set(id, queue); }
    const promise = new Promise((resolve, reject) => queue.pending.push({id: ++nextId, method, params, resolve, reject}));
    memo.set(key, promise);
    if (!queue.scheduled) {
      queue.scheduled = true;
      queueMicrotask(() => queueMicrotask(() => { queue.scheduled = false; drain(queue); }));
    }
    return promise;
  }
  return {
    rpc, fetchJson,
    request: (u, init = {}) => fetchImpl(u, {...init, cache: 'no-store', signal: AbortSignal.timeout(8000)}),
    registerNetwork(id, network) { networks[id] = network; },
    async sourceExists(path) { try { await fetchTimed(path, {method: 'HEAD', cache: 'no-store'}); return true; } catch (e) { if (e.status === 404) return false; return true; } },
    begin() { memo.clear(); for (const queue of chains.values()) queue.stopped = null; },
  };
}

export function mountTaps({document: doc = document, target = window, hub = getWalletHub(target), io = createReadClient(), auto = true} = {}) {
  const root = doc.getElementById('taps-root'), progress = doc.getElementById('taps-progress');
  const refreshing = doc.getElementById('taps-refreshing'), again = doc.getElementById('taps-again'), message = doc.getElementById('taps-status');
  const el = (tag, attrs = {}, ...children) => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : String(v));
    n.append(...children.flat().filter(c => c != null)); return n;
  };
  const submitted = new Map();
  let storage = null; try { storage = target.localStorage; } catch {}
  let catalogue, result, checking = false, sending = null, disposed = false, renderQueued = false;
  const update = partial => {
    result = partial;
    if (renderQueued || disposed) return;
    renderQueued = true;
    const paint = () => { renderQueued = false; draw(); };
    if (target.requestAnimationFrame) target.requestAnimationFrame(paint); else queueMicrotask(paint);
  };
  const say = text => { message.textContent = text; };
  function draw() {
    if (disposed) return;
    progress.textContent = result && result.progress.total != null ? `${result.progress.done} of ${result.progress.total} done` : 'Checking setup…';
    refreshing.hidden = !checking;
    again.disabled = checking || !!sending;
    root.setAttribute('aria-busy', String(checking));
    if (!result) {
      root.replaceChildren(...GROUPS.map(g => el('section', {class: 'taps-section'}, el('h2', {}, g.label), el('p', {class: 'taps-checking'}, 'Checking setup… Refreshing'))));
      return;
    }
    const sections = result.groups.map(group => {
      const section = el('section', {class: 'taps-section', 'aria-labelledby': 'taps-' + group.id}, el('h2', {id: 'taps-' + group.id}, group.label));
      if (group.checking) section.append(el('p', {class: 'taps-checking'}, `Checking ${group.checking} more step${group.checking === 1 ? '' : 's'}… Refreshing`));
      if (!group.rows.length && !group.checking) section.append(el('p', {class: 'taps-empty'}, 'Nothing waiting here.'));
      for (const row of group.rows) {
        const icons = el('div', {class: 'taps-chains', 'aria-label': row.chains.map(c => c.name).join(', ')});
        if (!['perpsBuilder', 'privyFlags', 'manual'].includes(row.kind)) for (const c of row.chains) if (c.icon) icons.append(el('img', {src: `/chain-symbol-icons/${c.icon}.svg`, alt: c.name, width: 24, height: 24}));
        const body = el('div', {class: 'taps-row-body'}, icons, el('p', {class: 'taps-sentence'}, row.text));
        if (row.first) body.append(el('p', {class: 'taps-first'}, row.first));
        if (row.gasNote) {
          // Gas on a chain the wallet may not hold yet (Monad: about 14.35M gas, keep twice the cost): one tap opens Move
          // funds toward that chain, the same call /create uses.
          const get = el('button', {type: 'button', class: 'taps-undo taps-get-gas'}, row.gasNote.button || 'Get gas');
          get.addEventListener('click', () => import('/qx-move-funds.mjs').then(m => m.openMoveFunds({to: Number(row.gasNote.moveTo)})).catch(() => say('Refreshing… Open Move funds from your wallet menu.')));
          body.append(el('p', {class: 'taps-note'}, row.gasNote.text + ' ', get));
        }
        for (const step of row.steps) if (step.costText) body.append(el('p', {class: 'taps-cost'}, `${step.name}: estimated gas ${step.costText}`));
        let button;
        if (row.kind === 'balanceMin') {
          body.append(el('p', {class: 'taps-destination'}, 'To ', el('span', {}, row.address)));
          const connected = hub.snapshot().current;
          if (submitted.has(row.id)) body.append(el('p', {class: 'taps-note'}, 'Sent. Waiting for the network; check your wallet activity.'));
          if (!connected) body.append(el('p', {class: 'taps-note'}, 'Connect your wallet above to send.'));
          button = el('button', {type: 'button', class: 'taps-action', disabled: !connected || row.status !== 'pending' || checking || !!sending || submitted.has(row.id)}, row.button);
          button.addEventListener('click', () => sendTopUp(row));
        } else if (row.button) button = el('a', {class: 'taps-action', href: row.href, ...(/^https:/.test(row.href || '') ? {target: '_blank', rel: 'noopener'} : {})}, row.button);
        if (row.note) body.append(el('p', {class: 'taps-note'}, row.note));
        if (row.kind === 'manual') {
          // Not readable from any public source: the owner marks it done on this device (main thread, 2026-11-11).
          const mark = el('button', {type: 'button', class: 'taps-action taps-mark'}, 'Mark done');
          mark.addEventListener('click', () => { try { storage?.setItem(MANUAL_KEY(row.rowKey), new Date().toISOString()); } catch {} refresh(); });
          body.append(el('div', {class: 'taps-actions'}, button, mark));
        } else if (button) body.append(button);
        const article = el('article', {class: 'taps-row'}, body);
        if (row.next.length) article.append(el('ul', {class: 'taps-next'}, ...row.next.map(s => el('li', {}, s.text))));
        section.append(article);
      }
      return section;
    });
    const details = el('details', {class: 'taps-done'}, el('summary', {}, `Done (${result.done.length})`),
      el('ul', {}, ...result.done.map(s => {
        const li = el('li', {}, `${s.name} · ${s.chain.name}`);
        if (s.manual) { const undo = el('button', {type: 'button', class: 'taps-undo'}, 'Undo'); undo.addEventListener('click', () => { try { storage?.removeItem(MANUAL_KEY(s.rowKey)); } catch {} refresh(); }); li.append(' · marked done on this device ', undo); }
        return li;
      })));
    // A refresh preserves the owner's choice to expand the completed list.
    if (root.querySelector('details')?.open) details.open = true;
    const estimate = result.ethereum?.pending && result.ethereum.ready ? [el('p', {class: 'taps-ethereum-total'}, result.ethereum.text)] : [];
    root.replaceChildren(...estimate, ...sections, details);
  }
  async function refresh() {
    if (checking || sending || disposed) return;
    // A re-check keeps the last full result on screen and swaps in the new one when it completes (lead review
    // 2026-11-10: the 60 s auto re-check blanked the list to "Checking setup…"). Only the first load paints progressively.
    const previous = result;
    checking = true; io.begin?.(); draw();
    try {
      catalogue = await io.fetchJson('/full-launch/taps-steps-v1.json');
      const json = new Map(), sources = new Map();
      const cycle = {...io, storage, fetchJson(path) {
        if (!json.has(path)) json.set(path, Promise.resolve().then(() => io.fetchJson(path)));
        return json.get(path);
      }};
      if (io.sourceExists) cycle.sourceExists = path => {
        if (!sources.has(path)) sources.set(path, Promise.resolve().then(() => io.sourceExists(path)));
        return sources.get(path);
      };
      result = await evaluateCatalogue(catalogue, cycle, {onUpdate: partial => { if (!previous) update(partial); }});
      for (const [id, tx] of submitted) {
        const step = result.steps.find(s => s.id === id);
        if (step?.status === 'done') { submitted.delete(id); continue; }
        try { const receipt = await io.rpc(tx.chain, 'eth_getTransactionReceipt', [tx.hash]); if (receipt?.status === '0x1' || receipt?.status === '0x0') submitted.delete(id); } catch {}
      }
      say('');
    } catch { say('Refreshing… Tap Check again to try another read.'); }
    finally { checking = false; draw(); }
  }
  async function sendTopUp(row) {
    if (sending || checking || submitted.has(row.id) || row.status !== 'pending') return;
    let conn = hub.snapshot().current;
    if (!conn) return;
    const owner = conn.owner, provider = conn.entry.provider;
    sending = row.id;
    say(`Send ${row.amount} ${row.chain.symbol} to ${row.address}.`); draw();
    try {
      if (String(conn.chainId) !== row.chainId) {
        conn = await hub.switchChain(row.chainId);
        if (!conn || String(conn.chainId) !== row.chainId) throw Error('Switch the wallet network and try again.');
      }
      // A fresh balance read cannot reuse this cycle's cached balance.
      io.begin?.();
      const checked = await checkBalance({address: row.address}, {id: row.chainId, target: row.target}, io.rpc);
      if (checked.status === 'done') { say('Keeper gas is topped up.'); return; }
      if (checked.wei !== row.wei) { say('The balance changed. Check the new amount, then tap Send again.'); return; }
      const current = hub.snapshot().current;
      if (!current || current.owner !== owner || current.entry.provider !== provider || String(current.chainId) !== row.chainId) throw Error('Your wallet changed. Check it and try again.');
      const tx = keeperTransaction({...row, ...checked}, current);
      say(`Confirm ${row.amount} ${row.chain.symbol} to ${row.address} in your wallet.`);
      const hash = await provider.request({method: 'eth_sendTransaction', params: [tx]});
      submitted.set(row.id, {chain: row.chainId, hash});
      say('Sent. Check your wallet activity while the network confirms.');
    } catch (e) {
      say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet.' : 'Refreshing… Check your wallet and tap Check again before trying another send.');
    } finally {
      sending = null;
      // Refresh the list without clearing the wallet outcome message.
      const outcome = message.textContent;
      await refresh(); say(outcome);
    }
  }
  const unsubscribe = hub.subscribe(() => draw());
  again.addEventListener('click', refresh);
  const visible = () => { if (doc.visibilityState === 'visible') refresh(); };
  doc.addEventListener('visibilitychange', visible);
  const timer = auto ? target.setInterval(visible, 60000) : null;
  const ready = refresh();
  return {ready, refresh, getResult: () => result, dispose() { disposed = true; unsubscribe(); again.removeEventListener('click', refresh); doc.removeEventListener('visibilitychange', visible); if (timer != null) target.clearInterval(timer); }};
}
if (typeof window !== 'undefined' && document.getElementById('taps-root')) mountTaps();
