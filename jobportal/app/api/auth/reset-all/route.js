// app/api/auth/reset-all/route.js
import { NextResponse } from "next/server";
import { JWT_COOKIE_NAME, USER_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function expireCookie(response, name, httpOnly = false) {
    response.cookies.set(name, "", {
        httpOnly,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
    });
}

function createResetResponse(request) {
    const response = NextResponse.json({
        ok: true,
        redirectTo: "/login/",
    });

    expireCookie(response, JWT_COOKIE_NAME, true);
    expireCookie(response, USER_COOKIE_NAME, false);

    for (const cookie of request.cookies.getAll()) {
        expireCookie(response, cookie.name, false);
    }

    // Do not use "executionContexts" here. It can terminate this page's
    // JavaScript before the browser reaches the login redirect.
    response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
    response.headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
}

export async function POST(request) {
    return createResetResponse(request);
}

export async function GET(request) {
    return createResetResponse(request);
}
