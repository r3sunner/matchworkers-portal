// GET /api/recruitly/jobs/<jobId>/pipeline/ – staff only.
// Pipeline for one Recruitly job, every entry, rejected entries removed (R1).
// One Recruitly call.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { RecruitlyError, createCallCounter, listAllJobPipeline } from "@/lib/server/recruitly";

export const runtime = "nodejs";

export async function GET(req, { params }) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { jobId } = await params;
    const counter = createCallCounter();

    try {
        const { entries: rows, total: recruitlyTotal, complete } = await listAllJobPipeline(jobId, { counter });
        const active = rows.filter((entry) => entry?.rejected !== true);

        const entries = active.map((entry) => ({
            pipelineId: entry?.id ?? null,
            candidateId: entry?.candidateId ?? null,
            candidateName: entry?.candidateName ?? "",
            status: entry?.status ?? "",
            stage: entry?.stage ?? "",
            createdOn: entry?.createdOn ?? null,
        }));

        return NextResponse.json({
            ok: true,
            jobId,
            complete,
            recruitlyTotal,
            total: entries.length,
            rejectedHidden: rows.length - active.length,
            entries,
            recruitlyCalls: counter.calls,
        });
    } catch (error) {
        const message = error instanceof RecruitlyError ? error.message : "Recruitly request failed.";
        const status = error instanceof RecruitlyError && error.status === 404 ? 404 : 502;
        return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status });
    }
}
