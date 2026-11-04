// Public launch boot boundary only. Resolve or reject the URL chain before the
// page can discover a provider or load any launch, wallet or crypto runtime.
const chainIds = Object.freeze(['8453', '4663', '1', '42161', '56']); // Arc (5042) is hidden until a launch there is proven

export function initializeLaunchChainEntry({document: d = document, location = window.location} = {}) {
  const select = d.getElementById('ql-chain');
  const provider = d.getElementById('ql-provider');
  const connect = d.getElementById('ql-connect');
  const status = d.getElementById('ql-connection');
  if (!select || !provider || !connect || !status) throw new TypeError('Launch chain controls unavailable');
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
