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
        '.hk-low{border-color:#2ee59d;background:#2ee59d18;}' +
        '.hk-medium{border-color:#f5b544;background:#f5b54418;}' +
        '.hk-high{border-color:#ff4d5e;background:#ff4d5e18;}';
    var el = document.createElement('style');
    el.innerHTML = css;
    document.head.appendChild(el);
  }

  function html(token) {
    var h = token && token.hook ? token.hook : { id: 'std', name: 'Standard', risk: 'low' };
    var risk = getRiskClass(h.risk);
    var id = h.id || 'std';
    var name = h.name || 'Standard';
    injectStyle();
    return '<a class="hk-badge ' + risk + '" href="#/hook/' + id + '">' + name + '</a>';
  }

  /* Claude: inside row links use a span (no nested <a>); a click still opens the hook page. */
  function inRow(token) { return html(token).replace('<a ', '<span role="link" ').replace('href="', 'data-href="').replace('</a>', '</span>'); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('span.hk-badge[data-href]');
    if (!b) return; e.preventDefault(); e.stopPropagation(); location.hash = b.getAttribute('data-href');
  }, true);
  window.HookBadge = { html: html, inRow: inRow };
})();
