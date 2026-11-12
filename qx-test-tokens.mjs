// Test tokens (2026-11-12, Randall: label his other launches "test"). The reviewed list, chain:token, lowercase. A test token is
// never a page's hero, and the wallet menu tags it "Test". CONTROLLERS maps the same launches' market keys (the public
// /api/account/<w>/launches controller) where they differ from the token, so pages that only know a market link match too.
export const TEST_TOKENS = Object.freeze([
  '8453:0xe319336506857ed9293eb06014d79026c9aedf13',  // CLEAN
  '99901:0x6d082feb98559525f3999751c3289f398b33cbc7', // QANGEL
  '4663:0xc8d3d74eeec942d1a11d8f6e19de5e75e0c12951',  // QCAT
]);
export const TEST_CONTROLLERS = Object.freeze([
  '4663:0xb844df3293222fb1460be1c7ce753eede2d1fcf5',  // QCAT market controller
]);
const SET = new Set([...TEST_TOKENS, ...TEST_CONTROLLERS]);
export function isTestToken(chainId, token) { return SET.has(String(chainId) + ':' + String(token || '').toLowerCase()); }
