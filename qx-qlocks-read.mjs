// Bound display reads only. Wallet signatures and transactions never use this deadline.
export function lockRead(task, {ms = 8000} = {}) {
  let timer;
  return Promise.race([Promise.resolve().then(task), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Locks are refreshing. Try again.')), ms); })]).finally(() => clearTimeout(timer));
}
export async function fillLockSection({read, show, failed, current = () => true, ms = 8000}) {
  try { const value = await lockRead(read, {ms}); if (current()) show(value); }
  catch (error) { if (current()) failed(error); }
}
