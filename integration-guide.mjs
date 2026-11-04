export function renderIntegrationGuide(kit) {
  const punctuation = '\\`*_{}[]()#+-.!|><';
  const escape = value => Array.from(String(value).replace(/[\n\r\t]/g, ' '), character =>
    punctuation.includes(character) ? '\\' + character : character).join('');
  const projectName = escape(kit.projectName);
  const templateId = escape(kit.templateId);
  const chainId = escape(kit.chainId);
  const profile = escape(kit.profile);
  const projectInputSha256 = escape(kit.projectInputSha256);
  const contractName = escape(kit.constructor.contractName);
  const inputs = kit.constructor.inputs
    .map((input, index) => `${index + 1}. ${escape(input.name)} (${escape(input.type)})`)
    .join('\n');
  const hookPermissionFlags = escape(kit.hookPermissionFlags);
  return `# QHooks integration kit\n\n` +
    `The downloaded JSON bundle contains a files object. Save each entry under its named filename in a working directory. These are data and instructions, not executable deployment commands.\n\n` +
    `## Project\n\n` +
    `- Name: ${projectName}\n` +
    `- Template: ${templateId}\n` +
    `- Chain: ${chainId}\n` +
    `- Profile: ${profile}\n` +
    `- Build digest: ${projectInputSha256}\n\n` +
    `## Constructor\n\n` +
    `Contract: ${contractName}\n\n` +
    `Inputs, in ABI order:\n\n${inputs}\n\n` +
    `Hook permission flags: ${hookPermissionFlags}\n\n` +
    `## Integration steps\n\n` +
    `1. Use the included build.json and configuration.json. Keep the bundled helper, compiler settings, source and third-party notices with the build.\n` +
    `2. Verify the target PoolManager and helper runtime identities and the ordered supported token addresses.\n` +
    `3. Supply the public constructor inputs listed in constructor.json (never private keys). Null values are unresolved inputs, not defaults.\n` +
    `4. Calculate the permission salt using the actual controller address, the exact child hook initcode, and the listed flags.\n` +
    `5. Deploy the controller using its ABI/bytecode after reviewing costs; it creates its hook, key registry and verifier. Do not deploy those internal children independently. The PoolManager and helper must already exist.\n` +
    `6. Initialize the matching pool with hook-aware tooling and test the chosen settings locally before public use.\n\n` +
    `## Scope\n\n` +
    `- Local chain 31337.\n` +
    `- Optional ML-DSA with explicit fee review before any future send.\n` +
    `- No auto-deployment.\n` +
    `- No signatures or keys included.\n` +
    `- Compiled settings are not a new behavioral test.\n` +
    `- The protected action varies by template. This kit does not make ordinary token transfers post-quantum protected.\n`;
}
