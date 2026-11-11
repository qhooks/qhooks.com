import {privyAccessToken} from './qx-privy-access-token.mjs';
export {privyAccessToken};
// Wallet ownership is confirmed in the connected wallet. Telegram credentials remain in the bridge's memory.
export const utf8Hex = text => '0x' + [...new TextEncoder().encode(text)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function linkRequest(initData, body, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl('/api/tg/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, initData }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const text = data.error === 'wallet_limit' ? 'You can link up to five wallets. Unlink one first.'
      : data.error === 'invalid_telegram_auth' || data.error === 'stale_auth' || data.error === 'expired_init_data' ? 'Reopen the terminal from Telegram to link your wallet.'
      : data.error === 'nonce_expired' || data.error === 'invalid_nonce' ? 'The link request expired. Try again.'
      : 'Could not link this wallet. Try again.';
    throw new Error(text);
  }
  return data;
}

// Silent link (2026-11-10): a wallet the signed-in Privy account owns links itself to this Telegram user, with no card
// or signature. The server checks Telegram initData, the Privy access token and Privy's record of the user's wallets.
export async function silentLink({ initData, address, storage, explicit = false, fetchImpl = globalThis.fetch }) {
  const privyToken = privyAccessToken(storage);
  if (!privyToken) return 'fallback';
  try {
    const r = await fetchImpl('/api/tg/autolink', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData, address, privyToken, explicit }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.linked) return 'linked';
    if (r.ok && data.reason === 'unlinked_before') return 'skip';
    if (data.error === 'sign_in') return 'retry';
    return 'fallback';
  } catch { return 'fallback'; }
}

