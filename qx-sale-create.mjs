// /create → "Sale first": opens a QSaleLaunch sale (fixed or falling price) in one transaction, then links to its sale
// page. Only on chains whose sale contract has code (Randall's /chain-setup?set=sale tap); elsewhere the card says so.
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {chainById, visibleChains} from './chains.mjs';
import {SEL, feeFields, saleAddress, planSale, encodeCreateSale, parseSaleCreated, saleLink, randomSalt, fromWei, compact, SALE_TOKENS, WINDOWS, START_MULTIPLES, META_LIMIT} from './qx-sale-core.mjs';

const root = document.getElementById('qsf-root'), hub = getWalletHub(window);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } n.append(...kids.flat().filter(k => k != null && k !== false)); return n; };
const chains = visibleChains().filter(c => saleAddress(c.id));
let image = '', busy = false, live = new Map(), fee = new Map();

async function rpc(c, method, params) {
  const r = await fetch(c.rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) throw Error(j.error.message); return j.result;
}
async function check(id) {
  if (live.has(id)) return live.get(id);
  const c = chainById(id), a = saleAddress(id);
  let ok = false;
  try {
    ok = (await rpc(c, 'eth_getCode', [a, 'latest'])).length > 2;
    // chain() = (manager, wrapped, launchFee, platform): the launch fee is the third word.
    if (ok) fee.set(id, BigInt('0x' + (await rpc(c, 'eth_call', [{to: a, data: SEL.launchFee}, 'latest'])).slice(130, 194)));
  } catch { ok = false; }
  live.set(id, ok); return ok;
}

function thumbnail(file) {
  return (async () => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw Error('Choose a PNG, JPEG or WebP image.');
    if (file.size > 8e6) throw Error('Choose an image under 8 MB.');
    const bitmap = await createImageBitmap(file), side = Math.min(bitmap.width, bitmap.height);
    for (const [px, qq] of [[96, .82], [80, .78], [64, .74], [64, .6], [48, .6]]) {
      const canvas = el('canvas', {width: px, height: px}), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fbf9f4'; ctx.fillRect(0, 0, px, px);
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, px, px);
      const url = canvas.toDataURL('image/jpeg', qq); if (url.length <= META_LIMIT - 300) return url;
    }
    throw Error('That image is too detailed to store. Try a simpler one.');
  })();
}

