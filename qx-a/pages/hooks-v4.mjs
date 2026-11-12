// /hooks v4 (2026-11-12): the Builders Lab as one scene. The hero object is the QHooks hook with a launch block seated
// on its shank (hooks-v4-scene.mjs, loaded after first paint where WebGL runs). The block's face carries the launch
// whose trade last ran through blocks, read from the page's own live list (#hk-live, filled by qx-hooks.mjs from the
// public feed); when a trade runs through (a row gets is-hit), the block re-seats. No extra network reads.
// Without WebGL: the set's still plate with the hook photograph. Reduced motion: one still frame.
const doc = document, $ = (id) => doc.getElementById(id);
const hero = doc.querySelector('.hk4-hero'), stage = hero?.querySelector('.hk4-stage'), tag = $('hk4-tag'), live = $('hk-live');
if (hero && stage) {
  doc.querySelector('main')?.classList.add('hk4');
  const webgl = (() => { try { const c = doc.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  let set = null, faceKey = '', formed = false;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  // the hook's photograph where the live set can't run
  function still() {
    stage.classList.remove('hk4-stage--set'); stage.classList.add('hk4-stage--still');
    if (!stage.querySelector('.hk4-still')) { const im = new Image(); im.className = 'hk4-still'; im.alt = ''; im.decoding = 'async'; im.src = '/qx-a/img/hook-cut.png'; stage.prepend(im); }
  }
  // the latest-traded launch running blocks, from the page's own rows
  function rowData(row) {
    if (!row?.dataset?.key) return null;
    const sym = (row.querySelector('.qa-row__t')?.firstChild?.textContent || '').trim(), chain = row.querySelector('.hk-row__chain')?.textContent || '';
    const blocks = row.querySelectorAll('.hk-run__g').length, age = row.querySelector('.hk-row__age')?.textContent || '';
    const img = row.querySelector('.hk-row__coin img');
    return { key: row.dataset.key, sym, chain, blocks, age, img };
  }
  function faceOf(d, index) {
    return { title: d.sym || 'QHooks', sub: (d.blocks ? d.blocks + (d.blocks === 1 ? ' block' : ' blocks') : 'Open trading') + (d.chain ? ' · ' + d.chain : ''),
      note: d.age && d.age !== '–' ? 'Last trade ' + d.age + ' ago' : 'Live on QHooks', index, img: d.img?.complete && d.img.naturalWidth ? d.img : null, sym: d.sym.replace(/^\$/, '') };
  }
  function show(d, fresh) {
    if (!d) return;
    const key = d.key + ':' + d.blocks; if (key === faceKey && !fresh) return; faceKey = key;
    const n = [...(live?.children || [])].findIndex((r) => r.dataset.key === d.key);
    const face = faceOf(d, String(n >= 0 ? n + 1 : 1).padStart(2, '0'));
    const paint = () => { set?.setFace(face); };
    if (d.img && !(d.img.complete && d.img.naturalWidth)) d.img.addEventListener('load', () => { face.img = d.img; paint(); }, { once: true });
    paint();
    tag.replaceChildren(doc.createTextNode(fresh ? 'Ran through' : 'On the hook'), Object.assign(doc.createElement('b'), { textContent: d.sym }), doc.createTextNode(face.sub));
    tag.hidden = !d.sym;
    if (!set) return;
    if (!formed) { formed = true; set.form(); } else if (fresh) set.pulse();
  }
  const latest = () => { const rows = [...(live?.children || [])].filter((r) => r.dataset?.key); return rowData(rows.find((r) => r.querySelectorAll('.hk-run__g').length) || rows[0]); };
  if (!webgl) still();
  else {
    stage.classList.add('hk4-stage--set');
    idle(() => import('/qx-a/pages/hooks-v4-scene.mjs').then(({ mountHookSet }) => {
      set = mountHookSet(stage, { posY: .62 }); if (!set) throw new Error('no webgl');
      stage.classList.add('is-live');
      faceKey = ''; const d = latest(); if (d) show(d, false);
      // the block seats once the latest launch is known (the list fills within a second or two), or on its own
      setTimeout(() => { if (!formed) { formed = true; set.setFace({ title: 'QHooks', sub: 'Launch blocks', note: 'Builders Lab', index: '01', img: null, sym: '' }); set.form(); } }, 2500);
    }).catch((e) => { console.warn('hooks-v4: set', e?.message || e); still(); }), { timeout: 1500 });
  }
  if (live) new MutationObserver((muts) => {
    for (const m of muts) if (m.type === 'attributes' && m.target.classList?.contains('is-hit')) { show(rowData(m.target), true); return; }
    const d = latest(); if (d) show(d, false);
  }).observe(live, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

// the step rails carry index numerals (annotation detail); the section heads get the display scale by CSS
for (const rail of doc.querySelectorAll('.hk-how-rail')) [...rail.children].forEach((li, i) => { li.dataset.i = String(i + 1).padStart(2, '0'); });
