// Portal job side of the Recruitly import (R1 part 2): find or create the portal
// job for a Recruitly job, and add / update / remove candidates on its pipeline.
// Server only. Writes to the portal (Strapi) only, never to Recruitly.
import { strapiRequest } from "./portalStrapi.js";

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

async function findJobByRecruitlyId(recruitlyJobId) {
    const json = await strapiRequest("/jobs", {
        query: {
            status: "published",
            filters: { recruitlyJobId: { $eq: recruitlyJobId } },
            fields: ["documentId", "title", "referenceNo", "recruitlyJobId", "jobTypeList", "statusList"],
            populate: JOB_POPULATE,
            pagination: { page: 1, pageSize: 2 },
        },
    });
    return Array.isArray(json?.data) ? json.data : [];
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

// Returns { job, created }. Refuses a portal job already linked to another client.
export async function findOrCreatePortalJob(recruitlyJob, client) {
    const found = await findJobByRecruitlyId(recruitlyJob.id);
    if (found.length > 1) {
        throw new JobImportError(`More than one portal job is linked to ${recruitlyJob.reference}. Please check the jobs list.`, 409);
    }

    if (found.length === 1) {
        const job = found[0];
        const owner = job?.client?.documentId || null;
        if (owner && owner !== client.documentId) {
            throw new JobImportError(
                `Portal job ${job.referenceNo || recruitlyJob.reference} belongs to another client (${job.client?.companyName || "unknown"}). Nothing was imported.`,
                409
            );
        }

        // Job Type is refreshed on every import (agreed field mapping); staff edits to other fields stay.
        const jobType = String(recruitlyJob?.employmentTypeName || "").trim();
        if (jobType && jobType !== job.jobTypeList) {
            await strapiRequest(`/jobs/${encodeURIComponent(job.documentId)}`, {
                method: "PUT",
                query: { status: "published" },
                body: { data: { jobTypeList: jobType } },
            });
            job.jobTypeList = jobType;
        }
        return { job, created: false };
    }

    await strapiRequest("/jobs", {
        method: "POST",
        query: { status: "published" },
        body: { data: portalJobFields(recruitlyJob, client.documentId) },
    });
    const [job] = await findJobByRecruitlyId(recruitlyJob.id);
    if (!job) throw new JobImportError("The portal job could not be created.", 502);
    return { job, created: true };
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
