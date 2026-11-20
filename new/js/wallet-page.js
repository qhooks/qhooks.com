// wallet-page.js – Wallet detail page module
// Dependencies: ui.js (shortAddress, compactUSD)
// No template literals used per HARD RULE

import { shortAddress, compactUSD } from './ui.js';

// Wallet data module - fixtures for demonstration
const WalletData = {
  // Sample wallet trades from the fixtures in data.js
  getTrades: function(address) {
    const trades = [];
    const now = Date.now();
    const types = ['buy', 'sell'];
    
    // Generate sample trades for this wallet
    for (let i = 0; i < 15; i++) {
      const type = types[i % 2];
      const tokenIndex = i % 10;
      const tokens = window.TOKENS || [];
      const token = tokens[tokenIndex] || {
        symbol: 'TKN' + tokenIndex,
        name: 'Token ' + tokenIndex,
        address: '0x' + padStart(tokenIndex.toString(), 40, '0'),
        price: 0.5 + Math.random() * 2.0,
      };
      
      const amt = 0.1 + Math.random() * 50;
      const usd = amt * token.price;
      
      trades.push({
        token: token.symbol,
        tokenName: token.name,
        tokenAddr: token.address,
        side: type,
        amount: amt,
        usd: usd,
        age: now - i * 3600000,
      });
    }
    
    return trades;
  },
  
  // Sample tokens launched by this wallet
  getLaunchedTokens: function(address) {
    const tokens = window.TOKENS || [];
    return tokens.slice(0, 5).map(function(t) {
      return {
        symbol: t.symbol,
        name: t.name,
        address: t.address,
        ageSec: t.ageSec,
        mcap: t.mcap,
      };
    });
  },
};

// Pad string with zeros on the left
function padStart(str, width, padChar) {
  if (str.length >= width) return str;
  return padChar.repeat(width - str.length) + str;
}

// Format token address for display
function formatTokenAddr(addr) {
  if (!addr || addr.length <= 10) return addr || '';
  return addr.slice(0, 8) + '...' + addr.slice(-4);
}

// Compact age to readable string
function compactAge(sec) {
  if (sec == null) return '0s';
  const abs = Math.abs(Math.floor(sec));
  if (abs < 60) return abs + 's';
  if (abs < 3600) return Math.floor(abs / 60) + 'm';
  if (abs < 86400) return Math.floor(abs / 3600) + 'h';
  return Math.floor(abs / 86400) + 'd';
}

// Render header with short address, chain badges, total value
function renderHeader(address) {
  const container = document.createElement('div');
  container.className = 'q-wallet-header q-card';
  
  const inner = document.createElement('div');
  inner.style.padding = '12px';
  
  // Header row: address
  const addrRow = document.createElement('div');
  addrRow.style.display = 'flex';
  addrRow.style.alignItems = 'center';
  addrRow.style.gap = '8px';
  addrRow.style.marginBottom = '12px';
  
  const addrLabel = document.createElement('div');
  addrLabel.className = 'q-wallet-addr-label';
  addrLabel.textContent = 'Wallet Address:';
  addrLabel.style.fontSize = '11px';
  addrLabel.style.color = '#8a8f98';
  addrLabel.style.textTransform = 'uppercase';
  addrLabel.style.letterSpacing = '0.06em';
  
  const addrDisplay = document.createElement('div');
  addrDisplay.className = 'q-wallet-addr-display';
  addrDisplay.textContent = shortAddress(address);
  addrDisplay.style.fontSize = '13px';
  addrDisplay.style.fontFamily = 'monospace';
  addrDisplay.style.color = '#e8eaed';
  
  addrRow.appendChild(addrLabel);
  addrRow.appendChild(addrDisplay);
  inner.appendChild(addrRow);
  
  // Chain badges row
  const chainRow = document.createElement('div');
  chainRow.style.display = 'flex';
  chainRow.style.gap = '4px';
  chainRow.style.marginBottom = '12px';
  
  const chains = ['Ethereum', 'Arbitrum', 'Base', 'BNB'];
  chains.forEach(function(chain) {
    const badge = document.createElement('span');
    badge.className = 'q-chain-badge';
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    badge.style.gap = '4px';
    badge.style.padding = '2px 8px';
    badge.style.borderRadius = '4px';
    badge.style.fontSize = '10px';
    badge.style.background = '#171a20';
    badge.style.border = '1px solid #23262d';
    badge.style.color = '#8a8f98';
    badge.textContent = chain;
    chainRow.appendChild(badge);
  });
  
  inner.appendChild(chainRow);
  
  // Total value row
  const totalRow = document.createElement('div');
  totalRow.style.display = 'flex';
  totalRow.style.alignItems = 'baseline';
  totalRow.style.gap = '12px';
  
  const totalLabel = document.createElement('div');
  totalLabel.textContent = 'Total Value';
  totalLabel.style.fontSize = '11px';
  totalLabel.style.color = '#8a8f98';
  
  const totalValue = document.createElement('div');
  totalValue.textContent = compactUSD(12450.75);
  totalValue.style.fontSize = '28px';
  totalValue.style.fontWeight = '600';
  totalValue.style.color = '#e8eaed';
  totalValue.style.fontVariantNumeric = 'tabular-nums';
  
  const pnlBadge = document.createElement('div');
  pnlBadge.style.display = 'inline-flex';
  pnlBadge.style.alignItems = 'center';
  pnlBadge.style.gap = '4px';
  pnlBadge.style.padding = '4px 8px';
  pnlBadge.style.borderRadius = '4px';
  pnlBadge.style.fontSize = '12px';
  pnlBadge.style.background = 'rgba(46,229,157,0.15)';
  pnlBadge.style.color = '#2ee59d';
  pnlBadge.textContent = '+2.4%';
  
  totalRow.appendChild(totalLabel);
  totalRow.appendChild(totalValue);
  totalRow.appendChild(pnlBadge);
  inner.appendChild(totalRow);
  
  container.appendChild(inner);
  return container;
}

