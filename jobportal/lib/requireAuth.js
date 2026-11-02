import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function requireAuth(allowedRoles = []) {
    const session = await getSession();

    if (!session?.isLoggedIn) {
        return {
            ok: false,
            response: NextResponse.json(
                { ok: false, error: "Unauthorized" },
                { status: 401 }
            ),
        };
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
        return {
            ok: false,
            response: NextResponse.json(
                { ok: false, error: "Forbidden" },
                { status: 403 }
            ),
        };
    }

    return {
        ok: true,
        session,
    };
}