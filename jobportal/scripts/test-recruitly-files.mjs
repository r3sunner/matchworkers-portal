// Offline tests for R2/R3 file copying (no network: Recruitly and Strapi are faked).
// Run: node --test scripts/test-recruitly-files.mjs
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.RECRUITLY_API_KEY = "FAKE";
process.env.RECRUITLY_MAX_PER_MINUTE = "100000";
process.env.STRAPI_BASE_URL = "http://strapi.test/api";
process.env.STRAPI_TOKEN = "FAKE-TOKEN";
for (const level of ["log", "error", "warn"]) console[level] = () => {};

const FCP = "6b3da17a-ff98-4abf-bc6f-35ed41007d39";
const PHOTO = "937bc133-5d97-45f3-806b-40f5cbb48419";
const PASSPORT = "93f1b587-b790-4e64-b62e-867ca3c72a36";

let recruitlyFiles = [];
let portalCandidate = {};
let calls = [];
let failDownload = new Set();
let nextUploadId = 100;

globalThis.fetch = async (url, options = {}) => {
    const u = new URL(String(url));
    const method = options.method || "GET";
    calls.push(`${method} ${u.host}${u.pathname}`);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

    if (u.host === "api.recruitly.io") {
        if (/\/api\/nova\/files\/record\//.test(u.pathname)) return json({ data: recruitlyFiles });
        const m = u.pathname.match(/\/api\/nova\/files\/([^/]+)\/download$/);
        if (m) return failDownload.has(m[1]) ? new Response("", { status: 500 }) : new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    if (u.host === "strapi.test") {
        if (method === "GET" && /\/api\/candidates\//.test(u.pathname)) return json({ data: portalCandidate });
        if (method === "POST" && u.pathname === "/api/upload") {
            const info = JSON.parse(options.body.get("fileInfo"));
            return json([{ id: nextUploadId++, name: info.name, caption: info.caption }]);
        }
        if (method === "PUT" && /\/api\/candidates\//.test(u.pathname)) return json({ data: {} });
        if (method === "DELETE" && /\/api\/upload\/files\//.test(u.pathname)) return json({});
    }
    return json({ error: { message: `unexpected ${method} ${u.href}` } }, 500);
};

const { syncCandidateFiles, tagFor, contentTypeFor } = await import("../lib/server/recruitlyFiles.js");

const file = (id, categoryId, name, uploadedOn) => ({ id, categoryId, name, extension: name.split(".").pop(), size: 3, uploadedOn });
const run = () => syncCandidateFiles({ recruitlyCandidateId: "rc1", portalDocumentId: "doc1" });
const count = (pattern) => calls.filter((c) => pattern.test(c)).length;

beforeEach(() => {
    recruitlyFiles = [];
    portalCandidate = { documentId: "doc1", CV: null, profileImage: null };
    calls = [];
    failDownload = new Set();
    nextUploadId = 100;
});

test("new candidate: newest FCP and photo are downloaded, uploaded and attached", async () => {
    recruitlyFiles = [
        file("fcp-old", FCP, "old.pdf", "01/01/2026 10:00:00"),
        file("fcp-new", FCP, "new.pdf", "02/01/2026 10:00:00"),
        file("ph1", PHOTO, "me.png", "01/01/2026 10:00:00"),
    ];
    const r = await run();
    assert.deepEqual([r.cv, r.photo], ["added", "added"]);
    assert.equal(count(/download/), 2);
    assert.ok(calls.includes("GET api.recruitly.io/api/nova/files/fcp-new/download"), "newest FCP only");
    assert.ok(!calls.some((c) => c.includes("fcp-old")), "older FCP never downloaded");
    assert.equal(count(/POST strapi.test\/api\/upload/), 2);
    assert.equal(count(/PUT strapi.test\/api\/candidates/), 1);
});

test("re-import with the same Recruitly files: nothing downloaded or uploaded", async () => {
    recruitlyFiles = [file("f1", FCP, "a.pdf", "01/01/2026 10:00:00"), file("p1", PHOTO, "a.png", "01/01/2026 10:00:00")];
    portalCandidate = { documentId: "doc1", CV: { id: 5, caption: tagFor("f1") }, profileImage: { id: 6, caption: tagFor("p1") } };
    const r = await run();
    assert.deepEqual([r.cv, r.photo], ["unchanged", "unchanged"]);
    assert.equal(count(/download|upload|PUT|DELETE/), 0);
});

test("newer FCP replaces the older one; the old copy is removed only because the import added it", async () => {
    recruitlyFiles = [file("f2", FCP, "newer.pdf", "05/01/2026 10:00:00")];
    portalCandidate = { documentId: "doc1", CV: { id: 5, caption: tagFor("f1") }, profileImage: null };
    const r = await run();
    assert.equal(r.cv, "updated");
    assert.ok(calls.includes("DELETE strapi.test/api/upload/files/5"));
});

test("a CV that staff uploaded themselves is replaced but never deleted", async () => {
    recruitlyFiles = [file("f2", FCP, "fcp.pdf", "05/01/2026 10:00:00")];
    portalCandidate = { documentId: "doc1", CV: { id: 9, caption: "" }, profileImage: null };
    const r = await run();
    assert.equal(r.cv, "updated");
    assert.equal(count(/DELETE/), 0);
});

test("no photo in Recruitly: placeholder note, existing portal photo left as it is", async () => {
    recruitlyFiles = [file("f1", FCP, "a.pdf", "01/01/2026 10:00:00")];
    portalCandidate = { documentId: "doc1", CV: null, profileImage: { id: 7, caption: "" } };
    const r = await run();
    assert.equal(r.photo, "missing");
    assert.ok(r.notes.some((n) => /placeholder/.test(n)));
    assert.equal(count(/DELETE/), 0);
});

test("no FCP: candidate still imported, note says so", async () => {
    recruitlyFiles = [file("p1", PHOTO, "a.png", "01/01/2026 10:00:00")];
    const r = await run();
    assert.equal(r.cv, "missing");
    assert.ok(r.notes.some((n) => /No Full Candidate Profile/.test(n)));
    assert.equal(r.photo, "added");
});

test("a failed download is reported; the other file is still attached", async () => {
    recruitlyFiles = [file("f1", FCP, "a.pdf", "01/01/2026 10:00:00"), file("p1", PHOTO, "a.png", "01/01/2026 10:00:00")];
    failDownload = new Set(["f1"]);
    const r = await run();
    assert.equal(r.cv, "failed");
    assert.equal(r.photo, "added");
    assert.ok(r.notes.some((n) => /could not be copied/.test(n)));
    assert.equal(count(/PUT strapi.test\/api\/candidates/), 1);
});

test("passport and every other category are never downloaded", async () => {
    recruitlyFiles = [file("pp", PASSPORT, "passport.pdf", "09/01/2026 10:00:00"), { id: "nocat", name: "x.pdf", uploadedOn: "09/01/2026 10:00:00" }];
    const r = await run();
    assert.deepEqual([r.cv, r.photo], ["missing", "missing"]);
    assert.equal(count(/download/), 0);
});

test("content type from the file extension (Recruitly sends a generic one)", () => {
    assert.equal(contentTypeFor({ name: "a.pdf", contentType: "application/octet-stream" }), "application/pdf");
    assert.equal(contentTypeFor({ extension: "PNG" }), "image/png");
    assert.equal(contentTypeFor({ name: "a.docx" }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(contentTypeFor({ name: "a.xyz", contentType: "text/plain" }), "text/plain");
});

test("file list passed in by the import: not listed again; CV and photo downloaded together", async () => {
    const listed = [file("f1", FCP, "a.pdf", "01/01/2026 10:00:00"), file("p1", PHOTO, "a.png", "01/01/2026 10:00:00")];
    let inFlight = 0;
    let maxInFlight = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        const isDownload = /\/download$/.test(new URL(String(url)).pathname);
        if (isDownload) {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 20));
            inFlight -= 1;
        }
        return realFetch(url, options);
    };
    try {
        const r = await syncCandidateFiles({ recruitlyCandidateId: "rc1", portalDocumentId: "doc1", files: listed });
        assert.deepEqual([r.cv, r.photo], ["added", "added"]);
        assert.equal(count(/files\/record/), 0, "file list not fetched again");
        assert.equal(maxInFlight, 2, "both downloads in flight at once");
    } finally {
        globalThis.fetch = realFetch;
    }
});
