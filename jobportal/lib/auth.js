import { cookies } from "next/headers";

export const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jp_token";
export const USER_COOKIE_NAME = process.env.USER_COOKIE_NAME || "jp_user";

function normalizeRole(value) {
    const role = String(value || "").trim().toLowerCase();

    if (role === "staff" || role === "staffs") return "staff";
    if (role === "client" || role === "clients") return "clients";
    if (role === "candidate" || role === "candidates") return "candidates";

    return role;
}

export function extractUserRole(user) {
    // Strapi's role.type is commonly "authenticated". The actual portal role
    // is stored in role.name (for example: staff, clients, candidates), so the
    // name and the user's explicit type must be checked before role.type.
    const raw =
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.type ||
        user?.role?.code ||
        user?.roleRaw?.code ||
        (typeof user?.role === "string" ? user.role : "") ||
        (typeof user?.roleRaw === "string" ? user.roleRaw : "") ||
        user?.role?.type ||
        user?.roleRaw?.type ||
        "";

    return normalizeRole(raw);
}

function parseUserCookie(raw) {
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        try {
            return JSON.parse(decodeURIComponent(raw));
        } catch {
            return null;
        }
    }
}

export async function getSession() {
    const cookieStore = await cookies();

    const token = cookieStore.get(JWT_COOKIE_NAME)?.value || null;
    const userRaw = cookieStore.get(USER_COOKIE_NAME)?.value || null;
    const user = parseUserCookie(userRaw);

    return {
        token,
        user,
        role: extractUserRole(user),
        isLoggedIn: Boolean(token && user),
    };
}
