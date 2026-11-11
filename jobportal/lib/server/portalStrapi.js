// Server-only access to the portal's own Strapi, with the server API token.
// Used by the Recruitly import routes. Never import from a "use client" file.
import qs from "qs";

// Strapi returns at most 100 rows per request (config/api.ts maxLimit).
const STRAPI_PAGE_SIZE = 100;
const MAX_STRAPI_PAGES = 100;

export class PortalStrapiError extends Error {
    constructor(message, { status = 0 } = {}) {
        super(message);
        this.name = "PortalStrapiError";
        this.status = status;
    }
}

function config() {
    const base = String(process.env.STRAPI_BASE_URL || "").replace(/\/+$/, "");
    const token = String(process.env.STRAPI_TOKEN || "").trim();

    if (!base || !token) {
        throw new PortalStrapiError("STRAPI_BASE_URL or STRAPI_TOKEN is not set.", { status: 500 });
    }

    return { base, token };
}

export async function strapiRequest(path, { method = "GET", query, body } = {}) {
    const { base, token } = config();
    const search = query ? `?${qs.stringify(query, { encodeValuesOnly: true })}` : "";

    const res = await fetch(`${base}${path}${search}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
        throw new PortalStrapiError(json?.error?.message || `Strapi returned ${res.status} for ${path}.`, {
            status: res.status,
        });
    }

    return json;
}

// Every row of a collection, 100 per request, published versions only.
export async function strapiFetchAll(path, query = {}) {
    const rows = [];

    for (let page = 1; page <= MAX_STRAPI_PAGES; page += 1) {
        const json = await strapiRequest(path, {
            query: { status: "published", ...query, pagination: { page, pageSize: STRAPI_PAGE_SIZE } },
        });

        rows.push(...(Array.isArray(json?.data) ? json.data : []));

        const pageCount = Number(json?.meta?.pagination?.pageCount) || 1;
        if (page >= pageCount) break;
    }

    return rows;
}
