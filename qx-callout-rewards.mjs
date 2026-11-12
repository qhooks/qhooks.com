// Callout rewards on a profile (2026-11-12). Self-mounting: profile.html loads it after qx-profile-v3.mjs, and it places
// one section under the caller record strip (or above the tabs when there's no strip yet). Reads
// /api/callouts/profile/<wallet> → rewards {lifetime, weeks, days, payouts, bestCalls, pool}. USD everywhere; the
// payout token (WETH on Robinhood Chain) is only named in the small print. Text only, from our own endpoint.
import {resolveProfileAddress} from './qx-profile-address.mjs';
import {h, fmt} from '/qx-a/components.mjs';

const usd = v => { if (v == null) return '—'; const n = Number(v) || 0; return Math.abs(n) >= 100 ? (n < 0 ? '−' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US') : fmt.usdExact(n); };
const pts = n => (Number(n) || 0).toLocaleString('en-US');
const dayLabel = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});
const signed = v => (v >= 0 ? '+' : '−') + usd(Math.abs(v));
const today = () => new Date().toISOString().slice(0, 10);
const pctText = v => { const p = (Number(v) || 0) * 100; return (p >= 10 || p === 0 ? Math.round(p) : p >= 1 ? Math.round(p * 10) / 10 : Math.round(p * 100) / 100) + '%'; };
const shareText = c => !c.day ? null : pctText(c.poolShare) + ' of ' + (c.day === today() ? 'today' : dayLabel(c.day)) + '’s pool';
/// The callout line for one call: points (from followers' profit), the share of the day's pool they get, and the stake
/// with its gain as information only (a paper gain, never a payout and never points).
export function callFacts(c) {
  const bits = [];
  if (c.creator) bits.push('own launch, no points');
  else {
    bits.push(pts(c.points) + ' points');
    if (c.followerProfitUsd > 0) bits.push('followers ' + signed(c.followerProfitUsd));
    const share = c.points > 0 ? shareText(c) : null; if (share) bits.push(share);
  }
  if (c.stakeUsd != null) bits.push('stake ' + usd(c.stakeUsd) + (c.creator ? '' : ', gain on their stake ' + signed(c.stakeGainUsd || 0)));
  return bits;
}
const STATUS = {claimable: 'Claimable', proposed: 'Claimable in 24 h', listed: 'Listed'};

export function rewardsSection(r, {mine = false} = {}) {
  const life = r?.lifetime || {}, weeks = Array.isArray(r?.weeks) ? r.weeks : [], best = Array.isArray(r?.bestCalls) ? r.bestCalls : [];
  const sec = h('section', {class: 'qcr', 'aria-labelledby': 'qcr-h'});
  sec.append(h('h2', {id: 'qcr-h', class: 'qcr-h'}, 'Callout rewards'));
  const cell = (big, label, cls) => h('div', null, h('b', {class: cls || ''}, big), h('span', null, label));
  const strip = h('div', {class: 'qa-record qcr-strip'});
  strip.append(cell(usd(life.paidUsd), 'paid', Number(life.paidUsd) > 0 ? 'qa-up' : ''));
  if (Number(life.pendingUsd) > 0) strip.append(cell(usd(life.pendingUsd), 'on the way'));
  strip.append(cell(pts(life.points), 'points, all time'));
  const top = best.find(c => c.x != null);
  if (top) strip.append(cell(top.x >= 2 ? fmt.mult(top.x) : fmt.pct(top.x - 1), top.symbol ? '$' + top.symbol + ' best call' : 'best call', top.x >= 1 ? 'qa-up' : 'qa-down'));
  sec.append(strip);
  if (weeks.length) {
    const list = h('div', {class: 'qcr-weeks', role: 'table', 'aria-label': 'Callout rewards by week'});
    list.append(h('div', {class: 'qcr-row qcr-th', role: 'row'}, h('span', {role: 'columnheader'}, 'Week of'), h('span', {role: 'columnheader'}, 'Points'), h('span', {role: 'columnheader'}, 'Paid')));
    for (const w of weeks.slice(0, 6)) {
      const status = (w.paid || []).map(p => STATUS[p.status]).filter(Boolean)[0];
      list.append(h('div', {class: 'qcr-row', role: 'row'}, h('span', {role: 'cell'}, dayLabel(w.week)), h('span', {role: 'cell'}, pts(w.points)),
        h('span', {role: 'cell', class: w.paidUsd > 0 ? 'qa-up' : ''}, w.paid?.length ? usd(w.paidUsd) + (status && status !== 'Claimable' ? ' · ' + status : '') : '—')));
    }
    sec.append(list);
  }
  if (best.length) {
    const ul = h('ul', {class: 'qcr-best', 'aria-label': 'Best calls'});
    for (const c of best) {
      const bits = [c.x != null ? (c.x >= 2 ? fmt.mult(c.x) : fmt.pct(c.x - 1)) : null, ...callFacts(c)].filter(Boolean);
      const a = h('a', {href: '/call/' + encodeURIComponent(c.id)}, h('b', null, c.symbol ? '$' + c.symbol : 'Call'), h('span', null, bits.join(' · ')));
      ul.append(h('li', null, a));
    }
    sec.append(ul);
  }
  const pool = r?.pool;
  const note = pool ? `Points come from the gains of people who bought because of a call. The gain on a caller's own stake is shown for information and is not a payout. Each day ${pool.poolPct}% of terminal fees is shared by points, paid in WETH on Robinhood Chain with the weekly drop.` : 'Points turn into rewards once the callout pool opens.';
  const foot = h('p', {class: 'qcr-note'}, note, ' ', h('a', {href: pool?.how || '/callouts/how'}, 'How points work'));
  if (mine && (Number(life.paidUsd) > 0)) foot.append(' ', h('a', {href: pool?.claim || '/me'}, 'Claim'));
  sec.append(foot);
  return sec;
}

