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
