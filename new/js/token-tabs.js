// token-tabs.js - Tab bar and table containers
// No external dependencies. No template literals (backticks).

window.TokenTabs = (function() {
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

  var TABS = [
    {id: 'trades', label: 'Trades'},
    {id: 'positions', label: 'Positions'},
    {id: 'orders', label: 'Orders'},
    {id: 'holders', label: 'Holders'},
    {id: 'top-traders', label: 'Top traders'},
    {id: 'early-buyers', label: 'Early buyers'},
    {id: 'dev-tokens', label: 'Dev tokens'},
  ];

  var TRADES_COLS = ['Age', 'Type', 'Price', 'Amount', 'USD', 'Trader'];

  function compactAge(sec) {
    if (sec == null) return '0s';
    var abs = Math.abs(Math.floor(sec));
    if (abs < 60) return abs + 's';
    if (abs < 3600) return Math.floor(abs / 60) + 'm';
    if (abs < 86400) return Math.floor(abs / 3600) + 'h';
    return Math.floor(abs / 86400) + 'd';
  }

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

  function shortAddr(addr) {
    if (!addr || addr.length <= 10) return addr || '';
    return addr.slice(0, 6) + '\u2026' + addr.slice(-4);
  }

  function renderTabBar(activeTab, onChange) {
    var tabEls = TABS.map(function(tab) {
      var activeClass = tab.id === activeTab ? 'token-tab active' : 'token-tab';
      return '<button class="' + activeClass + '" data-tab="' + tab.id + '">' + tab.label + '</button>';
    }).join('');

    return '<div class="token-tab-bar">' + tabEls + '</div>';
  }

  function renderTradesTable(trades) {
    if (!trades || trades.length === 0) {
      return '<div class="token-table-empty">No trades yet</div>';
    }

    var rows = trades.map(function(trade) {
      var typeClass = trade.type === 'buy' ? 'token-buy' : 'token-sell';
      var typeIcon = trade.type === 'buy' ? '\u25b2' : '\u25bc';
      var age = compactAge((Date.now() - trade.time) / 1000);

      return (
        '<tr class="token-trade-row ' + typeClass + '">' +
          '<td class="token-age-cell">' + age + '</td>' +
          '<td class="token-type-cell ' + typeClass + '">' + typeIcon + ' ' + trade.type + '</td>' +
          '<td class="token-price-cell">' + compactUSD(trade.price) + '</td>' +
          '<td class="token-amount-cell">' + trade.amount + '</td>' +
          '<td class="token-usd-cell">' + compactUSD(trade.usd) + '</td>' +
          '<td class="token-trader-cell">' + '<a class="q-addr-link" href="#/wallet/' + trade.trader + '">' + shortAddr(trade.trader) + '</a>' + '</td>' +
        '</tr>'
      );
    }).join('');

    var header = TRADES_COLS.map(function(col) {
      return '<th>' + col + '</th>';
    }).join('');

    return (
      '<div class="token-trades-table-container">' +
        '<table class="token-trades-table">' +
          '<thead>' +
            '<tr>' + header + '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function render(activeTab, trades, onChange) {
    return (
      '<div class="token-tabs-wrapper">' +
        renderTabBar(activeTab, onChange) +
        '<div class="token-table-container">' + renderTradesTable(trades || []) + '</div>' +
      '</div>'
    );
  }

  return {
    render: render,
    renderTabBar: renderTabBar,
    renderTradesTable: renderTradesTable,
    TABS: TABS,
    TRADES_COLS: TRADES_COLS,
  };
})();