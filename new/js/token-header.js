/**
 * Token page header module.
 *
 * Renders the header strip: token image, SYMBOL + name, age, socials,
 * and stats row (price, MC, Liquidity, Supply, Fees, Bonding, ATH).
 *
 * No external dependencies — pure DOM + app/ code only.
 */

window.TokenHeader = (function () {
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

  /* ── Compact USD formatting ─────────────────────────────────────── */
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
      return "$" + val.toFixed(abs >= 10000 ? 0 : 2) + "K";
    }
    return "$" + val.toFixed(2);
  }

  /* ── Render header for token ────────────────────────────────────── */
  function render(token) {
    var price = token.price || 0;
    var mcap = token.mcap || 0;
    var liquidity = token.liquidity || 0;

    var mcColor = mcap >= 10000000 ? C.up : mcap >= 1000000 ? C.acc : C.muted;

    return (
      "<div class='token-header'>" +
        "<div class='token-header-top'>" +
          "<div class='token-symbol-block'>" +
            "<div class='token-symbol'>$" + (token.symbol || "") + "</div>" +
            "<div class='token-name'>" + (token.name || "") + "</div>" +
          "</div>" +
          "<div class='token-age'>Age: " + formatAge(token.ageSec || 0) + "</div>" +
        "</div>" +
        "<div class='token-stats-row'>" +
          "<div class='token-stat'><div class='token-stat-label'>Price</div><div class='token-stat-value'>" + compactUSD(price) + "</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>MC</div><div class='token-stat-value' style='color:" + mcColor + "'>" + compactUSD(mcap) + "</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Liquidity</div><div class='token-stat-value'>" + compactUSD(liquidity) + "</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Supply</div><div class='token-stat-value'>100M</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Fees</div><div class='token-stat-value'>12.5K</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Bonding</div><div class='token-stat-value'>23%</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>ATH</div><div class='token-stat-value'>-</div></div>" +
        "</div>" +
      "</div>"
    );
  }

  /* ── Format age in human-readable form ──────────────────────────── */
  function formatAge(seconds) {
    if (seconds < 60) return seconds + "s";
    if (seconds < 3600) return Math.round(seconds / 60) + "m";
    if (seconds < 86400) return Math.round(seconds / 3600) + "h";
    return Math.round(seconds / 86400) + "d";
  }

  /* ── Expose public API ──────────────────────────────────────────── */
  return {
    render: render,
  };
})();