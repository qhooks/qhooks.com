// Team buy editor (2026-11-21): optional team wallet list with shares of the creator's first buy, plus the optional
// "Disclosed team buy" label. Used by the Solana and EVM launch forms. Strings in qx-team-buy-core.mjs (TEAM_TEXT).
import {TEAM_BUY, TEAM_TEXT as T, normalizeTeamBuy} from './qx-team-buy-core.mjs';
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } n.append(...kids.flat().filter(x => x != null)); return n; };
const pctToBps = v => { const s = String(v ?? '').trim().replace(',', '.'); if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(s)) return NaN; const [w, f = ''] = s.split('.'); return Number(w) * 100 + Number((f + '00').slice(0, 2)); };
const fmt = bps => Number((bps / 100).toFixed(2)).toString();
/// mountTeamBuy({chain, creator: () => address|null, onChange}) -> {node, value(), setAvailable(bool), clear()}
/// value() returns null (no team buy) or {disclosed, wallets:[{address,bps}]}; it throws a plain sentence on a bad list.
export function mountTeamBuy({chain, creator = () => null, onChange = () => {}}) {
  const draftKey = 'qhooks:team-buy:draft:' + chain;
  let draft = null; try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch {}
  const toggle = el('input', {type: 'checkbox', id: 'qtb-' + chain + '-on'}), disclose = el('input', {type: 'checkbox', id: 'qtb-' + chain + '-disclose'});
  const rows = el('div', {class: 'qtb-rows'}), keep = el('p', {class: 'qxc-fine qtb-keep', role: 'status'}), body = el('div', {class: 'qtb-body', hidden: true});
  const save = () => { try { localStorage.setItem(draftKey, JSON.stringify({on: toggle.checked, disclosed: disclose.checked, rows: [...rows.children].map(r => ({address: r.querySelector('.qtb-wallet').value, share: r.querySelector('.qtb-share').value}))})); } catch {} };
  const paint = () => {
    body.hidden = !toggle.checked;
    const used = [...rows.children].reduce((n, r) => n + (pctToBps(r.querySelector('.qtb-share').value) || 0), 0);
    keep.textContent = used <= TEAM_BUY.bps ? T.keep(fmt(TEAM_BUY.bps - used)) : 'Team shares add up to more than 100%.';
    add.disabled = rows.children.length >= TEAM_BUY.maxWallets;
  };
  const changed = () => { paint(); save(); onChange(); };
  const row = (address = '', share = '') => {
    const r = el('div', {class: 'qtb-row'},
      el('label', {}, T.wallet, el('input', {class: 'qtb-wallet', autocomplete: 'off', spellcheck: 'false', value: address, oninput: changed})),
      el('label', {}, T.share, el('input', {class: 'qtb-share', inputmode: 'decimal', autocomplete: 'off', value: share, oninput: changed})),
      el('button', {type: 'button', class: 'qtb-remove', onclick: () => { r.remove(); changed(); }}, T.remove));
    rows.append(r);
  };
  const add = el('button', {type: 'button', class: 'qtb-add', onclick: () => { row(); changed(); }}, T.add);
  for (const r of draft?.rows || []) row(r.address, r.share);
  if (!rows.children.length) row();
  toggle.checked = !!draft?.on; disclose.checked = draft?.disclosed !== false;
  toggle.addEventListener('change', changed); disclose.addEventListener('change', changed);
  body.append(el('p', {class: 'qxc-fine'}, T.intro(chain)), rows, add, keep,
    el('label', {class: 'qtb-disclose'}, disclose, ' ', T.disclose), el('p', {class: 'qxc-fine'}, T.discloseNote));
  const node = el('fieldset', {class: 'qtb', hidden: true}, el('legend', {}, el('label', {}, toggle, ' ', T.toggle)), body);
  paint();
  return {
    node,
    setAvailable(on) { node.hidden = !on; },
    get on() { return !node.hidden && toggle.checked; },
    value() {
      if (node.hidden || !toggle.checked) return null;
      const wallets = [...rows.children].map(r => ({address: r.querySelector('.qtb-wallet').value.trim(), bps: pctToBps(r.querySelector('.qtb-share').value)})).filter(w => w.address || Number.isFinite(w.bps));
      if (wallets.some(w => !Number.isFinite(w.bps))) throw new TypeError('Enter each team share as a percent, like 12.5.');
      return normalizeTeamBuy({disclosed: disclose.checked, wallets}, {chain, creator: creator()});
    },
    clear() { try { localStorage.removeItem(draftKey); } catch {} },
  };
}
