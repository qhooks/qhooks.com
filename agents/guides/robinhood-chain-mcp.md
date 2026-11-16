---
title: "Robinhood Chain MCP in 2 minutes"
seo_title: "Robinhood Chain MCP in 2 Minutes | QHooks"
description: "Connect Claude, Cursor or Codex to QHooks MCP. Read Robinhood Chain launches and stored QProof results with real tool examples and wallet-controlled actions."
canonical: "https://qhooks.com/agents/guides/robinhood-chain-mcp"
slug: "robinhood-chain-mcp"
date: "2026-11-15"
keywords: ["robinhood chain mcp"]
draft: true
---

# Robinhood Chain MCP in 2 minutes

Connect your existing AI client to `https://qhooks.com/mcp`. QHooks needs no API key or sign-in. Start with a read; Prepared for the signing wallet: the agent's own wallet or yours. No custody. We never hold keys.

## 1. Connect your client

**Claude:** open **Customize → Connectors → Add → Add custom connector**. Name it **QHooks**, enter the URL above and choose **No sign in**. Enable QHooks for the conversation. Organisation accounts may need their administrator to add it. [Claude setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

**Cursor:** merge this entry into your project's `.cursor/mcp.json`, then enable QHooks under Customize/MCPs; restart if it has not appeared. [Cursor setup](https://cursor.com/docs/mcp).

```json
{
  "mcpServers": {
    "qhooks": { "url": "https://qhooks.com/mcp" }
  }
}
```

**Codex:** add the Streamable HTTP server using the CLI, then check it with `/mcp` in your session. The desktop app also offers **Settings → MCP servers → Add server**, followed by **Restart**. [Codex setup](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

```sh
codex mcp add qhooks --url https://qhooks.com/mcp
```

## 2. Read one Robinhood Chain launch

Try this prompt:

```text
Use QHooks list_launches with chain "4663" and limit 1.
Show the chain, token address, name, status and terminal link.
Read only; do not prepare a transaction.
```

The direct MCP request is:

```sh
curl -sS https://qhooks.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data '{"jsonrpc":"2.0","id":"rh-launches","method":"tools/call","params":{"name":"list_launches","arguments":{"chain":"4663","limit":1}}}'
```

Real response captured November 15, 2026; selected fields from `result.structuredContent`:

```json
{
  "version": 1,
  "kind": "qhooks-simple-launches",
  "generatedAt": "2026-11-15T21:25:08.358Z",
  "launches": [
    {
      "chainId": "4663",
      "token": "0xebf69bb14d80e7c68f648fbae6050494923e480f",
      "name": "QWERTY",
      "symbol": "QWERTY",
      "status": "new",
      "terminal": "https://qhooks.com/terminal.html#m=4663:0xebf69bb14d80e7c68f648fbae6050494923e480f"
    }
  ]
}
```

Keep the chain and address together. This is a returned launch record, not a claim that it launched at the response timestamp.

## 3. Add a stored safety check

```text
Call qproof_check for the exact chain and token above. Show its
state, verdict, unknown checks and report time. If evidence is
missing or too old for my policy, pause instead of calling it safe.
```

Use `tools/list` to discover current names and argument schemas. Check JSON-RPC `error` and `result.isError` even when HTTP is 200; successful tool data is in `result.structuredContent`. The client handles MCP initialization; the advertised MCP protocol is `2025-06-18`.

Next: [Token safety checks](/agents/guides/token-safety-mcp) · [Agent escrow](/agents/guides/agent-escrow). Full instructions: [skill.md](https://qhooks.com/skill.md).
