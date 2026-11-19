// Pure selection of an optional hook-charge referral. No addresses are enabled
// here: the caller supplies current registry approval and its enabled slug set.
const ZERO = '0x' + '0'.repeat(40);
const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null;
const slug = value => typeof value === 'string' && value.length <= 32 && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(value.toLowerCase()) ? value.toLowerCase() : null;
const hash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0{64}$/i.test(value) ? value.toLowerCase() : null;
function uint(value, positive = false) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  if (!['number', 'string', 'bigint'].includes(typeof value) || !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(String(value))) return null;
  try { const n = BigInt(value); return n >= (positive ? 1n : 0n) && n < (1n << 256n) ? n.toString() : null; } catch { return null; }
}
function verifiedSupport(support) {
  const contract = address(support.contract), pool = hash(support.pool);
  const chainId = uint(support.pin?.chainId, true), blockNumber = uint(support.pin?.blockNumber), blockHash = hash(support.pin?.blockHash);
  const evidence = support.evidence;
  if (!contract || contract === ZERO || !pool || !chainId || blockNumber === null || !blockHash ||
      evidence?.source !== 'native' || evidence.codeVerified !== true || evidence.configVerified !== true ||
      typeof support.referralsEnabled !== 'boolean' || !Number.isInteger(support.shareBps) || support.shareBps < 0 || support.shareBps > 10000 ||
      (support.referralsEnabled && support.shareBps === 0)) return null;
  if (support.protocolAddresses !== undefined && (!Array.isArray(support.protocolAddresses) || support.protocolAddresses.length > 32 || support.protocolAddresses.some(v => !address(v)))) return null;
  if (support.txOrigin !== undefined && (!address(support.txOrigin) || address(support.txOrigin) === ZERO)) return null;
  if (support.sender !== undefined && (!address(support.sender) || address(support.sender) === ZERO)) return null;
  return {contract, pool, pin: {chainId, blockNumber, blockHash}, shareBps: support.shareBps};
}

/**
 * Select proposed 32-byte hookData; never mutate or replace existing plan bytes.
 * support is a trusted reader's pinned native code/config receipt, not address
 * permission flags. A capability acquisition failure must use state unavailable.
 */
export function selectHookReferral({partner, enabledPartnerSlugs, trader, routerBinding, explicitReferrer, existingHookReferral, support} = {}) {
  const base = {state: 'skipped', blocking: false, hookData: '0x', reason: null,
    appliedHookReferrer: null, shareBps: null, basis: 'hook-charge', contract: null, pool: null, pin: null,
    scope: 'prepared-hook-data', allocationFinal: false, preserveExistingHookData: true};
  const result = (reason, extra = {}) => ({...base, reason, ...extra});
  const unavailable = reason => result(reason, {state: 'unavailable', blocking: true});
  const partnerSlug = slug(partner?.slug);
  const enabled = enabledPartnerSlugs instanceof Set ? [...enabledPartnerSlugs] : enabledPartnerSlugs;
  if (!partnerSlug || !Array.isArray(enabled) || !enabled.some(v => slug(v) === partnerSlug)) return result('partner_not_enabled');
  const recipient = address(partner.wallet);
  if (!recipient || recipient === ZERO || !Number.isSafeInteger(partner.revision) || partner.revision < 1) return unavailable('partner_unavailable');
  trader = address(trader); routerBinding = address(routerBinding);
  if (!trader || trader === ZERO || !routerBinding) return unavailable('referral_context_unavailable');
  if (recipient === trader) return result('self_referral');
  if (explicitReferrer !== undefined) {
    const explicit = address(explicitReferrer);
    if (!explicit) return unavailable('explicit_referrer_invalid');
    if (explicit === ZERO) return result('explicit_opt_out');
    if (explicit !== recipient) return result('explicit_referrer_preserved');
  }
  if (routerBinding !== ZERO && routerBinding !== recipient) return result('router_binding_preserved');
  if (existingHookReferral !== undefined) {
    const existing = address(existingHookReferral);
    if (!existing) return unavailable('existing_hook_referral_unavailable');
    if (existing !== ZERO && existing !== recipient) return result('existing_hook_referral_preserved');
  }
  if (!support || support.state === 'unsupported') return result('unsupported_hook');
  if (support.state === 'unavailable') return unavailable('hook_support_unavailable');
  if (support.state !== 'verified') return unavailable('hook_support_unavailable');
  const receipt = verifiedSupport(support);
  if (!receipt) return unavailable('native_evidence_incomplete');
  const metadata = {...receipt};
  if (!support.referralsEnabled || receipt.shareBps === 0) return result('hook_referrals_disabled', metadata);
  const origin = address(support.txOrigin) || trader;
  if (recipient === origin) return result('origin_self_referral', metadata);
  if (recipient === receipt.contract || (support.protocolAddresses || []).some(v => address(v) === recipient)) return result('protocol_self_referral', metadata);
  if (address(support.sender) === receipt.contract) return result('hook_internal_swap', metadata);
  return result(existingHookReferral && address(existingHookReferral) === recipient ? 'existing_same_referrer' : 'partner_selected',
    {...metadata, state: 'applied', hookData: '0x' + recipient.slice(2).padStart(64, '0'), appliedHookReferrer: recipient});
}
