// QHooks System A: the shell for the home lane's story, docs and app pages (everything but the home page itself).
// The body carries the options: data-a-active (trade|hooks|launch|community|portfolio), data-a-mode, data-a-title, data-a-back.
// The legacy wallet runtime keeps running: #qhc-trigger moves into the shell's wallet slot, the dialog stays as it is.
import { mountShell } from '/qx-a/shell.mjs';
import { setArt } from '/qx-a/components.mjs';

const doc = document, body = doc.body, d = body.dataset;
setArt({ banner: '/qx-a/img/qhooks-banner.jpg', blur: '/qx-a/img/qhooks-banner-blur.jpg' });

const trigger = doc.getElementById('qhc-trigger');
// One gold action per view: a page whose own primary action is gold (data-a-wallet="secondary") gets a quiet wallet button.
if (trigger) trigger.classList.add('qa-btn', d.aWallet === 'secondary' ? 'qa-btn--secondary' : 'qa-btn--primary', 'qa-wallet__btn');
export const shell = mountShell({ active: d.aActive || '', mode: d.aMode || 'app', title: d.aTitle || '', back: d.aBack || '/', wallet: trigger || undefined, logo: '/qhooks-logo.jpg' });
// the shell's own Connect button (pages without #qhc-trigger) follows the same rule
if (!trigger && d.aWallet === 'secondary') shell.slots.wallet.querySelector('.qa-btn--primary')?.classList.replace('qa-btn--primary', 'qa-btn--secondary');

// Pages with the shared wallet dialog also load the legacy runtime around it (copy address, account menu, get-the-app).
// Pages without it (the contributor round has its own connect) get the app links only.
if (doc.getElementById('qhc-dialog')) import('/qx-shell.mjs').catch(() => {});
else import('/qx-getapp.mjs').catch(() => {});
// The shell's own Connect button (pages without #qhc-trigger) hands over to the page's connect control.
addEventListener('qa:wallet', () => { const c = doc.querySelector('[data-a-connect]'); if (c) { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); c.click(); } });

// One footer: the site directory and the legal line move into the shell footer.
{
  const foot = shell.footer, base = foot?.querySelector('.qa-foot__base');
  const dir = doc.querySelector('[data-a-dir]'), legal = doc.querySelector('[data-a-legal]');
  if (foot && base) { if (dir) foot.insertBefore(dir, base); if (legal) base.after(legal); }
}

// "On this page" navs: the link for the section in view is underlined in gold.
for (const toc of doc.querySelectorAll('[data-a-toc]')) {
  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const targets = links.map((a) => doc.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)))).filter(Boolean);
  if (!targets.length || !('IntersectionObserver' in window)) continue;
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) {
      const id = e.target.id;
      links.forEach((a) => { const on = a.getAttribute('href') === '#' + id; a.classList.toggle('is-on', on); if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
      const on = links.find((a) => a.classList.contains('is-on'));
      if (on && toc.scrollWidth > toc.clientWidth) toc.scrollTo({ left: on.offsetLeft - 24, behavior: 'smooth' });
    }
  }, { rootMargin: '-30% 0px -62% 0px' });
  targets.forEach((t) => io.observe(t));
}
