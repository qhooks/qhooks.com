// QHooks System A: shell for the token lane's smaller pages (trade, pool, the QHOOKS plan). Presentation only.
// The page's own wallet button (#qhc-trigger, driven by wallet-site.mjs) moves into the shell's wallet slot.
import { h, icon, coin, seal, setArt } from '/qx-a/components.mjs';
import { mountShell } from '/qx-a/shell.mjs';

const doc = document, body = doc.body, $ = (id) => doc.getElementById(id);
const tg = doc.documentElement.dataset.tg === '1';
const holder = $('ta-holder'), trigger = $('qhc-trigger');
if (!doc.querySelector('.qa-hdr')) mountShell({ active: body.dataset.aActive || 'trade', mode: 'app', wallet: trigger || undefined, logo: '/qhooks-logo.jpg', footer: !tg });
if (holder) { const keep = holder.querySelector('[data-theme-toggle]'); if (keep) { keep.hidden = true; doc.querySelector('.qa-wallet')?.append(keep); } holder.remove(); }
if (tg) body.classList.add('ta-tg');

// The QHOOKS plan: the official token's art lights the page and opens the hero.
if (body.classList.contains('tp-qhooks-token')) {
  setArt({ banner: '/qx-a/img/qhooks-banner.jpg', blur: '/qx-a/img/qhooks-banner-blur.jpg', icon: '/qx-a/img/qhooks-icon.jpg' });
  const hero = doc.querySelector('.rm-hero');
  if (hero) {
    const art = h('div', { class: 'tp-hero-art', 'aria-hidden': 'true' }, h('div', { class: 'qa-stage__glow' }), h('div', { class: 'qa-stage__frame' }, h('img', { class: 'qa-stage__img', src: '/qx-a/img/qhooks-banner.jpg', alt: '', width: 1500, height: 500 }), h('span', { class: 'qa-stage__sheen' })));
    const ident = h('div', { class: 'tp-ident' }, coin('/qx-a/img/qhooks-icon.jpg', { size: 'md', alt: 'QHOOKS icon' }), h('span', { class: 'tp-sym' }, 'QHOOKS', seal('Official QHooks token')),
      h('a', { class: 'qa-link tp-trade', href: '/terminal#t=4663:0x20429af7ca3b0ce4d99edbaa0693f26c5df05195' }, 'Trade', icon('out')));
    hero.prepend(art);
    hero.querySelector('.qx-eyebrow')?.before(ident);
  }
}
