// Portal job side of the Recruitly import (R1 part 2): find or create the portal
// job for a Recruitly job, and add / update / remove candidates on its pipeline.
// Server only. Writes to the portal (Strapi) only, never to Recruitly.
import { strapiFetchAll, strapiRequest } from "./portalStrapi.js";

export class JobImportError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = "JobImportError";
        this.status = status;
    }
}

const JOB_POPULATE = {
    client: { fields: ["documentId", "companyName"] },
    assignCandidatesToJob: {
        populate: {
            candidate: { fields: ["documentId", "fullName", "caNumber", "recruitlyId"] },
            offerLetter: { fields: ["id"] },
            pipline_chats: { fields: ["documentId"] },
        },
    },
};

function relationId(value) {
    const v = value?.data ?? value;
    return v?.id ?? null;
}

// Strapi 5 gives a published entry a new numeric id each time it is published,
// so links to candidates and chats use the documentId, which never changes.
function relationDocumentId(value) {
    const v = value?.data ?? value;
    return v?.documentId ?? null;
}

export async function loadClient(clientDocumentId) {
    try {
        const json = await strapiRequest(`/clients/${encodeURIComponent(clientDocumentId)}`, {
            query: { status: "published", fields: ["documentId", "companyName", "recruitlyCompanyId"] },
        });
        return json?.data || null;
    } catch (error) {
        if (error?.status === 404) return null;
        throw error;
    }
}

const JOB_FIELDS = ["documentId", "title", "referenceNo", "previousReferenceNo", "recruitlyJobId", "jobTypeList", "statusList"];

async function findJobs(filters) {
    const json = await strapiRequest("/jobs", {
        query: {
            status: "published",
            filters,
            fields: JOB_FIELDS,
            populate: JOB_POPULATE,
            pagination: { page: 1, pageSize: 3 },
        },
    });
    return Array.isArray(json?.data) ? json.data : [];
}

function findJobByRecruitlyId(recruitlyJobId) {
    return findJobs({ recruitlyJobId: { $eq: String(recruitlyJobId) } });
}

// Recruitly job (getJob().data) → portal job fields used when the portal creates it.
export function portalJobFields(recruitlyJob, clientDocumentId) {
    const data = {
        title: String(recruitlyJob?.title || "").trim() || String(recruitlyJob?.reference || "Recruitly job"),
        referenceNo: String(recruitlyJob?.reference || "").trim(),
        recruitlyJobId: String(recruitlyJob?.id || ""),
        shortDescription: String(recruitlyJob?.shortDescription || "").trim(),
        jobTypeList: String(recruitlyJob?.employmentTypeName || "").trim(),
        statusList: String(recruitlyJob?.statusName || "").trim().toLowerCase() === "closed" ? "closed" : "open",
        client: { connect: [clientDocumentId] },
    };
    const vacancies = Number(recruitlyJob?.openPositions);
    if (Number.isInteger(vacancies) && vacancies >= 0) data.vacanciesNo = vacancies;
    for (const key of Object.keys(data)) if (data[key] === "") delete data[key];
    return data;
}

function refuseOtherClient(job, client, reference) {
    const owner = job?.client?.documentId || null;
    if (owner && owner !== client.documentId) {
        throw new JobImportError(
            `Portal job ${job.referenceNo || reference} belongs to another client (${job.client?.companyName || "unknown"}). Nothing was imported.`,
            409
        );
    }
}

// ---- Join step: staff choose the portal job for a Recruitly job ----------
// The portal's JB- numbers are its own (the job form has no reference field), so
// the same number in Recruitly is usually a different job (checked on live
// 18 Nov: only 3 of 68 shared numbers had the same title). A Recruitly job is
// therefore never matched to a portal job by number: the first time it is
// imported, staff pick the client's portal job it belongs to, or "create new".
// After that the portal job carries the Recruitly job ID and is found directly.

// Title words without case, accents, punctuation or a plural "s":
// "Production workers - filling department" ≈ "Production Worker – Fillings Department".
function titleWords(title) {
    return new Set(
        String(title || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length > 1)
            .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    );
}

// 0..1: share of words the two titles have in common (Dice coefficient).
export function titleSimilarity(a, b) {
    const x = titleWords(a);
    const y = titleWords(b);
    if (!x.size || !y.size) return 0;
    let both = 0;
    for (const w of x) if (y.has(w)) both += 1;
    return (2 * both) / (x.size + y.size);
}

