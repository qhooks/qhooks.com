// My QHooks: the account nav sticks under the header and its underline follows the section in view (scroll-spy).
// Modules add links to the nav as their sections arrive (Callouts, Wallet checks), so it watches for new links.
const nav = document.querySelector('.mn-me-nav');
if (nav) {
  const ink = document.createElement('span'); ink.className = 'mn-me-nav__ink'; ink.setAttribute('aria-hidden', 'true'); nav.append(ink);
  let current = null;
  const place = (a) => {
    if (!a) return; current = a;
    for (const l of nav.querySelectorAll('a')) l.classList.toggle('is-on', l === a);
    ink.style.setProperty('--x', a.offsetLeft + 'px'); ink.style.setProperty('--w', a.offsetWidth + 'px');
    const left = a.offsetLeft - 24; if (left < nav.scrollLeft || a.offsetLeft + a.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  };
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) place(nav.querySelector(`a[href="#${e.target.id}"]`)); }, { rootMargin: '-35% 0px -60% 0px' });
  const watch = () => { for (const a of nav.querySelectorAll('a[href^="#"]')) { const t = document.getElementById(a.getAttribute('href').slice(1)); if (t && !t.dataset.mnSpy) { t.dataset.mnSpy = '1'; io.observe(t); } } if (nav.lastElementChild !== ink) nav.append(ink); if (!current) place(nav.querySelector('a')); };
  new MutationObserver(watch).observe(nav, { childList: true });
  new MutationObserver(watch).observe(document.getElementById('main'), { childList: true, subtree: true });
  watch();
  addEventListener('resize', () => place(current));
  document.fonts?.ready.then(() => place(current));
}
