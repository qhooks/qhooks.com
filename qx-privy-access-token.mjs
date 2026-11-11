// Shared, optional signed-in session token reader; no storage access at import time.
export function privyAccessToken(storage) {
  try {
    for (let i = 0; i < (storage?.length || 0); i++) {
      const key = storage.key(i);
      if (!/^privy:(?:[^:]+:)?token$/.test(key || '')) continue;
      const raw = storage.getItem(key); if (!raw) continue;
      let token = raw; try { token = JSON.parse(raw); } catch {}
      if (typeof token === 'string' && token.split('.').length === 3) return token;
    }
  } catch {}
  return null;
}
