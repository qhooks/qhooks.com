// Source-pinned forwarding contracts; native code/config proof is required at preparation.
// Wallets are resolved from the audited partner registry, never from this file.
export const hookReferralEnabledPartnerSlugs=Object.freeze(['autonomo','rushr']); // rushr: Randall OK 2026-11-23 (registry row rushr rev 1)
export const hookReferralFactories=Object.freeze(
[
 {
  "chainId": "1",
  "hook": "0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc",
  "family": "simpleLaunchClean",
  "lookup": "launchOf",
  "runtimeSha256": "0x44902aeab06c697b11add4f5fbf59c3dc074cd9b815bb9f547ed38805ae3028a",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "1",
  "hook": "0x3fcf7693f799da31134970787f9f35578d0f60cc",
  "family": "simpleLaunchMulti",
  "lookup": "launchOf",
  "runtimeSha256": "0xb322d81e7705dd739f5fb415df70184c9c178b58c1f4a8f1d9e81785f80e8be6",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "143",
  "hook": "0x0f73962ed759b0abdb92cbecbc3ef2bf462a20cc",
  "family": "simpleLaunchMulti",
  "lookup": "launchOf",
  "runtimeSha256": "0x69f2a061959f39a44ab82faa95e24c240c12c6c0cfd34c0fa6585d905a7f5d17",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "42161",
  "hook": "0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc",
  "family": "simpleLaunchClean",
  "lookup": "launchOf",
  "runtimeSha256": "0x44902aeab06c697b11add4f5fbf59c3dc074cd9b815bb9f547ed38805ae3028a",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "42161",
  "hook": "0x3fcf7693f799da31134970787f9f35578d0f60cc",
  "family": "simpleLaunchMulti",
  "lookup": "launchOf",
  "runtimeSha256": "0xb322d81e7705dd739f5fb415df70184c9c178b58c1f4a8f1d9e81785f80e8be6",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "4663",
  "hook": "0x023623568f41c032ec2f4bba368dbafc123160cc",
  "family": "simpleLaunch",
  "lookup": "launchOf",
  "runtimeSha256": "0xdd99d9599c14f1e8035c6b64fa63e356fe10061bbfa63b8f9a6f5f6d537e0ae8",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "4663",
  "hook": "0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc",
  "family": "simpleLaunchClean",
  "lookup": "launchOf",
  "runtimeSha256": "0x44902aeab06c697b11add4f5fbf59c3dc074cd9b815bb9f547ed38805ae3028a",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "4663",
  "hook": "0xefe39a5632212911fe8e3ddcb07f08e5e220e0cc",
  "family": "simpleLaunchPairs",
  "lookup": "launchOf",
  "runtimeSha256": "0xbbde4b1acbe477baaadaf8b4cc079ca5e2b24cd79b8594ecf3a8acc3e258daf2",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "4663",
  "hook": "0x3fcf7693f799da31134970787f9f35578d0f60cc",
  "family": "simpleLaunchMulti",
  "lookup": "launchOf",
  "runtimeSha256": "0xb322d81e7705dd739f5fb415df70184c9c178b58c1f4a8f1d9e81785f80e8be6",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "56",
  "hook": "0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc",
  "family": "simpleLaunchClean",
  "lookup": "launchOf",
  "runtimeSha256": "0x44902aeab06c697b11add4f5fbf59c3dc074cd9b815bb9f547ed38805ae3028a",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "56",
  "hook": "0x3fcf7693f799da31134970787f9f35578d0f60cc",
  "family": "simpleLaunchMulti",
  "lookup": "launchOf",
  "runtimeSha256": "0xb322d81e7705dd739f5fb415df70184c9c178b58c1f4a8f1d9e81785f80e8be6",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "8453",
  "hook": "0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc",
  "family": "simpleLaunchClean",
  "lookup": "launchOf",
  "runtimeSha256": "0x44902aeab06c697b11add4f5fbf59c3dc074cd9b815bb9f547ed38805ae3028a",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "8453",
  "hook": "0x3fcf7693f799da31134970787f9f35578d0f60cc",
  "family": "simpleLaunchMulti",
  "lookup": "launchOf",
  "runtimeSha256": "0xb322d81e7705dd739f5fb415df70184c9c178b58c1f4a8f1d9e81785f80e8be6",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "99901",
  "hook": "0xc7faaf2e1b01e5e2cae4f967a020b49b290ca0cc",
  "family": "simpleLaunchClean",
  "lookup": "launchOf",
  "runtimeSha256": "0xb285500ced0f50015f0bb479ba4fee9cb2462d1dccdc650fa1759237c33f70df",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "99901",
  "hook": "0x9a9d37bca2e9874a1da1a1bab51f242a9d1ca0cc",
  "family": "simpleLaunchMulti",
  "lookup": "launchOf",
  "runtimeSha256": "0x735c16ef42f5aca87af4693111fa4f053b6fa334e13b5d73d841ac615d47eb49",
  "blocksImplementation": "0x0fe8d8fb871f6d949ffe4c3f13d351e1b1ab2e94",
  "implementationRuntimeSha256": "0xe76e15393b4e69ee4e7ae4b86239608c040d221c82e49e08a303ae2f04861f3a"
 },
 {
  "chainId": "4663",
  "hook": "0x08a7c13fd8bfeae5726abd8332c627a7ab01eacc",
  "family": "GraduationBlocksHook_exact_instance",
  "lookup": "blocks-getter",
  "runtimeSha256": "0xad15944673e6f958fe67351bcc7771efda0e20d3c4e87e802ff161b926f61183",
  "blocksGetterSelector": "0x967ff23e",
  "blocksActiveSelector": "0xb1c89fb1",
  "blocksAddress": "0xb714a80a5b3684b4f4730ae8f092fa392f120cf6",
  "blocksRuntimeSha256": "0x65697135fe9676556e96d813c5e908f86ac33c261c4002f44f09d41f45aeb1a4"
 }
].map(Object.freeze));
