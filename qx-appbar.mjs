// QHooks app bar. The phone tab bar (Trade · Hooks · Launch · Community · Portfolio) is now part of the System A shell
// (/qx-a/shell.mjs): the same five places on every product page, hidden inside Telegram, with the Android
// "Get the app" bar attached above it (never inside the app). A page that loads this module asks for the tab bar;
// /qx-a/bridge.mjs reads that and mounts the shell; on a converted page (body[data-a-shell]) it draws nothing.
// Links only: no data, no wallet.
import '/qx-getapp.mjs';
import '/qx-a/bridge.mjs';
