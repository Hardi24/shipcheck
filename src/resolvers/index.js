// ShipCheck UI resolvers (Forge UI Kit): same data layer as the Rovo actions.

import Resolver from "@forge/resolver";
import { getProjects, getVersions, getIssue, getVersionIssues } from "../jira.js";
import { computeReadiness } from "../readiness.js";

const resolver = new Resolver();

resolver.define("getProjects", async () => getProjects());

resolver.define("getVersions", async ({ payload }) => {
  if (!payload?.projectKey) return { ok: false, error: "Missing projectKey.", versions: [] };
  return getVersions(payload.projectKey);
});

resolver.define("getIssue", async ({ payload }) => {
  if (!payload?.issueKey) return { ok: false, error: "Missing issueKey.", issue: null };
  return getIssue(payload.issueKey);
});

resolver.define("getReadiness", async ({ payload }) => {
  const notes = [];
  if (!payload?.projectKey || !payload?.versionId) {
    return { ok: false, error: "Pick a project and a version first.", score: null };
  }
  const found = await getVersionIssues(payload.projectKey, payload.versionId);
  if (!found.ok) return { ok: false, error: found.error, score: null };
  const result = computeReadiness({ issues: found.issues, goals: [] });
  return { ok: true, notes, ...result };
});

export const handler = resolver.getDefinitions();
