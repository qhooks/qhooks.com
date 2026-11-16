# QHooks agent examples

Connect an agent to QHooks for Robinhood Chain market reads, stored QProof safety checks and wallet-reviewed OTC/agreement plans. MCP: https://qhooks.com/mcp · instructions: https://qhooks.com/skill.md · A2A card: https://qhooks.com/.well-known/agent-card.json.

These examples make **read-only requests**. They contain no signer, key, wallet connector, transaction sender or vendored assets. QHooks needs no API key for these reads. Prepared for the signing wallet: the agent's own wallet or yours. No custody. We never hold keys. Each later funds-moving step needs the intended wallet's signature.

## Quick start

Requires `curl`; the projections below also use `jq`. From this directory:

```sh
curl -sS https://qhooks.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @requests/initialize.json

curl -sS https://qhooks.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @requests/tools-list.json | jq '.result.tools[].name'

curl -sS https://qhooks.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @requests/rh-launches.json \
  | jq '.result.structuredContent | {version,kind,generatedAt,launches:[.launches[]|{chainId,token,name,symbol,status,terminal}]}'
```

The captured launch projection is in [`captures/rh-launches.json`](captures/rh-launches.json). It is a dated observation, not a promise of today's first result. Keep each chain and address together.

## Stored token safety over MCP and A2A

```sh
curl -sS https://qhooks.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @requests/qproof-qhooks.json \
  | jq '.result | {isError,structuredContent:{state:.structuredContent.state,subject:.structuredContent.subject,report:(.structuredContent.report|{status,verdict,retrievedAt,completedAt,cached,ageMs})}}'

curl -sS https://qhooks.com/api/a2a \
  -H 'Content-Type: application/json' -H 'A2A-Version: 1.0' \
  --data-binary @requests/a2a-qproof.json \
  | jq '.result.message.parts[0].data | {tool,error,result:{state:.result.state,subject:.result.subject,report:(.result.report|{status,verdict,retrievedAt,completedAt,cached,ageMs})}}'
```

Read the complete response before relying on a projection. Check outer JSON-RPC `error`, MCP `result.isError`, and A2A data-part `error:true`. `qproof_check` starts no fresh check. `ready` means a stored report is available, not fresh: compare its exact subject, individual unknown checks and report timestamps with your policy. Missing reports/errors are unknown, not safe. Do not convert `clear` into guaranteed sell execution.

[`captures/qproof-qhooks.json`](captures/qproof-qhooks.json) preserves selected actual November 15, 2026 fields: `clear`, one unknown check, and the original timestamps. The MCP and A2A captures returned the same stored envelope. No check was started to produce this example.

## Escrow reads before any wallet action

```sh
curl -sS https://qhooks.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @requests/otc-status.json | jq '.result | {isError,structuredContent}'
```

The deliberate ID `1` probe returned [`not_found`](captures/otc-status-error.json) at HTTP 200. The included `agreement-status.json` probe did too. These are real error-handling examples, not funded escrows. Real IDs come only from confirmed contract receipts.

For a later reviewed OTC flow: `otc_quote` → `otc_create` → buyer signature/receipt → `deal_status` → `otc_accept` → each depositing party's signature. For agreements: `agreement_from_template` or `agreement_create`/`agreement_fund` (same atomic creation/funding operation) → payer signature/receipt → `agreement_status` → named attestations → permitted release/refund and a wallet signature. These preparations are not run by this examples packet. Re-read state after approvals and confirmations; there is no background payout.

## Guides

- [Robinhood Chain MCP in 2 minutes](https://qhooks.com/agents/guides/robinhood-chain-mcp)
- [Token safety checks for your agent](https://qhooks.com/agents/guides/token-safety-mcp)
- [Agent OTC escrow and pay-when-done agreements](https://qhooks.com/agents/guides/agent-escrow)

Client setup references: [Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Cursor](https://cursor.com/docs/mcp), [Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Preserve existing configuration when adding the QHooks URL. Repository licensing applies.
