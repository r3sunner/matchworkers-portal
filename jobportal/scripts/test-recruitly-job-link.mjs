// Offline tests for finding / linking / creating the portal job (Strapi faked).
// Run: node --test scripts/test-recruitly-job-link.mjs
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.STRAPI_BASE_URL = "http://strapi.test/api";
process.env.STRAPI_TOKEN = "FAKE-TOKEN";
for (const level of ["log", "error", "warn"]) console[level] = () => {};

let jobs = [];
let writes = [];

const matches = (job, filters) => {
    if (filters?.recruitlyJobId?.$eq !== undefined) return String(job.recruitlyJobId || "") === filters.recruitlyJobId.$eq;
    if (filters?.referenceNo?.$eqi !== undefined) return String(job.referenceNo || "").toLowerCase() === filters.referenceNo.$eqi.toLowerCase();
    return false;
};

// Rebuild the filters object from Strapi's bracket query string.
function filtersFrom(u) {
    const f = {};
    for (const [k, v] of u.searchParams) {
        const m = k.match(/^filters\[(\w+)\]\[(\$\w+)\]$/);
        if (m) f[m[1]] = { [m[2]]: v };
    }
    return f;
}

globalThis.fetch = async (url, options = {}) => {
    const u = new URL(String(url));
    const method = options.method || "GET";
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.pathname === "/api/jobs" && method === "GET") return json({ data: jobs.filter((j) => matches(j, filtersFrom(u))) });
    if (u.pathname === "/api/jobs" && method === "POST") {
        const data = JSON.parse(options.body).data;
        writes.push({ method, data });
        jobs.push({ documentId: "new-job", ...data, client: { documentId: data.client.connect[0] } });
        return json({ data: {} });
    }
    const put = u.pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (put && method === "PUT") {
        const data = JSON.parse(options.body).data;
        writes.push({ method, documentId: put[1], data });
        return json({ data: {} });
    }
    return json({ error: { message: `unexpected ${method} ${u.href}` } }, 500);
};

const { findOrCreatePortalJob } = await import("../lib/server/recruitlyJobImport.js");

const client = { documentId: "client-balkan", companyName: "Balkan" };
const recruitlyJob = { id: "rj-1180", reference: "JB-1180", title: "Cleaner", employmentTypeName: "Permanent" };
const oldJob = (over = {}) => ({
    documentId: "old-1180",
    referenceNo: "JB-1180",
    title: "Cleaners for Balkan (staff wording)",
    jobTypeList: "Permanent",
    client: { documentId: "client-balkan", companyName: "Balkan" },
    ...over,
});

beforeEach(() => {
    jobs = [];
    writes = [];
});

test("existing portal job with the same reference is linked, not duplicated; staff fields kept", async () => {
    jobs = [oldJob()];
    const r = await findOrCreatePortalJob(recruitlyJob, client);
    assert.equal(r.created, false);
    assert.equal(r.linked, true);
    assert.equal(r.job.documentId, "old-1180");
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].data, { recruitlyJobId: "rj-1180" }, "only the link is written; title etc. untouched");
    assert.ok(!writes.some((w) => w.method === "POST"), "no new job");
});

test("reference compared without case; Job Type refreshed in the same save", async () => {
    jobs = [oldJob({ referenceNo: "jb-1180", jobTypeList: "Temporary" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client);
    assert.equal(r.linked, true);
    assert.deepEqual(writes[0].data, { recruitlyJobId: "rj-1180", jobTypeList: "Permanent" });
});

test("same reference but another client: refused, nothing written", async () => {
    jobs = [oldJob({ client: { documentId: "client-other", companyName: "Other Co" } })];
    await assert.rejects(findOrCreatePortalJob(recruitlyJob, client), (e) => e.status === 409 && /another client \(Other Co\)/.test(e.message));
    assert.equal(writes.length, 0);
});

test("two portal jobs with the same reference: refused, nothing written", async () => {
    jobs = [oldJob(), oldJob({ documentId: "old-1180-b" })];
    await assert.rejects(findOrCreatePortalJob(recruitlyJob, client), (e) => e.status === 409 && /2 portal jobs with reference JB-1180/.test(e.message));
    assert.equal(writes.length, 0);
});

test("same reference already linked to a different Recruitly job: refused", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-OTHER" })];
    await assert.rejects(findOrCreatePortalJob(recruitlyJob, client), (e) => e.status === 409 && /different Recruitly job/.test(e.message));
    assert.equal(writes.length, 0);
});

test("old job with no client: linked and given this client", async () => {
    jobs = [oldJob({ client: null })];
    const r = await findOrCreatePortalJob(recruitlyJob, client);
    assert.equal(r.linked, true);
    assert.deepEqual(writes[0].data, { recruitlyJobId: "rj-1180", client: { connect: ["client-balkan"] } });
});

test("already linked by Recruitly ID: found directly, not reported as newly linked", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client);
    assert.deepEqual([r.created, r.linked], [false, false]);
    assert.equal(writes.length, 0, "Job Type same, nothing to save");
});

test("no match at all: a new portal job is created", async () => {
    jobs = [oldJob({ referenceNo: "JB-9999" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client);
    assert.deepEqual([r.created, r.linked], [true, false]);
    assert.equal(writes[0].method, "POST");
    assert.equal(writes[0].data.referenceNo, "JB-1180");
});
