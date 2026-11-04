export const UINT256_MAX = (2n ** 256n) - 1n;
export const UNSIGNED_DRAFT_VERSION = "qhooks-local-unsigned-mock-draft-v1";

export const workflows = Object.freeze([
  { id: "personal-transfer", name: "Personal transfer", note: "Sample workflow — not a built contract.", values: { chainId: "1", vault: "0x1111111111111111111111111111111111111111", recipient: "0x2222222222222222222222222222222222222222", amountWei: "1000000000000000001", nonce: "7", deadline: "1893456000", epoch: "2", policyHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
  { id: "creator-payout", name: "Creator payout", note: "Sample workflow — not a built contract.", values: { chainId: "1", vault: "0x3333333333333333333333333333333333333333", recipient: "0x4444444444444444444444444444444444444444", amountWei: "2500000000000000000", nonce: "8", deadline: "1893456000", epoch: "2", policyHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } },
  { id: "treasury-invoice", name: "Treasury invoice", note: "Sample workflow — not a built contract.", values: { chainId: "1", vault: "0x5555555555555555555555555555555555555555", recipient: "0x6666666666666666666666666666666666666666", amountWei: "900719925474099312345", nonce: "9", deadline: "1893456000", epoch: "3", policyHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" } }
]);

function isCanonicalUint(value, { positive = false } = {}) {
  if (typeof value !== "string" || value.length > 78 || !/^(0|[1-9]\d*)$/.test(value)) return false;
  const integer = BigInt(value);
  return integer <= UINT256_MAX && (!positive || integer > 0n);
}

function validAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

export function validateDraftInput(values, { nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const errors = {};
  for (const field of ["chainId", "nonce", "deadline", "epoch"]) {
    if (!isCanonicalUint(values[field])) errors[field] = "Use a canonical nonnegative decimal uint256 integer.";
  }
  if (!isCanonicalUint(values.amountWei, { positive: true })) errors.amountWei = "Amount in wei must be a positive canonical uint256 integer.";
  if (!isCanonicalUint(values.chainId, { positive: true })) errors.chainId = "Chain ID must be a positive canonical uint256 integer.";
  if (isCanonicalUint(values.deadline) && BigInt(values.deadline) <= BigInt(nowSeconds)) errors.deadline = "Deadline must be a future Unix-second value.";
  if (!validAddress(values.vault)) errors.vault = "Vault must be a nonzero synthetic 0x address.";
  if (!validAddress(values.recipient)) errors.recipient = "Recipient must be a nonzero synthetic 0x address.";
  if (typeof values.policyHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(values.policyHash) || /^0x0{64}$/i.test(values.policyHash)) errors.policyHash = "Policy hash must be a nonzero 32-byte 0x-prefixed hex value.";
  return { valid: Object.keys(errors).length === 0, errors };
}

export function prepareUnsignedDraft(values, { nowSeconds, handle, revision } = {}) {
  const validation = validateDraftInput(values, { nowSeconds });
  if (!validation.valid) return { ok: false, ...validation };
  return { ok: true, draft: Object.freeze({
    version: UNSIGNED_DRAFT_VERSION,
    handle, revision,
    chainId: values.chainId, vault: values.vault, recipient: values.recipient,
    amountWei: values.amountWei, nonce: values.nonce, deadline: values.deadline,
    epoch: values.epoch, policyHash: values.policyHash,
    notice: "Illustrative unsigned JSON only — not a canonical production codec, digest, signature, EIP-712 request, or calldata."
  }) };
}

export function createWorkbenchState(values = {}) {
  return Object.freeze({ revision: 0, nextHandle: 0, values: Object.freeze({ ...values }), draft: null, walletApproval: false, pqApproval: false });
}

export function editDraftField(state, field, value) {
  return Object.freeze({ ...state, revision: state.revision + 1, values: Object.freeze({ ...state.values, [field]: value }), draft: null, walletApproval: false, pqApproval: false });
}

export function selectWorkflow(state, values) {
  return Object.freeze({ ...state, revision: state.revision + 1, values: Object.freeze({ ...values }), draft: null, walletApproval: false, pqApproval: false });
}

export function prepareWorkbenchState(state, { nowSeconds } = {}) {
  const result = prepareUnsignedDraft(state.values, { nowSeconds, handle: `local-draft-${state.nextHandle}`, revision: state.revision });
  if (!result.ok) return { state, result };
  return { state: Object.freeze({ ...state, nextHandle: state.nextHandle + 1, draft: result.draft, walletApproval: false, pqApproval: false }), result };
}

export function markMockApproval(state, kind, approved, expectedHandle) {
  if (!state.draft || state.draft.handle !== expectedHandle || !["walletApproval", "pqApproval"].includes(kind)) return state;
  return Object.freeze({ ...state, [kind]: Boolean(approved) });
}

export function evaluateMockApprovals({ draft, activeHandle, activeRevision, walletApproval = false, pqApproval = false, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  if (!draft || draft.handle !== activeHandle || draft.revision !== activeRevision) return { outcome: "stale", reason: "This draft is stale or replayed. Prepare the current fields before marking mock approvals." };
  if (BigInt(draft.deadline) <= BigInt(nowSeconds)) return { outcome: "expired", reason: "This illustrative draft has expired. Prepare a new future-dated draft." };
  if (!walletApproval && !pqApproval) return { outcome: "missing", reason: "Mock wallet and mock PQ approvals are both missing." };
  if (walletApproval && !pqApproval) return { outcome: "wallet-only", reason: "Mock wallet approval is present; mock PQ approval is still required." };
  if (!walletApproval && pqApproval) return { outcome: "pq-only", reason: "Mock PQ approval is present; mock wallet approval is still required." };
  return { outcome: "both", reason: "Both mock approvals match this unsigned draft. No signature or transaction is created." };
}
