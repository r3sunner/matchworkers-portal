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

    const url = attrs?.url ?? "";
    const name = attrs?.name ?? "";
    const id = m?.id ?? null;

    const origin = String(STRAPI_BASE_URL || "").replace(/\/api\/?$/, "");
    const absUrl = url ? (url.startsWith("http") ? url : joinUrl(origin, url)) : "";

    return { id, name, url: absUrl };
}

function unwrapCollectionItem(item) {
    if (!item) return null;
    if (item.attributes) return { id: item.id, documentId: item.documentId ?? item.attributes?.documentId, ...item.attributes };
    return item;
}

function relArray(rel) {
    const data = Array.isArray(rel) ? rel : rel?.data;
    return Array.isArray(data) ? data : [];
}

function getUserFields(candidate) {
    const d = candidate?.users_permissions_user?.data ?? candidate?.users_permissions_user ?? null;
    const attrs = d?.attributes ?? d;
    return {
        id: d?.id ?? null,
        username: attrs?.username ?? "",
        email: attrs?.email ?? "",
    };
}


function getAgentFields(candidate) {
    const d = candidate?.agent?.data ?? candidate?.agent ?? null;
    const attrs = d?.attributes ?? d;

    return {
        id: d?.id ?? null,
        documentId: d?.documentId ?? attrs?.documentId ?? "",
        companyName: attrs?.companyName ?? "",
        contactName: attrs?.contactName ?? "",
    };
}

function getJobRoleTitles(candidate) {
    const arr = relArray(candidate?.job_roles);
    return arr
        .map((x) => {
            const attrs = x?.attributes ?? x;
            return attrs?.title ?? attrs?.name ?? "";
        })
        .filter(Boolean);
}

/* ----------------------------- route ------------------------------ */

export async function GET(req) {

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
            console.log("STRAPI ERROR", {
                url,
                status: res.status,
                hasAuth: !!headers.Authorization,
                authPreview: headers.Authorization
                    ? headers.Authorization.slice(0, 18) + "..."
                    : null,
                bodyError: parsed,
            });

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
        const agentFilter = String(url.searchParams.get("agent") || "all").trim();

        const queryObj = {
            status: "published",
            sort: ["createdAt:desc"],
            pagination: { page, pageSize },
            populate: {
                profileImage: true,
                CV: true,
                passport: true,
                users_permissions_user: true,
                job_roles: true,
                agent: true,
                documents: {
                    populate: {
                        file: true,
                    },
                },
            },
        };

        const andFilters = [];

        if (q) {
            andFilters.push({
                $or: [
                    { referenceNumber: { $containsi: q } },
                    { fullName: { $containsi: q } },
                    { firstName: { $containsi: q } },
                    { lastName: { $containsi: q } },
                    { mobile: { $containsi: q } },
                    { nationalityList: { $containsi: q } },
                    { jobStatus: { $containsi: q } },
                    { workingVideoLink: { $containsi: q } },
                    { miScreeningVideoLink: { $containsi: q } },
                    { users_permissions_user: { username: { $containsi: q } } },
                    { users_permissions_user: { email: { $containsi: q } } },
                    { job_roles: { title: { $containsi: q } } },
                    { agent: { companyName: { $containsi: q } } },
                    { agent: { contactName: { $containsi: q } } },

                ],
            });
        }

        if (agentFilter && agentFilter !== "all") {
            if (agentFilter === "none") {
                andFilters.push({ agent: { id: { $null: true } } });
            } else {
                andFilters.push({ agent: { documentId: { $eq: agentFilter } } });
            }
        }

        if (andFilters.length === 1) {
            queryObj.filters = andFilters[0];
        } else if (andFilters.length > 1) {
            queryObj.filters = { $and: andFilters };
        }

        const query = qs.stringify(queryObj, { encodeValuesOnly: true });

        const parsed = await strapiFetch(`candidates?${query}`, { method: "GET", useAuth: true });

        const pagination = parsed?.meta?.pagination || {};
        const data = Array.isArray(parsed?.data) ? parsed.data : [];

        const items = data.map((it) => {
            const c = unwrapCollectionItem(it) || {};
            const user = getUserFields(c);
            const profile = normalizeStrapiMedia(c?.profileImage, STRAPI_BASE_URL);
            const roles = getJobRoleTitles(c);
            const agent = getAgentFields(c);

            const documentId = c?.documentId || it?.documentId || c?.id || it?.id;

            return {
                id: c?.id ?? it?.id ?? null,
                documentId: documentId ? String(documentId) : "",
                referenceNumber: c?.referenceNumber || "",
                fullName: c?.fullName || "",
                firstName: c?.firstName || "",
                lastName: c?.lastName || "",
                mobile: c?.mobile || "",
                email: user.email || c?.email || "",
                username: user.username || c?.username || "",
                nationalityList: c?.nationalityList || "",
                jobStatus: c?.jobStatus || "",
                isProfileVerifiedList: c?.isProfileVerifiedList || "",
                agentId: agent.id,
                agentDocumentId: agent.documentId,
                agentName: agent.companyName || agent.contactName || "",
                workingVideoLink: c?.workingVideoLink || "",
                miScreeningVideoLink: c?.miScreeningVideoLink || "",
                profileImageUrl: profile.url || "",
                job_roles: roles,
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