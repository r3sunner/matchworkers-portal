import { NextResponse } from "next/server";
import qs from "qs";
import { CreateNotification } from "@/lib/server/notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- BASE URLS ---------------- */

function strapiBase() {
    return (
        process.env.STRAPI_BASE_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        ""
    )
        .trim()
        .replace(/\/$/, "");
}

function strapiToken() {
    return String(process.env.STRAPI_TOKEN || process.env.API_TOKEN || "").trim();
}

/* ---------------- RESPONSE HELPERS ---------------- */

function ok(data = {}, status = 200) {
    return NextResponse.json({ ok: true, ...data }, { status });
}

function fail(error = "Something went wrong", status = 400, extra = {}) {
    return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/* ---------------- SAFE JSON ---------------- */

function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

async function readJsonSafe(res) {
    const text = await res.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

/* ---------------- LOGGED USER FROM COOKIES ---------------- */

function getLoggedUserFromCookies(req) {
    const cookieStore = req.cookies;

    const userCookieName = process.env.USER_COOKIE_NAME || "user";
    const jwtCookieName = process.env.JWT_COOKIE_NAME || "jwt";

    const possibleUserCookies = [
        userCookieName,
        "user",
        "safeUser",
        "auth_user",
    ];

    let loggedUser = null;

    for (const name of possibleUserCookies) {
        const raw = cookieStore.get(name)?.value;
        if (!raw) continue;

        const decoded = decodeURIComponent(raw);
        const parsed = safeJsonParse(decoded);

        if (parsed) {
            loggedUser = parsed;
            break;
        }
    }

    const jwt =
        cookieStore.get(jwtCookieName)?.value ||
        cookieStore.get("jwt")?.value ||
        cookieStore.get("token")?.value ||
        "";

    return {
        loggedUser,
        jwt,
    };
}

function getUserDisplayName(user, actor) {
    return (
        actor?.name ||
        actor?.fullName ||
        actor?.username ||
        actor?.email ||
        user?.name ||
        user?.fullName ||
        user?.companyName ||
        user?.username ||
        user?.email ||
        "Unknown User"
    );
}

function getUserRole(user, actor) {
    return (
        actor?.userType ||
        actor?.role ||
        user?.role?.name ||
        user?.role?.type ||
        user?.role ||
        user?.type ||
        user?.roleRaw ||
        "Unknown Role"
    );
}


function normalizeRoleName(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function isStaffDeleteUser(loggedUser, actor) {
    const userType = normalizeRoleName(getUserRole(loggedUser, actor));
    return userType === "staff";
}

/* ---------------- STRAPI FETCH HELPER ---------------- */

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}

async function strapiFetch(path, options = {}) {
    const base = strapiBase();
    const token = strapiToken();

    if (!base) {
        throw new Error("STRAPI_BASE_URL or NEXT_PUBLIC_API_BASE_URL is missing");
    }

    if (!token) {
        throw new Error("STRAPI_TOKEN or API_TOKEN is missing");
    }

    const url = joinUrl(base, path);

    const headers = {
        Authorization: token.toLowerCase().startsWith("bearer ")
            ? token
            : `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
    };

    const res = await fetch(url, {
        ...options,
        headers,
        cache: "no-store",
        redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        const error = new Error(
            `Strapi redirect detected (${res.status}). Fix Strapi base URL. location=${loc}`
        );
        error.status = 500;
        error.url = url;
        throw error;
    }

    const json = await readJsonSafe(res);

    if (!res.ok) {
        const message =
            json?.error?.message ||
            json?.message ||
            json?.raw ||
            `Strapi request failed with status ${res.status}`;

        const error = new Error(message);
        error.status = res.status;
        error.response = json;
        error.url = url;
        throw error;
    }

    return json;
}

/* ---------------- NORMALIZE HELPERS ---------------- */

function unwrapData(value) {
    if (!value) return null;
    if (value?.data) return value.data;
    return value;
}

function normalizeMedia(media) {
    const item = unwrapData(media);
    if (!item) return null;

    const attrs = item.attributes || item;

    return {
        id: item.id,
        documentId: item.documentId || attrs.documentId || "",
        name: attrs.name || "",
        url: attrs.url || "",
    };
}

function getMediaId(media) {
    const normalized = normalizeMedia(media);
    const id = Number(normalized?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeUser(userRelation) {
    const item = unwrapData(userRelation);
    if (!item) return null;

    const attrs = item.attributes || item;

    return {
        id: item.id,
        username: attrs.username || "",
        email: attrs.email || "",
    };
}

function normalizeCandidate(raw) {
    const item = unwrapData(raw);
    if (!item) return null;

    const attrs = item.attributes || item;
    const documents = Array.isArray(attrs.documents) ? attrs.documents : [];

    return {
        id: item.id,
        documentId: item.documentId || attrs.documentId || "",

        fullName: attrs.fullName || "",
        firstName: attrs.firstName || "",
        lastName: attrs.lastName || "",
        mobile: attrs.mobile || "",
        email: attrs.email || "",
        referenceNumber: attrs.referenceNumber || "",

        // Valid candidate schema media fields
        profileImage: attrs.profileImage,
        CV: attrs.CV,
        passport: attrs.passport,

        // Valid candidate schema text link fields, not media fields
        workingVideoLink: attrs.workingVideoLink || "",
        miScreeningVideoLink: attrs.miScreeningVideoLink || "",

        users_permissions_user: attrs.users_permissions_user,
        user: normalizeUser(attrs.users_permissions_user),

        documents,
        raw: item,
    };
}

function getCandidateName(candidate) {
    const fullName = String(candidate?.fullName || "").trim();

    if (fullName) return fullName;

    const combined = [candidate?.firstName, candidate?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

    return (
        combined ||
        candidate?.email ||
        candidate?.referenceNumber ||
        candidate?.documentId ||
        `Candidate ID ${candidate?.id || "Unknown"}`
    );
}

function collectCandidateMediaIds(candidate) {
    const ids = new Set();

    // Only fields available in your candidate schema:
    // profileImage, CV, passport, documents.file
    const directMediaFields = [
        candidate.profileImage,
        candidate.CV,
        candidate.passport,
    ];

    for (const media of directMediaFields) {
        const id = getMediaId(media);
        if (id) ids.add(id);
    }

    if (Array.isArray(candidate.documents)) {
        for (const doc of candidate.documents) {
            const fileId = getMediaId(doc?.file);
            if (fileId) ids.add(fileId);
        }
    }

    return [...ids];
}

/* ---------------- FETCH CANDIDATE BEFORE DELETE ---------------- */

async function getCandidateByDocumentId(documentId) {
    const query = qs.stringify(
        {
            populate: {
                profileImage: true,
                CV: true,
                passport: true,
                users_permissions_user: true,
                documents: {
                    populate: {
                        file: true,
                    },
                },
            },
        },
        { encodeValuesOnly: true }
    );

    const json = await strapiFetch(`/candidates/${documentId}?${query}`, {
        method: "GET",
    });

    return normalizeCandidate(json?.data);
}

/* ---------------- DELETE MEDIA ---------------- */

async function deleteMediaFile(fileId) {
    if (!fileId) return { ok: false, skipped: true };

    try {
        await strapiFetch(`/upload/files/${fileId}`, {
            method: "DELETE",
        });

        return { ok: true, fileId };
    } catch (error) {
        console.error("Media delete failed:", {
            fileId,
            message: error.message,
            status: error.status,
            response: error.response,
        });

        return {
            ok: false,
            fileId,
            error: error.message,
            status: error.status,
            response: error.response,
        };
    }
}

/* ---------------- DELETE CANDIDATE AND USER ---------------- */

async function deleteCandidate(documentId) {
    await strapiFetch(`/candidates/${documentId}`, {
        method: "DELETE",
    });

    return true;
}

async function deleteUser(userId) {
    const id = Number(userId);

    if (!Number.isFinite(id) || id <= 0) {
        return {
            ok: false,
            skipped: true,
            error: "No valid user id",
        };
    }

    try {
        await strapiFetch(`/users/${id}`, {
            method: "DELETE",
        });

        return {
            ok: true,
            userId: id,
        };
    } catch (error) {
        console.error("User delete failed:", {
            userId: id,
            message: error.message,
            status: error.status,
            response: error.response,
        });

        return {
            ok: false,
            userId: id,
            error: error.message,
            status: error.status,
            response: error.response,
        };
    }
}

/* ---------------- CREATE LOG IN STRAPI ---------------- */

async function createCandidateDeletionLog({
    loggedUser,
    actor,
    candidates,
    deletedMediaCount,
    failedMediaDeletes,
    deletedUsers,
    failedUserDeletes,
}) {
    const userName = getUserDisplayName(loggedUser, actor);
    const userType = getUserRole(loggedUser, actor);

    const candidateNames = candidates.map(getCandidateName).filter(Boolean);
    const candidateReferences = candidates
        .map((candidate) => candidate.referenceNumber)
        .filter(Boolean);
    const candidateDocumentIds = candidates
        .map((candidate) => candidate.documentId)
        .filter(Boolean);

    const details = [
        `${userName} deleted ${candidates.length} candidate(s) from the candidate portal.`,
        `Deleted candidate name(s): ${candidateNames.join(", ") || "N/A"}.`,
        `Reference number(s): ${candidateReferences.join(", ") || "N/A"}.`,
        `Document ID(s): ${candidateDocumentIds.join(", ") || "N/A"}.`,
        `Deleted media file count: ${deletedMediaCount}.`,
        `Deleted related login user count: ${deletedUsers.length}.`,
        failedMediaDeletes.length
            ? `Some media files could not be deleted. Failed media IDs: ${failedMediaDeletes
                .map((m) => m.fileId)
                .filter(Boolean)
                .join(", ")}.`
            : "All detected candidate media files were processed.",
        failedUserDeletes.length
            ? `Some related users could not be deleted. Failed user IDs: ${failedUserDeletes
                .map((u) => u.userId)
                .filter(Boolean)
                .join(", ")}.`
            : "All detected related login users were processed.",
        "This delete action is permanent and was recorded for future traceability.",
    ].join(" ");

    const payload = {
        data: {
            title: "Candidate Deletion",
            user: userName,
            userType,
            action: "Delete",
            details,
        },
    };

    try {
        const json = await strapiFetch(`/logs?status=published`, {
            method: "POST",
            body: JSON.stringify(payload),
        });


        /************create notification************/
        try {
            const deletedCandidateNames = candidateNames.length
                ? candidateNames.join(", ")
                : "Unknown Candidate";

            const notificationTitle =
                candidates.length === 1
                    ? `Candidate Deleted (${deletedCandidateNames})`
                    : `Candidates Deleted (${candidates.length})`;

            const notificationDetails = [
                `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} deleted successfully.`,
                `Deleted candidate${candidates.length === 1 ? "" : "s"}: ${deletedCandidateNames}.`,
                `Reference number${candidateReferences.length === 1 ? "" : "s"}: ${candidateReferences.join(", ") || "N/A"}.`,
                `Document ID${candidateDocumentIds.length === 1 ? "" : "s"}: ${candidateDocumentIds.join(", ") || "N/A"}.`,
                `Deleted media file count: ${deletedMediaCount}.`,
                `Deleted related login user count: ${deletedUsers.length}.`,
            ].join(" ");

            await CreateNotification({
                title: notificationTitle,
                details: notificationDetails,
                email: false,
            });
        } catch (notificationError) {
            console.error("Candidate deletion notification failed:", notificationError);
        }

        /*********end***create notification************/

        return {
            ok: true,
            data: json?.data || json,
        };
    } catch (error) {
        console.error("Candidate deletion log create failed:", {
            message: error.message,
            status: error.status,
            response: error.response,
            payload,
        });

        return {
            ok: false,
            error: error.message,
            status: error.status,
            response: error.response,
        };
    }
}

/* ---------------- MAIN ROUTE ---------------- */

export async function POST(req) {
    try {
        const { loggedUser } = getLoggedUserFromCookies(req);
        const body = await req.json().catch(() => null);

        if (!body) {
            return fail("Invalid request body", 400);
        }

        const actor = body.actor || null;

        if (!isStaffDeleteUser(loggedUser, actor)) {
            return fail("Only staff can delete candidates.", 403, {
                userType: getUserRole(loggedUser, actor),
            });
        }

        const confirmationText = String(
            body.confirmationText ||
            body.confirmText ||
            body.deleteConfirmation ||
            body.confirmation ||
            ""
        )
            .trim()
            .toLowerCase();

        const allowedConfirmations = [
            "permeability delete",
            "permanently delete",
            "permanent delete",
            "delete",
            "yes",
        ];

        if (!allowedConfirmations.includes(confirmationText)) {
            return fail('Please type "permeability delete" to confirm deletion.', 400);
        }

        const inputIds =
            body.candidateDocumentIds ||
            body.documentIds ||
            body.ids ||
            body.candidates ||
            [];

        const candidateDocumentIds = Array.isArray(inputIds)
            ? inputIds
                .map((id) => {
                    if (typeof id === "string") return id;
                    return id?.documentId || id?.id || "";
                })
                .map((id) => String(id || "").trim())
                .filter(Boolean)
            : [];

        const uniqueDocumentIds = [...new Set(candidateDocumentIds)];

        if (!uniqueDocumentIds.length) {
            return fail("No candidate selected for deletion.", 400);
        }

        const candidatesToDelete = [];
        const fetchErrors = [];

        for (const documentId of uniqueDocumentIds) {
            try {
                const candidate = await getCandidateByDocumentId(documentId);

                if (!candidate) {
                    fetchErrors.push({
                        documentId,
                        error: "Candidate not found",
                    });
                    continue;
                }

                candidatesToDelete.push(candidate);
            } catch (error) {
                console.error("Candidate fetch before delete failed:", {
                    documentId,
                    message: error.message,
                    status: error.status,
                    response: error.response,
                });

                fetchErrors.push({
                    documentId,
                    error: error.message,
                    status: error.status,
                    response: error.response,
                });
            }
        }

        if (!candidatesToDelete.length) {
            return fail("Selected candidates could not be found.", 404, {
                fetchErrors,
            });
        }

        const deletedCandidates = [];
        const failedCandidateDeletes = [];

        const deletedMedia = [];
        const failedMediaDeletes = [];

        const deletedUsers = [];
        const failedUserDeletes = [];

        for (const candidate of candidatesToDelete) {
            const mediaIds = collectCandidateMediaIds(candidate);
            const relatedUserId = candidate?.user?.id || null;

            try {
                // Delete candidate first. Only delete media/user if candidate delete succeeds.
                await deleteCandidate(candidate.documentId);

                deletedCandidates.push({
                    id: candidate.id,
                    documentId: candidate.documentId,
                    name: getCandidateName(candidate),
                    referenceNumber: candidate.referenceNumber || "",
                });

                for (const fileId of mediaIds) {
                    const mediaResult = await deleteMediaFile(fileId);

                    if (mediaResult.ok) {
                        deletedMedia.push(mediaResult);
                    } else {
                        failedMediaDeletes.push(mediaResult);
                    }
                }

                if (relatedUserId) {
                    const userResult = await deleteUser(relatedUserId);

                    if (userResult.ok) {
                        deletedUsers.push(userResult);
                    } else if (!userResult.skipped) {
                        failedUserDeletes.push(userResult);
                    }
                }
            } catch (error) {
                console.error("Candidate delete failed:", {
                    documentId: candidate.documentId,
                    message: error.message,
                    status: error.status,
                    response: error.response,
                });

                failedCandidateDeletes.push({
                    id: candidate.id,
                    documentId: candidate.documentId,
                    name: getCandidateName(candidate),
                    referenceNumber: candidate.referenceNumber || "",
                    error: error.message,
                    status: error.status,
                    response: error.response,
                });
            }
        }

        let logResult = null;

        if (deletedCandidates.length) {
            const successfullyDeletedIds = new Set(
                deletedCandidates.map((candidate) => candidate.documentId)
            );

            const successfullyDeletedCandidates = candidatesToDelete.filter(
                (candidate) => successfullyDeletedIds.has(candidate.documentId)
            );

            logResult = await createCandidateDeletionLog({
                loggedUser,
                actor,
                candidates: successfullyDeletedCandidates,
                deletedMediaCount: deletedMedia.length,
                failedMediaDeletes,
                deletedUsers,
                failedUserDeletes,
            });
        }






        return ok({
            message: `${deletedCandidates.length} candidate(s) deleted successfully.`,
            requestedCount: uniqueDocumentIds.length,
            foundCount: candidatesToDelete.length,
            deletedCount: deletedCandidates.length,

            deletedCandidates,
            failedCandidateDeletes,
            fetchErrors,

            deletedMediaCount: deletedMedia.length,
            deletedMedia,
            failedMediaDeletes,

            deletedUserCount: deletedUsers.length,
            deletedUsers,
            failedUserDeletes,

            logCreated: !!logResult?.ok,
            logResult,
        });
    } catch (error) {
        console.error("Candidate bulk delete route failed:", {
            message: error.message,
            status: error.status,
            response: error.response,
        });

        return fail(error.message || "Candidate deletion failed", error.status || 500, {
            response: error.response,
        });
    }
}
