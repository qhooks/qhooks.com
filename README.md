# qhooks.com

The public static source of [qhooks.com](https://qhooks.com). The release ID, Worker digest and SHA-256 checksums in
[`.well-known/qhooks-release.json`](.well-known/qhooks-release.json) identify the accepted source snapshot mirrored here.
It is here so anyone can read the browser code before connecting a wallet.

QHooks is an ecosystem for token builders on Uniswap v4: pick or build the hooks a token trades through, launch it, trade
it in one terminal, let holders stake, protect creator actions with a second post-quantum key, and integrate it all into
your own app.

QHOOKS token on Robinhood Chain (4663): 0x20429Af7cA3b0cE4d99EDBAA0693f26C5df05195 · contracts: https://qhooks.com/contracts

- **Building on QHooks?** Start with the [builder kit](https://github.com/qhooks/builder-kit): the JavaScript SDK, public
  API docs, the module template (MIT) and the roadmap.
- **What changed:** <https://qhooks.com/changelog> (feed: <https://qhooks.com/changelog.xml>) · **What's next:** <https://qhooks.com/roadmap.html>

## What is and isn't here
- Public assets, including `b/` browser bundles, match the pinned release's `public/` source. README, CI tooling and release
  metadata are repository files. The Worker can generate public documentation and API responses at request time; their served
  bodies are covered by the release owner's live acceptance, separately from these static-source checksums.
- Wallet keys and passphrases never
  leave the user's browser. A post-quantum account key is encrypted in the browser; QHooks stores only that encrypted copy
  (one per unlock method: passphrase, and Face ID / Touch ID via a passkey) and never receives anything that opens it.
  The wallet or a QHooks sign-in alone cannot open it. Security reports: team@qhooks.com (see /.well-known/security.txt).
  Reported by [HEY Research Lab](https://heyresearch.xyz).
- The server side (the Cloudflare Worker behind `/api/*`) and the core launch contracts are not included. The module template
  is public in the builder kit.
- Third-party code keeps its own license: `vendor/lightweight-charts` (TradingView Lightweight Charts, Apache-2.0) and the
  wallet-login bundle in `privy/` (Privy).
- Licensed TradingView Advanced Charts files (`charting_library*`, `datafeeds/`, `download/`) are excluded. The mirror guard
  also rejects renamed library bundles; open-source Lightweight Charts remains included.

## Release integrity

Each mirror update includes a full static-source manifest. CI rejects changed, missing and extra public files against it,
checks the licensed-content boundary, scans tracked source for common credential patterns, and checks canonical chain counts
and terminal filter membership. The chain-copy check covers marked copy; unmarked historical page prose needs source-owner
updates and is not claimed canonical by this check. No CI job deploys or publishes the website.

## License
Copyright © 2026 QHooks. All rights reserved, except where a file or folder states its own license. The
[builder kit](https://github.com/qhooks/builder-kit) is MIT.

## Agent guides

- [Robinhood Chain MCP in 2 minutes](https://qhooks.com/agents/guides/robinhood-chain-mcp?ref=guide-1)
- [Token safety checks for your agent](https://qhooks.com/agents/guides/token-safety-mcp?ref=guide-2)
- [Agent OTC escrow and pay-when-done agreements](https://qhooks.com/agents/guides/agent-escrow?ref=guide-3)
- [Read-only agent examples and captured responses](examples/agents/README.md)
