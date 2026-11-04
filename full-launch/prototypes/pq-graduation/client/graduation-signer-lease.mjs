export function leaseGraduationSigner(master) {
  if (typeof master !== 'object' || master === null) throw new TypeError('master must be a non-null object');
  const { publicKeyHex, keyId, signAction, lock } = master;
  if (typeof publicKeyHex !== 'string' || typeof keyId !== 'string' || typeof signAction !== 'function' || typeof lock !== 'function') {
    throw new TypeError('master must provide publicKeyHex, keyId strings and signAction, lock functions');
  }
  let revoked = false;
  function check() {
    if (revoked || master.locked || !master.backupVerified || master.publicKeyHex !== publicKeyHex || master.keyId !== keyId) {
      throw new Error('lease revoked or master locked or backup not verified or identity changed');
    }
  }
  return Object.freeze({
    publicKeyHex, keyId,
    get locked() { return revoked || master.locked; },
    get backupVerified() { return !revoked && !master.locked && master.backupVerified; },
    lock() { revoked = true; },
    signAction(action, request) {
      check();
      const result = master.signAction(action, request);
      check();
      return result;
    }
  });
}
