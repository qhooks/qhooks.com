// System A, /create: one drawn diagram per launch idea, showing what that launch does (2026-11-12, "need variety").
// Shapes, gold lines and short labels only: no images, no clip-art. Each diagram has a still frame (reduced motion, or the
// idea is not in focus) and a loop that runs only while create-create.mjs says its card is on and the reel is on screen.
// Numbers come from the idea itself where they are cheap:
//  - the anti-snipe window: the card's own `snipe` seconds (qx-quick-launch-core.mjs CARDS), passed in as p.snipe;
//  - everything else: QSimpleLaunch._preset (the contract every one-tap launch goes through), copied into PRESET below.
//    lead/ideaart/art.test.mjs checks these against the card copy, so a preset change that the cards follow shows up here.
const NS = 'http://www.w3.org/2000/svg';
// QSimpleLaunch._preset (src-l200/prototypes/simple-launch/src/QSimpleLaunch.sol): FAIR and FLYWHEEL anti-snipe 50% → 0 over
// the snipe window; DEGEN launch tax 15% → 3%; COMMUNITY exit clock 10% → 0 over 3 days; HOURS extended 0.3%, overnight 0.5%,
// regular 0, storm fee fading over 3600 s; BURN 2% burn per buy + 2% tax all to buybacks; FLYWHEEL buyback every 900 s.
export const PRESET = Object.freeze({
  snipeTop: 50, launchTax: 15, afterTax: 3, exitTop: 10, exitFloor: 0, exitDays: 3,
  session: Object.freeze({ overnight: 0.5, extended: 0.3, regular: 0 }), stormFadeMin: 60, burn: 2, tax: 2, buybackMin: 15,
});
export const DEFAULT_SNIPE = 15;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const out = (x) => 1 - (1 - x) ** 2;
const lerp = (a, b, x) => a + (b - a) * x;
const r1 = (n) => Math.round(n * 10) / 10;
const fade = (t, a = 0.03, b = 0.94) => Math.min(seg(t, 0, a), 1 - seg(t, b, 1));
/// "15 s", "60 s", "5 min", "10 min" for an anti-snipe window in seconds.
export function windowText(s) {
  const n = Math.max(0, Math.round(Number(s) || 0));
  return n >= 120 ? (n % 60 ? (n / 60).toFixed(1) : n / 60) + ' min' : n + ' s';
}

// markup helpers (strings; every value is a number or a fixed label from this file)
const at = (o) => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => ` ${k}="${v}"`).join('');
const P = (d, c, k, x = {}) => `<path${at({ d, class: c, 'data-k': k, ...x })}/>`;
const C = (cx, cy, r, c, k, x = {}) => `<circle${at({ cx, cy, r, class: c, 'data-k': k, ...x })}/>`;
const R = (x, y, w, h, rx, c, k, o = {}) => `<rect${at({ x, y, width: w, height: h, rx, class: c, 'data-k': k, ...o })}/>`;
const T = (x, y, s, c = 'm-t', k, o = {}) => `<text${at({ x, y, class: c, 'data-k': k, ...o })}>${s}</text>`;
const G = (inner, k, x = {}) => `<g${at({ 'data-k': k, ...x })}>${inner}</g>`;
const END = { 'text-anchor': 'end' }, MID = { 'text-anchor': 'middle' };
const DRAW = { pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 };
// frame setters (only touch the DOM when the value changed)
const put = (n, k, v) => { if (!n) return; const s = typeof v === 'number' ? String(r1(v)) : v; if (n.getAttribute(k) !== s) n.setAttribute(k, s); };
const mv = (n, x, y) => put(n, 'transform', `translate(${r1(x)} ${r1(y)})`);
const op = (n, o) => put(n, 'opacity', String(Math.round(clamp(o) * 100) / 100));
const txt = (n, s) => { if (n && n.textContent !== s) n.textContent = s; };
const cls = (n, c, on) => { if (n && n.classList.contains(c) !== on) n.classList.toggle(c, on); };
const bez = (p0, p1, p2, p3, u) => { const v = 1 - u; return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3; };

