export const runtime = "nodejs";

import qs from "qs";
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

function toPositiveInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.floor(n);
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

function pickAttrs(row) {
    return row?.attributes ?? row ?? {};
}

function normalizeMedia(file) {
    if (!file) return null;

    const raw = file?.data ?? file;
    const a = pickAttrs(raw);
    const url = a?.url || "";

    if (!url) return null;

    return {
        id: raw?.id ?? a?.id ?? null,
        name: a?.name || "",
        url: url.startsWith("http") ? url : `${strapiBase()}${url}`,
    };
}

function normalizeDocuments(documents) {
    return safeArray(documents).map((doc) => {
        const a = pickAttrs(doc);

        return {
            name: a?.name || "",
            remarks: a?.remarks || "",
            file: normalizeMedia(a?.file),
        };
    });
}

function normalizeRelationArray(rel) {
    const raw = rel?.data ?? rel;
    return safeArray(raw);
}

async function getJobDocumentIdsByClient(clientDocumentId) {
    if (!clientDocumentId) return [];

    const json = await fetchStrapi("/api/jobs", {
        filters: {
            client: {
                documentId: {
                    $eq: clientDocumentId,
                },
            },
        },
        fields: ["documentId"],
        pagination: {
            page: 1,
            pageSize: 500,
        },
        sort: ["createdAt:desc"],
    });

    return safeArray(json?.data)
        .map((row) => {
            const a = pickAttrs(row);
            return String(row?.documentId || a?.documentId || "").trim();
        })
        .filter(Boolean);
}

async function getAssignedCandidateDocumentIdsForJob(jobDocumentId) {
    if (!jobDocumentId) return [];

    const json = await fetchStrapi("/api/jobs", {
        filters: {
            documentId: {
                $eq: jobDocumentId,
            },
        },
        fields: ["documentId", "title", "referenceNo"],
        populate: {
            assignCandidatesToJob: {
                populate: {
                    candidate: {
                        fields: ["documentId", "fullName", "referenceNumber"],
                    },
                    offerLetter: true,
                },
            },
        },
        pagination: {
            page: 1,
            pageSize: 1,
        },
    });

    const jobRow = safeArray(json?.data)[0];
    const jobAttrs = pickAttrs(jobRow);

    const assignList = safeArray(jobAttrs?.assignCandidatesToJob);

    const candidateIds = assignList
        .map((item) => {
            const itemAttrs = pickAttrs(item);
            const candidateRel = itemAttrs?.candidate?.data ?? itemAttrs?.candidate ?? null;
            const candidateAttrs = pickAttrs(candidateRel);

            return String(
                candidateRel?.documentId ||
                candidateAttrs?.documentId ||
                ""
            ).trim();
        })
        .filter(Boolean);

    return [...new Set(candidateIds)];
}

