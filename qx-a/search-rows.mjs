// Token rows for the shell's search (qx-a/shell.mjs), kept apart so they can be tested without a browser.
// hits: eco markets {c, k, t, s, n, i, mc, v}; lq: the lowercased query; off: /qx-official.mjs (or null); fmt: components' fmt.
export function tokenRows(hits, lq, { names = {}, off = null, fmt }) {
  const official = (m) => !!off?.officialFor?.(m.c, m.t || m.k);
  const exact = (m) => (m.s || '').toLowerCase() === lq;
  const ranked = [...hits].sort((a, b) => official(b) - official(a) || exact(b) - exact(a) || (b.mc || 0) - (a.mc || 0) || (b.v || 0) - (a.v || 0)).slice(0, 4);
  const fold = (s) => (off?.skeleton ? off.skeleton(s) : String(s || '').toLowerCase()), seen = new Set();
  return ranked.map((m) => {
    const o = off?.officialFor?.(m.c, m.t || m.k), fake = !o && off?.impostorOf?.(m.c, m.t || m.k, m.n, m.s), f = fold(m.s), dup = seen.has(f);
    seen.add(f);
    const mark = o ? 'official' : fake ? 'fake' : dup ? 'dup' : '';
    return { k: 'Token', t: '$' + m.s, img: m.i, href: '/terminal#m=' + m.c + ':' + m.k, mark,
      badge: o ? 'Official ✓' : fake ? 'Not official' : dup ? 'Same ticker' : null,
      sub: [m.n && m.n.toLowerCase() !== String(m.s || '').toLowerCase() ? m.n : null, m.mc > 0 ? 'MC ' + fmt.usd(m.mc) : null, m.t || m.k ? fmt.short(m.t || m.k) : null, names[m.c]].filter(Boolean).join(' · ') };
  });
}
