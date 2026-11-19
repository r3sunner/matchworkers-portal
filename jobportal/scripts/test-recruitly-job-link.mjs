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
    if (filters?.["client.documentId"]?.$eq !== undefined) return job.client?.documentId === filters["client.documentId"].$eq;
    return false;
};

// Rebuild the filters object from Strapi's bracket query string.
function filtersFrom(u) {
    const f = {};
    for (const [k, v] of u.searchParams) {
        const m = k.match(/^filters\[(\w+)\]\[(\$\w+)\]$/);
        if (m) f[m[1]] = { [m[2]]: v };
        const n = k.match(/^filters\[(\w+)\]\[(\w+)\]\[(\$\w+)\]$/);
        if (n) f[`${n[1]}.${n[2]}`] = { [n[3]]: v };
    }
    return f;
}

globalThis.fetch = async (url, options = {}) => {
    const u = new URL(String(url));
    const method = options.method || "GET";
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.pathname === "/api/jobs" && method === "GET") {
        return json({ data: jobs.filter((j) => matches(j, filtersFrom(u))), meta: { pagination: { pageCount: 1 } } });
    }
    if (u.pathname === "/api/jobs" && method === "POST") {
        const data = JSON.parse(options.body).data;
        writes.push({ method, data });
        jobs.push({ documentId: "new-job", ...data, client: { documentId: data.client.connect[0] } });
        return json({ data: {} });
    }
    const put = u.pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (put && method === "GET") {
        const job = jobs.find((j) => j.documentId === put[1]);
        return job ? json({ data: job }) : json({ error: { message: "Not Found" } }, 404);
    }
    if (put && method === "PUT") {
        const data = JSON.parse(options.body).data;
        writes.push({ method, documentId: put[1], data });
        return json({ data: {} });
    }
    return json({ error: { message: `unexpected ${method} ${u.href}` } }, 500);
};

const { findOrCreatePortalJob, joinFields, linkLocked, portalJobChoices, rankPortalJobs, titleSimilarity, unlinkFields, unlinkPortalJob } = await import(
    "../lib/server/recruitlyJobImport.js"
);

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

const NEW = { createNew: true };

test("not linked and no choice from staff: refused, nothing created or joined", async () => {
    jobs = [oldJob()];
    await assert.rejects(findOrCreatePortalJob(recruitlyJob, client), (e) => e.status === 409 && /not linked to a portal job yet/.test(e.message));
    assert.equal(writes.length, 0);
});

test("staff chose a portal job: it is joined (Recruitly job ID stored), title and everything else kept", async () => {
    jobs = [oldJob()];
    const r = await findOrCreatePortalJob(recruitlyJob, client, { portalJobDocumentId: "old-1180" });
    assert.deepEqual([r.created, r.joined], [false, true]);
    assert.equal(r.job.documentId, "old-1180");
    assert.deepEqual(writes, [{ method: "PUT", documentId: "old-1180", data: { recruitlyJobId: "rj-1180" } }]);
    assert.ok(!writes.some((w) => w.method === "POST"), "no new job");
});

test("joined job: Job Type refreshed in the same save; job without client gets this client", async () => {
    jobs = [oldJob({ jobTypeList: "Temporary", client: null })];
    await findOrCreatePortalJob(recruitlyJob, client, { portalJobDocumentId: "old-1180" });
    assert.deepEqual(writes[0].data, { recruitlyJobId: "rj-1180", client: { connect: ["client-balkan"] }, jobTypeList: "Permanent" });
});

test("chosen portal job belongs to another client: refused, nothing written", async () => {
    jobs = [oldJob({ client: { documentId: "client-other", companyName: "Other Co" } })];
    await assert.rejects(
        findOrCreatePortalJob(recruitlyJob, client, { portalJobDocumentId: "old-1180" }),
        (e) => e.status === 409 && /another client \(Other Co\)/.test(e.message)
    );
    assert.equal(writes.length, 0);
});

test("chosen portal job already linked to another Recruitly job: refused, nothing written", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-OTHER" })];
    await assert.rejects(
        findOrCreatePortalJob(recruitlyJob, client, { portalJobDocumentId: "old-1180" }),
        (e) => e.status === 409 && /already linked to another Recruitly job/.test(e.message)
    );
    assert.equal(writes.length, 0);
});

