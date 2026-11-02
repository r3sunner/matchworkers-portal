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
        return { json: JSON.parse(text), text };
    } catch {
        return { json: null, text };
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

export async function POST(req, { params } = {}) {
    const STRAPI_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
    const RAW_TOKEN = process.env.STRAPI_TOKEN || "";

    // ✅ IMPORTANT: confirm this is your real endpoint name in Strapi
    const STAFF_ENDPOINT = "staffs";

    if (!STRAPI_BASE_URL || !RAW_TOKEN) {
        return Response.json({ ok: false, error: "Missing STRAPI_BASE_URL or STRAPI_TOKEN" }, { status: 500 });
    }

    const BEARER = RAW_TOKEN.toLowerCase().startsWith("bearer ") ? RAW_TOKEN : `Bearer ${RAW_TOKEN}`;

    async function strapiFetch(path, opts = {}) {
        const url = joinUrl(STRAPI_BASE_URL, path);
        const method = opts.method || "GET";

        console.log("STRAPI FETCH", { url, method });

        const headers = {
            Authorization: BEARER,
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

        console.log("STRAPI RESPONSE", res);

        // redirect => STRAPI_BASE_URL wrong
        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            throw new Error(`Strapi redirect (${res.status}) - fix STRAPI_BASE_URL. location=${loc}`);
        }

        const { json, text } = await readBodySafe(res);

        if (!res.ok) {
            console.log("STRAPI ERROR", { url, status: res.status, text: text?.slice(0, 200) });
            const msg = json?.error?.message || json?.message || text?.slice(0, 200) || `Strapi error: ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            err.details = json?.error || json || { raw: text };
            throw err;
        }

        return json;
    }

    async function uploadStandaloneFile(file) {
        const form = new FormData();
        form.append("files", file, file.name);

        const uploaded = await strapiFetch("upload", { method: "POST", body: form });
        const first = Array.isArray(uploaded) ? uploaded[0] : null;
        if (!first?.id) throw new Error("Upload succeeded but no file id returned.");
        return first;
    }

    try {
        const p = params ? await params : null;
        const documentId = p?.documentId;

        if (!documentId) {
            return Response.json({ ok: false, error: "Missing documentId param" }, { status: 400 });
        }

        const incoming = await req.formData();

        const dataStr = incoming.get("data");
        if (!dataStr) return Response.json({ ok: false, error: "Missing data field" }, { status: 400 });

        let payload;
        try {
            payload = JSON.parse(String(dataStr));
        } catch {
            return Response.json({ ok: false, error: "Invalid JSON in data field" }, { status: 400 });
        }

        // 0) fetch staff to get linked user
        const query = qs.stringify(
            { status: "published", populate: { users_permissions_user: true, image: true } },
            { encodeValuesOnly: true }
        );

        const existing = await strapiFetch(`${STAFF_ENDPOINT}/${documentId}?${query}`, { method: "GET" });
        const staffRec = existing?.data?.attributes
            ? { id: existing.data.id, documentId: existing.data.documentId, ...existing.data.attributes }
            : (existing?.data || existing);

        const userId =
            staffRec?.users_permissions_user?.data?.id ??
            staffRec?.users_permissions_user?.id ??
            null;

        // 1) update user account
        if (userId) {
            const userUpdate = {};
            const username = String(payload?.username || "").trim();
            const email = String(payload?.email || "").trim();
            const password = String(payload?.password || "").trim();

            if (username) userUpdate.username = username;
            if (email) userUpdate.email = email;
            if (password) userUpdate.password = password;

            if (Object.keys(userUpdate).length) {
                await strapiFetch(`users/${userId}`, { method: "PUT", json: userUpdate });
            }
        }

        // 2) update staff fields
        const staffUpdate = {
            fullName: payload?.fullName || "",
            mobile: payload?.mobile || "",
            designation: payload?.designation || "",
            type: "staff",
            ...(userId ? { users_permissions_user: userId } : {}),
        };

        await strapiFetch(`${STAFF_ENDPOINT}/${documentId}?status=published`, {
            method: "PUT",
            json: { data: staffUpdate },
        });

        // 3) upload new profile image (if any)
        const uploads = { image: null };
        const imageFile = getFirstIncomingFile(incoming, ["image", "files.image"]);

        if (imageFile) {
            const up = await uploadStandaloneFile(imageFile);
            uploads.image = { id: up.id, name: up.name, url: up.url };

            await strapiFetch(`${STAFF_ENDPOINT}/${documentId}?status=published`, {
                method: "PUT",
                json: { data: { image: up.id } },
            });
        }

        // 4) return populated
        const populated = await strapiFetch(`${STAFF_ENDPOINT}/${documentId}?${query}`, { method: "GET" });

        return Response.json({ ok: true, documentId, userId, uploads, staff: populated }, { status: 200 });
    } catch (err) {
        console.log("STAFF UPDATE ERROR", err?.message, err?.details || "");
        return Response.json(
            { ok: false, error: err?.message || "Server error", details: err?.details || null },
            { status: err?.status || 500 }
        );
    }
}