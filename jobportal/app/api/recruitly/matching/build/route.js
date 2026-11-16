// POST /api/recruitly/matching/build/ – staff only. R4 review screen.
// Builds the suggested Recruitly matches for existing portal candidates.
// Run from the review screen in steps so staff see progress and no request
// runs long:
//   { step: "start" }  → one review row per unlinked portal candidate (rows staff
//                        already decided are kept as they are), returns the
//                        portal jobs to check. 1 Recruitly call (job list, cached).
//   { step: "jobs", jobs: [{ documentId, referenceNo, recruitlyJobId }] }
//                      → up to 3 jobs: reads each Recruitly job's pipeline
//                        (1 call per job) and adds same-name suggestions.
// Nothing is linked here: staff confirm or reject each candidate.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { RecruitlyError, createCallCounter, listAllJobPipeline, listJobsCached, mapLimit } from "@/lib/server/recruitly";
import { PortalStrapiError } from "@/lib/server/portalStrapi";
import {
    MATCH_STATUS,
    allMatchRows,
    createMatchRow,
    matchRowsFor,
    mergeSuggestions,
    portalJobsWithCandidates,
    suggestForJob,
    takenRecruitlyIds,
    unlinkedCandidates,
    updateMatchRow,
} from "@/lib/server/recruitlyMatching";

export const runtime = "nodejs";

const MAX_JOBS_PER_REQUEST = 3;

async function start(counter) {
    const [candidates, rows, jobs, jobList] = await Promise.all([
        unlinkedCandidates(),
        allMatchRows(),
        portalJobsWithCandidates(),
        listJobsCached({ counter }),
    ]);

    const unlinked = new Set(candidates.map((c) => c.documentId));
    const rowByCandidate = new Map(rows.map((r) => [r.candidateDocumentId, r]));
    let created = 0;
    let reset = 0;
    let linkedElsewhere = 0;

    // One row per unlinked candidate; open rows start again with no suggestions.
    await mapLimit(candidates, 5, async (c) => {
        const row = rowByCandidate.get(c.documentId);
        if (!row) {
            await createMatchRow({ candidateDocumentId: c.documentId, status: MATCH_STATUS.NONE, suggestions: [] });
            created += 1;
        } else if (row.status === MATCH_STATUS.PENDING || row.status === MATCH_STATUS.NONE) {
            await updateMatchRow(row.documentId, { status: MATCH_STATUS.NONE, suggestions: [] });
            reset += 1;
        }
    });

    // Open rows whose candidate was linked meanwhile (e.g. by an import): closed.
    await mapLimit(
        rows.filter((r) => !unlinked.has(r.candidateDocumentId) && (r.status === MATCH_STATUS.PENDING || r.status === MATCH_STATUS.NONE)),
        5,
        async (r) => {
            await updateMatchRow(r.documentId, { status: MATCH_STATUS.CONFIRMED, note: "Linked by a Recruitly import", suggestions: [] });
            linkedElsewhere += 1;
        }
    );

    // Portal jobs with at least one unlinked candidate, and their Recruitly job (same reference).
    const recruitlyByRef = new Map(
        (Array.isArray(jobList?.data) ? jobList.data : [])
            .filter((j) => j?.reference)
            .map((j) => [String(j.reference).trim().toUpperCase(), String(j.id)])
    );
    const toCheck = [];
    let notInRecruitly = 0;
    for (const job of jobs) {
        if (!job.candidates.some((c) => unlinked.has(c.documentId))) continue;
        const recruitlyJobId = job.recruitlyJobId || recruitlyByRef.get(job.referenceNo.toUpperCase());
        if (!recruitlyJobId) {
            notInRecruitly += 1;
            continue;
        }
        toCheck.push({ documentId: job.documentId, referenceNo: job.referenceNo, recruitlyJobId });
    }

    return { candidates: candidates.length, created, reset, linkedElsewhere, jobs: toCheck, jobsNotInRecruitly: notInRecruitly };
}

async function checkJobs(jobsIn, counter) {
    const portalJobs = await portalJobsWithCandidates();
    const byDoc = new Map(portalJobs.map((j) => [j.documentId, j]));
    let suggested = 0;
    const failed = [];

    // One job at a time: two jobs can suggest for the same candidate.
    for (const item of jobsIn) {
        const job = byDoc.get(String(item?.documentId || ""));
        if (!job || !item?.recruitlyJobId) continue;
        const onJob = job.candidates.filter((c) => !c.recruitlyId);
        if (!onJob.length) continue;

        let entries;
        try {
            ({ entries } = await listAllJobPipeline(String(item.recruitlyJobId), { counter }));
        } catch (error) {
            console.error("[RECRUITLY_MATCHING] Pipeline failed:", job.referenceNo, error?.message);
            failed.push(job.referenceNo);
            continue;
        }

        const taken = await takenRecruitlyIds(entries.map((e) => e?.candidateId));
        const found = suggestForJob({ portalCandidates: onJob, entries, jobRef: job.referenceNo, takenRecruitlyIds: taken });
        if (!found.size) continue;

        const rows = await matchRowsFor([...found.keys()]);
        for (const row of rows) {
            if (row.status !== MATCH_STATUS.PENDING && row.status !== MATCH_STATUS.NONE) continue;
            const suggestions = mergeSuggestions(row.suggestions, found.get(row.candidateDocumentId));
            await updateMatchRow(row.documentId, { status: MATCH_STATUS.PENDING, suggestions });
            suggested += 1;
        }
    }
    return { suggested, failed };
}

export async function POST(req) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const body = await req.json().catch(() => null);
    const counter = createCallCounter();

    try {
        if (body?.step === "start") {
            const result = await start(counter);
            console.log(
                `[RECRUITLY_MATCHING] ${session.user?.email || "staff"} start: ${result.candidates} unlinked, ${result.jobs.length} jobs to check, Recruitly calls ${counter.calls}`
            );
            return NextResponse.json({ ok: true, ...result, recruitlyCalls: counter.calls });
        }

        if (body?.step === "jobs") {
            const jobs = Array.isArray(body.jobs) ? body.jobs.slice(0, MAX_JOBS_PER_REQUEST) : [];
            const result = await checkJobs(jobs, counter);
            return NextResponse.json({ ok: true, ...result, recruitlyCalls: counter.calls });
        }

        return NextResponse.json({ ok: false, error: "Unknown step." }, { status: 400 });
    } catch (error) {
        console.error("[RECRUITLY_MATCHING] Build failed:", error?.message);
        const message =
            error instanceof RecruitlyError
                ? "Recruitly request failed. Please try again in a minute."
                : error instanceof PortalStrapiError
                  ? `Could not save in the portal: ${error.message}`
                  : "Could not build the suggestions.";
        return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status: 502 });
    }
}
