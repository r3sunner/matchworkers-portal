// Offline tests for the portal-job side of the import (no network).
// Run: node --test scripts/test-recruitly-job-import.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePipeline, portalJobFields } from "../lib/server/recruitlyJobImport.js";

const item = (docId, stage, extra = {}) => ({
    id: Math.floor(Math.random() * 1000),
    candidateProcessList: stage,
    candidate: { id: 1, documentId: docId, fullName: `Name ${docId}`, caNumber: `CA-${docId}` },
    offerLetter: null,
    pipline_chats: [],
    ...extra,
});

test("new candidate is added with its stage, linked by documentId", () => {
    const m = mergePipeline([], [{ candidateDocumentId: "a", stage: "Suggested Candidate" }], new Set());
    assert.deepEqual(m.items, [{ candidateProcessList: "Suggested Candidate", candidate: "a" }]);
    assert.deepEqual(m.added, ["a"]);
});

test("re-import: same stage changes nothing; a new stage is applied", () => {
    const existing = [item("a", "Suggested Candidate"), item("b", "Suggested Candidate")];
    const m = mergePipeline(existing, [
        { candidateDocumentId: "a", stage: "Suggested Candidate" },
        { candidateDocumentId: "b", stage: "Placed" },
    ], new Set());
    assert.equal(m.items.length, 2, "no duplicate entries");
    assert.deepEqual(m.added, []);
    assert.deepEqual(m.changed, [{ documentId: "b", from: "Suggested Candidate", to: "Placed" }]);
    assert.equal(m.items[1].candidateProcessList, "Placed");
});

test("offer letter and chats on existing entries are kept; no component ids are sent", () => {
    const existing = [
        item("a", "Hired Candidate", { offerLetter: { id: 77 } }),
        item("b", "Shortlisted Candidate", { pipline_chats: [{ id: 5, documentId: "chat5" }, { id: 6, documentId: "chat6" }] }),
        item("c", "Suggested Candidate"),
    ];
    const m = mergePipeline(existing, [{ candidateDocumentId: "c", stage: "Shortlisted Candidate" }], new Set());
    assert.deepEqual(m.items[0], { candidateProcessList: "Hired Candidate", candidate: "a", offerLetter: 77 });
    assert.deepEqual(m.items[1], { candidateProcessList: "Shortlisted Candidate", candidate: "b", pipline_chats: ["chat5", "chat6"] });
    for (const it of m.items) assert.ok(!("id" in it), "component ids are never re-sent");
});

test("rejected / ended candidates are taken off the job; others untouched", () => {
    const existing = [item("a", "Shortlisted Candidate"), item("b", "Placed", { offerLetter: { id: 9 } }), item("manual", "Suggested Candidate")];
    const m = mergePipeline(existing, [], new Set(["a"]));
    assert.deepEqual(m.items.map((i) => i.candidate), ["b", "manual"]);
    assert.deepEqual(m.removed, [{ documentId: "a", fullName: "Name a", reference: "CA-a" }]);
    assert.equal(m.items[0].offerLetter, 9);
});

test("candidates added by staff (not from Recruitly) are never removed or changed", () => {
    const existing = [item("manual", "Requested Interview")];
    const m = mergePipeline(existing, [{ candidateDocumentId: "a", stage: "Suggested Candidate" }], new Set());
    assert.equal(m.items[0].candidateProcessList, "Requested Interview");
    assert.equal(m.items.length, 2);
});

test("portal job fields from a Recruitly job", () => {
    const data = portalJobFields(
        { id: "rj1", reference: "JB-1210", title: "TEST job", shortDescription: "Short", employmentTypeName: "Seasonal", statusName: "Closed", openPositions: 5 },
        "client-doc"
    );
    assert.deepEqual(data, {
        title: "TEST job",
        referenceNo: "JB-1210",
        recruitlyJobId: "rj1",
        shortDescription: "Short",
        jobTypeList: "Seasonal",
        statusList: "closed",
        client: { connect: ["client-doc"] },
        vacanciesNo: 5,
    });
    assert.equal(portalJobFields({ id: "x", statusName: "Open" }, "c").statusList, "open");
    assert.ok(!("location" in data), "Recruitly jobs have no location field");
});
