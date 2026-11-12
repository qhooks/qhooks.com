import {prepareTokenBanner,uploadTokenBanner,LAUNCH_ICON_LIMIT} from './qx-token-banner.mjs';
// /create → "Sale first": opens a QSaleLaunch sale (fixed or falling price) in one transaction, then links to its sale
// page. Only on chains whose sale contract has code (Randall's /chain-setup?set=sale tap); elsewhere the card says so.
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {chainById, visibleChains} from './chains.mjs';
import {SEL, feeFields, saleAddress, planSale, salePrices, saleCapText, assertSaleStart, encodeCreateSale, parseSaleCreated, saleLink, randomSalt, fromWei, compact, SALE_TOKENS, SUPPLY, WINDOWS, START_MULTIPLES} from './qx-sale-core.mjs';
import {START_TIERS} from './qx-quick-launch-core.mjs';
import {startTierLabel,startCapText} from './qx-quick-start-check.mjs';
import {assertStartPrice,START_PRICE_HOLD} from './qx-guided-start-core.mjs';
import {readSaleStart} from './qx-sale-start.mjs';

// Dependencies are injectable so the actual form and wallet boundary can be tested offline.
export async function mountSaleCreate({document = globalThis.document, hub = getWalletHub(window), request, readStart = readSaleStart, makeThumbnail, makeBanner=prepareTokenBanner, uploadBanner=uploadTokenBanner, navigate = url => location.assign(url), search = globalThis.location?.search || '', hash = globalThis.location?.hash || ''} = {}) {
const root = document.getElementById('qsf-root');
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } n.append(...kids.flat().filter(k => k != null && k !== false)); return n; };
const chains = visibleChains().filter(c => saleAddress(c.id));
let image = '', banner='', bannerData='', imageRevision=0,bannerRevision=0, busy = false, live = new Map(), fee = new Map();

async function rpc(c, method, params) {
  if (request) return request(method, params, c.id);
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
    const bitmap = await createImageBitmap(file);try{const side = Math.min(bitmap.width, bitmap.height);
    for (const [px, qq] of [[96, .82], [80, .78], [64, .74], [64, .6], [48, .6]]) {
      const canvas = el('canvas', {width: px, height: px}), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fbf9f4'; ctx.fillRect(0, 0, px, px);
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, px, px);
      const url = canvas.toDataURL('image/jpeg', qq); if (url.length <= LAUNCH_ICON_LIMIT) return url;
    }
    throw Error('That image is too detailed to store. Try a simpler one.');
    }finally{bitmap.close();}
  })();
}

