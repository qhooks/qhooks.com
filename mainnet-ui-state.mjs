export function deploymentControls({
  connected = false,
  busy = false,
  status = 'idle',
  hasQuote = false,
  consent = false,
  saveFailed = false,
  hasProvider = false,
  complete = false
} = {}) {
  if (typeof connected !== 'boolean' || typeof busy !== 'boolean' ||
      typeof hasQuote !== 'boolean' || typeof consent !== 'boolean' ||
      typeof saveFailed !== 'boolean' || typeof hasProvider !== 'boolean' ||
      typeof complete !== 'boolean' || typeof status !== 'string') {
    throw new TypeError('All inputs except status must be boolean; status must be string.');
  }

  return Object.freeze({
    connect: hasProvider && !connected && !busy,
    disconnect: connected && !busy,
    review: connected && !busy && !saveFailed && !complete &&
            (status === 'idle' || status === 'rejected' || status === 'confirmed'),
    check: connected && !busy,
    consent: connected && !busy && hasQuote && !saveFailed,
    send: connected && !busy && hasQuote && consent && !saveFailed,
    save: connected && !busy && saveFailed,
    download: connected,
    recover: connected && !busy && status === 'recover-transaction-hash'
  });
}
