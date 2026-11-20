// pulse-row.js – render a single token row for Pulse
// No dependencies other than data.js exports

window.PulseRow = (function () {
  "use strict";

  /* ── Helper functions ─────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatAge(seconds) {
    if (seconds < 60) return Math.floor(seconds) + "s";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h";
    return Math.floor(seconds / 86400) + "d";
  }

  function formatUSD(value) {
    if (window.QHFmt) return window.QHFmt.usd(value);
    if (!value && value !== 0) return "\u2014";
    if (value < 0.01) return "$" + value.toFixed(4);
    if (value < 1) return "$" + value.toFixed(3);
    if (value < 1000) return "$" + value.toFixed(2);
    if (value < 1e6) return "$" + (value/1e3).toFixed(value < 1e4 ? 2 : 1) + "K";
    if (value < 1e9) return "$" + (value/1e6).toFixed(value < 1e7 ? 2 : 1) + "M";
    return "$" + (value/1e9).toFixed(2) + "B";
  }

  // Compute 24h change from candles, return null if no data
  function get24hChange(candles) {
    if (!candles || candles.length < 2) return null;
    var last = candles[candles.length - 1];
    var prev = candles[candles.length - 2];
    if (!prev || prev === 0) return null;
    var change = prev ? ((last - prev) / prev) * 100 : null;
    if (change === null || !isFinite(change)) return null;
    return change;
  }

  function getChangeClass(change) {
    if (change === null) return "";
    return change >= 0 ? "pulse-change-up" : "pulse-change-down";
  }

  function getChangeSign(change) {
    if (change === null) return "";
    return change >= 0 ? "+" : "";
  }

  var CHAIN_TAG = { "4663": "RH", "8453": "BASE", "solana": "SOL", "56": "BNB", "1": "ETH", "42161": "ARB", "99901": "ELY", "143": "MON",
    Robinhood: "RH", Base: "BASE", Solana: "SOL", BNB: "BNB", Ethereum: "ETH", Arbitrum: "ARB", Elysium: "ELY" };

  /* ── Row render ───────────────────────────────────────────────── */
  function renderRow(token) {
    var addr = token.address;
    var sym = token.symbol;
    var name = token.name || "";
    var age = token.ageSec || 0;
    var price = token.price;
    var mcap = token.mcap;
    var volume = token.volume;
    var holders = token.holders || 0;
    var top10 = token.top10 || 0;
    var dev = token.dev || 0;
    var sniper = token.sniper || 0;
    var bundler = token.bundler || 0;
    var qProof = token.qProof || "Not checked";
    var badge = token.badge || "";
    var candles = token.candles || [];

    // Calculate 24h change
    var change = token.change24 != null && isFinite(token.change24) ? token.change24 : get24hChange(candles);
    var cid = token.chainId || token.chain_id || "", link = token.href || ("#/token/" + (cid ? encodeURIComponent(String(cid)) + "/" : "") + addr), unit = token.chainId === "solana" ? "SOL" : token.native || "ETH";
    var letter = esc(sym.charAt(0).toUpperCase() || "?");
    var tile = token.logo ? "<img class='pulse-tile pulse-tile-img' " + (window.QHLazy ? "data-src" : "src") + "='" + esc(token.logo) + "' alt='' decoding='async' width='44' height='44' data-l='" + letter + "'>" : null;
    var chainTag = CHAIN_TAG[token.chainId] || CHAIN_TAG[token.chain] || String(token.chain || "").slice(0, 3).toUpperCase();
    var nB = isFinite(token.buys) && token.buys != null ? token.buys : null, nS = isFinite(token.sells) && token.sells != null ? token.sells : null;
    if (nB == null && !token.live && token.trades) { nB = token.trades.filter(function (x) { return x.type === "buy"; }).length; nS = token.trades.length - nB; }
    var press = nB != null && nB + nS > 0 ? Math.round(nB / (nB + nS) * 100) : null;
    var fees = token.fees != null && isFinite(token.fees) ? token.fees : (!token.live && isFinite(volume) && volume != null ? volume * 0.008 : null);
    var band = !(mcap > 0) ? 0 : mcap < 30000 ? 1 : mcap < 300000 ? 2 : mcap < 3000000 ? 3 : 4;

    // Format badge
    var badgeEl = "";
    if (badge === "P1") { badgeEl = "<span class='pulse-badge pulse-badge-p1'>P1</span>"; }
    else if (badge === "P2") { badgeEl = "<span class='pulse-badge pulse-badge-p2'>P2</span>"; }
    else if (badge === "P3") { badgeEl = "<span class='pulse-badge pulse-badge-p3'>P3</span>"; }

    // Stats with red when >30%
    var isRed = function(v) { return v >= 30 ? "pulse-stat-red" : ""; };
    /* Compact stat pairs on one line (Fable, tight rows): a holders glyph and short labels, full names in tooltips. */
    var PPL = "<svg viewBox='0 0 12 12' width='10' height='10' fill='currentColor' aria-hidden='true'><rect x='1' y='7' width='6' height='4' rx='2'/><rect x='2.5' y='1.5' width='3' height='4' rx='1.5'/><rect x='8' y='7.5' width='3' height='3.5' rx='1.5'/><rect x='8.2' y='3.3' width='2.4' height='3' rx='1.2'/></svg>";
    var statTop10 = top10 > 1 ? "<span class='pulse-stat " + isRed(top10) + "' title='Top 10 holders'>T10 " + top10.toFixed(0) + "%</span>" : "";
    var statDev = dev > 1 ? "<span class='pulse-stat " + isRed(dev) + "' title='Dev holds'>Dev " + dev.toFixed(0) + "%</span>" : "";
    var statSniper = sniper > 1 ? "<span class='pulse-stat " + isRed(sniper) + "' title='Snipers hold'>Snp " + sniper.toFixed(0) + "%</span>" : "";
    var statBundler = bundler > 1 ? "<span class='pulse-stat " + isRed(bundler) + "' title='Bundlers hold'>Bnd " + bundler.toFixed(0) + "%</span>" : "";
    var statHolders = holders > 0 ? "<span class='pulse-stat pulse-stat-h' title='Holders'>" + PPL + holders.toLocaleString() + "</span>" : "";
    /* Bonding progress under the coin: how far along the curve this token is. Not shown once migrated. */
    var pg = token.progress != null && isFinite(token.progress) && token.stage !== "migrated" ? Math.max(0, Math.min(100, Number(token.progress))) : null;
    var progEl = "<div class='pulse-prog' title='Bonding progress'>" + (pg != null ? "<i><u style='width:" + pg.toFixed(0) + "%'></u></i><b>" + pg.toFixed(0) + "%</b>" : "") + "</div>";

    // First letter for tile
    var firstLetter = sym.charAt(0).toUpperCase() || "?";

    // QProof chip - rounded rectangle, never circle
    var qProofClass = "pulse-qproof pulse-qproof-" + qProof.toLowerCase().replace(" ", "-");
    var qProofEl = "<span class='" + qProofClass + "' title='" + esc(qProof) + "'>" + esc(qProof) + "</span>";

    // Build row HTML
    var rowHtml = "<a class='pulse-row' href='" + esc(link) + "' data-addr='" + esc(addr) + "' data-key='" + esc(token.key || addr) + "'>" +
      // LEFT: 64px square tile
      "<div class='pulse-row-left'>" +
      "<div class='pulse-tile-wrap'>" + (tile || "<div class='pulse-tile'>" + firstLetter + "</div>") + (chainTag ? "<span class='pulse-chain-tag'>" + esc(chainTag) + "</span>" : "") + "</div>" +
      progEl + "<div class='pulse-address'>" + esc(addr) + "</div>" +
      "</div>" +

      // MIDDLE: symbol/name/QProof/age/stats
      "<div class='pulse-row-middle'>" +
      "<div class='pulse-row-top'>";

    if (badgeEl) rowHtml += badgeEl;
    rowHtml += "<span class='pulse-symbol'>" + esc(sym) + "</span>" +
      "<span class='pulse-name'>" + esc(name) + "</span>" +
      qProofEl + (window.HookBadge ? ' ' + window.HookBadge.inRow(token) : '') +
      "<span class='pulse-age'>" + (token.ageSec == null && token.live ? "\u2014" : formatAge(age)) + "</span>" +
      "</div>" +

      // Line 2: stats
      "<div class='pulse-row-stats'>" +
      statHolders + statTop10 + statDev + statSniper + statBundler +
      "</div>" +
      "</div>" +

      // RIGHT: price/MC + buy button
      "<div class='pulse-row-right'>" +
      "<div class='pulse-row-price-block'>" +
      "<div class='pulse-price'>" + formatUSD(price) + (change !== null ? " <span class='pulse-change " + getChangeClass(change) + "'>" + getChangeSign(change) + change.toFixed(Math.abs(change) >= 100 ? 0 : 1) + "%</span>" : "") + "</div>" +
      "<div class='pulse-volume'>V " + formatUSD(volume) + "</div>" +
      "<div class='pulse-mcap pulse-mc-band" + band + "'>MC " + formatUSD(mcap) + "</div>" +
      "<div class='pulse-fees'>F " + formatUSD(fees) + "</div>" +
      (press != null ? "<div class='pulse-press' title='Buys " + nB + " / Sells " + nS + "'><i style='width:" + press + "%'></i></div>" : "<div class='pulse-press pulse-press-none'></div>") +
      "</div>" +
      "<button class='pulse-buy-btn' type='button' data-addr='" + esc(addr) + "' data-href='" + esc(link) + "' data-unit='" + esc(unit) + "' title='Quick buy' aria-label='Buy 0.01 " + esc(unit) + "'>0.01 " + esc(unit) + "</button>" +
      "</div>" +

      "</a>";

    return rowHtml;
  }

  /* ── Expose ───────────────────────────────────────────────────── */
  return {
    renderRow: renderRow,
    get24hChange: get24hChange,
    formatUSD: formatUSD
  };

})();

export const PulseRow = window.PulseRow;

/* Claude: CSP-safe logo fallback (no inline handlers): a failed tile image becomes its letter tile */
document.addEventListener("error", function (e) {
  var img = e.target;
  if (!img || img.tagName !== "IMG" || !img.classList || !img.classList.contains("pulse-tile-img")) return;
  var d = document.createElement("div"); d.className = "pulse-tile"; d.textContent = img.getAttribute("data-l") || ""; img.replaceWith(d);
}, true);
