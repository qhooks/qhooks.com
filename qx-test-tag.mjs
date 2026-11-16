// "Test" tags for a creator's test launches on /me and /profile (2026-11-12). The list itself is qx-test-tokens.mjs
// (reviewed with Randall); this file only orders launch cards and draws the tag. A launch matches by token or controller.
import { isTestToken } from './qx-test-tokens.mjs';
export const isTestLaunch = (L) => !!L && (isTestToken(L.chainId, L.token) || isTestToken(L.chainId, L.controller));
/// Real launches first (in their given order), then test launches (in theirs).
export const orderLaunches = (list) => [...(list || []).filter((L) => !isTestLaunch(L)), ...(list || []).filter(isTestLaunch)];

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const s = document.createElement('style');
  s.textContent = '.qa-test-tag{display:inline-block;margin-left:.5em;padding:1px 7px;border:1px solid currentColor;border-radius:999px;'
    + 'font:600 11px/1.5 var(--qa-sans,inherit);letter-spacing:.06em;text-transform:uppercase;vertical-align:middle;opacity:.62}';
  document.head.append(s);
}
/// The small "Test" tag for a launch card heading.
export function testTag() {
  style();
  const t = document.createElement('span');
  t.className = 'qa-test-tag'; t.textContent = 'Test'; t.title = 'A test launch by this creator';
  return t;
}
