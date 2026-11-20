// token-qproof.js - QProof panel with verdict and checks
// No external dependencies. No template literals (backticks).

window.TokenQProof = (function() {
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

  function render(verdict) {
    var verdictColor;
    var verdictBg;
    switch (verdict) {
      case 'Clear': verdictColor = C.up; verdictBg = 'rgba(76,195,138,0.15)'; break;
      case 'Watch': verdictColor = C.acc; verdictBg = 'rgba(210,173,114,0.15)'; break;
      case 'Danger': verdictColor = C.dn; verdictBg = 'rgba(242,105,92,0.15)'; break;
      default: verdictColor = C.muted; verdictBg = 'rgba(138,143,152,0.15)';
    }

    var checks = [
      {label: 'Sell test', evidence: true},
      {label: 'Taxes', evidence: true},
      {label: 'LP lock', evidence: true},
      {label: 'Top 10 holders', evidence: true},
    ];

    var checkItems = checks.map(function(c) {
      return '<li class="token-qcheck"><span class="token-qcheck-label">' + c.label + '</span><span class="token-qcheck-evidence">\u2713</span></li>';
    }).join('');

    return (
      '<section class="token-qproof">' +
        '<div class="token-qproof-header">' +
          '<div class="token-qproof-verdict" style="color:' + verdictColor + ';background:' + verdictBg + '">' + verdict + '</div>' +
        '</div>' +
        '<ul class="token-qchecks">' + checkItems + '</ul>' +
      '</section>'
    );
  }

  return {
    render: render,
  };
})();