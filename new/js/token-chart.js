// token-chart.js - Chart area with timeframe buttons and Price/MC toggle
// No external dependencies. No template literals (backticks).

window.TokenChart = (function() {
  'use strict';

  var C = {
    bg: '#0b0c0e',
    surface1: '#121419',
    surface2: '#171a20',
    line: '#23262d',
    text: '#e8eaed',
    muted: '#8a8f98',
    up: '#4cc38a',
    dn: '#f2695c',
    acc: '#d2ad72',
  };

  var TIMEFRAMES = ['1s', '1m', '5m', '15m', '1h', '4h', '1D'];
  var MODES = ['price', 'mc'];

  function compactUSD(val) {
    if (val == null) return '$0';
    var abs = Math.abs(val);
    if (abs >= 1000000000) {
      return '$' + (val / 1000000000).toFixed(abs >= 10000000000 ? 0 : 1) + 'B';
    }
    if (abs >= 1000000) {
      return '$' + (val / 1000000).toFixed(abs >= 10000000 ? 0 : 1) + 'M';
    }
    if (abs >= 1000) {
      return '$' + val.toFixed(abs >= 10000 ? 0 : 2) + 'K';
    }
    return '$' + val.toFixed(2);
  }

  function renderChart(canvas, candles, width, height, mode) {
    if (!candles || candles.length === 0) return;

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var padding = 40;
    var chartW = width - padding * 2;
    var chartH = height - padding * 2;

    var min = Infinity, max = -Infinity;
    candles.forEach(function(c) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    });
    var range = max - min || 1;
    var scale = chartH / range;

    ctx.fillStyle = C.surface1;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    var stepX = chartW / (candles.length - 1 || 1);
    var points = [];
    candles.forEach(function(c, i) {
      var x = padding + i * stepX;
      var y = height - padding - (c.close - min) * scale;
      points.push({x: x, y: y});
    });

    ctx.strokeStyle = C.up;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(function(p, i) {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    ctx.fillStyle = C.muted;
    ctx.font = '11px system-ui';
    ctx.fillText(compactUSD(max), padding + 5, padding + 10);
    ctx.fillText(compactUSD(min), padding + 5, height - padding - 5);
  }

  function render(token) {
    var chartCanvas = document.createElement('canvas');
    chartCanvas.style.width = '100%';
    chartCanvas.style.height = '360px';
    renderChart(chartCanvas, token.candles || [], 800, 360, 'price');

    var timeframeButtons = TIMEFRAMES.map(function(tf) {
      return '<button class="token-tf-btn">' + tf + '</button>';
    }).join('');

    var modeButtons = MODES.map(function(m) {
      return '<button class="token-mode-btn">' + m.toUpperCase() + '</button>';
    }).join('');

    return (
      '<div class="token-chart-area">' +
        '<div class="token-chart-header">' +
          '<div class="token-chart-tfs">' + timeframeButtons + '</div>' +
          '<div class="token-chart-modes">' + modeButtons + '</div>' +
        '</div>' +
        '<div class="token-chart-container">' +
          '<canvas></canvas>' +
        '</div>' +
      '</div>'
    );
  }

  return {
    render: render,
    renderChart: renderChart,
  };
})();