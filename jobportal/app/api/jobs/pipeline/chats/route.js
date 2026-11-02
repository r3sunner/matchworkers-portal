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
        new Error("Logged-in user role not found. Only staff or client can create pipeline chat."),
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

function normalizeChat(row) {
    const c = normalize(row);

    return {
        id: c?.id ?? null,
        documentId: c?.documentId || "",
        message: c?.message || "",
        private: !!c?.private,
        isSystemGenerated: !!c?.isSystemGenerated,
        history: c?.history || "",
        personName: c?.personName || "",
        jobDocumentId: c?.jobDocumentId || "",
        candidateDocumentId: c?.candidateDocumentId || "",
        createdAt: c?.createdAt || "",
        updatedAt: c?.updatedAt || "",
    };
}

function serializeAssignItem(item, patch = {}) {
    const candidateDocumentId = getDocId(item?.candidate);
    const offerLetterId = getMediaId(item?.offerLetter);

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

async function loadJobPipelineItem({
    STRAPI_BASE_URL,
    jobDocumentId,
    candidateDocumentId,
}) {
    const query = qs.stringify(
        {
            status: "published",
            populate: {
                assignCandidatesToJob: {
                    populate: {
                        candidate: {
                            fields: ["documentId"],
                        },
                        offerLetter: true,
                        pipline_chats: {
                            fields: ["documentId"],
                        },
                    },
                },
            },
        },
        { encodeValuesOnly: true }
    );

    const res = await fetch(
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

    const json = await readBodySafe(res);

    if (!res.ok) {
        const err = new Error(json?.error?.message || "Failed to load job");
        err.status = res.status;
        err.details = json;
        throw err;
    }

    const job = normalize(json?.data);
    const assigned = Array.isArray(job?.assignCandidatesToJob)
        ? job.assignCandidatesToJob
        : [];

    const targetItem = assigned.find((item) => {
        const c = normalize(item?.candidate);
        return String(c?.documentId) === String(candidateDocumentId);
    });

    if (!targetItem) {
        const err = new Error("Candidate not found in this job pipeline");
        err.status = 404;
        throw err;
    }

    return {
        assigned,
        targetItem,
    };
}


async function createPipelineRecordNotification({
    STRAPI_BASE_URL,
    jobDocumentId,
    candidateDocumentId,
    pipelineStage,
    message,
    isPrivate,
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

        await CreateNotification({
            title: `Pipeline Record Added  - ${jobReference} -  ${candidateName}`,
            details: [
                "Add Record",
                `Record Message: ${message}`,
                ``,
                `Job Title: ${jobTitle}`,
                `Job Reference Number: ${jobReference}`,
                `Candidate Full Name: ${candidateName}`,
                `Candidate Reference Number: ${candidateReference}`,
                `Pipeline Stage: ${stage}`,
                `Record Privacy: ${isPrivate ? "Private" : "Public"}`,

                `Added By: ${getPersonName(user) || "System"}`,
            ].join("\n"),
            email: false,
        });
    } catch (notificationError) {
        console.error("Pipeline record notification failed:", notificationError);
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

        const body = await req.json();

        const jobDocumentId = String(body?.jobDocumentId || "").trim();
        const candidateDocumentId = String(body?.candidateDocumentId || "").trim();
        const message = String(body?.message || "").trim();

        if (!jobDocumentId || !candidateDocumentId || !message) {
            return Response.json(
                {
                    ok: false,
                    error: "Missing jobDocumentId, candidateDocumentId, or message",
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

        const personRelation = getPersonRelation(user);

        const chatPayload = {
            message,
            private: !!body?.private,
            isSystemGenerated: !!body?.isSystemGenerated,
            personName: getPersonName(user),

            // ✅ required after schema update
            jobDocumentId,
            candidateDocumentId,

            ...personRelation,
        };

        const createRes = await fetch(
            joinUrl(STRAPI_BASE_URL, "pipline-chats?status=published"),
            {
                method: "POST",
                headers: {
                    Authorization: getBearer(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    data: chatPayload,
                }),
                cache: "no-store",
            }
        );

        const createJson = await readBodySafe(createRes);

        if (!createRes.ok) {
            return Response.json(
                {
                    ok: false,
                    error: "Failed to create chat",
                    details: createJson,
                },
                { status: createRes.status }
            );
        }

        const newChat = normalize(createJson?.data);

        const { assigned, targetItem } = await loadJobPipelineItem({
            STRAPI_BASE_URL,
            jobDocumentId,
            candidateDocumentId,
        });

        const oldChatDocIds = getChatDocIds(targetItem?.pipline_chats);
        const nextChatDocIds = uniqueStrings([
            ...oldChatDocIds,
            newChat.documentId,
        ]);

        const nextAssign = assigned.map((item) => {
            const c = normalize(item?.candidate);
            const isTarget = String(c?.documentId) === String(candidateDocumentId);

            if (!isTarget) {
                return serializeAssignItem(item);
            }

            return serializeAssignItem(item, {
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
                    error: "Chat created but failed to attach to job pipeline",
                    details: updateJson,
                    sent: nextAssign,
                },
                { status: updateRes.status }
            );
        }

        await createPipelineRecordNotification({
            STRAPI_BASE_URL,
            jobDocumentId,
            candidateDocumentId,
            pipelineStage: targetItem?.candidateProcessList || "",
            message,
            isPrivate: !!body?.private,
            user,
        });

        return Response.json({
            ok: true,
            item: normalizeChat(newChat),
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