async function mount() {
  const main = document.querySelector('main.pv3') || document.querySelector('main');
  if (!main || main.querySelector('.qcr')) return;
  let who = null; try { who = await resolveProfileAddress(location); } catch {}
  if (!who?.wallet) return;
  let data = null; try { const res = await fetch('/api/callouts/profile/' + encodeURIComponent(who.wallet), {cache: 'no-store', credentials: 'same-origin'}); if (res.ok) data = await res.json(); } catch {}
  const r = data?.rewards; if (!r) return;
  const css = document.querySelector('link[href="/qx-callout-rewards.css"]') || document.head.appendChild(Object.assign(document.createElement('link'), {rel: 'stylesheet', href: '/qx-callout-rewards.css'}));
  void css;
  const sec = rewardsSection(r, {mine: !!data.viewer && data.viewer === data.wallet});
  const place = () => {
    if (main.querySelector('.qcr')) return true;
    const strip = main.querySelector('.pv3-proof'), tabs = main.querySelector('.pv-tabs');
    if (strip) { strip.after(sec); return true; }
    if (tabs) { tabs.before(sec); return true; }
    return false;
  };
  const byId = new Map((r.calls || []).map(c => [String(c.id), c]));
  const dress = () => main.querySelectorAll('article.qb-callline').forEach(line => {
    if (line.querySelector('.qcr-card')) return; const link = line.querySelector('a[href^="/call/"]'); if (!link) return;
    const c = byId.get(decodeURIComponent(link.getAttribute('href').slice(6))); if (!c || (c.stakeUsd == null && !(c.points > 0) && !c.creator)) return;
    const box = line.querySelector('.pv-call-media') || line.querySelector('.qb-call-thesis') || line.querySelector('.qb-postline-head');
    box?.after(h('p', {class: 'qcr-card'}, h('b', null, 'Callout '), callFacts(c).join(' · ')));
  });
  dress(); new MutationObserver(dress).observe(main, {childList: true, subtree: true});
  if (place()) return;
  const mo = new MutationObserver(() => { if (place()) mo.disconnect(); });
  mo.observe(main, {childList: true, subtree: true});
  setTimeout(() => { mo.disconnect(); if (!main.querySelector('.qcr')) (document.getElementById('qp-root') || main).before?.(sec); }, 8000);
}
if (typeof document !== 'undefined') mount();
