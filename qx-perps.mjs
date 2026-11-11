import { getWalletHub } from "/wallet-hub.mjs";
import { canTrade, marketsFrom, positionsFrom, buildEntry, buildCloseAll, buildPositionTpsl, estimatedLiquidation, RISK } from "./qx-perps-core.mjs";
import { createPerpsWallet } from "./qx-perps-wallet.mjs";
import { info, account, liveFeed } from "./qx-perps-data.mjs";
import { el, usd, num, pct, short, createConfirmation, detailList } from "./qx-perps-ui.mjs";
import { createPerpsChart, feedStatus } from "./qx-perps-chart.mjs";
import { loadPerpsConfig } from "./qx-perps-config.mjs";
const $ = (id) => document.getElementById(id), hub = getWalletHub(window), wallet = createPerpsWallet({ hub }), confirm = createConfirmation();
let config = null, country = null, markets = [], selected = "BTC", tf = "1h", buy = true, positions = [], orders = [], accountOwner = null, accountSeq = 0, chartView = null, marketRequests = 0, socketStatus = "Refreshing", busy = false, dead = false, feed, accountLoading = false;
const owner = () => hub.snapshot().current?.owner || null, market = () => markets.find((m) => m.name === selected);
function note(text) {
  $("action-status").textContent = text;
}
function renderControls() {
  const connected = !!owner(), allowed = canTrade(country), m = market(), ready = !!(config && connected && wallet.ready(config)), hasAgent = !!wallet.hasAgent?.() || ready;
  $("region-message").hidden = allowed;
  $("ticket").hidden = !allowed;
  $("fast-trading").hidden = !allowed && !hasAgent;
  $("setup-agent").hidden = !allowed || ready;
  $("forget-agent").hidden = !hasAgent;
  $("deposit-form").hidden = !allowed;
  $("deposit-button").disabled = busy || !connected;
  $("setup-agent").disabled = busy || !connected || !config;
  $("forget-agent").disabled = busy || !connected;
  $("withdraw-button").disabled = busy || !connected;
  $("close-all").disabled = busy || !connected || !config || !positions.length || accountOwner !== owner();
  $("builder-fee").hidden = !config?.builder;
  $("review-order").disabled = busy || !m || !config || !connected || !hasAgent || !allowed;
  $("setup-status").textContent = ready ? "Fast trading is on for " + short(owner()) + "." : config?.builder ? "Setup asks for two wallet signatures: a trading agent and a 0.1% builder fee cap." : "Setup asks for one wallet signature to approve a trading agent.";
  $("refresh-account").disabled = busy || !connected;
  for (const button of document.querySelectorAll("[data-account-action]")) button.disabled = busy || accountOwner !== owner();
}
async function run(fn) {
  if (busy) return;
  confirm.setOpener(document.activeElement);
  busy = true;
  renderControls();
  try {
    await fn();
  } catch (e) {
    note(e?.message || "Please try again.");
  } finally {
    busy = false;
    renderControls();
    confirm.restoreFocus();
    confirm.setOpener(null);
  }
}
function renderMarkets() {
  const query = $("market-search").value.trim().toLowerCase(), box = $("markets");
  box.replaceChildren();
  for (const m of markets.filter((m2) => m2.name.toLowerCase().includes(query))) {
    const button = el("button", void 0, { type: "button", class: "qxp-market", "aria-pressed": m.name === selected, "data-market": m.name });
    button.append(el("b", m.name), el("span", usd(m.mid), { class: "qxp-market-price" }), el("small", m.maxLeverage + "\xD7 max"), el("span", pct(m.change), { class: "qxp-market-change " + (m.change >= 0 ? "up" : "down") }));
    const meta = el("span", void 0, { class: "qxp-market-meta" });
    meta.append(el("small", "Funding " + pct(m.funding * 100, 4)), el("small", "OI " + usd(m.openInterest * (m.mark || m.mid))));
    button.append(meta);
    button.addEventListener("click", () => select(m.name));
    box.append(button);
  }
  if (!box.childElementCount) box.append(el("p", markets.length ? "No matching markets." : "Refreshing", { class: "qxt-muted" }));
}
function renderPrice() {
  const m = market();
  if (!m) return;
  $("coin").textContent = m.name;
  $("price").textContent = usd(m.mid);
  $("change").textContent = pct(m.change);
  $("change").className = m.change >= 0 ? "up" : "down";
  $("funding").textContent = pct(m.funding * 100, 4);
  $("interest").textContent = usd(m.openInterest * (m.mark || m.mid));
  $("max-leverage").textContent = m.maxLeverage + "\xD7";
  $("mark").textContent = usd(m.mark);
  $("chart").setAttribute("aria-label", m.name + " " + tf + " price candles");
  estimates();
}
function estimates() {
  const m = market(), leverage = Number($("leverage").value), amount = Number($("amount").value), reference = $("order-kind").value === "limit" ? Number($("limit-price").value) : m?.mid, notional = amount * ($("size-unit").value === "coin" ? reference : 1);
  $("leverage-value").textContent = leverage + "\xD7";
  $("margin-estimate").textContent = notional > 0 ? usd(notional / leverage) : "\u2014";
  $("liq-estimate").textContent = m && $("margin-mode").value === "isolated" && !$("reduce-only").checked ? usd(estimatedLiquidation({ mid: reference, buy, leverage, maxLeverage: m.maxLeverage })) : "\u2014";
  $("review-order").textContent = "Review " + (buy ? "Long" : "Short");
}
function select(coin) {
  if (coin === selected && chartView) return;
  confirm.cancel();
  selected = coin;
  const m = market();
  if (m) {
    $("leverage").max = m.maxLeverage;
    $("leverage").value = Math.min(Number($("leverage").value), m.maxLeverage);
    $("margin-mode").value = m.onlyIsolated ? "isolated" : $("margin-mode").value;
    $("margin-mode").options[0].disabled = !!m.onlyIsolated;
  }
  $("tp").value = "";
  $("sl").value = "";
  renderMarkets();
  renderPrice();
  renderControls();
  loadCandles();
}
function renderFeedStatus() {
  $("feed-status").textContent = feedStatus(marketRequests, socketStatus);
}
async function refreshMarkets() {
  marketRequests++;
  renderFeedStatus();
  try {
    const next = marketsFrom(await info({ type: "metaAndAssetCtxs" }));
    if (dead) return;
    markets = next.map((m2) => ({ ...m2, updatedAt: Date.now() }));
    if (!market()) selected = markets.find((m2) => m2.name === "BTC")?.name || markets[0]?.name || "BTC";
    const m = market();
    if (m) {
      $("leverage").max = m.maxLeverage;
      $("leverage").value = Math.min(Number($("leverage").value), m.maxLeverage);
      $("margin-mode").options[0].disabled = !!m.onlyIsolated;
      if (m.onlyIsolated) $("margin-mode").value = "isolated";
    }
    renderMarkets();
    renderPrice();
    renderControls();
    if (chartView && !chartView.lastBar) loadCandles();
  } catch {
    if (!markets.length) $("markets").replaceChildren(el("p", "Could not load markets. Retry shortly.", { class: "qxt-muted" }));
  } finally {
    marketRequests--;
    renderFeedStatus();
  }
}
async function loadChart() {
  try {
    const lib = await import("./vendor/lightweight-charts/lightweight-charts.standalone.production.mjs");
    if (dead) return;
    chartView = createPerpsChart({ lib, container: $("chart"), color, onStatus: text => { $("chart-status").textContent = text; } });
    new MutationObserver(() => {
      if (chartView) {
        chartView.chart.applyOptions({ layout: { textColor: color("--qx-muted") }, grid: { horzLines: { color: color("--qxt-grid") } } });
        chartView.series.applyOptions({ upColor: color("--qxt-up"), downColor: color("--qxt-down"), wickUpColor: color("--qxt-up"), wickDownColor: color("--qxt-down") });
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    loadCandles();
  } catch {
    $("chart-status").textContent = "Could not load chart. Reload to try again.";
  }
}
function color(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}
async function loadCandles({ reset = true } = {}) {
  if (!chartView || dead) return;
  feed?.select(selected, tf);
  await chartView.load(selected, tf, { reset });
}
function clearAccount() {
  accountSeq++;
  positions = [];
  orders = [];
  accountOwner = null;
  $("equity").textContent = "\u2014";
  $("withdrawable").textContent = "\u2014";
  renderAccount();
}
async function refreshAccount() {
  const address = owner(), seq = ++accountSeq;
  if (!address) {
    clearAccount();
    return;
  }
  $("account-status").textContent = "Refreshing";
  accountLoading = true;
  try {
    const result = await account(address);
    if (dead || seq !== accountSeq || address !== owner()) return;
    positions = positionsFrom(result.state);
    orders = result.orders;
    accountOwner = address;
    $("equity").textContent = usd(result.state.marginSummary.accountValue);
    $("withdrawable").textContent = usd(result.state.withdrawable);
    $("withdraw-amount").max = result.state.withdrawable;
    $("account-status").textContent = short(address);
    renderAccount();
  } catch {
    if (address === owner() && seq === accountSeq) {
      accountOwner = null;
      positions = [];
      orders = [];
      $("equity").textContent = "\u2014";
      $("withdrawable").textContent = "\u2014";
      renderAccount();
      $("account-status").textContent = "Refreshing";
    }
  } finally {
    accountLoading = false;
    renderControls();
  }
}
function accountButton(label, handler) {
  const b = el("button", label, { type: "button", "data-account-action": "" });
  b.addEventListener("click", () => run(handler));
  return b;
}
function renderAccount() {
  $("positions").replaceChildren();
  $("orders").replaceChildren();
  $("position-count").textContent = positions.length;
  $("order-count").textContent = orders.length;
  for (const p of positions) {
    const row = el("article", void 0, { class: "qxp-position" }), long = Number(p.szi) > 0, title = el("div", void 0, { class: "qxp-row-title" }), pnl = el("span", usd(p.unrealizedPnl) + " (" + pct(Number(p.returnOnEquity) * 100) + ")", { class: Number(p.unrealizedPnl) >= 0 ? "up" : "down" }), m = markets.find((m2) => m2.name === p.coin);
    title.append(el("b", p.coin + " \xB7 " + (long ? "Long" : "Short")), pnl);
    row.append(title, detailList([["Size", num(Math.abs(Number(p.szi)))], ["Entry", usd(p.entryPx)], ["Mark", usd(m?.mark || m?.mid)], ["Liq price", usd(p.liquidationPx)], ["Margin", usd(p.marginUsed)], ["Leverage", (p.leverage?.value || "\u2014") + "\xD7 " + (p.leverage?.type || "")]]));
    const actions = el("div", void 0, { class: "qxp-row-actions" });
    actions.append(accountButton("Close", () => closePositions([p])), accountButton("Set TP/SL", () => setTpsl(p)));
    row.append(actions);
    $("positions").append(row);
  }
  for (const o of orders) {
    const row = el("article", void 0, { class: "qxp-order" });
    row.append(el("b", o.coin + " \xB7 " + (o.side === "B" ? "Buy" : "Sell") + " \xB7 " + (o.orderType || "Limit")), detailList([["Size", num(o.sz)], ["Limit", usd(o.limitPx)], ["Trigger", usd(o.triggerPx)], ["Reduce only", o.reduceOnly ? "Yes" : "No"]]), accountButton("Cancel order", () => cancelOrder(o)));
    $("orders").append(row);
  }
  if (!positions.length) $("positions").append(el("p", "No open positions.", { class: "qxt-muted" }));
  if (!orders.length) $("orders").append(el("p", "No open orders.", { class: "qxt-muted" }));
  if (!owner()) $("account-status").textContent = "Connect your wallet to see positions.";
  renderControls();
}
async function freshMarkets(coins = [selected]) {
  const needsRefresh = () => coins.some((coin) => !markets.find((m) => m.name === coin) || Date.now() - (markets.find((m) => m.name === coin)?.updatedAt || 0) > 15e3);
  if (needsRefresh()) await refreshMarkets();
  if (needsRefresh()) throw Error("Refreshing prices. Try again shortly.");
}
function closingSetupNotice() {
  return wallet.hasAgent?.() || wallet.ready(config) ? "" : "\nApprove fast trading once to close.";
}
async function closePositions(rows) {
  const address = owner();
  if (accountOwner !== address) throw Error("Refresh your account first.");
  config = await loadPerpsConfig();
  await freshMarkets(rows.map((p) => p.coin));
  const action = buildCloseAll(rows, markets, config, Number($("slippage").value));
  const setupNotice = closingSetupNotice();
  const description = rows.map((p) => p.coin + ": close " + num(Math.abs(Number(p.szi))) + " " + (Number(p.szi) > 0 ? "Long" : "Short")).join("\n") + "\nReduce-only market orders. Slippage " + $("slippage").value + "%." + (config.builder ? " QHooks fee 0.1%." : "") + setupNotice;
  if (!await confirm.ask(rows.length > 1 ? "Close all positions?" : "Close position?", description)) return;
  if (owner() !== address) throw Error("Wallet changed. Review again.");
  note(setupNotice ? "Approve fast trading once to close." : "Sending closing orders\u2026");
  await wallet.order(action, { config, closing: true });
  note("Closing orders submitted. Refreshing positions.");
  await refreshAccount();
}
async function setTpsl(p) {
  const address = owner();
  if (accountOwner !== address) throw Error("Refresh your account first.");
  const m = markets.find((m2) => m2.name === p.coin);
  if (!m) throw Error("Refresh markets first.");
  const content = el("div");
  content.append(el("p", p.coin + " \xB7 reduce-only exits for your position."));
  const tp = el("input", void 0, { type: "number", step: "any", min: "0", inputmode: "decimal" }), sl = el("input", void 0, { type: "number", step: "any", min: "0", inputmode: "decimal" });
  for (const [title, input] of [["Take profit price", tp], ["Stop loss price", sl]]) {
    const label = el("label", title);
    label.append(input);
    content.append(label);
  }
  if (!await confirm.ask("Set TP/SL", content)) return;
  config = await loadPerpsConfig();
  const action = buildPositionTpsl(p, m, { tp: tp.value, sl: sl.value }, config);
  if (!await confirm.ask("Confirm position exits", action.orders.map((o) => o.t.trigger.tpsl.toUpperCase() + " " + o.t.trigger.triggerPx).join("\n") + "\nThese add exits. Cancel any older exits you no longer need." + (config.builder ? "\nQHooks fee 0.1%." : "") + closingSetupNotice())) return;
  if (owner() !== address) throw Error("Wallet changed. Review again.");
  await wallet.order(action, { config, closing: true });
  note("Position exits submitted.");
  await refreshAccount();
}
async function cancelOrder(o) {
  const address = owner(), m = markets.find((m2) => m2.name === o.coin);
  if (!m) throw Error("Refresh markets first.");
  if (!await confirm.ask("Cancel order?", o.coin + " \xB7 " + num(o.sz) + " at " + usd(o.limitPx) + closingSetupNotice())) return;
  if (owner() !== address || accountOwner !== address) throw Error("Wallet changed. Review again.");
  await wallet.cancel(m.asset, Number(o.oid));
  note("Order cancelled.");
  await refreshAccount();
}
$("market-search").addEventListener("input", renderMarkets);
for (const [id, value] of [["long", true], ["short", false]]) $(id).addEventListener("click", () => {
  buy = value;
  $("long").setAttribute("aria-pressed", buy);
  $("short").setAttribute("aria-pressed", !buy);
  estimates();
});
for (const id of ["amount", "size-unit", "limit-price", "leverage", "margin-mode", "reduce-only"]) $(id).addEventListener("input", estimates);
$("order-kind").addEventListener("change", () => {
  $("limit-label").hidden = $("order-kind").value !== "limit";
  $("limit-price").required = $("order-kind").value === "limit";
  estimates();
});
$("timeframes").addEventListener("click", (e) => {
  const button = e.target.closest("[data-tf]");
  if (!button) return;
  tf = button.dataset.tf;
  for (const b of $("timeframes").children) b.setAttribute("aria-pressed", b === button);
  loadCandles();
});
$("order-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    if (!canTrade(country)) throw Error("Perps trading isn't available in your region.");
    const address = owner();
    config = await loadPerpsConfig();
    await freshMarkets();
    const m = market(), leverage = { asset: m.asset, isCross: $("margin-mode").value === "cross", leverage: Number($("leverage").value) }, action = buildEntry({ market: m, buy, kind: $("order-kind").value, amount: $("amount").value, unit: $("size-unit").value, limit: $("limit-price").value, slippage: $("slippage").value, tp: $("tp").value, sl: $("sl").value, reduceOnly: $("reduce-only").checked }, config);
    const entry = action.orders[0];
    if (!await confirm.ask("Review " + (buy ? "Long" : "Short") + " " + m.name, (entry.r ? "Reduce only \xB7 " : "") + entry.s + " " + m.name + " \xB7 " + $("order-kind").value + "\nLimit / price bound " + entry.p + " USDC\n" + leverage.leverage + "\xD7 " + (leverage.isCross ? "Cross" : "Isolated") + (config.builder ? "\nQHooks fee 0.1%" : "") + "\n" + action.orders.slice(1).map((o) => o.t.trigger.tpsl.toUpperCase() + " " + o.t.trigger.triggerPx).join("\n") + "\n" + RISK)) return;
    if (owner() !== address || !canTrade(country)) throw Error("Wallet or region changed. Review again.");
    if (!wallet.ready(config)) await wallet.setup(config);
    if (owner() !== address || !canTrade(country)) throw Error("Wallet or region changed. Review again.");
    await wallet.order(action, { config, leverage });
    note("Order submitted. Refreshing your account.");
    await refreshAccount();
  });
});
$("setup-agent").addEventListener("click", () => run(async () => {
  if (!canTrade(country)) return;
  config = await loadPerpsConfig();
  if (!await confirm.ask("Turn on fast trading?", "Approve QHooks as a trading agent. The key stays in this browser. Agent keys cannot withdraw." + (config.builder ? "\nAlso approve a 0.1% builder fee cap with your wallet." : ""))) return;
  await wallet.setup(config);
  note("Fast trading is on.");
}));
$("forget-agent").addEventListener("click", () => run(async () => {
  wallet.turnOff();
  note("Local trading key removed. You can also remove QHooks in Hyperliquid\u2019s API wallet settings.");
}));
$("deposit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    if (!canTrade(country)) return;
    const address = owner(), amount = $("deposit-amount").value;
    if (!await confirm.ask("Deposit from Arbitrum?", amount + " USDC to your Hyperliquid perps account. Your wallet will switch to Arbitrum. Gas is paid in ETH.")) return;
    if (owner() !== address) throw Error("Wallet changed. Review again.");
    const hash = await wallet.deposit(amount);
    note("Deposit submitted: " + hash + ". Refresh equity after it arrives.");
  });
});
$("withdraw-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    const address = owner(), amount = $("withdraw-amount").value;
    if (!await confirm.ask("Withdraw to your wallet?", amount + " USDC including the 1 USDC fee.\nDestination: " + address + " on Arbitrum.")) return;
    if (owner() !== address) throw Error("Wallet changed. Review again.");
    await wallet.withdraw(amount);
    note("Withdrawal submitted.");
    await refreshAccount();
  });
});
$("refresh-account").addEventListener("click", () => run(refreshAccount));
$("close-all").addEventListener("click", () => run(() => closePositions(positions)));
let lastOwner = null;
hub.subscribe(() => {
  const address = owner();
  if (lastOwner !== address) {
    lastOwner = address;
    confirm.cancel();
    clearAccount();
    refreshAccount();
  }
  renderControls();
});
(async () => {
  config = await loadPerpsConfig();
  renderControls();
})();
(async () => {
  try {
    const r = await fetch("/api/geo", { cache: "no-store", signal: AbortSignal.timeout(8e3) });
    country = r.ok ? (await r.json()).country : null;
  } catch {
    country = null;
  }
  renderControls();
})();
feed = liveFeed({ onMids(mids) {
  let touched = false;
  for (const m of markets) {
    const mid = Number(mids[m.name]);
    if (mid > 0) {
      const prev = m.mid / (1 + (m.change || 0) / 100);
      m.mid = mid;
      m.updatedAt = Date.now();
      if (prev > 0) m.change = (mid / prev - 1) * 100;
      touched = true;
    }
  }
  if (touched) {
    renderPrice();
    for (const b of $("markets").children) {
      const m = markets.find((x) => x.name === b.dataset.market);
      if (m) {
        b.querySelector(".qxp-market-price").textContent = usd(m.mid);
        const change = b.querySelector(".qxp-market-change");
        change.textContent = pct(m.change);
        change.className = "qxp-market-change " + (m.change >= 0 ? "up" : "down");
      }
    }
  }
}, onCandle(bar) {
  chartView?.update(bar);
}, onStatus(text) {
  socketStatus = text;
  renderFeedStatus();
} });
refreshMarkets();
loadChart();
const timers = [setInterval(refreshMarkets, 6e4), setInterval(() => {
  if (!feed.isLive()) {
    refreshMarkets();
    loadCandles({ reset: false });
  }
}, 15e3), setInterval(() => {
  if (owner() && !busy && !accountLoading) refreshAccount();
}, 15e3)];
if (matchMedia("(max-width:620px)").matches) $("markets-disclosure").open = false;
addEventListener("pagehide", () => {
  dead = true;
  for (const timer of timers) clearInterval(timer);
  feed.dispose();
  chartView?.dispose();
  confirm.cancel();
}, { once: true });
addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
