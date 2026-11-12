// /profile/<wallet or handle>, first thing in <head> (a classic async script: WebKit runs async modules only after parsing).
// 2026-11-12, main's newcomer walk: on a phone a caller's profile showed the look-up / "Create my EVM profile" layout for
// 5.6 s before its stats, so it looked like your own empty profile; on desktop the Calls tab said "Reading this wallet's
// launches…" for 9.7 s. This paints the caller's page from the URL alone, before the module graph has loaded:
//   - the page state is "profile" (the look-up form stays hidden) and the name is the short address or the handle;
//   - the record strip and the Calls list show at once: on a return visit, what this device read last time
//     (localStorage qx.profile.v1, written by qx-profile-v3.mjs; text only), otherwise placeholders and "Loading calls…";
//   - the caller read starts now; qx-profile.mjs and qx-profile-v3.mjs take this promise instead of reading it again.
// The page modules replace all of it with the current record as soon as they run.
{
  const match = /^\/profile\/([^/]+)\/?$/.exec(location.pathname);
  let part = '';
  try { part = decodeURIComponent((match && match[1]) || '').trim(); } catch {}
  const wallet = /^0x[0-9a-fA-F]{40}$/.test(part) ? part.toLowerCase() : null;
  const handle = !wallet && /^[a-z0-9_]{3,24}$/i.test(part) ? part.toLowerCase() : null;
  if (wallet || handle) {
    if (wallet && !globalThis.__qxProfileEarly) {
      const url = '/api/community/v2/caller/' + wallet;
      globalThis.__qxProfileEarly = { url, at: Date.now(), body: fetch(url, { cache: 'no-store', credentials: 'omit' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null) };
    }
    let saved = null;
    try {
      const all = JSON.parse(localStorage.getItem('qx.profile.v1') || '{}');
      saved = all[wallet || '@' + handle] || null;
      if (!saved || !(Date.now() - Number(saved.at) < 7 * 864e5)) saved = null;
    } catch { saved = null; }
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
    const paint = () => {
      const main = document.querySelector('main.pv3'), title = document.getElementById('qp-title');
      const trading = document.getElementById('qp-trading'), root = document.getElementById('qp-root');
      if (!main || !title || !trading || !root) return false;
      if (main.querySelector('.pv-tabs, .pv3-proof:not([data-qp-early])')) return true; // the page modules got there first
      // The profile route already wrote the state, the name and placeholders into the HTML (callerSkeleton); without
      // them (a cached or older page) this writes them. A saved copy from the last visit replaces the placeholders.
      const served = main.dataset.pv3State === 'profile';
      if (served && !saved) return true;
      main.dataset.pv3State = 'profile';
      // the server already wrote the profile's name (or handle, or short address) into <title> for share previews
      const titled = /^(.+) \| QHooks$/.exec(document.title || '');
      const known = titled && !/^(Community profiles|Profile not found|Profiles)$/.test(titled[1]) ? titled[1] : '';
      const name = (saved && typeof saved.name === 'string' && saved.name) || known || (wallet ? wallet.slice(0, 6) + '…' + wallet.slice(-4) : '@' + handle);
      if (!served || (saved && saved.name)) {
        title.replaceChildren(el('span', 'qp-mono', name.slice(0, 48)));
        title.classList.toggle('is-addr', /^0x[0-9a-f]{4}/i.test(name));
      }
      // the record strip: last visit's cells, or four placeholders
      const strip = el('div', 'qa-record pv3-proof');
      strip.dataset.qpEarly = saved ? 'saved' : 'skeleton';
      strip.setAttribute('aria-label', 'Caller record');
      const cells = saved && Array.isArray(saved.cells) && saved.cells.length ? saved.cells.slice(0, 6) : null;
      if (cells) for (const c of cells) { const d = el('div'); d.append(el('b', ['up', 'down'].includes(c[2]) ? 'qa-' + c[2] : '', c[0]), el('span', '', c[1])); strip.append(d); }
      else { strip.setAttribute('aria-busy', 'true'); for (let i = 0; i < 4; i++) { const d = el('div', 'pv3-skel'); d.append(el('b', '', ' '), el('span', '', ' ')); strip.append(d); } }
      const oldStrip = main.querySelector('.pv3-proof[data-qp-early]');
      if (oldStrip) oldStrip.replaceWith(strip); else trading.before(strip);
      trading.toggleAttribute('data-pv-off', true);
      // the Calls list: last visit's rows (text only), then the line that says the current record is on its way
      const section = el('section', 'qa-section pv3-early');
      section.dataset.qpEarly = '1';
      section.setAttribute('aria-busy', 'true');
      const head = el('div', 'qa-section-head'); head.append(el('h2', '', 'Calls')); section.append(head);
      const rows = saved && Array.isArray(saved.calls) ? saved.calls.slice(0, 8) : [];
      for (const r of rows) {
        const a = el('a', 'pv3-early-call'); a.href = '/call/' + encodeURIComponent(String(r.id || ''));
        const top = el('span', 'pv3-early-call__top'); top.append(el('b', '', r.sym ? '$' + String(r.sym).slice(0, 16) : 'Call'));
        if (r.move) top.append(el('span', ['up', 'down'].includes(r.dir) ? 'qa-' + r.dir : '', r.move));
        a.append(top); if (r.text) a.append(el('span', 'pv3-early-call__text', String(r.text).slice(0, 160)));
        section.append(a);
      }
      section.append(el('p', 'qa-loading', rows.length ? 'Refreshing…' : 'Loading calls…'));
      root.replaceChildren(section);
      return true;
    };
    if (!paint()) {
      const mo = new MutationObserver(() => { if (paint()) mo.disconnect(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', () => { paint(); mo.disconnect(); }, { once: true });
    }
  }
}
