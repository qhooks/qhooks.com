import {normalizeConfig} from './qx-perps-core.mjs';

// Signed actions use the current server setting; a failed read is not an off switch.
export async function loadLivePerpsConfig(fetchImpl = (...args) => globalThis.fetch(...args)) {
  try {
    const response = await fetchImpl('/api/perps/config', {cache: 'no-store', signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw Error();
    return normalizeConfig(await response.json());
  } catch {
    throw Error('Perps fee settings are refreshing. No order was sent. Try again.');
  }
}

export async function loadPerpsConfig(fetchImpl = (...args) => globalThis.fetch(...args)) {
  for (const path of ['/api/perps/config', '/perps-config.json']) {
    try {
      const response = await fetchImpl(path, {cache: 'no-store', signal: AbortSignal.timeout(8000)});
      if (!response.ok) continue;
      return normalizeConfig(await response.json());
    } catch {}
  }
  return {builder: null, builderFeeTenthsBp: 100};
}
