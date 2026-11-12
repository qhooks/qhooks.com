import {mountLabs} from './labs-workspace.mjs';
mountLabs({
  "kind": "band",
  "title": "Price Bands",
  "fields": {
    "minSqrtPriceX96": "#pb-minSqrtPriceX96",
    "maxSqrtPriceX96": "#pb-maxSqrtPriceX96",
    "poolFee": "#pb-poolFee"
  }
});
