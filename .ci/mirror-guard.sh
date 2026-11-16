#!/bin/sh
# TradingView Advanced Charts license (signed 2026-11-06), §2.6: the library must never be in a public code repository.
# qhooks/qhooks.com on GitHub mirrors public/. This guard fails if any TradingView library file is present.
# usage: mirror-guard.sh <dir>   (exit 1 on any hit). Installed as pre-commit + pre-push in work/qhooks-site-public.
dir="${1:-.}"; hits=0
# 1. The library's own folders and bundles, by path.
found=$(cd "$dir" && find . -path ./.git -prune -o \( -path '*/charting_library*' -o -path '*/datafeeds/udf*' -o -name 'charting_library*' -o -iname '*tradingview*.js' \) -print 2>/dev/null)
if [ -n "$found" ]; then echo "mirror-guard: TradingView library paths present:"; echo "$found" | head -20; hits=1; fi
# 2. Any large JS/CSS/HTML file mentioning TradingView (the library bundles; our own adapter files are small).
# lightweight-charts is TradingView's open-source (Apache-2.0) chart, already public: allowed.
big=$(cd "$dir" && find . -path ./.git -prune -o -path '*/lightweight-charts/*' -prune -o -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.css' -o -name '*.html' \) -size +100k -print 2>/dev/null | while read -r f; do if grep -q -i 'tradingview' "$f" 2>/dev/null; then
  # Existing Apache Lightweight Charts is also bundled inside these exact public outputs.
  # Unknown/changed bundles still fail. Advanced Charts path bans above are unconditional.
  python3 "$(dirname "$0")/lwc-bundle-allow.py" "$dir" "$f" >/dev/null 2>&1 || echo "$f"
 fi; done)
if [ -n "$big" ]; then echo "mirror-guard: large files mentioning TradingView:"; echo "$big" | head -20; hits=1; fi
[ "$hits" = 0 ] && echo "mirror-guard: clean" || { echo "mirror-guard: REFUSED. Remove these before syncing or pushing the public mirror."; exit 1; }
