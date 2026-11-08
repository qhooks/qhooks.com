// Submit a module: checks the form in the browser (the worker checks it again), sends it to
// POST /api/market/modules/submit, and shows the receipt. #receipt=<id> shows a submission's review status.
import { keccak_256 } from '/full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';
import { connectedAddress } from '/qx-chain.mjs';

const $ = id => document.getElementById(id);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const bytes = s => Uint8Array.from(s.replace(/^0x/, '').match(/../g) || [], b => parseInt(b, 16));
const status = $('mk-status'), receipt = $('mk-receipt');
const LABEL = { received: 'Received', 'in-review': 'In review', 'changes-requested': 'Changes requested', approved: 'Approved, waiting to be listed', rejected: 'Declined', listed: 'Listed' };
let source = '';

$('mk-summary').addEventListener('input', e => { $('mk-summary-n').textContent = e.target.value.length; });
$('mk-use-wallet').addEventListener('click', () => { const a = connectedAddress(); if (a) $('mk-builder').value = a.toLowerCase(); else { status.textContent = 'Connect a wallet first (top right), or paste the address.'; document.getElementById('qhc-trigger')?.click(); } });
const codeOk = v => /^0x([0-9a-f]{2})+$/.test(v) && v.length >= 200 && v.length <= 2 + 49152 * 2;
$('mk-code').addEventListener('input', e => {
  const v = e.target.value.trim().toLowerCase().replace(/\s+/g, '');
  $('mk-code-note').textContent = !v ? 'Paste the creation code. Its hash shows here.' : codeOk(v) ? 'Creation hash ' + '0x' + hex(keccak_256(bytes(v))) + ' · ' + ((v.length - 2) / 2).toLocaleString() + ' bytes' : 'This is not creation code yet: 0x followed by hex, up to 49,152 bytes.';
});
$('mk-files').addEventListener('change', async e => {
  const files = [...e.target.files]; let out = '', total = 0;
  for (const f of files) { total += f.size; if (total > 400_000) { $('mk-files-note').textContent = 'Over 400 KB: link a commit instead, or send fewer files.'; source = ''; return; } out += '// ==== ' + f.name + ' ====\n' + await f.text() + '\n'; }
  source = out; $('mk-files-note').textContent = files.length + ' file' + (files.length === 1 ? '' : 's') + ', ' + Math.round(total / 1024) + ' KB, attached.';
});

function read() {
  const v = id => $(id).value.trim();
  const bps = Math.round(Number(v('mk-bps')) * 100), code = v('mk-code').toLowerCase().replace(/\s+/g, ''), builder = v('mk-builder').toLowerCase();
  const problem = v('mk-name').length < 3 ? ['mk-name', 'Give the module a name.'] : !/^[a-z][a-z0-9-]{1,23}$/.test(v('mk-kind')) ? ['mk-kind', 'Kind: lowercase letters, digits and dashes.']
    : v('mk-summary').length < 20 ? ['mk-summary', 'Write a summary of at least 20 characters.'] : v('mk-builder-name').length < 2 ? ['mk-builder-name', 'Enter your name or team.']
    : v('mk-contact').length < 3 ? ['mk-contact', 'Add a way to reach you.'] : !/^0x[0-9a-f]{40}$/.test(builder) || /^0x0{40}$/.test(builder) ? ['mk-builder', 'Enter the wallet your share is paid to.']
    : !(bps >= 0 && bps <= 1000) || !Number.isFinite(bps) ? ['mk-bps', 'Your share is 0 to 10%.'] : !/^https:\/\/\S{6,}$/.test(v('mk-repo')) ? ['mk-repo', 'Link the source repository (https).']
    : !codeOk(code) ? ['mk-code', 'Paste the creation code (0x…).'] : !source && !v('mk-commit') ? ['mk-commit', 'Give the commit, or attach the source files.']
    : !$('mk-agree').checked ? ['mk-agree', 'Tick the box to confirm.'] : null;
  if (problem) return [null, problem];
  return [{ name: v('mk-name'), kind: v('mk-kind'), summary: v('mk-summary'), detail: v('mk-detail'), builderName: v('mk-builder-name'), contact: v('mk-contact'), builder, builderBps: bps,
    repo: v('mk-repo'), commit: v('mk-commit'), creationCode: code, source, tests: v('mk-tests'), agree: true }];
}

$('mk-form').addEventListener('submit', async e => {
  e.preventDefault();
  const [body, problem] = read();
  for (const el of document.querySelectorAll('.mk-form [aria-invalid]')) el.removeAttribute('aria-invalid');
  if (!body) { status.textContent = problem[1]; $(problem[0]).setAttribute('aria-invalid', 'true'); $(problem[0]).focus(); return; }
  $('mk-send').disabled = true; status.textContent = 'Sending…';
  try {
    const r = await fetch('/api/market/modules/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error === 'rate_limited' ? 'Five submissions a day from one connection: try again tomorrow.' : 'Not accepted: ' + String(j.error || r.status).replace(/_/g, ' '));
    status.textContent = '';
    location.hash = 'receipt=' + j.id;
    $('mk-form').hidden = true;
    await showReceipt(j.id, true);
  } catch (err) { status.textContent = err.message || 'That did not go through.'; $('mk-send').disabled = false; }
});

async function showReceipt(id, fresh = false) {
  receipt.hidden = false; receipt.textContent = 'Looking up ' + id + '…';
  try {
    const r = await fetch('/api/market/modules/submission/' + encodeURIComponent(id), { cache: 'no-store' });
    if (!r.ok) throw new Error('No submission with that receipt.');
    const s = await r.json();
    const row = (k, v) => { const d = document.createElement('div'); const a = document.createElement('dt'); a.textContent = k; const b = document.createElement('dd'); b.textContent = v; d.append(a, b); return d; };
    const head = document.createElement('h2'); head.textContent = fresh ? 'Submitted. Keep this receipt.' : s.name;
    const dl = document.createElement('dl'); dl.className = 'mk-facts';
    dl.append(row('Receipt', s.id), row('Module', s.name + ' (' + s.kind + ')'), row('Status', LABEL[s.status] || s.status), row('Builder share', s.builderBps / 100 + '%'), row('Creation hash', s.creationHash), row('Updated', new Date(s.updatedAt).toLocaleString()));
    const note = document.createElement('p'); note.className = 'mk-note'; note.textContent = s.note ? 'Reviewer: ' + s.note : 'Reviewers will note what they find here. Bookmark this page: ' + location.origin + '/market-submit#receipt=' + s.id;
    receipt.replaceChildren(head, dl, note);
  } catch (err) { receipt.textContent = err.message; }
}
$('mk-lookup').addEventListener('submit', e => { e.preventDefault(); const id = $('mk-receipt-id').value.trim().toLowerCase(); if (/^[0-9a-f]{24}$/.test(id)) { location.hash = 'receipt=' + id; showReceipt(id); } else { receipt.hidden = false; receipt.textContent = 'A receipt is 24 letters and digits.'; } });
const m = location.hash.match(/receipt=([0-9a-f]{24})/); if (m) showReceipt(m[1]);
