# ShipCheck — Release Readiness Agent for Jira

Codegeist 2026 entry (Apps for Software Teams). A Forge app that scores how
ready a Jira release is to ship (0–100, GO / CAUTION / NO-GO) from live Jira
data, with a Rovo agent that answers "Can we ship 2.4?" with evidence, and an
MCP server exposing the same tools. Teamwork Graph supplies linked goals,
teams and people around the release.

## What is built (this repo)

- `manifest.yml` — modules: `jira:projectPage` (readiness dashboard),
  `jira:issuePanel` (readiness in issue context), `rovo:agent` ShipCheck,
  3 `action`s (get-readiness, list-blockers, release-summary), `rovo:mcp`
  (ShipCheck MCP), `function` handlers, 7 scopes (Jira + Teamwork Graph).
- `src/readiness.js` — pure scoring model (unit-tested, no Forge imports).
- `src/jira.js` — Jira REST data layer (projects, versions, JQL version issues).
- `src/twg.js` — Teamwork Graph client (curated queries, paging ≤25, retries).
- `src/index.js` — Rovo action handlers.
- `src/resolvers/index.js` — UI Kit resolvers.
- `src/frontend/index.jsx` — UI Kit 2 dashboard + issue panel.
- `prompts/prompt.md` — ShipCheck agent prompt.
- `test/readiness.test.js` — 9 unit tests, all passing (`npm test`).

## Validation done locally (15 Nov 2026, no Atlassian account)

- `npm test` — 9/9 pass.
- `node --check` — all backend sources parse.
- `manifest.yml` — parses; modules/actions/MCP/functions/scopes consistent.
- Frontend bundles cleanly with esbuild (all imports resolve).
- `src/index.js` imports cleanly in node; `Resolver` class verified working
  (plain-node ESM import of the CJS `@forge/resolver` package shows an
  interop artifact only — Forge's bundler handles it, as in the official
  templates).
- `forge lint` / `forge deploy` / `forge create` — BLOCKED, need `forge login`
  (Atlassian account). Not a code issue.

## To finish (needs Hardi — do NOT do this on his behalf without him)

1. Hardi creates a free Atlassian account + free Atlassian Cloud Developer
   License, and a Jira Cloud dev site (Standard/Premium trial so Rovo is on).
   He must be org admin on that site (Teamwork Graph scopes need admin
   approval at install).
2. In this directory (with Hardi logged in):
   ```
   forge login
   forge register        # replaces the placeholder app id in manifest.yml
   forge deploy -e production
   forge install         # install on the dev site, approve scopes
   forge tunnel          # for live development testing
   ```
3. Seed demo data on the dev site (a project with a version, open bugs,
   blockers, unassigned items) and test: project page, issue panel, Rovo
   chat ("Can we ship 2.4?"), MCP tools in Rovo Studio.
4. Distribution for judges: Developer Console → Distribution → Sharing
   (NOT "Sharing within organization") → copy the installation link.
5. Devpost: Hardi registers at codegeist2026.devpost.com, fills the
   submission form (installation link, public YouTube demo video <5 min,
   category = Apps for Software Teams, bonus prizes = Best Agents +
   Best Atlassian MCP + Best Teamwork Graph), submits before
   **22 Dec 2026 12:00 PT (23 Dec 03:00 WIB)**.

## VM quirk (this machine only)

The Forge CLI postinstall/config write calls `chown`, which this VM blocks
(EPERM). Workaround that works: install with `--ignore-scripts`, then run
every forge command with a fresh config dir and analytics off:

```
npm install -g @forge/cli --ignore-scripts
export XDG_CONFIG_HOME=/tmp/forge-config
forge settings set usage-analytics false
```
