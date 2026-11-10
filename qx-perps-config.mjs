import {normalizeConfig} from './qx-perps-core.mjs';

export async function loadPerpsConfig(fetchImpl = (...args) => globalThis.fetch(...args)) {
  for (const path of ['/api/perps/config', '/perps-config.json']) {
    try {
      const response = await fetchImpl(path, {cache: 'no-store', signal: AbortSignal.timeout(8000)});
      if (!response.ok) continue;
      return normalizeConfig(await response.json());
    } catch {}
  }
  return {builder: null, builderFeeTenthsBp: 50};
}
