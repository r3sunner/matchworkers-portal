export const runtime = "nodejs";

import qs from "qs";
import { assertJobAccess } from "@/app/api/jobs/_lib/jobAccess";

function joinUrl(base, path) {
    return `${String(base || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}

function strapiOrigin(apiBase) {
    return String(apiBase || "").replace(/\/api\/?$/, "").replace(/\/+$/, "");
}

function fileUrl(file, apiBase) {
    const f = file?.attributes ? { id: file.id, ...file.attributes } : file || {};
    const url = f?.url || "";
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

function getBearer() {
    const raw = String(process.env.STRAPI_TOKEN || "").trim();
    return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
}

function normalize(row) {
    return row?.attributes
        ? { id: row.id, documentId: row.documentId, ...row.attributes }
        : row || {};
}

function normalizeChat(row) {
    const c = normalize(row);
    return {
        id: c?.id ?? null,
        documentId: c?.documentId || "",
        message: c?.message || "",
        private: !!c?.private,
        isSystemGenerated: !!c?.isSystemGenerated,
        history: c?.history || "",
        personName: c?.personName || "",
        createdAt: c?.createdAt || "",
        updatedAt: c?.updatedAt || "",
    };
}

function normalizeOfferLetter(file, apiBase) {
    const f = normalize(file);
    if (!f?.id && !f?.url && !f?.name) return null;

    return {
        id: f?.id ?? null,
        documentId: f?.documentId || "",
        name: f?.name || "Offer Letter",
        url: fileUrl(file, apiBase),
    };
}

export async function GET(req) {
    try {
        const STRAPI_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
        const url = new URL(req.url);

        const jobDocumentId = String(url.searchParams.get("jobDocumentId") || "").trim();
        const candidateDocumentId = String(url.searchParams.get("candidateDocumentId") || "").trim();

        if (!jobDocumentId || !candidateDocumentId) {
            return Response.json({ ok: false, error: "Missing jobDocumentId or candidateDocumentId" }, { status: 400 });
        }

        await assertJobAccess(jobDocumentId);

        const query = qs.stringify(
            {
                status: "published",
                populate: {
                    assignCandidatesToJob: {
                        populate: {
                            candidate: {
                                fields: ["documentId", "fullName", "referenceNumber"],
                            },
                            offerLetter: true,
                            pipline_chats: {
                                sort: ["createdAt:asc"],
                                populate: {
                                    staff: {
                                        fields: ["fullName", "documentId"],
                                    },

                                    client: {
                                        fields: ["companyName", "documentId"],
                                    },
                                },
                            },
                        },
                    },
                },
            },
            { encodeValuesOnly: true }
        );

        const res = await fetch(
            joinUrl(STRAPI_BASE_URL, `jobs/${encodeURIComponent(jobDocumentId)}?${query}`),
            {
                headers: { Authorization: getBearer() },
                cache: "no-store",
            }
        );

        const json = await readBodySafe(res);

        if (!res.ok) {
            return Response.json(
                { ok: false, error: "Failed to load job pipeline details", details: json },
                { status: res.status }
            );
        }

        const job = normalize(json?.data);
        const assigned = Array.isArray(job?.assignCandidatesToJob) ? job.assignCandidatesToJob : [];

        const item = assigned.find((x) => {
            const c = normalize(x?.candidate);
            return String(c?.documentId) === String(candidateDocumentId);
        });

        if (!item) {
            return Response.json({ ok: false, error: "Candidate not found in this job pipeline" }, { status: 404 });
        }

        return Response.json({
            ok: true,
            currentPipelineStatus: item?.candidateProcessList || "",
            offerLetter: normalizeOfferLetter(item?.offerLetter, STRAPI_BASE_URL),
            chats: Array.isArray(item?.pipline_chats)
                ? item.pipline_chats.map(normalizeChat)
                : [],
        });
    } catch (e) {
        return Response.json({ ok: false, error: e?.message || "Server error" }, { status: e?.status || 500 });
    }
}