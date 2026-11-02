import qs from "qs";
import { getSession } from "@/lib/auth";

function normalizeRow(value) {
    const row = value?.data ?? value;

    if (row?.attributes) {
        return {
            id: row.id,
            documentId: row.documentId || row.attributes?.documentId || "",
            ...row.attributes,
        };
    }

    return row || null;
}

function relationDocumentId(value) {
    const raw = value?.data ?? value;

    if (Array.isArray(raw)) {
        for (const item of raw) {
            const documentId = relationDocumentId(item);
            if (documentId) return documentId;
        }
        return "";
    }

    const row = normalizeRow(raw);
    return String(row?.documentId || "").trim();
}

function normalizeRole(session) {
    const user = session?.user || null;
    const candidates = [
        user?.role?.name,
        user?.roleRaw?.name,
        session?.role,
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

function strapiConfig() {
    const baseUrl = String(
        process.env.STRAPI_BASE_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        process.env.STRAPI_URL ||
        ""
    )
        .trim()
        .replace(/\/+$/, "");

    const rawToken = String(
        process.env.STRAPI_TOKEN ||
        process.env.STRAPI_API_TOKEN ||
        ""
    ).trim();

    const authorization = rawToken
        ? rawToken.toLowerCase().startsWith("bearer ")
            ? rawToken
            : `Bearer ${rawToken}`
        : "";

    return { baseUrl, authorization };
}

async function readJsonSafe(response) {
    const text = await response.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

function accessError(message, status, details = null) {
    return Object.assign(new Error(message), { status, details });
}

export async function assertJobAccess(jobDocumentId) {
    const normalizedJobDocumentId = String(jobDocumentId || "").trim();

    if (!normalizedJobDocumentId) {
        throw accessError("Job documentId is required", 400);
    }

    const session = await getSession();
    const role = normalizeRole(session);
    const user = session?.user || null;

    if (!session?.isLoggedIn || !user) {
        throw accessError("Login required", 401);
    }

    if (role === "staff") {
        return {
            role,
            user,
            jobDocumentId: normalizedJobDocumentId,
            clientDocumentId: "",
        };
    }

    if (role !== "clients") {
        throw accessError("Only staff or clients can access this job", 403);
    }

    const loggedInClientDocumentId = String(user?.documentId || "").trim();

    if (!loggedInClientDocumentId) {
        throw accessError("Logged-in client documentId was not found", 401);
    }

    const { baseUrl, authorization } = strapiConfig();

    if (!baseUrl || !authorization) {
        throw accessError("Missing Strapi server configuration", 500);
    }

    const query = qs.stringify(
        {
            status: "published",
            fields: ["documentId", "title"],
            populate: {
                client: {
                    fields: ["documentId", "companyName"],
                },
            },
        },
        { encodeValuesOnly: true }
    );

    const response = await fetch(
        `${baseUrl}/jobs/${encodeURIComponent(normalizedJobDocumentId)}?${query}`,
        {
            headers: { Authorization: authorization },
            cache: "no-store",
        }
    );

    const json = await readJsonSafe(response);

    if (response.status === 404 || !json?.data) {
        throw accessError("Job not found", 404);
    }

    if (!response.ok) {
        throw accessError("Failed to verify job access", response.status, json);
    }

    const job = normalizeRow(json.data);
    const jobClientDocumentId = relationDocumentId(job?.client);

    if (!jobClientDocumentId) {
        throw accessError("This job is not linked to a client", 403);
    }

    if (jobClientDocumentId !== loggedInClientDocumentId) {
        throw accessError("You do not have permission to access this job", 403);
    }

    return {
        role,
        user,
        job,
        jobDocumentId: normalizedJobDocumentId,
        clientDocumentId: jobClientDocumentId,
    };
}
