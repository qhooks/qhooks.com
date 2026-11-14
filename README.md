# qhooks.com

The front end of [qhooks.com](https://qhooks.com), published exactly as the site serves it: every page, script and style a
visitor's browser already downloads. It is here so anyone can read what the site does before connecting a wallet.

QHooks is an ecosystem for token builders on Uniswap v4: pick or build the hooks a token trades through, launch it, trade
it in one terminal, let holders stake, protect creator actions with a second post-quantum key, and integrate it all into
your own app.

QHOOKS token on Robinhood Chain (4663): 0x20429Af7cA3b0cE4d99EDBAA0693f26C5df05195 · contracts: https://qhooks.com/contracts

- **Building on QHooks?** Start with the [builder kit](https://github.com/qhooks/builder-kit): the JavaScript SDK, public
  API docs, the module template (MIT) and the roadmap.
- **What changed:** <https://qhooks.com/changelog> (feed: <https://qhooks.com/changelog.xml>) · **What's next:** <https://qhooks.com/roadmap.html>

## What is and isn't here
- Everything in this repository is served publicly at qhooks.com; nothing here is a secret. Wallet keys and passphrases never
  leave the user's browser. A post-quantum account key is encrypted in the browser; QHooks stores only that encrypted copy
  (one per unlock method: passphrase, and Face ID / Touch ID via a passkey) and never receives anything that opens it.
  The wallet or a QHooks sign-in alone cannot open it. Security reports: team@qhooks.com (see /.well-known/security.txt).
- The server side (the Cloudflare Worker behind `/api/*`) and the core launch contracts are not included. The module template
  is public in the builder kit.
- Third-party code keeps its own license: `vendor/lightweight-charts` (TradingView Lightweight Charts, Apache-2.0) and the
  wallet-login bundle in `privy/` (Privy).

## License
Copyright © 2026 QHooks. All rights reserved, except where a file or folder states its own license. The
[builder kit](https://github.com/qhooks/builder-kit) is MIT.
