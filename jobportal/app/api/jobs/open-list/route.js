export const runtime = "nodejs";

import qs from "qs";

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}

function strapiOrigin(apiBase) {
    return String(apiBase || "").replace(/\/api\/?$/, "").replace(/\/+$/, "");
}

function mediaUrl(file, apiBase) {
    const url = file?.url || file?.attributes?.url || "";
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `${strapiOrigin(apiBase)}${url}`;
}

async function readBodySafe(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

function processKey(status) {
    const s = String(status || "").toLowerCase();
    if (s.includes("suggest")) return "suggested";
    if (s.includes("shortlist")) return "shortlisted";
    // "interviewed" must be checked before "interview".
    if (s === "interviewed") return "interviewed";
    if (s.includes("interview")) return "requestedInterview";
    if (s.includes("hired")) return "hired";
    if (s.includes("immigration")) return "immigration";
    if (s.includes("placed")) return "placed";
    return "suggested";
}

function normalizeCandidate(row, status, apiBase) {
    const c = row?.attributes
        ? {
            id: row.id,
            documentId: row.documentId ?? row.attributes?.documentId,
            ...row.attributes,
        }
        : row || {};

    return {
        id: c?.id ?? null,
        documentId: c?.documentId || "",
        fullName: c?.fullName || "",
        referenceNumber: c?.referenceNumber || "",
        avatar: mediaUrl(c?.profileImage, apiBase),
        currentPipelineStatus: status || "",
    };
}

function normalizeJob(row, apiBase) {
    const j = row?.attributes
        ? {
            id: row.id,
            documentId: row.documentId ?? row.attributes?.documentId,
            ...row.attributes,
        }
        : row || {};

    const client = j?.client?.attributes
        ? {
            id: j.client.id,
            documentId: j.client.documentId ?? j.client.attributes?.documentId,
            ...j.client.attributes,
        }
        : j?.client || null;

    const assigned = Array.isArray(j?.assignCandidatesToJob)
        ? j.assignCandidatesToJob
        : [];

    const pipeline = {
        suggested: 0,
        shortlisted: 0,
        requestedInterview: 0,
        interviewed: 0,
        hired: 0,
        immigration: 0,
        placed: 0,
    };

    const pipelineCandidates = {
        suggested: [],
        shortlisted: [],
        requestedInterview: [],
        interviewed: [],
        hired: [],
        immigration: [],
        placed: [],
    };

    for (const item of assigned) {
        const status = item?.candidateProcessList || "";
        const key = processKey(status);

        pipeline[key] += 1;

        if (item?.candidate) {
            pipelineCandidates[key].push(
                normalizeCandidate(item.candidate, status, apiBase)
            );
        }
    }

    return {
        id: j?.id ?? null,
        documentId: j?.documentId || "",
        title: j?.title || "",
        referenceNo: j?.referenceNo || "",
        clientName: client?.companyName || "",
        clientDocumentId: client?.documentId || "",
        location: j?.location || "",
        createdAt: j?.createdAt || "",
        closingDate: j?.closingDate || "",
        vacanciesNo: j?.vacanciesNo ?? "",
        experience: j?.experience || "",
        statusList: j?.statusList || "",
        pipeline,
        pipelineCandidates,
    };
}

export async function GET(req) {
    try {
        const STRAPI_BASE_URL =
            process.env.STRAPI_BASE_URL || process.env.STRAPI_URL;

        const RAW_TOKEN = String(
            process.env.STRAPI_TOKEN || process.env.STRAPI_API_TOKEN || ""
        ).trim();

        if (!STRAPI_BASE_URL) {
            return Response.json(
                { ok: false, error: "Missing STRAPI_BASE_URL" },
                { status: 500 }
            );
        }

        const bearer = RAW_TOKEN
            ? RAW_TOKEN.toLowerCase().startsWith("bearer ")
                ? RAW_TOKEN
                : `Bearer ${RAW_TOKEN}`
            : "";

        const url = new URL(req.url);

        const page = Math.max(1, Number(url.searchParams.get("page") || 1));
        const pageSizeRaw = Number(url.searchParams.get("pageSize") || 20);
        const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

        const search = String(url.searchParams.get("search") || "").trim();
        const fromDate = String(url.searchParams.get("fromDate") || "").trim();
        const toDate = String(url.searchParams.get("toDate") || "").trim();

        const filters = {
            statusList: { $eqi: "Open" },
        };

        if (search) {
            filters.$or = [
                { title: { $containsi: search } },
                { referenceNo: { $containsi: search } },
                { client: { companyName: { $containsi: search } } },
            ];
        }

        if (fromDate || toDate) {
            filters.createdAt = {};
            if (fromDate) filters.createdAt.$gte = `${fromDate}T00:00:00.000Z`;
            if (toDate) filters.createdAt.$lte = `${toDate}T23:59:59.999Z`;
        }

        const queryObj = {
            status: "published",
            filters,
            sort: ["createdAt:desc"],
            pagination: { page, pageSize },
            populate: {
                client: {
                    fields: ["companyName", "documentId"],
                },
                assignCandidatesToJob: {
                    populate: {
                        candidate: {
                            fields: ["fullName", "referenceNumber", "documentId"],
                            populate: {
                                profileImage: true,
                            },
                        },
                    },
                },
            },
        };

        const query = qs.stringify(queryObj, { encodeValuesOnly: true });

        const res = await fetch(joinUrl(STRAPI_BASE_URL, `jobs?${query}`), {
            method: "GET",
            headers: {
                ...(bearer ? { Authorization: bearer } : {}),
            },
            cache: "no-store",
        });

        const json = await readBodySafe(res);

        if (!res.ok) {
            return Response.json(
                {
                    ok: false,
                    error: json?.error?.message || json?.message || "Strapi GET failed",
                    details: json,
                },
                { status: res.status }
            );
        }

        const rows = Array.isArray(json?.data) ? json.data : [];
        const items = rows.map((row) => normalizeJob(row, STRAPI_BASE_URL));
        const pagination = json?.meta?.pagination || {};

        return Response.json({
            ok: true,
            page: pagination.page || page,
            pageSize: pagination.pageSize || pageSize,
            pageCount: pagination.pageCount || 1,
            total: pagination.total || items.length,
            items,
        });
    } catch (e) {
        return Response.json(
            { ok: false, error: e?.message || "Server error" },
            { status: 500 }
        );
    }
}