# Offline public checks

The workflow runs only read-only validation. It has contents:read permission, no deployment job, no stored credential configuration and no provider requests. Local commands are listed in `.github/workflows/public-checks.yml`.

`secret-scan.py` examines tracked working-tree files, reports only path/rule and refuses sensitive file paths without reading their values. It is a bounded pattern guard, not a Git-history or external credential-store audit.

Canonical chain checks use the accepted public registry. Configuration/builder snapshots are pinned to their source release; refresh snapshot and pin together when an accepted release changes the chain catalog. Site checks cover marked copy and terminal filter membership, not unmarked historical prose.

Site mirror owners must update `.well-known/qhooks-release.json` from the exact accepted `public/` source on every release, including the release ID and Worker digest. CI's full-manifest verify catches byte drift and missing/extra static files. Worker-generated public documentation and API bodies need a separate served-response receipt from live acceptance. Preserve the licensed Advanced Charts exclusions. The exact-hash LWC bundle allowance retains the existing Apache license and attribution; never whitelist an unknown or changed TradingView bundle without provenance review.
