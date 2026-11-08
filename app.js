import { categories, filterCatalog, labCatalog, quantumCatalog, simulateWithdrawal, statuses } from "./catalog.mjs";
import { createWorkbenchState, editDraftField, evaluateMockApprovals, markMockApproval, prepareWorkbenchState, selectWorkflow, workflows } from "./workbench.mjs";
import { productCopy, renderProductCard } from "./product.mjs";
import { platformCopy } from "./platform-copy.mjs";

const platformGrid = document.querySelector('#platform-grid');
for (const item of platformCopy) {
  const card = document.createElement('article');
  card.className = 'platform-card';
  const title = document.createElement('h3');
  title.textContent = item.title;
  const description = document.createElement('p');
  description.textContent = item.description;
  const link = document.createElement('a');
  link.className = 'text-link';
  link.href = item.href;
  link.textContent = item.label + ' ↗';
  card.append(title, description, link);
  platformGrid.append(card);
}

const search = document.querySelector("#search");
const category = document.querySelector("#category");
const status = document.querySelector("#status");
const quantumGrid = document.querySelector("#quantum-listing-grid");
const grid = document.querySelector("#listing-grid");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const dialog = document.querySelector("#detail-dialog");
const detailContent = document.querySelector("#detail-content");
const closeDialog = document.querySelector(".dialog-close");
let lastTrigger = null;

function optionMarkup(values) {
  return values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

category.innerHTML = optionMarkup(categories);
status.innerHTML = optionMarkup(statuses);

function currentFilters() {
  return { query: search.value, category: category.value, status: status.value };
}

function listingMarkup(item) {
  return `<article class="listing" data-listing-id="${item.id}">
    <div class="listing-meta"><span>${item.kind} · ${item.category}</span><span class="status">${item.status}</span></div>
    <h3>${item.name}</h3>
    <p>${item.summary}</p>
    <button type="button" data-detail="${item.id}" aria-label="View evidence and status for ${item.name}">Inspect evidence <span aria-hidden="true">↗</span></button>
  </article>`;
}

function render() {
  const results = filterCatalog(labCatalog, currentFilters());
  grid.innerHTML = results.map(listingMarkup).join("");
  emptyState.hidden = results.length !== 0;
  resultCount.textContent = `${results.length} illustrative research-lab ${results.length === 1 ? "entry" : "entries"}`;
}

function showDetail(item, trigger) {
  lastTrigger = trigger;
  dialog.dataset.listingId = item.id;
  const evidence = Object.entries(item.evidence).map(([kind, statement]) => `<div><h3>${kind}</h3><p>${statement}</p></div>`).join("");
  const protectedAction = item.protectedAction ? `<div><h3>Protected action</h3><p>${item.protectedAction}</p></div>` : "";
  const unprotectedActions = item.unprotectedActions ? `<div><h3>Not protected</h3><p>${item.unprotectedActions.join(" ")}</p></div>` : "";
  const limitations = item.limitations ? `<div><h3>Limitations</h3><p>${item.limitations.join(" ")}</p></div>` : "";
  const provenance = item.provenance ? `<div><h3>Accepted receipts</h3>${item.provenance.map((receipt) => `<p>${receipt.kind}: ${receipt.path}<br>SHA-256 ${receipt.sha256}</p>`).join("")}</div>` : "";
  const copy = Object.hasOwn(productCopy, item.id) ? productCopy[item.id] : null;
  detailContent.innerHTML = `<p class="detail-kicker">${item.category} / ${copy ? "Developer beta" : item.status}</p>
    <h2 id="detail-title" class="detail-title">${copy ? copy.name : item.name}</h2>
    <p>${copy ? copy.summary : item.detail}</p>
    ${copy ? `<section class="evidence" aria-label="Integration scope">${protectedAction}${unprotectedActions}</section><p><a class="text-link" href="/integrate">Integration guide ↗</a></p>` : ""}
    <details class="technical-notes"><summary>Technical notes and test history</summary><section class="evidence" aria-label="Evidence status"><p>${item.detail}</p>${evidence}${provenance}${limitations}</section></details>`;
  dialog.showModal();
  closeDialog.focus();
}

function closeDetail() {
  dialog.close();
}

function restoreFocus() {
  lastTrigger?.focus();
  lastTrigger = null;
}

[search, category, status].forEach((element) => element.addEventListener("input", render));
function openListingFromClick(event) {
  const trigger = event.target.closest("[data-detail]");
  if (!trigger) return;
  const item = [...quantumCatalog, ...labCatalog].find((entry) => entry.id === trigger.dataset.detail);
  if (item) showDetail(item, trigger);
}
quantumGrid.addEventListener("click", openListingFromClick);
grid.addEventListener("click", openListingFromClick);
closeDialog.addEventListener("click", closeDetail);
dialog.addEventListener("close", restoreFocus);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDetail(); });

