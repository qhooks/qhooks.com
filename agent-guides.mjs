const toast = document.getElementById("ag-toast");
for (const button of document.querySelectorAll("[data-code-copy]"))
  button.addEventListener("click", async () => {
    const code = document.getElementById(button.dataset.codeCopy);
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = "Copied";
      toast.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy"), 1800);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      toast.textContent = "Select and copy the code.";
    }
  });
document
  .getElementById("ag-theme")
  ?.addEventListener("click", () => window.qhooksTheme?.toggle());
