// Inside Telegram (tg-early.js marked the page): tell Telegram the terminal is ready, take the full height, match
// Telegram's header to the terminal, and hand outside links (wallet apps, explorers, X) to Telegram, since its
// in-app view does not open new windows. Speaks Telegram's Mini App event protocol directly, without its script.
const inTelegram = document.documentElement.dataset.tg === '1';

function post(type, data) {
  try {
    if (window.TelegramWebviewProxy) return window.TelegramWebviewProxy.postEvent(type, data === undefined ? '' : JSON.stringify(data));
    if (window.external && 'notify' in window.external) return window.external.notify(JSON.stringify({ eventType: type, eventData: data }));
    if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: type, eventData: data }), 'https://web.telegram.org');
  } catch {}
}

/// Opens an outside URL through Telegram; true when handled.
function openOutside(href) {
  let u; try { u = new URL(href, location.href); } catch { return false; }
  if (u.origin === location.origin) return false;
  if (u.protocol === 'https:' && u.hostname === 't.me') { post('web_app_open_tg_link', { path_full: u.pathname + u.search }); return true; }
  if (u.protocol === 'https:' || u.protocol === 'http:') { post('web_app_open_link', { url: u.href }); return true; }
  return false;
}

if (inTelegram) {
  post('web_app_ready');
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

export { inTelegram, post, openOutside };
