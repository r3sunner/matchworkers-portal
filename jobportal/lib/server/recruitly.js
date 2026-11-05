// Server-only Recruitly client for the Milestone 1 import.
// Import this from route handlers only, never from a "use client" file.
//
// The Recruitly key has write access, so this client is GET-only: every call
// goes through recruitlyRequest(), which refuses any other method before a
// request is sent.

const RECRUITLY_BASE_URL = (process.env.RECRUITLY_BASE_URL || "https://api.recruitly.io").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 20000;

// R2: the only file categories the portal may pull, by Recruitly category ID.
// Never add passport, ID or "Birth Certificate and candidate photo" categories.
export const FILE_CATEGORY_FULL_CANDIDATE_PROFILE = "6b3da17a-ff98-4abf-bc6f-35ed41007d39";
export const FILE_CATEGORY_PHOTO = "937bc133-5d97-45f3-806b-40f5cbb48419";

const ALLOWED_FILE_CATEGORIES = new Set([
    FILE_CATEGORY_FULL_CANDIDATE_PROFILE,
    FILE_CATEGORY_PHOTO,
]);

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
    const startedAt = Date.now();

    if (counter) counter.calls += 1;

    let res;
    try {
        res = await fetch(url, {
            method: "GET",
            headers: { Accept: binary ? "*/*" : "application/json" },
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        console.error(`[RECRUITLY] GET ${path} failed after ${Date.now() - startedAt}ms:`, error?.name || "Error");
        throw new RecruitlyError(`Recruitly request failed: GET ${path}.`, { path });
    }

    console.log(`[RECRUITLY] GET ${path} ${res.status} ${Date.now() - startedAt}ms`);

    if (!res.ok) {
        throw new RecruitlyError(`Recruitly returned ${res.status} for GET ${path}.`, { status: res.status, path });
    }

    if (binary) {
        return {
            buffer: Buffer.from(await res.arrayBuffer()),
            contentType: res.headers.get("content-type") || "application/octet-stream",
        };
    }

    return res.json();
}

export function listJobs({ page, size, counter } = {}) {
    return recruitlyRequest("GET", "/api/nova/jobs/list", {
        params: { page, size },
        counter,
    });
}

export function getJob(jobId, { counter } = {}) {
    return recruitlyRequest("GET", `/api/nova/jobs/${encodeId(jobId, "jobId")}`, { counter });
}

export function listJobPipeline(jobId, { page, size, counter } = {}) {
    return recruitlyRequest("GET", `/api/nova/jobs/${encodeId(jobId, "jobId")}/pipeline`, {
        params: { page, size },
        counter,
    });
}

// The pipeline is paged (pages start at 0, Recruitly caps size at 100), so
// read every page. MAX_PIPELINE_PAGES stops a runaway loop on bad totals.
const PIPELINE_PAGE_SIZE = 100;
const MAX_PIPELINE_PAGES = 100;

export async function listAllJobPipeline(jobId, { counter } = {}) {
    const entries = [];
    let total = 0;

    for (let page = 0; page < MAX_PIPELINE_PAGES; page += 1) {
        const json = await listJobPipeline(jobId, { page, size: PIPELINE_PAGE_SIZE, counter });
        const rows = Array.isArray(json?.data) ? json.data : [];

        total = Number(json?.total) || 0;
        entries.push(...rows);

        if (rows.length === 0 || entries.length >= total) break;
    }

    return { entries, total, complete: entries.length >= total };
}

export function getCandidate(candidateId, { counter } = {}) {
    return recruitlyRequest("GET", `/api/nova/candidates/${encodeId(candidateId, "candidateId")}`, { counter });
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
