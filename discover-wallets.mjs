export function discoverWallets(target, onChange) {
  if (!target || ['addEventListener','removeEventListener','dispatchEvent'].some(k => typeof target[k] !== 'function') || typeof onChange !== 'function') throw new TypeError('Invalid discovery target');
  const entries = new Map();
  let stopped = false;
  const listener = e => {
    if (stopped) return;
    try {
      const {info,provider} = e.detail || {};
      const {uuid,name} = info || {};
      if (typeof uuid !== 'string' || !uuid.length || uuid.length > 80 || typeof name !== 'string' || !name.trim() || name.length > 80) return;
      if (!provider || ['request','on','removeListener'].some(k => typeof provider[k] !== 'function')) return;
      if (entries.has(uuid) || [...entries.values()].some(e => e.provider === provider) || entries.size >= 8) return;
      entries.set(uuid, Object.freeze({uuid,name,provider}));
      onChange(Object.freeze([...entries.values()]));
    } catch { /* Malformed provider announcements never interrupt discovery. */ }
  };
  target.addEventListener('eip6963:announceProvider', listener);
  target.dispatchEvent(new Event('eip6963:requestProvider'));
  return Object.freeze({stop() {
    stopped = true;
    target.removeEventListener('eip6963:announceProvider', listener);
    entries.clear();
  }});
}