export async function POST(req) {
    try {
        const access = await requireSearchCandidatesAccess();
        const body = await req.json();

        const requestedClientDocumentId = String(body?.clientDocumentId || "").trim();
        const clientDocumentId = access.isClient
            ? access.clientDocumentId
            : requestedClientDocumentId;
        const jobDocumentId = String(body?.jobDocumentId || "").trim();
        const genderList = String(body?.genderList || "").trim();
        const nationalityList = String(body?.nationalityList || "").trim();
        const q = access.isStaff ? String(body?.q || "").trim() : "";
        const page = toPositiveInt(body?.page, 1);
        const pageSize = Math.min(40, toPositiveInt(body?.pageSize, 40));

        const jobRoles = safeArray(body?.jobRoles)
            .map((x) => String(x || "").trim())
            .filter(Boolean);

        let jobDocumentIdsForFilter = [];

        /* if (jobDocumentId) {
            jobDocumentIdsForFilter = [jobDocumentId];
        } else if (clientDocumentId) {
            jobDocumentIdsForFilter = await getJobDocumentIdsByClient(clientDocumentId);

            if (!jobDocumentIdsForFilter.length) {
                return Response.json({
                    ok: true,
                    items: [],
                });
            }
        } */

        if (jobDocumentId && access.isClient) {
            const ownJobDocumentIds = await getJobDocumentIdsByClient(
                access.clientDocumentId
            );

            if (!ownJobDocumentIds.includes(jobDocumentId)) {
                throw new SearchCandidatesAccessError(
                    "You do not have permission to use this job",
                    403
                );
            }
        }

        let assignedCandidateDocumentIds = [];

        if (jobDocumentId) {
            assignedCandidateDocumentIds = await getAssignedCandidateDocumentIdsForJob(jobDocumentId);
        }

        const filters = {
            jobStatus: {
                $ne: "Hired",
            },

            ...(genderList
                ? {
                    genderList: {
                        $eq: genderList,
                    },
                }
                : {}),

            ...(nationalityList
                ? {
                    nationalityList: {
                        $eq: nationalityList,
                    },
                }
                : {}),

            ...(jobRoles.length
                ? {
                    job_roles: {
                        documentId: {
                            $in: jobRoles,
                        },
                    },
                }
                : {}),

            ...(jobDocumentIdsForFilter.length
                ? {
                    jobs: {
                        documentId: {
                            $in: jobDocumentIdsForFilter,
                        },
                    },
                }
                : {}),

            ...(q
                ? {
                    $or: [
                        { fullName: { $containsi: q } },
                        { firstName: { $containsi: q } },
                        { lastName: { $containsi: q } },
                        { referenceNumber: { $containsi: q } },
                        { mobile: { $containsi: q } },
                        { shortSummary: { $containsi: q } },
                        { previousCompany: { $containsi: q } },

                        { privateNotes: { $containsi: q } },
                        { currentCompany: { $containsi: q } },
                        {
                            users_permissions_user: {
                                email: { $containsi: q },
                            },
                        },
                        {
                            users_permissions_user: {
                                username: { $containsi: q },
                            },
                        },
                    ],
                }
                : {}),
        };

        const json = await fetchStrapi("/api/candidates", {
            filters,
            populate: {
                users_permissions_user: true,
                profileImage: true,
                CV: true,
                passport: true,
                documents: {
                    populate: {
                        file: true,
                    },
                },
                job_roles: true,
                jobs: true,
            },
            sort: ["createdAt:desc"],
            pagination: {
                page: 1,
                pageSize: 1000,
            },
        });

        const allItems = safeArray(json?.data)
            .map((row) => {
                const a = pickAttrs(row);

                const userRel =
                    a?.users_permissions_user?.data ??
                    a?.users_permissions_user ??
                    null;
                const userAttrs = pickAttrs(userRel);

                const jobRoleTitles = normalizeRelationArray(a?.job_roles)
                    .map((jr) => {
                        const r = pickAttrs(jr);
                        return r?.title || "";
                    })
                    .filter(Boolean);

                const relatedJobs = normalizeRelationArray(a?.jobs).map((job) => {
                    const j = pickAttrs(job);
                    return {
                        documentId: job?.documentId || j?.documentId || "",
                        title: j?.title || "",
                        referenceNo: j?.referenceNo || "",
                    };
                });

                return {
                    id: row?.id ?? null,
                    documentId: row?.documentId || a?.documentId || "",
                    referenceNumber: a?.referenceNumber || "",
                    fullName: a?.fullName || "",
                    firstName: a?.firstName || "",
                    lastName: a?.lastName || "",
                    email: access.isStaff ? userAttrs?.email || "" : "",
                    username: access.isStaff ? userAttrs?.username || "" : "",
                    mobile: access.isStaff ? a?.mobile || "" : "",
                    birthDate: a?.birthDate || "",
                    nationality: a?.nationalityList || "",
                    nationalityList: a?.nationalityList || "",
                    gender: a?.genderList || "",
                    genderList: a?.genderList || "",
                    maritalStatus: a?.maritalStatusList || "",
                    maritalStatusList: a?.maritalStatusList || "",
                    englishLevel: a?.englishLevelList || "",
                    englishLevelList: a?.englishLevelList || "",
                    shortSummary: a?.shortSummary || "",
                    previousCompany: a?.previousCompany || "",
                    currentCompany: a?.currentCompany || "",

                    privateNotes: access.isStaff ? a?.privateNotes || "" : "",
                    jobStatus: a?.jobStatus || "",
                    profileImage: normalizeMedia(a?.profileImage),
                    cv: normalizeMedia(a?.CV),
                    passport: normalizeMedia(a?.passport),
                    documents: normalizeDocuments(a?.documents),
                    jobRoleTitles,
                    jobs: relatedJobs,
                    suggestedToClientsJobsCount: relatedJobs.length,
                    shortlistedByClientsJobsCount: 0,
                    isProfileVerified: false,
                    workingVideoLink: a?.workingVideoLink || "",
                    miScreeningVideoLink: a?.miScreeningVideoLink || "",
                };
            })
            .filter((item) => {
                if (!jobDocumentId) return true;
                return !assignedCandidateDocumentIds.includes(String(item.documentId || "").trim());
            });

        const total = allItems.length;
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(page, pageCount);
        const start = (safePage - 1) * pageSize;
        const items = allItems.slice(start, start + pageSize);

        return Response.json({
            ok: true,
            items,
            pagination: {
                page: safePage,
                pageSize,
                pageCount,
                total,
            },
        });
    } catch (error) {
        return searchCandidatesErrorResponse(error);
    }
}