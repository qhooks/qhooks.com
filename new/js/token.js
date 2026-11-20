/**
 * Token page module.
 *
 * Builds the token detail page with header stats strip, candlestick chart,
 * trades table, trade panel with Buy/Sell, and QProof panel.
 *
 * Styles live in app/styles.css under ".token-" prefix.
 * Data comes from app/js/data.js via import.
 *
 * Route: #/token/<address>
 *
 * No external dependencies — pure DOM + app/ code only.
 */

window.Token = (function () {
  "use strict";

  /* ── Colour tokens (QHooks palette) ─────────────────────────────── */
  var C = {
    bg:       "#0b0c0e",
    surface1: "#121419",
    surface2: "#171a20",
    line:     "#23262d",
    text:     "#e8eaed",
    muted:    "#8a8f98",
    up:       "#4cc38a",
    dn:       "#f2695c",
    acc:      "#d2ad72",
  };

  /* ── Timeframes ──────────────────────────────────────────────────── */
  var TIMEFRAMES = ["1s", "1m", "5m", "15m", "1h", "4h", "1D"];

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;");
  }

  function compactUSD(val) {
    if (val == null) return "$0";
    var abs = Math.abs(val);
    if (abs >= 1000000000) {
      return "$" + (val / 1000000000).toFixed(abs >= 10000000000 ? 0 : 1) + "B";
    }
    if (abs >= 1000000) {
      return "$" + (val / 1000000).toFixed(abs >= 10000000 ? 0 : 1) + "M";
    }
    if (abs >= 1000) {
      return "$" + (val / 1000).toFixed(abs >= 10000 ? 1 : 2) + "K";
    }
    return "$" + val.toFixed(2);
  }

  function compactAge(sec) {
    if (sec == null) return "0s";
    var abs = Math.abs(Math.floor(sec));
    if (abs < 60) return abs + "s";
    if (abs < 3600) return Math.floor(abs / 60) + "m";
    if (abs < 86400) return Math.floor(abs / 3600) + "h";
    return Math.floor(abs / 86400) + "d";
  }

  function shortAddr(addr) {
    if (!addr || addr.length <= 10) return addr || "";
    return addr.slice(0, 6) + "\u2026" + addr.slice(-4);
  }

  function formatTime(ts) {
    var d = new Date(ts);
    return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function calcPnL(bought, current) {
    if (!bought || !current || bought <= 0) return 0;
    return ((current - bought) / bought) * 100;
  }

  function renderQProofChip(verdict) {
    var color;
    var bg;
    switch (verdict) {
      case "Clear": color = C.up; bg = "rgba(76,195,138,0.15)"; break;
      case "Watch": color = C.acc; bg = "rgba(210,173,114,0.15)"; break;
      case "Danger": color = C.dn; bg = "rgba(242,105,92,0.15)"; break;
      default: color = C.muted; bg = "rgba(138,143,152,0.15)";
    }
    return "<span class='token-qproof' style='color:" + color + ";background:" + bg + "'>" + verdict + "</span>";
  }

  /* ── Chart rendering (canvas candlestick) ────────────────────────── */
  function renderChart(canvas, candles, width, height, mode) {
    if (!candles || candles.length === 0) return;

    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1; /* Claude: sharp axis text on retina, drawn at real size */
    if (canvas.clientWidth > 0) { width = canvas.clientWidth; height = canvas.clientHeight || height; }
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var padding = 40;
    var chartW = width - padding * 2;
    var chartH = height - padding * 2;

    // Determine min/max
    var min = Infinity, max = -Infinity;
    candles.forEach(function(c) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    });
    var range = max - min;
    if (range === 0) { range = 1; max = min + 1; }

    var barW = chartW / candles.length;
    var priceScale = chartH / range;

    // Background
    ctx.fillStyle = C.surface1;
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var y = padding + (chartH / 5) * i;
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
    }
    ctx.stroke();

    // Draw candles
    candles.forEach(function(c, i) {
      var x = padding + i * barW;
      var yHigh = padding + chartH - (c.high - min) * priceScale;
      var yLow = padding + chartH - (c.low - min) * priceScale;
      var yOpen = padding + chartH - (c.open - min) * priceScale;
      var yClose = padding + chartH - (c.close - min) * priceScale;

      var color = c.close >= c.open ? C.up : C.dn;
      var barH = Math.abs(yClose - yOpen);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, yHigh);
      ctx.lineTo(x + barW / 2, yLow);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      if (barH === 0) barH = 1;
      ctx.fillRect(x + 1, Math.min(yOpen, yClose), barW - 2, barH);
    });

    // Y-axis labels
    ctx.fillStyle = C.muted;
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    for (var j = 0; j < 5; j++) {
      var val = max - (range / 5) * j;
      var y = padding + (chartH / 5) * j;
      ctx.fillText(compactUSD(val), padding - 5, y + 4);
    }
  }

  /* ── Render header stats strip ───────────────────────────────────── */
  function renderHeader(token) {
    var ageSec = token.ageSec || 0;
    var price = token.price || 0;
    var mcap = token.mcap || 0;

    return (
      "<div class='token-header'>" +
        "<div class='token-header-top'>" +
          "<div class='token-header-left'>" +
            "<div class='token-avatar' style='background:" + token.tileColor + "'>" +
              token.symbol.charAt(0) + "</div>" +
            "<div class='token-title'>" +
              "<span class='token-symbol'>" + esc(token.symbol) + "</span>" +
              "<span class='token-name'>" + esc(token.name) + "</span>" +
            "</div>" +
            "<div class='token-meta'>" +
              "<span class='token-age'>" + compactAge(ageSec) + "</span>" +
              "<span class='token-socials'>" +
                "<a href='#' class='token-social' title='Website'>\u2022</a>" +
                "<a href='#' class='token-social' title='X'>\u2022</a>" +
                "<a href='#' class='token-social' title='Search'>\u2022</a>" +
              "</span>" +
            "</div>" +
          "</div>" +
          "<div class='token-qproof'>" + renderQProofChip(token.qProof) + (window.HookBadge ? " " + window.HookBadge.html(token) : "") + "</div>" +
        "</div>" +
        "<div class='token-stats-row'>" +
          "<div class='token-stat'><div class='token-stat-label'>Price</div><div class='token-stat-value'>" + compactUSD(price) + "</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>MC</div><div class='token-stat-value' style='color:" + (mcap >= 10000000 ? C.up : mcap >= 1000000 ? C.acc : C.muted) + "'>" + compactUSD(mcap) + "</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Liquidity</div><div class='token-stat-value'>" + compactUSD(token.liquidity || 0) + "</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Supply</div><div class='token-stat-value'>100M</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Fees</div><div class='token-stat-value'>12.5K</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Bonding</div><div class='token-stat-value'>23%</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>ATH</div><div class='token-stat-value'>$0.0021</div></div>" +
        "</div>" +
      "</div>"
    );
  }

  /* ── Render chart area ───────────────────────────────────────────── */
  var currentTF = "1m";
  var chartMode = "Price"; // Price or MC

  function renderChartArea(token) {
    currentTF = "1m";
    chartMode = "Price";

    var tfButtons = TIMEFRAMES.map(function(tf) {
      return "<button class='token-tf-btn' data-tf='" + tf + "'>" + tf + "</button>";
    }).join("");

    return (
      "<div class='token-chart-section'>" +
        "<div class='token-chart-header'>" +
          "<div class='token-chart-tfs'>" + tfButtons + "</div>" +
          "<button class='token-chart-mode' data-mode='Price'>Price</button>" +
        "</div>" +
        "<div class='token-chart-container'>" +
          "<canvas class='token-canvas'></canvas>" +
        "</div>" +
      "</div>"
    );
  }

  /* ── Render bottom tabs ──────────────────────────────────────────── */
  function renderBottomTabs() {
    var tabs = [
      { label: "Trades", id: "trades" },
      { label: "Positions", id: "positions" },
      { label: "Orders", id: "orders" },
      { label: "Holders (124)", id: "holders" },
      { label: "Top traders", id: "toptraders" },
      { label: "Early buyers", id: "earlybuyers" },
      { label: "Dev tokens", id: "devtokens" },
    ];

    return (
      "<div class='token-tabs'>" +
        tabs.map(function(t) {
          return "<div class='token-tab " + (t.id === "trades" ? "active" : "") + "' data-tab='" + t.id + "'>" + t.label + "</div>";
        }).join("") +
      "</div>"
    );
  }

  /* ── Render trades table ─────────────────────────────────────────── */
  function renderTradesTable(trades) {
    if (!trades || trades.length === 0) {
      return "<div class='token-no-data'>No trades yet</div>";
    }

    var rows = trades.slice(0, 20).map(function(trade) {
      var typeClass = trade.type === "buy" ? "token-buy" : "token-sell";
      var typeIcon = trade.type === "buy" ? "\u25b2" : "\u25bc";
      var age = compactAge((Date.now() - trade.time) / 1000);

      return (
        "<tr class='token-trade-row " + typeClass + "'>" +
          "<td class='token-age-cell'>" + age + "</td>" +
          "<td class='token-type-cell " + typeClass + "'>" + typeIcon + " " + trade.type + "</td>" +
          "<td class='token-price-cell'>" + compactUSD(trade.price) + "</td>" +
          "<td class='token-amount-cell'>" + trade.amount + "</td>" +
          "<td class='token-usd-cell'>" + compactUSD(trade.usd) + "</td>" +
          "<td class='token-trader-cell'>" + "<a class='q-addr-link' href='#/wallet/" + trade.trader + "'>" + shortAddr(trade.trader) + "</a>" + "</td>" +
        "</tr>"
      );
    }).join("");

    return (
      "<div class='token-trades-table-container'>" +
        "<table class='token-trades-table'>" +
          "<thead>" +
            "<tr>" +
              "<th>Age</th>" +
              "<th>Type</th>" +
              "<th>Price</th>" +
              "<th class='token-amount-cell'>Amount</th>" +
              "<th>USD</th>" +
              "<th>Trader</th>" +
            "</tr>" +
          "</thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>" +
      "</div>"
    );
  }
  /* ── Trade panel (closed out by Claude after the file was truncated) ── */
  function renderTradePanel(token) {
    var amounts = ["0.25", "0.5", "1", "2.5"].map(function (a) {
      return '<button class="tp-amt">' + a + "</button>";
    }).join("");
    return (
      '<aside class="token-trade-panel">' +
        '<div class="tp-side"><button class="tp-buy active">Buy</button><button class="tp-sell">Sell</button></div>' +
        '<div class="tp-tabs"><button class="active">Market</button><button>Limit</button><button>Adv.</button></div>' +
        '<label class="tp-label">Amount</label><input class="tp-input" placeholder="0.0" inputmode="decimal">' +
        '<div class="tp-amts">' + amounts + "</div>" +
        '<div class="tp-meta"><span>Slippage 20%</span><span>Priority 0.001</span></div>' +
        '<button class="tp-go">Buy ' + esc(token.symbol) + '</button>' +
        '<div class="tp-cashback">30% back on this trade</div>' +
        '<div class="tp-stats"><div>Bought<b>0</b></div><div>Sold<b>0</b></div><div>Holding<b>0</b></div><div>PnL<b>+0%</b></div></div>' +
        '<div class="tp-presets"><button class="active">PRESET 1</button><button>PRESET 2</button><button>PRESET 3</button></div>' +
      "</aside>"
    );
  }

  function renderQProofPanel(token) {
    return (
      '<section class="token-qproof"><div class="tq-head">QProof ' + renderQProofChip(token.qProof || token.qproof || "Not checked") + "</div>" +
        '<ul class="tq-checks"><li>Sell test<span>evidence</span></li><li>Taxes<span>evidence</span></li>' +
        "<li>LP lock<span>evidence</span></li><li>Top 10 holders<span>evidence</span></li></ul></section>"
    );
  }

  function render(root, token) {
    root.innerHTML =
      '<div class="token-page">' +
        '<div class="token-main">' + renderHeader(token) + renderChartArea(token) + renderBottomTabs() + renderTradesTable(token.trades || []) + "</div>" +
        '<div class="token-side">' + renderTradePanel(token) + renderQProofPanel(token) + "</div>" +
      "</div>";
    var canvas = root.querySelector("canvas");
    if (canvas && token.candles) renderChart(canvas, token.candles, canvas.clientWidth || 800, canvas.clientHeight || 360, "price");
  }

  return { render: render, renderTradePanel: renderTradePanel, renderQProofPanel: renderQProofPanel };
})();
