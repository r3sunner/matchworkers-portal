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
    await recruitly.listJobPipeline("job-1");
    await recruitly.getCandidate("cand-1");
    await recruitly.listFileCategories();
    await recruitly.listCandidateFiles("cand-1");
    await recruitly.downloadFile({ id: "f1", categoryId: FCP });

    assert.equal(sent.length, 7);
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
    assert.ok(new URL(sent[0].url).pathname.endsWith("/api/nova/candidates/a%2F..%2Fb%3Fx%3D1"));

    assert.throws(() => recruitly.getJob(""), /jobId is required/);
});

test("call counter counts each call", async () => {
    const counter = recruitly.createCallCounter();
    await recruitly.listJobs({ counter });
    await recruitly.listJobPipeline("job-1", { counter });
    assert.equal(counter.calls, 2);
});

test("pipeline reads every page from 0, 100 at a time", async () => {
    const total = 250;
    nextResponse = () => {
        const url = new URL(sent.at(-1).url);
        const page = Number(url.searchParams.get("page"));
        const size = Number(url.searchParams.get("size"));
        const count = Math.max(0, Math.min(size, total - page * size));
        const data = Array.from({ length: count }, (_, i) => ({ id: `p${page * size + i}` }));
        return new Response(JSON.stringify({ data, page, size, total }), { status: 200 });
    };

    const counter = recruitly.createCallCounter();
    const result = await recruitly.listAllJobPipeline("job-1", { counter });

    assert.equal(result.entries.length, 250);
    assert.equal(new Set(result.entries.map((e) => e.id)).size, 250);
    assert.equal(result.complete, true);
    assert.equal(counter.calls, 3);
    assert.deepEqual(sent.map((s) => new URL(s.url).searchParams.get("page")), ["0", "1", "2"]);
});

test("pipeline stops and reports incomplete when pages run dry early", async () => {
    nextResponse = () => new Response(JSON.stringify({ data: [], total: 50 }), { status: 200 });

    const result = await recruitly.listAllJobPipeline("job-1");
    assert.equal(result.complete, false);
    assert.equal(sent.length, 1);
});
