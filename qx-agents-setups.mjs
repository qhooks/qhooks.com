import {tagAgentUrl} from "./agent-source.mjs";
// Setup URLs checked against official client docs; source-only submissions are labelled separately.
// Submitted integrations are source for review, not upstream-installed plugins.
// Status comes from the recorded PR metadata; no runtime GitHub request is made.
export const SUBMITTED_INTEGRATIONS = [
  {
    "id": "oak",
    "name": "Oak",
    "mark": "O",
    "url": "https://github.com/OakAgentKit/oak/pull/24",
    "draft": false,
    "merged": false,
    "headSha": "bfa0100fd02c93c64b86afe6bfc9bb028b14a584",
    "source": "https://github.com/qhooks/oak/tree/bfa0100fd02c93c64b86afe6bfc9bb028b14a584",
    "summary": "Read and unsigned prepare adapter submitted upstream. Native wallet registration still needs Oak maintainer integration; this source does not enable native Oak trading."
  },
  {
    "id": "game",
    "name": "Virtuals GAME",
    "mark": "GM",
    "url": "https://github.com/game-by-virtuals/game-node/pull/160",
    "draft": true,
    "merged": false,
    "headSha": "f7a1766ead4944d71efdee0b5063ec7fd95a28a1",
    "source": "https://github.com/qhooks/game-node/tree/f7a1766ead4944d71efdee0b5063ec7fd95a28a1",
    "summary": "Read and unsigned prepare plugin submitted upstream. Review the tested QHooks source; upstream release and host setup remain pending."
  },
  {
    "id": "goat",
    "name": "GOAT",
    "mark": "G",
    "url": "https://github.com/goat-sdk/goat/pull/616",
    "draft": true,
    "merged": false,
    "headSha": "9ad536c67bc970743b103fa74a08da507ef776de",
    "source": "https://github.com/qhooks/goat/tree/9ad536c67bc970743b103fa74a08da507ef776de",
    "summary": "Read and unsigned prepare adapter submitted upstream. Review the tested QHooks source; it is not included in the upstream GOAT package."
  },
  {
    "id": "agentkit",
    "name": "AgentKit",
    "mark": "AK",
    "url": "https://github.com/coinbase/agentkit/pull/1651",
    "draft": true,
    "merged": false,
    "headSha": "75690c443de91a2e7f7631a1f1599978ba7270fc",
    "source": "https://github.com/qhooks/agentkit/tree/75690c443de91a2e7f7631a1f1599978ba7270fc",
    "summary": "Read and unsigned prepare provider submitted upstream. Review the tested QHooks source; it is not included in the upstream AgentKit package."
  },
  {
    "id": "base-wallet",
    "name": "Base Wallet MCP",
    "mark": "BW",
    "url": "https://github.com/coinbase/agents/pull/24",
    "draft": true,
    "merged": false,
    "headSha": "e91aecfc9b4c637fce620b474a7417fbe0fcdedf",
    "source": "https://github.com/qhooks/agents/tree/e91aecfc9b4c637fce620b474a7417fbe0fcdedf",
    "summary": "Read and unsigned EVM plan specification submitted upstream. Wallet MCP approval is required. Launch and perps plans are not executed by this adapter."
  }
];
function submittedSetup(id) {
  const pr = SUBMITTED_INTEGRATIONS.find(entry => entry.id === id);
  if (!pr) throw Error("Unknown submitted integration");
  return {
    id: pr.id, name: pr.name, mark: pr.mark,
    kind: pr.draft ? "Submitted · draft PR" : "Submitted · open PR",
    title: "Review the " + pr.name + " integration",
    instruction: pr.summary + " Plans are unsigned; the signing wallet may be an agent's own wallet or yours. No custody. We never hold keys.",
    snippet: pr.source, label: "QHooks source · tested head",
    action: "View QHooks source", url: pr.source, docs: pr.source,
    submission: {url: pr.url, draft: pr.draft, merged: false, headSha: pr.headSha}
  };
}

