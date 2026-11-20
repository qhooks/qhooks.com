/* wallet-sign.js: in-page signing and trade feedback (contract 1.2.7, 1.3.3). Written by Claude.
   - evm(): sends unsigned transactions (from prepare-trade / a launch route) to the visitor's own wallet in order
     (approval first, then the swap), waits for each receipt and stops on the first failure. Nothing is signed here.
   - sol(): Phantom/Wallet Standard. signAndSendTransaction first (Phantom adds priority-fee instructions, so a
     sign-then-send check can refuse silently); then reconcile through /api/sol-launch/rpc getSignatureStatuses.
     Wallets without sign-and-send sign, then POST /api/terminal/sol/execute, as the live terminal does.
   - toast(): the feedback stack (submitted, confirmed with tx link, failed with the exact reason and Retry). */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;
  var HEX = { "4663": "0x1237", "8453": "0x2105", "1": "0x1", "42161": "0xa4b1", "56": "0x38", "99901": "0x1863d", "143": "0x8f" };
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hexv(v) { return "0x" + BigInt(v || 0).toString(16); }
  function kind(tx) { return String(tx.data || "").slice(0, 10) === "0x095ea7b3" ? "approve" : (tx.kind || "swap"); }
  /* The wallet's own words, cleaned up only where they are a code; cancellations say nothing was sent. */
  function reason(err) {
    var e = err || {}, m = String(e.shortMessage || (e.data && e.data.message) || e.message || e || "");
    if (e.code === 4001 || /user (rejected|denied)|rejected the request|request rejected|cancel/i.test(m)) return "Cancelled in your wallet. Nothing was sent.";
    if (e.code === 4902 || /unrecognized chain|unknown chain/i.test(m)) return "Add this network to your wallet, then retry.";
    if (/insufficient funds/i.test(m)) return "Not enough balance for this trade plus gas.";
    return m.replace(/^Error:\s*/, "").slice(0, 180) || "The wallet did not answer.";
  }
  function chainOk(p, chainId) {
    var want = HEX[String(chainId)]; if (!want) return Promise.resolve();
    return p.request({ method: "eth_chainId" }).then(function (c) {
      if (String(c).toLowerCase() === want) return null;
      return p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
    });
  }
  function receipt(p, hash) {
    var t0 = Date.now();
    function poll() {
      return p.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(function () { return null; }).then(function (r) {
        if (r && r.status) {
          if (String(r.status) === "0x1" || r.status === 1) return r;
          var e = new Error("Reverted on chain. Nothing was spent except gas."); e.hash = hash; throw e;
        }
        if (Date.now() - t0 > 180000) { var x = new Error("Still confirming after 3 minutes. Check the transaction link."); x.hash = hash; x.pending = true; throw x; }
        return wait(Date.now() - t0 < 10000 ? 700 : 2000).then(poll);
      });
    }
    return poll();
  }
  /* o: {provider, from, chainId, txs, on(state, info)}; states: switch, sign, sent, confirmed. Resolves {hashes, receipts}. */
  function evm(o) {
    var p = o.provider, on = o.on || function () {}, hashes = [], receipts = [], i = 0;
    on("switch", {});
    return chainOk(p, o.chainId).then(function next() {
      if (i >= o.txs.length) return { hashes: hashes, receipts: receipts };
      var x = o.txs[i++], k = kind(x), n = o.txs.length;
      on("sign", { i: i, n: n, kind: k });
      var tx = { from: o.from, to: x.to, data: x.data, value: hexv(x.value) };
      if (x.gas) tx.gas = hexv(x.gas);
      return p.request({ method: "eth_sendTransaction", params: [tx] }).then(function (h) {
        hashes.push(h); on("sent", { i: i, n: n, kind: k, hash: h });
        return receipt(p, h);
      }).then(function (r) { receipts.push(r); on("confirmed", { i: i, n: n, kind: k, hash: hashes[hashes.length - 1], receipt: r }); return next(); });
    });
  }

  /* Solana */
  function b58(bytes) {
    var n = 0n, s = "", z = 0; for (var i = 0; i < bytes.length; i++) n = n * 256n + BigInt(bytes[i]);
    while (n > 0n) { s = B58.charAt(Number(n % 58n)) + s; n = n / 58n; }
    while (z < bytes.length && bytes[z] === 0) { s = "1" + s; z++; } return s;
  }
  function fromB64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function toB64(b) { var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function has(c, f) { return !!(c.wallet.features[f] && (!c.account.features || c.account.features.indexOf(f) >= 0)); }
  function solOrder(o) {
    var q = "input=" + encodeURIComponent(o.input) + "&output=" + encodeURIComponent(o.output) + "&amount=" + o.amount + "&taker=" + encodeURIComponent(o.taker) + "&slippageBps=" + (o.slippageBps || 100);
    return window.QHApi.get("/api/terminal/sol/order?" + q, { timeout: 15000 });
  }
  /* Mint decimals: the balance route first, then the mint account through the read-only RPC route. null when unknown. */
  var decMemo = {};
  function solDecimals(owner, mint) {
    if (decMemo[mint] != null) return Promise.resolve(decMemo[mint]);
    return window.QHApi.get("/api/terminal/sol/balance/" + encodeURIComponent(owner) + "?mint=" + encodeURIComponent(mint)).then(function (r) {
      var d = r.ok && r.body ? r.body.decimals : null; if (Number.isInteger(d)) return d;
      return window.QHApi.post("/api/sol-launch/rpc", { jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed" }] }).then(function (x) {
        var v = x.ok && x.body && x.body.result && x.body.result.value, p = v && v.data && v.data.parsed && v.data.parsed.info;
        return p && Number.isInteger(p.decimals) ? p.decimals : null;
      });
    }).then(function (d) { if (d != null) decMemo[mint] = d; return d; });
  }
  function solStatus(sig) {
    var t0 = Date.now();
    function poll() {
      return window.QHApi.post("/api/sol-launch/rpc", { jsonrpc: "2.0", id: 1, method: "getSignatureStatuses", params: [[sig], { searchTransactionHistory: false }] }).then(function (r) {
        if (!r.ok) return { unknown: true };
        var v = r.body && r.body.result && r.body.result.value && r.body.result.value[0];
        if (v && v.err) { var e = new Error("Failed on Solana: " + JSON.stringify(v.err).slice(0, 120)); e.hash = sig; throw e; }
        if (v && (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized")) return { ok: true };
        if (Date.now() - t0 > 60000) return { unknown: true };
        return wait(800).then(poll);
      });
    }
    return poll();
  }
  /* o: {session: {wallet, account}, order: {transaction, requestId, lastValidBlockHeight}, on}. Resolves {signature, confirmed}. */
  function sol(o) {
    var c = o.session, on = o.on || function () {}, tx = fromB64(o.order.transaction);
    on("sign", { i: 1, n: 1, kind: "swap" });
    if (has(c, "solana:signAndSendTransaction")) {
      return c.wallet.features["solana:signAndSendTransaction"].signAndSendTransaction({ account: c.account, transaction: tx, chain: "solana:mainnet", options: { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 2 } }).then(function (out) {
        var r = out && out[0]; if (!r || !r.signature || r.signature.length !== 64) throw new Error("The wallet did not return a transaction signature.");
        var sig = b58(r.signature); on("sent", { hash: sig });
        return solStatus(sig).then(function (s) { if (s.ok) on("confirmed", { hash: sig }); return { signature: sig, confirmed: !!s.ok }; });
      });
    }
    if (!has(c, "solana:signTransaction")) return Promise.reject(new Error("This wallet cannot sign this transaction. Use Phantom."));
    return c.wallet.features["solana:signTransaction"].signTransaction({ account: c.account, transaction: tx, chain: "solana:mainnet" }).then(function (out) {
      var signed = out && out[0] && out[0].signedTransaction; if (!signed || !signed.length) throw new Error("The wallet did not sign.");
      on("sending", {});
      return window.QHApi.post("/api/terminal/sol/execute", { signedTransaction: toB64(signed), requestId: o.order.requestId, lastValidBlockHeight: o.order.lastValidBlockHeight });
    }).then(function (r) {
      var x = r.body || {};
      if (!r.ok || x.status !== "Success") throw new Error("The swap did not land" + (x.error ? ": " + x.error : r.status === 405 ? ": sending runs on qhooks.com" : "."));
      on("confirmed", { hash: x.signature }); return { signature: x.signature, confirmed: true };
    });
  }

  /* Feedback toasts: top on phone, bottom-right on desktop. t = toast({title}); t.set(state, {hash, chainId, text, retry}). */
  function stack() {
    var s = document.querySelector(".ws-toasts");
    if (!s) { s = document.createElement("div"); s.className = "ws-toasts"; s.setAttribute("aria-live", "polite"); document.body.appendChild(s); }
    return s;
  }
  function toast(o) {
    var el = document.createElement("div"); el.className = "ws-toast"; stack().appendChild(el);
    var api = { el: el, set: function (state, d) {
      d = d || {}; el.dataset.state = state;
      var link = d.hash ? N.txUrl(d.chainId || o.chainId, d.hash) : null;
      var line = state === "failed" ? F.esc(d.text || "Did not go through") : F.esc(d.text || state);
      el.innerHTML = '<div class="ws-t"><b>' + F.esc(o.title) + '</b><button type="button" class="ws-x" aria-label="Dismiss">×</button></div><div class="ws-s">' + line +
        (link ? ' · <a href="' + F.esc(link) + '" target="_blank" rel="noopener">View tx</a>' : "") + "</div>" + (d.retry ? '<button type="button" class="ws-retry">Retry</button>' : "");
      el.querySelector(".ws-x").onclick = function () { el.remove(); };
      if (d.retry) el.querySelector(".ws-retry").onclick = function () { el.remove(); d.retry(); };
      clearTimeout(el._t); if (state === "confirmed") el._t = setTimeout(function () { el.remove(); }, 9000);
    } };
    return api;
  }

  var css = document.createElement("style");
  css.textContent = ".ws-toasts{position:fixed;right:16px;bottom:44px;display:flex;flex-direction:column;gap:8px;z-index:85;width:340px;max-width:calc(100vw - 32px)}" +
    ".ws-toast{background:var(--s1);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--tx);box-shadow:0 6px 24px rgba(0,0,0,.35)}" +
    ".ws-toast[data-state=confirmed]{border-left-color:var(--up)}.ws-toast[data-state=failed]{border-left-color:var(--dn)}" +
    ".ws-t{display:flex;align-items:center;justify-content:space-between;gap:8px}.ws-s{color:var(--mut);overflow-wrap:anywhere}.ws-s a{color:var(--acc)}" +
    ".ws-x{width:44px;height:44px;margin:-10px -10px -10px 0;border:0;background:none;color:var(--mut);font-size:18px;cursor:pointer}" +
    ".ws-retry{margin-top:6px;min-height:44px;padding:0 14px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:6px;cursor:pointer}" +
    "@media (max-width:767px){.ws-toasts{top:8px;bottom:auto;left:16px;right:16px;width:auto;max-width:none}}";
  document.head.appendChild(css);

  window.QHSign = { evm: evm, receipt: receipt, sol: sol, solOrder: solOrder, solDecimals: solDecimals, toast: toast, reason: reason, HEX: HEX, b58: b58 };
})();
