// Static provider affinity, NOT an identity observation or authorization.
// The private registry is issued only by the real wallet-session factory.
// Callers must still refresh and validate connection/revision around actions.
import {createWalletSession} from '../../prototypes/qwallet/client/wallet-session.mjs';
const bindings = new WeakMap();
const methods = ['request','on','removeListener'];
export function createBoundWalletSession(provider, onInvalidate = () => {}) {
  const original = createWalletSession(provider, onInvalidate);
  const descriptors = Object.getOwnPropertyDescriptors(original);
  let bound;
  descriptors.dispose = {...descriptors.dispose, value: () => {
    bindings.delete(bound); original.dispose();
  }};
  bound = Object.freeze(Object.defineProperties({}, descriptors));
  bindings.set(bound, Object.freeze({provider, methods: Object.freeze(methods.map(k => provider[k]))}));
  return bound;
}
export function requireBoundWalletSession(session, provider) {
  const binding = session && bindings.get(session);
  if (!binding || binding.provider !== provider || methods.some((k,i) => provider[k] !== binding.methods[i])) {
    throw new TypeError('Wallet session and provider binding differ');
  }
  return session;
}
