export function prizeEstimateState(text) {
  return text === 'Fixed QHOOKS allocation'
    ? {text, title: 'No USD estimate available'}
    : {text: '—', title: 'No USD estimate available'};
}
export function explainPrizeEstimates(root) {
  for (const node of root.querySelectorAll('.prize-estimate')) {
    // Retain the original state across observer callbacks.
    if (!node.dataset.prizeReason) node.dataset.prizeReason = node.textContent.trim();
    const state = prizeEstimateState(node.dataset.prizeReason);
    if (node.textContent !== state.text) node.textContent = state.text;
    node.title = state.title;
  }
  for (const node of root.querySelectorAll('.board-prize-amounts strong')) if (node.textContent.trim() === '—') node.title = 'No USD estimate available';
}
