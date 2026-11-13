export const runtime = "nodejs";

import qs from "qs";

/* ---------------- BASE URLS ----------------  
http://localhost:3000/api/jobs/candidates/jobs/list/?candidateDocumentId=y0temyongzhi9fem443fc0gk&page=1&pageSize=10*/

function strapiBase() {
    return (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
}

function strapiToken() {
    return process.env.STRAPI_TOKEN || "";
}

/* ---------------- HELPERS ---------------- */

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}

function getBearerToken() {
    const token = String(strapiToken() || "").trim();

    if (!token) return "";

    return token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
}

async function readBodySafe(res) {
    const text = await res.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

function normalizeStage(value) {
    const v = String(value || "").trim().toLowerCase();

    if (v === "suggested candidate" || v === "suggested") {
        return "Suggested";
    }

    if (v === "shortlisted candidate" || v === "shortlisted") {
        return "Shortlisted";
    }

    if (v === "requested interview" || v === "interview") {
        return "Interview";
    }

    if (v === "interviewed") {
        return "Interviewed";
    }

    if (v === "hired candidate" || v === "hired") {
        return "Hired";
    }

    if (v === "immigration") {
        return "Immigration";
    }

    if (v === "placed") {
        return "Placed";
    }

    return value || "";
}

function stageWeight(stage) {
    const s = normalizeStage(stage);

    const order = {
        Placed: 600,
        Immigration: 500,
        Hired: 400,
        Interviewed: 350,
        Interview: 300,
        Shortlisted: 200,
        Suggested: 100,
    };

    return order[s] || 0;
}

function normalizeCandidate(candidate) {
    if (!candidate) return null;

    const c = candidate?.attributes
        ? {
            id: candidate.id,
            documentId: candidate.documentId || candidate.attributes?.documentId,
            ...candidate.attributes,
        }
        : candidate;

    return {
        id: c?.id || null,
        documentId: c?.documentId || "",
        fullName: c?.fullName || "",
        firstName: c?.firstName || "",
        lastName: c?.lastName || "",
        referenceNumber: c?.referenceNumber || ""
    };
}

function normalizeClient(client) {
    if (!client) return null;

    const c = client?.attributes
        ? {
            id: client.id,
            documentId: client.documentId || client.attributes?.documentId,
            ...client.attributes,
        }
        : client;

    return {
        id: c?.id || null,
        documentId: c?.documentId || "",
        companyName: c?.companyName || "",

    };
}

function normalizeJob(job, candidateDocumentId) {
    const j = job?.attributes
        ? {
            id: job.id,
            documentId: job.documentId || job.attributes?.documentId,
            ...job.attributes,
        }
        : job || {};

    const assignments = Array.isArray(j?.assignCandidatesToJob)
        ? j.assignCandidatesToJob
        : [];

    const matchedAssignment =
        assignments.find((item) => {
            const candidate = normalizeCandidate(item?.candidate);
            return candidate?.documentId === candidateDocumentId;
        }) || null;

    const candidateProcessList = normalizeStage(
        matchedAssignment?.candidateProcessList || ""
    );

    const client = normalizeClient(j?.client);

    return {
        id: j?.id || null,
        documentId: j?.documentId || "",
        title: j?.title || "",
        details: j?.details || [],
        referenceNo: j?.referenceNo || "",
        closingDate: j?.closingDate || "",
        location: j?.location || "",
        industeryList: j?.industeryList || "",
        jobTypeList: j?.jobTypeList || "",
        statusList: j?.statusList || "",
        vacanciesNo: j?.vacanciesNo ?? "",
        experience: j?.experience ?? "",
        shortDescription: j?.shortDescription || "",
        showToCandidateList: j?.showToCandidateList || "",
        createdAt: j?.createdAt || "",
        updatedAt: j?.updatedAt || "",
        publishedAt: j?.publishedAt || "",

        client,

        candidateProcessList,
        assignmentId: matchedAssignment?.id || null,

        candidate: matchedAssignment?.candidate
            ? normalizeCandidate(matchedAssignment.candidate)
            : null,
    };
}

/* ---------------- GET ---------------- */

export async function GET(req) {
    try {
        const STRAPI_BASE_URL = strapiBase();
        const BEARER = getBearerToken();

        if (!STRAPI_BASE_URL) {
            return Response.json(
                {
                    ok: false,
                    error: "Missing NEXT_PUBLIC_API_BASE_URL in environment.",
                },
                { status: 500 }
            );
        }

        if (!BEARER) {
            return Response.json(
                {
                    ok: false,
                    error: "Missing STRAPI_TOKEN in environment.",
                },
                { status: 500 }
            );
        }

        const url = new URL(req.url);

        const candidateDocumentId = String(
            url.searchParams.get("candidateDocumentId") || ""
        ).trim();

        const page = Math.max(1, Number(url.searchParams.get("page") || 1));

        const pageSizeRaw = Number(url.searchParams.get("pageSize") || 10);
        const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

        if (!candidateDocumentId) {
            return Response.json(
                { ok: false, error: "Missing candidateDocumentId" },
                { status: 400 }
            );
        }


        /*
            Fetch jobs where:
            - job is published
            - job status is open/active
            - assignCandidatesToJob contains this candidate
        */

        const queryObj = {
            status: "published",
            filters: {
                $and: [
                    {
                        statusList: {
                            $in: ["active", "Active", "open", "Open"],
                        },
                    },
                    {
                        assignCandidatesToJob: {
                            candidate: {
                                documentId: {
                                    $eq: candidateDocumentId,
                                },
                            },
                        },
                    },
                ],
            },
            sort: ["createdAt:desc"],
            populate: {
                client: {
                    fields: ["companyName", "documentId"],
                },
                assignCandidatesToJob: {
                    populate: {
                        candidate: {
                            fields: [
                                "fullName",
                                "firstName",
                                "lastName",
                                "referenceNumber",
                                "documentId",

                            ],
                        },
                    },
                },
            },
            pagination: {
                page: 1,
                pageSize: 500,
            },
        };

        const query = qs.stringify(queryObj, { encodeValuesOnly: true });


        console.log("Fetching jobs with query:", STRAPI_BASE_URL, `/jobs?${query}`);

        const res = await fetch(joinUrl(STRAPI_BASE_URL, `/jobs?${query}`), {
            method: "GET",
            headers: {
                Authorization: BEARER,
            },
            cache: "no-store",
        });

        const json = await readBodySafe(res);

        if (!res.ok) {
            return Response.json(
                {
                    ok: false,
                    error: "Strapi jobs fetch failed",
                    details: json,
                },
                { status: res.status }
            );
        }

        const rows = Array.isArray(json?.data) ? json.data : [];

        let jobs = rows
            .map((job) => normalizeJob(job, candidateDocumentId))
            .filter((job) => job?.documentId && job?.candidateProcessList);

        jobs.sort((a, b) => {
            const stageDiff =
                stageWeight(b?.candidateProcessList) -
                stageWeight(a?.candidateProcessList);

            if (stageDiff !== 0) return stageDiff;

            const dateA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;

            return dateB - dateA;
        });

        const total = jobs.length;
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(page, pageCount);

        const start = (safePage - 1) * pageSize;
        const end = start + pageSize;

        const items = jobs.slice(start, end);

        return Response.json(
            {
                ok: true,
                candidateDocumentId,
                page: safePage,
                pageSize,
                pageCount,
                total,
                items,
            },
            { status: 200 }
        );
    } catch (err) {
        return Response.json(
            {
                ok: false,
                error: err?.message || "Server error",
                details: err?.details || null,
            },
            { status: err?.status || 500 }
        );
    }
}