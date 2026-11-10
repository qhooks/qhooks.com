import { candleBar } from "./qx-perps-core.mjs";
async function info(body, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12e3) });
  if (!r.ok) throw Error("Refreshing");
  return r.json();
}
const INTERVALS = { "1m": 6e4, "5m": 3e5, "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };
async function candles(coin, interval, options = {}) {
  if (!INTERVALS[interval]) throw Error("Choose a timeframe.");
  const endTime = options.now ?? Date.now(), rows = await info({ type: "candleSnapshot", req: { coin, interval, startTime: endTime - INTERVALS[interval] * 200, endTime } }, options);
  if (!Array.isArray(rows)) throw Error("Refreshing");
  return [...new Map(rows.map(candleBar).filter(Boolean).map((b) => [b.time, b])).values()].sort((a, b) => a.time - b.time);
}
async function account(owner, options = {}) {
  const [state, orders] = await Promise.all([info({ type: "clearinghouseState", user: owner }, options), info({ type: "frontendOpenOrders", user: owner }, options)]);
  if (!state?.marginSummary || !Array.isArray(orders)) throw Error("Refreshing");
  return { state, orders };
}
function liveFeed({ onMids, onCandle, onStatus, WebSocketImpl = WebSocket, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval } = {}) {
  let socket, selection, closed = false, last = 0;
  const send = (method, subscription) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify({ method, subscription }));
  };
  const connect = () => {
    if (closed) return;
    onStatus("Refreshing");
    try {
      socket = new WebSocketImpl("wss://api.hyperliquid.xyz/ws");
      socket.onopen = () => {
        last = Date.now();
        onStatus("Live");
        send("subscribe", { type: "allMids" });
        if (selection) send("subscribe", { type: "candle", ...selection });
      };
      socket.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data);
          last = Date.now();
          if (p.channel === "allMids") {
            onMids(p.data.mids);
            onStatus("Live");
          }
          if (p.channel === "candle" && p.data.s === selection?.coin && p.data.i === selection?.interval) {
            const b = candleBar(p.data);
            if (b) onCandle(b);
          }
        } catch {
        }
      };
      socket.onerror = () => onStatus("Refreshing");
      socket.onclose = () => {
        socket = null;
        onStatus("Refreshing");
      };
    } catch {
      onStatus("Refreshing");
    }
  };
  connect();
  const timer = setIntervalImpl(() => {
    if (closed) return;
    if (socket?.readyState === 1) {
      if (Date.now() - last > 45e3) {
        socket.close();
        onStatus("Refreshing");
      } else send("ping", void 0);
    } else connect();
  }, 15e3);
  return { select(coin, interval) {
    if (selection) send("unsubscribe", { type: "candle", ...selection });
    selection = { coin, interval };
    send("subscribe", { type: "candle", ...selection });
  }, isLive: () => socket?.readyState === 1 && Date.now() - last < 3e4, dispose() {
    closed = true;
    clearIntervalImpl(timer);
    socket?.close();
  } };
}
export {
  INTERVALS,
  account,
  candles,
  info,
  liveFeed
};
