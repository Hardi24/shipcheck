// Jira REST data layer for ShipCheck. Runs as the user (asUser) so every
// answer only ever contains what that user can already see.

import api, { route } from "@forge/api";

const normalizeIssue = (issue) => ({
  id: issue.id,
  key: issue.key,
  summary: issue.fields?.summary || "",
  type: issue.fields?.issuetype?.name || "",
  priority: issue.fields?.priority?.name || "",
  status: issue.fields?.status?.name || "",
  assignee: issue.fields?.assignee?.displayName || null,
  assigneeAccountId: issue.fields?.assignee?.accountId || null,
  updated: issue.fields?.updated || null,
  webUrl: issue.self ? null : null,
});

export async function getProjects() {
  const res = await api.asUser().requestJira(route`/rest/api/3/project/search?maxResults=50`);
  if (!res.ok) return { ok: false, error: `project search failed (${res.status})`, projects: [] };
  const json = await res.json();
  return {
    ok: true,
    projects: (json.values || []).map((p) => ({ key: p.key, name: p.name, id: p.id })),
  };
}

export async function getVersions(projectKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/project/${projectKey}/versions`);
  if (!res.ok) return { ok: false, error: `version list failed (${res.status})`, versions: [] };
  const versions = await res.json();
  return {
    ok: true,
    versions: versions.map((v) => ({ id: v.id, name: v.name, released: !!v.released, releaseDate: v.releaseDate || null })),
  };
}

export async function getIssue(issueKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,issuetype,priority,status,assignee,updated,fixVersions`);
  if (res.status === 404) return { ok: false, error: `${issueKey} does not exist or you cannot see it.`, issue: null };
  if (!res.ok) return { ok: false, error: `Could not read ${issueKey} (${res.status}).`, issue: null };
  const issue = await res.json();
  return { ok: true, issue: { ...normalizeIssue(issue), fixVersions: (issue.fields?.fixVersions || []).map((v) => ({ id: v.id, name: v.name })) } };
}

// All issues in one fixVersion, paged through JQL search.
// NOTE: JQL `fixVersion` matches on the version NAME (quoted), not the
// numeric version id — `fixVersion = 10000` is a 400. Callers must pass the
// version name.
// NOTE 2: the /rest/api/3/search/jql endpoint (new search API, CHANGE-2046)
// does NOT accept `startAt` — sending it is a 400 "Invalid request payload".
// Pagination is via `nextPageToken` (response field; `isLast` ends the loop).
export async function getVersionIssues(projectKey, versionName) {
  const fields = "summary,issuetype,priority,status,assignee,updated";
  const safeName = String(versionName).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const jql = `project = ${projectKey} AND fixVersion = "${safeName}" ORDER BY priority DESC, updated ASC`;
  const issues = [];
  let nextPageToken;
  for (let page = 0; page < 10; page++) {
    const body = { jql, maxResults: 100, fields: fields.split(",") };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `issue search failed (${res.status})`, issues: [] };
    const json = await res.json();
    for (const issue of json.issues || []) issues.push(normalizeIssue(issue));
    nextPageToken = json.nextPageToken;
    if (!nextPageToken || json.isLast) break;
  }
  return { ok: true, issues };
}

// Latest unreleased version of a project (or null when there is none).
export async function latestUnreleasedVersion(projectKey) {
  const v = await getVersions(projectKey);
  if (!v.ok) return { ok: false, error: v.error, version: null };
  const unreleased = v.versions.filter((x) => !x.released);
  if (unreleased.length === 0) return { ok: false, error: `Project ${projectKey} has no unreleased version.`, version: null };
  return { ok: true, version: unreleased[unreleased.length - 1] };
}
