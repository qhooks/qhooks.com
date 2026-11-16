import {tagAgentUrl} from "./agent-source.mjs";
// Setup URLs checked against official client docs; SDKs are QHooks-hosted adapters.
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
    kind: "QHooks SDK · Node 24+",
    title: "Register the ElizaOS plugin",
    instruction:
      "Install the QHooks-hosted package in your existing ElizaOS 2.0.5 application. The adapter adds 25 pinned read/prepare actions. It does not start a model, wallet or messaging callback. Board/profile preparations are available through MCP or REST.",
    snippet:
      'import { createQHooksPlugin } from "@qhooks/plugin-elizaos";\nawait runtime.registerPlugin(createQHooksPlugin());',
    label: "Register in your existing app",
    docs: "https://qhooks.com/api#agents",
    download: "qhooks-plugin-elizaos-0.2.1.tgz",
    command: "npm install https://qhooks.com/download/agents/qhooks-plugin-elizaos-0.2.1.tgz",
  },
  {
    id: "goat",
    name: "GOAT",
    mark: "G",
    kind: "QHooks SDK · Node 22+",
    title: "Add the native GOAT plugin",
    instruction:
      "Use the QHooks-hosted adapter with @goat-sdk/core 0.5.0. This registers 25 pinned read/prepare tools without a wallet client. Board/profile preparations are available through MCP or REST. The separate upstream PR is under review.",
    snippet:
      'import { qhooks } from "@qhooks/goat-plugin";\nconst plugin = qhooks();\nconst tools = plugin.getTools();',
    label: "Register in your existing app",
    docs: "https://github.com/goat-sdk/goat/pull/616",
    download: "qhooks-goat-plugin-0.2.1.tgz",
    command: "npm install https://qhooks.com/download/agents/qhooks-goat-plugin-0.2.1.tgz",
  },
  {
    id: "agentkit",
    name: "AgentKit",
    mark: "AK",
    kind: "QHooks SDK · Node 22+",
    title: "Add the AgentKit action provider",
    instruction:
      "Use the QHooks-hosted adapter with @coinbase/agentkit 0.10.4. It adds 25 pinned actions. Optional attribution uses an explicit referrer, then the configured option, then the existing wallet’s public address. Board/profile preparations use MCP or REST. The upstream provider PR is under review.",
    snippet:
      'import { qhooksActionProvider } from "@qhooks/agentkit-action-provider";\nconst provider = qhooksActionProvider();\nconst actions = provider.getActions();',
    label: "Register in your existing app",
    docs: "https://github.com/coinbase/agentkit/pull/1651",
    download: "qhooks-agentkit-action-provider-0.2.1.tgz",
    command:
      "npm install https://qhooks.com/download/agents/qhooks-agentkit-action-provider-0.2.1.tgz",
  },
  {
    id: "rest",
    name: "REST / curl",
    mark: "/>",
    kind: "Any language",
    title: "One public request. No key.",
    instruction:
      "Read indexed launches with plain HTTP. Use POST for preparations and GET for public reads. Amounts are exact strings in raw units. A prepared plan still needs the signing wallet’s signature (agent-owned or user-owned).",
    snippet:
      "curl --fail-with-body --get 'https://qhooks.com/api/v1/agent/launches' \\\n  --data-urlencode 'chain=4663' \\\n  --data-urlencode 'limit=3'",
    label: "Public REST read",
    docs: "https://qhooks.com/api#agents",
  },
];
export const cursorInstallLink = source =>
  "cursor://anysphere.cursor-deeplink/mcp/install?name=QHooks&config=" +
  encodeURIComponent(btoa(JSON.stringify({ url: source?tagAgentUrl("https://qhooks.com/mcp",source):"https://qhooks.com/mcp" })));
