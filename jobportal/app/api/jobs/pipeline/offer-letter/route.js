export const runtime = "nodejs";

import { cookies } from "next/headers";
import qs from "qs";
import { USER_COOKIE_NAME } from "@/lib/auth";
import { CreateNotification } from "@/lib/server/notification";
import { assertJobAccess } from "@/app/api/jobs/_lib/jobAccess";

function joinUrl(base, path) {
    return `${String(base || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}

async function readBodySafe(res) {
    const text = await res.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

function getStrapiBaseUrl() {
    return String(
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        process.env.STRAPI_BASE_URL ||
        process.env.STRAPI_URL ||
        ""
    )
        .trim()
        .replace(/\/$/, "");
}

function getBearer() {
    const raw = String(
        process.env.STRAPI_TOKEN ||
        process.env.STRAPI_API_TOKEN ||
        ""
    ).trim();

    return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
}

function normalize(row) {
    return row?.attributes
        ? {
            id: row.id,
            documentId: row.documentId,
            ...row.attributes,
        }
        : row || {};
}

async function getCurrentUser() {
    const store = await cookies();
    const raw = store.get(USER_COOKIE_NAME)?.value || "";

    try {
        return raw ? JSON.parse(decodeURIComponent(raw)) : null;
    } catch {
        try {
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }
}

function getPersonName(user) {
    return user?.name || user?.username || user?.email || "";
}

function getUserRole(user) {
    const candidates = [
        user?.role?.name,
        user?.roleRaw?.name,
        user?.type,
        user?.role?.type,
        user?.role,
    ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);

    for (const value of candidates) {
        if (value === "staff" || value === "staffs") return "staff";
        if (value === "client" || value === "clients") return "clients";
        if (value === "candidate" || value === "candidates") return "candidates";
    }

    return candidates[0] || "";
}

function getPersonRelation(user) {
    const role = getUserRole(user);

    if (!user?.documentId) {
        throw Object.assign(new Error("Logged-in user documentId not found"), {
            status: 401,
        });
    }

    if (role === "staff" || role === "staffs") {
        return {
            staff: {
                connect: [user.documentId],
            },
        };
    }

    if (role === "client" || role === "clients") {
        return {
            client: {
                connect: [user.documentId],
            },
        };
    }

    throw Object.assign(
        new Error("Logged-in user role not found. Only staff or client can update offer letter."),
        { status: 403 }
    );
}



function displayPipelineStage(value) {
    const stage = String(value || "").trim();
    if (!stage) return "—";
    if (stage === "Hired Candidate") return "Offered Candidate";
    return stage;
}

function getCandidateDisplayName(candidate) {
    const fullName = String(candidate?.fullName || "").trim();
    if (fullName) return fullName;

    const combinedName = [candidate?.firstName, candidate?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

    return (
        combinedName ||
        candidate?.referenceNumber ||
        candidate?.documentId ||
        "Unknown Candidate"
    );
}

async function getCandidateSummary(STRAPI_BASE_URL, candidateDocumentId) {
    const query = "status=published&fields[0]=documentId&fields[1]=fullName&fields[2]=firstName&fields[3]=lastName&fields[4]=referenceNumber";

    const res = await fetch(
        joinUrl(
            STRAPI_BASE_URL,
            `candidates/${encodeURIComponent(candidateDocumentId)}?${query}`
        ),
        {
            method: "GET",
            headers: { Authorization: getBearer() },
            cache: "no-store",
        }
    );

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || "Candidate summary fetch failed");
    }

    const row = normalize(json?.data);

    return {
        id: row?.id || null,
        documentId: row?.documentId || candidateDocumentId,
        fullName: row?.fullName || "",
        firstName: row?.firstName || "",
        lastName: row?.lastName || "",
        referenceNumber: row?.referenceNumber || "",
    };
}

async function getJobSummary(STRAPI_BASE_URL, jobDocumentId) {
    const query = "status=published&fields[0]=documentId&fields[1]=title&fields[2]=referenceNo";

    const res = await fetch(
        joinUrl(
            STRAPI_BASE_URL,
            `jobs/${encodeURIComponent(jobDocumentId)}?${query}`
        ),
        {
            method: "GET",
            headers: { Authorization: getBearer() },
            cache: "no-store",
        }
    );

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || "Job summary fetch failed");
    }

    const row = normalize(json?.data);

    return {
        id: row?.id || null,
        documentId: row?.documentId || jobDocumentId,
        title: row?.title || "",
        referenceNo: row?.referenceNo || "",
    };
}

function getDocId(value) {
    const v = normalize(value);
    return v?.documentId || "";
}

function getMediaId(value) {
    const v = normalize(value);
    return v?.id || null;
}

function getChatDocIds(chats) {
    if (!Array.isArray(chats)) return [];

    return chats.map((chat) => getDocId(chat)).filter(Boolean);
}

function uniqueStrings(items) {
    return [...new Set((items || []).map(String).filter(Boolean))];
}

function absoluteStrapiFileUrl(STRAPI_BASE_URL, fileUrl) {
    const url = String(fileUrl || "").trim();
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;

    const origin = String(STRAPI_BASE_URL || "")
        .replace(/\/api\/?$/, "")
        .replace(/\/+$/, "");

    return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}


function serializeAssignItem(item, patch = {}) {
    const candidateDocumentId = getDocId(item?.candidate);

    const offerLetterId =
        patch.offerLetter !== undefined
            ? patch.offerLetter
            : getMediaId(item?.offerLetter);

    const chatDocumentIds =
        patch.pipline_chats !== undefined
            ? patch.pipline_chats
            : getChatDocIds(item?.pipline_chats);

    const data = {
        candidateProcessList:
            patch.candidateProcessList !== undefined
                ? patch.candidateProcessList
                : item?.candidateProcessList || "",
    };

    if (candidateDocumentId) {
        data.candidate = {
            connect: [candidateDocumentId],
        };
    }

    if (offerLetterId) {
        data.offerLetter = offerLetterId;
    }

    data.pipline_chats = {
        connect: uniqueStrings(chatDocumentIds),
    };

    return data;
}

async function createSystemChat({
    STRAPI_BASE_URL,
    user,
    fileName,
    jobDocumentId,
    candidateDocumentId,
    oldOfferLetter,
}) {
    const personRelation = getPersonRelation(user);

    const payload = {
        message: oldOfferLetter
            ? `Offer letter updated: ${fileName || "Offer Letter"}`
            : `Offer letter uploaded: ${fileName || "Offer Letter"}`,
        private: false,
        isSystemGenerated: true,
        personName: getPersonName(user) || "System",

        // ✅ required fields after schema update
        jobDocumentId: String(jobDocumentId || ""),
        candidateDocumentId: String(candidateDocumentId || ""),

        ...personRelation,
    };

    const res = await fetch(joinUrl(STRAPI_BASE_URL, "pipline-chats?status=published"), {
        method: "POST",
        headers: {
            Authorization: getBearer(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            data: payload,
        }),
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    if (!res.ok) {
        const err = new Error(json?.error?.message || "Failed to create offer-letter chat");
        err.status = res.status;
        err.details = json;
        throw err;
    }

    return normalize(json?.data);
}


async function createOfferLetterNotification({
    STRAPI_BASE_URL,
    jobDocumentId,
    candidateDocumentId,
    pipelineStage,
    uploaded,
    oldOfferLetter,
    user,
}) {
    try {
        const [job, candidate] = await Promise.all([
            getJobSummary(STRAPI_BASE_URL, jobDocumentId),
            getCandidateSummary(STRAPI_BASE_URL, candidateDocumentId),
        ]);

        const candidateName = getCandidateDisplayName(candidate);
        const candidateReference = candidate?.referenceNumber || "N/A";
        const jobTitle = job?.title || "Untitled Job";
        const jobReference = job?.referenceNo || "N/A";
        const stage = displayPipelineStage(pipelineStage);
        const offerLetterName = uploaded?.name || "Offer Letter";
        const offerLetterUrl = absoluteStrapiFileUrl(STRAPI_BASE_URL, uploaded?.url || "");
        const actionText = oldOfferLetter ? "Offer Letter Updated" : "Offer Letter Uploaded";

        await CreateNotification({
            title: `${actionText} - ${jobReference} - ${candidateName}`,
            details: [
                actionText,
                `Job Title: ${jobTitle}`,
                `Job Reference Number: ${jobReference}`,
                `Candidate Full Name: ${candidateName}`,
                `Candidate Reference Number: ${candidateReference}`,
                `Pipeline Stage: ${stage}`,
                `Offer Letter Name: ${offerLetterName}`,
                `Offer Letter URL: ${offerLetterUrl || "N/A"}`,
                `Uploaded By: ${getPersonName(user) || "System"}`,
            ].join("\n"),
            email: false,
        });
    } catch (notificationError) {
        console.error("Offer letter notification failed:", notificationError);
    }
}

export async function POST(req) {
    try {
        const STRAPI_BASE_URL = getStrapiBaseUrl();

        if (!STRAPI_BASE_URL) {
            return Response.json(
                { ok: false, error: "Missing Strapi base URL env" },
                { status: 500 }
            );
        }

        const formData = await req.formData();

        const jobDocumentId = String(formData.get("jobDocumentId") || "").trim();
        const candidateDocumentId = String(formData.get("candidateDocumentId") || "").trim();
        const file = formData.get("file");

        if (!jobDocumentId || !candidateDocumentId || !file) {
            return Response.json(
                {
                    ok: false,
                    error: "Missing jobDocumentId, candidateDocumentId, or file",
                },
                { status: 400 }
            );
        }

        await assertJobAccess(jobDocumentId);

        const user = await getCurrentUser();

        if (!user) {
            return Response.json(
                { ok: false, error: "Login required" },
                { status: 401 }
            );
        }

        getPersonRelation(user);

        const uploadFd = new FormData();
        uploadFd.append("files", file, file?.name || "offer-letter");

        const uploadRes = await fetch(joinUrl(STRAPI_BASE_URL, "upload"), {
            method: "POST",
            headers: {
                Authorization: getBearer(),
            },
            body: uploadFd,
            cache: "no-store",
        });

        const uploadJson = await readBodySafe(uploadRes);

        if (!uploadRes.ok) {
            return Response.json(
                {
                    ok: false,
                    error: "Offer letter upload failed",
                    details: uploadJson,
                },
                { status: uploadRes.status }
            );
        }

        const uploaded = Array.isArray(uploadJson) ? uploadJson[0] : null;

        if (!uploaded?.id) {
            return Response.json(
                {
                    ok: false,
                    error: "Upload succeeded but file id missing",
                    details: uploadJson,
                },
                { status: 500 }
            );
        }

        const query = qs.stringify(
            {
                status: "published",
                populate: {
                    assignCandidatesToJob: {
                        populate: {
                            candidate: {
                                fields: ["documentId"],
                            },
                            offerLetter: {
                                fields: ["id", "name", "url"],
                            },
                            pipline_chats: {
                                fields: ["documentId"],
                            },
                        },
                    },
                },
            },
            { encodeValuesOnly: true }
        );

        const jobRes = await fetch(
            joinUrl(
                STRAPI_BASE_URL,
                `jobs/${encodeURIComponent(jobDocumentId)}?${query}`
            ),
            {
                headers: {
                    Authorization: getBearer(),
                },
                cache: "no-store",
            }
        );

        const jobJson = await readBodySafe(jobRes);

        if (!jobRes.ok) {
            return Response.json(
                {
                    ok: false,
                    error: "Job load failed",
                    details: jobJson,
                },
                { status: jobRes.status }
            );
        }

        const job = normalize(jobJson?.data);
        const assigned = Array.isArray(job?.assignCandidatesToJob)
            ? job.assignCandidatesToJob
            : [];

        let targetItem = null;

        for (const item of assigned) {
            const c = normalize(item?.candidate);

            if (String(c?.documentId) === String(candidateDocumentId)) {
                targetItem = item;
                break;
            }
        }

        if (!targetItem) {
            return Response.json(
                {
                    ok: false,
                    error: "Candidate not found in this job pipeline",
                },
                { status: 404 }
            );
        }

        const oldOfferLetterId = getMediaId(targetItem?.offerLetter);
        const pipelineStage = targetItem?.candidateProcessList || "";

        const systemChat = await createSystemChat({
            STRAPI_BASE_URL,
            user,
            fileName: uploaded?.name,
            jobDocumentId,
            candidateDocumentId,
            oldOfferLetter: !!oldOfferLetterId,
        });

        const oldChatDocIds = getChatDocIds(targetItem?.pipline_chats);
        const nextChatDocIds = uniqueStrings([
            ...oldChatDocIds,
            systemChat.documentId,
        ]);

        const nextAssign = assigned.map((item) => {
            const c = normalize(item?.candidate);
            const isTarget = String(c?.documentId) === String(candidateDocumentId);

            if (!isTarget) {
                return serializeAssignItem(item);
            }

            return serializeAssignItem(item, {
                offerLetter: uploaded.id,
                pipline_chats: nextChatDocIds,
            });
        });

        const updateRes = await fetch(
            joinUrl(
                STRAPI_BASE_URL,
                `jobs/${encodeURIComponent(jobDocumentId)}?status=published`
            ),
            {
                method: "PUT",
                headers: {
                    Authorization: getBearer(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    data: {
                        assignCandidatesToJob: nextAssign,
                    },
                }),
                cache: "no-store",
            }
        );

        const updateJson = await readBodySafe(updateRes);

        if (!updateRes.ok) {
            return Response.json(
                {
                    ok: false,
                    error: "Offer letter uploaded but failed to attach to job pipeline",
                    details: updateJson,
                    sent: nextAssign,
                },
                { status: updateRes.status }
            );
        }

        await createOfferLetterNotification({
            STRAPI_BASE_URL,
            jobDocumentId,
            candidateDocumentId,
            pipelineStage,
            uploaded,
            oldOfferLetter: !!oldOfferLetterId,
            user,
        });

        return Response.json({
            ok: true,
            offerLetter: {
                id: uploaded.id,
                name: uploaded.name || "Offer Letter",
                url: uploaded.url || "",
            },
            systemChat,
        });
    } catch (e) {
        return Response.json(
            {
                ok: false,
                error: e?.message || "Server error",
                details: e?.details || null,
            },
            { status: e?.status || 500 }
        );
    }
}
