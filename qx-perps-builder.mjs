import { getWalletHub } from "/wallet-hub.mjs";
import { createPerpsWallet } from "./qx-perps-wallet.mjs";
import { canTrade } from "./qx-perps-core.mjs";
import { loadPerpsConfig } from "./qx-perps-config.mjs";
import { changeBuilderFee, isSafeOwner } from "./qx-perps-builder-flow.mjs";
import { info } from "./qx-perps-data.mjs";
import { usd, short, createConfirmation } from "./qx-perps-ui.mjs";
const $ = (id) => document.getElementById(id), hub = getWalletHub(window), wallet = createPerpsWallet({ hub }), confirm = createConfirmation();
let country = null, equity = null, sequence = 0, busy = false, lastOwner = null, lastProvider = null, config = null, safeOwner = false;
const current = () => hub.snapshot().current, owner = () => current()?.owner;
function render() {
  const address = owner();
  $("builder-current").textContent = !config ? "Refreshing" : config.builder ? "Builder fee: on, 0.1%" : "Builder fee: off";
  $("builder-current-address").hidden = !config?.builder;
  $("builder-current-address").textContent = config?.builder ? short(config.builder) : "";
  $("builder-current-address").title = config?.builder || "";
  $("builder-address").textContent = address || "Connect with the wallet button above.";
  $("builder-equity").textContent = equity === null ? "\u2014" : usd(equity);
  $("builder-region").hidden = canTrade(country);
  $("builder-deposit").hidden = !address || !canTrade(country) || equity === null || equity >= 100;
  $("builder-deposit").disabled = busy;
  $("builder-copy").disabled = !address || busy;
  $("builder-refresh").disabled = busy;
  $("builder-ready").hidden = !address || !config || equity === null || equity < 100 || config.builder === address.toLowerCase();
  $("builder-on").disabled = busy;
  $("builder-off").hidden = !config?.builder || !address || !safeOwner;
  $("builder-off").disabled = busy;
}
async function refresh() {
  const address = owner(), seq = ++sequence;
  equity = null; safeOwner = false;
  render();
  $("builder-status").textContent = "Refreshing";
  const [setting, state, authorization] = await Promise.allSettled([
    loadPerpsConfig(),
    address ? info({ type: "clearinghouseState", user: address }) : Promise.resolve(null),
    address ? isSafeOwner(address) : Promise.resolve(false)
  ]);
  if (seq !== sequence || address !== owner()) return;
  if (setting.status === 'fulfilled') config = setting.value;
  const value = state.status === 'fulfilled' ? state.value?.marginSummary?.accountValue : null;
  if (value !== null && value !== undefined && String(value).trim() && Number.isFinite(Number(value))) equity = Number(value);
  safeOwner = authorization.status === 'fulfilled' && authorization.value;
  $("builder-status").textContent = !address ? "Connect a QHooks owner wallet." : authorization.status === 'rejected' || equity === null ? "Refreshing. Try again in a moment." : !safeOwner ? "Connect a QHooks owner wallet." : equity >= 100 ? "Sign one message to update the builder fee." : "Deposit at least 100 USDC to Hyperliquid first.";
  render();
}
async function run(fn) {
  if (busy) return;
  confirm.setOpener(document.activeElement);
  busy = true; render();
  try { await fn(); }
  catch (e) { $("builder-status").textContent = e.message || "Refreshing. Try again in a moment."; }
  finally { busy = false; render(); confirm.restoreFocus(); confirm.setOpener(null); }
}
async function change(action) {
  const snapshot = current(), address = snapshot?.owner, provider = snapshot?.entry?.provider;
  if (!address || !provider) throw Error("Connect a QHooks owner wallet.");
  if (action === 'off' && !await confirm.ask("Turn off builder fee?", "New orders will stop including the QHooks builder fee. Sign one message in your wallet to confirm.")) return;
  ++sequence; // Ignore a refresh that began before this signed change.
  $("builder-status").textContent = "Confirm the message in your wallet.";
  const result = await changeBuilderFee({address, action, provider, isCurrent: () => owner() === address && current()?.entry?.provider === provider});
  if (owner() !== address || current()?.entry?.provider !== provider) return;
  config = {builder: result.builder, builderFeeTenthsBp: 100};
  safeOwner = true;
  $("builder-status").textContent = result.builder ? "Builder fee turned on." : "Builder fee turned off.";
}
$("builder-on").addEventListener("click", () => run(() => change('on')));
$("builder-off").addEventListener("click", () => run(() => change('off')));
$("builder-refresh").addEventListener("click", () => run(refresh));
$("builder-copy").addEventListener("click", () => run(async () => {
  const address = owner(); if (!address) return;
  try { await navigator.clipboard.writeText(address); $("builder-status").textContent = "Address copied."; }
  catch { $("builder-status").textContent = "Select and copy the address above."; }
}));
$("builder-deposit").addEventListener("click", () => run(async () => {
  if (!canTrade(country)) return;
  const address = owner();
  if (!await confirm.ask("Deposit 100 USDC?", "Your wallet will switch to Arbitrum and transfer 100 USDC to your Hyperliquid perps account. Arbitrum ETH is needed for gas.")) return;
  if (address !== owner()) throw Error("Wallet changed. Review again.");
  const hash = await wallet.deposit("100");
  $("builder-status").textContent = "Deposit submitted: " + hash + ". Tap Refresh equity after it arrives.";
}));
hub.subscribe(() => {
  if (lastOwner !== owner() || lastProvider !== current()?.entry?.provider) {
    lastOwner = owner(); lastProvider = current()?.entry?.provider;
    confirm.cancel(); refresh();
  }
  render();
});
if (sequence === 0) refresh();
(async () => {
  try {
    const r = await fetch("/api/geo", { cache: "no-store", signal: AbortSignal.timeout(8e3) });
    country = r.ok ? (await r.json()).country : null;
  } catch { country = null; }
  render();
})();
