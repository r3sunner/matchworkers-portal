// Offline checks for lib/server/recruitly.js. No network: fetch is replaced.
// Run from jobportal/:  node --test scripts/test-recruitly-client.mjs

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const FAKE_KEY = "FAKE-KEY-FOR-TEST";
const FCP = "6b3da17a-ff98-4abf-bc6f-35ed41007d39";
const PHOTO = "937bc133-5d97-45f3-806b-40f5cbb48419";
const BIRTH_CERT = "990727ca-0000-0000-0000-000000000000";

let sent = [];
let logs = [];
let nextResponse = () => new Response(JSON.stringify({ data: [] }), { status: 200 });

globalThis.fetch = async (url, options) => {
    sent.push({ url: String(url), method: options?.method });
    return nextResponse();
};
for (const level of ["log", "error"]) {
    console[level] = (...args) => logs.push(args.join(" "));
}

process.env.RECRUITLY_API_KEY = FAKE_KEY;
const recruitly = await import("../lib/server/recruitly.js");

beforeEach(() => {
    sent = [];
    logs = [];
    process.env.RECRUITLY_API_KEY = FAKE_KEY;
    nextResponse = () => new Response(JSON.stringify({ data: [] }), { status: 200 });
});

test("every method except GET is refused before anything is sent", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "get", "", undefined]) {
        await assert.rejects(
            recruitly.recruitlyRequest(method, "/api/nova/jobs/list"),
            recruitly.RecruitlyError,
            `${method} should be refused`
        );
    }
    assert.equal(sent.length, 0);
});

test("every exported call sends GET only", async () => {
    nextResponse = () => new Response(JSON.stringify({ data: [{ id: "f1", categoryId: FCP }] }), { status: 200 });

    await recruitly.listJobs();
    await recruitly.getJob("job-1");
    await recruitly.listAllJobPipeline("job-1");
    await recruitly.getCandidate("cand-1");
    await recruitly.getMasterdata();
    await recruitly.listFileCategories();
    await recruitly.listCandidateFiles("cand-1");
    await recruitly.downloadFile({ id: "f1", categoryId: FCP });

    assert.equal(sent.length, 8);
    assert.deepEqual([...new Set(sent.map((s) => s.method))], ["GET"]);
});

test("key is sent as apiKey but never logged or put in errors", async () => {
    await recruitly.listJobs();
    assert.ok(new URL(sent[0].url).searchParams.get("apiKey") === FAKE_KEY);

    nextResponse = () => new Response("denied", { status: 403 });
    const error = await recruitly.getJob("job-1").catch((e) => e);
    assert.equal(error.status, 403);
    assert.ok(!error.message.includes(FAKE_KEY));

    nextResponse = () => { throw new Error(`network down ${FAKE_KEY}`); };
    const networkError = await recruitly.listJobs().catch((e) => e);
    assert.ok(!networkError.message.includes(FAKE_KEY));

    assert.ok(logs.length > 0);
    assert.ok(logs.every((line) => !line.includes(FAKE_KEY)));
});

test("missing key fails without sending", async () => {
    delete process.env.RECRUITLY_API_KEY;
    await assert.rejects(recruitly.listJobs(), /RECRUITLY_API_KEY is not set/);
    assert.equal(sent.length, 0);
});

test("file list keeps only Full Candidate Profile and Photo", async () => {
    nextResponse = () => new Response(JSON.stringify({ data: [
        { id: "f1", categoryId: FCP },
        { id: "f2", categoryId: PHOTO },
        { id: "f3", categoryId: BIRTH_CERT },
        { id: "f4", categoryId: null },
        { id: "f5" },
    ] }), { status: 200 });

    const files = await recruitly.listCandidateFiles("cand-1");
    assert.deepEqual(files.map((f) => f.id), ["f1", "f2"]);
});

