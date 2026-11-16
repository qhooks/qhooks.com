import { getWalletHub } from "./wallet-hub-fresh.mjs";
import { mountSetup } from "./qx-a/pages/setup-ui.mjs";
import { createX402Test, TEST } from "./qx-x402-test-core.mjs";
const $ = (id) => document.getElementById(id), hub = getWalletHub(window);
let app, timer = null, autoChecks = 0, blobUrl = null;
function render(s) {
  const c = hub.snapshot().current, connected = !!c, wrong = c && Number(c.chainId) !== 4663, payer = c?.owner?.toLowerCase() === TEST.payer;
  $("test-root").dataset.state = s.phase;
  $("test-status").textContent = s.message;
  $("test-wallet").textContent = c?.owner || "Not connected";
  const finished = !!s.receipt || s.phase === "review";
  $("test-go").hidden = !!s.receipt || ["pending", "review"].includes(s.phase);
  $("test-go").disabled = s.busy || connected && !wrong && (!payer || s.phase !== "ready");
  $("test-go").textContent = !connected ? "Connect wallet" : wrong ? "Switch to Robinhood Chain" : !payer ? "Use the wallet ending 8c73" : "Pay 0.05 USDG + run fresh scan";
  $("test-check").hidden = ["signing", "done", "review"].includes(s.phase);
  $("test-check").disabled = s.busy || s.retryAt > Date.now();
  $("test-check").textContent = s.phase === "pending" ? "Check the same payment" : "Refresh readiness";
  $("test-result").hidden = !s.receipt;
  $("test-tx").hidden = !/^0x[0-9a-f]{64}$/i.test(s.transaction || "");
  if (s.transaction) {
    $("test-tx").href = "https://robinhoodchain.blockscout.com/tx/" + s.transaction;
    $("test-tx").textContent = "View payment transaction";
  }
  for (const [index, key] of ["connected", "authorized", "settled", "fresh"].entries()) {
    const done = [payer, s.authorizationSigned === true, s.receipt?.settled === true, s.receipt?.freshComplete === true][index];
    $("step-" + key).dataset.done = String(!!done);
  }
  if (s.receipt) {
    $("test-result-title").textContent = s.receipt.freshComplete ? "Fresh scan complete." : "Payment recorded. Review needed.";
    $("test-report").textContent = JSON.stringify({ fresh: s.receipt.fresh, verdict: s.receipt.report?.verdict || null, checks: s.receipt.report?.checks || [], refundReview: s.receipt.refundReview }, null, 2);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([JSON.stringify(s.receipt, null, 2) + "\n"], { type: "application/json" }));
    $("test-download").href = blobUrl;
  }
  clearTimeout(timer);
  if (s.phase === "pending" && !s.busy && s.retryAt > Date.now() && autoChecks < 5) {
    timer = setTimeout(() => {
      autoChecks++;
      app.check();
    }, Math.min(6e4, Math.max(1e3, s.retryAt - Date.now())));
  } else if (s.retryAt > Date.now() && !s.busy) timer = setTimeout(() => render(app.snapshot()), Math.min(6e4, s.retryAt - Date.now() + 20));
}
app = createX402Test({ hub, onChange: render });
$("test-go").addEventListener("click", async () => {
  const c = hub.snapshot().current;
  if (!c) {
    hub.open();
    return;
  }
  if (Number(c.chainId) !== 4663) {
    try {
      await hub.switchChain("4663");
    } catch {
      $("test-status").textContent = "The network switch was not completed. No payment was sent.";
    }
    render(app.snapshot());
    return;
  }
  autoChecks = 0;
  await app.pay();
});
$("test-check").addEventListener("click", () => {
  autoChecks = 0;
  app.check();
});
hub.subscribe(() => render(app.snapshot()));
mountSetup({ title: "x402 scan test", back: "/taps" });
render(app.snapshot());
app.checkReady();
window.addEventListener("pagehide", () => {
  clearTimeout(timer);
  if (blobUrl) URL.revokeObjectURL(blobUrl);
});
