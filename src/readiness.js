// ShipCheck readiness model — pure functions, no Forge imports, unit-tested.
//
// Score starts at 100 and loses weighted points. Verdicts:
//   >= 80 GO · 60–79 CAUTION · < 60 NO-GO
//
// Issue shape (from Jira REST, normalized in jira.js):
//   { key, summary, type, priority, status, assignee, updated, webUrl }
// Goals shape (from Teamwork Graph):
//   { name, url, achieved: boolean }

export const WEIGHTS = {
  criticalBlocker: 25, // per open critical/highest-priority bug or blocker, cap 50
  criticalBlockerCap: 50,
  highBug: 10, // per open high-priority bug, cap 30
  highBugCap: 30,
  unassignedBlocker: 5, // per open blocker/bug with no assignee, cap 15
  unassignedBlockerCap: 15,
  openWork: 2, // per other open work item in the version, cap 10
  openWorkCap: 10,
  staleWork: 3, // per open item untouched > 14 days, cap 9
  staleWorkCap: 9,
  missedGoal: 5, // per linked goal not achieved, cap 10
  missedGoalCap: 10,
};

const DONE = /^(done|closed|resolved)$/i;
const isDone = (status) => DONE.test(String(status || ""));
const isCritical = (priority) => /^(highest|critical|blocker)$/i.test(String(priority || ""));
const isHigh = (priority) => /^high$/i.test(String(priority || ""));
const isBugLike = (type) => /^(bug|defect|incident)$/i.test(String(type || ""));
const isBlockingType = (type) => /^(bug|defect|incident|blocker|task)$/i.test(String(type || ""));
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

function cap(value, max) {
  return Math.min(value, max);
}

/**
 * Score one release.
 * @param {{ issues?: Array, goals?: Array, now?: number }} input
 * @returns {{ score: number, verdict: 'GO'|'CAUTION'|'NO-GO', checks: Array<{label, detail, penalty}>, blockers: Array, counts: object }}
 */
export function computeReadiness({ issues = [], goals = [], now = Date.now() } = {}) {
  const open = issues.filter((i) => !isDone(i.status));
  const checks = [];
  let penalty = 0;

  const criticals = open.filter((i) => isBugLike(i.type) && isCritical(i.priority));
  const pCritical = cap(criticals.length * WEIGHTS.criticalBlocker, WEIGHTS.criticalBlockerCap);
  if (criticals.length > 0) {
    checks.push({ label: "Critical blockers open", detail: `${criticals.length} open (${criticals.map((i) => i.key).join(", ")})`, penalty: pCritical });
    penalty += pCritical;
  }

  const highBugs = open.filter((i) => isBugLike(i.type) && isHigh(i.priority));
  const pHigh = cap(highBugs.length * WEIGHTS.highBug, WEIGHTS.highBugCap);
  if (highBugs.length > 0) {
    checks.push({ label: "High-priority bugs open", detail: `${highBugs.length} open`, penalty: pHigh });
    penalty += pHigh;
  }

  const unassigned = open.filter((i) => isBlockingType(i.type) && !i.assignee);
  const pUnassigned = cap(unassigned.length * WEIGHTS.unassignedBlocker, WEIGHTS.unassignedBlockerCap);
  if (unassigned.length > 0) {
    checks.push({ label: "Blockers with no owner", detail: `${unassigned.length} unassigned (${unassigned.map((i) => i.key).join(", ")})`, penalty: pUnassigned });
    penalty += pUnassigned;
  }

  const otherOpen = open.filter((i) => !isBugLike(i.type));
  const pOpen = cap(otherOpen.length * WEIGHTS.openWork, WEIGHTS.openWorkCap);
  if (otherOpen.length > 0) {
    checks.push({ label: "Other work still open", detail: `${otherOpen.length} open items in this release`, penalty: pOpen });
    penalty += pOpen;
  }

  const stale = open.filter((i) => i.updated && now - Date.parse(i.updated) > STALE_MS);
  const pStale = cap(stale.length * WEIGHTS.staleWork, WEIGHTS.staleWorkCap);
  if (stale.length > 0) {
    checks.push({ label: "Stale open work", detail: `${stale.length} items untouched for over 14 days`, penalty: pStale });
    penalty += pStale;
  }

  const missedGoals = goals.filter((g) => g.achieved === false);
  const pGoals = cap(missedGoals.length * WEIGHTS.missedGoal, WEIGHTS.missedGoalCap);
  if (missedGoals.length > 0) {
    checks.push({ label: "Linked goals not achieved", detail: `${missedGoals.length} goals still open (${missedGoals.map((g) => g.name).join(", ")})`, penalty: pGoals });
    penalty += pGoals;
  }

  const score = Math.max(0, 100 - penalty);
  const verdict = score >= 80 ? "GO" : score >= 60 ? "CAUTION" : "NO-GO";
  const blockers = [...criticals, ...highBugs, ...unassigned]
    .filter((v, idx, arr) => arr.findIndex((x) => x.key === v.key) === idx)
    .map((i) => ({ key: i.key, summary: i.summary, type: i.type, priority: i.priority, status: i.status, assignee: i.assignee || null, webUrl: i.webUrl || null }));

  return {
    score,
    verdict,
    checks,
    blockers,
    counts: { total: issues.length, open: open.length, critical: criticals.length, highBugs: highBugs.length, unassigned: unassigned.length, goals: goals.length, missedGoals: missedGoals.length },
  };
}
