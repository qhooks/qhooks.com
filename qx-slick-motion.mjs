// Compact feedback only. Existing feed owns real ticks, keyboard and overlays.
const FEED_PATHS = new Set(['/api/terminal/feed', '/api/terminal/market/feed']);
const SAMPLE_LIFETIME_MS = 120000;

export function mountSlickMotion({ root, statusHost } = {}) {
  if (!root) return { dispose() {} };
  root.classList.add('qx-slick');
  const href = '/qx-slick-motion.css';
  if (!document.querySelector(`link[href="${href}"]`)) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = href; document.head.append(css);
  }
  let timer = null, disposed = false, pageAway = false;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!statusHost) return;
    statusHost.hidden = true;
    statusHost.textContent = '';
    statusHost.removeAttribute('title');
    statusHost.removeAttribute('aria-label');
  };
  const seen = event => {
    const d = event.detail;
    if (disposed || !statusHost || d?.network !== true || !FEED_PATHS.has(d.path)) return;
    if (root.hidden || root.isConnected === false || document.hidden || pageAway || !Number.isFinite(d.durationMs) || d.durationMs <= 0 || !Number.isInteger(d.status) || d.status < 200 || d.status >= 300) { clear(); return; }
    const ms = d.durationMs < 1 ? d.durationMs : Math.round(d.durationMs);
    statusHost.hidden = false;
    statusHost.textContent = ms < 1 ? '<1ms' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
    statusHost.title = `Feed API: ${ms} milliseconds to response headers`;
    statusHost.setAttribute('aria-label', statusHost.title);
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(clear, SAMPLE_LIFETIME_MS);
  };
  const visibility = () => { if (document.hidden) clear(); };
  const hide = () => { pageAway = true; clear(); };
  const show = () => { pageAway = false; clear(); };
  clear();
  if (statusHost) statusHost.classList.add('qx-api-latency');
  addEventListener('qhooks:public-read-finished', seen);
  document.addEventListener('visibilitychange', visibility);
  addEventListener('pagehide', hide);
  addEventListener('pageshow', show);
  return { dispose() {
    if (disposed) return;
    disposed = true;
    removeEventListener('qhooks:public-read-finished', seen);
    document.removeEventListener('visibilitychange', visibility);
    removeEventListener('pagehide', hide);
    removeEventListener('pageshow', show);
    clear();
    root.classList.remove('qx-slick');
    statusHost?.classList.remove('qx-api-latency');
  } };
}
