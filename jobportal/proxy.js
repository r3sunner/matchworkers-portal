import { NextResponse } from "next/server";

// These names exactly match the auth API through lib/auth.js.
const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jp_token";
const USER_COOKIE_NAME = process.env.USER_COOKIE_NAME || "jp_user";

// More-specific routes must come before broader routes.
const PAGE_ACCESS = [
    // Client LIST page is staff-only. Trailing slash is normalized.
    { path: "/staff/client", match: "exact", roles: ["staff"] },
    { path: "/staff/agent", match: "exact", roles: ["staff"] },
    // Keep existing access for dynamic child pages. Change roles to ["staff"]
    // when clients must not open /staff/client/<documentId> either.
    //{ path: "/staff/client", match: "children", roles: ["staff", "clients"] },

    { path: "/search-candidates", match: "prefix", roles: ["staff", "clients"] },

    //jobs/job-list/
    { path: "/jobs/job-list", match: "prefix", roles: ["staff"] },
    { path: "/jobs", match: "prefix", roles: ["staff", "clients"] },
    { path: "/jobs", match: "children", roles: ["staff", "clients"] },
    { path: "/client", match: "prefix", roles: ["staff", "clients"] },
    { path: "/candidate", match: "exact", roles: ["candidates"] },
    { path: "/candidate", match: "children", roles: ["candidates", "staff", "clients"] },
    { path: "/staff", match: "prefix", roles: ["staff"] },
];

function normalizePath(pathname) {
    const path = String(pathname || "/").trim() || "/";
    return path === "/" ? "/" : path.replace(/\/+$/, "");
}

function normalizeRole(rawRole) {
    const value = String(rawRole || "").trim().toLowerCase();

    if (value === "staff" || value === "staffs") return "staff";
    if (value === "client" || value === "clients") return "clients";
    if (value === "candidate" || value === "candidates") return "candidates";

    return value;
}

function getRoleFromUser(user) {
    // auth/login/route.js stores role.name in safeUser.type.
    // Read user.type first because Strapi role.type can be "authenticated".
    return normalizeRole(
        user?.type ||
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.role?.code ||
        user?.roleRaw?.code ||
        user?.role ||
        ""
    );
}

function parseUserCookie(rawValue) {
    if (!rawValue) return null;

    const values = [rawValue];
    try {
        const decoded = decodeURIComponent(rawValue);
        if (decoded !== rawValue) values.push(decoded);
    } catch {
        // Cookie may already be decoded.
    }

    for (const value of values) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object") return parsed;
        } catch {
            // Try the next representation.
        }
    }

    return null;
}

function isPublicPath(pathname) {
    const path = normalizePath(pathname);

    return (
        path === "/" ||
        path === "/login" ||
        path.startsWith("/login/") ||
        path === "/401" ||
        path.startsWith("/401/") ||
        path === "/404" ||
        path.startsWith("/404/") ||
        path === "/restallcookies" ||
        path.startsWith("/restallcookies/")
    );
}

function pathMatchesRule(pathname, rule) {
    const path = normalizePath(pathname);
    const rulePath = normalizePath(rule.path);

    if (rule.match === "exact") return path === rulePath;
    if (rule.match === "children") return path.startsWith(`${rulePath}/`);

    return path === rulePath || path.startsWith(`${rulePath}/`);
}

function getAllowedRoles(pathname) {
    return PAGE_ACCESS.find((rule) => pathMatchesRule(pathname, rule))?.roles || null;
}

function redirectNoStore(url) {
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
}

// Next.js 16: proxy.js runs before the filesystem page is rendered.
export function proxy(request) {
    const { pathname, search } = request.nextUrl;

    if (isPublicPath(pathname)) return NextResponse.next();

    const allowedRoles = getAllowedRoles(pathname);
    if (!allowedRoles) return NextResponse.next();

    const jwt = request.cookies.get(JWT_COOKIE_NAME)?.value || "";
    const user = parseUserCookie(
        request.cookies.get(USER_COOKIE_NAME)?.value || ""
    );

    if (!jwt || !user) {
        const loginUrl = new URL("/login/", request.url);
        loginUrl.searchParams.set("next", `${pathname}${search}`);
        return redirectNoStore(loginUrl);
    }

    const role = getRoleFromUser(user);

    if (!role) {
        const loginUrl = new URL("/login/", request.url);
        loginUrl.searchParams.set("next", `${pathname}${search}`);
        return redirectNoStore(loginUrl);
    }

    if (!allowedRoles.includes(role)) {
        const unauthorizedUrl = new URL("/401/", request.url);
        unauthorizedUrl.searchParams.set("from", pathname);
        return redirectNoStore(unauthorizedUrl);
    }

    return NextResponse.next();
}

export const config = {
    // Page routes only. Secure API routes separately.
    matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
