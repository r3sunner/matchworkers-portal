export const runtime = "nodejs";
import qs from "qs";

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}

async function readBodySafe(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

function unwrapCollectionItem(item) {
    if (!item) return null;
    if (item.attributes) return { id: item.id, documentId: item.documentId ?? item.attributes?.documentId, ...item.attributes };
    return item;
}

export async function GET() {
    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
    const RAW_TOKEN = String(process.env.STRAPI_TOKEN || process.env.API_TOKEN || "").trim();

    if (!STRAPI_BASE_URL || !RAW_TOKEN) {
        return Response.json(
            { ok: false, error: "Missing STRAPI_BASE_URL/NEXT_PUBLIC_API_BASE_URL or STRAPI_TOKEN/API_TOKEN" },
            { status: 500 }
        );
    }

    const BEARER = RAW_TOKEN.toLowerCase().startsWith("bearer ") ? RAW_TOKEN : `Bearer ${RAW_TOKEN}`;

    async function strapiFetch(path, opts = {}) {
        const url = joinUrl(STRAPI_BASE_URL, path);
        const headers = {
            Authorization: BEARER,
            ...(opts.headers || {}),
        };

        const res = await fetch(url, {
            method: opts.method || "GET",
            headers,
            redirect: "manual",
            cache: "no-store",
        });

        const parsed = await readBodySafe(res);

        if (!res.ok) {
            const msg = parsed?.error?.message || parsed?.message || `Strapi error: ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            err.details = parsed?.error || parsed;
            throw err;
        }

        return parsed;
    }

    try {
        const query = qs.stringify(
            {
                status: "published",
                sort: ["companyName:asc"],
                pagination: { page: 1, pageSize: 500 },

            },
            { encodeValuesOnly: true }
        );

        const parsed = await strapiFetch(`agents?${query}`);
        const data = Array.isArray(parsed?.data) ? parsed.data : [];

        const items = data.map((it) => {
            const a = unwrapCollectionItem(it) || {};
            return {
                id: a.id ?? it?.id ?? null,
                documentId: String(a.documentId || it?.documentId || ""),
                companyName: a.companyName || "",
                contactName: a.contactName || "",
                city: a.city || "",
                statusList: a.statusList || "",
                label: a.companyName || a.contactName || a.documentId || "",
            };
        }).filter((a) => a.documentId);

        return Response.json({ ok: true, items }, { status: 200 });
    } catch (error) {
        return Response.json(
            { ok: false, error: error?.message || "Failed to fetch agents", details: error?.details || null },
            { status: error?.status || 500 }
        );
    }
}
