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

function unwrapAgent(parsed) {
    const rec = parsed?.data ?? null;
    if (!rec) return null;
    return rec?.attributes ? { id: rec.id, documentId: rec.documentId ?? rec.attributes?.documentId, ...rec.attributes } : rec;
}

function getUserFromRelation(agent) {
    const rel = agent?.users_permissions_user;
    const d = rel?.data ?? rel;
    const attrs = d?.attributes ?? d;

    return {
        id: d?.id ?? null,
        username: attrs?.username ?? "",
        email: attrs?.email ?? "",
    };
}

function mapContacts(agent) {
    const list = Array.isArray(agent?.contactList) ? agent.contactList : [];
    return list.map((c) => ({
        name: c?.name || "",
        designation: c?.designation || "",
        mobile: c?.mobile || "",
        remarks: c?.remarks || "",
    }));
}

export async function GET(req, { params }) {
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
        const p = params ? await params : null;
        const documentId = p?.documentId;

        if (!documentId) {
            return Response.json(
                { ok: false, error: "Missing documentId param" },
                { status: 400 }
            );
        }

        const query = qs.stringify(
            {
                populate: {
                    contactList: true,
                    users_permissions_user: true,
                },
            },
            { encodeValuesOnly: true }
        );

        const parsed = await strapiFetch(`agents/${documentId}?${query}`, {
            method: "GET",
            useAuth: true,
        });

        const agent = unwrapAgent(parsed);
        if (!agent) {
            return Response.json(
                { ok: false, error: "Agent not found", parsed },
                { status: 404 }
            );
        }

        const user = getUserFromRelation(agent);

        const formDefaults = {
            companyName: agent?.companyName || "",
            contactName: agent?.contactName || "",
            designation: agent?.designation || "",
            city: agent?.city || "",
            address: agent?.address || "",
            phone: agent?.phone || "",
            webiste: agent?.webiste || "",

            countryList: agent?.countryList || "",
            statusList: agent?.statusList || "",

            shortDescription: agent?.shortDescription || "",
            privateNote: agent?.privateNote || "",

            contactList: mapContacts(agent),

            username: user?.username || "",
            email: user?.email || "",

            password: "",
            retypePassword: "",
        };

        return Response.json(
            { ok: true, documentId, formDefaults, agent: parsed },
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
