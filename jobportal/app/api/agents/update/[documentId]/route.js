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

function cleanString(v) {
    return String(v || "").trim();
}

export async function POST(req, { params } = {}) {
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

    function buildAgentUpdate(payload, userId) {
        return {
            companyName: payload.companyName || "",
            contactName: payload.contactName || "",
            designation: payload.designation || "",
            city: payload.city || "",
            address: payload.address || "",
            phone: payload.phone || "",
            webiste: payload.webiste || payload.website || "",

            countryList: payload.countryList || "",
            statusList: payload.statusList || "Active",

            shortDescription: payload.shortDescription || "",
            privateNote: payload.privateNote || "",

            contactList: Array.isArray(payload?.contactList) ? payload.contactList : [],

            ...(userId ? { users_permissions_user: userId } : {}),
        };
    }

    try {
        const p = params ? await params : null;
        const documentId = p?.documentId || p?.documentid;

        if (!documentId) {
            return Response.json({ ok: false, error: "Missing documentId param" }, { status: 400 });
        }

        const incoming = await req.formData();

        const dataStr = incoming.get("data");
        if (!dataStr) {
            return Response.json({ ok: false, error: "Missing data field" }, { status: 400 });
        }

        let payload;
        try {
            payload = JSON.parse(String(dataStr));
        } catch {
            return Response.json({ ok: false, error: "Invalid JSON in data field" }, { status: 400 });
        }

        const existing = await strapiFetch(
            `agents/${documentId}?status=published&populate[users_permissions_user]=true`,
            { method: "GET", useAuth: true }
        );

        const existingRec = existing?.data?.attributes
            ? { ...existing.data.attributes, id: existing.data.id }
            : (existing?.data || existing);

        const existingUserId =
            existingRec?.users_permissions_user?.data?.id ??
            existingRec?.users_permissions_user?.id ??
            null;

        if (existingUserId) {
            const userUpdate = {};
            const username = cleanString(payload?.username);
            const email = cleanString(payload?.email);
            const password = cleanString(payload?.password);

            if (username) userUpdate.username = username;
            if (email) userUpdate.email = email;
            if (password) userUpdate.password = password;

            if (Object.keys(userUpdate).length > 0) {
                await strapiFetch(`users/${existingUserId}`, {
                    method: "PUT",
                    useAuth: true,
                    json: userUpdate,
                });
            }
        }

        const agentUpdate = buildAgentUpdate(payload, existingUserId);

        const updated = await strapiFetch(`agents/${documentId}?status=published`, {
            method: "PUT",
            useAuth: true,
            json: {
                data: agentUpdate,
            },
        });


        await CreateNotification({
            title: "Agent profile updated",
            details: "Agent profile has been updated.",
            email: false,
        });

        return Response.json(
            {
                ok: true,
                agent: updated,
                userUpdated: !!existingUserId,
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
