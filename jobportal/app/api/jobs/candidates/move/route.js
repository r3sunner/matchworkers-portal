export const runtime = "nodejs";

import qs from "qs";
import { cookies } from "next/headers";
import { USER_COOKIE_NAME } from "@/lib/auth";
import { CreateNotification } from "@/lib/server/notification";
import { assertJobAccess } from "@/app/api/jobs/_lib/jobAccess";

/* ---------------- BASE URLS ---------------- */

function strapiBase() {
    return (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
}

function strapiPublicBase() {
    return (process.env.NEXT_PUBLIC_STRAPI_PUBLIC_URL || "").trim().replace(/\/$/, "");
}

function strapiToken() {
    return process.env.STRAPI_TOKEN || "";
}

/* ---------------- HELPERS ---------------- */

async function readBodySafe(res) {
    const text = await res.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

function relationId(value) {
    if (!value) return null;

    const v = value?.data ?? value;

    if (typeof v === "object" && v !== null) return v.id ?? null;
    if (typeof v === "number") return v;

    return null;
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

function getDocId(value) {
    const v = normalize(value);
    return v?.documentId || "";
}

function getChatDocIds(chats) {
    if (!Array.isArray(chats)) return [];

    return chats
        .map((chat) => getDocId(chat))
        .filter(Boolean);
}

function uniqueStrings(items) {
    return [...new Set((items || []).map(String).filter(Boolean))];
}

function absoluteMediaUrl(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;

    return `${strapiPublicBase()}${s.startsWith("/") ? "" : "/"}${s}`;
}

function normalizeOfferLetterMedia(media) {
    const m = media?.data ?? media;
    const attrs = m?.attributes ?? m;

    const id = m?.id ?? null;
    const name = attrs?.name ?? "";
    const url = attrs?.url ?? "";

    if (!id && !name && !url) return null;

    return {
        id,
        name,
        url: absoluteMediaUrl(url),
    };
}

function toProcessString(action) {
    const v = String(action || "").trim().toLowerCase();

    if (v === "suggested" || v === "suggested candidate") {
        return "Suggested Candidate";
    }

    if (v === "shortlisted" || v === "shortlisted candidate") {
        return "Shortlisted Candidate";
    }

    if (
        v === "interview" ||
        v === "requested interview" ||
        v === "request interview" ||
        v === "requested interview candidate"
    ) {
        return "Requested Interview";
    }

    if (v === "hired" || v === "hired candidate") {
        return "Hired Candidate";
    }

    if (v === "immigration") {
        return "Immigration";
    }

    if (v === "placed") {
        return "Placed";
    }

    return "Suggested Candidate";
}

function isHiredPipelineStatus(value) {
    const v = String(value || "").trim();

    return (
        v === "Hired Candidate" ||
        v === "Immigration" ||
        v === "Placed"
    );
}

function sanitizeAssignmentRow(row, patch = {}) {
    const oldChatDocIds = getChatDocIds(row?.pipline_chats);
    const patchChatDocIds = Array.isArray(patch?.pipline_chats)
        ? patch.pipline_chats
        : oldChatDocIds;

    return {
        candidate: relationId(row?.candidate),
        candidateProcessList:
            patch.candidateProcessList !== undefined
                ? patch.candidateProcessList
                : row?.candidateProcessList || "Suggested Candidate",
        offerLetter:
            patch.offerLetter !== undefined
                ? patch.offerLetter
                : relationId(row?.offerLetter) || null,
        pipline_chats: {
            connect: uniqueStrings(patchChatDocIds),
        },
    };
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
    return user?.name || user?.username || user?.email || "System";
}

function getUserRoleName(user) {
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
    const role = getUserRoleName(user);

    if (!user?.documentId) return {};

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

    return {};
}


function displayPipelineStage(value) {
    const stage = String(value || "").trim();

    if (!stage) return "—";

    // Display-only rename for notifications.
    // Do not change the Strapi collection value.
    if (stage === "Hired Candidate") {
        return "Offered Candidate";
    }

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

async function getCandidateSummary(base, token, candidateDocumentId) {
    const query = qs.stringify(
        {
            status: "published",
            fields: ["documentId", "fullName", "firstName", "lastName", "referenceNumber"],
        },
        { encodeValuesOnly: true }
    );

    const res = await fetch(`${base}/candidates/${candidateDocumentId}?${query}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

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

async function getJobSummary(base, token, jobDocumentId) {
    const query = qs.stringify(
        {
            status: "published",
            fields: ["documentId", "title", "referenceNo"],
        },
        { encodeValuesOnly: true }
    );

    const res = await fetch(`${base}/jobs/${jobDocumentId}?${query}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

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

async function createCandidatePipelineMoveNotification({
    base,
    token,
    candidateDocumentId,
    jobDocumentId,
    previousProcess,
    nextProcess,
}) {
    try {
        const [candidate, job] = await Promise.all([
            getCandidateSummary(base, token, candidateDocumentId),
            getJobSummary(base, token, jobDocumentId),
        ]);

        const candidateName = getCandidateDisplayName(candidate);
        const candidateReference = candidate?.referenceNumber || "N/A";
        const jobTitle = job?.title || "Untitled Job";
        const jobReference = job?.referenceNo || "N/A";
        const previousStage = displayPipelineStage(previousProcess);
        const nextStage = displayPipelineStage(nextProcess);

        await CreateNotification({
            title: `Candidate Pipeline Updated - job:${jobReference}: ${candidateName}`,
            details: [
                "Existing candidate stage changed.",
                `Job Title: ${jobTitle}.`,
                `Job Reference Number: ${jobReference}.`,
                `Candidate: ${candidateName}.`,
                `Candidate Reference Number: ${candidateReference}.`,
                ` `,
                `Previous Stage: ${previousStage}.`,
                `New Stage: ${nextStage}.`,
            ].join("\n"),
            email: false,
        });
    } catch (notificationError) {
        console.error("Candidate pipeline move notification failed:", notificationError);
    }
}


async function createCandidateRemovedFromJobNotification({
    base,
    token,
    candidateDocumentId,
    jobDocumentId,
    previousProcess,
    removeChatHistory,
    deletionReason,
    deletedHistory,
    candidateJobStatusResult,
}) {
    try {
        const [candidate, job] = await Promise.all([
            getCandidateSummary(base, token, candidateDocumentId),
            getJobSummary(base, token, jobDocumentId),
        ]);

        const candidateName = getCandidateDisplayName(candidate);
        const candidateReference = candidate?.referenceNumber || "N/A";
        const jobTitle = job?.title || "Untitled Job";
        const jobReference = job?.referenceNo || "N/A";
        const pipelineStage = displayPipelineStage(previousProcess);
        const reason = String(deletionReason || "").trim() || "No reason provided.";

        await CreateNotification({
            title: `Candidate Removed from Job - job:${jobReference}: ${candidateName}`,
            details: [
                "Candidate removed from job.",
                `Job Title: ${jobTitle}.`,
                `Job Reference Number: ${jobReference}.`,
                `Candidate: ${candidateName}.`,
                `Candidate Reference Number: ${candidateReference}.`,
                `Pipeline Stage: ${pipelineStage}.`,
                `Remove Record History: ${removeChatHistory ? "Yes" : "No"}.`,
                deletedHistory
                    ? `Record History Deleted: ${deletedHistory.deleted || 0}/${deletedHistory.requested || 0}. Failed: ${deletedHistory.failed || 0}.`
                    : "Record History Deleted: No.",
                `Candidate Old Job Status: ${candidateJobStatusResult?.oldJobStatus || "N/A"}.`,
                `Candidate Job Status Updated To: ${candidateJobStatusResult?.updated ? candidateJobStatusResult?.nextJobStatus || "N/A" : "Not changed"}.`,
                `Deletion Reason: ${reason}`,
            ].join("\n"),
            email: false,
        });
    } catch (notificationError) {
        console.error("Candidate remove from job notification failed:", notificationError);
    }
}

async function createOfferLetterNotification({
    base,
    token,
    candidateDocumentId,
    jobDocumentId,
    pipelineStage,
    offerLetter,
    actionType,
}) {
    try {
        const [candidate, job] = await Promise.all([
            getCandidateSummary(base, token, candidateDocumentId),
            getJobSummary(base, token, jobDocumentId),
        ]);

        const candidateName = getCandidateDisplayName(candidate);
        const candidateReference = candidate?.referenceNumber || "N/A";
        const jobTitle = job?.title || "Untitled Job";
        const jobReference = job?.referenceNo || "N/A";
        const stage = displayPipelineStage(pipelineStage);
        const letterName = offerLetter?.name || "Offer Letter";
        const letterUrl = offerLetter?.url || "N/A";
        const isRemove = actionType === "remove";

        await CreateNotification({
            title: isRemove
                ? `Offer Letter Removed - job:${jobReference}: ${candidateName}`
                : `Offer Letter Uploaded - job:${jobReference}: ${candidateName}`,
            details: [
                isRemove ? "Offer letter removed from job candidate." : "Offer letter uploaded to job candidate.",
                `Job Title: ${jobTitle}.`,
                `Job Reference Number: ${jobReference}.`,
                `Candidate: ${candidateName}.`,
                `Candidate Reference Number: ${candidateReference}.`,
                `Pipeline Stage: ${stage}.`,
                `Offer Letter Name: ${letterName}.`,
                `Offer Letter URL:  ${process.env.NEXT_PUBLIC_ADMIN_BASE_URL}${letterUrl}`,
            ].join("\n"),
            email: false,
        });
    } catch (notificationError) {
        console.error("Offer letter notification failed:", notificationError);
    }
}

/* ---------------- API CALLS ---------------- */

async function getCandidateId(base, token, documentId) {
    const res = await fetch(`${base}/candidates/${documentId}?status=published`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || "Candidate fetch failed");
    }

    const candidateId = json?.data?.id;

    if (!candidateId) {
        throw new Error("Candidate id not found");
    }

    return candidateId;
}

async function getCandidateJobStatus(base, token, candidateDocumentId) {
    const res = await fetch(
        `${base}/candidates/${candidateDocumentId}?status=published&fields[0]=jobStatus`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        }
    );

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        console.error("CANDIDATE JOB STATUS FETCH RESPONSE", json);
        throw new Error(json?.error?.message || "Failed to fetch candidate jobStatus");
    }

    return String(json?.data?.jobStatus || "").trim();
}

async function getJobAssignments(base, token, jobDocumentId) {
    const query = qs.stringify(
        {
            status: "published",
            populate: {
                assignCandidatesToJob: {
                    populate: {
                        candidate: {
                            fields: ["id", "documentId"],
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

    const res = await fetch(`${base}/jobs/${jobDocumentId}?${query}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || "Job fetch failed");
    }

    const job = json?.data || null;

    return Array.isArray(job?.assignCandidatesToJob)
        ? job.assignCandidatesToJob
        : Array.isArray(job?.attributes?.assignCandidatesToJob)
            ? job.attributes.assignCandidatesToJob
            : [];
}

async function updateJobAssignments(base, token, jobDocumentId, rows) {
    const payload = {
        data: {
            assignCandidatesToJob: rows,
        },
    };

    const res = await fetch(`${base}/jobs/${jobDocumentId}?status=published`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    console.log("UPDATE JOB PAYLOAD", json);

    if (!res.ok || json?.error) {
        console.error("UPDATE JOB PAYLOAD", JSON.stringify(payload, null, 2));
        console.error("UPDATE JOB RESPONSE", json);
        throw new Error(json?.error?.message || "Update job failed");
    }

    return json;
}

async function uploadOfferLetter(base, token, file) {
    const fd = new FormData();
    fd.append("files", file, file?.name || "offer-letter");

    const res = await fetch(`${base}/upload`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: fd,
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || "Upload failed");
    }

    const uploaded = Array.isArray(json) ? json[0] : null;

    if (!uploaded?.id) {
        throw new Error("Offer letter upload failed");
    }

    return {
        id: uploaded.id,
        name: uploaded.name || "",
        url: absoluteMediaUrl(uploaded.url || ""),
    };
}

async function updateCandidateJobStatus(base, token, candidateDocumentId, nextJobStatus) {
    const payload = {
        data: {
            jobStatus: nextJobStatus,
        },
    };

    const res = await fetch(`${base}/candidates/${candidateDocumentId}?status=published`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        console.error("CANDIDATE STATUS PAYLOAD", JSON.stringify(payload, null, 2));
        console.error("CANDIDATE STATUS RESPONSE", json);
        throw new Error(json?.error?.message || "Failed to update candidate jobStatus");
    }

    return json;
}

async function updateCandidateJobStatusToAvailableOnlyIfOldHired(
    base,
    token,
    candidateDocumentId
) {
    const oldJobStatus = await getCandidateJobStatus(base, token, candidateDocumentId);

    if (oldJobStatus.toLowerCase() !== "hired") {
        return {
            updated: false,
            oldJobStatus,
            nextJobStatus: null,
        };
    }

    await updateCandidateJobStatus(base, token, candidateDocumentId, "Available");

    return {
        updated: true,
        oldJobStatus,
        nextJobStatus: "Available",
    };
}

async function createSystemChat({
    base,
    token,
    message,
    user,
    jobDocumentId,
    candidateDocumentId,
}) {
    const personRelation = getPersonRelation(user);

    const payload = {
        message,
        private: false,
        isSystemGenerated: true,
        personName: getPersonName(user),
        jobDocumentId: String(jobDocumentId || ""),
        candidateDocumentId: String(candidateDocumentId || ""),
        ...personRelation,
    };

    const res = await fetch(`${base}/pipline-chats?status=published`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            data: payload,
        }),
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        console.error("CREATE SYSTEM CHAT PAYLOAD", JSON.stringify(payload, null, 2));
        console.error("CREATE SYSTEM CHAT RESPONSE", json);
        throw new Error(json?.error?.message || "Failed to create system record");
    }

    return normalize(json?.data);
}

/* ---------------- PIPELINE CHAT DELETE HELPERS ---------------- */

async function findPipelineChatsByJobAndCandidate({
    base,
    token,
    jobDocumentId,
    candidateDocumentId,
}) {
    const all = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
        const query = qs.stringify(
            {
                status: "published",
                filters: {
                    jobDocumentId: {
                        $eq: String(jobDocumentId || ""),
                    },
                    candidateDocumentId: {
                        $eq: String(candidateDocumentId || ""),
                    },
                },
                fields: ["documentId"],
                pagination: {
                    page,
                    pageSize,
                },
            },
            { encodeValuesOnly: true }
        );

        const res = await fetch(`${base}/pipline-chats?${query}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        });

        const json = await readBodySafe(res);

        if (!res.ok || json?.error) {
            console.error("FIND PIPELINE CHATS RESPONSE", json);
            throw new Error(json?.error?.message || "Failed to find pipeline chat history");
        }

        const rows = Array.isArray(json?.data) ? json.data.map(normalize) : [];
        all.push(...rows);

        const pageCount = Number(json?.meta?.pagination?.pageCount || 1);

        if (page >= pageCount) break;

        page += 1;
    }

    return uniqueStrings(all.map((row) => row.documentId));
}

async function deletePipelineChat(base, token, chatDocumentId) {
    if (!chatDocumentId) return { ok: false, skipped: true };

    const res = await fetch(
        `${base}/pipline-chats/${encodeURIComponent(chatDocumentId)}?status=published`,
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        }
    );

    const json = await readBodySafe(res);

    if (!res.ok && res.status !== 404) {
        console.error("DELETE PIPELINE CHAT RESPONSE", json);
        throw new Error(json?.error?.message || "Failed to delete pipeline chat history");
    }

    return { ok: true, status: res.status };
}

async function deletePipelineChats(base, token, chatDocumentIds) {
    const ids = uniqueStrings(chatDocumentIds);

    let deleted = 0;
    let failed = 0;

    for (const id of ids) {
        try {
            await deletePipelineChat(base, token, id);
            deleted += 1;
        } catch (e) {
            failed += 1;
            console.error("Failed to delete pipeline chat:", id, e);
        }
    }

    return {
        requested: ids.length,
        deleted,
        failed,
    };
}

async function deletePipelineChatsForCurrentJobCandidate({
    base,
    token,
    jobDocumentId,
    candidateDocumentId,
    linkedChatIds = [],
}) {
    const chatIdsByFields = await findPipelineChatsByJobAndCandidate({
        base,
        token,
        jobDocumentId,
        candidateDocumentId,
    });

    const allChatIds = uniqueStrings([
        ...linkedChatIds,
        ...chatIdsByFields,
    ]);

    return await deletePipelineChats(base, token, allChatIds);
}

function appendChatDocIdToRow(row, chatDocumentId) {
    const oldChatDocIds = getChatDocIds(row?.pipline_chats);
    return uniqueStrings([...oldChatDocIds, chatDocumentId]);
}

/* ---------------- GET ---------------- */

export async function GET(req) {
    try {
        const base = strapiBase();
        const token = strapiToken();

        if (!base) {
            return Response.json(
                { ok: false, error: "Missing NEXT_PUBLIC_API_BASE_URL env" },
                { status: 500 }
            );
        }

        if (!token) {
            return Response.json(
                { ok: false, error: "Missing STRAPI_TOKEN env" },
                { status: 500 }
            );
        }

        const { searchParams } = new URL(req.url);

        const jobDocumentId = String(searchParams.get("jobDocumentId") || "").trim();
        const candidateDocumentId = String(searchParams.get("candidateDocumentId") || "").trim();

        if (!jobDocumentId || !candidateDocumentId) {
            return Response.json(
                { ok: false, error: "jobDocumentId and candidateDocumentId are required" },
                { status: 400 }
            );
        }

        await assertJobAccess(jobDocumentId);

        const candidateId = await getCandidateId(base, token, candidateDocumentId);
        const rows = await getJobAssignments(base, token, jobDocumentId);

        const matched = rows.find((row) => {
            const rowCandidateId = relationId(row?.candidate);
            return String(rowCandidateId) === String(candidateId);
        });

        return Response.json({
            ok: true,
            candidateId,
            candidateProcessList: matched?.candidateProcessList || "",
            offerLetter: normalizeOfferLetterMedia(matched?.offerLetter),
        });
    } catch (e) {
        return Response.json(
            { ok: false, error: e?.message || "Server error" },
            { status: 500 }
        );
    }
}

/* ---------------- POST ---------------- */

export async function POST(req) {
    try {
        const base = strapiBase();
        const token = strapiToken();
        const user = await getCurrentUser();

        if (!base) {
            return Response.json(
                { ok: false, error: "Missing NEXT_PUBLIC_API_BASE_URL env" },
                { status: 500 }
            );
        }

        if (!token) {
            return Response.json(
                { ok: false, error: "Missing STRAPI_TOKEN env" },
                { status: 500 }
            );
        }

        const contentType = req.headers.get("content-type") || "";

        let jobDocumentId = "";
        let candidateDocumentId = "";
        let action = "";
        let uploadedOfferLetter = null;
        let offerLetterFile = null;
        let removeChatHistory = false;
        let deletionReason = "";

        if (contentType.includes("multipart/form-data")) {
            const form = await req.formData();

            action = String(form.get("action") || "").trim();
            jobDocumentId = String(form.get("jobDocumentId") || "").trim();
            candidateDocumentId = String(form.get("candidateDocumentId") || "").trim();
            removeChatHistory =
                String(form.get("removeChatHistory") || "").toLowerCase() === "true";
            deletionReason = String(form.get("deletionReason") || form.get("reason") || "").trim();



            if (action !== "uploadOfferLetter") {
                return Response.json(
                    { ok: false, error: "Invalid multipart action" },
                    { status: 400 }
                );
            }

            const file = form.get("file");

            if (!file || typeof file === "string") {
                return Response.json(
                    { ok: false, error: "Offer letter file is required" },
                    { status: 400 }
                );
            }

            offerLetterFile = file;
        } else {
            const body = await req.json();

            action = String(body?.action || "").trim();
            jobDocumentId = String(body?.jobDocumentId || "").trim();
            candidateDocumentId = String(body?.candidateDocumentId || "").trim();
            removeChatHistory = Boolean(body?.removeChatHistory);
            deletionReason = String(body?.deletionReason || body?.reason || "").trim();
        }

        if (!jobDocumentId || !action) {
            return Response.json(
                { ok: false, error: "jobDocumentId and action are required" },
                { status: 400 }
            );
        }

        await assertJobAccess(jobDocumentId);

        if (action === "uploadOfferLetter" && offerLetterFile) {
            uploadedOfferLetter = await uploadOfferLetter(base, token, offerLetterFile);
        }

        const rawRows = await getJobAssignments(base, token, jobDocumentId);

        if (!rawRows.length) {
            return Response.json(
                { ok: false, error: "No assignCandidatesToJob rows found" },
                { status: 404 }
            );
        }

        /* ---------------- CLEAR SUGGESTED ---------------- */

        if (action === "clearSuggestedCandidates") {
            const suggestedRows = rawRows.filter(
                (row) => String(row?.candidateProcessList || "") === "Suggested Candidate"
            );

            const suggestedCandidateDocumentIds = uniqueStrings(
                suggestedRows
                    .map((row) => getDocId(row?.candidate))
                    .filter(Boolean)
            );

            const linkedSuggestedChatIds = uniqueStrings(
                suggestedRows.flatMap((row) => getChatDocIds(row?.pipline_chats))
            );

            const updatedRows = rawRows
                .filter(
                    (row) =>
                        String(row?.candidateProcessList || "") !== "Suggested Candidate"
                )
                .map((row) => sanitizeAssignmentRow(row));

            await updateJobAssignments(base, token, jobDocumentId, updatedRows);

            let deletedHistory = {
                requested: 0,
                deleted: 0,
                failed: 0,
                candidates: suggestedCandidateDocumentIds.length,
            };

            const linkedDeleteResult = await deletePipelineChats(
                base,
                token,
                linkedSuggestedChatIds
            );

            deletedHistory.requested += linkedDeleteResult.requested;
            deletedHistory.deleted += linkedDeleteResult.deleted;
            deletedHistory.failed += linkedDeleteResult.failed;

            for (const candidateDocId of suggestedCandidateDocumentIds) {
                const result = await deletePipelineChatsForCurrentJobCandidate({
                    base,
                    token,
                    jobDocumentId,
                    candidateDocumentId: candidateDocId,
                    linkedChatIds: [],
                });

                deletedHistory.requested += result.requested;
                deletedHistory.deleted += result.deleted;
                deletedHistory.failed += result.failed;
            }

            return Response.json({
                ok: true,
                action,
                removedSuggestedCandidates: suggestedRows.length,
                removedRecordHistory: true,
                deletedHistory,
            });
        }

        if (!candidateDocumentId) {
            return Response.json(
                { ok: false, error: "candidateDocumentId is required" },
                { status: 400 }
            );
        }

        const candidateId = await getCandidateId(base, token, candidateDocumentId);

        const targetRawRow = rawRows.find((row) => {
            const rowCandidateId = relationId(row?.candidate);
            return String(rowCandidateId) === String(candidateId);
        });

        if (!targetRawRow) {
            return Response.json(
                { ok: false, error: "Candidate not found in assignCandidatesToJob" },
                { status: 404 }
            );
        }

        /* ---------------- REMOVE CANDIDATE ---------------- */

        if (action === "removeCandidate") {
            const linkedChatIds = getChatDocIds(targetRawRow?.pipline_chats);

            let systemChat = null;

            if (!removeChatHistory) {
                systemChat = await createSystemChat({
                    base,
                    token,
                    message: `Candidate removed from job pipeline. Previous status: ${targetRawRow?.candidateProcessList || "—"
                        }`,
                    user,
                    jobDocumentId,
                    candidateDocumentId,
                });
            }

            const updatedRows = rawRows
                .filter((row) => {
                    const rowCandidateId = relationId(row?.candidate);
                    return String(rowCandidateId) !== String(candidateId);
                })
                .map((row) => sanitizeAssignmentRow(row));

            await updateJobAssignments(base, token, jobDocumentId, updatedRows);

            const deletedHistory = removeChatHistory
                ? await deletePipelineChatsForCurrentJobCandidate({
                    base,
                    token,
                    jobDocumentId,
                    candidateDocumentId,
                    linkedChatIds,
                })
                : null;

            const candidateJobStatusResult =
                await updateCandidateJobStatusToAvailableOnlyIfOldHired(
                    base,
                    token,
                    candidateDocumentId
                );

            await createCandidateRemovedFromJobNotification({
                base,
                token,
                candidateDocumentId,
                jobDocumentId,
                previousProcess: targetRawRow?.candidateProcessList || "",
                removeChatHistory,
                deletionReason,
                deletedHistory,
                candidateJobStatusResult,
            });

            return Response.json({
                ok: true,
                action,
                candidateId,
                systemChat,
                removeChatHistory,
                deletedHistory,
                candidateOldJobStatus: candidateJobStatusResult.oldJobStatus,
                candidateJobStatusUpdatedTo: candidateJobStatusResult.updated
                    ? candidateJobStatusResult.nextJobStatus
                    : null,
            });
        }

        /* ---------------- UPDATE PIPELINE / OFFER LETTER ---------------- */

        let previousProcess = targetRawRow?.candidateProcessList || "";
        let resultProcess = "";
        let resultOfferLetter = null;
        let nextProcessForCandidate = "";
        let systemChat = null;
        let targetPatch = {};
        let offerLetterForNotification = null;

        if (action === "uploadOfferLetter") {
            resultProcess = previousProcess || "Hired Candidate";
            resultOfferLetter = uploadedOfferLetter;

            const oldOffer = normalizeOfferLetterMedia(targetRawRow?.offerLetter);
            offerLetterForNotification = uploadedOfferLetter;

            systemChat = await createSystemChat({
                base,
                token,
                message: oldOffer?.url
                    ? `Offer letter updated. New file: ${uploadedOfferLetter?.name || "Offer Letter"
                    }`
                    : `Offer letter uploaded. File: ${uploadedOfferLetter?.name || "Offer Letter"
                    }`,
                user,
                jobDocumentId,
                candidateDocumentId,
            });

            targetPatch = {
                offerLetter: uploadedOfferLetter?.id || null,
                pipline_chats: appendChatDocIdToRow(
                    targetRawRow,
                    systemChat?.documentId
                ),
            };
        } else if (action === "removeOfferLetter") {
            resultProcess = previousProcess || "";
            resultOfferLetter = null;

            offerLetterForNotification = normalizeOfferLetterMedia(targetRawRow?.offerLetter);

            systemChat = await createSystemChat({
                base,
                token,
                message: "Offer letter removed.",
                user,
                jobDocumentId,
                candidateDocumentId,
            });

            targetPatch = {
                offerLetter: null,
                pipline_chats: appendChatDocIdToRow(
                    targetRawRow,
                    systemChat?.documentId
                ),
            };
        } else {
            const nextProcess = toProcessString(action);

            resultProcess = nextProcess;
            nextProcessForCandidate = nextProcess;
            resultOfferLetter = targetRawRow?.offerLetter
                ? normalizeOfferLetterMedia(targetRawRow.offerLetter)
                : null;

            systemChat = await createSystemChat({
                base,
                token,
                message: `Updated pipeline status from ${previousProcess || "—"
                    } to ${nextProcess}`,
                user,
                jobDocumentId,
                candidateDocumentId,
            });

            targetPatch = {
                candidateProcessList: nextProcess,
                pipline_chats: appendChatDocIdToRow(
                    targetRawRow,
                    systemChat?.documentId
                ),
            };
        }

        const updatedRows = rawRows.map((row) => {
            const rowCandidateId = relationId(row?.candidate);

            if (String(rowCandidateId) !== String(candidateId)) {
                return sanitizeAssignmentRow(row);
            }

            return sanitizeAssignmentRow(row, targetPatch);
        });

        await updateJobAssignments(base, token, jobDocumentId, updatedRows);

        if (action === "uploadOfferLetter") {
            await createOfferLetterNotification({
                base,
                token,
                candidateDocumentId,
                jobDocumentId,
                pipelineStage: resultProcess,
                offerLetter: offerLetterForNotification,
                actionType: "upload",
            });
        } else if (action === "removeOfferLetter") {
            await createOfferLetterNotification({
                base,
                token,
                candidateDocumentId,
                jobDocumentId,
                pipelineStage: resultProcess,
                offerLetter: offerLetterForNotification,
                actionType: "remove",
            });
        }

        /* ---------------- CANDIDATE JOB STATUS RULE ---------------- */

        const isNextHiredPipeline = isHiredPipelineStatus(nextProcessForCandidate);
        const isPreviousHiredPipeline = isHiredPipelineStatus(previousProcess);

        let candidateJobStatusUpdatedTo = null;

        if (isNextHiredPipeline) {
            await updateCandidateJobStatus(
                base,
                token,
                candidateDocumentId,
                "Hired"
            );
            candidateJobStatusUpdatedTo = "Hired";
        } else if (
            isPreviousHiredPipeline &&
            nextProcessForCandidate &&
            !isNextHiredPipeline
        ) {
            const candidateJobStatus = await getCandidateJobStatus(
                base,
                token,
                candidateDocumentId
            );

            if (candidateJobStatus.toLowerCase() === "hired") {
                await updateCandidateJobStatus(
                    base,
                    token,
                    candidateDocumentId,
                    "Available"
                );
                candidateJobStatusUpdatedTo = "Available";
            }
        }

        if (nextProcessForCandidate) {
            await createCandidatePipelineMoveNotification({
                base,
                token,
                candidateDocumentId,
                jobDocumentId,
                previousProcess,
                nextProcess: nextProcessForCandidate,
            });
        }

        return Response.json({
            ok: true,
            action,
            candidateId,
            candidateProcessList: resultProcess,
            offerLetter: resultOfferLetter,
            systemChat,
            candidateJobStatusUpdatedTo,
        });
    } catch (e) {
        return Response.json(
            { ok: false, error: e?.message || "Server error" },
            { status: e?.status || 500 }
        );
    }
}