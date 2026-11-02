export const runtime = "nodejs";

import qs from "qs";
import { assertJobAccess } from "@/app/api/jobs/_lib/jobAccess";

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}

function normalizeStrapiMedia(media, STRAPI_BASE_URL) {
    const m = media?.data ?? media;

    const id = m?.id ?? null;
    const name = m?.name ?? "";
    const url = m?.url ?? "";

    const origin = String(STRAPI_BASE_URL || "").replace(/\/api\/?$/, "");
    const absUrl = url
        ? url.startsWith("http")
            ? url
            : joinUrl(origin, url)
        : "";

    return { id, name, url: absUrl };
}

async function readBodySafe(res) {
    const text = await res.text();

    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

function pickCandidate(candidate, STRAPI_BASE_URL) {
    if (!candidate) return null;

    const cd = candidate?.data ?? candidate;
    const documentId = cd?.documentId;

    const profileImage = normalizeStrapiMedia(cd?.profileImage, STRAPI_BASE_URL);
    const cv = normalizeStrapiMedia(cd?.CV, STRAPI_BASE_URL);
    const passport = normalizeStrapiMedia(cd?.passport, STRAPI_BASE_URL);

    const documents = Array.isArray(cd?.documents)
        ? cd.documents.map((d) => {
            const file = normalizeStrapiMedia(d?.file, STRAPI_BASE_URL);

            return {
                name: d?.name || file?.name || "Document",
                remarks: d?.remarks || "",
                url: file?.url || "",
            };
        })
        : [];

    return {
        documentId,
        referenceNumber: cd?.referenceNumber || "",
        firstName: cd?.firstName || "",
        lastName: cd?.lastName || "",
        fullName: cd?.fullName || "",
        mobile: cd?.mobile || "",
        birthDate: cd?.birthDate || "",
        nationality: cd?.nationalityList || "",
        gender: cd?.genderList || "",
        email: cd?.users_permissions_user?.email || "",
        username: cd?.users_permissions_user?.username || "",
        maritalStatusList: cd?.maritalStatusList || "",
        isProfileVerified: !!cd?.isProfileVerified,
        seasonalStatusList: cd?.seasonalStatusList || "",
        numberOfExperience: cd?.numberOfExperience || "",
        currentJobExperiece: cd?.currentJobExperiece || "",
        previousJobExperiece: cd?.previousJobExperiece || "",
        previousCompany: cd?.previousCompany || "",
        currentCompany: cd?.currentCompany || "",
        englishLevelList: cd?.englishLevelList || "",
        shortSummary: cd?.shortSummary || "",
        privateNotes: cd?.privateNotes || "",
        workingVideoLink: cd?.workingVideoLink || "",
        miScreeningVideoLink: cd?.miScreeningVideoLink || "",
        currentlyEmployed: cd?.currentlyEmployed || null,
        avatar: profileImage?.url || "https://placehold.net/avatar.svg",
        cvUrl: cv?.url || "",
        job_roles: cd?.job_roles || "",
        passportUrl: passport?.url || "",
        passportExpireDate: cd?.passportExpireDate || "",
        dateScreeningInterview: cd?.dateScreeningInterview || "",
        documents,
    };
}

export async function GET(_req, ctx) {
    try {
        const { documentId } = await ctx.params;

        if (!documentId) {
            return Response.json(
                { ok: false, error: "Missing documentId" },
                { status: 400 }
            );
        }

        await assertJobAccess(documentId);

        const STRAPI_BASE_URL = String(process.env.STRAPI_BASE_URL || "")
            .trim()
            .replace(/\/$/, "");

        const STRAPI_TOKEN = String(process.env.STRAPI_TOKEN || "")
            .trim()
            .replace(/\/$/, "");

        if (!STRAPI_BASE_URL || !STRAPI_TOKEN) {
            return Response.json(
                { ok: false, error: "Missing STRAPI_BASE_URL or STRAPI_TOKEN" },
                { status: 500 }
            );
        }

        const queryObj = {
            status: "published",
            populate: {
                client: true,
                assignCandidatesToJob: {
                    populate: {
                        candidate: {
                            populate: {
                                users_permissions_user: true,
                                profileImage: true,
                                job_roles: true,
                                CV: true,
                                passport: true,
                                agent: true,
                                documents: {
                                    populate: {
                                        file: true,
                                    },
                                },
                            },
                        },
                        offerLetter: true,
                    },
                },
            },
        };

        const query = qs.stringify(queryObj, { encodeValuesOnly: true });
        const url = `${STRAPI_BASE_URL}/jobs/${documentId}?${query}`;

        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${STRAPI_TOKEN}`,
            },
            cache: "no-store",
        });

        const body = await readBodySafe(res);

        if (!res.ok) {
            return Response.json(
                {
                    ok: false,
                    error: "Failed to fetch job from Strapi",
                    details: body,
                },
                { status: res.status }
            );
        }

        const jobData = body?.data || null;

        if (!jobData) {
            return Response.json(
                { ok: false, error: "Job not found" },
                { status: 404 }
            );
        }

        const job = {
            documentId: jobData?.documentId || documentId,
            title: jobData?.title || "",
            jobTypeList: jobData?.jobTypeList || "",
            details: jobData?.details || "",
            location: jobData?.location || "",
            statusList: jobData?.statusList || "",
            closingDate: jobData?.closingDate || "",
            createdAt: jobData?.createdAt || "",
            referenceNo: jobData?.referenceNo || "",
            shortDescription: jobData?.shortDescription || "",
            industeryList: jobData?.industeryList || "",
            vacanciesNo: jobData?.vacanciesNo || "",
            experience: jobData?.experience || "",
            client: jobData?.client || "",
        };

        const rows = Array.isArray(jobData?.assignCandidatesToJob)
            ? jobData.assignCandidatesToJob
            : [];

        const lists = {
            suggested: [],
            shortlisted: [],
            interview: [],
            hired: [],
            immigration: [],
            placed: [],
        };

        for (const r of rows) {
            const process = String(r?.candidateProcessList || "").trim();
            const processLower = process.toLowerCase();

            const c = pickCandidate(r?.candidate, STRAPI_BASE_URL);

            if (!c?.documentId) continue;

            const offerLetter = normalizeStrapiMedia(r?.offerLetter, STRAPI_BASE_URL);

            const candidateWithProcess = {
                ...c,
                candidateProcessList: process,
                offerLetter: offerLetter?.url || offerLetter?.name || offerLetter?.id
                    ? offerLetter
                    : null,
            };

            if (
                processLower === "suggested candidate" ||
                processLower === "suggested"
            ) {
                lists.suggested.push(candidateWithProcess);
            } else if (
                processLower === "shortlisted candidate" ||
                processLower === "shortlisted"
            ) {
                lists.shortlisted.push(candidateWithProcess);
            } else if (
                processLower === "requested interview" ||
                processLower === "interview"
            ) {
                lists.interview.push(candidateWithProcess);
            } else if (
                processLower === "hired candidate" ||
                processLower === "hired"
            ) {
                lists.hired.push(candidateWithProcess);
            } else if (processLower === "immigration") {
                lists.immigration.push(candidateWithProcess);
            } else if (processLower === "placed") {
                lists.placed.push(candidateWithProcess);
            } else {
                lists.suggested.push(candidateWithProcess);
            }
        }

        return Response.json(
            {
                ok: true,
                job,
                lists,
            },
            { status: 200 }
        );
    } catch (e) {
        return Response.json(
            {
                ok: false,
                error: e?.message || "Server error",
            },
            { status: e?.status || 500 }
        );
    }
}