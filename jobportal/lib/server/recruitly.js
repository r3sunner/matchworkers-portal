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