// The card stays hidden (fail closed) until at least one chain's QSaleLaunch has code; only those chains are offered.
  if (!root) return;
  root.hidden = true;
  const ok = await Promise.all(chains.map(c => check(c.id).catch(() => false)));
  const ready = chains.filter((c, i) => ok[i] === true);
  if (!ready.length) { root.replaceChildren(); return; }
  const chainSel = el('select', {id: 'qsf-chain'}, ...ready.map(c => el('option', {value: c.id}, c.name)));
  const name = el('input', {id: 'qsf-name', maxlength: '64', autocomplete: 'off', placeholder: 'Token name'});
  const symbol = el('input', {id: 'qsf-symbol', maxlength: '10', autocomplete: 'off', placeholder: 'TICKER'});
  const file = el('input', {id: 'qsf-image', type: 'file', accept: 'image/png,image/jpeg,image/webp'});
  const bannerFile=el('input',{id:'qsf-banner',type:'file',accept:'image/png,image/jpeg,image/webp',required:true}),bannerPreview=el('img',{alt:'Token banner preview',width:'150',height:'50',hidden:true}),bannerStatus=el('small',{role:'status','aria-live':'polite'},'3:1 · PNG, JPEG or WebP · under 8 MB.');
  const preview = el('img', {class: 'qsf-preview', alt: 'Token image preview', hidden: true});
  const fixed = el('input', {type: 'radio', name: 'qsf-style', value: 'fixed', checked: true}), falling = el('input', {type: 'radio', name: 'qsf-style', value: 'falling'});
  const raise = el('input', {id: 'qsf-raise', inputmode: 'decimal', autocomplete: 'off', value: '1'});
  const price = el('input', {id: 'qsf-price', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': 'qsf-price-cap'});
  const priceLabel = el('span', {}, '');
  const priceCap = el('small', {id: 'qsf-price-cap', class: 'qsf-price-cap', 'aria-live': 'polite'});
  const floorCap = el('small', {id: 'qsf-floor-cap', class: 'qsf-price-cap', 'aria-live': 'polite', hidden: true});
  const custom = el('input', {id: 'qsf-start-usd', type: 'text', inputmode: 'decimal', maxlength: '32', autocomplete: 'off', placeholder: 'Market cap in USD', 'aria-label': 'Custom starting market cap in USD', hidden: true});
  const tierNote = el('p', {class: 'qq-start-note', id: 'qsf-start-note', role: 'status'});
  let tier = 'standard', pricing = null, priceRun = 0, priceError = '';
  const tierButtons = START_TIERS.map(([id]) => el('button', {type: 'button', class: 'qq-start-opt', 'data-tier': id, 'aria-pressed': String(id === tier)}, startTierLabel(id)));
  const tiers = el('div', {class: 'qq-startcap qsf-tiers'}, el('p', {class: 'qq-start-k'}, 'Starting market cap'), el('div', {class: 'qq-start-opts', role: 'group', 'aria-label': 'Sale starting market cap'}, ...tierButtons), custom, tierNote);
  const raiseLabel = el('span', {}, ''), minLabel = el('span', {}, '');
  const multiple = el('select', {id: 'qsf-multiple'}, ...START_MULTIPLES.map(m => el('option', {value: String(m), selected: m === 4}, m + '× the floor')));
  const multRow = el('label', {}, 'Start-to-floor ratio', multiple);
  const minimum = el('input', {id: 'qsf-min', inputmode: 'decimal', autocomplete: 'off', value: '0.25'});
  const window_ = el('select', {id: 'qsf-window'}, ...WINDOWS.map(([w, t]) => el('option', {value: String(w), selected: w === 86400}, t)));
  const walletCap = el('input', {id: 'qsf-cap', inputmode: 'decimal', autocomplete: 'off', placeholder: 'No limit'});
  const summary = el('p', {class: 'qsf-summary', id: 'qsf-summary', 'aria-live': 'polite'});
  const go = el('button', {type: 'button', id: 'qsf-go', class: 'qxc-primary'}, 'Open the sale');
  const msg = el('p', {class: 'qxc-message', id: 'qsf-message', role: 'status', 'aria-live': 'polite'});
  const done = el('p', {id: 'qsf-done', hidden: true});
  const style = () => falling.checked ? 'falling' : 'fixed';
  const unit = () => chainById(chainSel.value)?.native || 'ETH';
  const prices = () => salePrices({style: style(), pricePerMillion: price.value, multiple: Number(multiple.value)});
  const plan = (salt = '0x' + '0'.repeat(64)) => planSale({name: name.value, symbol: symbol.value, image,banner, style: style(), pricePerMillion: price.value, minimum: minimum.value, window: Number(window_.value),
    walletCap: walletCap.value, multiple: Number(multiple.value), salt});
  function syncRaise() {
    try { const p = prices(); raise.value = fromWei(SALE_TOKENS * (style() === 'falling' ? p.floorPrice : p.price) / 10n ** 18n, 18); } catch { raise.value = ''; }
  }
  async function refreshStart() {
    const run = ++priceRun, id = chainSel.value, selectedTier = tier, customUsd = custom.value;
    pricing = null; priceError = ''; price.value = ''; raise.value = ''; tierNote.textContent = 'Checking starting market cap…'; render();
    for (const b of tierButtons) b.textContent = startTierLabel(b.dataset.tier);
    try {
      const p = await readStart({chainId: id, tier: selectedTier, customUsd, request: (m, ps) => rpc(chainById(id), m, ps)});
      if (run !== priceRun) return;
      pricing = p; price.value = fromWei(p.price * 10n ** 6n, 18); syncRaise();
      for (const b of tierButtons) b.textContent = startTierLabel(b.dataset.tier, p.standardUsd);
      tierNote.textContent = 'Standard is ' + startCapText(p.standardUsd, 0) + ' on this chain. Use Custom to set a different cap.';
    } catch { if (run !== priceRun) return; priceError = START_PRICE_HOLD; tierNote.textContent = priceError; }
    render();
  }
  function render() {
    multRow.hidden = style() !== 'falling';
    custom.hidden = tier !== 'custom';
    for (const b of tierButtons) b.setAttribute('aria-pressed', String(b.dataset.tier === tier));
    for (const x of [chainSel, name, symbol, file,bannerFile, fixed, falling, raise, price, custom, multiple, minimum, window_, walletCap, ...tierButtons]) x.disabled = busy;
    minLabel.textContent = 'Minimum to go ahead (' + unit() + ')';
    raiseLabel.textContent = style() === 'falling' ? 'Raise if it sells at the floor (' + unit() + ')' : 'Raise if it sells out (' + unit() + ')';
    priceLabel.textContent = (style() === 'falling' ? 'Start price' : 'Fixed price') + ' per 1M tokens (' + unit() + ')';
    const on = live.get(chainSel.value) === true;
    let p = null, err = '', priceOk = false;
    priceCap.textContent = 'No market cap to show yet.'; floorCap.hidden = style() !== 'falling'; floorCap.textContent = '';
    try {
      const quoted = prices();
      priceCap.textContent = saleCapText(quoted.price, pricing?.paymentUsd);
      if (style() === 'falling') floorCap.textContent = 'Floor: ' + fromWei(quoted.floorPrice * 10n ** 6n, 18) + ' ' + unit() + ' per 1M · ' + saleCapText(quoted.floorPrice, pricing?.paymentUsd);
      if (pricing) { assertStartPrice({price: quoted.price, totalSupply: SUPPLY, quoteDecimals: 18, quoteUsd: pricing.paymentUsd, selectedCapUsd: pricing.selectedCapUsd}); priceOk = true; }
    } catch {}
    try { p = plan(); } catch (e) { err = e.message; }
    if (p) {
      const per1M = v => fromWei(v * 10n ** 6n, 8) + ' ' + unit();
      summary.textContent = style() === 'falling'
        ? `500M tokens on sale. The price starts at ${per1M(p.price)} per 1M and falls to ${per1M(p.floorPrice)} per 1M over ${window_.selectedOptions[0].text}. It can raise up to ${fromWei(p.hardCap)} ${unit()}; everyone pays the same final price. Needs ${fromWei(p.softCap)} ${unit()} or everyone is refunded.`
        : `500M tokens at ${per1M(p.price)} per 1M, up to ${fromWei(p.hardCap)} ${unit()} over ${window_.selectedOptions[0].text}. Needs ${fromWei(p.softCap)} ${unit()} or everyone is refunded. All the money raised plus the same value in tokens become a locked Uniswap pool at the sale price.`;
    } else summary.textContent = err;
    const conn = hub.snapshot().current;
    go.disabled = busy || !on || !p || !priceOk;
    go.textContent = !conn ? 'Connect wallet' : busy ? 'Working…' : 'Open the sale';
    if (!on) msg.textContent = 'Sale-first launches open on ' + chainById(chainSel.value).name + ' once its sale contract is set up.';
    else if (!busy && msg.dataset.sticky !== '1') msg.textContent = priceError || (pricing && !priceOk ? START_PRICE_HOLD : fee.has(chainSel.value) ? 'Cost: the ' + fromWei(fee.get(chainSel.value)) + ' ' + unit() + ' launch fee plus network gas.' : '');
  }
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    const rev=++imageRevision;image='';render();
    try { const data=await (makeThumbnail || thumbnail)(f);if(rev!==imageRevision)return;image=data; preview.src = image; preview.hidden = false; } catch (e) { if(rev!==imageRevision)return;image = ''; preview.hidden = true; msg.textContent = e.message; }
    void render();
  });
  bannerFile.addEventListener('change',async()=>{const f=bannerFile.files?.[0];if(!f)return;const rev=++bannerRevision;banner='';bannerData='';render();bannerStatus.textContent='Preparing your banner…';try{const data=await makeBanner(f);if(rev!==bannerRevision)return;bannerPreview.src=data;bannerPreview.hidden=false;const hash=await uploadBanner(data);if(rev!==bannerRevision)return;banner=hash;bannerData=data;bannerStatus.textContent='Banner ready.';}catch(e){if(rev!==bannerRevision)return;banner='';bannerPreview.hidden=true;bannerStatus.textContent=e.message;}render();});
  for (const x of [name, symbol, fixed, falling, price, multiple, minimum, window_, walletCap]) x.addEventListener(x.tagName === 'SELECT' || x.type === 'radio' ? 'change' : 'input', () => { if (x === symbol) symbol.value = symbol.value.toUpperCase(); if ([price, fixed, falling, multiple].includes(x)) syncRaise(); msg.dataset.sticky = ''; render(); });
  raise.addEventListener('input', () => { try { const p = salePrices({style: style(), raise: raise.value, multiple: Number(multiple.value)}); price.value = fromWei(p.price * 10n ** 6n, 18); } catch { price.value = ''; } msg.dataset.sticky = ''; render(); });
  chainSel.addEventListener('change', () => { msg.dataset.sticky = ''; void refreshStart(); });
  custom.addEventListener('input', () => { msg.dataset.sticky = ''; void refreshStart(); });
  for (const b of tierButtons) b.addEventListener('click', () => { if (busy) return; tier = b.dataset.tier; msg.dataset.sticky = ''; void refreshStart(); });
  go.addEventListener('click', () => void open());
  hub.subscribe(() => void render());

  async function open() {
    if (busy) return;
    let conn = hub.snapshot().current; if (!conn) { hub.open(); return; }
    const id = chainSel.value, c = chainById(id), a = saleAddress(id);
    let p, data; const shown = pricing, selectedTier = tier, customUsd = custom.value;
    try { if (!shown) throw Error(START_PRICE_HOLD); p = plan(randomSalt()); data = encodeCreateSale(p); assertSaleStart({data, ...shown}); }
    catch (e) { msg.textContent = e.message; msg.dataset.sticky = '1'; return; }
    busy = true; msg.dataset.sticky = '1'; void render();
    try {
      if (conn.chainId !== id) { msg.textContent = 'Switching your wallet to ' + c.name + '…'; conn = await hub.switchChain(id); }
      const value = fee.get(id) ?? 0n;
      msg.textContent = 'Confirm in your wallet: the ' + fromWei(value) + ' ' + c.native + ' launch fee plus network gas.';
      const fees = await feeFields((m, ps) => rpc(c, m, ps));
      const fresh = await readStart({chainId: id, tier: selectedTier, customUsd, request: (m, ps) => rpc(c, m, ps)});
      assertSaleStart({data, ...fresh});
      assertSaleStart({data, selectedCapUsd: shown.selectedCapUsd, paymentUsd: fresh.paymentUsd});
      if(await uploadBanner(bannerData)!==banner)throw Error('Your banner changed. Review your launch again.');
      const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [{from: conn.owner, to: a, data, value: '0x' + value.toString(16), ...fees}]});
      msg.textContent = 'Sent. Waiting for the network…';
      let r = null;
      for (let i = 0; i < 240 && !r; i++) { r = await conn.entry.provider.request({method: 'eth_getTransactionReceipt', params: [hash]}).catch(() => null); if (!r) await new Promise(res => setTimeout(res, i < 20 ? 750 : 2000)); }
      if (!r || r.status !== '0x1') throw Error('The network refused this sale. Nothing was created; only network gas was spent.');
      const made = parseSaleCreated(r, a);
      if (!made) throw Error('The sale opened, but its number could not be read. Check the transaction in your wallet.');
      msg.textContent = 'Your sale is open.';
      done.hidden = false;
      done.replaceChildren(el('a', {href: saleLink(id, made.saleId), class: 'qxc-primary'}, 'Open your sale page →'), ' ', el('span', {class: 'qxc-fine'}, compact(SALE_TOKENS) + ' ' + p.symbol + ' on sale'));
      navigate(saleLink(id, made.saleId));
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
      el('label', {}, 'Image (required)', file, preview),el('label',{},'Banner (required)',bannerFile,bannerPreview,bannerStatus)),
    tiers,
    el('div', {class: 'qsf-grid'},
      el('label', {}, priceLabel, price, priceCap, floorCap), el('label', {}, raiseLabel, raise), multRow, el('label', {}, minLabel, minimum),
      el('label', {}, 'How long it runs', window_), el('label', {}, 'Wallet limit (optional)', walletCap)),
    summary, msg, el('div', {class: 'qxc-actions'}, go), done);
  root.hidden = false;
  // Telegram "/launch … sale" links: /create?sale=1&chain=…&sname=…&sticker=…#sale
  const qp = new URLSearchParams(search);
  if (qp.get('sale') === '1') {
    if (ready.some(c => c.id === qp.get('chain'))) chainSel.value = qp.get('chain');
    if (qp.get('sname')) name.value = qp.get('sname').slice(0, 64);
    if (qp.get('sticker')) symbol.value = qp.get('sticker').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();
  }
  if (qp.get('sale') === '1' || hash === '#sale') globalThis.requestAnimationFrame?.(() => root.scrollIntoView({block: 'start'}));
  await refreshStart();
}
if (typeof document !== 'undefined' && document.getElementById('qsf-root')) mountSaleCreate().catch(() => { const root = document.getElementById('qsf-root'); if (root) { root.hidden = true; root.replaceChildren(); } });
