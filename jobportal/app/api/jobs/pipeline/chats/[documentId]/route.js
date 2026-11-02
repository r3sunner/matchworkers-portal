export const runtime = "nodejs";

import { cookies } from "next/headers";
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

function assertValidPerson(user) {
    if (!user) {
        throw Object.assign(new Error("Login required"), { status: 401 });
    }

    if (!user?.documentId) {
        throw Object.assign(new Error("Logged-in user documentId not found"), {
            status: 401,
        });
    }

    const role = getUserRole(user);

    if (
        role !== "staff" &&
        role !== "staffs" &&
        role !== "client" &&
        role !== "clients"
    ) {
        throw Object.assign(
            new Error("Logged-in user role not found. Only staff or client can edit pipeline chat."),
            { status: 403 }
        );
    }

    return true;
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

function parseHistory(value) {
    try {
        const rows = value ? JSON.parse(value) : [];
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}


async function createPipelineRecordEditNotification({
    STRAPI_BASE_URL,
    jobDocumentId,
    candidateDocumentId,
    oldMessage,
    newMessage,
    oldPrivate,
    newPrivate,
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

        await CreateNotification({
            title: `Pipeline Record Updated - ${jobReference} - ${candidateName}`,
            details: [
                "Pipeline Record Updated",
                `Job Title: ${jobTitle}`,
                `Job Reference Number: ${jobReference}`,
                `Candidate Full Name: ${candidateName}`,
                `Candidate Reference Number: ${candidateReference}`,
                `Previous Privacy: ${oldPrivate ? "Private" : "Public"}`,
                `New Privacy: ${newPrivate ? "Private" : "Public"}`,
                `Previous Message: ${oldMessage || "N/A"}`,
                `New Message: ${newMessage}`,
                `Updated By: ${getPersonName(user) || "System"}`,
            ].join("\n"),
            email: false,
        });
    } catch (notificationError) {
        console.error("Pipeline record edit notification failed:", notificationError);
    }
}

export async function PUT(req, { params }) {
    try {
        const STRAPI_BASE_URL = getStrapiBaseUrl();

        if (!STRAPI_BASE_URL) {
            return Response.json(
                { ok: false, error: "Missing Strapi base URL env" },
                { status: 500 }
            );
        }

        const p = await params;
        const documentId = String(p?.documentId || "").trim();
        const body = await req.json();

        if (!documentId) {
            return Response.json(
                { ok: false, error: "Missing chat documentId" },
                { status: 400 }
            );
        }

        const user = await getCurrentUser();
        assertValidPerson(user);

        const getRes = await fetch(
            joinUrl(
                STRAPI_BASE_URL,
                `pipline-chats/${encodeURIComponent(documentId)}?status=published`
            ),
            {
                headers: {
                    Authorization: getBearer(),
                },
                cache: "no-store",
            }
        );

        const getJson = await readBodySafe(getRes);

        if (!getRes.ok) {
            return Response.json(
                { ok: false, error: "Chat not found", details: getJson },
                { status: getRes.status }
            );
        }

        const old = normalize(getJson?.data);

        if (old?.isSystemGenerated) {
            return Response.json(
                { ok: false, error: "System generated chat cannot be edited" },
                { status: 400 }
            );
        }

        const message = String(body?.message || "").trim();

        if (!message) {
            return Response.json(
                { ok: false, error: "Message is required" },
                { status: 400 }
            );
        }

        const jobDocumentId = String(
            old?.jobDocumentId ||
            body?.jobDocumentId ||
            ""
        ).trim();

        const candidateDocumentId = String(
            old?.candidateDocumentId ||
            body?.candidateDocumentId ||
            ""
        ).trim();

        if (!jobDocumentId || !candidateDocumentId) {
            return Response.json(
                {
                    ok: false,
                    error: "jobDocumentId and candidateDocumentId are required for pipeline chat",
                },
                { status: 400 }
            );
        }

        await assertJobAccess(jobDocumentId);

        const history = parseHistory(old?.history);

        history.push({
            message: old?.message || "",
            private: !!old?.private,
            personName: old?.personName || "",
            jobDocumentId: old?.jobDocumentId || jobDocumentId,
            candidateDocumentId: old?.candidateDocumentId || candidateDocumentId,
            createdAt: old?.createdAt || "",
            updatedAt: old?.updatedAt || "",
            editedAt: new Date().toISOString(),
            editedBy: getPersonName(user),
            editedByRole: getUserRole(user),
        });

        const updateRes = await fetch(
            joinUrl(
                STRAPI_BASE_URL,
                `pipline-chats/${encodeURIComponent(documentId)}?status=published`
            ),
            {
                method: "PUT",
                headers: {
                    Authorization: getBearer(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    data: {
                        message,
                        private: !!body?.private,
                        history: JSON.stringify(history),

                        // ✅ required fields after schema update
                        jobDocumentId,
                        candidateDocumentId,
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
                    error: "Failed to update chat",
                    details: updateJson,
                },
                { status: updateRes.status }
            );
        }

        await createPipelineRecordEditNotification({
            STRAPI_BASE_URL,
            jobDocumentId,
            candidateDocumentId,
            oldMessage: old?.message || "",
            newMessage: message,
            oldPrivate: !!old?.private,
            newPrivate: !!body?.private,
            user,
        });

        return Response.json({
            ok: true,
            item: normalize(updateJson?.data),
        });
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
