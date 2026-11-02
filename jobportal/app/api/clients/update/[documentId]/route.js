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

    function buildClientUpdate(payload, userId) {
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

        const existing = await strapiFetch(
            `clients/${documentId}?status=published&populate[users_permissions_user]=true&populate[logo]=true`,
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
            const username = String(payload?.username || "").trim();
            const email = String(payload?.email || "").trim();
            const password = String(payload?.password || "").trim();

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

        const clientUpdate = buildClientUpdate(payload, existingUserId);

        await strapiFetch(`clients/${documentId}?status=published`, {
            method: "PUT",
            useAuth: true,
            json: { data: clientUpdate },
        });

        const uploads = { logo: null };

        const logoFile = getFirstIncomingFile(incoming, ["logo", "files.logo"]);
        if (logoFile) {
            const up = await uploadStandaloneFile(logoFile);
            uploads.logo = { id: up.id, name: up.name, url: up.url };

            await strapiFetch(`clients/${documentId}?status=published`, {
                method: "PUT",
                useAuth: true,
                json: { data: { logo: up.id } },
            });
        }

        const populated = await strapiFetch(
            `clients/${documentId}?status=published&populate[logo]=true&populate[users_permissions_user]=true&populate[contactList]=true`,
            { method: "GET", useAuth: true }
        );




        await CreateNotification({
            title: "Client Updated (" + existing.data.companyName + ")",
            details: "A client has been updated. Client Name: " + existing.data.companyName,
            email: false,
        });



        return Response.json(
            {
                ok: true,
                clientDocumentId: documentId,
                userId: existingUserId,
                uploads,
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