// Each diagram: dur (ms per loop), still (the frame shown when not playing), build(p, glow) → markup, frame(r, t, p, k).
// t is the loop phase 0..1, k the loops played so far (for things that only go one way, like the Burn engine's supply).
const ART = {
  // One pool, steady: buys and sells pass through it the same size they went in.
  plain: {
    dur: 5600, still: 0.2,
    build: (p, gl) => gl(
      P('M20 102H300', 'm-hair') + P('M20 126H300', 'm-hair') + P('M126 114A34 34 0 0 0 194 114Z', 'm-fill') + C(160, 114, 34, 'm-tr', 'ring') +
      [0, 1, 2].map((i) => C(0, 102, 4.5, 'm-gdot', 'b' + i) + C(0, 126, 4.5, 'm-dot', 's' + i)).join(''),
    ) + T(20, 30, 'One pool', 'm-v') + T(300, 30, 'No tax on trades', 'm-t', null, END) + T(20, 92, 'Buys', 'm-t') + T(300, 146, 'Sells', 'm-t', null, END),
    frame(r, t) {
      let near = 0;
      for (let i = 0; i < 3; i++) {
        const u = (t + i / 3) % 1, xb = 20 + u * 280, xs = 300 - u * 280, o = clamp(Math.sin(Math.PI * u) * 1.6);
        mv(r['b' + i], xb, 0); op(r['b' + i], o); mv(r['s' + i], xs, 0); op(r['s' + i], o);
        near = Math.max(near, 1 - Math.min(1, Math.abs(xb - 160) / 34), 1 - Math.min(1, Math.abs(xs - 160) / 34));
      }
      put(r.ring, 'r', 34 + near * 2.5);
    },
  },
  // All the supply moves into one pool, the lid closes, and a pull bounces off it.
  'locked-pool': {
    dur: 6400, still: 0.72,
    build: (p, gl) => gl(
      R(36, 48, 44, 116, 12, 'm-tr2') + R(41, 53, 34, 106, 8, 'm-fill2', 'col') + P('M88 106H138', 'm-hair m-dash') +
      [0, 1, 2].map((i) => C(0, 106, 3.5, 'm-gdot', 'f' + i)).join('') +
      R(156, 62, 128, 98, 7, 'm-fill2', 'pool') + P('M150 52V152a14 14 0 0 0 14 14H276a14 14 0 0 0 14-14V52', 'm-tr') +
      P('M146 52H294', 'm-tr', 'lid', DRAW) + R(286, 45, 12, 14, 3, 'm-tr', 'latch') + C(146, 52, 3.5, 'm-gdot') +
      G(P('M220 150V98M211 107l9-9 9 9', 'm-ink'), 'pull'),
    ) + T(20, 30, '100% of supply', 'm-v') + T(300, 30, 'Locked', 'm-v', 'lockT', END) +
      T(58, 186, 'Supply', 'm-t', null, MID) + T(220, 186, 'Pool', 'm-t', null, MID),
    frame(r, t) {
      const m = ease(seg(t, 0.06, 0.36));
      put(r.col, 'y', 53 + 106 * m); put(r.col, 'height', 106 * (1 - m));
      put(r.pool, 'y', 160 - 98 * m); put(r.pool, 'height', 98 * m);
      for (let i = 0; i < 3; i++) { const u = seg(t, 0.06 + i * 0.07, 0.2 + i * 0.07); mv(r['f' + i], lerp(88, 138, u), 0); op(r['f' + i], u > 0 && u < 1 ? 1 : 0); }
      put(r.lid, 'stroke-dashoffset', 1 - ease(seg(t, 0.4, 0.52)));
      op(r.latch, seg(t, 0.5, 0.54)); op(r.lockT, seg(t, 0.52, 0.6));
      const up = ease(seg(t, 0.6, 0.7)), down = ease(seg(t, 0.75, 0.86));
      mv(r.pull, 0, -44 * up + 26 * down); op(r.pull, up > 0 ? 1 - seg(t, 0.78, 0.88) : 0);
      op(r.root, fade(t));
    },
  },
  // LP fees drop into three bands stacked around the price; the price runs, and the bands re-centre under it.
  'auto-range': {
    dur: 7200, still: 0.9,
    build: (p, gl) => gl(
      P('M20 152H300', 'm-hair') + G(R(-30, 82, 60, 70, 5, 'm-ghost') + P('M6 72H62', 'm-hair m-dash') + P('M56 67l6 5-6 5', 'm-hair'), 'was') +
      G(R(-100, 128, 200, 24, 5, 'm-band') + R(-60, 108, 120, 44, 5, 'm-band') + R(-30, 82, 60, 70, 5, 'm-fill2', 'core'), 'bands') +
      G(P('M0 62V156', 'm-tr') + C(0, 62, 4, 'm-gdot'), 'px') + [0, 1, 2].map((i) => C(0, 0, 3.5, 'm-gdot', 'f' + i)).join(''),
    ) + T(20, 30, 'Fees → liquidity', 'm-v') + T(300, 30, 'Re-centres on big moves', 'm-t', null, END) + T(20, 186, 'Price', 'm-t'),
    frame(r, t) {
      const x0 = 120, dx = 80, run = ease(seg(t, 0.42, 0.58)), follow = ease(seg(t, 0.64, 0.84));
      mv(r.px, x0 + dx * run, 0); mv(r.bands, x0 + dx * follow, 0); mv(r.was, x0, 0); op(r.was, seg(t, 0.6, 0.68));
      for (let i = 0; i < 3; i++) { const u = seg(t, 0.04 + i * 0.1, 0.2 + i * 0.1); mv(r['f' + i], x0 - 10 + i * 10, lerp(44, 92, out(u))); op(r['f' + i], u > 0 && u < 1 ? 1 : 0); }
      const fill = out(seg(t, 0.04, 0.4)); put(r.core, 'y', 96 - 14 * fill); put(r.core, 'height', 56 + 14 * fill);
      op(r.root, fade(t));
    },
  },
  // Fresh wallets buying in the same block share one cap: one gets through, the rest bounce off.
  'bundle-shield': {
    dur: 4600, still: 0.6,
    Y: [58, 81, 105, 129, 152],
    build: (p, gl) => gl(
      R(150, 42, 34, 126, 9, 'm-band') + P('M150 50V160', 'm-tr', 'edge') + P('M184 105H246', 'm-hair') + C(264, 105, 17, 'm-tr2') +
      [0, 1, 2, 3, 4].map((i) => C(0, 0, 5, i === 2 ? 'm-gdot' : 'm-dot', 'w' + i)).join(''),
    ) + T(20, 30, '1 buy cap per block', 'm-v') + T(167, 186, 'Same block', 'm-t', null, MID) +
      T(300, 30, windowText(p.snipe) + ' anti-snipe', 'm-t', null, END),
    frame(r, t) {
      const a = ease(seg(t, 0.04, 0.38)), b = seg(t, 0.38, 0.74), gone = 1 - seg(t, 0.86, 0.96);
      ART['bundle-shield'].Y.forEach((y0, i) => {
        const yc = lerp(y0, 105, 0.5);
        let x = lerp(24, 144, a), y = lerp(y0, yc, a), o = seg(t, 0.01, 0.06);
        if (b > 0) {
          if (i === 2) { x = lerp(144, 260, ease(b)); y = 105; o = 1 - seg(t, 0.7, 0.76); }
          else { const e = out(b); x = 144 - 44 * e; y = yc + (y0 - yc) * 0.5 * e; o = 1 - 0.68 * e; }
        }
        mv(r['w' + i], x, y); op(r['w' + i], o * gone);
      });
      op(r.edge, Math.max(0.18, 1 - Math.abs(t - 0.4) / 0.1));
    },
  },
  // The anti-snipe charge on a meter: 50% at the first block, 0 when the window ends.
  fair: {
    dur: 5600, still: 0.3,
    build: (p, gl) => {
      const ticks = [0, 10, 20, 30, 40, 50].map((v) => { const a = Math.PI - (v / 50) * Math.PI, c = Math.cos(a), s = Math.sin(a); return `M${r1(160 + 80 * c)} ${r1(150 - 80 * s)}L${r1(160 + 87 * c)} ${r1(150 - 87 * s)}`; }).join('');
      return gl(P('M68 150A92 92 0 0 1 252 150', 'm-hair') + P(ticks, 'm-tick') + P('M68 150A92 92 0 0 1 252 150', 'm-tr m-thick', 'arc') +
        P('M160 150L160 80', 'm-tr2', 'needle') + C(160, 150, 5, 'm-gdot')) +
        T(20, 30, 'Anti-snipe charge', 'm-t') + T(300, 30, 'Fades to 0 in ' + windowText(p.snipe), 'm-v', null, END) +
        T(68, 172, '0', 'm-t', null, MID) + T(252, 172, PRESET.snipeTop + '%', 'm-t', null, MID) + T(160, 190, PRESET.snipeTop + '%', 'm-big', 'val', MID);
    },
    frame(r, t) {
      const top = PRESET.snipeTop, v = t < 0.08 ? top : t < 0.8 ? top * (1 - (t - 0.08) / 0.72) : t < 0.9 ? 0 : top * ease(seg(t, 0.9, 1));
      const a = Math.PI - (v / top) * Math.PI, x = 160 + 92 * Math.cos(a), y = 150 - 92 * Math.sin(a);
      put(r.arc, 'd', `M68 150A92 92 0 0 1 ${r1(x)} ${r1(y)}`); op(r.arc, v > 0.2 ? 1 : 0);
      put(r.needle, 'd', `M160 150L${r1(160 + 72 * Math.cos(a))} ${r1(150 - 72 * Math.sin(a))}`);
      txt(r.val, Math.round(v) + '%');
    },
  },
  // The same charge over a long, gentle window while people buy in.
  'fair-slow': {
    dur: 7600, still: 0.45,
    BX: [52, 80, 112, 140, 176, 206, 238, 268],
    build: (p, gl) => {
      const ticks = [0, 1, 2, 3, 4, 5].map((i) => `M${r1(28 + i * 53.6)} 160v6`).join('');
      return gl(P('M28 62L296 160H28Z', 'm-fill') + P('M28 160H296', 'm-hair') + P(ticks, 'm-hair') + P('M28 62L296 160', 'm-tr') +
        P('M28 160V62', 'm-hair', 'cur') + ART['fair-slow'].BX.map((x, i) => C(x, 150, 3.6, 'm-dot', 'p' + i)).join('') + C(28, 62, 5, 'm-gdot', 'cd')) +
        T(20, 30, 'Anti-snipe charge', 'm-t') + T(300, 30, 'Fades to 0 in ' + windowText(p.snipe), 'm-v', null, END) +
        T(36, 56, PRESET.snipeTop + '%', 'm-v', 'cv') + T(28, 184, '0', 'm-t', null, MID) + T(296, 184, windowText(p.snipe), 'm-t', null, END);
    },
    frame(r, t) {
      const u = seg(t, 0.04, 0.86), x = 28 + 268 * u, y = 62 + 98 * u, f = 1 - seg(t, 0.93, 1);
      put(r.cur, 'd', `M${r1(x)} 160V${r1(y)}`); mv(r.cd, x - 28, y - 62);
      mv(r.cv, Math.min(x - 28, 214), y - 62); txt(r.cv, Math.round(PRESET.snipeTop * (1 - u)) + '%');
      ART['fair-slow'].BX.forEach((bx, i) => op(r['p' + i], seg(x, bx - 2, bx + 10) * f));
      op(r.cd, f); op(r.cv, f);
    },
  },
  // A day of US sessions: the fee steps with the session, and a sharp swing sets off the storm fee.
  hours: {
    dur: 7000, still: 0.58,
    X: (h) => 24 + (h * 272) / 24,
    fee: (h) => { const s = PRESET.session; return h < 4 || h >= 20 ? s.overnight : h < 9.5 || h >= 16 ? s.extended : s.regular; },
    feeY(h) { const base = 158 - this.fee(h) * 60, d = (h - 12.2) / (PRESET.stormFadeMin / 60); return d >= 0 && d < 1 ? Math.min(base, 112 + 46 * d) : base; },
    price: (h) => 88 + 5 * Math.sin(h * 1.3) + 3 * Math.sin(h * 3.1) - (h >= 12 ? 26 * Math.exp(-(h - 12) * 1.5) * Math.min(1, (h - 12) / 0.2) : 0),
    build(p, gl, U) {
      const A = ART.hours, X = A.X, Y = (h) => r1(158 - A.fee(h) * 60), fx = (h) => r1(X(h));
      const fee = `M${fx(0)} ${Y(0)}H${fx(4)}V${Y(5)}H${fx(9.5)}V${Y(12)}H${fx(12.2)}V112L${fx(12.2 + PRESET.stormFadeMin / 60)} ${Y(13)}H${fx(16)}V${Y(17)}H${fx(20)}V${Y(21)}H${fx(24)}`;
      const price = 'M' + Array.from({ length: 97 }, (_, i) => { const h = i / 4; return `${r1(X(h))} ${r1(A.price(h))}`; }).join('L');
      return `<defs><clipPath id="${U}c"><rect data-k="clip" x="20" y="20" width="0" height="170"/></clipPath></defs>` +
        gl(P(price, 'm-ink m-thin') + P(fee, 'm-tr2') + P(fee, 'm-tr', null, { 'clip-path': `url(#${U}c)` }) + P('M24 44V166', 'm-hair', 'cur') + C(0, 0, 4.5, 'm-gdot', 'cd')) +
        T(20, 30, 'US market sessions', 'm-t') + T(24, 68, 'Price', 'm-t') + T(r1(X(12.75)), 182, 'Market open', 'm-t', null, MID) +
        T(r1(X(12.2) + 14), 116, 'Storm fee', 'm-v', 'st');
    },
    frame(r, t) {
      const A = ART.hours, h = 24 * seg(t, 0.02, 0.96), x = A.X(h);
      put(r.clip, 'width', x - 20); put(r.cur, 'd', `M${r1(x)} 44V166`); mv(r.cd, x, A.feeY(h));
      op(r.st, h >= 12.2 ? 1 : 0.45); op(r.root, fade(t, 0.02, 0.97));
    },
  },
  // Every buy burns a slice, and the tax buys back and burns more: the supply bar only gets shorter.
  burn: {
    dur: 4800, still: 0.66, stillK: 4.66,
    build: (p, gl) => gl(
      R(20, 42, 280, 12, 6, 'm-ghost') + R(20, 42, 280, 12, 6, 'm-fill2', 'sup') + P('M20 112H300', 'm-hair') +
      P('M150 118V170', 'm-tr2 m-dash') + P('M150 112C190 112 236 128 236 170', 'm-tr2 m-dash') + P('M112 172H300', 'm-tr') +
      C(150, 112, 4, 'm-gdot') + C(0, 112, 5.5, 'm-dot', 'bd') + C(0, 0, 3.4, 'm-gdot', 'fa') + C(0, 0, 3.4, 'm-gdot', 'fb') +
      [0, 1, 2, 3, 4, 5].map((i) => C(0, 0, 1.8, 'm-gdot', 'pt' + i)).join(''),
    ) + T(20, 32, 'Supply', 'm-t') + T(142, 150, PRESET.burn + '% per buy', 'm-t', null, END) + T(244, 142, 'Buyback', 'm-t') + T(300, 190, 'Burned', 'm-v', null, END),
    frame(r, t, p, k) {
      const a = seg(t, 0.04, 0.42), b = seg(t, 0.42, 0.92);
      mv(r.bd, a < 1 ? lerp(20, 150, ease(a)) : lerp(150, 300, b), 0); op(r.bd, a < 1 ? seg(t, 0.04, 0.1) : 1 - b);
      const da = seg(t, 0.42, 0.6), db = seg(t, 0.46, 0.74);
      mv(r.fa, 150, lerp(112, 172, da * da)); op(r.fa, da > 0 && da < 1 ? 1 : 0);
      mv(r.fb, bez(150, 190, 236, 236, db), bez(112, 112, 128, 172, db)); op(r.fb, db > 0 && db < 1 ? 1 : 0);
      for (let i = 0; i < 6; i++) {
        const [x0, s] = i < 3 ? [150, seg(t, 0.6, 0.72)] : [236, seg(t, 0.74, 0.86)], dir = (i % 3) - 1;
        mv(r['pt' + i], x0 + dir * 12 * s, 172 - 16 * out(s) + (i % 3 === 1 ? -6 * s : 0)); op(r['pt' + i], s > 0 && s < 1 ? 1 - s : 0);
      }
      const burned = 2 * Math.floor(k) + ease(seg(t, 0.6, 0.68)) + ease(seg(t, 0.74, 0.82));
      put(r.sup, 'width', 280 - Math.min(124, 3.1 * burned));
    },
  },
  // Holder first: the sell charge falls each hour you hold, from the top rate right after a buy to 0 at the horizon.
  community: {
    dur: 6400, still: 0.3,
    feeAt: (u) => PRESET.exitTop - (PRESET.exitTop - PRESET.exitFloor) * u,
    build: (p, gl) => {
      const A = ART.community, w = 260 / 12;
      const bars = Array.from({ length: 12 }, (_, i) => { const h = A.feeAt((i + 0.5) / 12) * 9.6; return R(r1(30 + i * w + 4), r1(158 - h), 13, r1(h), 3, 'm-bar', 'b' + i); }).join('');
      return gl(bars + P('M30 158H290', 'm-hair') + P(`M30 ${r1(158 - PRESET.exitTop * 9.6)}L290 ${r1(158 - PRESET.exitFloor * 9.6)}`, 'm-tr2 m-dash') + C(30, r1(158 - PRESET.exitTop * 9.6), 5, 'm-gdot', 'hd')) +
        T(20, 30, 'Sell charge', 'm-t') + T(300, 38, PRESET.exitTop + '%', 'm-big', 'val', END) +
        T(30, 178, 'Right after a buy', 'm-t') + T(290, 178, PRESET.exitDays + ' days', 'm-t', null, END);
    },
    frame(r, t) {
      const A = ART.community, u = seg(t, 0.06, 0.86), cur = Math.min(11, Math.floor(u * 12));
      for (let i = 0; i < 12; i++) cls(r['b' + i], 'on', i === cur);
      mv(r.hd, 260 * u, PRESET.exitTop * 9.6 * u - PRESET.exitFloor * 9.6 * u);
      txt(r.val, Math.round(A.feeAt(u)) + '%'); op(r.root, fade(t, 0.03, 0.95));
    },
  },
  // Pot arena: the biggest buy takes one pot; every buy resets the clock, and the last buyer takes the other.
  arena: {
    dur: 6000, still: 0.8,
    H: [34, 58, 26, 84, 44], BT: [0.06, 0.19, 0.32, 0.45, 0.58],
    build: (p, gl) => gl(
      P('M24 150H136', 'm-hair') + ART.arena.H.map((h, i) => R(32 + i * 22, 150, 12, 0, 3, 'm-bar', 'a' + i)).join('') + P('M0 0H18', 'm-tr', 'king') +
      C(236, 104, 34, 'm-hair') + C(236, 104, 34, 'm-tr m-thick', 'clock', { ...DRAW, transform: 'rotate(-90 236 104)' }) + C(236, 104, 34, 'm-tr2', 'pulse') + C(236, 104, 4, 'm-gdot'),
    ) + T(20, 30, PRESET.launchTax + '% → ' + PRESET.afterTax + '% tax', 'm-v') + T(80, 176, 'Biggest buy', 'm-t', null, MID) + T(236, 176, 'Last buyer', 'm-t', null, MID),
    frame(r, t) {
      const A = ART.arena;
      let last = -1, top = -1;
      A.H.forEach((h, i) => {
        const g = ease(seg(t, A.BT[i], A.BT[i] + 0.07)), hh = h * g;
        put(r['a' + i], 'y', 150 - hh); put(r['a' + i], 'height', hh);
        if (g > 0) { last = i; if (top < 0 || h > A.H[top]) top = i; }
      });
      A.H.forEach((h, i) => { cls(r['a' + i], 'on', i === top); cls(r['a' + i], 'win', i === last && t > 0.92 && i !== top); });
      if (top >= 0) mv(r.king, 29 + top * 22, 150 - A.H[top] * ease(seg(t, A.BT[top], A.BT[top] + 0.07)) - 9);
      op(r.king, top >= 0 ? 1 : 0);
      const since = last < 0 ? 1 : seg(t, A.BT[last], A.BT[last] + 0.34);
      put(r.clock, 'stroke-dashoffset', last < 0 ? 1 : since);
      const pulse = Math.max(last >= 0 ? 1 - seg(t, A.BT[last], A.BT[last] + 0.1) : 0, seg(t, 0.92, 0.94) * (1 - seg(t, 0.94, 1)));
      put(r.pulse, 'r', 34 + 12 * (1 - pulse)); op(r.pulse, pulse * 0.8);
      op(r.root, fade(t, 0.02, 0.97));
    },
  },
  // Stakers' share: every trade's tax splits three ways; the buyback side runs on a 15-minute clock.
  stakers: {
    dur: 5200, still: 0.5, stillK: 2.5,
    B: [[110, 100, 150, 100, 166, 52, 212, 52], [110, 100, 150, 100, 170, 100, 212, 100], [110, 100, 150, 100, 166, 148, 212, 148]],
    build: (p, gl) => gl(
      P('M20 100H110', 'm-hair') + ART.stakers.B.map(([a, b, c, d, e, f, g, h]) => P(`M${a} ${b}C${c} ${d} ${e} ${f} ${g} ${h}`, 'm-tr2')).join('') +
      C(224, 52, 9, 'm-hair') + C(224, 52, 9, 'm-tr', 'ring', { ...DRAW, transform: 'rotate(-90 224 52)' }) + C(224, 52, 9, 'm-tr2', 'rp') +
      C(216, 100, 4, 'm-gdot') + C(216, 148, 4, 'm-gdot') + C(110, 100, 5.5, 'm-gdot') +
      C(0, 100, 5, 'm-dot', 'd') + [0, 1, 2].map((i) => C(0, 0, 3.6, 'm-gdot', 'q' + i)).join(''),
    ) + T(20, 88, 'Trades', 'm-t') + T(110, 84, PRESET.tax + '% tax', 'm-v', null, MID) +
      T(240, 50, 'Buyback', 'm-t') + T(240, 65, 'every ' + PRESET.buybackMin + ' min', 'm-s') + T(228, 104, 'Stakers', 'm-t') + T(228, 152, 'Referrers', 'm-t'),
    frame(r, t, p, k) {
      const A = ART.stakers, a = seg(t, 0.04, 0.3), b = seg(t, 0.3, 0.62);
      mv(r.d, lerp(20, 110, ease(a)), 0); op(r.d, a > 0 && a < 1 ? 1 : 0);
      A.B.forEach(([x0, y0, x1, y1, x2, y2, x3, y3], i) => { const u = ease(b); mv(r['q' + i], bez(x0, x1, x2, x3, u), bez(y0, y1, y2, y3, u)); op(r['q' + i], b > 0 && b < 1 ? 1 : 0); });
      const n = Math.floor(k) % 3, fill = (n + ease(seg(t, 0.62, 0.7))) / 3;
      put(r.ring, 'stroke-dashoffset', 1 - fill);
      const runs = n === 2 ? seg(t, 0.72, 0.98) : 0;
      put(r.rp, 'r', 9 + 14 * runs); op(r.rp, runs > 0 ? 1 - runs : 0);
    },
  },
  // Arb burns: a price gap opens between your pool and another; the shared contract closes it and the token it buys burns.
  'arb-burns': {
    dur: 5400, still: 0.6,
    build: (p, gl) => gl(
      R(46, 50, 48, 110, 10, 'm-tr2') + R(226, 50, 48, 110, 10, 'm-tr2') +
      R(50, 105, 40, 51, 6, 'm-fill2', 'lf') + R(230, 105, 40, 51, 6, 'm-fill2', 'rf') +
      P('M50 105H90', 'm-tr', 'll') + P('M230 105H270', 'm-tr', 'rl') + P('M98 105H222', 'm-hair m-dash', 'gl') + P('M160 105V105', 'm-tr', 'gap') +
      P('M94 74C130 28 190 28 226 74', 'm-hair m-dash') + C(0, 0, 4.5, 'm-gdot', 'ad') + P('M124 178H196', 'm-tr') + C(160, 40, 3.4, 'm-gdot', 'fr') +
      [0, 1, 2].map((i) => C(0, 0, 1.8, 'm-gdot', 'pt' + i)).join(''),
    ) + T(168, 112, 'Gap', 'm-v', 'gt') + T(70, 182, 'Your pool', 'm-t', null, MID) + T(250, 182, 'Other pool', 'm-t', null, MID) + T(160, 196, 'Burned', 'm-t', null, MID),
    frame(r, t) {
      const d = ease(seg(t, 0.05, 0.3)) * (1 - ease(seg(t, 0.56, 0.68))), yl = 105 + 16 * d, yr = 105 - 16 * d;
      for (const [k, x0, y] of [['l', 50, yl], ['r', 230, yr]]) { put(r[k + 'f'], 'y', y); put(r[k + 'f'], 'height', 156 - y); put(r[k + 'l'], 'd', `M${x0} ${r1(y)}H${x0 + 40}`); }
      put(r.gap, 'd', `M160 ${r1(yr)}V${r1(yl)}`); op(r.gap, d > 0.08 ? 1 : 0); op(r.gt, d); put(r.gl, 'd', `M98 ${r1(yl)}H160M160 ${r1(yr)}H222`); op(r.gl, d);
      const u = seg(t, 0.32, 0.56), e = ease(u);
      mv(r.ad, bez(94, 130, 190, 226, e), bez(74, 28, 28, 74, e)); op(r.ad, u > 0 && u < 1 ? 1 : 0);
      const f = seg(t, 0.46, 0.68);
      mv(r.fr, 0, 138 * f * f); op(r.fr, f > 0 && f < 1 ? 1 : 0);
      const s = seg(t, 0.68, 0.8);
      for (let i = 0; i < 3; i++) { mv(r['pt' + i], 160 + (i - 1) * 12 * s, 178 - 16 * out(s)); op(r['pt' + i], s > 0 && s < 1 ? 1 - s : 0); }
    },
  },
  // Sale first: one price for everyone fills the sale; past the minimum it closes and the pool opens with both sides.
  'sale-first': {
    dur: 6600, still: 0.9,
    BT: [0.04, 0.11, 0.18, 0.25, 0.32], LV: [0.18, 0.36, 0.52, 0.7, 0.86], MIN: 0.4,
    build: (p, gl) => {
      const mx = 20 + 280 * ART['sale-first'].MIN;
      return gl(R(20, 50, 280, 16, 8, 'm-ghost') + R(20, 50, 0, 16, 8, 'm-fill2', 'sf') + C(20, 58, 6, 'm-tr2', 'hp') + P(`M${mx} 42V74`, 'm-tr2', 'mk') +
        P('M160 70V104', 'm-tr', 'pl', DRAW) + P('M160 104A24 24 0 0 0 160 152Z', 'm-fill2', 'h0') + P('M160 104A24 24 0 0 1 160 152Z', 'm-fill', 'h1') +
        C(160, 128, 24, 'm-tr', 'pr', { ...DRAW, transform: 'rotate(-90 160 128)' }) +
        P('M184 128C204 128 210 114 226 116S252 102 268 106S290 94 300 96', 'm-tr', 'tt', DRAW)) +
        T(20, 30, 'Sale at one price', 'm-t') + T(mx, 90, 'Min', 'm-t', 'mt', MID) + T(160, 176, 'Pool opens', 'm-v', 'po', MID);
    },
    frame(r, t) {
      const A = ART['sale-first'];
      let lv = 0, pulse = 0;
      A.BT.forEach((b, i) => { const g = ease(seg(t, b, b + 0.05)); if (g > 0) lv = lerp(i ? A.LV[i - 1] : 0, A.LV[i], g); pulse = Math.max(pulse, seg(t, b, b + 0.05) * (1 - seg(t, b + 0.05, b + 0.09))); });
      put(r.sf, 'width', 280 * lv); mv(r.hp, 280 * lv, 0); op(r.hp, pulse); put(r.hp, 'r', 6 + 6 * pulse);
      cls(r.mk, 'on', lv >= A.MIN); op(r.mt, lv >= A.MIN ? 1 : 0.6);
      put(r.pl, 'stroke-dashoffset', 1 - ease(seg(t, 0.4, 0.48)));
      put(r.pr, 'stroke-dashoffset', 1 - ease(seg(t, 0.48, 0.6)));
      op(r.h0, seg(t, 0.56, 0.64)); op(r.h1, seg(t, 0.58, 0.66)); op(r.po, seg(t, 0.56, 0.64));
      put(r.tt, 'stroke-dashoffset', 1 - ease(seg(t, 0.62, 0.84)));
      op(r.root, fade(t, 0.02, 0.95));
    },
  },
};
export const ART_IDS = Object.freeze(Object.keys(ART));
export const hasArt = (id) => Object.prototype.hasOwnProperty.call(ART, id);

