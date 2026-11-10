function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text !== void 0) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}
const usd = (v) => v === null || v === void 0 || v === "" || !Number.isFinite(Number(v)) ? "\u2014" : Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(Number(v)) < 1 ? 6 : 2 });
const num = (v) => v === null || v === void 0 || !Number.isFinite(Number(v)) ? "\u2014" : Number(v).toLocaleString("en-US", { maximumSignificantDigits: 7 });
const pct = (v, digits = 2) => v === null || v === void 0 || !Number.isFinite(Number(v)) ? "\u2014" : (Number(v) >= 0 ? "+" : "") + Number(v).toFixed(digits) + "%";
const short = (a) => a.slice(0, 6) + "\u2026" + a.slice(-4);
function createConfirmation(doc = document) {
  const dialog = doc.getElementById("perps-confirm");
  let pending = null, opener = null;
  const restoreFocus = () => {
    if (opener?.isConnected && !opener.disabled) opener.focus({ preventScroll: true });
  };
  const finish = (value) => {
    if (!pending) return;
    const resolve = pending;
    pending = null;
    dialog.close();
    restoreFocus();
    resolve(value);
  };
  doc.getElementById("confirm-send").addEventListener("click", () => finish(true));
  doc.getElementById("confirm-cancel").addEventListener("click", () => finish(false));
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish(false);
  });
  dialog.addEventListener("close", () => {
    if (!dialog.open && pending) finish(false);
  });
  return { setOpener(node) { opener = node; }, restoreFocus, ask(title, content) {
    if (pending) finish(false);
    if (!opener?.isConnected) opener = doc.activeElement;
    doc.getElementById("confirm-title").textContent = title;
    const body = doc.getElementById("confirm-description");
    if (typeof content === "string") {
      const paragraph = doc.createElement("p");
      paragraph.textContent = content;
      body.replaceChildren(paragraph);
    } else body.replaceChildren(content);
    return new Promise((resolve) => {
      pending = resolve;
      dialog.showModal();
      doc.getElementById("confirm-cancel").focus();
    });
  }, cancel: () => finish(false) };
}
function detailList(pairs) {
  const dl = el("dl", void 0, { class: "qxp-row-data" });
  for (const [label, value] of pairs) {
    const div = el("div");
    div.append(el("dt", label), el("dd", value));
    dl.append(div);
  }
  return dl;
}
export {
  createConfirmation,
  detailList,
  el,
  num,
  pct,
  short,
  usd
};
