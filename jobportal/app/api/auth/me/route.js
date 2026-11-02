// app/api/auth/me/route.js
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
    try {
        const session = await getSession();

        if (!session.isLoggedIn) {
            return NextResponse.json(
                { ok: false, user: null, role: null },
                { status: 401 }
            );
        }

        return NextResponse.json({
            ok: true,
            user: session.user,
            role: session.role,
        });
    } catch (error) {
        console.error("[AUTH_ME_ERROR]", error);
        return NextResponse.json(
            { ok: false, error: "Failed to get current user." },
            { status: 500 }
        );
    }
}



