import { LAB_PROJECTS } from './qx-discover-lab-data.mjs';

// Registry identity remains unchanged; only Lab card copy and the direct action are enriched.
export function projectSummary(project = {}) {
  return LAB_PROJECTS[project.id]?.summary || project.summary || '';
}

export function projectLabURL(project = {}) {
  return project.qhooks ? LAB_PROJECTS[project.id]?.url || '' : '';
}
