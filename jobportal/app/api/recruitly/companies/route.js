// GET /api/recruitly/companies/ – staff only.
// Recruitly companies that have jobs, taken from the job list (Recruitly has
// no separate company call here). One Recruitly call.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { RecruitlyError, createCallCounter, listJobsCached } from "@/lib/server/recruitly";

export const runtime = "nodejs";

export async function GET() {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const counter = createCallCounter();

    try {
        const json = await listJobsCached({ counter });
        const byId = new Map();

        for (const job of Array.isArray(json?.data) ? json.data : []) {
            if (!job?.companyId) continue;
            const company = byId.get(job.companyId) || { id: job.companyId, name: job.companyName || "", jobCount: 0 };
            company.jobCount += 1;
            byId.set(job.companyId, company);
        }

        const companies = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ ok: true, total: companies.length, companies, recruitlyCalls: counter.calls });
    } catch (error) {
        const message = error instanceof RecruitlyError ? error.message : "Recruitly request failed.";
        return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status: 502 });
    }
}
