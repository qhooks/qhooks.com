// Static documentation controls. No wallet, telemetry, network or timer.
const status = document.getElementById('stack-copy-status');
document.querySelectorAll('[data-copy-id]').forEach(button => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copyId);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.textContent.trim());
      status.textContent = 'Copied.';
    } catch {
      const selection = window.getSelection(), range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges(); selection.addRange(range);
      status.textContent = 'Text selected. Use your device’s Copy command.';
    }
  });
});
