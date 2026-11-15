// ShipCheck UI resolvers (Forge UI Kit): same data layer as the Rovo actions.
//
// NOTE: do NOT use `import Resolver from "@forge/resolver"` + `new Resolver()`.
// The ESM default import of @forge/resolver resolves to the module namespace
// object (not the class), so `new Resolver()` throws "not a constructor" at
// deploy time. `makeResolver` (named import) works fine — verified in Node ESM.

import { makeResolver } from "@forge/resolver";
import { getProjects, getVersions, getIssue, getVersionIssues } from "../jira.js";
import { computeReadiness } from "../readiness.js";

export const handler = makeResolver({
  getProjects: async () => getProjects(),

  getVersions: async ({ payload }) => {
    if (!payload?.projectKey) return { ok: false, error: "Missing projectKey.", versions: [] };
    return getVersions(payload.projectKey);
  },

  getIssue: async ({ payload }) => {
    if (!payload?.issueKey) return { ok: false, error: "Missing issueKey.", issue: null };
    return getIssue(payload.issueKey);
  },

  getReadiness: async ({ payload }) => {
    const notes = [];
    if (!payload?.projectKey || !payload?.versionName) {
      return { ok: false, error: "Pick a project and a version first.", score: null };
    }
    const found = await getVersionIssues(payload.projectKey, payload.versionName);
    if (!found.ok) return { ok: false, error: found.error, score: null };
    const result = computeReadiness({ issues: found.issues, goals: [] });
    return { ok: true, notes, ...result };
  },
});
