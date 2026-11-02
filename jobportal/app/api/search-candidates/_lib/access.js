import { getSession } from "@/lib/auth";

export class SearchCandidatesAccessError extends Error {
    constructor(message, status = 403) {
        super(message);
        this.name = "SearchCandidatesAccessError";
        this.status = status;
    }
}

function normalizeRoleName(session) {
    const user = session?.user || {};
    const role = session?.role ?? user?.role ?? user?.roleRaw ?? "";

    return String(
        role?.name ||
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.type ||
        (typeof role === "string" ? role : "") ||
        (typeof user?.role === "string" ? user.role : "") ||
        user?.role?.type ||
        role?.type ||
        ""
    )
        .trim()
        .toLowerCase();
}

function clientDocumentIdFromSession(session) {
    const user = session?.user || {};
    const possibleValues = [
        user?.documentId,
        user?.clientDocumentId,
        user?.client?.documentId,
        user?.client?.data?.documentId,
        user?.client?.data?.attributes?.documentId,
        user?.data?.documentId,
        user?.profile?.documentId,
    ];

    return String(
        possibleValues.find((value) => String(value || "").trim()) || ""
    ).trim();
}

export async function requireSearchCandidatesAccess() {
    const session = await getSession();

    if (!session?.user || session?.isLoggedIn === false) {
        throw new SearchCandidatesAccessError("Login required", 401);
    }

    const roleName = normalizeRoleName(session);

    if (roleName === "staff") {
        return {
            session,
            user: session.user,
            roleName,
            isStaff: true,
            isClient: false,
            clientDocumentId: "",
        };
    }

    if (roleName === "client" || roleName === "clients") {
        const clientDocumentId = clientDocumentIdFromSession(session);

        if (!clientDocumentId) {
            throw new SearchCandidatesAccessError(
                "Your logged-in client account does not contain a document ID. Please log out and log in again.",
                403
            );
        }

        return {
            session,
            user: session.user,
            roleName,
            isStaff: false,
            isClient: true,
            clientDocumentId,
        };
    }

    throw new SearchCandidatesAccessError(
        "You do not have permission to search candidates",
        403
    );
}

export function searchCandidatesErrorResponse(error) {
    const status = Number(error?.status || 500);

    return Response.json(
        {
            ok: false,
            error: error?.message || "Server error",
        },
        { status: Number.isFinite(status) ? status : 500 }
    );
}
