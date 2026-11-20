/* Agents tab (contract 1.2.6 + 1.3.5). Written by Claude in QHooks' own words.
   Activity rows are sample data until the live agent feed is wired. */
window.Agents = (function () {
  "use strict";
  var MCP = "https://qhooks.com/mcp";
  var ACTIVITY = [
    ["2m", "Agent paid for a fresh QProof scan", "$0.25 USDG"],
    ["9m", "Agent prepared a buy on Robinhood Chain", "0.05 ETH"],
    ["21m", "Escrow tranche released by attestation", "1 USDG"],
    ["34m", "Agent read a stored QProof report", "$0.02 USDG"],
    ["1h", "Agent launched a token with the Standard hooks", "Base"]
  ];
  function render(root) {
    root.innerHTML =
      '<div class="ag-wrap">' +
      '<section class="ag-hero"><div class="ag-kicker">AGENTS</div><h1>Give your agent the whole of QHooks</h1>' +
      '<p>Trading on six EVM chains, launches, escrow, OTC and token safety checks through one MCP link. No API key. Your agent’s own wallet signs every transaction.</p>' +
      '<div class="ag-install"><code>' + MCP + '</code><button class="ag-copy">Copy link</button></div>' +
      '<div class="ag-paths"><a class="ag-path" href="https://qhooks.com/skill.md">Read the agent guide</a><span class="ag-path">npm i @qhooks/mcp</span><span class="ag-path">Works with Claude, Cursor and any MCP client</span></div>' +
      '<div class="ag-price">QProof: stored report $0.02 · fresh scan $0.25 · pay per call over x402 in USDC on Base or USDG on Robinhood Chain</div></section>' +
      '<section class="ag-grid"><div class="ag-card"><h2>Agent activity <span class="po-sample">Sample data</span></h2>' +
      ACTIVITY.map(function (a) { return '<div class="ag-row"><span class="ag-age">' + a[0] + "</span><span>" + a[1] + '</span><b>' + a[2] + "</b></div>"; }).join("") +
      '</div><div class="ag-card"><h2>Live with</h2><div class="ag-partners"><span>Autonomo</span><span>Nomad</span><span>Zolva</span></div>' +
      '<h2 style="margin-top:16px">Earn for the traders you bring</h2><p class="ag-small">Pass your wallet as referrer, or open sessions with your ref link, and earn a share of the router fee on every trade your agent routes.</p></div></section></div>';
    root.querySelector(".ag-copy").onclick = function (e) {
      try { navigator.clipboard.writeText(MCP); e.target.textContent = "Copied"; } catch (x) { e.target.textContent = MCP; }
    };
  }
  var css = document.createElement("style");
  css.textContent =
    ".ag-wrap{padding:16px;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:12px}" +
    ".ag-hero{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:20px}" +
    ".ag-kicker{font-size:11px;letter-spacing:.06em;color:var(--acc)}.ag-hero h1{font-size:24px;margin:6px 0}.ag-hero p{color:var(--mut);max-width:720px}" +
    ".ag-install{display:flex;gap:8px;align-items:center;margin:12px 0}.ag-install code{background:var(--s2);border:1px solid var(--line);border-radius:4px;padding:8px 10px;font-size:13px}" +
    ".ag-copy{height:34px;border:0;border-radius:4px;background:var(--acc);color:#140d00;font-weight:600;padding:0 12px;cursor:pointer}" +
    ".ag-paths{display:flex;gap:8px;flex-wrap:wrap}.ag-path{font-size:12px;color:var(--tx);border:1px solid var(--line);border-radius:4px;padding:6px 10px;text-decoration:none}" +
    ".ag-price{margin-top:12px;font-size:12px;color:var(--mut)}" +
    ".ag-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:12px}.ag-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:14px}" +
    ".ag-card h2{font-size:14px;margin:0 0 8px}.ag-row{display:grid;grid-template-columns:44px 1fr auto;gap:8px;font-size:12px;padding:8px 0;border-top:1px solid var(--line)}" +
    ".ag-age{color:var(--mut)}.ag-row b{font-variant-numeric:tabular-nums}.ag-partners{display:flex;gap:6px;flex-wrap:wrap}" +
    ".ag-partners span{border:1px solid rgba(210,173,114,.4);color:var(--acc);border-radius:4px;padding:4px 10px;font-size:12px}.ag-small{font-size:12px;color:var(--mut)}" +
    "@media (max-width:767px){.ag-grid{grid-template-columns:1fr}.ag-install{flex-direction:column;align-items:stretch}}";
  document.head.appendChild(css);
  return { render: render };
})();
