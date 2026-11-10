const SAFE = '0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71';
const errors = {
  not_owner: 'Connect a QHooks owner wallet.',
  needs_100_usdc: 'Deposit at least 100 USDC to Hyperliquid first.',
  refreshing: 'Refreshing. Try again in a moment.',
  nonce_expired: 'Signature expired. Try again.',
  invalid_signature: 'Signature could not be verified. Try again.',
  invalid_wallet: 'Connect your wallet and try again.'
};
async function api(path, options, fetchImpl) {
  let response, body;
  try {
    response = await fetchImpl(path, {cache: 'no-store', signal: AbortSignal.timeout(10000), ...options});
    body = await response.json();
  } catch { throw Error(errors.refreshing); }
  if (!response.ok) throw Error(errors[body?.error] || errors.refreshing);
  return body;
}
export async function isSafeOwner(address, fetchImpl = (...args) => globalThis.fetch(...args)) {
  const rpc = await api('https://arb1.arbitrum.io/rpc', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{to: SAFE, data: '0xa0e67e2b'}, 'latest']})}, fetchImpl);
  const data = rpc?.result?.slice(2);
  if (rpc.error || !/^0x[0-9a-f]+$/i.test(rpc?.result || '') || data.length < 128 || BigInt('0x' + data.slice(0, 64)) !== 32n) throw Error(errors.refreshing);
  const count = Number(BigInt('0x' + data.slice(64, 128)));
  if (!Number.isSafeInteger(count) || count < 1 || count > 1024 || data.length !== 128 + count * 64) throw Error(errors.refreshing);
  const owners = Array.from({length: count}, (_, i) => data.slice(128 + i * 64, 192 + i * 64));
  if (owners.some(word => !/^0{24}[0-9a-f]{40}$/i.test(word))) throw Error(errors.refreshing);
  return owners.some(word => '0x' + word.slice(24).toLowerCase() === address.toLowerCase());
}
export async function changeBuilderFee({address, action, provider, isCurrent = () => true, fetchImpl = (...args) => globalThis.fetch(...args)}) {
  async function guard() {
    if (!isCurrent()) throw Error('Wallet changed. Review again.');
    const accounts = await provider.request({method: 'eth_accounts'});
    if (!isCurrent() || accounts?.[0]?.toLowerCase() !== address.toLowerCase()) throw Error('Wallet changed. Review again.');
  }
  await guard();
  const challenge = await api('/api/perps/builder/challenge?address=' + encodeURIComponent(address) + '&action=' + action, {}, fetchImpl);
  const lines = typeof challenge.message === 'string' ? challenge.message.split('\n') : [];
  if (!/^[0-9a-f]{32}$/.test(challenge.nonce) || lines.length !== 6 || lines[0] !== 'QHooks perps builder fee' || lines[1] !== 'Action: Turn ' + action || lines[2].toLowerCase() !== 'address: ' + address.toLowerCase() || lines[3] !== 'Fee: 0.05% per fill' || lines[4] !== 'Nonce: ' + challenge.nonce || !lines[5].startsWith('Issued: ')) throw Error(errors.refreshing);
  await guard();
  const message = '0x' + Array.from(new TextEncoder().encode(challenge.message), x => x.toString(16).padStart(2, '0')).join('');
  const signature = await provider.request({method: 'personal_sign', params: [message, address]});
  await guard();
  const result = await api('/api/perps/builder', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({address, nonce: challenge.nonce, signature})}, fetchImpl);
  if (!result.ok || (action === 'on' ? result.builder?.toLowerCase() !== address.toLowerCase() : result.builder !== null)) throw Error(errors.refreshing);
  return result;
}
