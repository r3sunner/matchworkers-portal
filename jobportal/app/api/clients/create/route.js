import { CreateNotification } from "@/lib/server/notification";

export const runtime = "nodejs";

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

function isFileLike(v) {
    return v && typeof v === "object" && typeof v.arrayBuffer === "function" && typeof v.name === "string";
}

function getFirstIncomingFile(incoming, keys) {
    for (const k of keys) {
        const v = incoming.get(k);
        if (isFileLike(v) && v.size > 0) return v;
    }
    return null;
}

/* ----------------------------- route ------------------------------ */

export async function POST(req) {
    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
    const RAW_TOKEN = String(process.env.STRAPI_TOKEN || "").trim();

    const FORCE_ROLE_ID = process.env.STRAPI_CLIENT_ROLE_ID;

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

    async function getClientRoleId() {
        if (FORCE_ROLE_ID) return Number(FORCE_ROLE_ID);

        const rolesResp = await strapiFetch("client-users-permissions/roles", { method: "GET" });
        const roles = rolesResp?.roles || rolesResp?.data || [];

        const clientRole =
            roles.find((r) => String(r?.type || "").toLowerCase() === "client") ||
            roles.find((r) => String(r?.name || "").toLowerCase() === "client") ||
            roles.find((r) => String(r?.name || "").toLowerCase().includes("client"));

        if (!clientRole?.id) throw new Error("Client role not found in client-users-permissions roles.");
        return Number(clientRole.id);
    }

    async function safeDeleteUser(userId) {
        try {
            await strapiFetch(`users/${userId}`, { method: "DELETE", useAuth: true });
        } catch (e) {
            console.log("WARN: rollback user delete failed:", e?.message);
        }
    }

    async function safeDeleteClient(documentId) {
        try {
            await strapiFetch(`clients/${documentId}?status=published`, { method: "DELETE", useAuth: true });
            return;
        } catch (e) {
            console.log("WARN: rollback client delete (published) failed:", e?.message);
        }
        try {
            await strapiFetch(`clients/${documentId}`, { method: "DELETE", useAuth: true });
        } catch (e) {
            console.log("WARN: rollback client delete (no status) failed:", e?.message);
        }
    }

    function buildClientData(payload, userId) {
        return {
            companyName: payload.companyName || "",
            contactName: payload.contactName || "",
            designation: payload.designation || "",
            city: payload.city || "",
            address: payload.address || "",
            phone: payload.phone || "",
            website: payload.website || "",

            countryList: payload.countryList || "",
            industriesList: payload.industriesList || "",
            companySizeList: payload.companySizeList || "",
            statusList: payload.statusList || "",
            leadStatus: payload.leadStatus || "Lead",

            shortDescription: payload.shortDescription || "",
            privateNote: payload.privateNote || "",

            contactList: Array.isArray(payload.contactList) ? payload.contactList : [],

            type: "client",

            users_permissions_user: userId,
        };
    }

    async function uploadStandaloneFile(file) {
        const form = new FormData();
        form.append("files", file, file.name);

        const uploaded = await strapiFetch("upload", {
            method: "POST",
            useAuth: true,
            body: form,
        });

        const first = Array.isArray(uploaded) ? uploaded[0] : null;
        if (!first?.id) throw new Error("Upload succeeded but no file id returned.");
        return first;
    }

    try {
        const incoming = await req.formData();
        console.log("Incoming keys:", [...new Set([...incoming.keys()])]);

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

        const username = (payload?.username || "").trim();
        const email = (payload?.email || "").trim();
        const password = String(payload?.password || "");

        if (!username || !email || !password) {
            return Response.json(
                { ok: false, error: "username, email, password are required" },
                { status: 400 }
            );
        }

        const roleId = await getClientRoleId();

        const registerRes = await strapiFetch("auth/local/register", {
            method: "POST",
            useAuth: false,
            json: { username, email, password },
        });

        const userId = registerRes?.user?.id;
        if (!userId) throw new Error("Register succeeded but user id not returned.");

        try {
            await strapiFetch(`users/${userId}`, {
                method: "PUT",
                useAuth: true,
                json: { confirmed: true, blocked: false, role: roleId },
            });
        } catch (e) {
            console.log("WARN: Could not update user confirmed/role:", e?.message);
        }

        const clientData = buildClientData(payload, userId);

        let createdClient;
        try {
            createdClient = await strapiFetch("clients?status=published", {
                method: "POST",
                useAuth: true,
                json: { data: clientData },
            });
        } catch (e) {
            await safeDeleteUser(userId);
            throw e;
        }

        const created = createdClient?.data || createdClient;
        const clientId = created?.id;
        const clientDocumentId = created?.documentId;

        if (!clientId || !clientDocumentId) {
            return Response.json(
                { ok: false, error: "Client created but id/documentId missing.", createdClient },
                { status: 500 }
            );
        }

        try {
            const logoFile = getFirstIncomingFile(incoming, ["logo", "files.logo"]);
            if (logoFile) {
                const up = await uploadStandaloneFile(logoFile);
                await strapiFetch(`clients/${clientDocumentId}?status=published`, {
                    method: "PUT",
                    useAuth: true,
                    json: { data: { logo: up.id } },
                });
            }
        } catch (e) {
            await safeDeleteClient(clientDocumentId);
            await safeDeleteUser(userId);
            throw e;
        }

        const populated = await strapiFetch(
            `clients/${clientDocumentId}?status=published&populate=*`,
            { method: "GET", useAuth: true }
        );




        await CreateNotification({
            title: "New Client Created (" + clientData.companyName + ")",
            details: "A new client has been created. Client Name: " + clientData.companyName,
            email: false,
        });


        return Response.json(
            {
                ok: true,
                userId,
                clientId,
                clientDocumentId,
                client: populated,
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