/* wallet-connect.js: one connect sheet and one connected identity for the whole app (contract 1.2.4, 1.3.2). Written by Claude.
   - EVM browser wallets: EIP-6963 announcements, window.ethereum as the fallback.
   - Email/Google wallet and any phone wallet (WalletConnect): the live Privy bundle (/privy/entry.js, mountPrivy), the same
     loader qhooks.com uses (public/wallet-login.mjs). It only loads same-origin, so it works once this app is served from
     qhooks.com; on localhost the sheet says so and links to qhooks.com.
   - Solana: Wallet Standard wallets (Phantom first), as live public/qx-solana.mjs does.
   - Remembered in localStorage "qh-wallet" (kind, wallet name, address; never keys). QHLive.wallet()/connect() read this,
     so the top bar, Portfolio and the trade panel all show the same identity. Connecting never signs or sends anything. */
(function () {
  "use strict";
  var F = window.QHFmt, KEY = "qh-wallet", evm = {}, sol = [], cur = null, saved = null, subs = [], privy = null, privyP = null, pending = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }

  function emit() { subs.forEach(function (f) { try { f(cur); } catch (e) {} }); top(); paint(); }
  function set(c) {
    cur = c; saved = c ? { family: c.family, via: c.via, name: c.name, address: c.address } : null;
    try { if (saved) localStorage.setItem(KEY, JSON.stringify(saved)); else localStorage.removeItem(KEY); } catch (e) {}
    emit(); if (c && pending) { var p = pending; pending = null; close(); p(c.address); }
  }
  function address() { var c = cur || saved; return c && c.address ? c.address : null; }

  /* EVM browser wallets */
  window.addEventListener("eip6963:announceProvider", function (e) {
    var d = e.detail; if (!d || !d.info || !d.provider) return; evm[d.info.uuid] = d; paint(); restore();
  });
  function injected() {
    var list = Object.keys(evm).map(function (k) { return evm[k]; }), eth = window.ethereum;
    if (!list.length && eth && eth.request) list = [{ info: { uuid: "window", name: eth.isMetaMask ? "MetaMask" : "Browser wallet", rdns: "window" }, provider: eth }];
    return list;
  }
  function watchEvm(p, via) {
    if (!p.on || p.__qhw) return; p.__qhw = 1;
    p.on("accountsChanged", function (a) { if (!cur || cur.provider !== p) return; if (!a || !a[0]) set(null); else { cur.address = String(a[0]).toLowerCase(); set(cur); } });
  }
  function useEvm(d, silent) {
    return d.provider.request({ method: silent ? "eth_accounts" : "eth_requestAccounts" }).then(function (a) {
      if (!a || !a[0]) { if (silent) return null; throw new Error("The wallet did not share an account."); }
      watchEvm(d.provider); set({ family: "evm", via: "injected", name: d.info.name, rdns: d.info.rdns, address: String(a[0]).toLowerCase(), provider: d.provider });
      return cur.address;
    });
  }

  /* Solana wallets (Wallet Standard) */
  function usable(w) { return w && w.chains && w.chains.some(function (c) { return c.indexOf("solana:") === 0; }) && w.features && w.features["standard:connect"]; }
  function register() {
    var ws = Array.prototype.slice.call(arguments);
    ws.forEach(function (w) { if (usable(w) && sol.indexOf(w) < 0) sol.push(w); });
    sol.sort(function (a, b) { return (b.name === "Phantom") - (a.name === "Phantom"); }); paint(); restore();
    return function () { sol = sol.filter(function (w) { return ws.indexOf(w) < 0; }); paint(); };
  }
  window.addEventListener("wallet-standard:register-wallet", function (e) { try { e.detail({ register: register }); } catch (x) {} });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register: register } })); } catch (x) {}
  function useSol(w, silent) {
    return w.features["standard:connect"].connect(silent ? { silent: true } : undefined).then(function (r) {
      var acct = r && r.accounts && r.accounts[0];
      if (!acct) { if (silent) return null; throw new Error("The wallet did not share an account."); }
      set({ family: "solana", via: "phantom", name: w.name, address: acct.address, wallet: w, account: acct }); return acct.address;
    });
  }
  function phantomLink() { return "https://phantom.app/ul/browse/" + encodeURIComponent(location.href) + "?ref=" + encodeURIComponent(location.origin); }

  /* Email/Google wallet and phone wallets through the live Privy bundle */
  function loadPrivy() {
    if (privyP) return privyP;
    privyP = import(window.QH_PRIVY_ENTRY || "/privy/entry.js").then(function (m) {
      return new Promise(function (res, rej) {
        var box = document.createElement("div"), done = false; box.id = "qhooks-privy-root"; document.body.appendChild(box);
        var t = setTimeout(function () { rej(new Error("Sign-in took too long. Try again.")); }, 30000);
        privy = { state: {}, want: null };
        privy.sdk = m.mountPrivy({ container: box, chainId: "4663",
          onState: function (s) { privy.state = s; if (s.ready && !done) { done = true; clearTimeout(t); res(privy); } },
          onWallet: function (w) { fromPrivy(w, "privy"); }, onPhone: function (w) { fromPrivy(w, "walletconnect"); },
          onError: function (msg) { say(msg + " (Privy)"); } });
      });
    }).catch(function (e) { privyP = null; throw e; });
    return privyP;
  }
  function fromPrivy(w, via) {
    if (!w) { if (cur && cur.via === via) setTimeout(function () { if (cur && cur.via === via && !cur.live) set(null); }, 1500); if (cur && cur.via === via) cur.live = false; return; }
    var want = privy && privy.want === via, again = cur && cur.via === via, known = saved && saved.via === via;
    if (!want && !again && !known) return;
    privy.want = null;
    set({ family: "evm", via: via, live: true, name: via === "privy" ? "QHooks wallet" : "Phone wallet", address: String(w.address).toLowerCase(), provider: w.provider, chainId: String(w.chainId || "").replace(/^eip155:/, "") });
  }
  function privyGo(via) {
    say("Loading secure sign-in");
    loadPrivy().then(function (p) {
      say(""); p.want = via; close(true);
      if (via === "walletconnect") return p.sdk.connectPhone();
      if (!p.state.authenticated) return p.sdk.login(["email", "google"]);
      if (!p.state.hasWallet) return p.sdk.create();
    }).catch(function (e) {
      var local = !/qhooks\.com$/.test(location.hostname);
      say(local ? "Email and phone-wallet sign-in run on qhooks.com. They switch on here when this app is served from qhooks.com." : (e && e.message) || "Sign-in could not open. Try again.", local);
      open();
    });
  }

  /* Remembered connection: silent reconnect, never a popup */
  var tried = {};
  function restore() {
    if (cur || !saved) return;
    if (saved.via === "injected") injected().forEach(function (d) { if (!tried[d.info.uuid] && d.info.name === saved.name) { tried[d.info.uuid] = 1; useEvm(d, true).catch(function () {}); } });
    if (saved.via === "phantom") sol.forEach(function (w) { if (!tried[w.name] && w.name === saved.name) { tried[w.name] = 1; useSol(w, true).catch(function () {}); } });
    if ((saved.via === "privy" || saved.via === "walletconnect") && !tried.privy) { tried.privy = 1; loadPrivy().catch(function () {}); }
  }

  /* The sheet */
  var root = null;
  function say(text, local) {
    var m = root && root.querySelector(".wc-msg"); if (!m) return;
    m.innerHTML = F.esc(text || "") + (local ? ' <a href="https://qhooks.com/terminal" target="_blank" rel="noopener">Open qhooks.com</a>' : "");
  }
  function opt(k, id, title, sub, icon) {
    return '<button type="button" class="wc-opt" data-k="' + k + '"' + (id ? ' data-id="' + F.esc(id) + '"' : "") + ">" +
      (icon ? '<img src="' + F.esc(icon) + '" alt="" width="24" height="24">' : '<i class="wc-dot"></i>') + "<span><b>" + F.esc(title) + "</b>" + (sub ? "<em>" + F.esc(sub) + "</em>" : "") + "</span></button>";
  }
  function paint() {
    if (!root) return;
    var h = "", c = cur, inj = injected();
    if (c) h += '<div class="wc-me"><div><b>' + F.esc(F.short(c.address)) + "</b><em>" + F.esc(c.name) + " · " + (c.family === "solana" ? "Solana" : "EVM chains") + '</em></div><button type="button" class="wc-sec" data-k="out">Disconnect</button></div>' +
      '<div class="wc-row"><a class="wc-sec" href="#/portfolio" data-k="go">Portfolio</a><button type="button" class="wc-sec" data-k="oc">One-click trading</button></div><div class="wc-lab">Switch wallet</div>';
    h += opt("privy", "", "Email or Google", "Your QHooks wallet. One-click trading works with it.");
    h += '<div class="wc-lab">Browser wallet</div>';
    h += inj.length ? inj.map(function (d) { return opt("inj", d.info.uuid, d.info.name, "Signs each trade in the wallet", d.info.icon); }).join("") : '<div class="wc-none">No browser wallet on this device.</div>';
    h += opt("wc", "", "Any phone wallet", "WalletConnect: pick your wallet app, or scan from desktop");
    h += '<div class="wc-lab">Solana</div>';
    h += sol.length ? sol.map(function (w) { return opt("sol", w.name, w.name, "Solana trades", w.icon); }).join("") : '<a class="wc-opt" href="' + F.esc(phantomLink()) + '" rel="noopener"><i class="wc-dot"></i><span><b>Open in Phantom</b><em>Phantom is not in this browser</em></span></a>';
    root.querySelector(".wc-body").innerHTML = h;
  }
  function open(family) {
    if (!root) {
      root = document.createElement("div"); root.className = "wc-scrim";
      root.innerHTML = '<div class="wc-sheet" role="dialog" aria-modal="true" aria-label="Connect"><div class="wc-head"><b>' + (cur ? "Account" : "Connect") + '</b><button type="button" class="wc-x" aria-label="Close">×</button></div>' +
        '<div class="wc-body"></div><div class="wc-msg" role="status" aria-live="polite"></div><div class="wc-foot">Connecting never moves funds. Every trade asks your wallet first unless you turn on one-click.</div></div>';
      root.addEventListener("click", onClick); document.body.appendChild(root);
    }
    root.hidden = false; root.dataset.family = family || ""; paint();
    return new Promise(function (res) { if (pending) pending(null); pending = res; });
  }
  function close(keep) { if (root) root.hidden = true; if (!keep && pending) { var p = pending; pending = null; p(null); } }
  function onClick(e) {
    if (e.target === root || e.target.closest(".wc-x")) { close(); return; }
    var b = e.target.closest("[data-k]"); if (!b) return;
    var k = b.dataset.k, id = b.dataset.id;
    if (k === "go") { close(); return; }
    if (k === "out") { disconnect(); return; }
    if (k === "oc") { close(); if (window.QHOneClick) window.QHOneClick.open(); return; }
    if (k === "privy" || k === "wc") { privyGo(k === "wc" ? "walletconnect" : "privy"); return; }
    say("Approve in your wallet");
    var job = k === "inj" ? useEvm(injected().filter(function (d) { return d.info.uuid === id; })[0], false)
      : useSol(sol.filter(function (w) { return w.name === id; })[0], false);
    job.then(function () { say(""); }).catch(function (err) { say(/reject|denied|cancel/i.test(String(err && err.message)) || (err && err.code === 4001) ? "Cancelled in your wallet." : String((err && err.message) || err).slice(0, 160)); });
  }
  function disconnect() {
    var c = cur;
    if (c && c.via === "phantom" && c.wallet.features["standard:disconnect"]) { try { c.wallet.features["standard:disconnect"].disconnect(); } catch (e) {} }
    if (c && (c.via === "privy" || c.via === "walletconnect") && privy && privy.sdk && c.via === "privy") { try { privy.sdk.logout(); } catch (e) {} }
    set(null);
  }
  /* Resolves with the connected identity for that chain family, opening the sheet if needed (null if they close it). */
  function ensure(family) {
    var ok = function () { return cur && (cur.provider || cur.wallet) && (!family || cur.family === family); };
    if (ok()) return Promise.resolve(cur);
    return open(family).then(function () { return ok() ? cur : null; });
  }

  function top() {
    var b = document.querySelector(".q-connect-btn"); if (!b || !window.QHAccount) return;
    window.QHAccount.fillTop(document.querySelector(".q-earned"), document.querySelector(".q-balance"), b);
    b.classList.toggle("wc-on", !!address()); b.title = address() ? "Account" : "Connect a wallet";
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".q-connect-btn")) return;
    e.preventDefault(); e.stopImmediatePropagation(); open();
  }, true);

  if (window.QHLive) {
    window.QHLive.wallet = function () { var a = address(); if (a) return a; try { return localStorage.getItem("qh-watch") || null; } catch (e) { return null; } };
    window.QHLive.connect = function () { return cur ? Promise.resolve(cur.address) : open(); };
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  setTimeout(restore, 400);

  var css = document.createElement("style");
  css.textContent = ".wc-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:90;display:flex;align-items:center;justify-content:center}.wc-scrim[hidden]{display:none}" +
    ".wc-sheet{width:400px;max-width:100%;max-height:88vh;overflow:auto;background:var(--s1);border:1px solid var(--line);border-radius:10px;padding:14px 16px 16px;box-sizing:border-box}" +
    ".wc-head{display:flex;align-items:center;justify-content:space-between;font-size:15px}.wc-x{width:44px;height:44px;border:0;background:none;color:var(--mut);font-size:22px;cursor:pointer}" +
    ".wc-opt{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:8px 10px;margin:6px 0 0;background:var(--s2);border:1px solid var(--line);border-radius:8px;color:var(--tx);text-align:left;cursor:pointer;text-decoration:none;box-sizing:border-box}" +
    ".wc-opt:hover{border-color:var(--acc)}.wc-opt span{display:flex;flex-direction:column;min-width:0}.wc-opt b{font-size:14px}.wc-opt em,.wc-me em{font-style:normal;font-size:12px;color:var(--mut)}" +
    ".wc-dot{width:24px;height:24px;border-radius:6px;background:var(--line);flex:0 0 auto}.wc-lab{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 0}" +
    ".wc-none{font-size:12px;color:var(--mut);padding:8px 0 0}.wc-msg{font-size:12px;color:var(--acc);min-height:16px;margin-top:10px;overflow-wrap:anywhere}.wc-msg a{color:var(--tx)}" +
    ".wc-foot{font-size:11px;color:var(--mut);margin-top:8px}.wc-me{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;background:var(--s2);border-radius:8px;margin-top:6px}" +
    ".wc-me div{display:flex;flex-direction:column}.wc-row{display:flex;gap:8px;margin-top:8px}.wc-sec{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:6px;font-size:13px;cursor:pointer;text-decoration:none;flex:1}" +
    ".q-connect-btn.wc-on{font-variant-numeric:tabular-nums}" +
    "@media (max-width:767px){.wc-scrim{align-items:flex-end}.wc-sheet{border-radius:12px 12px 0 0;max-height:92vh}}";
  document.head.appendChild(css);

  window.QHWallet = { open: open, close: close, ensure: ensure, disconnect: disconnect, address: address,
    current: function () { return cur; }, on: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; } };
})();
