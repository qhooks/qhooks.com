// Launch workspace on System A. crypto-product-ui.mjs builds the step strip and the draft preview; this lays them out
// like the Expert Studio and marks finished steps on the strip as the person moves through it.
import { bootStudio } from '/qx-a/pages/studio-common.mjs';
bootStudio({ active: 'launch' });
const paint = () => {
  const steps = [...document.querySelectorAll('.studio-steps .studio-step')];
  const cur = steps.findIndex((b) => b.getAttribute('aria-current') === 'step');
  steps.forEach((b, i) => b.classList.toggle('is-done', cur > -1 && i < cur));
};
new MutationObserver(paint).observe(document.getElementById('launch-workspace'), { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
paint();
