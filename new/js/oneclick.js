/* oneclick.js: opt-in one-click trading (contract 1.2.4, 1.3.3; Randall approved the Privy one-click signer 2026-11-19). Written by Claude.
   Same server and Privy pieces as live public/qx-oneclick.mjs:
   - GET/POST /api/oneclick (status, on/off, limits) and POST /api/oneclick/trade, authorised by the QHooks session
     (localStorage "qhooks:board-session:v1", made by one free sign-in signature, shared with qhooks.com).
   - Turning on = Privy's own "add signer" consent (qhooksPrivySignerControls.addSigner, from the Privy bundle), for the
     QHooks email/Google wallet only. Server switch: QHOOKS_TG_SIGNER=on plus the Privy secrets (on in prod 2026-11-20).
   - Limits: per trade and per day in USD, stored server-side; revoke is one tap (server off + Privy removeSigner).
   window.QH_ONECLICK = false hides it all. Nothing here holds a key or signs. */
(function () {
  "use strict";
  var F = window.QHFmt, SKEY = "qhooks:board-session:v1", memo = { w: null, at: 0, v: null }, root = null;
  var CAP_TRADE = 50, CAP_DAY = 250;
  function off() { return window.QH_ONECLICK === false; }
  function me() { return window.QHWallet && window.QHWallet.current(); }
  function session() {
    var c = me(); if (!c) return null;
    try { var s = JSON.parse(localStorage.getItem(SKEY) || "null"); if (s && s.expiresAt > Date.now() && s.wallet === c.address) return s; } catch (e) {}
    return null;
  }
  function call(path, method, body) {
    var s = session(), c = me(), h = { accept: "application/json" };
    if (s) h.authorization = "Bearer " + s.token;
    if (body) h["content-type"] = "application/json";
    var q = method === "GET" && c ? "?wallet=" + c.address : "";
    return fetch(window.QH_API + path + q, { method: method, headers: h, cache: "no-store", body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b || {} }; });
    }).catch(function () { return { ok: false, status: 0, body: { error: "refreshing" } }; });
  }
  function controls() {
    var c = window.qhooksPrivySignerControls, cur = me(); if (!c || !cur) return null;
    var w = typeof c.wallet === "function" ? c.wallet() : c.wallet;
    return w && w.walletClientType === "privy" && String(w.address).toLowerCase() === cur.address && typeof c.addSigner === "function" ? { c: c, w: w } : null;
  }
  /* {available, on, embedded, perTradeUsd, dailyUsd, usedTodayUsd, needsSignIn, why} */
  function status(fresh) {
    var c = me();
    if (off()) return Promise.resolve({ available: false, why: "off" });
    if (!c || c.family !== "evm") return Promise.resolve({ available: true, on: false, why: "connect" });
    if (c.via !== "privy") return Promise.resolve({ available: true, on: false, why: "wallet" });
    if (!fresh && memo.w === c.address && Date.now() - memo.at < 30000) return Promise.resolve(memo.v);
    if (!session()) { memo = { w: c.address, at: Date.now(), v: { available: true, on: false, needsSignIn: true, embedded: !!controls() } }; return Promise.resolve(memo.v); }
    return call("/api/oneclick", "GET").then(function (r) {
      var v = r.ok ? r.body : { available: r.status !== 404 && r.status !== 405, on: false, needsSignIn: r.body.error === "sign_in", why: r.ok ? "" : r.body.error || "refreshing" };
      v.embedded = !!controls(); memo = { w: c.address, at: Date.now(), v: v }; return v;
    });
  }
  function isOn() { var v = memo.v, c = me(); return !!(v && c && memo.w === c.address && v.on && !v.paused && v.embedded); }
  /* One free sign-in signature (EIP-191), the same session flow as live qx-board-session.mjs. */
  function signIn() {
    var c = me();
    return call("/api/community/session/message", "POST", { wallet: c.address }).then(function (r) {
      if (!r.ok || !r.body.message) throw new Error("Sign-in message is unavailable. Try again.");
      var msg = r.body.message, hex = "0x" + Array.prototype.map.call(new TextEncoder().encode(msg), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      return c.provider.request({ method: "personal_sign", params: [hex, c.address] }).then(function (sig) { return call("/api/community/session", "POST", { message: msg, signature: sig }); });
    }).then(function (r) {
      var s = r.body; if (!r.ok || s.wallet !== c.address || !s.token) throw new Error("The sign-in did not match this wallet. Try again.");
      try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {}
    });
  }
  function limits(p, d) { return { perTradeUsd: Math.min(CAP_TRADE, Math.max(1, Math.round(p) || CAP_TRADE)), dailyUsd: Math.min(CAP_DAY, Math.max(1, Math.round(d) || CAP_DAY)) }; }
  function enable(p, d) {
    var k = controls(); if (!k) return Promise.reject(new Error("One-click works with your QHooks email or Google wallet."));
    var lim = limits(p, d); if (lim.dailyUsd < lim.perTradeUsd) lim.dailyUsd = lim.perTradeUsd;
    return (session() ? Promise.resolve() : signIn()).then(function () { return call("/api/oneclick", "GET"); }).then(function (r) {
      if (!r.ok || !r.body.available) throw new Error("One-click is not available right now. Your wallet signs each trade.");
      return Promise.resolve(k.c.addSigner(r.body.policyId, r.body.signerId)).catch(function (e) {
        throw new Error(e && (e.code === 4001 || /reject|cancel/i.test(e.message || "")) ? "Cancelled. Nothing changed." : "Could not turn on one-click. Try again.");
      });
    }).then(function () { return call("/api/oneclick", "POST", { action: "on", walletId: k.w.id, perTradeUsd: lim.perTradeUsd, dailyUsd: lim.dailyUsd }); })
      .then(function (r) { if (!r.ok) throw new Error(r.body.error === "signer_missing" ? "The wallet permission did not save. Try again." : "Could not turn on one-click. Try again."); memo.at = 0; return status(true); });
  }
  function disable() {
    return call("/api/oneclick", "POST", { action: "off" }).then(function (r) {
      var k = controls(); if (k && k.c.removeSigner) { try { k.c.removeSigner(); } catch (e) {} }
      if (!r.ok) throw new Error("Could not turn off. Try again."); memo.at = 0; return status(true);
    });
  }
  function save(p, d) {
    var lim = limits(p, d); if (lim.dailyUsd < lim.perTradeUsd) return Promise.reject(new Error("The day limit must be at least one trade."));
    return call("/api/oneclick", "POST", { action: "limits", perTradeUsd: lim.perTradeUsd, dailyUsd: lim.dailyUsd }).then(function (r) { if (!r.ok) throw new Error("Could not save limits."); memo.at = 0; return status(true); });
  }
  var MSG = { over_trade_limit: "Over your one-click limit per trade. Lower the amount or raise your limit.", over_daily_limit: "Over your one-click limit for today.",
    insufficient_balance: "Not enough balance.", refreshing: "Refreshing prices. Try again in a moment.", no_route: "No route for this trade right now.",
    sell_check_failed: "This token failed the sell check, so one-click will not buy it.", not_permitted: "Turn one-click on again: the wallet permission is missing." };
  /* Resolves {hashes, explorer} or null when the wallet should sign instead. */
  function trade(o) {
    var key = "oc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    return call("/api/oneclick/trade", "POST", { chainId: String(o.chainId), token: o.token, side: o.side, amountWei: String(o.amountWei), slippageBps: o.slippageBps, idempotencyKey: key }).then(function (r) {
      if (r.ok) return r.body;
      var e = r.body.error; if (["use_wallet", "off", "sign_in", "link_wallet", "paused"].indexOf(e) >= 0 || r.status === 405) { memo.at = 0; return null; }
      throw new Error(MSG[e] || "One-click trade failed. Nothing was spent if no transaction is shown.");
    });
  }

  /* The sheet */
  function paint(v, note) {
    if (!root) return;
    var body = root.querySelector(".oc-body"), h = "";
    var lim = '<div class="oc-lim"><label>Per trade $<input type="number" inputmode="decimal" min="1" max="' + CAP_TRADE + '" class="oc-p" value="' + F.esc(v.perTradeUsd || CAP_TRADE) + '"></label>' +
      '<label>Per day $<input type="number" inputmode="decimal" min="1" max="' + CAP_DAY + '" class="oc-d" value="' + F.esc(v.dailyUsd || CAP_DAY) + '"></label></div><div class="oc-cap">Most for now: $' + CAP_TRADE + " a trade, $" + CAP_DAY + " a day.</div>";
    if (!v.available) h = "<p>One-click is not available right now. Your wallet signs each trade.</p>";
    else if (v.why === "connect" || v.why === "wallet") h = "<p>" + (v.why === "connect" ? "Connect first. " : "Your " + F.esc(me().name) + " signs each trade. ") + "One-click works with your QHooks email or Google wallet.</p>" +
      '<button type="button" class="oc-go" data-a="wallet">Use email or Google</button>';
    else if (v.on) h = '<div class="oc-state">On · $' + F.esc(v.perTradeUsd) + " per trade · $" + F.esc(v.dailyUsd) + " per day" + (F.ok(v.usedTodayUsd) ? " · $" + F.num(v.usedTodayUsd) + " used today" : "") + "</div>" +
      lim + '<div class="oc-row"><button type="button" class="oc-sec" data-a="save">Save limits</button><button type="button" class="oc-off" data-a="off">Turn off</button></div>';
    else h = lim + '<button type="button" class="oc-go" data-a="on">Turn on one-click</button>' + (v.embedded ? "" : '<div class="oc-cap">Your QHooks wallet is still opening; this works once it is ready.</div>');
    body.innerHTML = h; root.querySelector(".oc-msg").textContent = note || "";
  }
  function open() {
    if (off()) return;
    if (!root) {
      root = document.createElement("div"); root.className = "wc-scrim oc-scrim";
      root.innerHTML = '<div class="wc-sheet" role="dialog" aria-modal="true" aria-label="One-click trading"><div class="wc-head"><b>One-click trading</b><button type="button" class="wc-x" aria-label="Close">×</button></div>' +
        '<p class="oc-what">Buy and sell with one tap, no wallet popup. QHooks can place swaps from your QHooks wallet, back to that same wallet, only up to your limits. It cannot send your funds anywhere else. Turn it off here any time.</p>' +
        '<div class="oc-body"></div><div class="wc-msg oc-msg" role="status" aria-live="polite"></div></div>';
      root.addEventListener("click", onClick); document.body.appendChild(root);
    }
    root.hidden = false; paint({ available: true, why: "" }, "Reading your setting");
    status(true).then(function (v) { paint(v); });
  }
  function onClick(e) {
    if (e.target === root || e.target.closest(".wc-x")) { root.hidden = true; return; }
    var b = e.target.closest("[data-a]"); if (!b) return;
    var a = b.dataset.a, p = root.querySelector(".oc-p"), d = root.querySelector(".oc-d"), msg = root.querySelector(".oc-msg");
    if (a === "wallet") { root.hidden = true; window.QHWallet.open("evm"); return; }
    b.disabled = true; msg.textContent = a === "on" ? "Confirm in the QHooks wallet window" : a === "off" ? "Turning off" : "Saving";
    var job = a === "on" ? enable(p.value, d.value) : a === "off" ? disable() : save(p.value, d.value);
    job.then(function (v) { paint(v, a === "off" ? "Off. Your wallet signs each trade again." : a === "on" ? "On. Buy is one tap now." : "Saved."); emit(); })
      .catch(function (err) { b.disabled = false; msg.textContent = (err && err.message) || "Did not save. Try again."; });
  }
  function emit() { try { window.dispatchEvent(new CustomEvent("qh-oneclick")); } catch (e) {} }
  if (window.QHWallet) window.QHWallet.on(function () { memo.at = 0; status(true).then(emit); });
  window.addEventListener("qhooks:privy-signer-ready", function () { memo.at = 0; status(true).then(emit); });

  var css = document.createElement("style");
  css.textContent = ".oc-what{font-size:13px;color:var(--mut);margin:4px 0 10px;line-height:1.45}.oc-lim{display:flex;gap:10px;flex-wrap:wrap}.oc-lim label{display:flex;align-items:center;gap:6px;font-size:13px;flex:1;min-width:140px}" +
    ".oc-lim input{flex:1;min-width:0;height:44px;background:var(--s2);border:1px solid var(--line);border-radius:6px;color:var(--tx);padding:0 10px;font-size:14px}" +
    ".oc-cap{font-size:11px;color:var(--mut);margin:6px 0 10px}.oc-go{width:100%;min-height:48px;border:0;border-radius:8px;background:var(--up);color:#04140c;font-weight:600;font-size:15px;cursor:pointer}" +
    ".oc-row{display:flex;gap:8px}.oc-sec,.oc-off{flex:1;min-height:44px;border-radius:6px;border:1px solid var(--line);background:var(--s2);color:var(--tx);cursor:pointer;font-size:13px}.oc-off{color:var(--dn);border-color:rgba(255,77,94,.4)}" +
    ".oc-state{font-size:13px;color:var(--up);margin-bottom:10px}.oc-body p{font-size:13px;margin:0 0 10px}";
  document.head.appendChild(css);

  window.QHOneClick = { open: open, status: status, isOn: isOn, trade: trade, enable: enable, disable: disable, setLimits: save, off: off };
})();
