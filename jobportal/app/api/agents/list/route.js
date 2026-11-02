export const runtime = "nodejs";
import qs from "qs";
import { requireAuth } from "@/lib/requireAuth";

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
    if (item.attributes) {
        return {
            id: item.id,
            documentId: item.documentId ?? item.attributes?.documentId,
            ...item.attributes,
        };
    }
    return item;
}

function getUserFields(agent) {
    const d =
        agent?.users_permissions_user?.data ??
        agent?.users_permissions_user ??
        null;

    const attrs = d?.attributes ?? d;

    return {
        id: d?.id ?? null,
        username: attrs?.username ?? "",
        email: attrs?.email ?? "",
    };
}

export async function GET(req) {
    // Security: staff-only. Reject unauthenticated / non-staff callers.
    const auth = await requireAuth(["staff"]);
    if (!auth.ok) return auth.response;

    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
    const RAW_TOKEN = String(process.env.STRAPI_TOKEN || "").trim();

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

        const page = Math.max(1, Number(url.searchParams.get("page") || 1));
        const pageSizeRaw = Number(url.searchParams.get("pageSize") || 15);
        const pageSize = Math.min(50, Math.max(1, pageSizeRaw));
        const q = String(url.searchParams.get("q") || "").trim();

        const queryObj = {
            status: "published",
            sort: ["createdAt:desc"],
            pagination: { page, pageSize },
            populate: {
                users_permissions_user: true,
            },
        };

        if (q) {
            queryObj.filters = {
                $or: [
                    { companyName: { $containsi: q } },
                    { contactName: { $containsi: q } },
                    { designation: { $containsi: q } },
                    { city: { $containsi: q } },
                    { address: { $containsi: q } },
                    { phone: { $containsi: q } },
                    { webiste: { $containsi: q } },
                    { countryList: { $containsi: q } },
                    { statusList: { $containsi: q } },
                    { users_permissions_user: { username: { $containsi: q } } },
                    { users_permissions_user: { email: { $containsi: q } } },
                ],
            };
        }

        const query = qs.stringify(queryObj, { encodeValuesOnly: true });

        const parsed = await strapiFetch(`agents?${query}`, {
            method: "GET",
            useAuth: true,
        });

        const pagination = parsed?.meta?.pagination || {};
        const data = Array.isArray(parsed?.data) ? parsed.data : [];

        const items = data.map((it) => {
            const a = unwrapCollectionItem(it) || {};
            const user = getUserFields(a);
            const documentId = a?.documentId || it?.documentId || a?.id || it?.id;

            return {
                id: a?.id ?? it?.id ?? null,
                documentId: documentId ? String(documentId) : "",

                companyName: a?.companyName || "",
                contactName: a?.contactName || "",
                designation: a?.designation || "",
                city: a?.city || "",
                address: a?.address || "",
                phone: a?.phone || "",
                webiste: a?.webiste || "",
                countryList: a?.countryList || "",
                statusList: a?.statusList || "",
                username: user.username || "",
                email: user.email || "",
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
            {
                ok: false,
                error: err?.message || "Server error",
                details: err?.details || null,
            },
            { status: err?.status || 500 }
        );
    }
}
