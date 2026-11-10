// Terminal badge for relaunches (QRelaunch): on a NEW token, "Verified relaunch of OLD by its owner / deployer / QHooks
// launch creator"; on an OLD token, "Migrating to NEW · swap until …" with a link to /relaunch. Reads the chain directly
// (originOf / migratorOf on the chain's QRelaunch); hidden on chains without one or when QRelaunch is not deployed yet.
import {chainById} from '/chains.mjs';
const SEL = {originOf: '0xa6c519cb', migratorOf: '0x23ba4147', newToken: '0xc42bd05a', end: '0xefbe1c1c', finished: '0xbef4876b', symbol: '0x95d89b41'};
const KIND = {1: 'its owner', 2: 'its deployer', 3: 'its QHooks launch creator'};
const ZERO = '0x0000000000000000000000000000000000000000';
let cfgP = null; const mounts = new WeakMap();
const pad = a => a.slice(2).toLowerCase().padStart(64, '0');
const wAddr = (h, i = 0) => '0x' + (h || '0x').slice(2 + 64 * i + 24, 66 + 64 * i);
const wNum = (h, i = 0) => BigInt('0x' + ((h || '0x').slice(2 + 64 * i, 66 + 64 * i) || '0'));
const sym = h => { try { if (!h || h.length < 130) return ''; const n = Number(wNum(h, 1)); return new TextDecoder().decode(Uint8Array.from(h.slice(130, 130 + n * 2).match(/../g) || [], x => parseInt(x, 16))); } catch { return ''; } };
export async function relaunchBadge(chainId, token, {fetchImpl = globalThis.fetch} = {}) {
  cfgP ||= fetchImpl('/full-launch/relaunch-v1.json').then(r => r.json()).catch(() => null);
  const cfg = await cfgP, c = cfg?.chains?.[String(chainId)], ch = chainById(String(chainId));
  if (!c || !ch?.rpc || !/^0x[0-9a-fA-F]{40}$/.test(token || '')) return null;
  const rpc = async (calls) => { const r = await fetchImpl(ch.rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(calls.map(([to, data], i) => ({jsonrpc: '2.0', id: i, method: 'eth_call', params: [{to, data}, 'latest']})))}); const j = await r.json(); return (Array.isArray(j) ? j : [j]).sort((a, b) => a.id - b.id).map(x => x.error ? null : x.result); };
  const [origin, mig] = await rpc([[c.relaunch, SEL.originOf + pad(token)], [c.relaunch, SEL.migratorOf + pad(token)]]);
  const old = origin && origin.length >= 194 ? wAddr(origin, 0) : ZERO;
  if (old !== ZERO) {
    const [s] = await rpc([[old, SEL.symbol]]);
    return {kind: 'new', old, oldSymbol: sym(s) || old.slice(0, 8), proof: KIND[Number(wNum(origin, 1))] || 'its team', authorizer: wAddr(origin, 2), chainId: String(chainId), explorer: ch.explorer};
  }
  const m = mig && mig.length >= 66 ? wAddr(mig) : ZERO;
  if (m !== ZERO) {
    const [nt, end, fin] = await rpc([[m, SEL.newToken], [m, SEL.end], [m, SEL.finished]]);
    const newToken = wAddr(nt), [s] = await rpc([[newToken, SEL.symbol]]);
    return {kind: 'old', newToken, newSymbol: sym(s) || newToken.slice(0, 8), end: Number(wNum(end)), finished: wNum(fin) === 1n, chainId: String(chainId)};
  }
  return null;
}
export function mountRelaunchBadge(anchor, meta, opts = {}) {
  if (!anchor) return;
  const key = meta?.chainId && meta?.token ? meta.chainId + ':' + String(meta.token).toLowerCase() : null, prev = mounts.get(anchor);
  if (prev?.key === key) return;
  prev?.node.remove(); mounts.delete(anchor); if (!key) return;
  const doc = anchor.ownerDocument, node = doc.createElement('p'); node.className = 'qx-relaunch-badge'; node.hidden = true; anchor.before(node);
  const rec = {key, node}; mounts.set(anchor, rec);
  relaunchBadge(meta.chainId, meta.token, opts).then(b => {
    if (mounts.get(anchor) !== rec || !b) return;
    const a = (href, text) => { const x = doc.createElement('a'); x.href = href; x.textContent = text; return x; };
    if (b.kind === 'new') node.append('Verified relaunch of ', a('/terminal?chain=' + b.chainId + '&token=' + b.old, b.oldSymbol), ' by ' + b.proof + ' (',
      a((b.explorer || '') + '/address/' + b.authorizer, b.authorizer.slice(0, 6) + '…' + b.authorizer.slice(-4)), ').');
    else node.append(b.finished || Date.now() / 1000 >= b.end ? 'Relaunched as ' : 'Migrating to ', a('/terminal?chain=' + b.chainId + '&token=' + b.newToken, b.newSymbol),
      ...(b.finished || Date.now() / 1000 >= b.end ? ['. The swap window has closed.'] : [' · swap until ' + new Date(b.end * 1000).toLocaleDateString() + ' · ', a('/relaunch?chain=' + b.chainId + '&migrate=' + meta.token.toLowerCase(), 'Swap')]));
    node.hidden = false;
  }).catch(() => {});
}