const notLinked = (job) => !String(job?.recruitlyJobId || "").trim();

// Pure: the client's portal jobs not linked to Recruitly, closest title first
// (newest first when equal). Each with how many candidates are on it.
export function rankPortalJobs(jobs, recruitlyTitle) {
    return (jobs || [])
        .filter(notLinked)
        .map((j) => ({
            documentId: j.documentId,
            referenceNo: j.referenceNo || "",
            title: j.title || "",
            statusList: j.statusList || "",
            createdAt: j.createdAt || null,
            candidateCount: Array.isArray(j.assignCandidatesToJob) ? j.assignCandidatesToJob.length : 0,
            similarity: Math.round(titleSimilarity(j.title, recruitlyTitle) * 100) / 100,
        }))
        .sort((a, b) => b.similarity - a.similarity || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

// For the import screen: the portal job already linked to this Recruitly job
// (with its lock state), and the client's portal jobs staff can choose from.
// loadRecruitlyCandidateIds: async () => Set of the Recruitly job's candidate IDs
// (its pipeline); only called when the linked job has Recruitly-linked candidates.
function clientJobs(client) {
    return strapiFetchAll("/jobs", {
        filters: { client: { documentId: { $eq: client.documentId } } },
        fields: ["documentId", "title", "referenceNo", "recruitlyJobId", "statusList", "createdAt"],
        populate: { assignCandidatesToJob: { populate: { candidate: { fields: ["documentId"] } } } },
        sort: ["createdAt:desc"],
    });
}

export async function portalJobChoices(recruitlyJob, client, { loadRecruitlyCandidateIds } = {}) {
    const [linked] = await findJobByRecruitlyId(recruitlyJob.id);
    const jobs = await clientJobs(client);
    return {
        linked: linked
            ? {
                  documentId: linked.documentId,
                  referenceNo: linked.referenceNo || "",
                  title: linked.title || "",
                  locked: await isLinkLocked(linked, loadRecruitlyCandidateIds),
              }
            : null,
        options: rankPortalJobs(jobs, recruitlyJob.title),
    };
}

// Once candidates of this Recruitly job have been imported onto the linked
// portal job, the link can no longer be changed or removed from the import
// screen (agreed 18 Nov): moving it would split the job. A wrong link is then
// fixed by an administrator in Strapi.
// Only this Recruitly job's candidates count: an old portal job can already hold
// candidates linked to Recruitly through other jobs (e.g. Match Candidates), and
// a wrong pick of such a job must still be correctable before any import.
// recruitlyCandidateIds: Set of the Recruitly job's candidate IDs (its pipeline).
export function linkLocked(job, recruitlyCandidateIds) {
    return (job?.assignCandidatesToJob || []).some((item) => {
        const id = String(item?.candidate?.recruitlyId || "").trim();
        return id !== "" && recruitlyCandidateIds?.has(id);
    });
}

const hasRecruitlyCandidates = (job) =>
    (job?.assignCandidatesToJob || []).some((item) => String(item?.candidate?.recruitlyId || "").trim());

// The pipeline is read only when the job holds Recruitly-linked candidates at all.
async function isLinkLocked(job, loadRecruitlyCandidateIds) {
    if (!hasRecruitlyCandidates(job)) return false;
    if (!loadRecruitlyCandidateIds) return true; // cannot check: stay on the safe side
    return linkLocked(job, await loadRecruitlyCandidateIds());
}

const LOCKED_MESSAGE =
    "Candidates have been imported to this portal job, so the link can't be changed here. Ask your administrator if it is wrong.";

// Job numbers (agreed 18 Nov): JB- = Recruitly's number, PJ- = a portal-only job.
// A portal job joined to a Recruitly job shows the Recruitly number; its own
// number is kept in previousReferenceNo (still found in search) and given back
// if the link is removed.
export function joinFields(job, recruitlyReference) {
    const reference = String(recruitlyReference || "").trim();
    const current = String(job?.referenceNo || "").trim();
    if (!reference || reference === current) return {};
    const data = { referenceNo: reference };
    if (current && !String(job?.previousReferenceNo || "").trim()) data.previousReferenceNo = current;
    return data;
}

// Fields written when the link is removed: the portal's own number comes back.
export function unlinkFields(job) {
    const data = { recruitlyJobId: null };
    const previous = String(job?.previousReferenceNo || "").trim();
    if (previous) {
        data.referenceNo = previous;
        data.previousReferenceNo = null;
    }
    return data;
}

// Remove link / Change: the portal job stops being linked to this Recruitly job.
// Only the link is cleared (and the portal's own number given back); the job,
// its candidates, offer letters and chats stay.
// Refused once this Recruitly job's candidates are on the job (linkLocked).
// Returns the job that was unlinked, or null when nothing was linked.
export async function unlinkPortalJob(recruitlyJob, client, { loadRecruitlyCandidateIds } = {}) {
    const reference = String(recruitlyJob?.reference || "").trim();
    const found = await findJobByRecruitlyId(recruitlyJob.id);
    if (found.length === 0) return null;
    for (const job of found) refuseOtherClient(job, client, reference);
    for (const job of found) {
        if (await isLinkLocked(job, loadRecruitlyCandidateIds)) throw new JobImportError(LOCKED_MESSAGE, 409);
    }
    for (const job of found) {
        await strapiRequest(`/jobs/${encodeURIComponent(job.documentId)}`, {
            method: "PUT",
            query: { status: "published" },
            body: { data: unlinkFields(job) },
        });
    }
    return found[0];
}

async function loadPortalJob(documentId) {
    try {
        const json = await strapiRequest(`/jobs/${encodeURIComponent(documentId)}`, {
            query: { status: "published", fields: JOB_FIELDS, populate: JOB_POPULATE },
        });
        return json?.data || null;
    } catch (error) {
        if (error?.status === 404) return null;
        throw error;
    }
}

// Returns { job, created, joined }.
// 1. Portal job already linked to this Recruitly job (by Recruitly job ID): used.
// 2. Otherwise staff's choice, sent with the import:
//    - portalJobDocumentId: that portal job of this client is joined (Recruitly
//      job ID stored, the Recruitly JB number shown with the portal number kept
//      as previous reference; title, candidates, offer letters and chats kept);
//    - createNew: a new portal job is created under this client.
//    - createIfClientHasNone: a new portal job is created, but only if the client
//      has no portal job that is not linked to Recruitly (nothing to choose from;
//      checked here, not trusted from the screen).
//    Otherwise: refused, so an existing job is never joined without staff choosing.
// Refuses a job of another client, a chosen job already linked to another
// Recruitly job, and several portal jobs linked to one Recruitly job.
// recruitlyJob may be the job-list row; loadFullJob() reads the full record
// (with short description) and is only called when the portal job is created.
export async function findOrCreatePortalJob(
    recruitlyJob,
    client,
    { loadFullJob, portalJobDocumentId = "", createNew = false, createIfClientHasNone = false } = {}
) {
    const reference = String(recruitlyJob?.reference || "").trim();
    let job = null;
    let joined = false;
    const update = {};

    const found = await findJobByRecruitlyId(recruitlyJob.id);
    if (found.length > 1) {
        throw new JobImportError(`More than one portal job is linked to ${reference}. Please check the jobs list.`, 409);
    }

    if (found.length === 1) {
        job = found[0];
        refuseOtherClient(job, client, reference);
    } else if (portalJobDocumentId) {
        job = await loadPortalJob(portalJobDocumentId);
        if (!job) throw new JobImportError("The chosen portal job was not found. Reload the page and choose again.", 404);
        refuseOtherClient(job, client, reference);
        if (!notLinked(job)) {
            throw new JobImportError(
                `Portal job ${job.referenceNo || job.title} is already linked to another Recruitly job. Nothing was imported.`,
                409
            );
        }
        joined = true;
        update.recruitlyJobId = String(recruitlyJob.id);
        Object.assign(update, joinFields(job, reference));
        if (!job.client?.documentId) update.client = { connect: [client.documentId] };
    } else if (!createNew && !(createIfClientHasNone && (await clientJobs(client)).every((j) => !notLinked(j)))) {
        throw new JobImportError("This Recruitly job is not linked to a portal job yet. Choose the portal job (or create a new one) first.", 409);
    }

    if (job) {
        // Job Type is refreshed on every import (agreed field mapping); staff edits to other fields stay.
        const jobType = String(recruitlyJob?.employmentTypeName || "").trim();
        if (jobType && jobType !== job.jobTypeList) update.jobTypeList = jobType;
        if (Object.keys(update).length) {
            await strapiRequest(`/jobs/${encodeURIComponent(job.documentId)}`, {
                method: "PUT",
                query: { status: "published" },
                body: { data: update },
            });
            if (update.jobTypeList) job.jobTypeList = update.jobTypeList;
            if (update.recruitlyJobId) job.recruitlyJobId = update.recruitlyJobId;
            if (update.referenceNo) job.referenceNo = update.referenceNo;
            if (update.previousReferenceNo) job.previousReferenceNo = update.previousReferenceNo;
        }
        return { job, created: false, joined };
    }

    const details = loadFullJob ? { ...recruitlyJob, ...(await loadFullJob()) } : recruitlyJob;
    await strapiRequest("/jobs", {
        method: "POST",
        query: { status: "published" },
        body: { data: portalJobFields(details, client.documentId) },
    });
    const [createdJob] = await findJobByRecruitlyId(recruitlyJob.id);
    if (!createdJob) throw new JobImportError("The portal job could not be created.", 502);
    return { job: createdJob, created: true, joined: false };
}

// Existing pipeline entry, re-sent with everything it holds (offer letter and
// chats included) so saving the list never drops them.
function keepItem(item) {
    // No component id: with draft & publish the published copy's ids differ and
    // Strapi rejects them. Re-sending the full content recreates the entry as is.
    const kept = {
        candidateProcessList: item.candidateProcessList || "",
        candidate: relationDocumentId(item.candidate),
    };
    const offer = relationId(item.offerLetter);
    if (offer) kept.offerLetter = offer;
    const chats = (item.pipline_chats?.data ?? item.pipline_chats ?? []).map((c) => c?.documentId).filter(Boolean);
    if (chats.length) kept.pipline_chats = chats;
    return kept;
}

// upserts: [{ candidateDocumentId, stage }]
// removeDocumentIds: Set of candidate documentIds to take off this job.
// Returns { items, added, changed, removed } where changed = [{ documentId, from, to }].
export function mergePipeline(existingItems, upserts, removeDocumentIds) {
    const items = [];
    const removed = [];
    const seen = new Map();

    for (const item of existingItems || []) {
        const docId = item?.candidate?.documentId || null;
        if (docId && removeDocumentIds.has(docId)) {
            removed.push({ documentId: docId, fullName: item.candidate?.fullName || "", reference: item.candidate?.caNumber || "" });
            continue;
        }
        const kept = keepItem(item);
        items.push(kept);
        if (docId) seen.set(docId, kept);
    }

    const added = [];
    const changed = [];
    for (const u of upserts) {
        const current = seen.get(u.candidateDocumentId);
        if (current) {
            if (current.candidateProcessList !== u.stage) {
                changed.push({ documentId: u.candidateDocumentId, from: current.candidateProcessList, to: u.stage });
                current.candidateProcessList = u.stage;
            }
            continue;
        }
        const fresh = { candidateProcessList: u.stage, candidate: u.candidateDocumentId };
        items.push(fresh);
        seen.set(u.candidateDocumentId, fresh);
        added.push(u.candidateDocumentId);
    }

    return { items, added, changed, removed };
}

export async function savePipeline(jobDocumentId, items) {
    await strapiRequest(`/jobs/${encodeURIComponent(jobDocumentId)}`, {
        method: "PUT",
        query: { status: "published" },
        body: { data: { assignCandidatesToJob: items } },
    });
}

// Portal candidate documentIds for these Recruitly IDs (for removals).
export async function documentIdsForRecruitlyIds(recruitlyIds) {
    const ids = [...new Set(recruitlyIds.filter(Boolean).map(String))];
    const map = new Map();
    for (let i = 0; i < ids.length; i += 100) {
        const json = await strapiRequest("/candidates", {
            query: {
                status: "published",
                filters: { recruitlyId: { $in: ids.slice(i, i + 100) } },
                fields: ["documentId", "recruitlyId"],
                pagination: { page: 1, pageSize: 100 },
            },
        });
        for (const row of Array.isArray(json?.data) ? json.data : []) map.set(row.recruitlyId, row.documentId);
    }
    return map;
}
