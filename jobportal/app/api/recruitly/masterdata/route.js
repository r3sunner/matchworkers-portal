// GET /api/recruitly/masterdata/ – staff only.
// Recruitly lists the import maps by ID: pipeline sub-stages, placement
// statuses, employment types, genders. One Recruitly call; no personal data.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { RecruitlyError, createCallCounter, getMasterdata } from "@/lib/server/recruitly";

export const runtime = "nodejs";

const idName = (list) =>
    (Array.isArray(list) ? list : []).map((item) => ({ id: item?.id ?? null, name: item?.name ?? "" }));

export async function GET() {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const counter = createCallCounter();

    try {
        const json = await getMasterdata({ counter });

        return NextResponse.json({
            ok: true,
            jobPipelineStages: idName(json?.jobPipelineStages),
            placementStatuses: idName(json?.placementStatuses),
            employmentTypes: idName(json?.employmentTypes),
            genders: idName(json?.genders),
            recruitlyCalls: counter.calls,
        });
    } catch (error) {
        const message = error instanceof RecruitlyError ? error.message : "Recruitly request failed.";
        return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status: 502 });
    }
}
