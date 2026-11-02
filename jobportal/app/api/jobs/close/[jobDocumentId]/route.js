import { CreateNotification } from "@/lib/server/notification";

export const runtime = "nodejs";

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

export async function POST(req, { params }) {
    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
    const RAW_TOKEN = String(process.env.STRAPI_TOKEN || "").trim();

    if (!STRAPI_BASE_URL || !RAW_TOKEN) {
        return Response.json({ ok: false, error: "Missing STRAPI_BASE_URL or STRAPI_TOKEN" }, { status: 500 });
    }

    const BEARER = RAW_TOKEN.toLowerCase().startsWith("bearer ") ? RAW_TOKEN : `Bearer ${RAW_TOKEN}`;

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

        const res = await fetch(url, { method, headers, body, redirect: "manual", cache: "no-store" });

        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            const err = new Error(`Strapi redirect detected (${res.status}). Fix STRAPI_BASE_URL. location=${loc}`);
            err.status = 500;
            throw err;
        }

        const parsed = await readBodySafe(res);

        if (!res.ok) {
            const msg = parsed?.error?.message || parsed?.message || `Strapi error: ${res.status}`;
            const err = new Error(msg);
            err.details = parsed?.error || parsed;
            err.status = res.status;
            throw err;
        }

        return parsed;
    }

    try {
        const p = params ? await params : null; // Next 15 pattern (same as your getclient route) :contentReference[oaicite:6]{index=6}
        const jobDocumentId = p?.jobDocumentId;

        if (!jobDocumentId) {
            return Response.json({ ok: false, error: "Missing jobDocumentId" }, { status: 400 });
        }

        const updated = await strapiFetch(`jobs/${jobDocumentId}?status=published`, {
            method: "PUT",
            json: { data: { statusList: "closed" } },
        });


        console.log("Closed Job", updated);

        await CreateNotification({
            title: "Job Closed (" + updated.title + ")",
            details: "A job has been closed. Job Title: " + updated.title + " Reference No.: " + updated.referenceNo,
            email: true,
        });


        return Response.json({ ok: true, updated }, { status: 200 });
    } catch (err) {
        return Response.json(
            { ok: false, error: err?.message || "Server error", details: err?.details || null },
            { status: err?.status || 500 }
        );
    }
}