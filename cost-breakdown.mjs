export function renderCostBreakdown(container, quote) {
  container.replaceChildren();
  if (quote === null) return;

  const dl = document.createElement('dl');

  const profileDt = document.createElement('dt');
  profileDt.textContent = 'Profile';
  const profileDd = document.createElement('dd');
  profileDd.textContent = 'ML-DSA-65';
  dl.appendChild(profileDt);
  dl.appendChild(profileDd);

  const networkDt = document.createElement('dt');
  networkDt.textContent = 'Network';
  const networkDd = document.createElement('dd');
  networkDd.textContent = 'Local EVM (31337)';
  dl.appendChild(networkDt);
  dl.appendChild(networkDd);

  const gasDt = document.createElement('dt');
  gasDt.textContent = 'Estimated gas';
  const gasDd = document.createElement('dd');
  gasDd.textContent = quote.estimatedGas + ' gas';
  dl.appendChild(gasDt);
  dl.appendChild(gasDd);

  const gasPriceDt = document.createElement('dt');
  gasPriceDt.textContent = 'Gas price';
  const gasPriceDd = document.createElement('dd');
  gasPriceDd.textContent = quote.gasPriceWei + ' wei / gas';
  dl.appendChild(gasPriceDt);
  dl.appendChild(gasPriceDd);

  const networkFeeDt = document.createElement('dt');
  networkFeeDt.textContent = 'Estimated network fee';
  const networkFeeDd = document.createElement('dd');
  networkFeeDd.textContent = formatNative(quote.estimatedNetworkFeeWei) + ' native';
  dl.appendChild(networkFeeDt);
  dl.appendChild(networkFeeDd);

  const serviceFeeDt = document.createElement('dt');
  serviceFeeDt.textContent = 'QHooks service fee';
  const serviceFeeDd = document.createElement('dd');
  serviceFeeDd.textContent = 'Off — no service fee in local development';
  dl.appendChild(serviceFeeDt);
  dl.appendChild(serviceFeeDd);

  const validUntilDt = document.createElement('dt');
  validUntilDt.textContent = 'Valid until';
  const validUntilDd = document.createElement('dd');
  validUntilDd.textContent = new Date(quote.expiresAt).toLocaleTimeString();
  dl.appendChild(validUntilDt);
  dl.appendChild(validUntilDd);

  container.appendChild(dl);

  const note = document.createElement('p');
  note.textContent = 'Network gas is an estimate, not a guaranteed charge. Confirm the final fee in your wallet.';
  container.appendChild(note);
}

function formatNative(wei) {
  const amount = BigInt(wei);
  const fractional = amount % 1000000000000000000n;
  const integer = amount / 1000000000000000000n;
  let fractionalStr = fractional.toString().padStart(18, '0');
  fractionalStr = fractionalStr.replace(/0+$/, '');
  if (fractionalStr === '') {
    return integer.toString();
  }
  return integer.toString() + '.' + fractionalStr;
}
