// QCaster v3 Design: name, ticker, look, the generated image + banner (Regenerate counts; upload your own instead),
// and "Review in Create" carrying all of it. The banner is saved through Create's own upload path; Create re-checks
// everything and the person still taps Launch and signs there.
import {h, button} from '/qx-a/components.mjs';
import {prepareTokenBanner, uploadTokenBanner} from '/qx-token-banner.mjs';
import {saveHandoff, iconFromBlob, blobFromDataUrl} from '/qcaster-handoff.mjs';

const NAME = /^[^<>\p{C}]{1,32}$/u, TICKER = /^[A-Za-z0-9]{1,10}$/;
export function artPanel(plan, link, {post, review}) {
 const art = plan.art || {}, S = {image: '', banner: '', busy: false};
 const input = (id, label, value, attrs = {}) => { const i = h('input', {id, value: value || '', autocomplete: 'off', spellcheck: 'false', ...attrs}); return [h('label', {class: 'qc-art__f', for: id}, h('span', null, label), i), i]; };
 const [nameRow, name] = input('qc-name-in', 'Name', art.name, {maxlength: '32', placeholder: 'Token name'});
 const [tickRow, ticker] = input('qc-ticker-in', 'Ticker', art.ticker, {maxlength: '10', placeholder: 'TICKER', autocapitalize: 'characters'});
 const [lookRow, look] = input('qc-look-in', 'Look', art.look, {maxlength: '240', placeholder: 'What the image should show'});
 ticker.addEventListener('input', () => { ticker.value = ticker.value.toUpperCase(); });
 const iconImg = h('img', {class: 'qc-art__icon-img', alt: 'Token image preview', hidden: true}), bannerImg = h('img', {class: 'qc-art__banner-img', alt: 'Token banner preview', hidden: true});
 const iconBox = h('div', {class: 'qc-art__icon', 'data-state': 'empty'}, iconImg), bannerBox = h('div', {class: 'qc-art__banner', 'data-state': 'empty'}, bannerImg);
 const status = h('p', {class: 'qc-art__status', role: 'status', 'aria-live': 'polite'});
 const fileIn = which => { const f = h('input', {type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true}); f.addEventListener('change', async () => { const file = f.files?.[0]; f.value = ''; if (!file) return; try { await useBlob(which, file); status.textContent = (which === 'image' ? 'Your image' : 'Your banner') + ' is in.'; } catch (e) { status.textContent = e.message; } }); return f; };
 const upImage = fileIn('image'), upBanner = fileIn('banner');
 const regen = button('Regenerate', {kind: 'secondary', size: 'sm', onclick: () => make()});
 const go = button('Review in Create', {onclick: () => void toCreate()});
 function show(which, src) { const img = which === 'image' ? iconImg : bannerImg, box = which === 'image' ? iconBox : bannerBox; img.src = src; img.hidden = !src; box.dataset.state = src ? 'ready' : 'empty'; }
 async function useBlob(which, blob) {
  if (which === 'image') { S.image = await iconFromBlob(blob); show('image', S.image); }
  else { S.banner = await prepareTokenBanner(blob); show('banner', S.banner); }
 }
 async function make() {
  if (S.busy) return; S.busy = true; regen.disabled = true; iconBox.dataset.state = bannerBox.dataset.state = 'busy'; status.textContent = 'Making your image and banner…';
  try {
   const j = await post('art', {look: look.value.trim(), name: name.value.trim(), which: ['image', 'banner']});
   if (j.mode !== 'model') { status.textContent = j.answer || 'Upload your own.'; return; }
   for (const w of ['image', 'banner']) if (j[w]) await useBlob(w, blobFromDataUrl(j[w])).catch(() => {});
   status.textContent = S.image && S.banner ? 'Image and banner ready. Regenerate, or upload your own.' : 'Part of it did not come out. Try again, or upload your own.';
  } catch (e) { status.textContent = e.message; }
  finally { S.busy = false; regen.disabled = false; iconBox.dataset.state = S.image ? 'ready' : 'empty'; bannerBox.dataset.state = S.banner ? 'ready' : 'empty'; }
 }
 async function toCreate() {
  const n = name.value.trim(), t = ticker.value.trim();
  if (art.handoff && !NAME.test(n)) { status.textContent = 'Add a name, up to 32 characters.'; name.focus(); return; }
  if (art.handoff && !TICKER.test(t)) { status.textContent = 'Add a ticker: 1 to 10 letters or digits.'; ticker.focus(); return; }
  const u = new URL(link, location.origin);
  if (!art.handoff) { location.assign(u.pathname + u.search + u.hash); return; } // Sale first / Solana keep their own forms (kitpick's #qsf-root)
  u.searchParams.set('name', n); u.searchParams.set('ticker', t.toUpperCase());
  if (S.image && S.banner) {
   go.disabled = true; status.textContent = 'Saving your banner…';
   try { const hash = await uploadTokenBanner(S.banner); saveHandoff({image: S.image, banner: hash, bannerData: S.banner}); u.searchParams.set('art', hash); }
   catch (e) { status.textContent = e.message + ' You can add the art in Create.'; go.disabled = false; return; }
  }
  location.assign(u.pathname + u.search + u.hash);
 }
 const el = h('div', {class: 'qc-art'},
  h('div', {class: 'qc-art__fields'}, nameRow, tickRow, lookRow),
  h('div', {class: 'qc-art__previews'}, iconBox, bannerBox),
  status,
  h('div', {class: 'qc-art__acts'}, regen, button('Upload image', {kind: 'quiet', size: 'sm', onclick: () => upImage.click()}), button('Upload banner', {kind: 'quiet', size: 'sm', onclick: () => upBanner.click()}), upImage, upBanner),
  art.handoff ? null : h('p', {class: 'qc-art__note'}, 'Add this art in the ' + (plan.idea.id === 'sale-first' ? 'sale form' : 'Solana form') + ' in Create.'));
 return {el, go, start: () => { if (look.value.trim() || name.value.trim()) make(); else status.textContent = 'Add a look, then Regenerate, or upload your own.'; }};
}
