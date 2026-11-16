---
title: "Token safety checks for your agent"
seo_title: "Token Safety MCP: QProof Checks for Agents | QHooks"
description: "Read stored QProof token safety checks through MCP or A2A. Interpret clear, caution, danger and unknown verdicts, with explicit missing and stale handling."
canonical: "https://qhooks.com/agents/guides/token-safety-mcp"
slug: "token-safety-mcp"
date: "2026-11-15"
keywords: ["token safety mcp"]
draft: false
---

# Token safety checks for your agent

`qproof_check` reads the latest **stored** QProof report for one chain and token. It starts no fresh check and runs no code. Its name is not a promise of current safety.

## Read through MCP

```sh
curl -sS https://qhooks.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data '{"jsonrpc":"2.0","id":"qproof-qhooks","method":"tools/call","params":{"name":"qproof_check","arguments":{"chain":"4663","token":"0x20429af7ca3b0ce4d99edbaa0693f26c5df05195"}}}'
```

Actual November 15 response, selected fields from `result.structuredContent`:

```json
{
  "version": 1,
  "state": "ready",
  "subject": {
    "chain": "robinhood",
    "address": "0x20429af7ca3b0ce4d99edbaa0693f26c5df05195"
  },
  "report": {
    "status": "observed",
    "verdict": {
      "level": "clear",
      "headline": "No red flags found",
      "counts": {
        "danger": 0,
        "caution": 0,
        "clear": 7,
        "unknown": 1,
        "info": 6
      }
    },
    "retrievedAt": "2026-11-15T20:02:46.296Z",
    "completedAt": "2026-11-15T20:02:48.697Z",
    "cached": true,
    "ageMs": 4942802
  }
}
```

This report says `clear` while retaining **one unknown check**. Inspect the individual checks and their `required` fields. Do not translate the headline into “all checks passed” or guaranteed sell execution.

## Interpret the verdict

| `report.verdict.level` | Meaning for an agent |
|---|---|
| `clear` | No flags in the returned covered checks; unknown coverage can remain. |
| `caution` | A warning was reported; show the relevant checks before a user decides. |
| `danger` | Danger signals were reported; stop automatic progression and surface them. |
| `unknown` or an unrecognised value | Insufficient usable evidence; do not infer safety. |

A required check with `status:"unknown"`, or a report whose `status` is not `observed`, prevents a clean all-covered interpretation. Preserve optional unknowns too. A danger check takes precedence over a clear headline.

## Missing and stale evidence

| Response | Handling |
|---|---|
| `state:"not_checked"` or `report:null` | No usable stored verdict. Pause and offer [QProof](https://qhooks.com/qproof) for a user-requested fresh check. |
| `state:"refreshing"` | An older report may be present. Show its time; do not treat it as newly checked. |
| `state:"ready"` | A report is available. Still compare the exact subject and its timestamps with your freshness policy. |
| Tool/RPC error or HTTP 429/503 | Unavailable evidence, never a clear verdict. Honour Retry-After/backoff; avoid polling loops. |

For example, a **caller-chosen ten-minute maximum age** would pause on the captured report above. Compute age from `completedAt`/`retrievedAt` and the current clock as well as reading `ageMs`; a cached response does not become fresh when fetched again. Missing timestamps are unknown age. No universal safety TTL is promised.

## The same read over A2A 1.0

Discover the [live agent card](https://qhooks.com/.well-known/agent-card.json). POST this request to `https://qhooks.com/api/a2a` with `Content-Type: application/json` and **`A2A-Version: 1.0`**:

```json
{
  "jsonrpc": "2.0",
  "id": "a2a-qproof",
  "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "qhooks-guides-a2a-qproof",
      "role": "ROLE_USER",
      "parts": [
        {
          "mediaType": "application/json",
          "data": {
            "tool": "qproof_check",
            "arguments": {
              "chain": "4663",
              "token": "0x20429af7ca3b0ce4d99edbaa0693f26c5df05195"
            }
          }
        }
      ]
    }
  }
}
```

Read `result.message.parts[0].data.result`; check the outer RPC `error` and the data part's `error:true` first. Our live A2A capture returned the **same stored envelope** as the MCP example. A2A does not make the report fresh.

Stored token checks currently accept Robinhood Chain, Base, Arbitrum, BNB Chain, Ethereum, Elysium and Solana. Use exact chain/address pairs; preserve Solana address casing. Unsupported chains must remain unsupported rather than falling back to another network.

Prompt to try: “Read QProof, list warnings and unknown checks, compare the report age with my policy, and stop before any transaction.” [Connect MCP](/agents/guides/robinhood-chain-mcp) · [skill.md](https://qhooks.com/skill.md).
