export const runtime = "nodejs";

import qs from "qs";
import { getSession } from "@/lib/auth";

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}

async function readBodySafe(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

function normalizeStrapiJob(job) {
    const j = job?.attributes
        ? {
            id: job.id,
            documentId: job.documentId ?? job.attributes?.documentId,
            ...job.attributes,
        }
        : job || {};

    return {
        id: j?.id ?? null,
        documentId: j?.documentId || "",
        companyName: j?.client?.companyName || "",
        title: j?.title || "",
        details: j?.details || [],
        referenceNo: j?.referenceNo || "",
        closingDate: j?.closingDate || "",
        location: j?.location || "",
        industeryList: j?.industeryList || "",
        jobType: j?.jobType || "",
        salary: j?.salary || "",
        statusList: j?.statusList || "",
        jobTypeList: j?.jobTypeList || "",
        vacanciesNo: j?.vacanciesNo || "",
        experience: j?.experience || "",
        shortDescription: j?.shortDescription || "",
        showToCandidateList: j?.showToCandidateList || "",
        createdAt: j?.createdAt || "",
        updatedAt: j?.updatedAt || "",
        publishedAt: j?.publishedAt || "",

        // ✅ IMPORTANT: send pipeline data to frontend
        assignCandidatesToJob: Array.isArray(j?.assignCandidatesToJob)
            ? j.assignCandidatesToJob.map((item) => ({
                id: item?.id ?? null,
                candidateProcessList: item?.candidateProcessList || "",
                candidate: item?.candidate
                    ? {
                        id: item.candidate?.id ?? null,
                        documentId: item.candidate?.documentId || "",
                        fullName: item.candidate?.fullName || "",
                        referenceNumber: item.candidate?.referenceNumber || "",
                    }
                    : null,
            }))
            : [],
    };
}

export async function GET(req) {
    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
    const RAW_TOKEN = String(
        process.env.STRAPI_TOKEN ||
        process.env.STRAPI_API_TOKEN ||
        ""
    ).trim();

    if (!STRAPI_BASE_URL || !RAW_TOKEN) {
        return Response.json(
            { ok: false, error: "Missing STRAPI_BASE_URL or STRAPI_TOKEN" },
            { status: 500 }
        );
    }

    const BEARER = RAW_TOKEN.toLowerCase().startsWith("bearer ")
        ? RAW_TOKEN
        : `Bearer ${RAW_TOKEN}`;

    async function strapiFetch(path, opts = {}) {
        const url = joinUrl(STRAPI_BASE_URL, path);
        const method = opts.method || "GET";

        const headers = {
            Authorization: BEARER,
            ...(opts.headers || {}),
        };

        let body = opts.body;
        if (opts.json !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(opts.json);
        }

        const res = await fetch(url, {
            method,
            headers,
            body,
            redirect: "manual",
            cache: "no-store",
        });

        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            const err = new Error(
                `Strapi redirect detected (${res.status}). Fix STRAPI_BASE_URL. location=${loc}`
            );
            err.status = 500;
            throw err;
        }

        const parsed = await readBodySafe(res);

        if (!res.ok) {
            const msg =
                parsed?.error?.message ||
                parsed?.message ||
                `Strapi error: ${res.status}`;
            const err = new Error(msg);
            err.details = parsed?.error || parsed;
            err.status = res.status;
            throw err;
        }

        return parsed;
    }

    try {
        const url = new URL(req.url);

        const session = await getSession();

        if (!session?.isLoggedIn || !session?.user) {
            return Response.json(
                { ok: false, error: "Authentication required" },
                { status: 401 }
            );
        }

        const roleName = String(session?.role || "").trim().toLowerCase();
        let clientDocumentId = "";

        if (roleName === "clients" || roleName === "client") {
            // Clients can only load jobs for their own authenticated account.
            clientDocumentId = String(session?.user?.documentId || "").trim();
        } else if (roleName === "staff") {
            // Staff select a client on /staff/client. The browser sends the
            // selected document ID in a request header, not in the page URL.
            clientDocumentId = String(
                req.headers.get("x-client-document-id") || ""
            ).trim();
        } else {
            return Response.json(
                { ok: false, error: "You do not have permission to view client jobs" },
                { status: 403 }
            );
        }

        const includeClosed =
            String(url.searchParams.get("includeClosed") || "0") === "1";

        const page = Math.max(1, Number(url.searchParams.get("page") || 1));
        const pageSizeRaw = Number(url.searchParams.get("pageSize") || 10);
        const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

        if (!clientDocumentId) {
            return Response.json(
                {
                    ok: false, error: roleName === "staff"
                        ? "No client was selected by staff"
                        : "Logged-in client document ID is missing"
                },
                { status: 400 }
            );
        }

        // Get client by documentId, then populate jobs
        const queryObj = {
            status: "published",
            filters: {
                documentId: {
                    $eq: clientDocumentId,
                },
            },
            populate: {
                jobs: {
                    sort: ["createdAt:desc"],
                    populate: {
                        client: {
                            fields: ["companyName", "documentId"],
                        },

                        // ✅ IMPORTANT: populate pipeline component
                        assignCandidatesToJob: true,
                    },
                },
            },
        };

        const query = qs.stringify(queryObj, { encodeValuesOnly: true });

        const parsed = await strapiFetch(`clients?${query}`, { method: "GET" });

        const clients = Array.isArray(parsed?.data) ? parsed.data : [];
        const clientRow = clients[0];

        if (!clientRow) {
            return Response.json(
                { ok: false, error: "Client not found" },
                { status: 404 }
            );
        }

        const client =
            clientRow?.attributes
                ? {
                    id: clientRow.id,
                    documentId: clientRow.documentId ?? clientRow.attributes?.documentId,
                    ...clientRow.attributes,
                }
                : clientRow;

        const jobsRaw = Array.isArray(client?.jobs) ? client.jobs : [];

        let jobs = jobsRaw.map((job) => {
            const normalized = normalizeStrapiJob(job);
            return {
                ...normalized,
                companyName: client?.companyName || normalized.companyName || "",
            };
        });

        if (!includeClosed) {
            jobs = jobs.filter(
                (job) => String(job?.statusList || "").trim().toLowerCase() === "open"
            );
        }

        const total = jobs.length;
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(page, pageCount);
        const start = (safePage - 1) * pageSize;
        const end = start + pageSize;

        const items = jobs.slice(start, end);

        return Response.json(
            {
                ok: true,
                client: {
                    id: client?.id ?? null,
                    documentId: client?.documentId || "",
                    companyName: client?.companyName || "",
                },
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