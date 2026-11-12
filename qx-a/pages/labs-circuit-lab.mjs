import {mountLabs} from './labs-workspace.mjs';
mountLabs({
  "kind": "circuit",
  "title": "Circuit Recovery",
  "fields": {
    "cooldownSeconds": "#cr-cooldownSeconds",
    "initialThreshold0For1": "#cr-initialThreshold0For1",
    "initialThreshold1For0": "#cr-initialThreshold1For0"
  }
});
