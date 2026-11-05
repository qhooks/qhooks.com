// Runs before tg-early.js so Telegram launch credentials stay in memory even when the URL is normalized.
// This file is also valid as a classic script: terminal.html loads it synchronously before other scripts.
(function () {
  const q = new URLSearchParams(location.search), rawHash = location.hash.slice(1);
  const hp = /(?:^|&)tgWebApp/.test(rawHash) ? new URLSearchParams(rawHash) : null;
  let initData = hp?.get('tgWebAppData') || q.get('tgWebAppData') || '';
  const inTelegram = document.documentElement.dataset.tg === '1' || q.get('tg') === '1' || !!hp || !!initData || !!window.TelegramWebviewProxy;
  const getInitData = () => initData || window.Telegram?.WebApp?.initData || '';
  if (inTelegram) {
    document.documentElement.dataset.tg = '1';
    const launch = new URLSearchParams(initData);
    const start = hp?.get('tgWebAppStartParam') || q.get('tgWebAppStartParam') || launch.get('start_param') || '';
    const m = /^m_(\d+)_(0x[0-9a-fA-F]{40})$/.exec(start);
    const ref = /^ref_(0x[0-9a-fA-F]{40})$/.exec(start);
    if (ref && !q.has('ref')) q.set('ref', ref[1].toLowerCase());
    const keep = hp ? new URLSearchParams() : new URLSearchParams(rawHash);
    if (hp) for (const key of ['m', 't', 'pool', 'side', 'amt', 'pct', 'slip', 'wallet']) if (hp.has(key)) keep.set(key, hp.get(key));
    if (m && !keep.has('m') && !keep.has('t')) keep.set('m', m[1] + ':' + m[2].toLowerCase());
    for (const key of [...q.keys()]) if (key.startsWith('tgWebApp')) q.delete(key);
    q.set('tg', '1');
    // Preserve the terminal's readable colon form and all ticket parameters.
    const hash = keep.toString().replace(/%3A/gi, ':');
    history.replaceState(history.state, '', location.pathname + '?' + q + (hash ? '#' + hash : ''));
  }

  function post(type, data) {
    try {
      if (window.TelegramWebviewProxy) return window.TelegramWebviewProxy.postEvent(type, data === undefined ? '' : JSON.stringify(data));
      if (window.external && 'notify' in window.external) return window.external.notify(JSON.stringify({ eventType: type, eventData: data }));
      if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: type, eventData: data }), 'https://web.telegram.org');
    } catch {}
  }
  function openOutside(href) {
    let u; try { u = new URL(href, location.href); } catch { return false; }
    if (u.origin === location.origin) return false;
    if (u.protocol === 'https:' && u.hostname === 't.me') { post('web_app_open_tg_link', { path_full: u.pathname + u.search }); return true; }
    if (u.protocol === 'https:' || u.protocol === 'http:') { post('web_app_open_link', { url: u.href }); return true; }
    return false;
  }
  window.qxTelegram = Object.freeze({ inTelegram, getInitData, post, openOutside });
  if (inTelegram) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => post('web_app_ready'), { once: true });
    else post('web_app_ready');
    post('web_app_expand');
    post('web_app_set_header_color', { color: '#111613' });
    post('web_app_set_background_color', { color: '#0c100e' });
    const nativeOpen = window.open.bind(window);
    window.open = (url, ...rest) => (url && openOutside(String(url)) ? null : nativeOpen(url, ...rest));
    document.addEventListener('click', e => {
      const a = e.target.closest?.('a[href]');
      if (a && openOutside(a.getAttribute('href'))) e.preventDefault();
    }, true);
  }
})();
