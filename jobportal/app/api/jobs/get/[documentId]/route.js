export const runtime = "nodejs";

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

export async function GET(_req, { params }) {
    try {
        // ✅ Next.js 15: params can be Promise
        const p = await params;
        const documentId = p?.documentId;

        if (!documentId) {
            return Response.json({ ok: false, error: "Missing documentId" }, { status: 400 });
        }

        const STRAPI_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
        const STRAPI_API_TOKEN = process.env.STRAPI_TOKEN || "";

        if (!STRAPI_BASE_URL) {
            return Response.json({ ok: false, error: "Missing STRAPI_BASE_URL" }, { status: 500 });
        }

        const url = joinUrl(
            STRAPI_BASE_URL,
            `/jobs/${encodeURIComponent(documentId)}?status=published&populate=*`
        );

        const res = await fetch(url, {
            method: "GET",
            headers: {
                ...(STRAPI_API_TOKEN ? { Authorization: `Bearer ${STRAPI_API_TOKEN}` } : {}),
            },
            cache: "no-store",
        });

        const json = await readBodySafe(res);
        if (!res.ok) {
            return Response.json(
                { ok: false, error: "Strapi GET failed", details: json },
                { status: res.status }
            );
        }

        const data = json?.data || null;
        const attrs = data?.attributes || data || {};
        const item = {
            documentId: data?.documentId || attrs?.documentId || documentId,
            id: data?.id || null,
            ...attrs,
        };

        return Response.json({ ok: true, item }, { status: 200 });
    } catch (e) {
        return Response.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
    }
}