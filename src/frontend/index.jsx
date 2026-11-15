import React, { useEffect, useState } from "react";
import ForgeReconciler, { Text, Stack, Heading, Button, Select, List, ListItem, Lozenge, Spinner } from "@forge/react";
import { invoke, view } from "@forge/bridge";

const verdictTone = (verdict) => (verdict === "GO" ? "success" : verdict === "CAUTION" ? "inprogress" : "removed");

function ReadinessView({ projectKey, versionId, versionName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!projectKey || !versionId) return;
    setData(null);
    setError(null);
    invoke("getReadiness", { projectKey, versionId, versionName })
      .then((r) => (r.ok ? setData(r) : setError(r.error || "Could not load readiness.")))
      .catch((e) => setError(String(e?.message || e)));
  }, [projectKey, versionId]);
  if (error) return <Text>{error}</Text>;
  if (!data) return <Spinner size="medium" label="Checking release readiness…" />;
  return (
    <Stack space="space.200">
      <Heading size="medium">
        {projectKey} {versionName}: {data.score}/100 — {data.verdict}
      </Heading>
      <Lozenge appearance={verdictTone(data.verdict)}>{data.verdict}</Lozenge>
      <Text>
        {data.counts.open} of {data.counts.total} work items still open ({data.counts.critical} critical, {data.counts.highBugs} high-priority bugs,{" "}
        {data.counts.unassigned} unassigned).
      </Text>
      {data.checks.length > 0 && (
        <List>
          {data.checks.map((c) => (
            <ListItem key={c.label}>
              <Text>
                {c.label} — {c.detail} (−{c.penalty})
              </Text>
            </ListItem>
          ))}
        </List>
      )}
      {data.blockers.length > 0 && (
        <Stack space="space.100">
          <Heading size="small">Blockers</Heading>
          {data.blockers.map((b) => (
            <Text key={b.key}>
              {b.key} — {b.summary} ({b.priority || b.type}, {b.status}
              {b.assignee ? `, ${b.assignee}` : ", no owner"})
            </Text>
          ))}
        </Stack>
      )}
      <Text>Ask the ShipCheck agent in Rovo chat: “Can we ship {versionName}?”</Text>
    </Stack>
  );
}

function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [projectKey, setProjectKey] = useState("");
  const [versions, setVersions] = useState([]);
  const [versionId, setVersionId] = useState("");
  const [error, setError] = useState(null);
  useEffect(() => {
    invoke("getProjects")
      .then((r) => (r.ok ? setProjects(r.projects) : setError(r.error || "Could not load projects.")))
      .catch((e) => setError(String(e?.message || e)));
  }, []);
  useEffect(() => {
    if (!projectKey) return;
    setVersions([]);
    setVersionId("");
    invoke("getVersions", { projectKey }).then((r) => (r.ok ? setVersions(r.versions) : setError(r.error || "Could not load versions.")));
  }, [projectKey]);
  if (error) return <Text>{error}</Text>;
  if (projects.length === 0) return <Spinner size="medium" label="Loading projects…" />;
  const versionName = (versions.find((v) => v.id === versionId) || {}).name || "";
  const projectOption = projects.find((p) => p.key === projectKey);
  const versionOption = versions.find((v) => v.id === versionId);
  return (
    <Stack space="space.200">
      <Heading size="large">ShipCheck — Release Readiness</Heading>
      <Text>Pick a project and a release version. ShipCheck scores how ready it is to ship, from live Jira data.</Text>
      <Select
        label="Project"
        name="project"
        value={projectOption ? { label: `${projectOption.name} (${projectOption.key})`, value: projectOption.key } : null}
        onChange={(option) => setProjectKey(option?.value || "")}
        options={projects.map((p) => ({ label: `${p.name} (${p.key})`, value: p.key }))}
      />
      {projectKey && versions.length > 0 && (
        <Select
          label="Version"
          name="version"
          value={versionOption ? { label: `${versionOption.name}${versionOption.released ? " (released)" : ""}`, value: versionOption.id } : null}
          onChange={(option) => setVersionId(option?.value || "")}
          options={versions.map((v) => ({ label: `${v.name}${v.released ? " (released)" : ""}`, value: v.id }))}
        />
      )}
      {projectKey && versionId && <ReadinessView projectKey={projectKey} versionId={versionId} versionName={versionName} />}
    </Stack>
  );
}

function IssuePanel() {
  const [context, setContext] = useState(null);
  useEffect(() => {
    view.getContext().then(setContext);
  }, []);
  const [issue, setIssue] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const key = context?.extension?.issue?.key;
    if (!key) return;
    invoke("getIssue", { issueKey: key })
      .then((r) => (r.ok ? setIssue(r.issue) : setError(r.error || "Could not load issue.")))
      .catch((e) => setError(String(e?.message || e)));
  }, [context]);
  if (error) return <Text>{error}</Text>;
  if (!issue) return <Spinner size="medium" label="Loading…" />;
  const projectKey = issue.key.split("-")[0];
  const version = (issue.fixVersions || [])[0];
  if (!version) return <Text>This issue has no fix version, so there is no release to score.</Text>;
  return <ReadinessView projectKey={projectKey} versionId={version.id} versionName={version.name} />;
}

const App = () => {
  const [context, setContext] = useState(null);
  useEffect(() => {
    view.getContext().then(setContext).catch(() => setContext({}));
  }, []);
  if (context === null) return <Spinner size="medium" label="Loading…" />;
  return context?.extension?.issue ? <IssuePanel /> : <Dashboard />;
};

ForgeReconciler.render(<App />);
