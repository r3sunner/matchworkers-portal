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

    const id = m?.id ?? null;
    const name = attrs?.name ?? "";
    const url = attrs?.url ?? "";

    const origin = String(STRAPI_BASE_URL || "").replace(/\/api\/?$/, "");

    const absUrl = url
        ? url.startsWith("http")
            ? url
            : joinUrl(origin, url)
        : "";

    return { id, name, url: absUrl };
}

function unwrapCandidate(parsed) {
    const rec = parsed?.data ?? null;
    if (!rec) return null;
    return rec?.attributes ? { id: rec.id, documentId: rec.documentId ?? rec.attributes?.documentId, ...rec.attributes } : rec;
}

function pickRelIds(rel) {
    const data = Array.isArray(rel) ? rel : rel?.data;
    if (!Array.isArray(data)) return [];
    return data.map((x) => Number(x?.id)).filter((n) => Number.isFinite(n));
}


function getAgentFromRelation(candidate) {
    const rel = candidate?.agent;
    const d = rel?.data ?? rel;
    const attrs = d?.attributes ?? d;

    return {
        id: d?.id ?? null,
        documentId: d?.documentId ?? attrs?.documentId ?? "",
        companyName: attrs?.companyName ?? "",
        contactName: attrs?.contactName ?? "",
    };
}

function getUserFromRelation(candidate) {

    const rel = candidate?.users_permissions_user;
    console.log("User relation data:", rel);
    const d = rel?.data ?? rel;
    const attrs = d?.attributes ?? d;
    return {
        id: d?.id ?? null,
        username: attrs?.username ?? "",
        email: attrs?.email ?? "",
    };
}

function mapDocuments(candidate, STRAPI_BASE_URL) {
    const docs = Array.isArray(candidate?.documents) ? candidate.documents : [];
    return docs.map((d) => {
        const fileMedia = d?.file ?? d?.files ?? null;
        const media = normalizeStrapiMedia(fileMedia, STRAPI_BASE_URL);

        return {
            name: d?.name || "",
            remarks: d?.remarks || "",
            file: null,
            existingUrl: media.url || "",
            existingName: media.name || "",
            existingFileId: media.id || null,
        };
    });
}

/* ----------------------------- route ------------------------------ */

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
            },
            { encodeValuesOnly: true }
        );

        const parsed = await strapiFetch(`candidates/${documentId}?${query}`, {
            method: "GET",
            useAuth: true,
        });


        const candidate = unwrapCandidate(parsed);

        if (!candidate) {
            return Response.json(
                { ok: false, error: "Candidate not found", parsed },
                { status: 404 }
            );
        }

        const user = getUserFromRelation(candidate);
        const agent = getAgentFromRelation(candidate);

        const existingMedia = {
            profileImage: normalizeStrapiMedia(candidate?.profileImage, STRAPI_BASE_URL),
            CV: normalizeStrapiMedia(candidate?.CV, STRAPI_BASE_URL),
            passport: normalizeStrapiMedia(candidate?.passport, STRAPI_BASE_URL),
        };

        const formDefaults = {
            referenceNumber: candidate?.referenceNumber || "",

            firstName: candidate?.firstName || "",
            lastName: candidate?.lastName || "",
            fullName: candidate?.fullName || "",

            profileImage: null,
            genderList: candidate?.genderList || "",
            birthDate: candidate?.birthDate || "",
            nationalityList: candidate?.nationalityList || "",
            maritalStatusList: candidate?.maritalStatusList || "",
            seasonalStatusList: candidate?.seasonalStatusList || "",
            englishLevelList: candidate?.englishLevelList || "",

            mobile: candidate?.mobile || "",
            email: user?.email || candidate?.email || "",

            jobStatus: candidate?.jobStatus || "",
            job_roles: pickRelIds(candidate?.job_roles),
            job_roles_name: candidate?.job_roles?.map((role) => role.title) || [],

            isProfileVerifiedList: candidate?.isProfileVerifiedList || "",
            currentlyEmployed: !!candidate?.currentlyEmployed,

            numberOfExperience: candidate?.numberOfExperience ?? 0,
            shortSummary: candidate?.shortSummary || "",
            privateNotes: candidate?.privateNotes || "",

            currentJobExperiece: candidate?.currentJobExperiece ?? 0,
            previousJobExperiece: candidate?.previousJobExperiece ?? 0,
            previousCompany: candidate?.previousCompany || "",
            currentCompany: candidate?.currentCompany || "",

            agent: agent.id || null,
            agentDocumentId: agent.documentId || "",
            agentName: agent.companyName || agent.contactName || "",

            dateScreeningInterview: candidate?.dateScreeningInterview || "",

            username: user?.username || candidate?.username || "",
            password: "",
            retypePassword: "",

            CV: null,
            passport: null,
            passportExpireDate: candidate?.passportExpireDate || "",

            workingVideoLink: candidate?.workingVideoLink || "",
            miScreeningVideoLink: candidate?.miScreeningVideoLink || "",

            documents: mapDocuments(candidate, STRAPI_BASE_URL),
        };

        return Response.json(
            {
                ok: true,
                documentId,
                existingMedia,
                formDefaults,
                candidate: parsed,
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