// /api/recruitly/jobs/<jobId>/portal-job/ – staff only. Step 4 of the import:
// which portal job a Recruitly job belongs to. Done once per Recruitly job,
// before candidates are shown; later imports go to that portal job.
//
// GET  ?clientDocumentId=<id>
//      The portal job already linked to this Recruitly job, or the client's
//      portal jobs not linked to Recruitly yet (closest title first).
// POST { clientDocumentId, portalJobDocumentId } – link that portal job
//      (everything on it kept), or { clientDocumentId, createNew: true } –
//      create a new portal job for the client. With replace: true (Change) the
//      current link is removed first.
// DELETE { clientDocumentId } – Remove link. Only the link is cleared; the
//      portal job and its candidates stay.
// Change and Remove link are refused once this Recruitly job's candidates have
// been imported onto the linked job (an administrator fixes a wrong link in
// Strapi). To check, the job's pipeline is read (cached for a minute), only when
// the linked job holds Recruitly-linked candidates at all.
//
// Never matched by JB number: the portal's numbers are its own.
// Recruitly: the cached job list (0 calls when warm); the job record itself only
// if missing there, or to create the portal job (short description).
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { RecruitlyError, createCallCounter, getJob, jobPipelineForImport, listJobsCached } from "@/lib/server/recruitly";
import { PortalStrapiError } from "@/lib/server/portalStrapi";
import { JobImportError, findOrCreatePortalJob, loadClient, portalJobChoices, unlinkPortalJob } from "@/lib/server/recruitlyJobImport";

export const runtime = "nodejs";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

// Client + Recruitly job, checked to belong together.
async function loadPair(jobId, clientDocumentId, counter) {
    if (!ID_PATTERN.test(String(jobId || ""))) throw new JobImportError("Invalid Recruitly job.", 400);
    if (!ID_PATTERN.test(clientDocumentId)) throw new JobImportError("Invalid portal client.", 400);

    const client = await loadClient(clientDocumentId);
    if (!client) throw new JobImportError("Portal client not found.", 404);
    if (!client.recruitlyCompanyId) throw new JobImportError("This client is not linked to a Recruitly company.", 400);

    let fullJob = null;
    const loadFullJob = async () => {
        if (!fullJob) {
            const json = await getJob(jobId, { counter });
            fullJob = json?.data && !Array.isArray(json.data) ? json.data : json;
        }
        return fullJob;
    };
    const jobList = await listJobsCached({ counter });
    let recruitlyJob = (Array.isArray(jobList?.data) ? jobList.data : []).find((j) => String(j?.id) === jobId);
    if (!recruitlyJob) recruitlyJob = await loadFullJob();
    if (!recruitlyJob?.id) throw new JobImportError("Recruitly job not found.", 404);
    if (recruitlyJob.companyId !== client.recruitlyCompanyId) {
        throw new JobImportError("This Recruitly job belongs to a different company than the client's link.", 400);
    }
    // Candidate IDs on the Recruitly job (rejected ones included), for the lock check.
    const loadRecruitlyCandidateIds = async () => {
        const { entries } = await jobPipelineForImport(jobId, { counter });
        return new Set(entries.map((e) => String(e?.candidateId || "")).filter(Boolean));
    };
    return { client, recruitlyJob, loadFullJob, loadRecruitlyCandidateIds };
}

function failure(error, counter) {
    if (error instanceof JobImportError) {
        return NextResponse.json({ ok: false, error: error.message, recruitlyCalls: counter.calls }, { status: error.status });
    }
    if (error instanceof RecruitlyError) {
        return NextResponse.json({ ok: false, error: error.message, recruitlyCalls: counter.calls }, { status: 502 });
    }
    console.error("[RECRUITLY_PORTAL_JOB]", error instanceof PortalStrapiError ? error.message : error?.name || "Error");
    return NextResponse.json({ ok: false, error: "Could not load or save the portal job.", recruitlyCalls: counter.calls }, { status: 500 });
}

const summary = (job) => ({ documentId: job.documentId, referenceNo: job.referenceNo || "", title: job.title || "" });

export async function GET(req, { params }) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }
    const { jobId } = await params;
    const counter = createCallCounter();
    try {
        const { client, recruitlyJob, loadRecruitlyCandidateIds } = await loadPair(
            jobId,
            String(req.nextUrl.searchParams.get("clientDocumentId") || ""),
            counter
        );
        const { linked, options } = await portalJobChoices(recruitlyJob, client, { loadRecruitlyCandidateIds });
        return NextResponse.json({ ok: true, jobId, linked, options, recruitlyCalls: counter.calls });
    } catch (error) {
        return failure(error, counter);
    }
}

export async function POST(req, { params }) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }
    const { jobId } = await params;
    const body = await req.json().catch(() => null);
    const portalJobDocumentId = String(body?.portalJobDocumentId || "");
    const createNew = body?.createNew === true;
    const replace = body?.replace === true;
    const counter = createCallCounter();
    try {
        if (portalJobDocumentId && !ID_PATTERN.test(portalJobDocumentId)) throw new JobImportError("Invalid portal job.", 400);
        if (!portalJobDocumentId && !createNew) throw new JobImportError("Choose a portal job or create a new one.", 400);

        const { client, recruitlyJob, loadFullJob, loadRecruitlyCandidateIds } = await loadPair(
            jobId,
            String(body?.clientDocumentId || ""),
            counter
        );
        let previous = null;
        if (replace) {
            const { linked } = await portalJobChoices(recruitlyJob, client, { loadRecruitlyCandidateIds });
            if (linked?.locked) {
                throw new JobImportError(
                    "Candidates have been imported to this portal job, so the link can't be changed here. Ask your administrator if it is wrong.",
                    409
                );
            }
            if (linked && linked.documentId === portalJobDocumentId) {
                return NextResponse.json({ ok: true, jobId, linked, created: false, joined: false, recruitlyCalls: counter.calls });
            }
            previous = await unlinkPortalJob(recruitlyJob, client, { loadRecruitlyCandidateIds });
        }
        const { job, created, joined } = await findOrCreatePortalJob(recruitlyJob, client, {
            loadFullJob,
            portalJobDocumentId,
            createNew: !portalJobDocumentId && createNew,
        });
        console.log(
            `[RECRUITLY_IMPORT] ${session.user?.email || "staff"} job ${jobId}: portal job ${job.referenceNo || job.documentId} ${created ? "created" : joined ? "linked (chosen by staff)" : "already linked"}${previous ? ` (link moved from ${previous.referenceNo || previous.documentId})` : ""}, Recruitly calls ${counter.calls}`
        );
        return NextResponse.json({ ok: true, jobId, linked: summary(job), created, joined, recruitlyCalls: counter.calls });
    } catch (error) {
        return failure(error, counter);
    }
}

export async function DELETE(req, { params }) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }
    const { jobId } = await params;
    const body = await req.json().catch(() => null);
    const counter = createCallCounter();
    try {
        const { client, recruitlyJob, loadRecruitlyCandidateIds } = await loadPair(jobId, String(body?.clientDocumentId || ""), counter);
        const previous = await unlinkPortalJob(recruitlyJob, client, { loadRecruitlyCandidateIds });
        console.log(
            `[RECRUITLY_IMPORT] ${session.user?.email || "staff"} job ${jobId}: portal job link removed${previous ? ` (${previous.referenceNo || previous.documentId})` : " (nothing was linked)"}`
        );
        const { options } = await portalJobChoices(recruitlyJob, client);
        return NextResponse.json({ ok: true, jobId, linked: null, options, recruitlyCalls: counter.calls });
    } catch (error) {
        return failure(error, counter);
    }
}
