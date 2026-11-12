// /community, first thing in <head> (a classic async script: WebKit runs async modules only after parsing): start the calls read before the page's module graph and
// the wallet modules have loaded, so the call cards can paint the moment qx-community.mjs runs (2026-11-12, Randall on
// iPhone: the calls "took too long to load"). qx-community.mjs takes this promise once for its first Recent read.
{
  const ROUTE = '/api/community/activity?view=recent&limit=20';
  if (!/^#following/.test(location.hash) && !globalThis.__qxActivityEarly) {
    globalThis.__qxActivityEarly = { url: ROUTE, at: Date.now(), body: fetch(ROUTE, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null) };
  }
}
