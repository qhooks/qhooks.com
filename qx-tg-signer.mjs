// Telegram trading consent stays in memory until the server stores the signed receipt.
const utf8Hex = text => '0x' + [...new TextEncoder().encode(text)].map(b => b.toString(16).padStart(2, '0')).join('');
const walletAddress = connection => String(connection?.owner || '').toLowerCase();
export function signerCaps(perTradeUsd = 50, dailyUsd = 250) {
  const trade = Number(perTradeUsd), daily = Number(dailyUsd);
  if (!Number.isFinite(trade) || trade <= 0 || trade > 1000 || Math.abs(trade * 100 - Math.round(trade * 100)) > 1e-8
    || !Number.isFinite(daily) || daily < trade || daily > 100000 || Math.abs(daily * 100 - Math.round(daily * 100)) > 1e-8) {
    throw Error('Choose a trade cap up to $1,000 and a daily cap at least as large. Use cents at most.');
  }
  return { perTradeUsd: trade, dailyUsd: daily };
}
export async function signerRequest(initData, { method = 'GET', ...body } = {}, fetchImpl = globalThis.fetch) {
  const options = { method, cache: 'no-store', headers: { Authorization: 'tma ' + initData } };
  if (method !== 'GET') { options.headers['content-type'] = 'application/json'; options.body = JSON.stringify({ ...body, initData }); }
  const path = '/api/tg/signer' + (method === 'GET' && body.wallet ? '?wallet=' + encodeURIComponent(body.wallet) : '');
  const response = await fetchImpl(path, options), data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(response.status === 401 ? 'Reopen the terminal from Telegram to manage trading.' : 'Could not update Telegram trading. Try again.');
  return data;
}
export function embeddedSignerControls(connection, controls) {
  const address = walletAddress(connection), wallet = controls?.wallet;
  return connection?.entry?.rdns === 'io.qhooks.privy' && wallet?.walletClientType === 'privy'
    && String(wallet.address || '').toLowerCase() === address && typeof wallet.id === 'string' && wallet.id
    && typeof controls.addSigner === 'function' && typeof controls.removeSigner === 'function' ? controls : null;
}
export async function prepareSignerConsent({ connection, controls, initData, perTradeUsd, dailyUsd, fetchImpl }) {
  const client = embeddedSignerControls(connection, controls);
  if (!client) throw Error('Use your email or Google wallet. If trading controls are unavailable, reopen the terminal after the wallet update.');
  const caps = signerCaps(perTradeUsd, dailyUsd);
  const challenge = await signerRequest(initData, { method: 'POST', action: 'terms', wallet: walletAddress(connection), walletId: client.wallet.id, ...caps }, fetchImpl);
  if (challenge.off || !challenge.terms || !challenge.nonce || !challenge.policyId || !challenge.signerId) throw Error('Telegram trading is off. You can still trade in the terminal.');
  return challenge;
}
export async function acceptSignerConsent({ connection, controls, initData, challenge, active = () => true, fetchImpl }) {
  const client = embeddedSignerControls(connection, controls);
  if (!client || !active()) throw Error('Wallet changed. Reconnect and review the terms again.');
  const address = walletAddress(connection); let added = false;
  try {
    await client.addSigner(challenge.policyId, challenge.signerId); added = true;
    if (!active()) throw Error('Wallet changed. Reconnect and review the terms again.');
    const signature = await connection.entry.provider.request({ method: 'personal_sign', params: [utf8Hex(challenge.terms), address] });
    if (!active()) throw Error('Wallet changed. Reconnect and review the terms again.');
    const result = await signerRequest(initData, { method: 'POST', action: 'consent', wallet: address, walletId: client.wallet.id, nonce: challenge.nonce, signature }, fetchImpl);
    if (result.off) throw Error('Telegram trading is off. You can still trade in the terminal.');
    return result;
  } catch (error) {
    // An incomplete receipt never authorizes a send. Clean up the SDK grant when possible.
    if (added) {
      try { await signerRequest(initData, { method: 'DELETE', wallet: address }, fetchImpl); } catch {}
      try { await client.removeSigner(); } catch {}
    }
    if (error?.code === 4001) throw Error('Trading permission cancelled. Nothing was enabled.');
    throw Error('Trading was not enabled. Reopen the terminal and review the terms again.');
  }
}
export async function revokeSignerConsent({ connection, controls, initData, fetchImpl }) {
  const result = await signerRequest(initData, { method: 'DELETE', wallet: walletAddress(connection) }, fetchImpl);
  const client = embeddedSignerControls(connection, controls);
  if (client) { try { await client.removeSigner(); } catch { return { ...result, removalPending: true }; } }
  return { ...result, removalPending: !client };
}
export function mountTelegramSigner({ document: doc, hub, telegram, fetchImpl = globalThis.fetch, target = globalThis }) {
  if (!telegram?.inTelegram || !telegram.getInitData()) return () => {};
  const host = doc.querySelector('#qxt-trade'); if (!host) return () => {};
  let revision = 0, panel = null, stopped = false;
  const make = (tag, attrs, ...children) => { const element = doc.createElement(tag); for (const [key, value] of Object.entries(attrs || {})) key === 'class' ? element.className = value : element.setAttribute(key, value); element.append(...children); return element; };
  const render = async snapshot => {
    const version = ++revision, connection = snapshot.current, address = walletAddress(connection);
    panel?.remove(); panel = null;
    if (!/^0x[0-9a-f]{40}$/.test(address)) return;
    const active = () => !stopped && version === revision && walletAddress(hub.snapshot().current) === address;
    let config;
    try { config = await signerRequest(telegram.getInitData(), { wallet: address }, fetchImpl); } catch { return; }
    if (!active() || !config.enabled || config.off) return;
    const receipt = config.receipt?.wallet?.toLowerCase() === address ? config.receipt : null;
    const title = make('b', {}, receipt ? 'Telegram trading is on' : 'Trade in Telegram');
    const status = make('p', { class: 'qtx-status', role: 'status', 'aria-live': 'polite' });
    const content = make('div', { class: 'qxt-risk' }, title,
      make('p', {}, 'QHooks can trade through QHooks routes only, up to your caps. It cannot send funds anywhere, withdraw or change your keys.'),
      make('p', {}, 'Permission expires after 30 days. Turn it off anytime in /wallet or here in the terminal.'));
    panel = make('section', { class: 'qxt-card', 'aria-label': 'Telegram trading' }, content); host.prepend(panel);
    const off = make('button', { type: 'button', class: 'qxt-mini', style: 'min-height:44px;white-space:normal' }, 'Turn off Telegram trading');
    if (receipt) {
      content.append(make('p', {}, '$' + receipt.perTradeUsd + ' per trade · $' + receipt.dailyUsd + ' per day · Expires ' + new Date(receipt.expiresAt).toISOString().slice(0, 10)), off, status);
    } else {
      const perTrade = make('input', { type: 'number', min: '0.01', max: '1000', step: '0.01', value: '50', 'aria-label': 'Per-trade cap in USD', style: 'min-width:0;width:100%;box-sizing:border-box;min-height:44px' }); perTrade.value = '50';
      const daily = make('input', { type: 'number', min: '0.01', max: '100000', step: '0.01', value: '250', 'aria-label': 'Daily cap in USD', style: 'min-width:0;width:100%;box-sizing:border-box;min-height:44px' }); daily.value = '250';
      const review = make('button', { type: 'button', class: 'qxt-mini', style: 'min-height:44px;white-space:normal' }, 'Review trading permission');
      const terms = make('pre', { 'aria-label': 'Exact trading consent terms', style: 'white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;min-width:0' }); terms.hidden = true;
      const accept = make('button', { type: 'button', class: 'qxt-mini', style: 'min-height:44px;white-space:normal' }, 'Enable Telegram trading'); accept.hidden = true;
      let challenge = null;
      const invalidate = () => { challenge = null; terms.hidden = true; accept.hidden = true; status.textContent = ''; };
      perTrade.addEventListener('input', invalidate); daily.addEventListener('input', invalidate);
      content.append(make('label', { style: 'flex-direction:column;align-items:stretch' }, 'Per trade in USD (maximum $1,000)', perTrade), make('label', { style: 'flex-direction:column;align-items:stretch' }, 'Per day in USD', daily), review, terms, accept, status);
      if (embeddedSignerControls(connection, target.qhooksPrivySignerControls)) { off.textContent = 'Remove wallet permission'; content.append(off); }
      if (!embeddedSignerControls(connection, target.qhooksPrivySignerControls)) {
        review.disabled = true; status.textContent = 'Use your email or Google wallet. If trading controls are unavailable, reopen the terminal after the wallet update.';
      }
      review.addEventListener('click', async () => {
        invalidate(); review.disabled = true; perTrade.disabled = true; daily.disabled = true;
        try {
          challenge = await prepareSignerConsent({ connection, controls: target.qhooksPrivySignerControls, initData: telegram.getInitData(), perTradeUsd: perTrade.value, dailyUsd: daily.value, fetchImpl });
          if (!active()) return;
          terms.textContent = challenge.terms; terms.hidden = false; accept.hidden = false;
          status.textContent = 'Read these exact terms, then enable trading to confirm in your wallet.';
        } catch (error) { if (active()) status.textContent = error.message; }
        finally { if (active()) { review.disabled = false; perTrade.disabled = false; daily.disabled = false; } }
      });
      accept.addEventListener('click', async () => {
        if (!challenge || !active()) return; accept.disabled = true; review.disabled = true; perTrade.disabled = true; daily.disabled = true;
        try {
          status.textContent = 'Confirm the trading permission and terms in your wallet.';
          await acceptSignerConsent({ connection, controls: target.qhooksPrivySignerControls, initData: telegram.getInitData(), challenge, active, fetchImpl });
          if (active()) await render(hub.snapshot());
        } catch (error) { if (active()) status.textContent = error.message; }
        finally { if (active()) { accept.disabled = false; review.disabled = false; perTrade.disabled = false; daily.disabled = false; } }
      });
    }
    off.addEventListener('click', async () => {
      off.disabled = true;
      try {
        const result = await revokeSignerConsent({ connection, controls: target.qhooksPrivySignerControls, initData: telegram.getInitData(), fetchImpl });
        if (!active()) return;
        if (result.removalPending) { status.textContent = 'Telegram trading is off. Reconnect your email or Google wallet to remove its signer permission too.'; title.textContent = 'Telegram trading is off'; off.hidden = true; }
        else await render(hub.snapshot());
      } catch { if (active()) { status.textContent = 'Could not turn off trading. Try again.'; off.disabled = false; } }
    });
  };
  const stop = hub.subscribe(render);
  const refresh = () => void render(hub.snapshot()); target.addEventListener?.('qhooks:privy-signer-ready', refresh);
  return () => { stopped = true; revision++; stop(); panel?.remove(); target.removeEventListener?.('qhooks:privy-signer-ready', refresh); };
}