export function mountWalletLink({ document: doc, hub, telegram, fetchImpl = globalThis.fetch, storage = null, force = false, privyStorage = storage }) {
  if (!telegram?.inTelegram || !telegram.getInitData() || !doc.body) return () => {};
  // The list view does not display the trade panel. Own one sheet directly on the body.
  if (doc.querySelector('#qxt-tg-link')) return () => {};
  let revision = 0, sheet = null, userId = '', previousAddress, previousProvider;
  const dismissed = new Set();
  const dismissKey = address => 'qhooks:tg:link-dismissed:' + userId + ':' + address;
  const seen = address => { try { return dismissed.has(dismissKey(address)) || storage?.getItem(dismissKey(address)) === '1'; } catch { return dismissed.has(dismissKey(address)); } };
  const remove = () => { sheet?.remove(); sheet = null; };
  const dismiss = address => {
    if (address) { dismissed.add(dismissKey(address)); try { storage?.setItem(dismissKey(address), '1'); } catch {} }
    revision++; remove();
  };
  const make = (tag, attrs, ...children) => { const el = doc.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) k === 'class' ? el.className = v : el.setAttribute(k, v); el.append(...children); return el; };
  const button = text => make('button', { type: 'button', class: 'qxt-mini' }, text);
  function frame(titleText, descriptionText, address) {
    remove();
    const title = make('h2', { id: 'qxt-tg-link-title', 'aria-live': 'polite' }, titleText);
    const description = make('p', { class: 'qxt-tg-description' }, descriptionText);
    const status = make('p', { class: 'qxt-tg-status', role: 'status', 'aria-live': 'polite' });
    const close = button('Dismiss');
    close.addEventListener('click', () => dismiss(address));
    const controls = make('div', { class: 'qxt-tg-controls' });
    sheet = make('section', { id: 'qxt-tg-link', class: 'qxt-card qxt-tg-link', role: 'dialog', 'aria-labelledby': 'qxt-tg-link-title' }, title, description, controls, status);
    doc.body.append(sheet);
    return {title, description, controls, status, close};
  }
  function connect() {
    const view = frame('Link wallet to Telegram', 'Connect the wallet you want to link.');
    const go = button('Connect wallet');
    go.classList.add('qxt-tg-primary');
    view.controls.append(go, view.close);
    go.addEventListener('click', () => {
      try {
        const dialog = doc.querySelector('#qhc-dialog');
        hub.scan?.();
        if (dialog && !dialog.open) dialog.showModal();
        else if (!dialog) hub.open?.();
      } catch { view.status.textContent = 'Could not open your wallet. Try again.'; }
    });
  }
  async function update(snapshot) {
    const connection = snapshot.current;
    const address = /^0x[0-9a-fA-F]{40}$/.test(connection?.owner || '') ? connection.owner.toLowerCase() : null;
    const provider = address ? connection.entry?.provider : null;
    // Hub busy/chain notifications must not restart a pending signature or redisplay a dismissed sheet.
    if (address === previousAddress && provider === previousProvider) return;
    previousAddress = address; previousProvider = provider;
    const version = ++revision;
    remove();
    if (!address) { if (force) connect(); return; }
    const valid = () => version === revision && hub.snapshot().current?.owner?.toLowerCase() === address && hub.snapshot().current?.entry?.provider === provider;
    let view = force ? frame('Link wallet to Telegram', 'Checking your wallet link…', address) : null;
    if (view) view.controls.append(view.close);
    let linked = null;
    try {
      const r = await fetchImpl('/api/tg/me', { headers: { Authorization: 'tma ' + telegram.getInitData() }, cache: 'no-store' });
      if (!r.ok) throw new Error('Could not link this wallet. Try again.');
      const me = await r.json();
      if (!valid()) return;
      userId = String(me.userId || '');
      linked = me.wallets?.find(w => w.address.toLowerCase() === address) || null;
    } catch {
      if (!valid() || !force) return;
      // An explicit request still offers the signature path when the initial status read fails.
    }
    if (!valid()) return;
    if (!force && linked) return;
    if (!linked) {
      let outcome = await silentLink({ initData: telegram.getInitData(), address, storage: privyStorage, explicit: force, fetchImpl });
      if (outcome === 'retry') {
        await new Promise(r => setTimeout(r, 2500));
        if (!valid()) return;
        outcome = await silentLink({ initData: telegram.getInitData(), address, storage: privyStorage, explicit: force, fetchImpl });
      }
      if (!valid()) return;
      if (!force && (outcome === 'skip' || outcome === 'linked')) return;
      if (outcome === 'linked') linked = { address, label: '' };
    }
    if (!force && seen(address)) return;
    view = frame(linked ? 'Linked. Return to Telegram.' : 'Link this wallet to Telegram', linked ? 'Use this address for positions, referrals and wallet alerts.' : 'See your positions and referrals in the bot. Confirm ownership with a wallet signature.', address);
    const go = button(linked ? 'Return to Telegram' : 'Link wallet');
    go.classList.add('qxt-tg-primary');
    view.controls.append(go, view.close);
    const label = make('input', { type: 'text', maxlength: '40', placeholder: 'Wallet label (optional)', 'aria-label': 'Telegram wallet label', autocomplete: 'off' });
    label.value = linked?.label || '';
    const save = button('Save label'); save.hidden = !linked;
    const optional = make('details', { class: 'qxt-tg-label' }, make('summary', {}, 'Add a label'), label, save);
    const unlink = button('Unlink wallet'); unlink.hidden = !linked;
    sheet.append(optional, unlink);
    const success = () => {
      linked = { address, label: label.value.trim() };
      view.title.textContent = 'Linked. Return to Telegram.';
      view.description.textContent = 'Use this address for positions, referrals and wallet alerts.';
      view.status.textContent = '';
      go.textContent = 'Return to Telegram'; save.hidden = false; unlink.hidden = false;
      try { storage?.setItem(dismissKey(address), '1'); } catch {}
    };
    go.addEventListener('click', async () => {
      if (!valid()) return;
      if (linked) {
        try { doc.defaultView?.Telegram?.WebApp?.close?.(); } catch {}
        dismiss(address);
        return;
      }
      go.disabled = true;
      try {
        view.status.textContent = 'Confirm the link in your wallet.';
        const initData = telegram.getInitData();
        const challenge = await linkRequest(initData, { action: 'nonce', address }, fetchImpl);
        if (!valid()) return;
        if (typeof challenge.message !== 'string' || typeof challenge.nonce !== 'string') throw new Error('Could not start the link. Try again.');
        const signature = await provider.request({ method: 'personal_sign', params: [utf8Hex(challenge.message), address] });
        if (!valid()) return;
        await linkRequest(initData, { address, nonce: challenge.nonce, signature, label: label.value.trim() }, fetchImpl);
        if (valid()) success();
      } catch (e) {
        if (valid()) view.status.textContent = Number(e?.code) === 4001 ? 'Link cancelled. You can try again.' : e?.message || 'Could not link this wallet. Try again.';
      } finally { if (valid()) go.disabled = false; }
    });
    save.addEventListener('click', async () => {
      if (!valid()) return;
      save.disabled = true;
      try {
        await linkRequest(telegram.getInitData(), { action: 'label', address, label: label.value.trim() }, fetchImpl);
        if (valid()) view.status.textContent = 'Wallet label saved.';
      } catch (e) { if (valid()) view.status.textContent = e?.message || 'Could not link this wallet. Try again.'; }
      finally { if (valid()) save.disabled = false; }
    });
    unlink.addEventListener('click', async () => {
      if (!valid()) return;
      unlink.disabled = true;
      try { await linkRequest(telegram.getInitData(), { action: 'unlink', address }, fetchImpl); if (valid()) dismiss(address); }
      catch { if (valid()) { view.status.textContent = 'Could not unlink this wallet. Try again.'; unlink.disabled = false; } }
    });
  }
  const stop = hub.subscribe(snapshot => { void update(snapshot); });
  return () => { revision++; stop(); remove(); };
}

if (typeof document !== 'undefined' && window.qxTelegram?.inTelegram) {
  import('/wallet-hub.mjs').then(({ getWalletHub }) => {
    let storage; try { storage = window.localStorage; } catch {}
    const hub = getWalletHub(window);
    mountWalletLink({ document, hub, telegram: window.qxTelegram, storage, force: new URLSearchParams(location.search).get('link') === '1' });
    // One-click trading now lives in the ticket toggle (qx-oneclick.mjs); the old Telegram-only permission strip is retired.
  }).catch(() => {});
}
