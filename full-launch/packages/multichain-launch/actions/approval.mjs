// L72 fee-aware six-chain adaptation of pinned Q50. NEW ACCEPTANCE REQUIRED.
import { reviewGraduationAction } from './review.mjs';
import { graduationWalletDigest, verifyGraduationWalletApproval } from '../../../prototypes/pq-graduation/client/graduation-wallet-proof.mjs';

export function createGraduationApprover({
  provider,
  session,
  signer,
  clock = () => Math.floor(Date.now() / 1000)
}) {
  if (!provider || !session || !signer || typeof provider.request !== 'function' ||
      typeof session.refresh !== 'function' ||
      typeof signer.signAction !== 'function' ||
      typeof signer.lock !== 'function' ||
      typeof clock !== 'function') {
    throw new Error('Invalid dependencies');
  }

  let busy = false;
  let dead = false;
  let revision = 0;

  function invalidate() {
    revision += 1;
    signer.lock();
  }

  function dispose() {
    if (!dead) { dead = true; invalidate(); }
  }

  async function approve(input, request) {
    if (busy) throw new Error('Busy');
    if (dead) throw new Error('Dead');
    busy = true;
    try {
      const { action, operation, typed } = reviewGraduationAction(input, request);
      Object.freeze(action);
      Object.freeze(operation);
      Object.freeze(typed);

      const capturedRevision = revision;
      const current = session.current;
      const publicKeyHex = signer.publicKeyHex;
      const keyId = signer.keyId;

      const live = () => {
        if (revision !== capturedRevision) throw new Error('Revision changed');
        if (dead || !current || current !== session.current) throw new Error('Stale connection');
        if (!signer.backupVerified) throw new Error('Backup not verified');
        if (signer.locked) throw new Error('Locked');
        const now = clock();
        if (!Number.isSafeInteger(now) || now < 0) {
          throw new Error('Invalid clock');
        }
        if (current.owner !== action.owner || current.chainId !== action.chainId.toString()) {
          throw new Error('Chain mismatch');
        }
        if (action.publicKey !== publicKeyHex || signer.publicKeyHex !== publicKeyHex) throw new Error('Public key mismatch');
        if (keyId !== signer.keyId) throw new Error('Key ID mismatch');
        if (BigInt(now) < action.validAfter || BigInt(now) >= action.validUntil) {
          throw new Error('Invalid time');
        }
      };

      live();
      await session.refresh(current);
      live();

      const pq = signer.signAction(action, operation.review);
      live();
      if (pq.publicKeyHex !== publicKeyHex || pq.keyId !== keyId) {
        throw new Error('Signature identity mismatch');
      }

      const wallet = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [action.owner, JSON.stringify(typed)]
      });
      await session.refresh(current);
      live();
      const normalizedWallet = verifyGraduationWalletApproval(action, wallet);
      live();

      return Object.freeze({
        action,
        request: operation.review,
        walletDigestHex: graduationWalletDigest(action),
        walletSignatureHex: normalizedWallet,
        pqSignatureHex: pq.signatureHex,
        publicKeyHex,
        keyId
      });
    } finally {
      busy = false;
    }
  }

  return Object.freeze({ approve, invalidate, dispose });
}
