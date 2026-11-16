---
title: "Agent OTC escrow and pay-when-done agreements"
seo_title: "Agent Escrow: OTC and Pay-When-Done Agreements | QHooks"
description: "Use QHooks agent escrow tools for Robinhood Chain OTC deals and conditional agreements. Read real tool responses and review each wallet-signed step."
canonical: "https://qhooks.com/agents/guides/agent-escrow"
slug: "agent-escrow"
date: "2026-11-15"
keywords: ["agent escrow"]
draft: false
---

# Agent OTC escrow and pay-when-done agreements

QHooks' v7 OTC flow and v8 agreements are available in the current tool inventory on **Robinhood Chain (`4663`)**. Agents read terms and prepare unsigned transactions. **The user's wallet reviews, signs and sends every transaction.**

## OTC: agreed terms to escrow settlement

| Step | Tool and wallet action |
|---|---|
| Agree the deal | The parties choose the token, amounts, payment asset, recipient and expiry. |
| Read a planning quote | `otc_quote` validates those supplied terms and returns fees, settlement details and `validUntil`. It does not prove counterparty consent. |
| Prepare creation | Pass the returned quote unchanged to `otc_create`; `fundNow` defaults to false. The buyer reviews and signs creation. A simulation does not reserve a deal ID. |
| Read the real deal | Take the ID from the confirmed `DealCreated` receipt, then call `deal_status`. Compare the actual parties, funding, deadline, fees and `termsHash`. |
| Deposit and settle | `otc_accept` needs that current `expectedTermsHash` and the depositing party's `actor`. Each named party signs its own deposit. Confirm any approval, then re-prepare. |

Supported payment assets are ETH, WETH and USDG. Use a fresh quote before its returned deadline. Seller-first funding can remain locked while the buyer has not funded; re-read status for permitted cancellation, refund or withdrawal actions. Expiry does not itself submit a transaction. There is no live RFQ matching board in this flow.

## Agreements: explicit conditions to wallet-authorised release

1. Specify payer, payee, asset, expiry and each tranche's conditions. `agreement_from_template` supports `milestones`, `arbiter_escrow`, `time_release`, `optimistic` and `panel`.
2. `agreement_create` and `agreement_fund` prepare the **same atomic create-and-fund operation**. They are not sequential “create empty, top up later” steps. The payer reviews and signs; existing agreements cannot be topped up.
3. Read the confirmed creation receipt for the actual ID. `agreement_status` returns on-chain terms, conditions and readiness. Keep the reviewed human-readable terms: only their hash is on-chain.
4. Where required, a named attester uses `agreement_attest` and signs. An agent saying “done” does not satisfy a contract condition. Optimistic windows need an explicit start and can be objected to.
5. Re-read status. Use `agreement_release` only when the tranche is ready, or `agreement_refund` only when contract state permits it. Each prepared action still needs a wallet signature; there is no automatic background payout.

Review the returned fees and recipient before signing. Approval requirements can be staged; `approval_required` means confirm the approval and re-prepare. A satisfied tranche can retain a 24-hour release grace after expiry, so expiry alone is not a refund guarantee.

## A real read-only error to handle

This example probes ID `1`; it is **not an existing funded-deal example**. Use your own confirmed receipt's ID in a real flow.

```sh
curl -sS https://qhooks.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data '{"jsonrpc":"2.0","id":"otc-status","method":"tools/call","params":{"name":"deal_status","arguments":{"chain":"4663","dealId":"1"}}}'
```

Captured November 15 at HTTP **200**; selected fields from `result`:

```json
{
  "isError": true,
  "structuredContent": {
    "error": "not_found"
  }
}
```

`agreement_status` with `{"chain":"4663","id":"1"}` also returned `not_found`. HTTP success is not escrow success. Never replace a missing deal/agreement with a guessed ID or proceed on a simulated receipt.

Try: “Help me review an RH OTC deal using the terms I provide. Show fees and funding risks; stop before every wallet signature.” Or: “Draft a milestone agreement with explicit approvers and expiry. Explain when release and refund become available.”

Discover exact inputs with `tools/list`; follow [skill.md](https://qhooks.com/skill.md). All examples captured here are reads: no escrow was created, funded or settled for this guide. [Connect MCP](/agents/guides/robinhood-chain-mcp) · [Token safety](/agents/guides/token-safety-mcp).
