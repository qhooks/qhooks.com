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

export function mountWalletLink({ document: doc, hub, telegram, fetchImpl = globalThis.fetch, storage = null, force = false }) {
  if (!telegram?.inTelegram || !telegram.getInitData()) return () => {};
  const host = doc.querySelector('#qxt-trade');
  if (!host) return () => {};
  let revision = 0, strip = null, userId = '';
  const dismissKey = address => 'qhooks:tg:link-dismissed:' + userId + ':' + address;
  const seen = address => { try { return storage?.getItem(dismissKey(address)) === '1'; } catch { return false; } };
  const dismiss = address => { try { storage?.setItem(dismissKey(address), '1'); } catch {} strip?.remove(); strip = null; };
  const make = (tag, attrs, ...children) => { const el = doc.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) k === 'class' ? el.className = v : el.setAttribute(k, v); el.append(...children); return el; };
  const stop = hub.subscribe(async snapshot => {
    const version = ++revision, connection = snapshot.current;
    strip?.remove(); strip = null;
    if (!connection || !/^0x[0-9a-fA-F]{40}$/.test(connection.owner)) return;
    const address = connection.owner.toLowerCase();
    if (!force && seen(address)) return;
    let linked = null;
    try {
      const r = await fetchImpl('/api/tg/me', { headers: { Authorization: 'tma ' + telegram.getInitData() }, cache: 'no-store' });
      if (!r.ok) return;
      const me = await r.json(); userId = String(me.userId || ''); linked = me.wallets?.find(w => w.address.toLowerCase() === address) || null;
    } catch { return; }
    if (version !== revision || !force && (linked || seen(address))) return;
    const title = make('b', {}, linked ? 'Wallet linked to Telegram' : 'Link this wallet to Telegram');
    const description = make('span', {}, linked ? 'Use this address for positions, referrals and wallet alerts.' : 'See your positions and referrals in the bot. Confirm ownership with a wallet signature.');
    const status = make('p', { class: 'qtx-status', role: 'status', 'aria-live': 'polite' });
    const label = make('input', { type: 'text', maxlength: '40', placeholder: 'Wallet label (optional)', 'aria-label': 'Telegram wallet label', autocomplete: 'off' });
    label.value = linked?.label || '';
    const go = make('button', { type: 'button', class: 'qxt-mini' }, linked ? 'Save label' : 'Link wallet');
    const close = make('button', { type: 'button', class: 'qxt-mini', 'aria-label': 'Dismiss Telegram wallet link' }, 'Dismiss');
    const controls = make('div', { class: 'qxt-row2' }, go, close);
    strip = make('section', { class: 'qxt-card', 'aria-label': 'Telegram wallet link' }, make('div', { class: 'qxt-risk' }, title, description, label, controls, status));
    host.prepend(strip);
    close.addEventListener('click', () => dismiss(address));
    const valid = () => version === revision && hub.snapshot().current?.owner.toLowerCase() === address;
    const unlink = make('button', { type: 'button', class: 'qxt-mini' }, 'Unlink wallet');
    unlink.hidden = !linked;
    strip.querySelector('.qxt-risk').append(unlink);
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        if (!valid()) throw new Error('Wallet changed. Reconnect and try again.');
        const initData = telegram.getInitData();
        if (linked) {
          await linkRequest(initData, { action: 'label', address, label: label.value.trim() }, fetchImpl);
          status.textContent = 'Wallet label saved.';
        } else {
          status.textContent = 'Confirm the link in your wallet.';
          const challenge = await linkRequest(initData, { action: 'nonce', address }, fetchImpl);
          if (!valid()) throw new Error('Wallet changed. Reconnect and try again.');
          if (typeof challenge.message !== 'string' || typeof challenge.nonce !== 'string') throw new Error('Could not start the link. Try again.');
          const signature = await connection.entry.provider.request({ method: 'personal_sign', params: [utf8Hex(challenge.message), address] });
          if (!valid()) throw new Error('Wallet changed. Reconnect and try again.');
          await linkRequest(initData, { address, nonce: challenge.nonce, signature, label: label.value.trim() }, fetchImpl);
          status.textContent = 'Wallet linked. Your positions are ready in the bot.';
          linked = { address, label: label.value.trim() };
          go.textContent = 'Save label'; title.textContent = 'Wallet linked to Telegram'; unlink.hidden = false;
          try { storage?.setItem(dismissKey(address), '1'); } catch {}
        }
      } catch (e) { status.textContent = e.code === 4001 ? 'Link cancelled. You can try again.' : e.message || 'Could not link this wallet. Try again.'; }
      finally { if (valid()) go.disabled = false; }
    });
    {
      unlink.addEventListener('click', async () => {
        unlink.disabled = true;
        try { await linkRequest(telegram.getInitData(), { action: 'unlink', address }, fetchImpl); dismiss(address); }
        catch { status.textContent = 'Could not unlink this wallet. Try again.'; unlink.disabled = false; }
      });
    }
  });
  return () => { revision++; stop(); strip?.remove(); };
}

if (typeof document !== 'undefined' && window.qxTelegram?.inTelegram) {
  import('/wallet-hub.mjs').then(({ getWalletHub }) => {
    let storage; try { storage = window.localStorage; } catch {}
    const hub = getWalletHub(window);
    mountWalletLink({ document, hub, telegram: window.qxTelegram, storage, force: new URLSearchParams(location.search).get('link') === '1' });
    import('./qx-tg-signer.mjs').then(({ mountTelegramSigner }) => mountTelegramSigner({ document, hub, telegram: window.qxTelegram, target: window })).catch(() => {});
  }).catch(() => {});
}
