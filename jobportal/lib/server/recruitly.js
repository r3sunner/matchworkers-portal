// Server-only Recruitly client for the Milestone 1 import.
// Import this from route handlers only, never from a "use client" file.
//
// The Recruitly key has write access, so this client is GET-only: every call
// goes through recruitlyRequest(), which refuses any other method before a
// request is sent.

const RECRUITLY_BASE_URL = (process.env.RECRUITLY_BASE_URL || "https://api.recruitly.io").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 600;

// Recruitly allows 30 read requests per minute (and 10,000 a day shared by all
// of Matchworkers' keys). The portal keeps under that with a margin: at most
// RECRUITLY_MAX_PER_MINUTE calls (default 25) in any rolling minute, shared by
// every route in this server process. Read at call time so tests can lower them.
function rateConfig() {
    return {
        max: Number(process.env.RECRUITLY_MAX_PER_MINUTE) || 25,
        windowMs: Number(process.env.RECRUITLY_RATE_WINDOW_MS) || 60000,
        waitOn429Ms: Number(process.env.RECRUITLY_429_WAIT_MS) || 20000,
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kept on globalThis so all routes share one limiter (Next bundles routes separately).
const rateState = (globalThis.__recruitlyRate ??= { times: [], chain: Promise.resolve() });

// Waits until a call is allowed, then records it. Calls queue in order.
function waitForSlot() {
    const run = rateState.chain.then(async () => {
        const { max, windowMs } = rateConfig();
        for (;;) {
            const now = Date.now();
            rateState.times = rateState.times.filter((t) => now - t < windowMs);
            if (rateState.times.length < max) {
                rateState.times.push(now);
                return;
            }
            const waitMs = windowMs - (now - rateState.times[0]) + 25;
            console.log(`[RECRUITLY] ${max} calls in the last minute; waiting ${Math.ceil(waitMs / 1000)}s`);
            await sleep(waitMs);
        }
    });
    rateState.chain = run.catch(() => {});
    return run;
}

// R2: the only file categories the portal may pull, by Recruitly category ID.
// Never add passport, ID or "Birth Certificate and candidate photo" categories.
export const FILE_CATEGORY_FULL_CANDIDATE_PROFILE = "6b3da17a-ff98-4abf-bc6f-35ed41007d39";
export const FILE_CATEGORY_PHOTO = "937bc133-5d97-45f3-806b-40f5cbb48419";

const ALLOWED_FILE_CATEGORIES = new Set([
    FILE_CATEGORY_FULL_CANDIDATE_PROFILE,
    FILE_CATEGORY_PHOTO,
]);

// Recruitly custom fields the portal imports, by field ID (labels can change).
export const CUSTOM_FIELD_WORKING_VIDEO_LINK = "matc8992fd3d4d3f40deb4ea49efd47603c1";
export const CUSTOM_FIELD_YEARS_OF_EXPERIENCE = "matc45a9109b69594fc6a7865991da39514d";

export class RecruitlyError extends Error {
    constructor(message, { status = 0, path = "" } = {}) {
        super(message);
        this.name = "RecruitlyError";
        this.status = status;
        this.path = path;
    }
}

// Counts calls for one import so the result report can show them
// (Recruitly has a daily per-key call limit).
export function createCallCounter() {
    return { calls: 0 };
}

function getApiKey() {
    const apiKey = process.env.RECRUITLY_API_KEY;

    if (!apiKey) {
        throw new RecruitlyError("RECRUITLY_API_KEY is not set.");
    }

    return apiKey;
}

function buildUrl(path, params) {
    const url = new URL(`${RECRUITLY_BASE_URL}${path}`);

    for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
    }

    // Added last and never logged: logs and errors use `path` only.
    url.searchParams.set("apiKey", getApiKey());

    return url;
}

function encodeId(value, label) {
    const id = String(value || "").trim();

    if (!id) {
        throw new RecruitlyError(`${label} is required.`);
    }

    return encodeURIComponent(id);
}

export async function recruitlyRequest(method, path, { params, counter, binary = false } = {}) {
    // GET-only guard. Must stay the first line: nothing is sent for any other method.
    if (method !== "GET") {
        throw new RecruitlyError(`Recruitly client is GET-only; refused ${method} ${path}.`, { path });
    }

    const url = buildUrl(path, params);

    // One retry for a dropped connection, a brief Recruitly outage (502/503/504)
    // or 429 (limit reached, e.g. by other keys): GET only, so repeating is safe.
    // Other errors are not retried.
    let res;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        await waitForSlot();
        if (counter) counter.calls += 1;
        const startedAt = Date.now();
        try {
            res = await fetch(url, {
                method: "GET",
                headers: { Accept: binary ? "*/*" : "application/json" },
                cache: "no-store",
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            console.error(`[RECRUITLY] GET ${path} failed after ${Date.now() - startedAt}ms:`, error?.name || "Error");
            if (attempt === 1) {
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            throw new RecruitlyError(`Recruitly request failed: GET ${path}.`, { path });
        }

        console.log(`[RECRUITLY] GET ${path} ${res.status} ${Date.now() - startedAt}ms`);
        if (attempt === 1 && [502, 503, 504].includes(res.status)) {
            await sleep(RETRY_DELAY_MS);
            continue;
        }
        if (attempt === 1 && res.status === 429) {
            const retryAfterS = Number(res.headers.get("retry-after"));
            const waitMs = retryAfterS > 0 ? Math.min(retryAfterS * 1000, 60000) : rateConfig().waitOn429Ms;
            console.warn(`[RECRUITLY] GET ${path} 429 (limit reached); retrying once in ${Math.ceil(waitMs / 1000)}s`);
            await sleep(waitMs);
            continue;
        }
        break;
    }

    if (!res.ok) {
        throw new RecruitlyError(`Recruitly returned ${res.status} for GET ${path}.`, { status: res.status, path });
    }

    if (binary) {
        return {
            buffer: Buffer.from(await res.arrayBuffer()),
            contentType: res.headers.get("content-type") || "application/octet-stream",
        };
    }

    // Some endpoints answer an unknown id with 200 and an empty body.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

export function listJobs({ page, size, counter } = {}) {
    return recruitlyRequest("GET", "/api/nova/jobs/list", {
        params: { page, size },
        counter,
    });
}

// Short in-memory cache for the two big lists that have no filter in Recruitly
// (all jobs; all placements, 8+ calls). Saves time and daily calls when staff
// load candidates and then import. `fresh: true` (Reload from Recruitly) skips it.
const LIST_CACHE_MS = 5 * 60 * 1000;
// Kept on globalThis: Next.js bundles each route separately, and a plain module
// variable would give every route its own copy.
const listCache = (globalThis.__recruitlyListCache ??= new Map());

async function cachedList(key, load, { fresh = false, ttlMs = LIST_CACHE_MS } = {}) {
    const hit = listCache.get(key);
    if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value;

    const value = load();
    listCache.set(key, { at: Date.now(), value });
    try {
        return await value;
    } catch (error) {
        listCache.delete(key);
        throw error;
    }
}

// One job's pipeline, for an import sent in several requests: the first request
// reads it fresh, the next ones reuse it for up to a minute (same import).
export function jobPipelineForImport(jobId, { counter, fresh = false } = {}) {
    return cachedList(`pipeline:${jobId}`, () => listAllJobPipeline(jobId, { counter }), { fresh, ttlMs: 60 * 1000 });
}

export function listJobsCached({ counter, fresh } = {}) {
    return cachedList("jobs", () => listJobs({ counter }), { fresh });
}

export function listAllPlacementsCached({ counter, fresh } = {}) {
    return cachedList("placements", () => listAllPlacements({ counter }), { fresh });
}

// Placements for the Placed entries of one job, as fast as Recruitly allows
// (it has no job filter). Newest placements come first, so page 0 usually holds
// them: then 1 call. Otherwise the remaining pages are read 4 at a time and the
// full list is cached. Returns { placements, complete } like listAllPlacements.
export async function placementsForJob(entries, jobId, { counter, fresh = false } = {}) {
    const wanted = new Set(
        (entries || [])
            .filter((e) => e?.rejected !== true && String(e?.status || "").toUpperCase() === "PLACED")
            .map((e) => `${e?.candidateId}|${e?.jobId || jobId}`)
    );
    if (wanted.size === 0) return null;

    const hit = listCache.get("placements");
    if (!fresh && hit && Date.now() - hit.at < LIST_CACHE_MS) return hit.value;

    // First-page result for exactly these Placed candidates, reused for 5 minutes
    // (a new Placed candidate on the job changes the key, so it is read again).
    const jobKey = `placements-job:${jobId}:${[...wanted].sort().join(",")}`;
    const jobHit = listCache.get(jobKey);
    if (!fresh && jobHit && Date.now() - jobHit.at < LIST_CACHE_MS) return jobHit.value;

    const keyOf = (p) => `${p?.candidateId}|${p?.jobId}`;
    const first = await recruitlyRequest("GET", "/api/nova/placements/list", {
        params: { page: 0, size: PLACEMENT_PAGE_SIZE },
        counter,
    });
    const firstRows = Array.isArray(first?.data) ? first.data : [];
    const total = Number(first?.total) || firstRows.length;

    const found = new Set(firstRows.map(keyOf).filter((k) => wanted.has(k)));
    if (found.size === wanted.size || firstRows.length >= total) {
        const value = { placements: firstRows, total, complete: true };
        listCache.set(jobKey, { at: Date.now(), value });
        return value;
    }

    const pageCount = Math.min(Math.ceil(total / PLACEMENT_PAGE_SIZE), MAX_PLACEMENT_PAGES);
    const rest = await mapLimit(
        Array.from({ length: pageCount - 1 }, (_, i) => i + 1),
        4,
        async (page) => {
            const json = await recruitlyRequest("GET", "/api/nova/placements/list", {
                params: { page, size: PLACEMENT_PAGE_SIZE },
                counter,
            });
            return Array.isArray(json?.data) ? json.data : [];
        }
    );
    const placements = [...firstRows, ...rest.flat()];
    const value = { placements, total, complete: placements.length >= total };
    listCache.set("placements", { at: Date.now(), value: Promise.resolve(value) });
    return value;
}

// Runs fn over items, at most `limit` at a time, keeping the order.
export async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}

export function getJob(jobId, { counter } = {}) {
    return recruitlyRequest("GET", `/api/nova/jobs/${encodeId(jobId, "jobId")}`, { counter });
}

// Every pipeline entry of a job in one call (unlike the paged
// /jobs/{id}/pipeline). `complete` is false if Recruitly sent fewer than its total.
export async function listAllJobPipeline(jobId, { counter } = {}) {
    const json = await recruitlyRequest("GET", `/api/nova/pipelines/job/${encodeId(jobId, "jobId")}`, { counter });
    const entries = Array.isArray(json?.data) ? json.data : [];
    const total = Number(json?.total) || entries.length;

    return { entries, total, complete: entries.length >= total };
}

// Full candidate profile. Uses /api/candidate/{id} because the Nova candidate
// endpoint has no gender or nationalities. The profile also holds fields the
// portal must never copy (date of birth, NI number, notes): read it through
// toImportCandidate() only. Returns null for an unknown id.
export function getCandidate(candidateId, { counter } = {}) {
    return recruitlyRequest("GET", `/api/candidate/${encodeId(candidateId, "candidateId")}`, { counter });
}

// Every placement, 100 per page (Recruitly's cap; it has no job or candidate
// filter). Call only when a job has a Placed entry: about 8 calls today.
const PLACEMENT_PAGE_SIZE = 100;
const MAX_PLACEMENT_PAGES = 50;

export async function listAllPlacements({ counter } = {}) {
    const placements = [];
    let total = 0;

    for (let page = 0; page < MAX_PLACEMENT_PAGES; page += 1) {
        const json = await recruitlyRequest("GET", "/api/nova/placements/list", {
            params: { page, size: PLACEMENT_PAGE_SIZE },
            counter,
        });
        const rows = Array.isArray(json?.data) ? json.data : [];

        total = Number(json?.total) || 0;
        placements.push(...rows);

        if (rows.length === 0 || placements.length >= total) break;
    }

    return { placements, total, complete: placements.length >= total };
}

// Stage, placement status, employment type and gender lists (id + name).
// Recruitly wraps this response in `data`.
export async function getMasterdata({ counter } = {}) {
    const json = await recruitlyRequest("GET", "/api/nova/masterdata", { counter });
    return json?.data && !Array.isArray(json.data) ? json.data : json;
}

function customFieldValue(profile, fieldId) {
    const field = (profile?.udfList || []).find((f) => f?.key?.id === fieldId);
    const text = String(field?.value?.textValue ?? "").trim();
    if (text) return text;

    const list = field?.value?.listValue;
    return Array.isArray(list) ? list.join(", ") : "";
}

function nameList(values) {
    return (Array.isArray(values) ? values : [])
        .map((v) => (typeof v === "string" ? v : v?.name || ""))
        .map((v) => v.trim())
        .filter(Boolean);
}

// The only candidate fields the import uses (agreed field mapping, 4 Nov).
export function toImportCandidate(profile) {
    const firstName = String(profile?.firstName || "").trim();
    const lastName = String(profile?.surname || "").trim();

    return {
        recruitlyId: profile?.id ?? null,
        reference: profile?.reference || "",
        fullName: String(profile?.fullName || "").trim() || `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        jobTitle: profile?.jobTitle || "",
        gender: String(profile?.gender || "").trim(),
        nationalities: nameList(profile?.nationalities),
        nationalityCodes: nameList(profile?.nationalityCodes),
        // Used only to find the same person already in the portal (no duplicates).
        email: String(profile?.email || "").trim(),
        mobile: String(profile?.mobile || "").trim(),
        overview: profile?.overview || "",
        yearsOfExperience: customFieldValue(profile, CUSTOM_FIELD_YEARS_OF_EXPERIENCE),
        workingVideoLink: customFieldValue(profile, CUSTOM_FIELD_WORKING_VIDEO_LINK),
    };
}

export function listFileCategories({ counter } = {}) {
    return recruitlyRequest("GET", "/api/nova/files/categories", { counter });
}

export function isAllowedFile(file) {
    return ALLOWED_FILE_CATEGORIES.has(String(file?.categoryId || ""));
}

// Returns only Full Candidate Profile and Photo files; every other category,
// and files with no category, are dropped here.
export async function listCandidateFiles(candidateId, { counter } = {}) {
    const json = await recruitlyRequest("GET", `/api/nova/files/record/${encodeId(candidateId, "candidateId")}`, { counter });
    const files = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

    return files.filter(isAllowedFile);
}

// Recruitly dates read "dd/mm/yyyy HH:MM:SS".
function fileTime(file) {
    const m = String(file?.uploadedOn || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
    if (!m) return 0;

    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    return Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
}

// R2: newest file per allowed category, or null when there is none.
export function latestFiles(files) {
    const newest = (categoryId) =>
        (files || [])
            .filter((f) => f?.categoryId === categoryId)
            .sort((a, b) => fileTime(b) - fileTime(a))[0] || null;

    return {
        fullCandidateProfile: newest(FILE_CATEGORY_FULL_CANDIDATE_PROFILE),
        photo: newest(FILE_CATEGORY_PHOTO),
    };
}

// Refuses any file outside the allow-list before a request is sent.
export function downloadFile(file, { counter } = {}) {
    if (!isAllowedFile(file)) {
        throw new RecruitlyError("File category is not allowed for import.");
    }

    return recruitlyRequest("GET", `/api/nova/files/${encodeId(file.id, "file.id")}/download`, {
        counter,
        binary: true,
    });
}
