export const runtime = "nodejs";
import qs from "qs";

/* ----------------------------- helpers ---------------------------- */

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

function normalizeStrapiMedia(media, STRAPI_BASE_URL) {
    const m = media?.data ?? media;
    const attrs = m?.attributes ?? m;

    const id = m?.id ?? null;
    const name = attrs?.name ?? "";
    const url = attrs?.url ?? "";

    const origin = String(STRAPI_BASE_URL || "").replace(/\/api\/?$/, "");
    const absUrl = url ? (url.startsWith("http") ? url : joinUrl(origin, url)) : "";

    return { id, name, url: absUrl };
}

function unwrapOne(parsed) {
    const rec = parsed?.data ?? null;
    if (!rec) return null;
    return rec?.attributes ? { id: rec.id, documentId: rec.documentId, ...rec.attributes } : rec;
}

function getUserFromRelation(staff) {
    const rel = staff?.users_permissions_user;
    const d = rel?.data ?? rel;
    const attrs = d?.attributes ?? d;

    return {
        id: d?.id ?? null,
        username: attrs?.username ?? "",
        email: attrs?.email ?? "",
    };
}

/* ----------------------------- route ------------------------------ */

export async function GET(req, { params }) {
    const STRAPI_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
    const RAW_TOKEN = process.env.STRAPI_TOKEN || "";

    if (!STRAPI_BASE_URL || !RAW_TOKEN) {
        return Response.json({ ok: false, error: "Missing STRAPI_BASE_URL or STRAPI_TOKEN" }, { status: 500 });
    }

    const BEARER = RAW_TOKEN.toLowerCase().startsWith("bearer ") ? RAW_TOKEN : `Bearer ${RAW_TOKEN}`;

    async function strapiFetch(path, opts = {}) {
        const url = joinUrl(STRAPI_BASE_URL, path);
        const method = opts.method || "GET";
        const useAuth = opts.useAuth !== false;

        const headers = {
            ...(useAuth ? { Authorization: BEARER } : {}),
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
            const err = new Error(`Strapi redirect detected (${res.status}). Fix STRAPI_BASE_URL. location=${loc}`);
            err.status = 500;
            throw err;
        }

        const parsed = await readBodySafe(res);

        if (!res.ok) {
            console.log("STRAPI ERROR", {
                url,
                status: res.status,
                hasAuth: !!headers.Authorization,
                authPreview: headers.Authorization ? headers.Authorization.slice(0, 18) + "..." : null,
                bodyError: parsed,
            });

            const msg = parsed?.error?.message || parsed?.message || `Strapi error: ${res.status}`;
            const err = new Error(msg);
            err.details = parsed?.error || parsed;
            err.status = res.status;
            throw err;
        }

        return parsed;
    }

    try {
        const p = params ? await params : null; // Next 15
        const documentId = p?.documentId;

        if (!documentId) {
            return Response.json({ ok: false, error: "Missing documentId param" }, { status: 400 });
        }

        const query = qs.stringify(
            {
                status: "published",
                populate: {
                    image: true,
                    users_permissions_user: true,
                },
            },
            { encodeValuesOnly: true }
        );

        const parsed = await strapiFetch(`staffs/${documentId}?${query}`, { method: "GET", useAuth: true });

        const staff = unwrapOne(parsed);
        if (!staff) {
            return Response.json({ ok: false, error: "Staff not found", parsed }, { status: 404 });
        }

        const user = getUserFromRelation(staff);

        const existingMedia = {
            image: normalizeStrapiMedia(staff?.image, STRAPI_BASE_URL),
        };

        const formDefaults = {
            fullName: staff?.fullName || "",
            mobile: staff?.mobile || "",
            designation: staff?.designation || "",

            image: null,

            username: user?.username || "",
            email: user?.email || "",

            password: "",
            retypePassword: "",
        };

        return Response.json(
            { ok: true, documentId, existingMedia, formDefaults, staff: parsed },
            { status: 200 }
        );
    } catch (err) {
        return Response.json(
            { ok: false, error: err?.message || "Server error", details: err?.details || null },
            { status: err?.status || 500 }
        );
    }
}