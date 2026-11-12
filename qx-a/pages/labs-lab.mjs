import {mountLabs} from './labs-workspace.mjs';
mountLabs({
  "kind": "catalog",
  "title": "Hook Lab",
  "fields": {
    "family": "#qx-lab-catalog select[name=\"template\"]",
    "chain": "#qx-lab-catalog select[name=\"catalogChain\"]",
    "projectName": "#qx-lab-catalog input[name=\"projectName\"]"
  },
  "contexts": [
    {
      "selector": "#lab-form",
      "kind": "creator",
      "fields": {
        "template": "#lab-form [name=\"template\"]",
        "feeBps": "#lab-form [name=\"feeBps\"]",
        "poolFee": "#lab-form [name=\"poolFee\"]",
        "tickSpacing": "#lab-form [name=\"tickSpacing\"]"
      }
    },
    {
      "selector": "#qx-lab-catalog",
      "kind": "catalog",
      "fields": {
        "family": "#qx-lab-catalog select[name=\"template\"]",
        "chain": "#qx-lab-catalog select[name=\"catalogChain\"]",
        "projectName": "#qx-lab-catalog input[name=\"projectName\"]"
      }
    }
  ]
});
