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

function toNumberOrNull(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function getFirstIncomingFile(incoming, keys) {
    for (const k of keys) {
        const v = incoming.get(k);
        if (isFileLike(v) && v.size > 0) return v;
    }
    return null;
}

function pickDocFileId(doc) {
    const rel = doc?.file ?? doc?.files ?? null;
    return rel?.id ?? rel?.data?.id ?? null;
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

    function buildCandidateUpdate(payload, userId) {
        const jobRolesIds = Array.isArray(payload?.job_roles)
            ? payload.job_roles.map((x) => Number(x)).filter((n) => Number.isFinite(n))
            : [];

        const agentId = payload?.agent ? Number(payload.agent) : null;

        return {
            ...(payload.referenceNumber ? { referenceNumber: payload.referenceNumber } : {}),

            fullName: payload.fullName || "",
            firstName: payload.firstName || "",
            lastName: payload.lastName || "",
            mobile: payload.mobile || "",
            birthDate: payload.birthDate || null,

            shortSummary: payload.shortSummary || "",
            privateNotes: payload.privateNotes || "",

            genderList: payload.genderList || "",
            nationalityList: payload.nationalityList || "",
            maritalStatusList: payload.maritalStatusList || "",
            seasonalStatusList: payload.seasonalStatusList || "",
            englishLevelList: payload.englishLevelList || "",
            isProfileVerifiedList: payload.isProfileVerifiedList || "",

            passportExpireDate: payload.passportExpireDate || null,
            jobStatus: payload.jobStatus || "",

            numberOfExperience: toNumberOrNull(payload.numberOfExperience),
            currentJobExperiece: toNumberOrNull(payload.currentJobExperiece),
            previousJobExperiece: toNumberOrNull(payload.previousJobExperiece),

            previousCompany: payload.previousCompany || "",
            currentCompany: payload.currentCompany || "",

            currentlyEmployed: !!payload.currentlyEmployed,
            dateScreeningInterview: payload.dateScreeningInterview || null,

            workingVideoLink: payload.workingVideoLink || "",
            miScreeningVideoLink: payload.miScreeningVideoLink || "",

            ...(userId ? { users_permissions_user: userId } : {}),
            job_roles: jobRolesIds,
            ...(payload?.agent === null || payload?.agent === "" ? { agent: null } : (Number.isFinite(agentId) && agentId > 0 ? { agent: agentId } : {})),
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
            `candidates/${documentId}?status=published&populate[users_permissions_user]=true&populate[documents]=true`,
            { method: "GET", useAuth: true }
        );

        const existingRec = existing?.data?.attributes
            ? { ...existing.data.attributes, id: existing.data.id }
            : (existing?.data || existing);

        const existingUserId =
            existingRec?.users_permissions_user?.data?.id ??
            existingRec?.users_permissions_user?.id ??
            null;

        const existingDocs = Array.isArray(existingRec?.documents) ? existingRec.documents : [];

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

        const candidateUpdate = buildCandidateUpdate(payload, existingUserId);

        await strapiFetch(`candidates/${documentId}?status=published`, {
            method: "PUT",
            useAuth: true,
            json: { data: candidateUpdate },
        });

        const topMediaMap = {
            profileImage: ["profileImage", "files.profileImage"],
            CV: ["CV", "files.CV", "files.cv"],
            passport: ["passport", "files.passport"],
        };

        const uploads = { top: {}, documents: [] };

        const mediaUpdate = {};
        for (const [field, keys] of Object.entries(topMediaMap)) {
            const f = getFirstIncomingFile(incoming, keys);
            if (!f) continue;

            const up = await uploadStandaloneFile(f);
            uploads.top[field] = up;
            mediaUpdate[field] = up.id;
        }

        if (Object.keys(mediaUpdate).length > 0) {
            await strapiFetch(`candidates/${documentId}?status=published`, {
                method: "PUT",
                useAuth: true,
                json: { data: mediaUpdate },
            });
        }

        const docsMeta = Array.isArray(payload?.documents) ? payload.documents : null;

        if (docsMeta) {
            const docsUpdated = [];

            for (let i = 0; i < docsMeta.length; i++) {
                const name = docsMeta[i]?.name || "";
                const remarks = docsMeta[i]?.remarks || "";

                const docFile = getFirstIncomingFile(incoming, [
                    `files.documents.${i}.file`,
                    `files.documents[${i}].file`,
                    `documents.${i}.file`,
                    `documents[${i}].file`,
                ]);

                let fileId = null;

                if (docFile) {
                    const up = await uploadStandaloneFile(docFile);
                    uploads.documents.push({ index: i, fileId: up.id, filename: up.name });
                    fileId = up.id;
                } else {
                    fileId =
                        docsMeta[i]?.existingFileId ??
                        pickDocFileId(existingDocs[i]) ??
                        null;
                }

                const any = String(name || "").trim() || String(remarks || "").trim() || fileId;
                if (!any) continue;

                const row = { name, remarks };
                if (fileId) row.file = fileId;

                docsUpdated.push(row);
            }

            await strapiFetch(`candidates/${documentId}?status=published`, {
                method: "PUT",
                useAuth: true,
                json: { data: { documents: docsUpdated } },
            });
        }

        const populated = await strapiFetch(
            `candidates/${documentId}?status=published&populate[profileImage]=true&populate[CV]=true&populate[passport]=true&populate[job_roles]=true&populate[users_permissions_user]=true&populate[documents]=true`,
            { method: "GET", useAuth: true }
        );



        await CreateNotification({
            title: "Candidate Updated (" + populated.data.fullName + ")",
            details: "A candidate has been updated. Candidate Name: " + populated.data.fullName,
            email: false,
        });



        return Response.json(
            {
                ok: true,
                candidateDocumentId: documentId,
                userId: existingUserId,
                uploads,
                candidate: populated,
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