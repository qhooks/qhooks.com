// Compact feedback only. Existing feed owns real ticks, keyboard and overlays.
export function mountSlickMotion({ root, statusHost } = {}) {
  if (!root) return { dispose() {} };
  root.classList.add('qx-slick');
  const href = '/qx-slick-motion.css';
  if (!document.querySelector(`link[href="${href}"]`)) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = href; document.head.append(css);
  }
  const seen = event => {
    const d = event.detail;
    if (!statusHost || root.hidden || document.hidden || d?.network !== true || !Number.isFinite(d.durationMs) || d.durationMs < 0 || !Number.isInteger(d.status) || d.status < 200 || d.status >= 400) return;
    const ms = Math.max(1, Math.round(d.durationMs));
    statusHost.hidden = false;
    statusHost.textContent = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
    statusHost.title = `API response: ${ms} milliseconds (time to response headers)`;
    statusHost.setAttribute('aria-label', statusHost.title);
  };
  if (statusHost) { statusHost.hidden = true; statusHost.classList.add('qx-api-latency'); }
  addEventListener('qhooks:public-read-finished', seen);
  return { dispose() { removeEventListener('qhooks:public-read-finished', seen); root.classList.remove('qx-slick'); if(statusHost){statusHost.hidden=true;statusHost.textContent='';statusHost.removeAttribute('title');statusHost.removeAttribute('aria-label');statusHost.classList.remove('qx-api-latency');} } };
}
