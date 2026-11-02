// app/api/auth/logout/route.js
import { NextResponse } from "next/server";
import { JWT_COOKIE_NAME, USER_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
    const isProd = process.env.NODE_ENV === "production";

    const response = NextResponse.json({ ok: true });

    const cookieOptions = {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0), // 👈 force delete
    };

    // Delete JWT cookie (httpOnly)
    response.cookies.set(JWT_COOKIE_NAME, "", {
        ...cookieOptions,
        httpOnly: true,
    });

    // Delete USER cookie (client readable)
    response.cookies.set(USER_COOKIE_NAME, "", {
        ...cookieOptions,
        httpOnly: false,
    });

    return response;
}