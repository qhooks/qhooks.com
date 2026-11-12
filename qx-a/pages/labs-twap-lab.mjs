import {mountLabs} from './labs-workspace.mjs';
mountLabs({
  "kind": "twap",
  "title": "TWAP Oracle",
  "fields": {
    "maxTickMove": "#tw-maxTickMove",
    "cardinality": "#tw-cardinality",
    "poolFee": "#tw-poolFee"
  }
});