test("download of any other category is refused before sending", () => {
    for (const file of [{ id: "f3", categoryId: BIRTH_CERT }, { id: "f4" }, { id: "f5", categoryId: "" }, null]) {
        assert.throws(() => recruitly.downloadFile(file), recruitly.RecruitlyError);
    }
    assert.equal(sent.length, 0);
});

test("ids are encoded and empty ids refused", async () => {
    await recruitly.getCandidate("a/../b?x=1");
    assert.ok(new URL(sent[0].url).pathname.endsWith("/api/candidate/a%2F..%2Fb%3Fx%3D1"));

    assert.throws(() => recruitly.getJob(""), /jobId is required/);
});

test("call counter counts each call", async () => {
    const counter = recruitly.createCallCounter();
    await recruitly.listJobs({ counter });
    await recruitly.getMasterdata({ counter });
    assert.equal(counter.calls, 2);
});

test("pipeline reads every entry of a job in one call", async () => {
    const data = Array.from({ length: 250 }, (_, i) => ({ id: `p${i}` }));
    nextResponse = () => new Response(JSON.stringify({ success: true, data, total: 250 }), { status: 200 });

    const counter = recruitly.createCallCounter();
    const result = await recruitly.listAllJobPipeline("job-1", { counter });

    assert.equal(result.entries.length, 250);
    assert.equal(result.complete, true);
    assert.equal(counter.calls, 1);
    assert.ok(new URL(sent[0].url).pathname.endsWith("/api/nova/pipelines/job/job-1"));
});

test("pipeline reports incomplete when Recruitly sends fewer than its total", async () => {
    nextResponse = () => new Response(JSON.stringify({ data: [{ id: "p1" }], total: 50 }), { status: 200 });

    const result = await recruitly.listAllJobPipeline("job-1");
    assert.equal(result.complete, false);
});

test("empty body (unknown id) returns null instead of failing", async () => {
    nextResponse = () => new Response("", { status: 200 });
    assert.equal(await recruitly.getCandidate("no-such-id"), null);
});

test("candidate mapping keeps only the import fields, custom fields by ID", () => {
    const mapped = recruitly.toImportCandidate({
        id: "c1",
        reference: "CA-1",
        firstName: "Test",
        surname: "One",
        fullName: "",
        jobTitle: "Cleaner",
        gender: "Male",
        nationalities: ["Indian", { name: "Nepalese" }, ""],
        overview: "Summary",
        dateOfBirth: "01/01/1990",
        niNumber: "AB123456C",
        notes: "private",
        udfList: [
            { key: { id: recruitly.CUSTOM_FIELD_YEARS_OF_EXPERIENCE, label: "renamed label" }, value: { textValue: "4", listValue: [] } },
            { key: { id: recruitly.CUSTOM_FIELD_WORKING_VIDEO_LINK }, value: { textValue: "", listValue: ["https://video"] } },
            { key: { id: "other-field" }, value: { textValue: "ignored" } },
        ],
    });

    assert.deepEqual(mapped, {
        recruitlyId: "c1",
        reference: "CA-1",
        fullName: "Test One",
        firstName: "Test",
        lastName: "One",
        jobTitle: "Cleaner",
        gender: "Male",
        nationalities: ["Indian", "Nepalese"],
        overview: "Summary",
        yearsOfExperience: "4",
        workingVideoLink: "https://video",
    });

    const blank = recruitly.toImportCandidate({ id: "c2" });
    assert.equal(blank.workingVideoLink, "");
    assert.deepEqual(blank.nationalities, []);
});

test("latest file per category uses the dd/mm/yyyy upload date", () => {
    const latest = recruitly.latestFiles([
        { id: "old", categoryId: FCP, uploadedOn: "31/12/2025 23:59:59" },
        { id: "new", categoryId: FCP, uploadedOn: "02/01/2026 08:00:00" },
        { id: "mid", categoryId: FCP, uploadedOn: "01/02/2025 10:00:00" },
    ]);

    assert.equal(latest.fullCandidateProfile.id, "new");
    assert.equal(latest.photo, null);
});
