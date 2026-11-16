import {tokenAvatarSources} from './qx-token-avatar.mjs';
import {officialLogo} from './qx-official.mjs';

// Artwork only: old saved rows can recover their image from the already loaded
// feed. Never identify a token by its ticker, or mistake a trade quantity for it.
export function marketAvatarSources(raw = {}, markets = []) {
  const chainId = String(raw.chainId || '');
  if (!/^(?:[1-9]\d*|solana)$/.test(chainId)) return [];
  const address = value => typeof value === 'string' &&
    (chainId === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) : /^0x[\da-f]{40}$/i.test(value))
      ? chainId === 'solana' ? value : value.toLowerCase() : null;
  const token = address(raw.token) || address(raw.address), controller = chainId === 'solana' ? null : address(raw.controller);
  if (!token && !controller) return [];
  const listed = (Array.isArray(markets) ? markets : []).find(row =>
    String(row?.chainId) === chainId && (token
      ? address(row.token) === token && (!controller || address(row.controller) === controller)
      : address(row.controller) === controller));
  const resolvedToken = token || address(listed?.token), resolvedController = controller || address(listed?.controller);
  const profiles = chainId === 'solana' ? [] : [...new Set([resolvedController, resolvedToken].filter(Boolean))]
    .map(contract => `/api/token-profiles/${chainId}/${contract}/image`);
  return [...new Set([
    ...tokenAvatarSources(listed || {}, Array.isArray(listed?.avatarSources) ? listed.avatarSources : []),
    ...tokenAvatarSources(raw, Array.isArray(raw.avatarSources) ? raw.avatarSources : []),
    officialLogo(chainId, resolvedToken), ...profiles,
  ].filter(Boolean))].slice(0, 10);
}
