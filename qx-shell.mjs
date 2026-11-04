// Sitewide shell: the ecosystem nav. Desktop panels open on hover/focus (CSS); this adds Escape to close them
// and the collapsible phone/tablet menu under 1100px.
const header = document.querySelector('.site-header'), nav = header?.querySelector('.site-nav');
if (header && nav) {
 const btn = document.createElement('button');
 btn.type = 'button'; btn.className = 'qx-menu'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Menu');
 btn.innerHTML = '<span></span><span></span>';
 header.insertBefore(btn, nav);
 const close = () => { btn.setAttribute('aria-expanded', 'false'); header.classList.remove('is-open'); };
 btn.addEventListener('click', () => { const open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(open)); header.classList.toggle('is-open', open); });
 nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
 addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (header.classList.contains('is-open')) { close(); btn.focus(); return; }
  const g = document.activeElement?.closest?.('.qn-g');
  header.classList.add('qn-hush');
  if (g) g.querySelector('.qn-top')?.focus();
 });
 // A pointer move or a new focus lifts the Escape hush so panels can open again.
 header.addEventListener('pointerleave', () => header.classList.remove('qn-hush'));
 nav.addEventListener('focusin', e => { if (!e.target.classList.contains('qn-top')) header.classList.remove('qn-hush'); });
 nav.addEventListener('pointerover', e => { if (e.target.closest('.qn-g') !== nav.querySelector('.qn-g:focus-within')) header.classList.remove('qn-hush'); });
}
