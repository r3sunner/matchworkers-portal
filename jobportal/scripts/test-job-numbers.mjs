// Offline tests for the one-off job number rename plan (JB- portal numbers → PJ-).
// Run: node --test scripts/test-job-numbers.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { planJobRenames } from "../lib/server/jobNumbers.js";

test("portal-only JB- jobs get PJ- with the same digits; old number kept", () => {
    const { renames, skipped } = planJobRenames([{ documentId: "a", referenceNo: "JB-1252" }]);
    assert.deepEqual(renames, [{ documentId: "a", from: "JB-1252", to: "PJ-1252", keepPrevious: true }]);
    assert.deepEqual(skipped, []);
});

test("jobs linked to Recruitly keep their JB number", () => {
    const { renames } = planJobRenames([{ documentId: "r", referenceNo: "JB-1210", recruitlyJobId: "rj-1" }]);
    assert.deepEqual(renames, []);
});

test("PJ- and other numbers are left alone", () => {
    const { renames } = planJobRenames([
        { documentId: "p", referenceNo: "PJ-2090" },
        { documentId: "l", referenceNo: "JB-L8" },
        { documentId: "x", referenceNo: "TEST-1" },
        { documentId: "e", referenceNo: "" },
    ]);
    assert.deepEqual(renames.map((r) => r.to), ["PJ-L8"], "JB-L8 is a JB- number too");
});

test("never two jobs with the same new number", () => {
    const { renames, skipped } = planJobRenames([
        { documentId: "a", referenceNo: "JB-5" },
        { documentId: "b", referenceNo: "PJ-5" },
        { documentId: "c", referenceNo: "jb-7" },
        { documentId: "d", referenceNo: "JB-7" },
    ]);
    assert.deepEqual(renames.map((r) => [r.documentId, r.to]), [["c", "PJ-7"]]);
    assert.deepEqual(skipped.map((s) => s.documentId), ["a", "d"]);
});

test("an earlier previous number is never overwritten", () => {
    const { renames } = planJobRenames([{ documentId: "a", referenceNo: "JB-9", previousReferenceNo: "OLD-9" }]);
    assert.equal(renames[0].keepPrevious, false);
});
