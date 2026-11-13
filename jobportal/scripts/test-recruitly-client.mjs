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

test("placements are read 100 at a time until the total", async () => {
    const total = 250;
    nextResponse = () => {
        const url = new URL(sent.at(-1).url);
        const page = Number(url.searchParams.get("page"));
        const size = Number(url.searchParams.get("size"));
        const count = Math.max(0, Math.min(size, total - page * size));
        const data = Array.from({ length: count }, (_, i) => ({ id: `pl${page * size + i}` }));
        return new Response(JSON.stringify({ data, page, size, total }), { status: 200 });
    };

    const counter = recruitly.createCallCounter();
    const result = await recruitly.listAllPlacements({ counter });

    assert.equal(result.placements.length, 250);
    assert.equal(result.complete, true);
    assert.equal(counter.calls, 3);
    assert.deepEqual(sent.map((s) => new URL(s.url).searchParams.get("size")), ["100", "100", "100"]);
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
        nationalityCodes: ["IN", "NP"],
        email: " test.one@example.test ",
        mobile: "+91 98765 43210",
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
        nationalityCodes: ["IN", "NP"],
        email: "test.one@example.test",
        mobile: "+91 98765 43210",
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

// ---- Placements for one job (speed: stop early, else parallel + cache) ----

function placementPages(total, wantedOnPage, wanted) {
    return () => {
        const url = new URL(sent[sent.length - 1].url);
        const page = Number(url.searchParams.get("page"));
        const rows = Array.from({ length: Math.min(100, total - page * 100) }, (_, i) => ({
            candidateId: `other-${page}-${i}`,
            jobId: "other-job",
            statusName: "Ended",
        }));
        if (page === wantedOnPage) rows[0] = { ...wanted };
        return new Response(JSON.stringify({ data: rows, total }), { status: 200 });
    };
}

const PLACED_ENTRY = [{ candidateId: "c-placed", jobId: "job-1", status: "PLACED", rejected: false }];
const WANTED = { candidateId: "c-placed", jobId: "job-1", statusName: "Landed - Working with our client" };

test("placementsForJob: no Placed entry → no Recruitly call", async () => {
    globalThis.__recruitlyListCache?.clear();
    const result = await recruitly.placementsForJob([{ candidateId: "x", status: "CV_SENT" }], "job-1");
    assert.equal(result, null);
    assert.equal(sent.length, 0);
});

test("placementsForJob: placement on the first page → 1 call only", async () => {
    globalThis.__recruitlyListCache?.clear();
    nextResponse = placementPages(751, 0, WANTED);
    const result = await recruitly.placementsForJob(PLACED_ENTRY, "job-1");
    assert.equal(sent.length, 1);
    assert.ok(result.placements.some((p) => p.candidateId === "c-placed" && p.statusName === WANTED.statusName));
});

test("placementsForJob: placement on a later page → reads all pages, then cached; fresh reads again", async () => {
    globalThis.__recruitlyListCache?.clear();
    nextResponse = placementPages(751, 6, WANTED);
    const result = await recruitly.placementsForJob(PLACED_ENTRY, "job-1");
    assert.equal(sent.length, 8, "page 0 + 7 more pages");
    assert.equal(result.placements.length, 751);
    assert.equal(result.complete, true);
    assert.ok(result.placements.some((p) => p.candidateId === "c-placed"));
    const pages = sent.map((s) => Number(new URL(s.url).searchParams.get("page"))).sort((a, b) => a - b);
    assert.deepEqual(pages, [0, 1, 2, 3, 4, 5, 6, 7]);

    sent = [];
    await recruitly.placementsForJob(PLACED_ENTRY, "job-1");
    assert.equal(sent.length, 0, "second load within 5 minutes uses the cache");

    await recruitly.placementsForJob(PLACED_ENTRY, "job-1", { fresh: true });
    assert.ok(sent.length >= 1, "Reload from Recruitly skips the cache");
});

test("placementsForJob: Placed with no placement record at all → full list read, nothing found", async () => {
    globalThis.__recruitlyListCache?.clear();
    nextResponse = placementPages(250, -1, WANTED);
    const result = await recruitly.placementsForJob(PLACED_ENTRY, "job-1");
    assert.equal(sent.length, 3);
    assert.ok(!result.placements.some((p) => p.candidateId === "c-placed"));
});

// ---- One retry for dropped connections / brief outages ----

test("a dropped connection is retried once, then succeeds", async () => {
    let n = 0;
    nextResponse = () => {
        n += 1;
        if (n === 1) throw new TypeError("fetch failed");
        return new Response(JSON.stringify({ data: [{ id: "j1" }] }), { status: 200 });
    };
    const counter = recruitly.createCallCounter();
    const json = await recruitly.recruitlyRequest("GET", "/api/nova/jobs/list", { counter });
    assert.equal(json.data[0].id, "j1");
    assert.equal(sent.length, 2);
    assert.equal(counter.calls, 2, "both attempts count toward the daily limit");
});

test("503 is retried once; 429 (daily limit) and 404 are not", async () => {
    let n = 0;
    nextResponse = () => (++n === 1 ? new Response("", { status: 503 }) : new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    assert.deepEqual(await recruitly.recruitlyRequest("GET", "/api/nova/jobs/list"), { ok: 1 });
    assert.equal(sent.length, 2);

    for (const status of [429, 404, 500]) {
        sent = [];
        nextResponse = () => new Response("", { status });
        await assert.rejects(recruitly.recruitlyRequest("GET", "/api/nova/jobs/list"), recruitly.RecruitlyError);
        assert.equal(sent.length, 1, `${status} must not be retried`);
    }
});

test("two dropped connections in a row give a clear error", async () => {
    nextResponse = () => {
        throw new TypeError("fetch failed");
    };
    await assert.rejects(recruitly.recruitlyRequest("GET", "/api/nova/jobs/list"), /Recruitly request failed/);
    assert.equal(sent.length, 2);
});
