// /call/<id> in System A: the server draws the call (who, what, the thesis, the result since the call). This adds the site
// shell, the caller's face and verified X badge, the token's art, the caller's own position (only when the chain record is
// complete, from /api/community/call/<id>), reactions and Thank caller on the board post, and live Now prices.
import { ambient, setArt, xBadge, restart } from '/qx-a/components.mjs';
import { laneShell, QHOOKS_ART, face, person, h, fmt, RM, flashOnce, tokenMark, tokenArt, readMarkets, onMarkets, livePrice, positionBars, reactRow, boardPosts, priceIn, visiblePoll } from '/qx-a/pages/community-common.mjs';

const main = document.querySelector('main.qcall-main');
const d = main?.dataset || {};
const sym = d.symbol ? '$' + d.symbol : 'Call';
laneShell({ active: 'community', mode: 'detail', title: d.symbol ? sym + ' call' : 'Call', back: '/community' });
document.body.prepend(ambient()); setArt({ blur: QHOOKS_ART.blur });

if (main && d.call) {
  const board = d.kind === 'launch' ? { kind: 'launch', chainId: d.chain, controller: d.controller, token: d.token, symbol: d.symbol } : { kind: 'token', chainId: d.chain, address: d.address, symbol: d.symbol };
  // the caller's face and name
  const slot = main.querySelector('[data-face]');
  if (slot) slot.parentElement.replaceWith(face(d.author, 'xl'));
  person(d.author).then((p) => {
    const name = main.querySelector('.qcall-name');
    if (name && p.name) (name.querySelector('.cx-who__t') || name).textContent = p.name;
    if (p.x && !main.querySelector('.qcall-x')) main.querySelector('.qcall-meta')?.prepend(h('span', { class: 'qcall-x' }, h('a', { href: 'https://x.com/' + encodeURIComponent(p.x), target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, xBadge('@' + p.x))));
  });
  // the token's mark and art
  readMarkets().then(() => {
    const mark = main.querySelector('.qcall-token .cx-tok');
    if (mark) mark.replaceWith(tokenMark(board, null, 28));
    const art = tokenArt(board);
    if (art.blur || art.banner || art.logo) setArt({ blur: art.blur || art.banner || art.logo });
    paintNow(false);
  });
  // a trade that moves the token updates Now and the move since the call
  const box = main.querySelector('.qcall-outcome');
  function paintNow(flash) {
    if (!box) return;
    const entry = Number(box.dataset.entry), q = box.dataset.quote, now = livePrice(board, q);
    if (!(entry > 0 && now > 0)) return;
    const nowB = box.querySelector('[data-now]'), x = box.querySelector('[data-x]');
    const text = priceIn(now, q), parts = q && q !== 'USD' ? [text.replace(/ \S+$/, ''), h('small', { class: 'cx-unit' }, q)] : [text];
    if (nowB) { const before = nowB.textContent; nowB.replaceChildren(...parts); if (flash && before !== nowB.textContent) flashOnce(nowB); }
    if (x) { const m = now / entry, was = x.textContent; x.textContent = m >= 2 ? fmt.mult(m) : fmt.pct(m - 1); x.className = m >= 1 ? 'qa-up' : 'qa-down'; if (flash && was !== x.textContent) flashOnce(x); }
  }
  onMarkets(() => paintNow(true));
  visiblePoll(() => readMarkets(true), 20000);
  // the caller's own position, read from the chain (complete records only)
  fetch('/api/community/call/' + d.call, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    const bars = positionBars(j?.call?.position, Date.parse(j?.call?.entryAt || j?.call?.createdAt || ''));
    if (bars) document.getElementById('qcall-position')?.replaceChildren(bars);
  }).catch(() => {});
  // reactions, replies and Thank caller on the board post
  const social = document.getElementById('qcall-social');
  if (social) {
    const links = { permalink: d.permalink, trade: d.trade, board: d.boardLink };
    const row = reactRow({ id: d.call, author: d.author }, { call: true, links, replyHref: d.boardLink, buyLabel: null });
    social.replaceChildren(row);
    boardPosts(board).then((map) => { const p = map.get(d.call); if (!p) return; row.querySelector('.cx-reacts')?.setReactions?.(p); const r = row.querySelector('a[aria-label="Reply on the board"] span'); if (r && p.replies?.length) r.textContent = String(p.replies.length); });
  }
}