test("chosen portal job not found: refused with a clear message", async () => {
    await assert.rejects(
        findOrCreatePortalJob(recruitlyJob, client, { portalJobDocumentId: "gone" }),
        (e) => e.status === 404 && /not found/.test(e.message)
    );
    assert.equal(writes.length, 0);
});

test("already linked: the linked job is used even if staff's choice says otherwise", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180" }), oldJob({ documentId: "other-job", referenceNo: "JB-5" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client, { portalJobDocumentId: "other-job" });
    assert.equal(r.job.documentId, "old-1180");
    assert.equal(r.joined, false);
    assert.equal(writes.length, 0);
});

test("portal job with the same JB number but not linked: NOT used; a new job is created, the portal's own job untouched", async () => {
    jobs = [oldJob()];
    const r = await findOrCreatePortalJob(recruitlyJob, client, NEW);
    assert.equal(r.created, true);
    assert.equal(r.job.documentId, "new-job");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, "POST");
    assert.equal(writes[0].data.referenceNo, "JB-1180");
    assert.equal(writes[0].data.recruitlyJobId, "rj-1180");
    assert.ok(!writes.some((w) => w.documentId === "old-1180"), "the portal's own JB-1180 is never written");
});

test("same JB number on another client's portal job: import not blocked, new job created for this client", async () => {
    jobs = [oldJob({ client: { documentId: "client-other", companyName: "Other Co" } })];
    const r = await findOrCreatePortalJob(recruitlyJob, client, NEW);
    assert.equal(r.created, true);
    assert.deepEqual(writes[0].data.client, { connect: ["client-balkan"] });
});

test("two portal jobs with the same JB number: ignored, new job created", async () => {
    jobs = [oldJob(), oldJob({ documentId: "old-1180-b" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client, NEW);
    assert.equal(r.created, true);
    assert.equal(writes.length, 1);
});

test("the job lookup asks Strapi by Recruitly job ID only, never by reference", async () => {
    const asked = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        asked.push(String(url));
        return realFetch(url, options);
    };
    try {
        await findOrCreatePortalJob(recruitlyJob, client, NEW);
    } finally {
        globalThis.fetch = realFetch;
    }
    const gets = asked.filter((u) => decodeURIComponent(u).includes("filters["));
    assert.ok(gets.length >= 1);
    assert.ok(gets.every((u) => !decodeURIComponent(u).includes("filters[referenceNo]")), "no reference filter");
});

test("already linked by Recruitly ID: found directly, nothing created", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client);
    assert.equal(r.created, false);
    assert.equal(r.job.documentId, "old-1180");
    assert.equal(writes.length, 0, "Job Type same, nothing to save");
});

test("linked job: Job Type refreshed, nothing else written", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180", jobTypeList: "Temporary" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client);
    assert.equal(r.created, false);
    assert.deepEqual(writes, [{ method: "PUT", documentId: "old-1180", data: { jobTypeList: "Permanent" } }]);
});

test("linked job belongs to another client: refused, nothing written", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180", client: { documentId: "client-other", companyName: "Other Co" } })];
    await assert.rejects(findOrCreatePortalJob(recruitlyJob, client), (e) => e.status === 409 && /another client \(Other Co\)/.test(e.message));
    assert.equal(writes.length, 0);
});

test("two portal jobs linked to the same Recruitly job: refused, nothing written", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180" }), oldJob({ documentId: "old-1180-b", recruitlyJobId: "rj-1180" })];
    await assert.rejects(findOrCreatePortalJob(recruitlyJob, client), (e) => e.status === 409 && /More than one portal job/.test(e.message));
    assert.equal(writes.length, 0);
});

