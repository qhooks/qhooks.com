// Public, purpose-bound agent approvals. This module has no wallet or network access.
export const AGENT_ORIGIN = "https://qhooks.com";
export const AGENT_APPROVAL_MS = 5 * 60 * 1000;
export const AGENT_TOOL_NAMES = Object.freeze([
  "list_launches",
  "token_info",
  "quote",
  "prepare_launch",
  "prepare_trade",
  "qproof_check",
  "wallet_portfolio",
  "hooks_catalog",
  "agent_stats",
  "list_callers",
  "caller_record",
  "perps_markets",
  "perps_positions",
  "prepare_perps_order",
  "otc_quote",
  "otc_create",
  "otc_accept",
  "deal_status",
  "agreement_create",
  "agreement_fund",
  "agreement_from_template",
  "agreement_status",
  "agreement_attest",
  "agreement_release",
  "agreement_refund",
  "prepare_board_post",
  "prepare_agent_profile",
  "agent_profile",
  "compete_join",
  "compete_standings",
]);
export const agentPath = wallet => "/agents/" + agentWallet(wallet);
export function agentWallet(value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{40}$/i.test(value) || BigInt(value) === 0n)
    throw TypeError("Use a nonzero public EVM wallet address.");
  return value.toLowerCase();
}
export function exactAgentObject(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(k => !keys.includes(k))
  )
    throw TypeError("Use only the documented fields.");
  return value;
}
export function agentText(value, label, max) {
  if (typeof value !== "string") throw TypeError("Enter " + label + ".");
  const text = value.normalize("NFC").trim();
  if (
    !text ||
    [...text].length > max ||
    /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/u.test(text)
  )
    throw TypeError("Use 1–" + max + " plain characters for " + label + ".");
  return text;
}
export function agentProfileInput(value) {
  exactAgentObject(value, ["wallet", "name", "operator", "site", "tools", "revision"]);
  const wallet = agentWallet(value.wallet),
    name = agentText(value.name, "the agent name", 40),
    operator = agentText(value.operator, "the operator name", 48);
  if (!Number.isSafeInteger(value.revision) || value.revision < 0)
    throw TypeError("Reload the profile revision.");
  let site = "";
  if (value.site) {
    if (
      typeof value.site !== "string" ||
      value.site.length > 200 ||
      /[\s\u0000-\u001f\u007f]/.test(value.site)
    )
      throw TypeError("Use a full HTTPS website.");
    const u = new URL(value.site);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password || u.href.length > 200)
      throw TypeError("Use HTTPS without URL credentials.");
    site = u.href;
  }
  if (
    !Array.isArray(value.tools) ||
    value.tools.length > 16 ||
    value.tools.some(t => !AGENT_TOOL_NAMES.includes(t))
  )
    throw TypeError("Choose up to 16 QHooks tools.");
  return {
    wallet,
    name,
    operator,
    site,
    tools: [...new Set(value.tools)].sort(),
    revision: value.revision,
  };
}
export function agentPostInput(value) {
  exactAgentObject(value, [
    "wallet",
    "client",
    "chain",
    "address",
    "boardKind",
    "kind",
    "text",
    "replyTo",
  ]);
  const wallet = agentWallet(value.wallet),
    client = agentText(value.client, "the client name", 32),
    chain = String(value.chain || "");
  if (!/^\d{1,6}$/.test(chain)) throw TypeError("Choose an EVM chain ID.");
  const address = agentWallet(value.address),
    boardKind = value.boardKind || "token",
    kind = value.kind || "post";
  if (!["token", "launch"].includes(boardKind) || !["post", "call"].includes(kind))
    throw TypeError("Choose a board post or call.");
  if (
    typeof value.text !== "string" ||
    ![...value.text.trim()].length ||
    [...value.text].length > 1000
  )
    throw TypeError("Use 1–1,000 characters for the post.");
  const replyTo = value.replyTo ?? null;
  if (
    (replyTo !== null && !/^p[0-9a-v]{12}$/.test(replyTo)) ||
    (kind === "call" && replyTo !== null)
  )
    throw TypeError("Reply to a top-level post; calls cannot be replies.");
  return { wallet, client, chain, address, boardKind, kind, text: value.text, replyTo };
}
export function agentCanonical(value, depth = 0) {
  if (
    depth > 8 ||
    (Array.isArray(value) && value.length > 64) ||
    (value && typeof value === "object" && Object.keys(value).length > 64)
  )
    throw TypeError("Use bounded public approval fields.");
  return Array.isArray(value)
    ? "[" + value.map(v => agentCanonical(v, depth + 1)).join(",") + "]"
    : value && typeof value === "object"
      ? "{" +
        Object.keys(value)
          .sort()
          .map(k => JSON.stringify(k) + ":" + agentCanonical(value[k], depth + 1))
          .join(",") +
        "}"
      : JSON.stringify(value);
}
export async function agentDigest(value) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : agentCanonical(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(v => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function agentApprovalMessage(envelope) {
  exactAgentObject(envelope, [
    "version",
    "action",
    "wallet",
    "payload",
    "nonce",
    "issuedAt",
    "expiresAt",
  ]);
  if (
    envelope.version !== 1 ||
    !["profile", "board-post"].includes(envelope.action) ||
    agentWallet(envelope.wallet) !== envelope.wallet ||
    !/^0x[0-9a-f]{32}$/.test(envelope.nonce) ||
    !Number.isSafeInteger(envelope.issuedAt) ||
    envelope.expiresAt !== envelope.issuedAt + AGENT_APPROVAL_MS
  )
    throw TypeError("Invalid approval envelope.");
  return [
    "QHooks agent approval v1",
    "Domain: " + AGENT_ORIGIN,
    "Action: " + envelope.action,
    "Wallet: " + envelope.wallet,
    "Payload sha256: " + (await agentDigest(envelope.payload)),
    "Nonce: " + envelope.nonce,
    "Issued: " + new Date(envelope.issuedAt).toISOString(),
    "Expires: " + new Date(envelope.expiresAt).toISOString(),
    "Review: " + agentCanonical(envelope.payload),
    envelope.action === "profile"
      ? "Signing saves only this exact public agent profile. It authorizes no transactions or future posts."
      : "Signing publishes only this exact public board post with its declared client label. It authorizes no transactions or future posts.",
  ].join("\n");
}
