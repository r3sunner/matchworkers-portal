import { CreateNotification } from "@/lib/server/notification";
import { NextResponse } from "next/server";
import qs from "qs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- BASE HELPERS ---------------- */

function strapiBase() {
    return (process.env.STRAPI_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "")
        .trim()
        .replace(/\/$/, "");
}

function strapiToken() {
    return String(process.env.STRAPI_TOKEN || process.env.API_TOKEN || "").trim();
}

function ok(data = {}, status = 200) {
    return NextResponse.json({ ok: true, ...data }, { status });
}

function fail(error = "Something went wrong", status = 400, extra = {}) {
    return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function cleanString(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
}

async function readBodySafe(res) {
    const text = await res.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

/* ---------------- LOGGED USER ---------------- */

function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function getLoggedUserFromCookies(req) {
    const cookieStore = req.cookies;

    const userCookieName = process.env.USER_COOKIE_NAME || "user";
    const jwtCookieName = process.env.JWT_COOKIE_NAME || "jwt";

    const possibleUserCookies = [userCookieName, "user", "safeUser", "auth_user"];

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

    return { loggedUser, jwt };
}

function getUserDisplayName(user) {
    return (
        user?.name ||
        user?.fullName ||
        user?.companyName ||
        user?.username ||
        user?.email ||
        "Unknown User"
    );
}

function getUserRole(user) {
    return (
        user?.role?.name ||
        user?.role?.type ||
        user?.role ||
        user?.type ||
        user?.roleRaw ||
        "Unknown Role"
    );
}

/* ---------------- STRAPI FETCH ---------------- */

async function strapiFetch(path, options = {}) {
    const base = strapiBase();
    const token = strapiToken();

    if (!base) throw new Error("STRAPI_BASE_URL or NEXT_PUBLIC_API_BASE_URL is missing");
    if (!token) throw new Error("STRAPI_TOKEN or API_TOKEN is missing");

    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

    const headers = {
        Authorization: token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
    };

    const res = await fetch(url, {
        ...options,
        headers,
        redirect: "manual",
        cache: "no-store",
    });

    if (res.status >= 300 && res.status < 400) {
        const error = new Error(
            `Strapi redirect detected (${res.status}). Fix STRAPI_BASE_URL. location=${res.headers.get("location")}`
        );
        error.status = 500;
        throw error;
    }

    const json = await readBodySafe(res);

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

/* ---------------- NORMALIZE ---------------- */

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
        documentId: item.documentId || attrs.documentId,
        name: attrs.name || "",
        url: attrs.url || "",
    };
}

function getMediaId(media) {
    const normalized = normalizeMedia(media);
    return normalized?.id || null;
}

function getUserFromClient(client) {
    const rel = client?.users_permissions_user;
    const d = rel?.data ?? rel;
    const attrs = d?.attributes ?? d;

    return {
        id: d?.id ?? null,
        username: attrs?.username || "",
        email: attrs?.email || "",
    };
}

function normalizeClient(raw) {
    const item = unwrapData(raw);
    if (!item) return null;

    const attrs = item.attributes || item;

    return {
        id: item.id,
        documentId: item.documentId || attrs.documentId,

        companyName: attrs.companyName || "",
        contactName: attrs.contactName || "",
        designation: attrs.designation || "",
        city: attrs.city || "",
        phone: attrs.phone || "",
        email: attrs.email || "",
        leadStatus: attrs.leadStatus || "Lead",

        logo: attrs.logo,
        users_permissions_user: attrs.users_permissions_user,

        raw: item,
    };
}

function getClientName(client) {
    return (
        client?.companyName ||
        client?.contactName ||
        client?.designation ||
        client?.email ||
        client?.documentId ||
        `Client ID ${client?.id || "Unknown"}`
    );
}

function collectClientMediaIds(client) {
    const ids = new Set();

    const logoId = getMediaId(client.logo);
    if (logoId) ids.add(logoId);

    return [...ids];
}

/* ---------------- OPERATIONS ---------------- */

async function getClientByDocumentId(documentId) {
    const query = qs.stringify(
        {
            populate: {
                logo: true,
                users_permissions_user: true,
                contactList: true,
            },
        },
        { encodeValuesOnly: true }
    );

    const json = await strapiFetch(`/clients/${documentId}?${query}`, {
        method: "GET",
    });

    return normalizeClient(json?.data);
}

async function deleteMediaFile(fileId) {
    if (!fileId) return { ok: false, skipped: true };

    try {
        await strapiFetch(`/upload/files/${fileId}`, {
            method: "DELETE",
        });

        return { ok: true, fileId };
    } catch (error) {
        console.error("Client media delete failed:", {
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
        };
    }
}

async function deleteLoginUser(userId) {
    const id = Number(userId);

    if (!Number.isFinite(id) || id <= 0) {
        return { ok: false, skipped: true, message: "No valid linked user id" };
    }

    try {
        await strapiFetch(`/users/${id}`, {
            method: "DELETE",
        });

        return { ok: true, userId: id };
    } catch (error) {
        console.error("Client linked user delete failed:", {
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
        };
    }
}

async function deleteClient(documentId) {
    await strapiFetch(`/clients/${documentId}`, {
        method: "DELETE",
    });

    return true;
}

async function createClientDeletionLog({
    loggedUser,
    actor,
    clients,
    deletedMediaCount,
    failedMediaDeletes,
    deletedUserCount,
    failedUserDeletes,
}) {
    const userName = actor?.name || getUserDisplayName(loggedUser);
    const userType = actor?.userType || getUserRole(loggedUser);

    const clientNames = clients.map(getClientName).filter(Boolean);

    const details = [
        `${userName} deleted ${clients.length} client(s).`,
        `Deleted client(s): ${clientNames.join(", ")}.`,
        `Deleted logo/media file count: ${deletedMediaCount}.`,
        `Deleted linked login user count: ${deletedUserCount}.`,
        failedMediaDeletes.length
            ? `Some media files could not be deleted. Failed media IDs: ${failedMediaDeletes.map((m) => m.fileId).filter(Boolean).join(", ")}.`
            : "All detected client media files were processed.",
        failedUserDeletes.length
            ? `Some linked login users could not be deleted. Failed user IDs: ${failedUserDeletes.map((u) => u.userId).filter(Boolean).join(", ")}.`
            : "All detected linked users were processed.",
        "This client delete action was recorded for future traceability.",
    ].join(" ");

    const payload = {
        data: {
            title: "Client Deletion",
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
            const deletedClientNames = clientNames.length
                ? clientNames.join(", ")
                : "Unknown Client";

            const notificationTitle =
                clients.length === 1
                    ? `Client Deleted (${deletedClientNames})`
                    : `Clients Deleted (${clients.length})`;

            const notificationDetails = [
                `${clients.length} client${clients.length === 1 ? "" : "s"} deleted successfully.`,
                `Deleted client${clients.length === 1 ? "" : "s"}: ${deletedClientNames}.`,
                `Deleted logo/media file count: ${deletedMediaCount}.`,
                `Deleted linked login user count: ${deletedUserCount}.`,
            ].join(" ");

            await CreateNotification({
                title: notificationTitle,
                details: notificationDetails,
                email: false,
            });
        } catch (notificationError) {
            console.error("Client deletion notification failed:", notificationError);
        }

        /**********end**create notification************/

        return {
            ok: true,
            data: json?.data || json,
        };
    } catch (error) {
        console.error("Client deletion log create failed:", {
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

        if (!body) return fail("Invalid request body", 400);

        const confirmationText = cleanString(
            body.confirmationText ||
            body.confirmText ||
            body.deleteConfirmation ||
            body.confirmation ||
            ""
        ).toLowerCase();

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
            body.clientDocumentIds ||
            body.documentIds ||
            body.ids ||
            body.clients ||
            [];

        const clientDocumentIds = Array.isArray(inputIds)
            ? inputIds
                .map((id) => {
                    if (typeof id === "string") return id;
                    return id?.documentId || id?.id || "";
                })
                .filter(Boolean)
            : [];

        const uniqueDocumentIds = [...new Set(clientDocumentIds)];

        if (!uniqueDocumentIds.length) {
            return fail("No client selected for deletion.", 400);
        }

        const clientsToDelete = [];
        const fetchErrors = [];

        for (const documentId of uniqueDocumentIds) {
            try {
                const client = await getClientByDocumentId(documentId);

                if (!client) {
                    fetchErrors.push({ documentId, error: "Client not found" });
                    continue;
                }

                clientsToDelete.push(client);
            } catch (error) {
                console.error("Client fetch before delete failed:", {
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

        if (!clientsToDelete.length) {
            return fail("Selected clients could not be found.", 404, { fetchErrors });
        }

        const deletedClients = [];
        const failedClientDeletes = [];

        const deletedMedia = [];
        const failedMediaDeletes = [];

        const deletedUsers = [];
        const failedUserDeletes = [];

        for (const client of clientsToDelete) {
            try {
                await deleteClient(client.documentId);

                deletedClients.push({
                    id: client.id,
                    documentId: client.documentId,
                    companyName: getClientName(client),
                });
            } catch (error) {
                console.error("Client delete failed:", {
                    documentId: client.documentId,
                    message: error.message,
                    status: error.status,
                    response: error.response,
                });

                failedClientDeletes.push({
                    id: client.id,
                    documentId: client.documentId,
                    companyName: getClientName(client),
                    error: error.message,
                    status: error.status,
                    response: error.response,
                });

                continue;
            }

            const mediaIds = collectClientMediaIds(client);

            for (const fileId of mediaIds) {
                const mediaResult = await deleteMediaFile(fileId);

                if (mediaResult.ok) deletedMedia.push(mediaResult);
                else failedMediaDeletes.push(mediaResult);
            }

            const linkedUser = getUserFromClient(client);

            if (linkedUser?.id) {
                const userResult = await deleteLoginUser(linkedUser.id);

                if (userResult.ok) deletedUsers.push(userResult);
                else failedUserDeletes.push(userResult);
            }
        }

        let logResult = null;

        if (deletedClients.length) {
            const successfullyDeletedIds = new Set(deletedClients.map((client) => client.documentId));
            const successfullyDeletedClients = clientsToDelete.filter((client) =>
                successfullyDeletedIds.has(client.documentId)
            );

            logResult = await createClientDeletionLog({
                loggedUser,
                actor: body.actor || null,
                clients: successfullyDeletedClients,
                deletedMediaCount: deletedMedia.length,
                failedMediaDeletes,
                deletedUserCount: deletedUsers.length,
                failedUserDeletes,
            });
        }

        return ok({
            message: `${deletedClients.length} client(s) deleted successfully.`,
            deletedCount: deletedClients.length,
            deletedClients,
            failedClientDeletes,
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
        console.error("Client delete route failed:", {
            message: error.message,
            status: error.status,
            response: error.response,
        });

        return fail(error?.message || "Client deletion failed", error?.status || 500, {
            details: error?.response || null,
        });
    }
}
