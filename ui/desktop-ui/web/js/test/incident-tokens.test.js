import test from "node:test";
import assert from "node:assert/strict";
import { buildTimestampToken } from "../domains/incidentops/tokens.js";

test("incident timestamp token preserves sub-second uniqueness", () => {
  const early = buildTimestampToken("2026-03-15T20:40:23.001Z");
  const late = buildTimestampToken("2026-03-15T20:40:23.999Z");

  assert.equal(early, "20260315T204023001Z");
  assert.equal(late, "20260315T204023999Z");
  assert.notEqual(early, late);
});
