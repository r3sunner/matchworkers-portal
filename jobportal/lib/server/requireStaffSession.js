import { cookies } from "next/headers";

const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jp_token";
const USER_COOKIE_NAME = process.env.USER_COOKIE_NAME || "jp_user";

function normalizeRole(value) {
    const role = String(value || "").trim().toLowerCase();

    if (role === "staff" || role === "staffs") return "staff";
    if (role === "client" || role === "clients") return "clients";
    if (role === "candidate" || role === "candidates") return "candidates";

    return role;
}

function parseUserCookie(rawValue) {
    if (!rawValue) return null;

    const attempts = [rawValue];

    try {
        attempts.push(decodeURIComponent(rawValue));
    } catch {
        // Keep the original value only.
    }

    for (const value of attempts) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object") return parsed;
        } catch {
            // Try the next representation.
        }
    }

    return null;
}

function getRoleFromUser(user) {
    return normalizeRole(
        user?.type ||
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.role?.code ||
        user?.role?.type ||
        user?.roleRaw ||
        user?.role ||
        ""
    );
}

// Server-checked staff session for the Recruitly import (and R7 later).
// Ignores the editable jp_user cookie: the jp_token is verified with Strapi
// /users/me, then the role is read on the server with the API token.
export async function verifyStaffSession() {
    const cookieStore = await cookies();
    const token = cookieStore.get(JWT_COOKIE_NAME)?.value || "";
    const strapiUrl = String(process.env.STRAPI_BASE_URL || "").replace(/\/+$/, "");
    const apiToken = process.env.STRAPI_TOKEN || "";

    const unauthorized = { ok: false, status: 401, error: "Unauthorized", user: null, role: "" };

    if (!token) return unauthorized;

    if (!strapiUrl || !apiToken) {
        console.error("[STAFF_SESSION] STRAPI_BASE_URL or STRAPI_TOKEN is not set.");
        return { ok: false, status: 500, error: "Server configuration error.", user: null, role: "" };
    }

    try {
        const meRes = await fetch(`${strapiUrl}/users/me`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        });

        if (!meRes.ok) return unauthorized;

        const me = await meRes.json().catch(() => null);
        if (!me?.id) return unauthorized;

        if (me.blocked) {
            return { ok: false, status: 403, error: "Forbidden", user: null, role: "" };
        }

        const userRes = await fetch(`${strapiUrl}/users/${encodeURIComponent(me.id)}?populate=role`, {
            method: "GET",
            headers: { Authorization: `Bearer ${apiToken}` },
            cache: "no-store",
        });

        if (!userRes.ok) {
            console.error("[STAFF_SESSION] Role lookup failed:", userRes.status);
            return { ok: false, status: 500, error: "Could not check user role.", user: null, role: "" };
        }

        const fullUser = await userRes.json().catch(() => null);
        const role = normalizeRole(fullUser?.role?.name);
        const user = { id: me.id, documentId: me.documentId, email: me.email, username: me.username };

        if (role !== "staff") {
            return { ok: false, status: 403, error: "Forbidden", user, role };
        }

        return { ok: true, status: 200, error: "", user, role };
    } catch (error) {
        console.error("[STAFF_SESSION] Check failed:", error?.name || "Error");
        return { ok: false, status: 500, error: "Could not check session.", user: null, role: "" };
    }
}

export async function getStaffSession() {
    const cookieStore = await cookies();
    const token = cookieStore.get(JWT_COOKIE_NAME)?.value || "";
    const rawUser = cookieStore.get(USER_COOKIE_NAME)?.value || "";
    const user = parseUserCookie(rawUser);
    const role = getRoleFromUser(user);

    if (!token || !user) {
        return {
            ok: false,
            status: 401,
            error: "Unauthorized",
            user: null,
            role: "",
        };
    }

    if (role !== "staff") {
        return {
            ok: false,
            status: 403,
            error: "Only staff can use File Manager.",
            user,
            role,
        };
    }

    return {
        ok: true,
        status: 200,
        error: "",
        user,
        role,
    };
}
