// ShipCheck: Rovo agent actions (getReadiness, listBlockers, releaseSummary).
// Each action runs as the user asking, so answers only contain what they can see.

import { getVersions, getVersionIssues, latestUnreleasedVersion } from "./jira.js";
import { twgAll, Q, workItemAri } from "./twg.js";
import { computeReadiness } from "./readiness.js";

const log = (event, data) => console.log(JSON.stringify({ shipcheck: event, ...data }));

// Resolve (projectKey, version) from the action inputs, falling back to the
// project/version on screen, then to the latest unreleased version.
async function resolveVersion(payload) {
  const projectKey = String(payload?.projectKey || payload?.context?.jira?.projectKey || "").trim().toUpperCase();
  const versionName = String(payload?.versionName || "").trim();
  if (!projectKey) return { ok: false, error: "Which project? Give me a project key such as DEMO, or open a project first." };
  const v = await getVersions(projectKey);
  if (!v.ok) return { ok: false, error: v.error };
  let version = null;
  if (versionName) {
    version = v.versions.find((x) => x.name.toLowerCase() === versionName.toLowerCase()) || null;
    if (!version) return { ok: false, error: `Version "${versionName}" was not found in project ${projectKey}.` };
  } else {
    const latest = await latestUnreleasedVersion(projectKey);
    if (!latest.ok) return { ok: false, error: latest.error };
    version = latest.version;
  }
  return { ok: true, projectKey, version };
}

// Goals linked (via Teamwork Graph) to the issues of one version.
// Goals have no "achieved" flag in the curated query, so a goal counts as
// missed only when its name is unknown to us — instead we report the linked
// goals as context and never penalize on them here; the UI panel uses the
// same list for display. (Scoring penalizes missed goals only when the
// caller supplies achieved flags.)
async function versionGoals(cloudId, issues, notes) {
  const goals = [];
  const seen = new Set();
  for (const issue of issues.slice(0, 20)) {
    const r = await twgAll("workItemGoals", Q.workItemGoals, { id: workItemAri(cloudId, issue.id) }, "jiraWorkItemGoals", 1);
    if (!r.ok) {
      notes.push(`goals for ${issue.key} could not be read: ${r.error}`);
      continue;
    }
    for (const g of r.nodes) {
      if (g?.name && !seen.has(g.name)) {
        seen.add(g.name);
        goals.push({ name: g.name, url: g.url || null, achieved: null });
      }
    }
  }
  return goals;
}

async function buildReadiness(payload) {
  const t0 = Date.now();
  const notes = [];
  const resolved = await resolveVersion(payload);
  if (!resolved.ok) return { error: resolved.error };
  const { projectKey, version } = resolved;

  const found = await getVersionIssues(projectKey, version.id);
  if (!found.ok) return { error: found.error };
  const issues = found.issues;

  const cloudId = payload?.context?.cloudId || null;
  const goals = cloudId ? await versionGoals(cloudId, issues, notes) : [];
  if (!cloudId) notes.push("Teamwork Graph goals were not read: no site context in this call.");

  const result = computeReadiness({ issues, goals }); // goals carry achieved: null (unknown) — only explicit false counts as missed
  log("readiness", { ms: Date.now() - t0, project: projectKey, version: version.name, score: result.score, issues: issues.length, notes: notes.length });
  return { projectKey, version: { id: version.id, name: version.name, released: version.released }, ...result, goals, notes };
}

export async function getReadiness(payload) {
  return buildReadiness(payload);
}

export async function listBlockers(payload) {
  const r = await buildReadiness(payload);
  if (r.error) return { error: r.error };
  return {
    projectKey: r.projectKey,
    version: r.version,
    score: r.score,
    verdict: r.verdict,
    blockers: r.blockers,
    counts: r.counts,
    notes: r.notes,
  };
}

export async function releaseSummary(payload) {
  const r = await buildReadiness(payload);
  if (r.error) return { error: r.error };
  const top = r.blockers.slice(0, 3);
  const lines = [
    `Verdict: ${r.verdict} — ${r.score}/100 for ${r.projectKey} ${r.version.name}.`,
    `${r.counts.open} of ${r.counts.total} work items still open (${r.counts.critical} critical, ${r.counts.highBugs} high-priority bugs, ${r.counts.unassigned} unassigned).`,
  ];
  if (top.length > 0) {
    lines.push(`Top blockers: ${top.map((b) => `${b.key} (${b.priority || b.type}, ${b.status}, ${b.assignee ? `owned by ${b.assignee}` : "no owner"})`).join("; ")}.`);
  } else {
    lines.push("No blockers found.");
  }
  if (r.notes.length > 0) lines.push(`Note: ${r.notes.join(" ")}`);
  return { projectKey: r.projectKey, version: r.version, score: r.score, verdict: r.verdict, summary: lines.join(" "), blockers: r.blockers, notes: r.notes };
}
