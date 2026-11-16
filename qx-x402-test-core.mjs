const TEST = Object.freeze({ payer: "0xaf48a5ab32ef96ee7a72ed6ed4534be1bc928c73", chainId: 4663, network: "eip155:4663", asset: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", recipient: "0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71", amount: "50000", token: "0x20429af7ca3b0ce4d99edbaa0693f26c5df05195", header: "x-qhooks-x402-test-payer", storage: "qhooks:x402-test:v1" });
const RESOURCE = "https://qhooks.com/api/x402/v1/qproof?chain=4663&address=" + TEST.token;
const types = { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] };
const domain = { name: "Global Dollar", version: "1", chainId: 4663, verifyingContract: TEST.asset };
const decode = (value) => {
  if (typeof value !== "string" || value.length > 131072) throw Error("The payment response could not be verified.");
  return JSON.parse(atob(value));
};
function validateChallenge(value) {
  const a = value?.accepts?.[0];
  if (value?.x402Version !== 2 || value.resource?.url !== RESOURCE || !Array.isArray(value.accepts) || value.accepts.length !== 1 || a?.scheme !== "exact" || a.network !== TEST.network || a.asset?.toLowerCase() !== TEST.asset || a.payTo?.toLowerCase() !== TEST.recipient || a.amount !== TEST.amount || a.maxTimeoutSeconds !== 120 || a.extra?.name !== domain.name || a.extra?.version !== "1" || a.extra?.assetTransferMethod !== "eip3009") throw Error("The payment request differs from the reviewed 0.05 USDG test. Nothing was signed.");
  return a;
}
function typedAuthorization(payer, at, random = (bytes) => crypto.getRandomValues(bytes)) {
  if (payer?.toLowerCase() !== TEST.payer) throw Error("Connect the test wallet ending 8c73.");
  const seconds = Math.floor(at / 1e3), nonce = "0x" + Array.from(random(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { domain, types, primaryType: "TransferWithAuthorization", message: { from: TEST.payer, to: TEST.recipient, value: TEST.amount, validAfter: String(seconds - 10), validBefore: String(seconds + 100), nonce } };
}
function createX402Test({ hub, fetcher = (...args) => fetch(...args), storage = globalThis.sessionStorage, now = Date.now, random, onChange = () => {
} }) {
  let state = { phase: "checking", message: "Checking the single-payment test window\u2026", busy: false, transaction: null, receipt: null, authorizationSigned: false, retryAt: 0 }, pending = null, serverOffset = 0, busy = false, blocked = false;
  const emit = (next) => {
    state = { ...state, ...next };
    onChange({ ...state });
    return { ...state };
  };
  const save = (value) => {
    const text = JSON.stringify(value);
    storage.setItem(TEST.storage, text);
    if (storage.getItem(TEST.storage) !== text) throw Error("This tab cannot save payment recovery. Nothing was sent.");
  };
  try {
    const raw = storage.getItem(TEST.storage), value = JSON.parse(raw || "null");
    if (raw !== null && !(value?.v === 1 && value.resource === RESOURCE && value.payer === TEST.payer)) throw Error("invalid_recovery");
    if (value?.v === 1 && value.resource === RESOURCE && value.payer === TEST.payer) {
      if (value.receipt) {
        state = { ...state, phase: value.receipt.freshComplete ? "done" : "review", authorizationSigned: true, receipt: value.receipt, transaction: value.receipt.transaction, message: value.receipt.freshComplete ? "Payment confirmed. The fresh scan returned." : "Payment confirmed. The scan needs review; do not pay again." };
      } else if (typeof value.header === "string" && value.header.length < 8192 && Number.isSafeInteger(value.recoverUntil)) {
        const decoded = decode(value.header), a = decoded?.payload?.authorization;
        validateChallenge({ x402Version: decoded.x402Version, resource: decoded.resource, accepts: [decoded.accepted] });
        if (a?.from?.toLowerCase() !== TEST.payer || a?.to?.toLowerCase() !== TEST.recipient || a.value !== TEST.amount || !/^0x[0-9a-f]{64}$/i.test(a.nonce || "") || !/^0x[0-9a-f]{130}$/i.test(decoded?.payload?.signature || "")) throw Error("invalid_recovery");
        pending = value;
        state = { ...state, phase: "pending", authorizationSigned: true, message: "A signed test is saved in this tab. Check that same payment; do not pay again.", transaction: value.transaction || null };
      } else throw Error("invalid_recovery");
    }
  } catch {
    blocked = true;
    state = { ...state, phase: "review", message: "Saved payment recovery cannot be read. Ask QHooks to reconcile it; do not start another payment." };
  }
  const snapshot = () => ({ ...state });
  const storageReady = () => {
    const key = TEST.storage + ":check";
    storage.setItem(key, "1");
    if (storage.getItem(key) !== "1") throw Error("Payment recovery storage is unavailable. Nothing was sent.");
    storage.removeItem(key);
  };
  const current = () => {
    const c = hub.snapshot().current;
    if (!c?.entry?.provider?.request || c.owner?.toLowerCase() !== TEST.payer) throw Error("Connect the test wallet ending 8c73.");
    return c;
  };
  async function guard(c) {
    const active = current();
    if (active.owner !== c.owner || active.entry.provider !== c.entry.provider) throw Error("Wallet changed. Review the test again.");
    const accounts = await c.entry.provider.request({ method: "eth_accounts" }), chain = await c.entry.provider.request({ method: "eth_chainId" });
    if (accounts?.[0]?.toLowerCase() !== TEST.payer || Number(chain) !== 4663) throw Error("Use the test wallet on Robinhood Chain.");
  }
  async function response() {
    const headers = { [TEST.header]: TEST.payer, ...pending ? { "PAYMENT-SIGNATURE": pending.header } : {} };
    return fetcher(RESOURCE, { method: "GET", headers, cache: "no-store", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(25e3) });
  }
  async function negotiate() {
    const r = await response();
    if (r.status !== 402) {
      let error;
      try {
        error = (await r.json()).error;
      } catch {
      }
      if (["x402_off", "x402_test_off", "x402_test_unavailable"].includes(error) || r.status === 404) throw Error("The single-payment test window is not armed yet. Refresh when QHooks confirms it is ready.");
      throw Error(error === "fresh_budget_unavailable" ? "The scan budget is not ready. No payment can be made." : error === "fresh_daily_cap" || error === "x402_test_used" ? "The test purchase limit has been reached. Do not pay again." : "The production scan is not ready. No payment can be made.");
    }
    const required = decode(r.headers.get("PAYMENT-REQUIRED")), accepted = validateChallenge(required), date = Date.parse(r.headers.get("date") || "");
    serverOffset = Number.isFinite(date) ? date - now() : 0;
    return accepted;
  }
  async function checkReady() {
    if (blocked || pending || state.receipt) return emit({});
    if (busy) return snapshot();
    busy = true;
    emit({ busy: true, phase: "checking", message: "Checking the production payment request\u2026" });
    try {
      storageReady();
      await negotiate();
      return emit({ phase: "ready", message: "Ready. Your wallet will authorize exactly 0.05 USDG to the QHooks Safe." });
    } catch (e) {
      return emit({ phase: "unavailable", message: e.message });
    } finally {
      busy = false;
      emit({ busy: false });
    }
  }
  function publicReceipt(r, body) {
    const value = decode(r.headers.get("PAYMENT-RESPONSE"));
    if (value.success !== true || value.network !== TEST.network || value.payer?.toLowerCase() !== TEST.payer || !/^0x[0-9a-f]{64}$/i.test(value.transaction || "")) throw Error("Payment confirmation could not be verified. Check the same payment.");
    if (body.subject?.address?.toLowerCase() !== TEST.token || body.subject?.chain !== "robinhood") throw Error("The scan result does not match the requested token. Do not pay again.");
    const complete = body.state === "ready" && body.fresh_scan_failed === false && body.fresh?.status === "complete" && body.report && Array.isArray(body.report.checks);
    return { version: 1, resource: RESOURCE, payer: TEST.payer, amount: TEST.amount, asset: TEST.asset, recipient: TEST.recipient, transaction: value.transaction, settled: true, freshComplete: !!complete, fresh: body.fresh, report: body.report || null, refundReview: body.refundReview || null, receivedAt: new Date(now()).toISOString() };
  }
  async function sendSaved() {
    if (!pending) throw Error("No saved payment is available.");
    if (now() >= pending.recoverUntil) return emit({ phase: "review", message: "The recovery window has ended. Keep the transaction link and ask QHooks to reconcile it; do not pay again." });
    if ((pending.attempts || 0) >= 7) return emit({ phase: "review", message: "Automatic checks have stopped. Ask QHooks to reconcile this saved payment; do not pay again." });
    pending.attempts = (pending.attempts || 0) + 1;
    save(pending);
    emit({ phase: "pending", message: "Confirming the same payment and waiting for the fresh scan\u2026", retryAt: 0 });
    let r;
    try {
      r = await response();
    } catch {
      return emit({ phase: "pending", message: "The response was interrupted. Check the same payment; no second authorization will be created.", retryAt: now() + 15e3 });
    }
    let body;
    try {
      body = await r.json();
    } catch {
      return emit({ phase: "pending", message: "The response could not be read. Check the same payment; do not pay again.", retryAt: now() + 15e3 });
    }
    if (r.status === 200) {
      const receipt = publicReceipt(r, body);
      save({ v: 1, resource: RESOURCE, payer: TEST.payer, receipt });
      pending = null;
      return emit({ phase: receipt.freshComplete ? "done" : "review", message: receipt.freshComplete ? "Payment confirmed. The fresh QProof scan returned." : "Payment confirmed, but the fresh scan failed. A manual review is recorded; do not pay again.", transaction: receipt.transaction, receipt, retryAt: 0 });
    }
    if (/^0x[0-9a-f]{64}$/i.test(body.transaction || "")) {
      pending.transaction = body.transaction;
      save(pending);
      emit({ transaction: body.transaction });
    }
    if (r.status === 202 || r.status === 429 || r.status >= 500) {
      const delay = Number(r.headers.get("retry-after"));
      return emit({ phase: "pending", message: r.status === 429 ? "Checks are rate-limited. The same payment will be used after the wait." : "Payment or scan confirmation is still pending. Do not pay again.", retryAt: now() + Math.max(3e3, Math.min(Number.isFinite(delay) && delay > 0 ? delay * 1e3 : 15e3, 6e4)) });
    }
    return emit({ phase: "review", message: "The saved payment needs reconciliation. Do not create another authorization or pay again.", retryAt: 0 });
  }
  async function pay() {
    if (blocked || busy || pending || state.receipt) return snapshot();
    busy = true;
    emit({ busy: true, phase: "checking", message: "Checking the exact payment request before opening your wallet\u2026" });
    let stored = false;
    try {
      storageReady();
      const c = current();
      await guard(c);
      const accepted = await negotiate();
      await guard(c);
      const balance = await c.entry.provider.request({method:"eth_call",params:[{to:TEST.asset,data:"0x70a08231"+TEST.payer.slice(2).padStart(64,"0")},"latest"]});
      await guard(c);
      if(typeof balance!=="string"||!/^0x[0-9a-f]{1,64}$/i.test(balance))throw Error("USDG balance is refreshing. Nothing was signed or sent.");
      if(BigInt(balance)<BigInt(TEST.amount))throw Error("This wallet needs at least 0.05 USDG on Robinhood Chain. Nothing was signed or sent.");
      const typed = typedAuthorization(c.owner, now() + serverOffset, random);
      emit({ phase: "signing", message: "Approve the one-use 0.05 USDG authorization in your wallet." });
      const signature = await c.entry.provider.request({ method: "eth_signTypedData_v4", params: [c.owner, JSON.stringify({ ...typed, types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], ...typed.types } })] });
      await guard(c);
      if (!/^0x[0-9a-f]{130}$/i.test(signature || "")) throw Error("The wallet returned an invalid signature. Nothing was sent.");
      if (now() + serverOffset >= Number(typed.message.validBefore) * 1e3 - 15e3) throw Error("The authorization expired while the wallet was open. Nothing was sent.");
      const header = btoa(JSON.stringify({ x402Version: 2, resource: { url: RESOURCE }, accepted, payload: { authorization: typed.message, signature } }));
      const draft = { v: 1, payer: TEST.payer, resource: RESOURCE, header, recoverUntil: Number(typed.message.validBefore) * 1e3 + 6e4 - serverOffset, attempts: 0 };
      save(draft);
      pending = draft;
      stored = true;
      emit({authorizationSigned:true});
      return await sendSaved();
    } catch (e) {
      return emit({ phase: stored ? "pending" : "error", message: stored ? "The saved payment needs a status check. Do not pay again." : e.message || "Wallet approval was not completed. Nothing was sent.", retryAt: 0 });
    } finally {
      busy = false;
      emit({ busy: false });
    }
  }
  async function check() {
    if (busy) return snapshot();
    if (!pending) return checkReady();
    busy = true;
    emit({ busy: true });
    try {
      await guard(current());
      return await sendSaved();
    } catch (e) {
      return emit({ phase: "pending", message: e.message || "Check the saved payment again; do not pay again.", retryAt: 0 });
    } finally {
      busy = false;
      emit({ busy: false });
    }
  }
  return { snapshot, checkReady, pay, check };
}
export {
  RESOURCE,
  TEST,
  createX402Test,
  typedAuthorization,
  validateChallenge
};
