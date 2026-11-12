// QCaster → Create art hand-off (QCaster v3). QCaster saves the banner through Create's own /api/token-banners path
// (uploadTokenBanner → sha256) and puts that hash in the Create link as ?art=<sha256>. The image itself is Create's
// own format: a small square JPEG data URL under LAUNCH_ICON_LIMIT, made by the same steps Create uses. The two data
// URLs wait in this browser's localStorage for one hour, keyed by that hash; Create re-checks everything before use
// (format, size, and that the banner's bytes hash to the reference) and still re-uploads the banner at launch.
import {LAUNCH_ICON_LIMIT, BANNER_HASH} from './qx-token-banner.mjs';
import {profileImage} from './qx-token-profile-core.mjs';
export const HANDOFF_KEY = 'qhooks:qcaster:art:v1', HANDOFF_MS = 3600e3;
const ICON = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const bytesOf = dataUrl => Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
export const sha256Hex = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
export function saveHandoff({image, banner, bannerData}, {store = globalThis.localStorage, now = Date.now} = {}) {
 if (!ICON.test(image || '') || image.length > LAUNCH_ICON_LIMIT || !BANNER_HASH.test(banner || '')) throw Error('The art is not ready yet.');
 profileImage(bannerData, 'banner');
 store.setItem(HANDOFF_KEY, JSON.stringify({image, banner, bannerData, at: now()}));
}
/// Create side: the art for ?art=<hash>, or null. Removes the stored copy once read.
export async function readHandoff(ref, {store = globalThis.localStorage, now = Date.now} = {}) {
 if (!BANNER_HASH.test(ref || '')) return null;
 let v = null; try { v = JSON.parse(store.getItem(HANDOFF_KEY) || 'null'); } catch { return null; }
 if (!v || v.banner !== ref || !(now() - v.at < HANDOFF_MS) || now() < v.at) return null;
 if (!ICON.test(v.image || '') || v.image.length > LAUNCH_ICON_LIMIT) return null;
 try { profileImage(v.bannerData, 'banner'); } catch { return null; }
 if (await sha256Hex(bytesOf(v.bannerData)) !== ref) return null;
 try { store.removeItem(HANDOFF_KEY); } catch {}
 return {image: v.image, banner: v.banner, bannerData: v.bannerData};
}
/// Create's square image steps (qx-quick-launch.mjs thumbnail): centre crop, 96→48 px JPEG until it fits.
export async function iconFromBlob(blob, {bitmap = globalThis.createImageBitmap, canvas = (w, h) => Object.assign(document.createElement('canvas'), {width: w, height: h})} = {}) {
 if (!/^image\/(png|jpeg|webp)$/.test(blob?.type || '')) throw Error('Choose a PNG, JPEG or WebP image.');
 if (blob.size > 8e6) throw Error('Choose an image under 8 MB.');
 const b = await bitmap(blob);
 try { const side = Math.min(b.width, b.height);
  for (const [px, q] of [[96, .82], [80, .78], [64, .74], [64, .6], [48, .6]]) {
   const c = canvas(px, px), ctx = c.getContext('2d'); ctx.fillStyle = '#fbf9f4'; ctx.fillRect(0, 0, px, px);
   ctx.drawImage(b, (b.width - side) / 2, (b.height - side) / 2, side, side, 0, 0, px, px);
   const url = c.toDataURL('image/jpeg', q); if (url.length <= LAUNCH_ICON_LIMIT) return url;
  }
  throw Error('That image is too detailed to store. Try a simpler one.');
 } finally { b.close?.(); }
}
export const blobFromDataUrl = dataUrl => new Blob([bytesOf(dataUrl)], {type: /^data:([^;,]+)/.exec(dataUrl)?.[1] || 'application/octet-stream'});
