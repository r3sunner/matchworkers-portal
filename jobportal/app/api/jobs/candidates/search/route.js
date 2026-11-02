export const runtime = "nodejs";

import qs from "qs";

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}


function strapiPublicBase() {
    return (process.env.NEXT_PUBLIC_STRAPI_PUBLIC_URL || "")
        .trim()
        .replace(/\/$/, "");
}


async function readBodySafe(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

async function strapiFetch(path, { method = "GET", body, useAuth = true } = {}) {
    const STRAPI_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
    const STRAPI_TOKEN = process.env.STRAPI_TOKEN || "";

    const url = joinUrl(STRAPI_BASE_URL, path);
    const headers = { "Content-Type": "application/json" };
    if (useAuth && STRAPI_TOKEN) headers.Authorization = `Bearer ${STRAPI_TOKEN}`;

    const res = await fetch(url, {
        method,
        headers,
        cache: "no-store",
        body: body ? JSON.stringify(body) : undefined,
    });

    const json = await readBodySafe(res);
    if (!res.ok) {
        const msg = json?.error?.message || json?.message || `Strapi error ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.details = json;
        throw err;
    }
    return json;
}

function normalizeStrapiMedia(media) {
    const base = strapiPublicBase();

    // handle both formats (media.data or media)
    const m = media?.data ?? media;
    const attrs = m?.attributes ?? m;

    const url = attrs?.url || "";

    // convert relative URL to full URL
    const abs =
        url && !url.startsWith("http")
            ? `${base}${url}`
            : url;

    return { url: abs };
}

function unwrapCollectionItem(it) {
    const a = it?.attributes ?? it;
    return { id: it?.id ?? a?.id ?? null, documentId: a?.documentId ?? it?.documentId ?? "", ...a };
}

export async function GET(req) {
    try {
        const u = new URL(req.url);
        const q = (u.searchParams.get("q") || "").trim();
        const page = Math.max(1, Number(u.searchParams.get("page") || 1));
        const pageSize = Math.max(1, Math.min(50, Number(u.searchParams.get("pageSize") || 12)));

        const queryObj = {
            sort: ["createdAt:desc"],
            pagination: { page, pageSize },
            fields: ["documentId", "referenceNumber", "fullName", "firstName", "lastName", "nationalityList", "genderList", "isProfileVerifiedList", "shortSummary"],
            populate: { profileImage: { fields: ["url", "name"] } },
        };

        if (q) {
            queryObj.filters = {
                $or: [
                    { fullName: { $containsi: q } },
                    { referenceNumber: { $containsi: q } },
                    { nationality: { $containsi: q } },
                    { gender: { $containsi: q } },
                ],
            };
        }

        const query = qs.stringify(queryObj, { encodeValuesOnly: true });
        const parsed = await strapiFetch(`candidates?${query}`, { method: "GET", useAuth: true });

        const pagination = parsed?.meta?.pagination || {};
        const data = Array.isArray(parsed?.data) ? parsed.data : [];

        const items = data.map((it) => {
            const c = unwrapCollectionItem(it);
            const img = normalizeStrapiMedia(c?.profileImage);
            return {
                id: c?.id ?? null,
                documentId: String(c?.documentId || ""),
                referenceNumber: c?.referenceNumber || "",
                fullName: c?.fullName || [c?.firstName, c?.lastName].filter(Boolean).join(" "),
                nationality: c?.nationality || "",
                gender: c?.gender || "",
                isProfileVerified: !!c?.isProfileVerified,
                avatar: img.url || "https://placehold.net/avatar.svg",
                summary: c?.shortSummary || "",
            };
        });

        return Response.json(
            {
                ok: true,
                page: pagination.page ?? page,
                pageSize: pagination.pageSize ?? pageSize,
                pageCount: pagination.pageCount ?? 1,
                total: pagination.total ?? items.length,
                items,
            },
            { status: 200 }
        );
    } catch (err) {
        return Response.json(
            { ok: false, error: err?.message || "Server error", details: err?.details || null },
            { status: err?.status || 500 }
        );
    }
}