// search.js – Token search dropdown for QHooks
// WARNING: No template literals used - they break the editor.

var window = window || {};

(function() {
  function highlightMatch(text, q) {
    var t = String(text == null ? '' : text); if (!q) return t;
    var i = t.toLowerCase().indexOf(String(q).toLowerCase());
    if (i < 0) return t;
    return t.slice(0, i) + '<b>' + t.slice(i, i + q.length) + '</b>' + t.slice(i + q.length);
  }

  'use strict';

  // CSS to inject once
  var CSS_INJECTED = false;

  function injectCSS() {
    if (CSS_INJECTED) return;
    CSS_INJECTED = true;

    var style = document.createElement('style');
    style.textContent =
      '.qs-dropdown {' +
      '  position: absolute;' +
      '  top: 100%;' +
      '  left: 0;' +
      '  right: 0;' +
      '  background: var(--s1);' +
      '  border: 1px solid var(--line);' +
      '  border-radius: 8px;' +
      '  box-shadow: 0 4px 20px rgba(0,0,0,0.5);' +
      '  max-height: 350px;' +
      '  overflow-y: auto;' +
      '  z-index: 200;' +
      '  margin-top: 4px;' +
      '}' +
      '.qs-group {' +
      '  padding: 8px 12px;' +
      '  border-bottom: 1px solid var(--line);' +
      '}' +
      '.qs-group-title {' +
      '  font-size: 11px;' +
      '  color: var(--mut);' +
      '  text-transform: uppercase;' +
      '  margin-bottom: 6px;' +
      '}' +
      '.qs-result {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 10px;' +
      '  padding: 8px 10px;' +
      '  cursor: pointer;' +
      '  border-radius: 6px;' +
      '  transition: background 0.2s;' +
      '}' +
      '.qs-result:hover {' +
      '  background: var(--s2);' +
      '}' +
      '.qs-symbol {' +
      '  font-weight: 700;' +
      '  font-size: 14px;' +
      '  min-width: 50px;' +
      '}' +
      '.qs-name {' +
      '  color: var(--tx);' +
      '  font-size: 13px;' +
      '  flex: 1;' +
      '}' +
      '.qs-chain {' +
      '  font-size: 10px;' +
      '  color: var(--mut);' +
      '  background: var(--bg);' +
      '  padding: 2px 6px;' +
      '  border-radius: 4px;' +
      '}' +
      '.qs-mc {' +
      '  font-size: 12px;' +
      '  font-weight: 600;' +
      '  color: var(--mut);' +
      '}' +
      '.qs-result.qs-highlight {' +
      '  background: var(--s2);' +
      '}' +
      '.qs-empty {' +
      '  padding: 12px;' +
      '  color: var(--mut);' +
      '  text-align: center;' +
      '  font-size: 13px;' +
      '}';
  }

  // Group tokens by symbol prefix for display
  function groupBySymbol(tokens) {
    var groups = {};
    tokens.forEach(function(token) {
      var sym = token.symbol;
      if (!groups[sym]) {
        groups[sym] = [];
      }
      groups[sym].push(token);
    });
    return groups;
  }

  // Format market cap
  function formatMC(mcap) {
    if (mcap == null || !isFinite(mcap)) return '';
    if (mcap >= 1000000000) {
      return '$' + (mcap / 1000000000).toFixed(2) + 'B';
    }
    if (mcap >= 1000000) {
      return '$' + (mcap / 1000000).toFixed(2) + 'M';
    }
    if (mcap >= 1000) {
      return '$' + (mcap / 1000).toFixed(2) + 'K';
    }
    return '$' + mcap.toFixed(2);
  }

  // Get chain badge text
  function getChainBadge(chain) {
    if (!chain) return '';
    return chain.slice(0, 3).toUpperCase();
  }

  // Search tokens by query
  function searchTokens(query) {
    if (!query || query.length < 1) return [];
    if (!window.QH_TOKENS || !Array.isArray(window.QH_TOKENS)) return [];

    var q = query.toLowerCase();
    var results = [];

    window.QH_TOKENS.forEach(function(token) {
      var match = false;
      if (token.symbol && token.symbol.toLowerCase().indexOf(q) !== -1) match = true;
      if (token.name && token.name.toLowerCase().indexOf(q) !== -1) match = true;
      if (token.address && token.address.toLowerCase().indexOf(q) !== -1) match = true;
      if (token.chain && token.chain.toLowerCase().indexOf(q) !== -1) match = true;

      if (match) {
        results.push(token);
      }
    });

    // Sort by relevance: exact symbol match first, then partial symbol, then name, then address
    results.sort(function(a, b) {
      var aSym = a.symbol ? a.symbol.toLowerCase() : '';
      var bSym = b.symbol ? b.symbol.toLowerCase() : '';
      var qSym = q;
      if (aSym === qSym) return -1;
      if (bSym === qSym) return 1;
      if (aSym.indexOf(qSym) === 0) return -1;
      if (bSym.indexOf(qSym) === 0) return 1;
      return 0;
    });

    return results.slice(0, 8);
  }

  // Create dropdown result row
  function createResultRow(token, query) {
    var row = document.createElement('div');
    row.className = 'qs-result';
    row.dataset.address = token.address;

    var symDiv = document.createElement('div');
    symDiv.className = 'qs-symbol';
    symDiv.innerHTML = highlightMatch(token.symbol, query);

    var nameDiv = document.createElement('div');
    nameDiv.className = 'qs-name';
    nameDiv.innerHTML = highlightMatch(token.name, query);

    var chainDiv = document.createElement('div');
    chainDiv.className = 'qs-chain';
    chainDiv.textContent = getChainBadge(token.chain);

    var mcDiv = document.createElement('div');
    mcDiv.className = 'qs-mc';
    mcDiv.textContent = formatMC(token.mcap);

    row.appendChild(symDiv);
    row.appendChild(nameDiv);
    row.appendChild(chainDiv);
    row.appendChild(mcDiv);

    return row;
  }

  // Create dropdown UI
  function createDropdown() {
    var dropdown = document.createElement('div');
    dropdown.className = 'qs-dropdown';
    return dropdown;
  }

  // Search module
  var Search = {
    dropdown: null,
    input: null,
    debounceTimer: null,

    attach: function(inputElement) {
      this.input = inputElement;

      if (!this.dropdown) {
        this.dropdown = createDropdown();
        (inputElement.parentNode || document.body).appendChild(this.dropdown);
      }

      inputElement.oninput = function(e) {
        var value = e.target.value;
        clearTimeout(Search.debounceTimer);
        Search.debounceTimer = setTimeout(function() {
          Search.showResults(value);
        }, 150);
      };

      inputElement.onkeydown = function(e) {
        switch (e.key) {
          case 'Escape':
            Search.close();
            break;
          case 'Enter':
            Search.selectCurrent();
            break;
        }
      };

      document.addEventListener('click', function(e) {
        if (!inputElement.contains(e.target) && !Search.dropdown.contains(e.target)) {
          Search.close();
        }
      });

      injectCSS();
    },

    showResults: function(query) {
      if (!this.dropdown) return;

      var results = searchTokens(query);
      var groups = groupBySymbol(results);

      this.dropdown.innerHTML = '';

      if (results.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'qs-empty';
        empty.textContent = 'No tokens found';
        this.dropdown.appendChild(empty);
        this.dropdown.style.display = 'block';
        return;
      }

      var count = 0;
      for (var sym in groups) {
        if (count >= 8) break;

        var groupDiv = document.createElement('div');
        groupDiv.className = 'qs-group';

        var title = document.createElement('div');
        title.className = 'qs-group-title';
        title.textContent = sym;

        groupDiv.appendChild(title);

        var tokens = groups[sym];
        for (var i = 0; i < tokens.length && count < 8; i++) {
          var row = createResultRow(tokens[i], query);
          row.onmouseenter = function() {
            Search.dropdown.querySelectorAll('.qs-result').forEach(function(r) {
              r.classList.remove('qs-highlight');
            });
            this.classList.add('qs-highlight');
          };
          row.onclick = function() {
            Search.selectToken(this.dataset.address);
          };
          groupDiv.appendChild(row);
          count++;
        }

        this.dropdown.appendChild(groupDiv);
      }

      this.dropdown.style.display = 'block';
    },

    close: function() {
      if (this.dropdown) {
        this.dropdown.style.display = 'none';
      }
    },

    selectCurrent: function() {
      var highlighted = this.dropdown.querySelector('.qs-highlight, .qs-result');
      if (highlighted && highlighted.dataset.address) {
        this.selectToken(highlighted.dataset.address);
      }
    },

    selectToken: function(address) {
      if (address) {
        this.close();
        if (this.input) {
          this.input.value = '';
        }
        window.location.hash = '#/token/' + address;
      }
    },
  };

  window.Search = Search;

})();