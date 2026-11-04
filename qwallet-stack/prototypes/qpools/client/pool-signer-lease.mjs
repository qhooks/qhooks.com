export function leasePoolSigner(master) {
  if (typeof master !== 'object' || master === null || typeof master.publicKeyHex!=='string' || typeof master.keyId!=='string' || typeof master.signAction!=='function' || typeof master.lock!=='function') throw new TypeError('Invalid signer master');
  const publicKeyHex = master.publicKeyHex;
  const keyId = master.keyId;
  let revoked = false;
  const locked = () => revoked || master.locked;
  const backupVerified = () => !revoked && !master.locked && master.backupVerified;
  function lock() { revoked = true; }
  function signAction(action) {
    if (revoked || master.locked || !master.backupVerified) throw new TypeError('Signer lease revoked');
    if (publicKeyHex !== master.publicKeyHex || keyId !== master.keyId) throw new TypeError('Signer identity changed');
    const result = master.signAction(action);
    if (revoked || master.locked || !master.backupVerified) throw new TypeError('Signer lease revoked');
    if (publicKeyHex !== master.publicKeyHex || keyId !== master.keyId) throw new TypeError('Signer identity changed');
    return result;
  }
  return Object.freeze({publicKeyHex,keyId,get locked(){return locked();},get backupVerified(){return backupVerified();},lock,signAction});
}
