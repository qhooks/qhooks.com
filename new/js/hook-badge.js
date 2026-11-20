/* hook-badge.js  —  minimal badge renderer (no backticks) */

(function () {
  'use strict';

  var STYLE_INJECTED = false;

  var RISK_COLORS = {
    low: 'hk-low',
    medium: 'hk-medium',
    high: 'hk-high'
  };

  function getRiskClass(risk) {
    return RISK_COLORS[risk] || 'hk-low';
  }

  function injectStyle() {
    if (STYLE_INJECTED) return;
    STYLE_INJECTED = true;
    var css = '.hk-badge{' +
        'display:inline-block;' +
        'padding:2px 8px;' +
        'font-size:10px;' +
        'border:1px solid;' +
        'border-radius:4px;' +
        'text-decoration:none;' +
        'color:#e8eaed;' +
        'white-space:nowrap;' +
        '}' +
        '.hk-low{border-color:#4cc38a;background:#4cc38a18;}' +
        '.hk-medium{border-color:#d2ad72;background:#d2ad7218;}' +
        '.hk-high{border-color:#f2695c;background:#f2695c18;}';
    var el = document.createElement('style');
    el.innerHTML = css;
    document.head.appendChild(el);
  }

  /* What the badge says (Fable):
     - a token with its own hook: what that hook does for the trader (the standard hook reads with the approved
       cashback line), linking to the hook page;
     - any other token: the same cashback applies to every trade made here (Randall, 2026-11-20: "30% back is
       for all trades"), so the badge says so and opens Rewards. */
  function html(token) {
    var h = token && token.hook ? token.hook : null;
    var line = window.QHBlocks && window.QHBlocks.CASHBACK ? window.QHBlocks.CASHBACK : '';
    var short = line ? line.split(' on ')[0] : '';
    var glyph = window.QHBrand ? window.QHBrand.hook : '';
    injectStyle();
    if (!h) {
      if (!short) return '';
      return '<a class="hk-badge hk-low" href="#/rewards" title="' + line + '">' + glyph + short + '</a>';
    }
    var risk = getRiskClass(h.risk), id = h.id || 'std', name = h.name || 'Standard';
    var std = id === 'std' || id === 'standard' || name === 'Standard';
    return '<a class="hk-badge ' + risk + '" href="#/hook/' + id + '" title="' + (std && line ? 'Standard hook: ' + line : name + ' hook') + '">' + glyph + (std && short ? short : name) + '</a>';
  }

  /* Claude: inside row links use a span (no nested <a>); a click still opens the hook page. */
  function inRow(token) { return html(token).replace('<a ', '<span role="link" ').replace('href="', 'data-href="').replace('</a>', '</span>'); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('span.hk-badge[data-href]');
    if (!b) return; e.preventDefault(); e.stopPropagation(); location.hash = b.getAttribute('data-href');
  }, true);
  window.HookBadge = { html: html, inRow: inRow };
})();
