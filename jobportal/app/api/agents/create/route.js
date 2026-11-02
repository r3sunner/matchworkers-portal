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
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

function cleanString(v) {
    return String(v || "").trim();
}

export async function POST(req) {
    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
    const RAW_TOKEN = String(process.env.STRAPI_TOKEN || "").trim();
    const FORCE_ROLE_ID = process.env.STRAPI_AGENT_ROLE_ID;

    if (!STRAPI_BASE_URL || !RAW_TOKEN) {
        return Response.json(
            { ok: false, error: "Missing STRAPI_BASE_URL or STRAPI_TOKEN" },
            { status: 500 }
        );
    }

    if (!FORCE_ROLE_ID) {
        return Response.json(
            { ok: false, error: "Missing STRAPI_AGENT_ROLE_ID. Add STRAPI_AGENT_ROLE_ID=5 in env file." },
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

    async function safeDeleteUser(userId) {
        try {
            if (userId) await strapiFetch(`users/${userId}`, { method: "DELETE", useAuth: true });
        } catch (e) {
            console.log("WARN: rollback user delete failed:", e?.message);
        }
    }

    async function safeDeleteAgent(documentId) {
        try {
            if (documentId) await strapiFetch(`agents/${documentId}?status=published`, { method: "DELETE", useAuth: true });
        } catch (e) {
            console.log("WARN: rollback agent delete failed:", e?.message);
        }
    }

    function buildAgentData(payload, userId) {
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

            contactList: Array.isArray(payload.contactList) ? payload.contactList : [],

            users_permissions_user: userId,
        };
    }

    try {
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

        const username = cleanString(payload?.username);
        const email = cleanString(payload?.email);
        const password = String(payload?.password || "");

        if (!username || !email || !password) {
            return Response.json(
                { ok: false, error: "username, email and password are required" },
                { status: 400 }
            );
        }

        const roleId = Number(FORCE_ROLE_ID);
        if (!Number.isFinite(roleId) || roleId <= 0) {
            return Response.json(
                { ok: false, error: "Invalid STRAPI_AGENT_ROLE_ID. Expected a numeric role id." },
                { status: 500 }
            );
        }

        let createdUser = null;
        let createdAgent = null;

        try {
            createdUser = await strapiFetch("users", {
                method: "POST",
                useAuth: true,
                json: {
                    username,
                    email,
                    password,
                    confirmed: true,
                    blocked: false,
                    provider: "local",
                    role: roleId,
                },
            });

            const userId = createdUser?.id;
            if (!userId) throw new Error("User created but no id returned.");

            createdAgent = await strapiFetch("agents?status=published", {
                method: "POST",
                useAuth: true,
                json: {
                    data: buildAgentData(payload, userId),
                },
            });



            await CreateNotification({
                title: "Agent profile created",
                details: "New Agent profile has been created.",
                email: false,
            });

            return Response.json(
                {
                    ok: true,
                    user: createdUser,
                    agent: createdAgent,
                    documentId: createdAgent?.data?.documentId || createdAgent?.data?.attributes?.documentId || null,
                },
                { status: 201 }
            );


        } catch (error) {
            if (createdAgent?.data?.documentId) {
                await safeDeleteAgent(createdAgent.data.documentId);
            }
            if (createdUser?.id) {
                await safeDeleteUser(createdUser.id);
            }

            throw error;
        }
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
