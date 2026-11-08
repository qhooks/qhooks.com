import './qx-shell.mjs';
import {mountHomeLive} from './qx-home-live.mjs';
const homeLive=mountHomeLive(document.querySelector('[data-home-live]'));
window.addEventListener('pagehide',()=>homeLive?.dispose(),{once:true});
// QHooks home motion: hero pointer depth + lattice spotlight, scroll-linked launch explainer, reveals.
// Everything settles when input stops and is off under prefers-reduced-motion.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;

// Hero: eased pointer parallax; the rAF loop stops once the target is reached.
const frame = document.querySelector('[data-hx-frame]');
if (frame && fine && !reduce) {
 let tx = 0, ty = 0, x = 0, y = 0, mx = 70, my = 45, cmx = 70, cmy = 45, raf = 0;
 const step = () => {
  x += (tx - x) * .08; y += (ty - y) * .08; cmx += (mx - cmx) * .14; cmy += (my - cmy) * .14;
  frame.style.setProperty('--hx-x', (x * -14).toFixed(2) + 'px'); frame.style.setProperty('--hx-y', (y * -10).toFixed(2) + 'px');
  frame.style.setProperty('--hx-lx', (x * -6).toFixed(2) + 'px'); frame.style.setProperty('--hx-ly', (y * -4).toFixed(2) + 'px');
  frame.style.setProperty('--hx-mx', cmx.toFixed(2) + '%'); frame.style.setProperty('--hx-my', cmy.toFixed(2) + '%');
  raf = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(mx - cmx) / 100 + Math.abs(my - cmy) / 100 > .002 ? requestAnimationFrame(step) : 0;
 };
 frame.addEventListener('pointermove', e => {
  const r = frame.getBoundingClientRect();
  tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5;
  mx = ((e.clientX - r.left) / r.width) * 100; my = ((e.clientY - r.top) / r.height) * 100;
  if (!raf) raf = requestAnimationFrame(step);
 });
 frame.addEventListener('pointerleave', () => { tx = ty = 0; mx = 70; my = 45; if (!raf) raf = requestAnimationFrame(step); });
}

// Launch explainer: the step nearest the viewport middle drives the sticky stage.
const stage = document.querySelector('.lx-stage');
const steps = [...document.querySelectorAll('.lx-step')];
if (stage && steps.length) {
 const set = n => { stage.dataset.step = n; steps.forEach(s => s.classList.toggle('is-active', s.dataset.step === n)); };
 set(reduce ? '4' : '1');
 if (!reduce) {
  const io = new IntersectionObserver(entries => {
   for (const entry of entries) if (entry.isIntersecting) set(entry.target.dataset.step);
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach(s => io.observe(s));
 } else steps.forEach(s => s.classList.add('is-active'));
}

// Reveals.
const reveals = document.querySelectorAll('.qx-reveal');
if (reduce || !('IntersectionObserver' in window)) reveals.forEach(el => el.classList.add('is-in'));
else {
 const io = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
 }), { rootMargin: '0px 0px -10% 0px' });
 reveals.forEach(el => io.observe(el));
}

// Hook cards: spotlight follows the pointer.
if (fine) document.querySelectorAll('.hk-card a').forEach(card => card.addEventListener('pointermove', e => {
 const r = card.getBoundingClientRect();
 card.style.setProperty('--hk-x', (e.clientX - r.left) + 'px'); card.style.setProperty('--hk-y', (e.clientY - r.top) + 'px');
}));

// Ecosystem map: stage cards follow the pointer, and the rail node for the hovered stage lights up.
document.querySelectorAll('.eco-stage').forEach(stage => {
 const node = document.querySelector(`.eco-rail a[href="#${stage.id}"]`);
 if (fine) stage.addEventListener('pointermove', e => {
  const r = stage.getBoundingClientRect();
  stage.style.setProperty('--eco-x', (e.clientX - r.left) + 'px'); stage.style.setProperty('--eco-y', (e.clientY - r.top) + 'px');
 });
 stage.addEventListener('pointerenter', () => node?.classList.add('is-hot'));
 stage.addEventListener('pointerleave', () => node?.classList.remove('is-hot'));
});
