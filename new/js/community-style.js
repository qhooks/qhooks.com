/* community-style.js: styles for the Community board and the token Community tab. Written by Claude.
   Noir/brutalist (contract 1.2.1): hard 1 px rules, uppercase 11 px labels, numbers carry weight. */
(function () {
  "use strict";
  var css =
    ".cm-sample{display:inline-flex;align-items:center;height:18px;padding:0 6px;margin-left:8px;border:1px solid rgba(245,181,68,.45);color:var(--acc);border-radius:4px;font-size:11px;font-weight:600;letter-spacing:0;text-transform:none;white-space:nowrap}" +
    ".cm-tile img{width:100%;height:100%;object-fit:cover;border-radius:3px}a.cm-buy{display:inline-flex;align-items:center;text-decoration:none}" +
    ".cm-qh{font-size:11px;color:var(--acc);border:1px solid rgba(245,181,68,.45);border-radius:4px;padding:1px 5px}.cm-live-note{font-size:12px;color:var(--mut);padding:8px 16px}.cm-live-note a{color:var(--acc)}@media (max-width:767px){.cm-live-note a{display:inline-flex;align-items:center;min-height:44px}}" +
    ".cm-page{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:0;min-height:calc(100vh - 56px)}" +
    ".cm-main{min-width:0;border-right:1px solid var(--line)}" +
    ".cm-bar{position:sticky;top:56px;z-index:5;display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--line)}" +
    ".cm-title{font-size:11px;letter-spacing:.06em;color:var(--mut);margin:0;font-weight:600}" +
    ".cm-tabs{display:flex;gap:4px;flex:1;min-width:0}" +
    ".cm-tab{height:32px;padding:0 12px;border:1px solid var(--line);background:var(--s1);color:var(--mut);border-radius:4px;font-size:13px;cursor:pointer;white-space:nowrap}" +
    ".cm-tab.on{color:var(--tx);border-color:var(--tx);background:var(--s2)}.cm-tab-phone{display:none}" +
    ".cm-make{height:34px;padding:0 14px;border:1px solid var(--acc);background:var(--acc);color:#140d00;border-radius:4px;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap}" +
    ".cm-btn{height:34px;padding:0 12px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:13px;cursor:pointer;white-space:nowrap}" +
    ".cm-list{padding:0}.cm-chips-row{display:flex;gap:6px;padding:10px 16px;border-bottom:1px solid var(--line)}" +
    ".cm-chip{height:28px;padding:0 10px;border:1px solid var(--line);background:transparent;color:var(--mut);border-radius:4px;font-size:12px;cursor:pointer}.cm-chip.on{color:var(--tx);border-color:var(--mut)}" +
    ".cm-mut{color:var(--mut);font-weight:400}.cm-up{color:var(--up)}.cm-dn{color:var(--dn)}" +
    ".cm-tile{flex:none;display:flex;align-items:center;justify-content:center;border-radius:4px;color:var(--tx);font-weight:700;font-size:16px;text-decoration:none;border:1px solid var(--line)}" +
    ".cm-call{display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}.cm-call:hover{background:var(--s1)}" +
    ".cm-call-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}" +
    ".cm-call-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px}" +
    ".cm-who{color:var(--tx);font-weight:600;text-decoration:none}.cm-who:hover,.cm-sym:hover{text-decoration:underline}" +
    ".cm-sym{color:var(--tx);font-weight:700;text-decoration:none}.cm-chips{display:inline-flex;gap:4px;align-items:center;margin-left:auto}" +
    ".cm-note{margin:0;font-size:13px;line-height:1.4;color:var(--tx);overflow-wrap:anywhere}" +
    ".cm-call-nums{display:flex;align-items:center;gap:14px;font-size:13px;font-variant-numeric:tabular-nums}" +
    ".cm-call-nums i{font-style:normal;color:var(--mut);font-size:11px;margin-right:5px;letter-spacing:.04em;text-transform:uppercase}" +
    ".cm-call-nums>b{font-size:15px}.cm-chain{color:var(--mut);font-size:11px}" +
    ".cm-buy{margin-left:auto;height:32px;padding:0 12px;border:1px solid var(--up);background:rgba(46,229,157,.1);color:var(--up);border-radius:4px;font-weight:600;font-size:12px;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums}" +
    ".cm-buy:hover{background:var(--up);color:#04140c}" +
    ".cm-sub{margin:0;padding:10px 16px;font-size:12px;color:var(--mut)}" +
    ".cm-lb{display:grid;grid-template-columns:40px minmax(0,1fr) 90px 90px 90px;align-items:center;height:48px;padding:0 16px;border-bottom:1px solid var(--line);font-size:13px;font-variant-numeric:tabular-nums}" +
    ".cm-lb b{text-align:right}.cm-lb-head{height:36px;font-size:11px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase}" +
    ".cm-sort{background:none;border:0;color:var(--mut);font:inherit;letter-spacing:inherit;text-transform:inherit;text-align:right;cursor:pointer;height:100%;padding:0}.cm-sort.on{color:var(--tx)}" +
    ".cm-lb-who{display:flex;gap:8px;align-items:baseline;min-width:0}.cm-addr{font-size:11px;font-family:ui-monospace,Menlo,monospace}" +
    ".cm-trow{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:13px}" +
    ".cm-trow-id{flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cm-trow-id .cm-chips{margin-left:0}" +
    ".cm-trow-n{display:flex;flex-direction:column;align-items:flex-end;min-width:90px;font-variant-numeric:tabular-nums}.cm-trow-n i{font-style:normal;font-size:11px;color:var(--mut)}.cm-trow-n i.cm-up{color:var(--up)}.cm-trow-n i.cm-dn{color:var(--dn)}" +
    ".cm-side{position:sticky;top:56px;align-self:start;max-height:calc(100vh - 56px);overflow-y:auto}" +
    ".cm-h{display:flex;gap:8px;align-items:center;font-size:11px;letter-spacing:.06em;color:var(--mut);font-weight:600;padding:12px 16px}" +
    ".cm-track,.cm-cform{display:flex;gap:6px;padding:0 16px 12px;border-bottom:1px solid var(--line)}" +
    ".cm-input{flex:1;min-width:0;height:34px;background:var(--s1);border:1px solid var(--line);color:var(--tx);border-radius:4px;padding:0 10px;font-size:13px}" +
    ".cm-wallet{padding:10px 16px;border-bottom:1px solid var(--line)}.cm-wallet-h{display:flex;gap:8px;align-items:baseline;margin-bottom:6px;font-size:13px}" +
    ".cm-wt{display:grid;grid-template-columns:56px minmax(0,1fr) auto 36px;gap:8px;font-size:12px;padding:3px 0;font-variant-numeric:tabular-nums}.cm-wt span:last-child{text-align:right}" +
    ".cm-empty{padding:24px 16px;color:var(--mut);font-size:13px}" +
    ".token-main>.token-tabs,.token-main>.cm-tc{flex-shrink:0}" +
    ".cm-tc{border-top:1px solid var(--line)}.cm-tc-head{display:flex;align-items:center;justify-content:space-between;padding-right:16px}.cm-h-gap{margin-top:8px}" +
    ".cm-comment{padding:10px 16px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:4px}" +
    ".cm-sheet-wrap{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center}" +
    ".cm-sheet{width:420px;max-width:100%;background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:4px 0 16px;display:flex;flex-direction:column;gap:10px;animation:cmIn .16s ease-out}" +
    ".cm-lbl{display:flex;flex-direction:column;gap:6px;padding:0 16px;font-size:12px;color:var(--mut)}.cm-sel{-webkit-appearance:none;appearance:none;cursor:pointer}.cm-ta{height:72px;padding:8px 10px;resize:none;font-family:inherit}" +
    ".cm-sheet .cm-sub{padding:0 16px}.cm-sheet-act{display:flex;gap:8px;justify-content:flex-end;padding:0 16px}" +
    ".cm-undo{margin-left:10px;background:none;border:1px solid var(--line);color:var(--acc);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:12px}" +
    ".q-more-h{font-size:11px;letter-spacing:.06em;color:var(--mut);margin:0;padding:16px;font-weight:600}" +
    ".q-more-link{display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:60px;padding:0 16px;border-top:1px solid var(--line);color:var(--tx);text-decoration:none;font-size:15px}" +
    ".q-more-link span{font-size:12px;color:var(--mut)}.q-more-link:last-child{border-bottom:1px solid var(--line)}" +
    "@keyframes cmIn{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}" +
    "@media (max-width:1099px){.cm-page{grid-template-columns:1fr}.cm-side{display:none}.cm-main{border-right:0}.cm-tab-phone{display:inline-block}}" +
    "@media (max-width:767px){.cm-page{padding-bottom:80px}.cm-bar{flex-wrap:wrap;gap:8px;padding:8px 12px}.cm-title{display:none}" +
    ".cm-tabs{order:2;flex-basis:100%;overflow-x:auto}.cm-tab{flex:1;height:44px;padding:0 8px}.cm-make{margin-left:auto;height:44px}.cm-btn,.cm-input{height:44px}" +
    ".cm-bar::before{content:'COMMUNITY';font-size:11px;letter-spacing:.06em;color:var(--mut);font-weight:600}" +
    ".cm-call{padding:12px}.cm-chips{margin-left:0}.cm-buy{height:44px;padding:0 14px}" +
    ".cm-chips-row{padding:8px 12px}.cm-chip{height:44px;flex:1}.cm-sort{min-height:44px}" +
    ".cm-lb{grid-template-columns:28px minmax(0,1fr) 52px 64px 56px;padding:0 12px;height:52px}.cm-lb .cm-addr{display:none}" +
    ".cm-trow{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:6px 10px;padding:10px 12px}.cm-trow>.cm-tile{grid-row:1/3}" +
    ".cm-trow-id{grid-column:2;grid-row:1}.cm-trow-n:nth-child(3){grid-column:2;grid-row:2;flex-direction:row;gap:4px;align-items:center;min-width:0}" +
    ".cm-trow-n:nth-child(4){grid-column:3;grid-row:1;min-width:0}.cm-trow .cm-buy{grid-column:3;grid-row:2;margin:0}" +
    ".cm-call-nums{gap:8px;flex-wrap:nowrap}.cm-call-nums i,.cm-chain{display:none}.cm-call-nums span+span::before{content:'\\2192  ';color:var(--mut)}" +
    ".cm-wallet,.cm-h{padding-left:12px;padding-right:12px}.cm-track,.cm-cform{padding:0 12px 12px}.cm-who,.cm-sym{display:inline-flex;align-items:center;min-height:44px;margin:-12px 0}" +
    ".cm-tile{min-width:44px;min-height:44px}.token-tabs{height:auto}.token-tab{min-height:44px;display:flex;align-items:center}.cm-wt{align-items:center;min-height:44px}" +
    ".cm-sheet-wrap{align-items:flex-end}.cm-sheet{border-radius:8px 8px 0 0;padding-bottom:24px}.cm-sheet-act button{height:48px;flex:1}}";
  var el = document.createElement("style"); el.textContent = css; document.head.appendChild(el);
})();
