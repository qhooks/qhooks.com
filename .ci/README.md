# Offline static-mirror checks

These local tools validate the full static-source manifest, credential patterns and the existing TradingView license boundary. They perform no publication, deployment or provider request. This branch adds no GitHub workflow.

`release-manifest.py verify --root . --manifest .well-known/qhooks-release.json` detects changed, missing and extra static files. `secret-scan.py .` examines tracked working-tree files, reports path/rule only and refuses sensitive file paths. This pattern guard does not audit Git history or external credential stores. `sh .ci/mirror-guard.sh .` retains unconditional Advanced Charts bans and the reviewed exact26hash Lightweight Charts allowance with the existing Apache license. Unknown/changed TradingView bundles require provenance review and remain refused.

The nonpublishing root stager streams source copy+SHA256+secret patterns once. Its receipt binds the actual accepted release UUID/Worker digest and content digest; avoid a duplicate full pass during staging. Public Worker-generated HTTP bodies remain outside static-source checksums and need the release owner's separate served-response acceptance. Source/exclusions must be reconciled for each release.