export const AGENT_SETUPS = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    mark: "Cl",
    kind: "Remote connector",
    title: "Connect Claude Desktop",
    instruction:
      "Open Customize → Connectors → Add custom connector. Name it QHooks, paste this URL and choose No sign in. Enable it in your conversation. Workspace policy may control custom connectors.",
    snippet: "https://qhooks.com/mcp",
    label: "Remote MCP URL",
    action: "Open Claude connectors",
    url: "https://claude.ai/customize/connectors",
    docs: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  },
  {
    id: "claude-web",
    name: "Claude Web",
    mark: "Cl",
    kind: "Remote connector",
    title: "Use QHooks in Claude on the web",
    instruction:
      "Add a custom remote connector in Customize → Connectors. Enter QHooks and the URL below, choose No sign in, then enable it in the conversation. No local bridge is required.",
    snippet: "https://qhooks.com/mcp",
    label: "Remote MCP URL",
    action: "Open Claude connectors",
    url: "https://claude.ai/customize/connectors",
    docs: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    mark: "CG",
    kind: "Custom MCP connector",
    title: "Connect ChatGPT",
    instruction:
      "In Plugins, choose + → Add custom MCP server. Name it QHooks, paste this public endpoint and select no authentication. Review its tools and create the plugin. Account and workspace policies apply.",
    snippet: "https://qhooks.com/mcp",
    label: "Public MCP URL",
    action: "Open ChatGPT plugins",
    url: "https://chatgpt.com/plugins",
    docs: "https://developers.openai.com/plugins/deploy/connect-chatgpt",
  },
  {
    id: "cursor",
    name: "Cursor",
    mark: "Cu",
    kind: "One-tap setup",
    title: "Add QHooks to Cursor",
    instruction:
      "Use Add to Cursor and review the connection in the editor. Or merge this into your project’s .cursor/mcp.json. No environment variables or credentials.",
    snippet:
      '{\n  "mcpServers": {\n    "qhooks": {\n      "url": "https://qhooks.com/mcp"\n    }\n  }\n}',
    label: ".cursor/mcp.json",
    action: "Add to Cursor",
    deeplink: true,
    docs: "https://cursor.com/docs/mcp/install-links",
  },
  {
    id: "codex",
    name: "Codex",
    mark: "Cx",
    kind: "CLI or TOML",
    title: "Give Codex the QHooks tools",
    instruction:
      "Run the CLI command, or add the TOML entry to your Codex config. The default is ~/.codex/config.toml; trusted projects may use .codex/config.toml.",
    snippet: '[mcp_servers.qhooks]\nurl = "https://qhooks.com/mcp"',
    label: "~/.codex/config.toml",
    docs: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
    command: "codex mcp add qhooks --url https://qhooks.com/mcp",
  },
  {
    id: "vscode",
    name: "VS Code",
    mark: "VS",
    kind: "HTTP MCP server",
    title: "Use QHooks with VS Code",
    instruction:
      "Merge this into .vscode/mcp.json, or use MCP: Add Server → HTTP and paste the endpoint. Review the server, then enable its tools in your agent conversation.",
    snippet:
      '{\n  "servers": {\n    "qhooks": {\n      "type": "http",\n      "url": "https://qhooks.com/mcp"\n    }\n  }\n}',
    label: ".vscode/mcp.json",
    docs: "https://code.visualstudio.com/docs/agents/reference/mcp-configuration",
  },
  {
    id: "eliza",
    name: "Eliza",
    mark: "E",
    kind: "Package under review",
    title: "ElizaOS setup update",
    instruction:
      "The hosted adapter is being updated. Installation instructions are withheld here until the reviewed replacement is released. Use a compatible MCP client or the public REST read/prepare API in the meantime.",
    snippet: "https://qhooks.com/mcp",
    label: "Public MCP endpoint",
    docs: "https://qhooks.com/api#agents",
    reviewOnly: true,
  },
  submittedSetup("goat"),
  submittedSetup("agentkit"),
  submittedSetup("oak"),
  submittedSetup("game"),
  submittedSetup("base-wallet"),
  {
    id: "rest",
    name: "REST / curl",
    mark: "/>",
    kind: "Any language",
    title: "One public request. No key.",
    instruction:
      "Read indexed launches with plain HTTP. Use POST for preparations and GET for public reads. Spot amounts use raw-unit strings; OTC and agreement amounts use human decimal strings. A prepared plan still needs the signing wallet’s signature (agent-owned or user-owned).",
    snippet:
      "curl --fail-with-body --get 'https://qhooks.com/api/v1/agent/launches' \\\n  --data-urlencode 'chain=4663' \\\n  --data-urlencode 'limit=3'",
    label: "Public REST read",
    docs: "https://qhooks.com/api#agents",
  },
];
export const cursorInstallLink = source =>
  "cursor://anysphere.cursor-deeplink/mcp/install?name=QHooks&config=" +
  encodeURIComponent(btoa(JSON.stringify({ url: source?tagAgentUrl("https://qhooks.com/mcp",source):"https://qhooks.com/mcp" })));
