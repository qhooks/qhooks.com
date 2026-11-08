// A share handoff for a completed launch. No wallet, signing, network or storage.
const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) && BigInt(value) > 0n;
export function launchShare(record, chainName) {
  if (record?.status !== 'done' || !/^\d+$/.test(String(record.chainId)) || !address(record.addresses?.controller) || !address(record.addresses?.token)) throw new TypeError('Complete and list the launch before sharing it.');
  const chain = String(chainName || record.chainId), name = String(record.config?.name || '').replace(/[\r\n]/g, ' ').slice(0, 64), symbol = String(record.config?.symbol || '').replace(/[^a-z0-9]/gi, '').slice(0, 10);
  const identity = record.chainId + ':' + record.addresses.controller.toLowerCase();
  const market = 'https://qhooks.com/terminal#m=' + identity;
  const board = 'https://qhooks.com/board#m=' + identity;
  return Object.freeze({ market, board, intro: board + '&compose=intro', call: board + '&compose=call', token: record.addresses.token,
    text: `${name} ($${symbol}) is live on ${chain}.\n\nContract: ${record.addresses.token}\nTrade and review the pool rules: ${market}\nCommunity: ${board}` });
}

export function mountLaunchShare(record, chainName, { doc = document, clipboard = globalThis.navigator?.clipboard } = {}) {
  const kit = launchShare(record, chainName), box = doc.createElement('section'); box.className = 'qxc-share';
  const title = doc.createElement('h3'); title.textContent = 'Give your community a place to start.';
  const copy = doc.createElement('p'); copy.className = 'qxc-fine'; copy.textContent = 'Share the market, introduce your token, and rally your community. Start with the launch details and add your story.';
  const actions = doc.createElement('div'); actions.className = 'qxc-key-actions';
  const status = doc.createElement('p'); status.className = 'qxc-fine'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const text = doc.createElement('textarea'); text.readOnly = true; text.value = kit.text; text.setAttribute('aria-label', 'Launch post to copy'); text.rows = 7; text.hidden = true;
  for (const [label, value] of [['Copy market link', kit.market], ['Copy launch post', kit.text]]) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', async () => {
      try { if (!clipboard?.writeText) throw Error(); await clipboard.writeText(value); status.textContent = label === 'Copy market link' ? 'Market link copied.' : 'Launch post copied. Review it before sharing.'; }
      catch { text.hidden = false; text.value = value; text.focus(); text.select(); status.textContent = 'Select and copy the text below.'; }
    }); actions.append(button);
  }
  const intro = doc.createElement('a'); intro.href = kit.intro.replace('https://qhooks.com', ''); intro.className = 'qxc-primary'; intro.textContent = 'Introduce your token →'; actions.append(intro);
  box.append(title, copy, actions, status, text); return box;
}
