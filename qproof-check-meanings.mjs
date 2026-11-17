// Canonical descriptions of returned token observations, shared by data and glossary.
// No score/chain count is hard-coded; source check statuses/verdicts are never changed.
export const QPROOF_CHECK_COUNT_MEANING="A high-risk/total figure counts danger results among risk checks. Caution is counted separately. Informational notes stay separate; unknown is not a pass. Counts describe this report’s evidence, not safety odds; available checks vary.";
const definitions={
 holders:['Holder concentration','Ranks the returned eligible wallets or token accounts and reports their share on the stated supply basis.','Sampling, excluded pools/contracts/exchanges and missing owner resolution can limit coverage; sampled wallet count is not total holders.'],
 upgradeable:['Code replacement','Reads known proxy/implementation storage patterns to identify recorded code-replacement control.','Unrecognized proxy patterns or unread slots remain outside the returned evidence.'],
 ownership:['Administrative ownership','Reads owner/getOwner and recorded role/proxy observations.','Owner is an administrative role, not proof of who created or deployed the token.'],
 functions:['Known function signatures','Scans returned EVM bytecode for the listed risky function selectors.','Absence of a selector is not a semantic proof that a contract cannot mint, freeze or change balances.'],
 liquidity:['Pool depth','Reports the selected pool’s returned reserve or in-range liquidity snapshot.','Depth can differ by pool and price range and does not guarantee execution for a proposed order.'],
 'lp-burn':['Liquidity custody','Reports returned LP burn, holder or launch-custody observations.','Burned LP, dated locks and factory custody are different. Position binding and withdrawal expiry may be unavailable.'],
 'launch-creator':['Launch fee role','Describes the recorded launch creator/fee-control role and its reported authorization model.','This role can be a contract and is not the token deployer or original launch wallet.'],
 'launch-rules':['Launch rules','Describes the launch rule configuration and code observations returned for this snapshot.','A rules summary is not an execution quote or proof that all token permissions were measured.'],
 source:['Published source','Reports the returned source-verification response for named code addresses.','Published or matching source is not an independent security audit.'],
 'sell-simulation':['Buy/sell probe','Reports a bounded buy-then-sell simulation or the provider’s returned simulation.','A successful probe applies to that wallet, pool, size and block; it does not guarantee a future sale.'],
 'v4-simulation':['Additional V4 probe','Reports a returned simulation observation from an additional Uniswap V4 pool.','Other pools or later execution can behave differently.'],
 'owner-holdings':['Owner balance','Reports the named administrative owner’s recorded token balance.','An owner balance is not creator identity, and a missing balance is not zero.'],
 'creator-holdings':['Creator balance','Reports the balance attributed by the source to an identified launch creator.','Fee-sharing configurations and program accounts must not be relabelled as one creator wallet.'],
 'creator-fees':['Creator fee vault','Reports outstanding recorded creator-vault fees.','Unclaimed fees are not a complete history of creator earnings or token sales.'],
 'creator-sells':['Creator trade history','Reports recognized creator-signed trades and token-account changes within the returned history scope.','Partial history, transfers and unrecognized venues are not proof of no sales; owner is not a creator fallback.'],
 market:['Listed market snapshot','Reports the provider’s recorded price, capitalization, liquidity and volume fields.','Listing data can be incomplete or stale and is not an execution quote.'],
 'pair-age':['Listed pool age','Reports when the listed pool was recorded as opening.','Pool age is not necessarily token deployment age.'],
 flow:['Recorded swap activity','Reports the provider’s returned buy/sell counts for its named windows.','Counts do not establish unique traders, organic demand or future performance.'],
 links:['Listed links','Reports links present in the returned token metadata or listing.','Presence is not ownership verification, endorsement or proof that the destination was visited.'],
 'mint-authority':['Solana mint authority','Reports the SPL/Token-2022 mint authority observation.','Explicit retained null means revoked; an omitted field is unknown. Other extensions can affect supply behavior.'],
 'freeze-authority':['Solana freeze authority','Reports the SPL/Token-2022 authority that can freeze token accounts.','Explicit retained null differs from unread or omitted authority data.'],
 extensions:['Token-2022 extensions','Reports recognized extensions listed by the source.','Missing extension data or an unrecognized extension is not evidence of no capability.'],
 metadata:['Metadata control','Reports the returned metadata update-authority or mutability observation.','Metadata control is separate from deployment identity and trading permissions.'],
 'transfer-fee':['Token transfer fee','Reports the returned Token-2022 transfer-fee schedules and their authorities.','Token transfer fees are separate from platform, pool and network fees and may change under retained authority.'],
 'sell-route':['Quoted sell route','Reports whether a quote provider returned a route for its selected amount.','A route quote is not a submitted or successful on-chain sale.'],
 launch:['Launch phase','Reports the returned bonding-curve or migration state.','A phase label is not a promise that migration will complete or that liquidity cannot be withdrawn.'],
 'liquidity-ratio':['Liquidity relative to cap','Compares the returned listed liquidity with the returned capitalization estimate.','Both values are snapshot/provider estimates; the ratio is not a price-impact quote.'],
 'price-crash':['Recorded price decline','Reports a returned price decline over the named provider window.','It describes that window and does not predict the next price.'],
 identity:['Listed identity mismatch','Compares recorded on-chain name/symbol with a listing.','Names can collide and do not alone establish authenticity.'],
 'metadata-match':['Metadata mismatch','Compares the returned metadata file identity with the on-chain fields.','A matching name is not ownership or safety verification.'],
 'repo-link':['Listed repository','Reports a code repository present in the returned links.','Listing a repository is not evidence the deployed code matches it.'],
 launchpad:['Listed launchpad','Reports the launchpad/createdOn field in returned metadata.','An off-chain metadata claim does not identify the actual deployment wallet.'],
 pool:['Pool discovery coverage','Describes whether supported pools were found or could be interpreted.','Missing a supported pool does not prove no pool exists.'],
 erc20:['Token identity reads','Reports whether expected token identity/supply reads completed.','Unread fields are unknown; they are not zero or proof of ERC-20 compliance.'],
 'provider-disagreement':['Conflicting provider readings','Retains differing measurements from named providers.','One successful observation does not cancel another provider’s warning.'],
 'gp-honeypot':['Provider sell warning','Retains the provider’s reported failed-sale warning.','It remains a separate reported observation when a local probe differs.'],
 'gp-tax':['Provider tax warning','Retains the provider’s reported buy/sell tax.','Tax can depend on wallet, route, size or time.'],
 'chains-unread':['Unread chains','Lists requested chain reads that did not complete.','No observation on an unread chain is a clean result.'],
 activity:['Recorded address activity','Reports the returned confirmed signature/activity window.','A sampled activity window does not establish account creation date or complete history.'],
 stylus:['Stylus program state','Reports recorded Arbitrum Stylus activation/version information.','An EVM selector scan does not cover compressed Wasm semantics.'],
 bridge:['Bridge identity','Reports the returned bridge mapping/back-reference checks.','A matching ticker alone does not establish a canonical bridge.'],
 lookalike:['Canonical-name mismatch','Reports a name match at an address different from the configured canonical asset.','Names are not cryptographic identity.']
};
const functions={mint:'minting supply',blacklist:'blocking wallets',pause:'pausing transfers',fees:'changing trading fees',limits:'trade or wallet caps',trading:'enabling or disabling trading',roles:'granting administrative roles'};
export function qproofCheckMeaning(id){
 const key=typeof id==='string'?id.slice(0,100):'',row=definitions[key];
 if(row)return {id:key,label:row[0],meaning:row[1],limits:row[2]};
 if(key.startsWith('fn-')&&functions[key.slice(3)])return{id:key,label:'Known '+functions[key.slice(3)]+' selectors',meaning:'The returned bytecode contains recognized function selectors for '+functions[key.slice(3)]+'.',limits:'Selector presence does not enumerate every permission holder; the original status and control observations remain authoritative.'};
 if(key.startsWith('gp-'))return{id:key,label:'Provider permission observation',meaning:'Retains the provider-reported '+key.slice(3).replaceAll('_',' ')+' observation.',limits:'Provider and local code observations can differ; read the original detail and receipts.'};
 if(key.startsWith('ext-'))return{id:key,label:'Token-2022 extension observation',meaning:'Reports the returned '+key.slice(4)+' extension capability.',limits:'Read the original extension state and authority details; an omitted state remains unknown.'};
 return{id:key,label:'Returned observation',meaning:'This check has no published token-specific definition yet. Read its original title, detail and dated receipts.',limits:'No pass or safety conclusion is inferred from an unknown check identifier.'};
}
export function qproofCheckSummary(report){
 const checks=Array.isArray(report?.checks)?report.checks.slice(0,80):[],counts={danger:0,caution:0,clear:0,unknown:0,info:0};
 for(const c of checks)counts[Object.hasOwn(counts,c?.status)?c.status:'unknown']++;
 return{returned:checks.length,riskChecks:checks.length-counts.info,warnings:counts.danger+counts.caution,...counts,meaning:QPROOF_CHECK_COUNT_MEANING};
}
export const QPROOF_CHECK_MEANING_IDS=Object.freeze(Object.keys(definitions));
