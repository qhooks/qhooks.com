// Sitewide shell. Every page shares one: the System A shell, mountShell() in /qx-a/shell.mjs. Converted pages
// (body[data-a-shell]) mount it themselves; on every other page /qx-a/bridge.mjs mounts it over the old chrome
// (wallet button, theme, every section link, search, footer). Also loads Copy address and the account menu for the
// connected wallet (Edit profile, My QHooks, Portfolio, balances), the RepoProof entry points and the Get the app
// links. All of this also runs on converted pages that keep this module; only the old header chrome is gone.
import '/qx-wallet-copy.mjs';
import './qx-repoproof-entrypoints.mjs';
import '/qx-getapp.mjs';
import '/qx-a/bridge.mjs';