const walletApproval = document.querySelector("#wallet-approval");
const coAuthorization = document.querySelector("#co-authorization");
const simulationResult = document.querySelector("#simulation-result");
document.querySelector("#simulate").addEventListener("click", () => {
  const result = simulateWithdrawal({ walletApproval: walletApproval.checked, coAuthorization: coAuthorization.checked });
  simulationResult.textContent = result.reason;
  simulationResult.dataset.outcome = result.outcome;
});

const draftForm = document.querySelector("#draft-form");
const workflowSelect = document.querySelector("#workflow");
const workflowNote = document.querySelector("#workflow-note");
const draftFeedback = document.querySelector("#draft-feedback");
const draftOutput = document.querySelector("#draft-output");
const draftWalletApproval = document.querySelector("#draft-wallet-approval");
const draftPqApproval = document.querySelector("#draft-pq-approval");
const evaluateDraft = document.querySelector("#evaluate-draft");
const draftResult = document.querySelector("#draft-result");
let workbenchState = createWorkbenchState();

function setDraftFeedback(message, isError = false) {
  draftFeedback.textContent = message;
  draftFeedback.dataset.error = String(isError);
}

function clearDraftUi(message = "A field changed. The unsigned draft and both mock approvals were cleared.") {
  draftWalletApproval.checked = false;
  draftPqApproval.checked = false;
  draftWalletApproval.disabled = true;
  draftPqApproval.disabled = true;
  evaluateDraft.disabled = true;
  draftOutput.hidden = true;
  draftOutput.textContent = "";
  draftResult.textContent = "Prepare the current fields before marking approvals.";
  setDraftFeedback(message);
}

function applyWorkflow(workflow) {
  for (const [field, value] of Object.entries(workflow.values)) draftForm.elements[field].value = value;
  workflowNote.textContent = workflow.note;
  workbenchState = selectWorkflow(workbenchState, workflow.values);
  clearDraftUi("Sample values loaded. Prepare a new unsigned draft to continue.");
}

for (const workflow of workflows) {
  const option = document.createElement("option");
  option.value = workflow.id;
  option.textContent = workflow.name;
  workflowSelect.append(option);
}
workflowSelect.addEventListener("change", () => applyWorkflow(workflows.find((workflow) => workflow.id === workflowSelect.value)));
for (const input of draftForm.querySelectorAll("input")) input.addEventListener("input", () => {
  workbenchState = editDraftField(workbenchState, input.name, input.value);
  clearDraftUi();
});

draftForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const prepared = prepareWorkbenchState(workbenchState);
  workbenchState = prepared.state;
  const { result } = prepared;
  if (!result.ok) {
    const firstError = Object.entries(result.errors)[0];
    setDraftFeedback(`${firstError[0]}: ${firstError[1]}`, true);
    return;
  }
  draftWalletApproval.checked = false;
  draftPqApproval.checked = false;
  draftWalletApproval.disabled = false;
  draftPqApproval.disabled = false;
  evaluateDraft.disabled = false;
  draftOutput.textContent = JSON.stringify(workbenchState.draft, null, 2);
  draftOutput.hidden = false;
  setDraftFeedback("Unsigned local draft prepared. Its mock approvals apply only to these exact values.");
  draftResult.textContent = "No mock approvals have been marked for this draft.";
});

draftWalletApproval.addEventListener("change", () => {
  workbenchState = markMockApproval(workbenchState, "walletApproval", draftWalletApproval.checked, workbenchState.draft?.handle);
  draftWalletApproval.checked = workbenchState.walletApproval;
});
draftPqApproval.addEventListener("change", () => {
  workbenchState = markMockApproval(workbenchState, "pqApproval", draftPqApproval.checked, workbenchState.draft?.handle);
  draftPqApproval.checked = workbenchState.pqApproval;
});

evaluateDraft.addEventListener("click", () => {
  const result = evaluateMockApprovals({
    draft: workbenchState.draft,
    activeHandle: workbenchState.draft?.handle,
    activeRevision: workbenchState.revision,
    walletApproval: workbenchState.walletApproval,
    pqApproval: workbenchState.pqApproval
  });
  draftResult.textContent = result.reason;
  draftResult.dataset.outcome = result.outcome;
});

applyWorkflow(workflows[0]);

const featuredHookIds = Object.freeze([
  "qcreator-fee-pq-vault",
  "qrevenue-split-pq-vaults",
  "qprice-band-pq-governance",
  "qvolume-epochs-pq-renewal",
  "qgraduation-pq-liquidity-migration"
]);
quantumGrid.replaceChildren(...featuredHookIds.map(id => renderProductCard(quantumCatalog.find(item => item.id === id))));
render();
