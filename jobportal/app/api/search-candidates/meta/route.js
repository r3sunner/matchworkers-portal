export const runtime = "nodejs";

import qs from "qs";
import {
    requireSearchCandidatesAccess,
    searchCandidatesErrorResponse,
} from "@/app/api/search-candidates/_lib/access";

function strapiBase() {
    const apiBase = String(
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        process.env.STRAPI_API_BASE_URL ||
        ""
    )
        .trim()
        .replace(/\/$/, "");

    if (apiBase) return apiBase;

    const adminBase = String(
        process.env.NEXT_PUBLIC_ADMIN_BASE_URL ||
        process.env.STRAPI_URL ||
        "http://127.0.0.1:1337"
    )
        .trim()
        .replace(/\/$/, "");

    return `${adminBase}/api`;
}

function authorizationHeader() {
    const token = String(
        process.env.STRAPI_TOKEN ||
        process.env.STRAPI_API_TOKEN ||
        process.env.STRAPI_ADMIN_TOKEN ||
        ""
    ).trim();

    if (!token) throw new Error("Missing STRAPI token env");
    return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function pickAttrs(row) {
    return row?.attributes ?? row ?? {};
}

async function readBodySafe(response) {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

async function fetchStrapi(path, queryObj = {}) {
    const query = qs.stringify(
        { status: "published", ...queryObj },
        { encodeValuesOnly: true }
    );

    const url = `${strapiBase()}${path}${query ? `?${query}` : ""}`;
    const response = await fetch(url, {
        headers: { Authorization: authorizationHeader() },
        cache: "no-store",
    });
    const json = await readBodySafe(response);

    if (!response.ok || json?.error) {
        throw new Error(
            json?.error?.message ||
            json?.message ||
            `Strapi request failed: ${path} (${response.status})`
        );
    }

    return json;
}

// Strapi returns at most 100 rows per request (config/api.ts maxLimit), so a
// larger pageSize is silently cut to 100. Read every page instead.
const STRAPI_PAGE_SIZE = 100;
const MAX_STRAPI_PAGES = 100;

async function fetchAllStrapi(path, queryObj = {}) {
    const rows = [];
    const seen = new Set();

    for (let page = 1; page <= MAX_STRAPI_PAGES; page += 1) {
        const json = await fetchStrapi(path, {
            ...queryObj,
            pagination: { page, pageSize: STRAPI_PAGE_SIZE },
        });

        for (const row of safeArray(json?.data)) {
            const key = row?.documentId || row?.id;
            if (key && seen.has(key)) continue;
            if (key) seen.add(key);
            rows.push(row);
        }

        const pageCount = Number(json?.meta?.pagination?.pageCount) || 1;
        if (page >= pageCount) break;
    }

    return { data: rows };
}

export async function GET() {
    try {
        const access = await requireSearchCandidatesAccess();
        const ownClientFilter = access.isClient
            ? {
                filters: {
                    documentId: { $eq: access.clientDocumentId },
                },
            }
            : {};
        const ownJobsFilter = access.isClient
            ? {
                filters: {
                    client: {
                        documentId: { $eq: access.clientDocumentId },
                    },
                },
            }
            : {};

        const [clientsJson, jobsJson, jobRolesJson] = await Promise.all([
            fetchAllStrapi("/clients", {
                ...ownClientFilter,
                sort: ["createdAt:desc", "id:desc"],
            }),
            fetchAllStrapi("/jobs", {
                ...ownJobsFilter,
                fields: ["title", "referenceNo", "documentId"],
                sort: ["createdAt:desc", "id:desc"],
                populate: {
                    client: {
                        fields: [
                            "documentId",
                            "companyName",
                            "contactName",
                            "designation",
                        ],
                    },
                },
            }),
            fetchAllStrapi("/job-roles", {
                fields: ["title", "documentId"],
                sort: ["title:asc", "id:asc"],
            }),
        ]);

        const clients = safeArray(clientsJson?.data).map((row) => {
            const attrs = pickAttrs(row);
            return {
                id: row?.id ?? attrs?.id ?? null,
                documentId: row?.documentId || attrs?.documentId || "",
                companyName: attrs?.companyName || "",
                contactName: attrs?.contactName || "",
                designation: attrs?.designation || "",
            };
        });

        const jobs = safeArray(jobsJson?.data).map((row) => {
            const attrs = pickAttrs(row);
            const clientRelation = attrs?.client?.data ?? attrs?.client ?? null;
            const clientAttrs = pickAttrs(clientRelation);

            return {
                id: row?.id ?? attrs?.id ?? null,
                documentId: row?.documentId || attrs?.documentId || "",
                title: attrs?.title || "",
                referenceNo: attrs?.referenceNo || "",
                referenceNumber: attrs?.referenceNo || "",
                clientDocumentId:
                    clientRelation?.documentId || clientAttrs?.documentId || "",
                companyName: clientAttrs?.companyName || "",
                contactName: clientAttrs?.contactName || "",
                designation: clientAttrs?.designation || "",
            };
        });

        const jobRoles = safeArray(jobRolesJson?.data).map((row) => {
            const attrs = pickAttrs(row);
            return {
                id: row?.id ?? attrs?.id ?? null,
                documentId: row?.documentId || attrs?.documentId || "",
                title: attrs?.title || "",
                name: attrs?.title || "",
            };
        });

        return Response.json({
            ok: true,
            clients,
            jobs,
            jobRoles,
            currentClientDocumentId: access.isClient
                ? access.clientDocumentId
                : "",
            initialClientDocumentId: access.isClient
                ? access.clientDocumentId
                : "",
            initialJobDocumentId: "",
        });
    } catch (error) {
        return searchCandidatesErrorResponse(error);
    }
}
