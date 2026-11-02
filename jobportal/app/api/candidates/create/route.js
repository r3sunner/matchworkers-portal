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

/* ----------------------------- route ------------------------------ */

export async function POST(req) {
    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
    const RAW_TOKEN = String(process.env.STRAPI_TOKEN || "").trim();
    const FORCE_ROLE_ID = process.env.STRAPI_CANDIDATE_ROLE_ID;

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

    async function getCandidateRoleId() {
        if (FORCE_ROLE_ID) return Number(FORCE_ROLE_ID);

        const rolesResp = await strapiFetch("users-permissions/roles", { method: "GET" });
        const roles = rolesResp?.roles || rolesResp?.data || [];

        const candidateRole =
            roles.find((r) => String(r?.type || "").toLowerCase() === "candidate") ||
            roles.find((r) => String(r?.name || "").toLowerCase() === "candidate") ||
            roles.find((r) => String(r?.name || "").toLowerCase().includes("candidate"));

        if (!candidateRole?.id) throw new Error("Candidate role not found in users-permissions roles.");
        return Number(candidateRole.id);
    }

    async function safeDeleteUser(userId) {
        try {
            await strapiFetch(`users/${userId}`, { method: "DELETE", useAuth: true });
        } catch (e) {
            console.log("WARN: rollback user delete failed:", e?.message);
        }
    }

    async function safeDeleteCandidate(documentId) {
        try {
            await strapiFetch(`candidates/${documentId}?status=published`, { method: "DELETE", useAuth: true });
            return;
        } catch (e) {
            console.log("WARN: rollback candidate delete (published) failed:", e?.message);
        }
        try {
            await strapiFetch(`candidates/${documentId}`, { method: "DELETE", useAuth: true });
        } catch (e) {
            console.log("WARN: rollback candidate delete (no status) failed:", e?.message);
        }
    }

    function buildCandidateData(payload, userId) {
        const jobRolesIds = Array.isArray(payload?.job_roles)
            ? payload.job_roles.map((x) => Number(x)).filter((n) => Number.isFinite(n))
            : [];

        const referenceNumber = `CAN_${userId}`;
        const agentId = payload?.agent ? Number(payload.agent) : null;

        return {
            referenceNumber,

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

            // NEW simple links
            workingVideoLink: payload.workingVideoLink || "",
            miScreeningVideoLink: payload.miScreeningVideoLink || "",

            users_permissions_user: userId,
            job_roles: jobRolesIds,
            ...(Number.isFinite(agentId) && agentId > 0 ? { agent: agentId } : { agent: null }),

            documents: Array.isArray(payload.documents) ? payload.documents : [],
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

        const roleId = await getCandidateRoleId();

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

        const candidateData = buildCandidateData(payload, userId);

        let createdCandidate;
        try {
            createdCandidate = await strapiFetch("candidates?status=published", {
                method: "POST",
                useAuth: true,
                json: { data: candidateData },
            });
        } catch (e) {
            await safeDeleteUser(userId);
            throw e;
        }

        const created = createdCandidate?.data || createdCandidate;
        const candidateId = created?.id;
        const candidateDocumentId = created?.documentId;

        if (!candidateId || !candidateDocumentId) {
            return Response.json(
                { ok: false, error: "Candidate created but id/documentId missing.", createdCandidate },
                { status: 500 }
            );
        }

        console.log("Created candidate identifiers:", { candidateId, candidateDocumentId });

        const topMediaMap = {
            profileImage: ["profileImage", "files.profileImage"],
            CV: ["CV", "files.CV", "files.cv"],
            passport: ["passport", "files.passport"],
        };

        const uploads = { top: {}, documents: [] };

        try {
            const mediaUpdate = {};

            for (const [field, keys] of Object.entries(topMediaMap)) {
                const f = getFirstIncomingFile(incoming, keys);
                if (!f) continue;

                const up = await uploadStandaloneFile(f);
                uploads.top[field] = up;
                mediaUpdate[field] = up.id;
            }

            if (Object.keys(mediaUpdate).length > 0) {
                await strapiFetch(`candidates/${candidateDocumentId}?status=published`, {
                    method: "PUT",
                    useAuth: true,
                    json: { data: mediaUpdate },
                });
            }
        } catch (e) {
            await safeDeleteCandidate(candidateDocumentId);
            await safeDeleteUser(userId);
            throw e;
        }

        const docsMeta = Array.isArray(payload.documents) ? payload.documents : [];

        if (docsMeta.length > 0) {
            try {
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

                    if (docFile) {
                        const up = await uploadStandaloneFile(docFile);
                        uploads.documents.push({ index: i, fileId: up.id, filename: up.name });

                        docsUpdated.push({
                            name,
                            remarks,
                            file: up.id,
                        });
                    } else {
                        docsUpdated.push({ name, remarks });
                    }
                }

                await strapiFetch(`candidates/${candidateDocumentId}?status=published`, {
                    method: "PUT",
                    useAuth: true,
                    json: { data: { documents: docsUpdated } },
                });
            } catch (e) {
                await safeDeleteCandidate(candidateDocumentId);
                await safeDeleteUser(userId);
                throw e;
            }
        }

        const populated = await strapiFetch(
            `candidates/${candidateDocumentId}?status=published&populate=*`,
            { method: "GET", useAuth: true }
        );




        await CreateNotification({
            title: "New Candidate Created (" + populated.data.fullName + ")",
            details: "A new candidate has been created. Candidate Name: " + populated.data.fullName,
            email: false,
        });




        return Response.json(
            {
                ok: true,
                userId,
                candidateId,
                candidateDocumentId,
                referenceNumber: candidateData.referenceNumber,
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