// The card stays hidden (fail closed) until at least one chain's QSaleLaunch has code; only those chains are offered.
async function mount() {
  if (!root) return;
  root.hidden = true;
  const ok = await Promise.all(chains.map(c => check(c.id).catch(() => false)));
  const ready = chains.filter((c, i) => ok[i] === true);
  if (!ready.length) { root.replaceChildren(); return; }
  const chainSel = el('select', {id: 'qsf-chain'}, ...ready.map(c => el('option', {value: c.id}, c.name)));
  const name = el('input', {id: 'qsf-name', maxlength: '64', autocomplete: 'off', placeholder: 'Token name'});
  const symbol = el('input', {id: 'qsf-symbol', maxlength: '10', autocomplete: 'off', placeholder: 'TICKER'});
  const file = el('input', {id: 'qsf-image', type: 'file', accept: 'image/png,image/jpeg,image/webp'});
  const preview = el('img', {class: 'qsf-preview', alt: 'Token image preview', hidden: true});
  const fixed = el('input', {type: 'radio', name: 'qsf-style', value: 'fixed', checked: true}), falling = el('input', {type: 'radio', name: 'qsf-style', value: 'falling'});
  const raise = el('input', {id: 'qsf-raise', inputmode: 'decimal', autocomplete: 'off', value: '1'});
  const raiseLabel = el('span', {}, ''), minLabel = el('span', {}, '');
  const multiple = el('select', {id: 'qsf-multiple'}, ...START_MULTIPLES.map(m => el('option', {value: String(m), selected: m === 4}, m + '× the floor')));
  const multRow = el('label', {}, 'Starting price', multiple);
  const minimum = el('input', {id: 'qsf-min', inputmode: 'decimal', autocomplete: 'off', value: '0.25'});
  const window_ = el('select', {id: 'qsf-window'}, ...WINDOWS.map(([w, t]) => el('option', {value: String(w), selected: w === 86400}, t)));
  const walletCap = el('input', {id: 'qsf-cap', inputmode: 'decimal', autocomplete: 'off', placeholder: 'No limit'});
  const summary = el('p', {class: 'qsf-summary', id: 'qsf-summary', 'aria-live': 'polite'});
  const go = el('button', {type: 'button', id: 'qsf-go', class: 'qxc-primary'}, 'Open the sale');
  const msg = el('p', {class: 'qxc-message', id: 'qsf-message', role: 'status', 'aria-live': 'polite'});
  const done = el('p', {id: 'qsf-done', hidden: true});
  const style = () => falling.checked ? 'falling' : 'fixed';
  const unit = () => chainById(chainSel.value)?.native || 'ETH';
  const plan = () => planSale({name: name.value, symbol: symbol.value, image, style: style(), raise: raise.value, minimum: minimum.value, window: Number(window_.value),
    walletCap: walletCap.value, multiple: Number(multiple.value), salt: '0x' + '0'.repeat(64)});
  async function render() {
    multRow.hidden = style() !== 'falling';
    minLabel.textContent = 'Minimum to go ahead (' + unit() + ')';
    raiseLabel.textContent = style() === 'falling' ? 'Raise if it sells at the floor (' + unit() + ')' : 'Raise if it sells out (' + unit() + ')';
    const on = await check(chainSel.value);
    let p = null, err = '';
    try { p = plan(); } catch (e) { err = e.message; }
    if (p) {
      const per1M = v => fromWei(v * 10n ** 6n, 8) + ' ' + unit();
      summary.textContent = style() === 'falling'
        ? `500M tokens on sale. The price starts at ${per1M(p.price)} per 1M and falls to ${per1M(p.floorPrice)} per 1M over ${window_.selectedOptions[0].text}. It can raise up to ${fromWei(p.hardCap)} ${unit()}; everyone pays the same final price. Needs ${fromWei(p.softCap)} ${unit()} or everyone is refunded.`
        : `500M tokens at ${per1M(p.price)} per 1M, up to ${fromWei(p.hardCap)} ${unit()} over ${window_.selectedOptions[0].text}. Needs ${fromWei(p.softCap)} ${unit()} or everyone is refunded. All the money raised plus the same value in tokens become a locked Uniswap pool at the sale price.`;
    } else summary.textContent = err;
    const conn = hub.snapshot().current;
    go.disabled = busy || !on || !p;
    go.textContent = !conn ? 'Connect wallet' : busy ? 'Working…' : 'Open the sale';
    if (!on) msg.textContent = 'Sale-first launches open on ' + chainById(chainSel.value).name + ' once its sale contract is set up.';
    else if (!busy && msg.dataset.sticky !== '1') msg.textContent = fee.has(chainSel.value) ? 'Cost: the ' + fromWei(fee.get(chainSel.value)) + ' ' + unit() + ' launch fee plus network gas.' : '';
  }
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    try { image = await thumbnail(f); preview.src = image; preview.hidden = false; } catch (e) { image = ''; preview.hidden = true; msg.textContent = e.message; }
    void render();
  });
  for (const x of [chainSel, name, symbol, fixed, falling, raise, multiple, minimum, window_, walletCap]) x.addEventListener(x.tagName === 'SELECT' || x.type === 'radio' ? 'change' : 'input', () => { if (x === symbol) symbol.value = symbol.value.toUpperCase(); msg.dataset.sticky = ''; void render(); });
  go.addEventListener('click', () => void open());
  hub.subscribe(() => void render());

  async function open() {
    if (busy) return;
    let conn = hub.snapshot().current; if (!conn) { hub.open(); return; }
    const id = chainSel.value, c = chainById(id), a = saleAddress(id);
    let p;
    try { p = planSale({name: name.value, symbol: symbol.value, image, style: style(), raise: raise.value, minimum: minimum.value, window: Number(window_.value), walletCap: walletCap.value, multiple: Number(multiple.value), salt: randomSalt()}); }
    catch (e) { msg.textContent = e.message; msg.dataset.sticky = '1'; return; }
    busy = true; msg.dataset.sticky = '1'; void render();
    try {
      if (conn.chainId !== id) { msg.textContent = 'Switching your wallet to ' + c.name + '…'; conn = await hub.switchChain(id); }
      const value = fee.get(id) ?? 0n;
      msg.textContent = 'Confirm in your wallet: the ' + fromWei(value) + ' ' + c.native + ' launch fee plus network gas.';
      const fees = await feeFields((m, ps) => rpc(c, m, ps));
      const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [{from: conn.owner, to: a, data: encodeCreateSale(p), value: '0x' + value.toString(16), ...fees}]});
      msg.textContent = 'Sent. Waiting for the network…';
      let r = null;
      for (let i = 0; i < 240 && !r; i++) { r = await conn.entry.provider.request({method: 'eth_getTransactionReceipt', params: [hash]}).catch(() => null); if (!r) await new Promise(res => setTimeout(res, i < 20 ? 750 : 2000)); }
      if (!r || r.status !== '0x1') throw Error('The network refused this sale. Nothing was created; only network gas was spent.');
      const made = parseSaleCreated(r, a);
      if (!made) throw Error('The sale opened, but its number could not be read. Check the transaction in your wallet.');
      msg.textContent = 'Your sale is open.';
      done.hidden = false;
      done.replaceChildren(el('a', {href: saleLink(id, made.saleId), class: 'qxc-primary'}, 'Open your sale page →'), ' ', el('span', {class: 'qxc-fine'}, compact(SALE_TOKENS) + ' ' + p.symbol + ' on sale'));
      location.assign(saleLink(id, made.saleId));
    } catch (e) {
      const m = String(e?.message || e);
      msg.textContent = /reject|denied|cancel/i.test(m) ? 'You cancelled in your wallet.' : m.slice(0, 200);
    } finally { busy = false; void render(); }
  }

  root.replaceChildren(
    el('div', {class: 'qxc-panel-head'}, el('h2', {id: 'qsf-title'}, 'Sale first'), el('span', {}, '1 transaction')),
    el('p', {class: 'qxc-fine'}, 'A fair sale before trading opens. Buyers put in ' + 'the chain’s coin; when it ends, the money raised and the same value in tokens become a locked pool at the final price. Under your minimum, everyone is refunded.'),
    el('div', {class: 'qsf-modes', role: 'radiogroup', 'aria-label': 'Sale style'},
      el('label', {}, fixed, el('span', {}, el('strong', {}, 'Fixed price'), ' · one price until it sells out')),
      el('label', {}, falling, el('span', {}, el('strong', {}, 'Falling price'), ' · starts high, everyone pays the final price'))),
    el('div', {class: 'qsf-grid'},
      el('label', {}, 'Chain', chainSel), el('label', {}, 'Name', name), el('label', {}, 'Ticker', symbol),
      el('label', {}, 'Image (required)', file, preview),
      el('label', {}, raiseLabel, raise), multRow, el('label', {}, minLabel, minimum),
      el('label', {}, 'How long it runs', window_), el('label', {}, 'Wallet limit (optional)', walletCap)),
    summary, msg, el('div', {class: 'qxc-actions'}, go), done);
  root.hidden = false;
  // Telegram "/launch … sale" links: /create?sale=1&chain=…&sname=…&sticker=…#sale
  const qp = new URLSearchParams(location.search);
  if (qp.get('sale') === '1') {
    if (ready.some(c => c.id === qp.get('chain'))) chainSel.value = qp.get('chain');
    if (qp.get('sname')) name.value = qp.get('sname').slice(0, 64);
    if (qp.get('sticker')) symbol.value = qp.get('sticker').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();
  }
  if (qp.get('sale') === '1' || location.hash === '#sale') requestAnimationFrame(() => root.scrollIntoView({block: 'start'}));
  void render();
}
mount().catch(() => { if (root) { root.hidden = true; root.replaceChildren(); } });
