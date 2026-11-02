import { NextResponse } from "next/server";
import { CreateNotification } from "@/lib/server/notification";

export const runtime = "nodejs";

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));

        const result = await CreateNotification({
            title: body?.title,
            details: body?.details,
            email: Boolean(body?.email),
        });

        const status = result?.ok === false ? 500 : 200;

        return NextResponse.json(result, { status });
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error: error?.message || "Notification request failed",
            },
            { status: 500 }
        );
    }
}
