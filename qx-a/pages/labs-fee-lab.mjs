import {mountLabs} from './labs-workspace.mjs';
mountLabs({
  "kind": "fee",
  "title": "Fee governance",
  "fields": {
    "template": "#fl-template",
    "initialLpFee": "#fl-initialLpFee",
    "initialFee0For1": "#fl-initialFee0For1",
    "initialFee1For0": "#fl-initialFee1For0",
    "maxLpFee": "#fl-maxLpFee",
    "tickSpacing": "#fl-tickSpacing"
  }
});
