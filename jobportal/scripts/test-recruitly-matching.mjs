// Offline tests for the R4 review-screen suggestions (pure functions only).
// Run: node --test scripts/test-recruitly-matching.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.STRAPI_BASE_URL = "http://strapi.test/api";
process.env.STRAPI_TOKEN = "FAKE-TOKEN";

const { nameKey, namesLookAlike, suggestForJob, mergeSuggestions, normalizeCaNumber } = await import("../lib/server/recruitlyMatching.js");

test("names compared without case, accents, punctuation or word order", () => {
    assert.equal(nameKey("Iván  Petrov"), nameKey("petrov, IVAN"));
    assert.equal(nameKey("Anna-Maria Kovač"), nameKey("kovac anna maria"));
    assert.notEqual(nameKey("Ivan Petrov"), nameKey("Ivan Petrova"));
    assert.equal(nameKey(""), "");
});

const entries = [
    { candidateId: "r1", candidateName: "Ivan Petrov" },
    { candidateId: "r2", candidateName: "Maria Ivanova" },
    { candidateId: "r3", candidateName: "Georgi Dimitrov" },
    { candidateId: "r4", candidateName: "Georgi Dimitrov" },
    { candidateId: "r1", candidateName: "Ivan Petrov" }, // same person listed twice
];

test("same name on the same job → one suggestion with the reason", () => {
    const out = suggestForJob({
        portalCandidates: [{ documentId: "p1", fullName: "PETROV Ivan" }],
        entries,
        jobRef: "JB-1180",
    });
    assert.deepEqual(out.get("p1"), [{ recruitlyId: "r1", name: "Ivan Petrov", jobRef: "JB-1180", reason: "Same name on JB-1180 in Recruitly" }]);
});

test("two people with the same name on the job → both suggested, staff warned", () => {
    const out = suggestForJob({ portalCandidates: [{ documentId: "p3", fullName: "Georgi Dimitrov" }], entries, jobRef: "JB-1180" });
    assert.equal(out.get("p3").length, 2);
    assert.match(out.get("p3")[0].reason, /2 people with this name/);
});

test("no same name → no suggestion (name alone on another job is never used)", () => {
    const out = suggestForJob({ portalCandidates: [{ documentId: "p9", fullName: "Someone Else" }], entries, jobRef: "JB-1180" });
    assert.equal(out.size, 0);
});

test("a Recruitly person already linked to a portal candidate is never suggested again", () => {
    const out = suggestForJob({
        portalCandidates: [{ documentId: "p1", fullName: "Ivan Petrov" }],
        entries,
        jobRef: "JB-1180",
        takenRecruitlyIds: new Set(["r1"]),
    });
    assert.equal(out.size, 0);
});

test("the same person found on two jobs → one suggestion listing both jobs", () => {
    const first = mergeSuggestions([], [{ recruitlyId: "r1", name: "Ivan Petrov", jobRef: "JB-1180", reason: "Same name on JB-1180 in Recruitly" }]);
    const both = mergeSuggestions(first, [{ recruitlyId: "r1", name: "Ivan Petrov", jobRef: "JB-1190", reason: "Same name on JB-1190 in Recruitly" }]);
    assert.equal(both.length, 1);
    assert.deepEqual(both[0].jobRefs, ["JB-1180", "JB-1190"]);
    assert.equal(both[0].reason, "Same name on JB-1180, JB-1190 in Recruitly");
    const again = mergeSuggestions(both, [{ recruitlyId: "r1", name: "Ivan Petrov", jobRef: "JB-1180" }]);
    assert.deepEqual(again[0].jobRefs, ["JB-1180", "JB-1190"], "no duplicate job");
});

test("CA number typed in any common form", () => {
    assert.equal(normalizeCaNumber("114061"), "CA-114061");
    assert.equal(normalizeCaNumber("ca 114061"), "CA-114061");
    assert.equal(normalizeCaNumber(" CA-114061 "), "CA-114061");
    assert.equal(normalizeCaNumber("CAN_57"), "");
    assert.equal(normalizeCaNumber("Ivan"), "");
    assert.equal(normalizeCaNumber(""), "");
});

// ---- Import: same person, name written differently → "Needs review" ----
test("import name check: word order, accents, case and punctuation do not matter", () => {
    assert.equal(namesLookAlike("Ivan Petrov", "Petrov Ivan"), true);
    assert.equal(namesLookAlike("Ivan Petrov", "Iván PETROV"), true);
    assert.equal(namesLookAlike("Petrov, Ivan", "ivan petrov"), true);
});

test("import name check: an added middle name still counts as alike", () => {
    assert.equal(namesLookAlike("Ivan Petrov", "Ivan Georgiev Petrov"), true);
    assert.equal(namesLookAlike("Maria Elena Lopez Garcia", "Maria Lopez"), true);
});

test("import name check: different people are not flagged", () => {
    assert.equal(namesLookAlike("Ivan Petrov", "Ivan Ivanov"), false, "same first name only");
    assert.equal(namesLookAlike("Ivan Petrov", "Petra Ivanova"), false);
    assert.equal(namesLookAlike("Ivan", "Ivan Petrov"), false, "one-word name never matched on part of a longer name");
    assert.equal(namesLookAlike("Ivan Ivan", "Ivan Petrov"), false, "a repeated word must appear twice");
});

test("import name check: empty names never match", () => {
    assert.equal(namesLookAlike("", "Ivan Petrov"), false);
    assert.equal(namesLookAlike(null, null), false);
    assert.equal(namesLookAlike("Ivan", "ivan"), true, "same single name, exact");
});
