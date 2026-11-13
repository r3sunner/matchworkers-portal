export const runtime = "nodejs";

import qs from "qs";
import { CreateNotification } from "@/lib/server/notification";
import {
    SearchCandidatesAccessError,
    requireSearchCandidatesAccess,
    searchCandidatesErrorResponse,
} from "@/app/api/search-candidates/_lib/access";

function strapiBase() {
    return (

        process.env.NEXT_PUBLIC_ADMIN_BASE_URL ||
        "http://127.0.0.1:1337"
    ).replace(/\/$/, "");
}

function strapiToken() {
    return (
        process.env.STRAPI_TOKEN ||
        process.env.STRAPI_API_TOKEN ||
        process.env.STRAPI_ADMIN_TOKEN ||
        ""
    );
}

function safeArray(v) {
    return Array.isArray(v) ? v : [];
}

async function readBodySafe(res) {
    const text = await res.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

async function fetchStrapi(path, queryObj = {}) {
    const token = strapiToken();
    const base = strapiBase();

    if (!token) {
        throw new Error("Missing STRAPI token env");
    }

    const query = qs.stringify(
        { status: "published", ...queryObj },
        { encodeValuesOnly: true }
    );

    const url = `${base}${path}${query ? `?${query}` : ""}`;

    const res = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`,
        },
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        throw new Error(
            json?.error?.message ||
            json?.message ||
            `Strapi request failed: ${path} (${res.status})`
        );
    }

    return json;
}

async function putStrapi(path, payload) {
    const token = strapiToken();
    const base = strapiBase();

    if (!token) {
        throw new Error("Missing STRAPI token env");
    }

    const url = `${base}${path}${path.includes("?") ? "&" : "?"}status=published`;

    const res = await fetch(url, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        throw new Error(
            json?.error?.message ||
            json?.message ||
            `Strapi update failed: ${path} (${res.status})`
        );
    }

    return json;
}

function pickAttrs(row) {
    return row?.attributes ?? row ?? {};
}

function normalizeActionText(action) {
    const value = String(action || "").trim().toLowerCase();

    if (value === "suggested" || value === "suggested candidate") {
        return "Suggested Candidate";
    }

    if (value === "shortlisted" || value === "shortlisted candidate") {
        return "Shortlisted Candidate";
    }

    if (
        value === "request interview" ||
        value === "requested interview" ||
        value === "interview requested"
    ) {
        return "Requested Interview";
    }

    if (value === "interviewed") {
        return "Interviewed";
    }

    if (value === "immigration") {
        return "Immigration";
    }

    /*
        Keep Strapi value as "Hired Candidate".
        Only notification display will rename it to "Offered Candidate".
    */
    if (
        value === "hired" ||
        value === "hired candidate" ||
        value === "offered" ||
        value === "offered candidate"
    ) {
        return "Hired Candidate";
    }

    throw new Error("Invalid action");
}

async function getCandidateByDocumentId(candidateDocumentId) {
    const json = await fetchStrapi("/api/candidates", {
        filters: {
            documentId: {
                $eq: candidateDocumentId,
            },
        },
        fields: ["documentId", "fullName", "referenceNumber"],
        pagination: {
            page: 1,
            pageSize: 1,
        },
    });

    const row = safeArray(json?.data)[0];
    const a = pickAttrs(row);



    if (!row) {
        throw new Error("Candidate not found");
    }

    return {
        id: row?.id ?? a?.id ?? null,
        documentId: row?.documentId || a?.documentId || "",
        fullName: a?.fullName || "",
        referenceNumber: a?.referenceNumber || "",
    };
}

async function getJobByDocumentId(jobDocumentId) {
    const json = await fetchStrapi("/api/jobs", {
        filters: {
            documentId: {
                $eq: jobDocumentId,
            },
        },
        fields: ["documentId", "title", "referenceNo"],
        populate: {
            client: {
                fields: ["documentId"],
            },
            assignCandidatesToJob: {
                populate: {
                    candidate: {
                        fields: ["documentId", "fullName", "referenceNumber"],
                    },

                },
            },
        },
        pagination: {
            page: 1,
            pageSize: 1,
        },
    });

    const row = safeArray(json?.data)[0];
    const a = pickAttrs(row);

    if (!row) {
        throw new Error("Job not found");
    }


    const clientRelation = a?.client?.data ?? a?.client ?? null;
    const clientAttrs = pickAttrs(clientRelation);

    return {
        id: row?.id ?? a?.id ?? null,
        documentId: row?.documentId || a?.documentId || "",
        title: a?.title || "",
        referenceNo: a?.referenceNo || "",
        clientDocumentId:
            clientRelation?.documentId || clientAttrs?.documentId || "",
        assignCandidatesToJob: safeArray(a?.assignCandidatesToJob),
    };
}

function getRelationId(rel) {
    const raw = rel?.data ?? rel;
    const a = pickAttrs(raw);

    return raw?.id ?? a?.id ?? null;
}

function getRelationDocumentId(rel) {
    const raw = rel?.data ?? rel;
    const a = pickAttrs(raw);

    return String(raw?.documentId || a?.documentId || "").trim();
}

function getDisplayStageName(stage) {
    const value = String(stage || "").trim();

    if (!value) return "";

    if (value.toLowerCase() === "hired candidate") {
        return "Offered Candidate";
    }

    return value;
}

function getCandidateDisplayName(candidate) {
    return (
        candidate?.fullName ||
        candidate?.referenceNumber ||
        candidate?.documentId ||
        "Unknown Candidate"
    );
}

function getJobDisplayTitle(job) {
    return job?.title || job?.referenceNo || job?.documentId || "Unknown Job";
}

async function createCandidatePipelineNotification({
    candidate,
    job,
    newProcessText,
}) {
    const candidateName = getCandidateDisplayName(candidate);
    const candidateReference = candidate?.referenceNumber || "N/A";
    const jobTitle = getJobDisplayTitle(job);
    const jobReference = job?.referenceNo || "N/A";
    const pipelineStage = getDisplayStageName(newProcessText) || "N/A";

    try {
        await CreateNotification({
            title: `Candidate Added to Job: ${jobReference} - ${candidateName}`,
            details: [
                `${candidateName} has been added to job "${jobTitle}".`,
                `Job Reference No: ${jobReference}.`,
                `Candidate Reference No: ${candidateReference}.`,
                `Pipeline Stage: ${pipelineStage}.`,
            ].join("\n"),
            email: false,
        });
    } catch (notificationError) {
        console.error("Candidate added to job notification failed:", notificationError);
    }
}


export async function POST(req) {
    try {
        const access = await requireSearchCandidatesAccess();
        const body = await req.json();

        const candidateDocumentId = String(body?.candidateDocumentId || "").trim();
        const jobDocumentId = String(body?.jobDocumentId || "").trim();
        const action = String(body?.action || "").trim();

        if (!candidateDocumentId) {
            return Response.json(
                {
                    ok: false,
                    error: "candidateDocumentId is required",
                },
                { status: 400 }
            );
        }

        if (!jobDocumentId) {
            return Response.json(
                {
                    ok: false,
                    error: "jobDocumentId is required",
                },
                { status: 400 }
            );
        }

        if (!action) {
            return Response.json(
                {
                    ok: false,
                    error: "action is required",
                },
                { status: 400 }
            );
        }

        const processText = normalizeActionText(action);

        const [candidateRow, jobRow] = await Promise.all([
            getCandidateByDocumentId(candidateDocumentId),
            getJobByDocumentId(jobDocumentId),
        ]);

        if (
            access.isClient &&
            String(jobRow.clientDocumentId) !== String(access.clientDocumentId)
        ) {
            throw new SearchCandidatesAccessError(
                "You do not have permission to use this job",
                403
            );
        }

        if (access.isClient && processText !== "Requested Interview") {
            throw new SearchCandidatesAccessError(
                "Clients can only request an interview",
                403
            );
        }

        const existingItems = safeArray(jobRow.assignCandidatesToJob);

        const existingIndex = existingItems.findIndex((item) => {
            const itemAttrs = pickAttrs(item);
            const existingCandidateDocId = getRelationDocumentId(itemAttrs?.candidate);
            return String(existingCandidateDocId) === String(candidateDocumentId);
        });

        const normalizedExistingItems = existingItems.map((item) => {
            const itemAttrs = pickAttrs(item);

            return {
                candidateProcessList: itemAttrs?.candidateProcessList || "",
                candidate: getRelationId(itemAttrs?.candidate),
                /* ...(getRelationId(itemAttrs?.offerLetter)
                     ? { offerLetter: getRelationId(itemAttrs?.offerLetter) }
                     : {}),  */
            };
        });

        if (existingIndex >= 0) {
            return Response.json(
                {
                    ok: false,
                    error: "This candidate is already added in this job.",
                    code: "CANDIDATE_ALREADY_IN_JOB",
                    candidateDocumentId: candidateRow.documentId,
                    jobDocumentId: jobRow.documentId,
                },
                { status: 409 }
            );
        }

        normalizedExistingItems.push({
            candidateProcessList: processText,
            candidate: candidateRow.id,
        });

        await putStrapi(`/api/jobs/${jobRow.documentId}`, {
            data: {
                assignCandidatesToJob: normalizedExistingItems,
            },
        });

        await createCandidatePipelineNotification({
            candidate: candidateRow,
            job: jobRow,
            newProcessText: processText,
        });

        return Response.json({
            ok: true,
            message: "Candidate selected successfully",
            candidateProcessList: processText,
            jobDocumentId: jobRow.documentId,
            candidateDocumentId: candidateRow.documentId,
        });
    } catch (error) {
        return searchCandidatesErrorResponse(error);
    }
}