// Campaign labels only. Economic referrer addresses are never replaced.
export const AGENT_SOURCES = Object.freeze([
  "registry",
  "nomad",
  "autonomo",
  "cursor-directory",
  "claude-plugin",
  "glama",
  "mcpmarket",
  "mcpso",
  "a2a",
  "x402",
  "moltbook",
  "badge",
  "x-post",
  "skill",
  "agents",
  "home",
  "hooks",
  "base-wallet",
  "agentkit",
  "goat",
  "eliza",
  "unattributed",
  "other",
]);
export function agentSource(value) {
  if (typeof value !== "string") return null;
  // Campaign names are public labels, never economic referrer wallets. Bound
  // arbitrary partners below; the writer caps dynamic labels per UTC day.
  if (value.length > 32) return null;
  value = value.toLowerCase();
  return AGENT_SOURCES.includes(value) ||
    /^dm-[a-z0-9_]{1,15}$/.test(value) ||
    /^guide-[1-9][0-9]{0,2}$/.test(value) ||
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(value)
    ? value
    : null;
}
export function requestAgentSource(request) {
  const u = new URL(request.url),
    read = (k) =>
      u.searchParams.getAll(k).length === 1
        ? agentSource(u.searchParams.get(k))
        : null;
  return (
    read("source_ref") ||
    read("ref") ||
    agentSource(request.headers.get("x-qhooks-source")) ||
    agentSource(
      /(?:^|;\s*)qhooks_agent_ref=([^;]*)/.exec(
        request.headers.get("cookie") || "",
      )?.[1],
    )
  );
}
export function tagAgentUrl(value, source, { replaceCampaign = false } = {}) {
  source = agentSource(source);
  if (!source || typeof value !== "string") return value;
  let u;
  try {
    u = new URL(value, "https://qhooks.com");
  } catch {
    return value;
  }
  if (
    u.origin !== "https://qhooks.com" ||
    u.username ||
    u.password ||
    /^(?:#|mailto:|javascript:)/i.test(value)
  )
    return value;
  // Asset URLs and exact signed/payment/submission resources are not campaigns.
  if (
    /^\/api\//.test(u.pathname) &&
    !/^\/api\/v1\/agent\//.test(u.pathname) &&
    !["/api/x402/discovery/resources"].includes(u.pathname)
  )
    return value;
  if (/\.(?:mjs|js|css|svg|png|webp|woff2|tgz)$/.test(u.pathname)) return value;
  const refs = u.searchParams.getAll("ref");
  // A template link such as ?ref=<partner> arrives with an empty ref: leave it as written.
  if (refs.length && refs.every((r) => !r)) return value;
  if (!refs.length) u.searchParams.set("ref", source);
  else if (refs.length === 1 && agentSource(refs[0])) {
    if (replaceCampaign) u.searchParams.set("ref", source);
  } else if (!u.searchParams.has("source_ref"))
    u.searchParams.set("source_ref", source);
  return u.href;
}
export function tagAgentConnections(text, source) {
  return text.replace(
    /https:\/\/qhooks\.com\/(?:mcp|a2a)(?:\?ref=[a-z0-9_-]+)?(?=[\s"'`*):>\]]|$)/g,
    (url) => tagAgentUrl(url, source, { replaceCampaign: true }),
  );
}
export function tagAgentMarkdown(text, source) {
  // Historical output/capture code blocks stay byte-for-byte as supplied.
  return text
    .split(/(```[^\n]*\n[\s\S]*?```)/g)
    .map((part) => {
      if (part.startsWith("```"))
        return /^```(?:sh|bash)\n/.test(part) ||
          /^```json\n[\s\S]*?"mcpServers"/.test(part)
          ? tagAgentConnections(part, source)
          : part;
      return tagAgentConnections(part, source)
        .replace(/https:\/\/qhooks\.com(?:\/[^\s<>"'`*\])]+)?/g, (match) => {
          const punctuation = /[.,;:!?]+$/.exec(match)?.[0] || "",
            url = punctuation ? match.slice(0, -punctuation.length) : match;
          return (
            tagAgentUrl(url, source, { replaceCampaign: true }) + punctuation
          );
        })
        .replace(
          /(\]\()([^\s)]+)(\))/g,
          (_m, a, url, b) =>
            a + tagAgentUrl(url, source, { replaceCampaign: true }) + b,
        );
    })
    .join("");
}
export function agentBadge(wallet) {
  if (
    typeof wallet !== "string" ||
    !/^0x[0-9a-f]{40}$/i.test(wallet) ||
    BigInt(wallet) === 0n
  )
    throw TypeError("Invalid public agent wallet.");
  const url = tagAgentUrl(
      "https://qhooks.com/agents/" + wallet.toLowerCase(),
      "badge",
    ),
    image = "https://qhooks.com/agents/powered-by-qhooks.svg";
  return {
    url,
    image,
    markdown: `[![Powered by QHooks](${image})](${url})`,
    html: `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${image}" width="196" height="36" alt="Powered by QHooks"></a>`,
  };
}
