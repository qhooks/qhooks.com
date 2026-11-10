// Trade page: "Locked with QLocks" pill for the selected pool's token, linking to /qlocks.
// Counts token locks in QLocks v1 and v2 and LP positions in v2. Grants (QGrants) are never counted.
// Mounts into #qlk-badge (or before the team-tokens card #qtl when that slot is absent).
import { calldata, ethCall, words, codeAt, rpc, h } from '/qx-chain.mjs';
import { extraAddress } from '/qx-extras.mjs';
import { badgeModel } from '/qx-qlocks-core.mjs';

let art, seq = 0;
const v2 = () => (art ||= fetch('/full-launch/qlocks-v2.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(a => a?.contracts?.locksV2 || null).catch(() => null));
const slot = () => document.getElementById('qlk-badge') || (() => { const c = document.getElementById('qtl'); if (!c) return null; const s = h('div', { id: 'qlk-badge' }); c.before(s); return s; })();

async function show(pool) {
  const mine = ++seq, el = slot(); if (!el || !pool?.chainId) return;
  try {
    const chainId = pool.chainId, c = pool.constructor, token = c.currency0 === c.quote ? c.currency1 : c.currency0;
    const [l1, l2] = [await extraAddress('locks'), await v2()];
    const has = async a => a && (await codeAt(chainId, a)) !== '0x';
    const [on1, on2] = await Promise.all([has(l1), has(l2?.address)]);
    const sum = async a => words(await ethCall(chainId, a, calldata('0x9522a80a', ['address'], [token])));
    const s1 = on1 ? await sum(l1) : [0n, 0n, 0n, 0n, 0n], s2 = on2 ? await sum(l2.address) : [0n, 0n, 0n, 0n, 0n];
    const lp = on2 ? words(await ethCall(chainId, l2.address, calldata(l2.selectors.lpSummary, ['address'], [token]))) : [0n, 0n, 0n, 0n];
    const supply = BigInt(await ethCall(chainId, token, '0x18160ddd'));
    const now = Number(BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp));
    const next = [s1[3], s2[3]].filter(Boolean).map(Number);
    const m = badgeModel({ supply, now, summary: { locked: s1[0] + s2[0], announced: s1[2] + s2[2], nextReady: next.length ? Math.min(...next) : 0 }, lp: { positions: lp[0], permanent: lp[1], nextReady: lp[3] } });
    if (mine !== seq) return;
    if (!m.any) { el.replaceChildren(); return; }
    el.replaceChildren(h('a', { class: 'qlk-pill' + (m.level === 'notice' ? ' qlk-notice' : ''), href: '/qlocks?chain=' + chainId + '&token=' + token, title: m.lines.join(' · ') }, m.title + ' · ' + m.lines.join(' · ')));
  } catch { if (mine === seq) el.replaceChildren(); }
}
document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
