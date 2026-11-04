// A launch owns ONE exact provider for session probes and guarded RPCs. Site
// permission is already established by the wallet hub; connecting this session
// must only read accounts, including on an automatic restore.
import {createBoundWalletSession} from './l129-bound-session.mjs';

export function createRememberedLaunchConnection(source, onInvalidate = () => {}) {
  const names = ['request', 'on', 'removeListener'];
  if (!source || names.some(k => typeof source[k] !== 'function')) throw new TypeError('Wallet provider required');
  const methods = names.map(k => source[k]);
  const current = () => {
    if (names.some((k, i) => source[k] !== methods[i])) throw new TypeError('Wallet provider methods changed');
  };
  const provider = Object.freeze({
    request(args) {
      current();
      if (!args || typeof args.method !== 'string') throw new TypeError('Wallet request required');
      // This is deliberately not a permission-requesting connect. Other calls
      // still require the workspace's exact transaction/signature gates.
      const request = args.method === 'eth_requestAccounts' ? {method:'eth_accounts', params:[]} : args;
      return methods[0].call(source, request);
    },
    on(event, listener) { current(); return methods[1].call(source, event, listener); },
    removeListener(event, listener) { return methods[2].call(source, event, listener); },
  });
  return Object.freeze({provider, session:createBoundWalletSession(provider, onInvalidate)});
}
