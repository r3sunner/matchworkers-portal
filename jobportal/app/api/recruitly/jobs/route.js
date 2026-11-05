// GET /api/recruitly/jobs/ – staff only.
// Recruitly jobs for the import screen (R1). One Recruitly call.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { RecruitlyError, createCallCounter, listJobs } from "@/lib/server/recruitly";

export const runtime = "nodejs";

export async function GET(req) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    // Optional filter by Recruitly company, e.g. ?companyId=...
    const companyId = req.nextUrl.searchParams.get("companyId") || "";
    const counter = createCallCounter();

    try {
        const json = await listJobs({ counter });
        const rows = Array.isArray(json?.data) ? json.data : [];

        const jobs = rows
            .filter((job) => !companyId || job?.companyId === companyId)
            .map((job) => ({
                id: job?.id ?? null,
                reference: job?.reference ?? "",
                title: job?.title ?? "",
                companyId: job?.companyId ?? null,
                companyName: job?.companyName ?? "",
                statusName: job?.statusName ?? "",
                openPositions: job?.openPositions ?? null,
                dateOpened: job?.dateOpened ?? null,
            }));

        return NextResponse.json({ ok: true, total: jobs.length, jobs, recruitlyCalls: counter.calls });
    } catch (error) {
        const message = error instanceof RecruitlyError ? error.message : "Recruitly request failed.";
        return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status: 502 });
    }
}