// Render trades table
function renderTradesTable(trades) {
  const container = document.createElement('div');
  container.className = 'q-wallet-trades q-card';
  
  const header = document.createElement('div');
  header.className = 'q-table-header';
  
  const headerCells = ['Token', 'Side', 'Amount', 'USD', 'Age'];
  headerCells.forEach(function(text) {
    const cell = document.createElement('div');
    cell.textContent = text;
    cell.style.fontSize = '11px';
    cell.style.color = '#8a8f98';
    if (text !== 'Token' && text !== 'Side') {
      cell.style.textAlign = 'right';
    }
    header.appendChild(cell);
  });
  
  container.appendChild(header);
  
  const tableBody = document.createElement('div');
  
  trades.forEach(function(trade) {
    const row = document.createElement('div');
    row.className = 'q-table-row';
    
    // Token cell
    const tokenCell = document.createElement('div');
    tokenCell.style.display = 'flex';
    tokenCell.style.flexDirection = 'column';
    
    const tokenName = document.createElement('div');
    tokenName.style.fontWeight = '600';
    tokenName.style.color = '#e8eaed';
    tokenName.textContent = trade.token;
    
    const tokenSub = document.createElement('div');
    tokenSub.style.fontSize = '10px';
    tokenSub.style.color = '#8a8f98';
    tokenSub.textContent = formatTokenAddr(trade.tokenAddr);
    
    tokenCell.appendChild(tokenName);
    tokenCell.appendChild(tokenSub);
    
    // Side cell
    const sideCell = document.createElement('div');
    sideCell.style.fontSize = '12px';
    sideCell.style.color = trade.side === 'buy' ? '#2ee59d' : '#ff4d5e';
    sideCell.textContent = trade.side.toUpperCase();
    
    // Amount cell (right-aligned)
    const amountCell = document.createElement('div');
    amountCell.style.fontSize = '12px';
    amountCell.style.color = '#e8eaed';
    amountCell.style.textAlign = 'right';
    amountCell.textContent = trade.amount.toFixed(4);
    
    // USD cell (right-aligned)
    const usdCell = document.createElement('div');
    usdCell.style.fontSize = '12px';
    usdCell.style.color = '#e8eaed';
    usdCell.style.textAlign = 'right';
    usdCell.textContent = compactUSD(trade.usd);
    
    // Age cell (right-aligned)
    const ageCell = document.createElement('div');
    ageCell.style.fontSize = '12px';
    ageCell.style.color = '#8a8f98';
    ageCell.style.textAlign = 'right';
    ageCell.textContent = compactAge((Date.now() - trade.age) / 1000);
    
    row.appendChild(tokenCell);
    row.appendChild(sideCell);
    row.appendChild(amountCell);
    row.appendChild(usdCell);
    row.appendChild(ageCell);
    
    tableBody.appendChild(row);
  });
  
  container.appendChild(tableBody);
  return container;
}

// Render launched tokens list
function renderLaunchedTokens(tokens) {
  const container = document.createElement('div');
  container.className = 'q-wallet-launched q-card';
  
  const header = document.createElement('div');
  header.textContent = 'Tokens Launched';
  header.style.fontSize = '12px';
  header.style.fontWeight = '600';
  header.style.color = '#e8eaed';
  header.style.marginBottom = '12px';
  container.appendChild(header);
  
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';
  
  tokens.forEach(function(token, idx) {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '8px';
    item.style.background = idx % 2 === 0 ? '#121419' : '#171a20';
    item.style.borderRadius = '4px';
    item.style.border = '1px solid #23262d';
    
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '2px';
    
    const name = document.createElement('div');
    name.style.fontWeight = '600';
    name.style.color = '#e8eaed';
    name.textContent = token.symbol + ' - ' + token.name;
    
    const addr = document.createElement('div');
    addr.style.fontSize = '10px';
    addr.style.color = '#8a8f98';
    addr.textContent = formatTokenAddr(token.address);
    
    left.appendChild(name);
    left.appendChild(addr);
    
    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '12px';
    right.style.alignItems = 'center';
    
    const age = document.createElement('div');
    age.style.fontSize = '11px';
    age.style.color = '#8a8f98';
    age.textContent = compactAge(token.ageSec);
    
    const mcap = document.createElement('div');
    mcap.style.fontSize = '11px';
    mcap.style.color = token.mcap >= 1000000 ? '#2ee59d' : '#f5b544';
    mcap.textContent = compactUSD(token.mcap);
    
    right.appendChild(age);
    right.appendChild(mcap);
    
    item.appendChild(left);
    item.appendChild(right);
    
    list.appendChild(item);
  });
  
  container.appendChild(list);
  return container;
}

// Main render function
function render(container, address) {
  if (!container || !address) {
    console.error('WalletPage.render: missing container or address');
    return;
  }
  
  // Clear container
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  
  // Create main wrapper
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '16px';
  
  // Render header
  wrapper.appendChild(renderHeader(address));
  
  // Get and render trades
  const trades = WalletData.getTrades(address);
  wrapper.appendChild(renderTradesTable(trades));
  
  // Get and render launched tokens
  const launchedTokens = WalletData.getLaunchedTokens(address);
  wrapper.appendChild(renderLaunchedTokens(launchedTokens));
  
  container.appendChild(wrapper);
}

// Expose to window
window.WalletPage = {
  render: render,
};

// Export for module systems
export const WalletPage = window.WalletPage;
