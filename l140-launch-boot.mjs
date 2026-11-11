// Public launch boot boundary only. Resolve or reject the URL chain before the
// page can discover a provider or load any launch, wallet or crypto runtime.
import {visibleChains, LIVE} from './chains.mjs';
import {networkProfiles} from './full-launch/packages/multichain/profiles.mjs';
// Launchable chains come from the registry: live ones, plus hidden/testnet ones (Arc until a launch there is
// proven, Elysium Testnet) only when the hidden-chain flag is on (?chains=all).
const launchRows = () => visibleChains().filter(c => c.lab || c.simpleLaunch || c.simpleLaunchNext?.address || c.simpleLaunchClean?.address || c.status === 'testnet' && networkProfiles.some(p => p.id === c.id));
const chainIds = Object.freeze(launchRows().map(c => c.id));

// Hidden chains are not in the static HTML: add their network option and Studio chain button at boot.
function addHiddenChains(d, select) {
  const live = new Set(LIVE.map(c => c.id));
  const row = d.querySelector('.qtd-chain-row'), model = row?.querySelector('[data-qtd-chain]');
  for (const c of launchRows()) {
    if (live.has(c.id) || [...select.options].some(o => o.value === c.id)) continue;
    const o = d.createElement('option'); o.value = c.id; o.textContent = `${c.name} · ${c.native} gas`; select.append(o);
    if (model && !row.querySelector(`[data-qtd-chain="${c.id}"]`)) {
      const b = model.cloneNode(true); b.dataset.qtdChain = c.id; b.setAttribute('aria-pressed', 'false');
      const img = b.querySelector('img'); if (img) img.src = `/chain-symbol-icons/${c.icon}.svg`;
      const label = b.querySelector('span'); if (label) label.textContent = c.status === 'testnet' ? c.name : c.short;
      row.append(b);
    }
  }
}

export function initializeLaunchChainEntry({document: d = document, location = window.location} = {}) {
  const select = d.getElementById('ql-chain');
  const provider = d.getElementById('ql-provider');
  const connect = d.getElementById('ql-connect');
  const status = d.getElementById('ql-connection');
  if (!select || !provider || !connect || !status) throw new TypeError('Launch chain controls unavailable');
  addHiddenChains(d, select);
  let values;
  try { values = new URLSearchParams(location?.search || '').getAll('chain'); }
  catch { values = ['']; }
  if (values.length === 0) return Object.freeze({status: 'default', chainId: select.value});
  const chainId = values[0];
  const valid = values.length === 1 && chainIds.includes(chainId)
    && [...select.options].some(option => option.value === chainId);
  if (valid) {
    select.value = chainId;
    return Object.freeze({status: 'selected', chainId});
  }
  select.disabled = true;
  provider.disabled = true;
  connect.disabled = true;
  select.setAttribute('aria-invalid', 'true');
  status.textContent = 'This launch link has an invalid or repeated chain. Choose a fresh network link before connecting.';
  return Object.freeze({status: 'blocked', chainId: null});
}

export function bindLaunchBoot({document: d = document, location = window.location, bindPage} = {}) {
  if (typeof bindPage !== 'function') throw new TypeError('Launch page binder required');
  const entry = initializeLaunchChainEntry({document: d, location});
  if (entry.status === 'blocked') return Object.freeze({entry, page: null});
  return Object.freeze({entry, page: bindPage()});
}

export const launchChainIds = chainIds;
