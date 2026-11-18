// One bounded recovery sequence for reads. Mutations are never replayed.
export const READ_BACKOFF = Object.freeze([600, 1500]);
const RETRYING = Symbol('qhooks-read-retry');
const aborted = signal => signal?.reason || new DOMException('Read cancelled.', 'AbortError');
export function readBackoff(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(aborted(signal)); return; }
    const done = () => { signal?.removeEventListener('abort', cancel); resolve(); };
    const timer = setTimeout(done, ms);
    const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(aborted(signal)); };
    signal?.addEventListener('abort', cancel, {once:true});
  });
}
export function createReadFetch(fetcher=(...args)=>globalThis.fetch(...args), {sleep=readBackoff}={}) {
  if (fetcher[RETRYING]) return fetcher;
  const read = async (input, init={}) => {
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (!['GET','HEAD'].includes(method)) return fetcher(input, init);
    const signal = init.signal || input?.signal;
    for (let attempt=0;;attempt++) {
      if (signal?.aborted) throw aborted(signal);
      let response;
      try { response = await fetcher(input, init); }
      catch (e) {
        if (signal?.aborted || e.name === 'AbortError' || attempt === READ_BACKOFF.length) throw e;
      }
      if (response && (response.status !== 429 && response.status < 500 || attempt === READ_BACKOFF.length)) return response;
      // Discard the failed read before the delay; do not hold an HTTP stream.
      void response?.body?.cancel().catch(()=>{});
      await sleep(READ_BACKOFF[attempt], signal);
    }
  };
  read[RETRYING] = true;
  return read;
}
export const fetchRead = createReadFetch();