/// The diagram's markup for an idea (no DOM): the still frame is applied once mounted. `U` keeps ids unique on the page.
export function artMarkup(id, p = {}, U = 'ia0') {
  const d = ART[id] || ART.plain, q = { snipe: DEFAULT_SNIPE, ...p };
  const gl = (inner) => `<g class="m-glow" filter="url(#${U}g)">${inner}</g>`;
  return `<defs><filter id="${U}g" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="200" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="3"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .55 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
    `<g data-k="root">${d.build(q, gl, U)}</g>`;
}
/// Runs one frame against a lookup of the diagram's [data-k] nodes (exported for the lead test's fake nodes).
export function artFrame(id, refs, t, p = {}, k = 2 + t) { const d = ART[id] || ART.plain; d.frame(refs, t, { snipe: DEFAULT_SNIPE, ...p }, k); }
export const artStill = (id) => { const d = ART[id] || ART.plain; return { t: d.still, k: d.stillK ?? 2 + d.still, dur: d.dur }; };

// One rAF loop for every playing diagram (normally one: the idea in focus).
const live = new Set();
let raf = 0;
function tick(now) {
  raf = 0;
  for (const a of live) { if (!a.svg.isConnected) { live.delete(a); continue; } a.step(now); }
  if (live.size) raf = requestAnimationFrame(tick);
}
let uid = 0;
/// A diagram for one idea card: { svg, play(on) }. `motion: false` (reduced motion) keeps it on its still frame.
export function ideaArt(id, p = {}, { motion = true } = {}) {
  const d = ART[id] || ART.plain, U = 'ia' + (++uid), q = { snipe: DEFAULT_SNIPE, ...p };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 200'); svg.setAttribute('class', 'cr-motif'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.innerHTML = artMarkup(id, q, U);
  const refs = {};
  for (const n of svg.querySelectorAll('[data-k]')) refs[n.getAttribute('data-k')] = n;
  let k = d.stillK ?? 2 + d.still, start = 0;
  const draw = () => d.frame(refs, k % 1, q, k);
  draw();
  const a = {
    svg, playing: false,
    step(now) { k = (now - start) / d.dur; draw(); },
    play(on) {
      const want = !!on && motion;
      if (want === a.playing) return;
      a.playing = want;
      if (want) { start = performance.now() - k * d.dur; live.add(a); if (!raf) raf = requestAnimationFrame(tick); }
      else live.delete(a);
    },
  };
  return a;
}
