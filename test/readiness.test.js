import test from "node:test";
import assert from "node:assert/strict";
import { computeReadiness } from "../src/readiness.js";

const issue = (over = {}) => ({
  key: "DEMO-1",
  summary: "Fix login",
  type: "Bug",
  priority: "Medium",
  status: "To Do",
  assignee: "Ana",
  updated: new Date().toISOString(),
  webUrl: null,
  ...over,
});

test("empty release scores 100 GO", () => {
  const r = computeReadiness({ issues: [] });
  assert.equal(r.score, 100);
  assert.equal(r.verdict, "GO");
  assert.deepEqual(r.checks, []);
});

test("all-done release scores 100 GO", () => {
  const r = computeReadiness({ issues: [issue({ status: "Done" }), issue({ key: "DEMO-2", status: "Closed" })] });
  assert.equal(r.score, 100);
  assert.equal(r.verdict, "GO");
});

test("one critical blocker costs 25 → 75 CAUTION", () => {
  const r = computeReadiness({ issues: [issue({ priority: "Highest" })] });
  assert.equal(r.score, 75);
  assert.equal(r.verdict, "CAUTION");
  assert.equal(r.blockers.length, 1);
  assert.equal(r.blockers[0].key, "DEMO-1");
});

test("critical penalty caps at 50", () => {
  const issues = [1, 2, 3, 4].map((n) => issue({ key: `DEMO-${n}`, priority: "Highest" }));
  const r = computeReadiness({ issues });
  assert.equal(r.score, 50);
  assert.equal(r.verdict, "NO-GO");
});

test("high bugs cost 10 each, capped at 30", () => {
  const issues = [1, 2, 3, 4].map((n) => issue({ key: `DEMO-${n}`, priority: "High" }));
  const r = computeReadiness({ issues });
  assert.equal(r.score, 70);
  assert.equal(r.verdict, "CAUTION");
});

test("unassigned blockers cost 5 each (plus 2 for still-open work)", () => {
  const r = computeReadiness({ issues: [issue({ assignee: null, type: "Task" })] });
  assert.equal(r.score, 93); // -5 no owner, -2 still open
  assert.equal(r.verdict, "GO");
  assert.equal(r.counts.unassigned, 1);
});

test("stale open work is penalized", () => {
  const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  const r = computeReadiness({ issues: [issue({ type: "Story", updated: old })] });
  // open story: -2 open work, -3 stale = 95
  assert.equal(r.score, 95);
  assert.equal(r.checks.some((c) => c.label === "Stale open work"), true);
});

test("missed goals are penalized only when explicitly false", () => {
  const r = computeReadiness({ issues: [], goals: [{ name: "Q4 launch", achieved: false }] });
  assert.equal(r.score, 95);
  const r2 = computeReadiness({ issues: [], goals: [{ name: "Q4 launch", achieved: null }] });
  assert.equal(r2.score, 100);
});

test("combined penalties stack and floor at 0", () => {
  const issues = [1, 2, 3, 4, 5, 6].map((n) => issue({ key: `DEMO-${n}`, priority: "Highest", assignee: null }));
  const r = computeReadiness({ issues, goals: [{ name: "G", achieved: false }] });
  assert.ok(r.score >= 0 && r.score < 60);
  assert.equal(r.verdict, "NO-GO");
});
