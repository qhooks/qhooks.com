import {bindLaunchBoot} from './l140-launch-boot.mjs';
import {bindCompleteLaunchWorkspace} from '/trade-client/apps/marketplace-preview/l129-launch-page.mjs';
import {bindLaunchTradeHandoff} from '/trade-client/apps/marketplace-preview/launch-trade-handoff.mjs';

// Versioned replacement for l129-launch-entry-r2.mjs. Invalid deep links stop
// before provider discovery; valid/default links retain the accepted L129 graph.
export const launchBoot = bindLaunchBoot({
  bindPage: () => {
    const handoff = bindLaunchTradeHandoff();
    return bindCompleteLaunchWorkspace({
      loadClient: async () => handoff.wrapClient(Object.assign({}, ...await Promise.all([
        import('/full-launch/packages/multichain-launch/l129-workspace-public-r2.mjs'),
        import('/full-launch/packages/multichain-launch/workspace-fields.mjs'),
        import('/full-launch/packages/multichain-launch/guided-management.mjs'),
        import('/full-launch/packages/multichain-launch/dependencies.mjs'),
        import('/full-launch/packages/multichain-launch/actions/signer.mjs'),
        import('/full-launch/packages/multichain-launch/l129-remembered-session.mjs'),
        import('/full-launch/packages/crosschain/decimal-amount.mjs'),
      ]))),
      loadWrap: async () => {
        const module = await import('/full-launch/packages/multichain-launch/native-wrap.mjs');
        return module.createNativeWrap;
      },
      loadArtifacts: async () => Object.fromEntries(await Promise.all([
        ['toolkitText', 'toolkit.json', 1000000],
        ['metadataText', 'metadata.json', 100000],
        ['tokenText', 'token.json', 20000],
        ['policyText', 'dependencies.json', 100000],
      ].map(async ([key, name, limit]) => {
        const response = await fetch('/full-launch/' + name, {redirect: 'error', cache: 'no-store'});
        if (!response.ok) throw Error('Launch artifact unavailable: ' + name);
        const text = await response.text();
        if (text.length > limit) throw Error('Launch artifact too large');
        return [key, text];
      }))),
    });
  },
});
