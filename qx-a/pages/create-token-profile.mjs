// System A, /token-profile (create lane): shell, and the page lit by the banner in the editor's own live preview
// (.qtp-preview-banner from /qx-token-profile.mjs). Presentation only; the editor and publish flow are unchanged.
import { laneShell, watch } from '/qx-a/pages/create-common.mjs';
import { setArt, absUrl } from '/qx-a/components.mjs';
laneShell();
let last = '';
const paint = () => {
  const img = document.querySelector('#tp-editor .qtp-preview-banner'), box = document.querySelector('#tp-editor .qtp-preview');
  const src = img && !img.hidden ? img.getAttribute('src') || '' : '';
  if (src === last) return; last = src;
  if (src) { const u = src.startsWith('data:') ? src : absUrl(src); document.documentElement.style.setProperty('--qa-banner-blur', `url("${u}")`); box?.style.setProperty('--cx-art', `url("${u}")`); }
  else { setArt({ blur: '/qx-a/img/qhooks-banner-blur.jpg' }); box?.style.removeProperty('--cx-art'); }
};
watch(document.getElementById('tp-editor'), paint, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'hidden'] });
paint();
