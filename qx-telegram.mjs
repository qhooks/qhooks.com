// Runs before tg-early.js so Telegram launch credentials stay in memory even when the URL is normalized.
// This file is also valid as a classic script: /terminal loads it synchronously before other scripts.
// tgnew (2026-11-22, Randall: "Point telegram at new site"): a Telegram open of the classic terminal or perps page moves to
// the new site (qhooks.com/, which runs its own Telegram bridge): the trade page, a token (#m= / #t= / start parameter
// m_<chain>_<0x…>) or perps. Wallet linking (link=1), home settings (home=1), call-it (callit=1) and ?classic=1 stay here.
(function () {
  try {
    const q = new URLSearchParams(location.search), raw = location.hash.slice(1);
    const hp = /(?:^|&)tgWebApp/.test(raw) ? new URLSearchParams(raw) : null;
    if (!(q.get('tg') === '1' || hp || window.TelegramWebviewProxy)) return;
    if (['link', 'home', 'callit', 'classic'].some(k => q.has(k))) return;
    const own = hp || new URLSearchParams(raw), extra = [...own.keys()].filter(k => !/^tgWebApp/.test(k) && k !== 'm' && k !== 't');
    if (extra.length) return; // a prefilled ticket (side, amt, pool…) keeps the classic page
    const data = new URLSearchParams((hp && hp.get('tgWebAppData')) || q.get('tgWebAppData') || '');
    const start = (hp && hp.get('tgWebAppStartParam')) || q.get('tgWebAppStartParam') || data.get('start_param') || '';
    const sm = /^m_(\d+)_(0x[0-9a-fA-F]{40})$/.exec(start), mk = /^(\d+|solana):([0-9A-Za-z]{32,44})$/.exec(own.get('m') || own.get('t') || '');
    const perps = /^\/perps(\.html)?$/.test(location.pathname);
    const route = perps ? '/perps' : mk ? '/token/' + mk[1] + '/' + (mk[1] === 'solana' ? mk[2] : mk[2].toLowerCase()) : sm ? '/token/' + sm[1] + '/' + sm[2].toLowerCase() : '/pulse';
    const out = new URLSearchParams({tg: '1'}), ref = q.get('ref') || (/^ref_(0x[0-9a-fA-F]{40})$/.exec(start) || [])[1];
    if (/^0x[0-9a-fA-F]{40}$/.test(ref || '')) out.set('ref', ref.toLowerCase());
    window.__qhTgMoved = true;
    location.replace('/?' + out + '#' + route);
  } catch {}
})();
(function () {
  if (window.__qhTgMoved) return;
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
