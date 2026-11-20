// pulse.js – Pulse layout renderer
// Dependencies: data.js, pulse-row.js, ui.js

import { TOKENS, PULSE_TOKENS } from './data.js';
import { PulseRow } from './pulse-row.js';
import { NAV_ITEMS, TABS, COLORS, CHAINS } from './ui.js';

const Pulse = {
  /**
   * Render the complete Pulse HTML structure
   */
  render: function() {
    var html =
      '<div class="q-pulse-container">' +
      '<div class="pulse-header">' +
      '<div class="pulse-title">Pulse</div>' +
      '<div class="pulse-filters">' +
      '<button class="pulse-filter-btn pulse-filter-all active" data-filter="all">All</button>' +
      '<button class="pulse-filter-btn pulse-filter-p1" data-filter="P1">P1</button>' +
      '<button class="pulse-filter-btn pulse-filter-p2" data-filter="P2">P2</button>' +
      '<button class="pulse-filter-btn pulse-filter-p3" data-filter="P3">P3</button>' +
      '</div>' +
      '</div>' +
      '<div class="pulse-mtabs"><button class="pulse-mtab active" data-col="new">New</button><button class="pulse-mtab" data-col="final">Final stretch</button><button class="pulse-mtab" data-col="migrated">Migrated</button></div>' +
      '<div class="pulse-columns" data-active="new">' +
      '<div class="pulse-col pulse-col-new">' +
      '<div class="pulse-col-header">' +
      '<div class="pulse-col-title">New pairs</div>' +
      '<input type="text" class="pulse-col-search" placeholder="Search..." autocomplete="off">' +
      '<div class="pulse-quick-buy"><span class="pulse-quick-buy-icon">Buy</span><input class="pulse-quick-buy-input" value="0.01" inputmode="decimal"></div>' + '<div class="pulse-presets"><button class="pulse-preset active">P1</button><button class="pulse-preset">P2</button><button class="pulse-preset">P3</button></div>' +
      '</div>' +
      '<div class="pulse-row-list"></div>' +
      '</div>' +
      '<div class="pulse-col pulse-col-final">' +
      '<div class="pulse-col-header">' +
      '<div class="pulse-col-title">Final stretch</div>' +
      '<input type="text" class="pulse-col-search" placeholder="Search..." autocomplete="off">' +
      '<div class="pulse-quick-buy"><span class="pulse-quick-buy-icon">Buy</span><input class="pulse-quick-buy-input" value="0.01" inputmode="decimal"></div>' + '<div class="pulse-presets"><button class="pulse-preset active">P1</button><button class="pulse-preset">P2</button><button class="pulse-preset">P3</button></div>' +
      '</div>' +
      '<div class="pulse-row-list"></div>' +
      '</div>' +
      '<div class="pulse-col pulse-col-migrated">' +
      '<div class="pulse-col-header">' +
      '<div class="pulse-col-title">Migrated</div>' +
      '<input type="text" class="pulse-col-search" placeholder="Search..." autocomplete="off">' +
      '<div class="pulse-quick-buy"><span class="pulse-quick-buy-icon">Buy</span><input class="pulse-quick-buy-input" value="0.01" inputmode="decimal"></div>' + '<div class="pulse-presets"><button class="pulse-preset active">P1</button><button class="pulse-preset">P2</button><button class="pulse-preset">P3</button></div>' +
      '</div>' +
      '<div class="pulse-row-list"></div>' +
      '</div>' +
      '</div>' +
      '</div>';

    return html;
  },

  /**
   * Mount Pulse to a container element
   */
  mount: function(container) {
    // Set the container HTML
    container.innerHTML = this.render();

    // Get the row lists for each column
    var newRows = container.querySelector('.pulse-col-new .pulse-row-list');
    var finalRows = container.querySelector('.pulse-col-final .pulse-row-list');
    var migratedRows = container.querySelector('.pulse-col-migrated .pulse-row-list');

    // Create a PULSE_TOKENS_FIX with 'final' instead of 'finalStretch'
    var PULSE_TOKENS_FIX = {
      new: PULSE_TOKENS.new || [],
      final: PULSE_TOKENS.finalStretch || [],
      migrated: PULSE_TOKENS.migrated || []
    };

    // Render rows for each column
    newRows.innerHTML = (PULSE_TOKENS_FIX.new.map(function(t){return PulseRow.renderRow(t);}).join('') || "<div class='pulse-empty'>No tokens yet</div>");
    finalRows.innerHTML = (PULSE_TOKENS_FIX.final.map(function(t){return PulseRow.renderRow(t);}).join('') || "<div class='pulse-empty'>No tokens yet</div>");
    migratedRows.innerHTML = (PULSE_TOKENS_FIX.migrated.map(function(t){return PulseRow.renderRow(t);}).join('') || "<div class='pulse-empty'>No tokens yet</div>");

    // Add event listeners for quick-buy buttons
    var buyButtons = container.querySelectorAll('.pulse-buy-btn');
    buyButtons.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var addr = e.currentTarget.getAttribute('data-addr');
        alert('Quick buy initiated for: ' + addr);
      });
    });

    // Add event listeners for filter buttons
    var filterButtons = container.querySelectorAll('.pulse-filter-btn');
    filterButtons.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        // Update active state
        filterButtons.forEach(function(b) {
          b.classList.remove('active');
        });
        e.currentTarget.classList.add('active');

        var filter = e.currentTarget.getAttribute('data-filter');
        this.applyFilter(container, filter);
      }.bind(this));
    });

    // Add search functionality for each column
    container.querySelectorAll('.pulse-mtab').forEach(function(b){ b.onclick=function(){ container.querySelectorAll('.pulse-mtab').forEach(function(x){x.classList.remove('active');}); b.classList.add('active'); var cols=container.querySelector('.pulse-columns'); if(cols) cols.setAttribute('data-active', b.getAttribute('data-col')); }; });
    var searchInputs = container.querySelectorAll('.pulse-col-search');
    searchInputs.forEach(function(input, index) {
      input.addEventListener('keyup', function(e) {
        var query = e.currentTarget.value.toLowerCase();
        var list = input.closest('.pulse-col').querySelector('.pulse-row-list');
        var rows = list.querySelectorAll('.pulse-row');
        rows.forEach(function(row) {
          var tokenName = row.querySelector('.pulse-token-name');
          var symbol = row.querySelector('.pulse-token-symbol');
          var matches = tokenName && tokenName.textContent.toLowerCase().includes(query) ||
                         symbol && symbol.textContent.toLowerCase().includes(query);
          row.style.display = matches ? '' : 'none';
        });
      });
    });
  },

  /**
   * Apply filter to all token rows
   */
  applyFilter: function(container, filter) {
    if (filter === 'all') {
      var rows = container.querySelectorAll('.pulse-row');
      rows.forEach(function(row) {
        row.style.display = '';
      });
      return;
    }

    var rows = container.querySelectorAll('.pulse-row');
    rows.forEach(function(row) {
      var badges = row.querySelectorAll('.pulse-badge');
      var hasBadge = false;

      badges.forEach(function(badge) {
        if (badge.textContent === filter) {
          hasBadge = true;
        }
      });

      row.style.display = hasBadge ? '' : 'none';
    });
  }
};

export { Pulse };