test("no match at all: a new portal job is created", async () => {
    jobs = [oldJob({ referenceNo: "JB-9999" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client, NEW);
    assert.equal(r.created, true);
    assert.equal(writes[0].method, "POST");
    assert.equal(writes[0].data.referenceNo, "JB-1180");
});

test("title similarity: same job written differently scores high, unrelated jobs low", () => {
    assert.ok(titleSimilarity("Production workers - filling department", "Production Worker – Fillings Department") >= 0.9);
    assert.ok(titleSimilarity("Waiter/Waitress", "Waiter / Waitress") === 1);
    assert.ok(titleSimilarity("Electrician", "Financial Analyst") === 0);
    assert.equal(titleSimilarity("", "Cook"), 0);
});

test("portal job choices: only jobs not linked to Recruitly, closest title first, candidate count shown", () => {
    const list = rankPortalJobs(
        [
            { documentId: "a", title: "Kitchen Helper", referenceNo: "JB-901", createdAt: "2026-10-13", assignCandidatesToJob: [{}, {}] },
            { documentId: "b", title: "Cleaners", referenceNo: "JB-1180", createdAt: "2026-10-22", assignCandidatesToJob: [{}] },
            { documentId: "c", title: "Cleaner", referenceNo: "JB-1210", recruitlyJobId: "rj-x", createdAt: "2026-11-18" },
            { documentId: "d", title: "Waiter", referenceNo: "JB-1023", createdAt: "2026-10-19" },
        ],
        "Cleaner"
    );
    assert.deepEqual(list.map((o) => o.documentId), ["b", "d", "a"], "linked job c left out; equal scores newest first");
    assert.equal(list[0].similarity, 1);
    assert.equal(list[0].candidateCount, 1);
    assert.equal(list[2].candidateCount, 2);
});

// ---- Change / Remove link, locked once this Recruitly job's candidates are on the job ----
const onJob = (...recruitlyIds) => recruitlyIds.map((id, i) => ({ candidate: { documentId: `c${i}`, recruitlyId: id } }));
const pipelineOf = (...ids) => async () => new Set(ids);

test("link locked only when a candidate on the job is on THIS Recruitly job", () => {
    const thisJob = new Set(["rc-1", "rc-2"]);
    assert.equal(linkLocked(oldJob(), thisJob), false);
    assert.equal(linkLocked(oldJob({ assignCandidatesToJob: onJob("", null) }), thisJob), false, "old portal candidates only");
    assert.equal(linkLocked(oldJob({ assignCandidatesToJob: onJob("rc-99") }), thisJob), false, "linked through another Recruitly job");
    assert.equal(linkLocked(oldJob({ assignCandidatesToJob: onJob("", "rc-2") }), thisJob), true);
});

test("Remove link before any import: only the Recruitly job ID is cleared, job kept; no pipeline read needed", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180", assignCandidatesToJob: onJob("") })];
    let read = 0;
    const r = await unlinkPortalJob(recruitlyJob, client, { loadRecruitlyCandidateIds: async () => (read++, new Set()) });
    assert.equal(r.documentId, "old-1180");
    assert.equal(read, 0);
    assert.deepEqual(writes, [{ method: "PUT", documentId: "old-1180", data: { recruitlyJobId: null } }]);
});

test("Remove link: candidates linked through OTHER Recruitly jobs do not lock it", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180", assignCandidatesToJob: onJob("rc-99") })];
    await unlinkPortalJob(recruitlyJob, client, { loadRecruitlyCandidateIds: pipelineOf("rc-1") });
    assert.deepEqual(writes, [{ method: "PUT", documentId: "old-1180", data: { recruitlyJobId: null } }]);
});

test("Remove link after this job's candidates were imported: refused, nothing written", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180", assignCandidatesToJob: onJob("rc-1") })];
    await assert.rejects(
        unlinkPortalJob(recruitlyJob, client, { loadRecruitlyCandidateIds: pipelineOf("rc-1") }),
        (e) => e.status === 409 && /can't be changed here/.test(e.message)
    );
    assert.equal(writes.length, 0);
});

test("Remove link with Recruitly-linked candidates but no way to check the pipeline: refused (safe side)", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180", assignCandidatesToJob: onJob("rc-1") })];
    await assert.rejects(unlinkPortalJob(recruitlyJob, client), (e) => e.status === 409);
    assert.equal(writes.length, 0);
});

test("Remove link of another client's job: refused, nothing written", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180", client: { documentId: "client-other", companyName: "Other Co" } })];
    await assert.rejects(unlinkPortalJob(recruitlyJob, client), (e) => e.status === 409 && /another client/.test(e.message));
    assert.equal(writes.length, 0);
});

test("Remove link when nothing is linked: nothing written", async () => {
    jobs = [oldJob()];
    assert.equal(await unlinkPortalJob(recruitlyJob, client), null);
    assert.equal(writes.length, 0);
});

