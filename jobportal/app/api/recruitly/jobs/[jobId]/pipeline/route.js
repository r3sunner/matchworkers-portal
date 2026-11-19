// GET /api/recruitly/jobs/<jobId>/pipeline/ – staff only.
// Pipeline for one Recruitly job, rejected entries removed (R1), each entry
// with the portal stage it would get (Q7, stage mapping table). One Recruitly
// call (cached for a minute, shared with the portal-job step), plus the placement list only when the job has a Placed entry, plus
// Recruitly's stage list at most every 5 minutes.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import {
    RecruitlyError,
    createCallCounter,
    jobPipelineForImport,
    placementsForJob,
} from "@/lib/server/recruitly";
import { ACTION, mapPipelineEntry, placementStatusFor } from "@/lib/server/recruitlyStages";
import { loadStageLookup } from "@/lib/server/recruitlyStageMap";

export const runtime = "nodejs";

export async function GET(req, { params }) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { jobId } = await params;
    const counter = createCallCounter();

    try {
        // Shared 1-minute cache with the portal-job lock check on the same screen
        // (one Recruitly call for both); "Reload from Recruitly" reads it fresh.
        const fresh = req.nextUrl.searchParams.get("fresh") === "1";
        const { entries: rows, total: recruitlyTotal, complete } = await jobPipelineForImport(jobId, { counter, fresh });
        const active = rows.filter((entry) => entry?.rejected !== true);

        const placementList = await placementsForJob(active, jobId, { counter, fresh });
        const stageLookup = await loadStageLookup({ counter, fresh });

        const entries = active.map((entry) => {
            const placementStatus = placementList
                ? placementStatusFor(placementList.placements, entry?.candidateId, entry?.jobId || jobId)
                : null;
            const mapped = mapPipelineEntry(entry, { placementStatus, stageLookup });

            return {
                pipelineId: entry?.id ?? null,
                candidateId: entry?.candidateId ?? null,
                candidateName: entry?.candidateName ?? "",
                status: entry?.status ?? "",
                stage: entry?.stage ?? "",
                createdOn: entry?.createdOn ?? null,
                placementStatus,
                action: mapped.action,
                portalStage: mapped.portalStage,
                reason: mapped.reason,
            };
        });

        const count = (action) => entries.filter((e) => e.action === action).length;

        return NextResponse.json({
            ok: true,
            jobId,
            complete,
            placementsComplete: placementList ? placementList.complete : null,
            recruitlyTotal,
            total: entries.length,
            rejectedHidden: rows.length - active.length,
            summary: {
                show: count(ACTION.SHOW),
                hide: count(ACTION.HIDE),
                remove: count(ACTION.REMOVE),
            },
            entries,
            recruitlyCalls: counter.calls,
        });
    } catch (error) {
        const message = error instanceof RecruitlyError ? error.message : "Recruitly request failed.";
        const status = error instanceof RecruitlyError && error.status === 404 ? 404 : 502;
        return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status });
    }
}
