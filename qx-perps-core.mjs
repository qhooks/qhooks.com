import { formatPrice, formatSize } from "./vendor/hyperliquid/hl.mjs";
const RISK = "Perps are leveraged. Positions can be liquidated and you can lose your margin.";
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const COUNTRIES = new Set("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" "));
function canTrade(country) {
  return COUNTRIES.has(country);
}
function normalizeConfig(raw) {
  if (!raw || raw.builder !== null && (!ADDRESS.test(raw.builder) || /^0x0{40}$/i.test(raw.builder))) throw Error("Check the perps configuration.");
  if (Number(raw.builderFeeTenthsBp) !== 50) throw Error("Check the perps fee configuration.");
  return { builder: raw.builder?.toLowerCase() ?? null, builderFeeTenthsBp: 50 };
}
function withBuilder(action, config) {
  const c = normalizeConfig(config);
  const { builder: ignored, ...rest } = action;
  return { ...rest, ...c.builder ? { builder: { b: c.builder, f: c.builderFeeTenthsBp } } : {} };
}
function marketsFrom(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0]?.universe) || !Array.isArray(payload[1])) throw Error("Refreshing");
  return payload[0].universe.map((m, asset) => {
    const ctx = payload[1][asset] || {}, mid = Number(ctx.midPx || ctx.markPx), prev = Number(ctx.prevDayPx);
    return { ...m, asset, mid, mark: Number(ctx.markPx), change: prev > 0 ? (mid / prev - 1) * 100 : null, funding: Number(ctx.funding), openInterest: Number(ctx.openInterest) };
  }).filter((m) => !m.isDelisted);
}
function positive(v, label) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw Error("Enter a valid " + label + ".");
  return n;
}
function marketPrice(mid, buy, slippage = 1, szDecimals = 5) {
  const slip = Number(slippage);
  if (!Number.isFinite(slip) || slip <= 0 || slip > 5) throw Error("Slippage must be above 0 and at most 5%.");
  return formatPrice(positive(mid, "price") * (1 + (buy ? 1 : -1) * slip / 100), szDecimals, "perp");
}
function triggerOrders({ market, buy, size, tp, sl, reference }) {
  const out = [];
  for (const [tpsl, value] of [["tp", tp], ["sl", sl]]) {
    if (value === void 0 || value === null || value === "") continue;
    const px = formatPrice(positive(value, tpsl === "tp" ? "take profit" : "stop loss"), market.szDecimals, "perp"), target = Number(px);
    if (tpsl === "tp" === (buy ? target <= reference : target >= reference)) throw Error("Check the TP/SL side and price.");
    out.push({ a: market.asset, b: !buy, p: marketPrice(target, !buy, 5, market.szDecimals), s: size, r: true, t: { trigger: { isMarket: true, triggerPx: px, tpsl } } });
  }
  return out;
}
function buildEntry({ market, buy = true, kind = "market", amount, unit = "USDC", limit, slippage = 1, tp, sl, reduceOnly = false }, config) {
  if (!market || !Number.isInteger(market.asset)) throw Error("Choose a market.");
  if (!["market", "limit"].includes(kind) || !["USDC", "coin"].includes(unit)) throw Error("Check the order type and size unit.");
  const reference = kind === "limit" ? Number(formatPrice(positive(limit, "limit price"), market.szDecimals, "perp")) : positive(market.mid, "price");
  const size = formatSize(positive(amount, "size") / (unit === "USDC" ? reference : 1), market.szDecimals);
  if (!reduceOnly && Number(size) * reference < 10) throw Error("Minimum order is 10 USDC.");
  const brackets = triggerOrders({ market, buy, size, tp, sl, reference });
  if (reduceOnly && brackets.length) throw Error("Use Set TP/SL on a position.");
  return withBuilder({ orders: [{ a: market.asset, b: buy, p: kind === "market" ? marketPrice(reference, buy, slippage, market.szDecimals) : String(reference), s: size, r: !!reduceOnly, t: { limit: { tif: kind === "market" ? "Ioc" : "Gtc" } } }, ...brackets], grouping: brackets.length ? "normalTpsl" : "na" }, config);
}
function positionsFrom(state) {
  return (state?.assetPositions || []).map((x) => x.position).filter((p) => p && Number.isFinite(Number(p.szi)) && Number(p.szi) !== 0);
}
function buildCloseAll(positions, markets, config, slippage = 1) {
  const orders = positions.filter((p) => Number(p.szi) !== 0).map((p) => {
    const market = markets.find((m) => m.name === p.coin);
    if (!market) throw Error("Refresh markets before closing " + p.coin + ".");
    return buildEntry({ market, buy: Number(p.szi) < 0, amount: Math.abs(Number(p.szi)), unit: "coin", slippage, reduceOnly: true }, config).orders[0];
  });
  if (!orders.length) throw Error("No open positions.");
  return withBuilder({ orders, grouping: "na" }, config);
}
function buildPositionTpsl(position, market, { tp, sl }, config) {
  const orders = triggerOrders({ market, buy: Number(position.szi) > 0, size: formatSize(Math.abs(Number(position.szi)), market.szDecimals), tp, sl, reference: positive(market.mid, "price") });
  if (!orders.length) throw Error("Enter a TP or SL price.");
  return withBuilder({ orders, grouping: "positionTpsl" }, config);
}
function estimatedLiquidation({ mid, buy, leverage, maxLeverage }) {
  const mm = 1 / (2 * Number(maxLeverage));
  return Math.max(0, Number(mid) * (buy ? 1 - 1 / Number(leverage) + mm : 1 + 1 / Number(leverage) - mm));
}
function candleBar(c) {
  const bar = { time: Math.floor(Number(c.t) / 1e3), open: Number(c.o), high: Number(c.h), low: Number(c.l), close: Number(c.c) };
  return Object.values(bar).every(Number.isFinite) && bar.low > 0 && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close) ? bar : null;
}
function orderResult(result) {
  if (result?.status !== "ok") throw Error("The request was not accepted. Refresh your account.");
  const statuses = result.response?.data?.statuses;
  if (statuses) {
    const errors = statuses.map((s, i) => s?.error ? "Order " + (i + 1) + ": " + s.error : null).filter(Boolean);
    if (errors.length) throw Error(errors.join(" ") + " Refresh positions and orders before retrying.");
  }
  return result;
}
export {
  ADDRESS,
  RISK,
  buildCloseAll,
  buildEntry,
  buildPositionTpsl,
  canTrade,
  candleBar,
  estimatedLiquidation,
  marketPrice,
  marketsFrom,
  normalizeConfig,
  orderResult,
  positionsFrom,
  positive,
  withBuilder
};