test("choices: linked job reported with its lock state; options are the client's unlinked jobs only", async () => {
    jobs = [
        oldJob({ recruitlyJobId: "rj-1180", assignCandidatesToJob: onJob("rc-1") }),
        oldJob({ documentId: "free", title: "Cleaner", referenceNo: "JB-77" }),
        oldJob({ documentId: "other-client", title: "Cleaner", client: { documentId: "client-other" } }),
    ];
    const locked = await portalJobChoices(recruitlyJob, client, { loadRecruitlyCandidateIds: pipelineOf("rc-1") });
    assert.equal(locked.linked.documentId, "old-1180");
    assert.equal(locked.linked.locked, true);
    assert.deepEqual(locked.options.map((o) => o.documentId), ["free"]);
    const open = await portalJobChoices(recruitlyJob, client, { loadRecruitlyCandidateIds: pipelineOf("rc-5") });
    assert.equal(open.linked.locked, false);
});

// ---- Nothing to choose from: the first import creates the portal job ----
const AUTO = { createIfClientHasNone: true };

test("not linked, client has no portal jobs: the import creates the portal job", async () => {
    jobs = [];
    const r = await findOrCreatePortalJob(recruitlyJob, client, AUTO);
    assert.equal(r.created, true);
    assert.equal(writes[0].method, "POST");
    assert.equal(writes[0].data.recruitlyJobId, "rj-1180");
});

test("not linked, all the client's portal jobs are linked to other Recruitly jobs: created", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-OTHER" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client, AUTO);
    assert.equal(r.created, true);
});

test("not linked, client has an unlinked portal job: refused, staff must choose first", async () => {
    jobs = [oldJob()];
    await assert.rejects(findOrCreatePortalJob(recruitlyJob, client, AUTO), (e) => e.status === 409 && /not linked to a portal job yet/.test(e.message));
    assert.equal(writes.length, 0);
});

test("another client's unlinked jobs do not count", async () => {
    jobs = [oldJob({ client: { documentId: "client-other", companyName: "Other Co" } })];
    const r = await findOrCreatePortalJob(recruitlyJob, client, AUTO);
    assert.equal(r.created, true);
});

// ---- Job numbers: JB- = Recruitly, PJ- = portal only (agreed 18 Nov) ----
test("joining a portal job: it shows the Recruitly number, its own number kept as previous reference", async () => {
    jobs = [oldJob({ referenceNo: "PJ-1252" })];
    const r = await findOrCreatePortalJob(recruitlyJob, client, { portalJobDocumentId: "old-1180" });
    assert.equal(r.joined, true);
    assert.deepEqual(writes[0].data, { recruitlyJobId: "rj-1180", referenceNo: "JB-1180", previousReferenceNo: "PJ-1252" });
    assert.equal(r.job.referenceNo, "JB-1180");
});

test("number rules: same number → nothing; an earlier previous reference is never overwritten", () => {
    assert.deepEqual(joinFields({ referenceNo: "JB-1180" }, "JB-1180"), {});
    assert.deepEqual(joinFields({ referenceNo: "PJ-9", previousReferenceNo: "JB-9" }, "JB-50"), { referenceNo: "JB-50" });
    assert.deepEqual(joinFields({ referenceNo: "" }, "JB-50"), { referenceNo: "JB-50" });
    assert.deepEqual(joinFields({ referenceNo: "PJ-9" }, ""), {}, "Recruitly job without a reference: number left alone");
});

test("removing the link gives the portal's own number back", async () => {
    jobs = [oldJob({ recruitlyJobId: "rj-1180", referenceNo: "JB-1180", previousReferenceNo: "PJ-1252" })];
    await unlinkPortalJob(recruitlyJob, client);
    assert.deepEqual(writes, [
        { method: "PUT", documentId: "old-1180", data: { recruitlyJobId: null, referenceNo: "PJ-1252", previousReferenceNo: null } },
    ]);
    assert.deepEqual(unlinkFields({ referenceNo: "JB-1" }), { recruitlyJobId: null }, "no previous number: only the link is cleared");
});

test("a job created from Recruitly keeps the Recruitly JB number", async () => {
    jobs = [];
    await findOrCreatePortalJob(recruitlyJob, client, { createNew: true });
    assert.equal(writes[0].data.referenceNo, "JB-1180");
});
