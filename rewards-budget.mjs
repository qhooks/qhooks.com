// Approved allocation metadata and pure qualification only. No funding or distribution operation.
export const REWARDS_POLICY_ID='qhooks-fixed-qhooks-20261117-v2';
export const REWARDS_BUDGET_ID=REWARDS_POLICY_ID;
export const REWARDS_TOKEN='0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';
export const REWARDS_DECIMALS=18;
export const WEEKLY_QUALIFICATION=Object.freeze({minVolumeUsd:1000,minTrades:10});
export const FIXED_BOARD_QHOOKS=Object.freeze([60000,30000,10000]);
export const FIXED_BOARD_QHOOKS_RAW=Object.freeze(['60000000000000000000000','30000000000000000000000','10000000000000000000000']);
export const COMPETITION_BOARD_TOTAL_RAW='100000000000000000000000';
export const COMPETITION_ALLOCATION_RAW='300000000000000000000000';
export const WEEKLY_FUNDING_QHOOKS_RAW='750000000000000000000000';
export const REWARDS_BUDGET=Object.freeze({version:2,id:REWARDS_POLICY_ID,policyId:REWARDS_POLICY_ID,chainId:'4663',token:REWARDS_TOKEN,asset:'QHOOKS',decimals:REWARDS_DECIMALS,weeklyFundingQhooksRaw:WEEKLY_FUNDING_QHOOKS_RAW,competitionQhooksRaw:COMPETITION_ALLOCATION_RAW,weeklyTarget:777000,approximate:true,sourceLockIds:Object.freeze([1,4]),allocations:Object.freeze({competitions:300000,holdersAndStakers:250000,foundingLaunchersReserve:100000,agents:100000}),allocationsRaw:Object.freeze({competitions:COMPETITION_ALLOCATION_RAW,holdersAndStakers:'250000000000000000000000',foundingLaunchersReserve:'100000000000000000000000',agents:'100000000000000000000000'}),buffer:Object.freeze({qhooks:27000,approximate:true,includedInFunding:false}),foundingLaunchers:Object.freeze({perAward:50000,maxAwardsOverall:50,programCap:2500000,weeklyReserve:100000}),fundingVerified:false,distributionStatus:'held',lockDays:0,lockSupported:false,distributionMode:'qdrops',lockStatus:'unsupported_in_qdrops'});
export function meetsWeeklyQualification(row){return Number.isFinite(row?.volumeUsd)&&row.volumeUsd>=WEEKLY_QUALIFICATION.minVolumeUsd&&Number.isSafeInteger(row?.trades)&&row.trades>=WEEKLY_QUALIFICATION.minTrades;}
export function publicRewardsBudget(){return JSON.parse(JSON.stringify(REWARDS_BUDGET));}
