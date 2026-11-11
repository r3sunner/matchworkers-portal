// POST /api/recruitly/import/ – staff only (server-checked session).
// Imports ticked candidates from one Recruitly job into the portal (R1, R4).
// Body: { "jobId": "<Recruitly job id>", "candidateIds": ["<Recruitly candidate id>", ...] }
//
// Rules:
// - Recruitly is only read (GET). The portal is the only thing written.
// - The pipeline is re-read here; only entries the stage mapping shows are
//   imported, whatever the browser sent.
// - No duplicates: an existing portal candidate is found by Recruitly ID, CA
//   number, login email or mobile and updated. Anything uncertain (name only,
//   several matches, already linked to another Recruitly record) is NOT created
//   and is returned as "review".
// Part 2 (next): create/link the portal job and set the pipeline stage.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import {
    RecruitlyError,
    createCallCounter,
    getCandidate,
    listAllJobPipeline,
    placementsForJob,
    mapLimit,
    toImportCandidate,
} from "@/lib/server/recruitly";
import { ACTION, mapPipelineEntry, placementStatusFor } from "@/lib/server/recruitlyStages";
import { PortalStrapiError, strapiRequest } from "@/lib/server/portalStrapi";
import { normalizeEmail, phoneDigits, samePhone, toPortalCandidate } from "@/lib/server/recruitlyImportMapping";

export const runtime = "nodejs";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_PER_IMPORT = 50;

const CANDIDATE_FIELDS = ["documentId", "fullName", "recruitlyId", "caNumber", "mobile", "referenceNumber"];

function summaryOf(c) {
    return {
        documentId: c?.documentId || null,
        fullName: c?.fullName || "",
        reference: c?.caNumber || c?.referenceNumber || "",
    };
}

async function findCandidates(filters) {
    const json = await strapiRequest("/candidates", {
        query: {
            status: "published",
            filters,
            fields: CANDIDATE_FIELDS,
            populate: { users_permissions_user: { fields: ["email"] } },
            pagination: { page: 1, pageSize: 10 },
        },
    });
    return Array.isArray(json?.data) ? json.data : [];
}

// Returns { kind: "match", candidate, by } | { kind: "review", reason, possible } | { kind: "none" }
async function findExisting(data, { email, mobile }) {
    const steps = [];
    if (data.recruitlyId) steps.push({ by: "Recruitly ID", filters: { recruitlyId: { $eq: data.recruitlyId } } });
    if (data.caNumber) steps.push({ by: "CA number", filters: { caNumber: { $eq: data.caNumber } } });
    if (email) steps.push({ by: "email", filters: { users_permissions_user: { email: { $eqi: email } } } });

    const digits = phoneDigits(mobile);
    if (digits.length >= 7) {
        steps.push({
            by: "mobile",
            filters: { mobile: { $contains: digits.slice(-4) } },
            keep: (c) => samePhone(c?.mobile, mobile),
        });
    }

    for (const step of steps) {
        const rows = (await findCandidates(step.filters)).filter(step.keep || (() => true));
        if (rows.length === 0) continue;

        if (rows.length > 1) {
            return {
                kind: "review",
                reason: `${rows.length} portal candidates match by ${step.by}`,
                possible: rows.map(summaryOf),
            };
        }

        const found = rows[0];
        const otherRecruitly = found.recruitlyId && found.recruitlyId !== data.recruitlyId;
        const otherCa = found.caNumber && data.caNumber && found.caNumber !== data.caNumber;
        if (otherRecruitly || otherCa) {
            return {
                kind: "review",
                reason: `Matches by ${step.by}, but that portal candidate is linked to another Recruitly record`,
                possible: [summaryOf(found)],
            };
        }

        return { kind: "match", candidate: found, by: step.by };
    }

    // Same name only: never linked automatically, never created.
    if (data.fullName) {
        const sameName = await findCandidates({ fullName: { $eqi: data.fullName } });
        if (sameName.length > 0) {
            return {
                kind: "review",
                reason: "A portal candidate with the same name exists (name only, not linked automatically)",
                possible: sameName.map(summaryOf),
            };
        }
    }

    return { kind: "none" };
}

async function findJobRole(title, cache) {
    const key = String(title || "").trim().toLowerCase();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);

    const json = await strapiRequest("/job-roles", {
        query: { filters: { title: { $eqi: String(title).trim() } }, fields: ["documentId", "title"], pagination: { pageSize: 2 } },
    });
    const rows = Array.isArray(json?.data) ? json.data : [];
    const id = rows.length === 1 ? rows[0].documentId : null;
    cache.set(key, id);
    return id;
}

async function saveCandidate(existing, data) {
    if (existing) {
        const json = await strapiRequest(`/candidates/${encodeURIComponent(existing.documentId)}`, {
            method: "PUT",
            query: { status: "published" },
            body: { data },
        });
        return json?.data?.documentId || existing.documentId;
    }

    const json = await strapiRequest("/candidates", {
        method: "POST",
        query: { status: "published" },
        body: { data },
    });
    return json?.data?.documentId || null;
}

async function importOne({ candidateId, entry, mapped, profile, roleCache }) {
    const base = { candidateId, name: entry?.candidateName || "", reference: "", notes: [] };

    if (!profile) return { ...base, outcome: "skipped", reason: "Not found in Recruitly" };

    const source = toImportCandidate(profile);
    const { data, notes } = toPortalCandidate(source);
    base.reference = data.caNumber || "";
    base.name = data.fullName || base.name;
    base.notes.push(...notes);

    if (!data.recruitlyId) return { ...base, outcome: "skipped", reason: "Recruitly record has no ID" };

    const match = await findExisting(data, { email: normalizeEmail(source.email), mobile: source.mobile });
    if (match.kind === "review") {
        return { ...base, outcome: "review", reason: match.reason, possibleMatches: match.possible };
    }

    const roleId = await findJobRole(source.jobTitle, roleCache);
    if (roleId) data.job_roles = { connect: [roleId] };
    else if (source.jobTitle) base.notes.push(`Job role "${source.jobTitle}" not found in the portal; left blank`);

    const existing = match.kind === "match" ? match.candidate : null;
    let documentId;
    try {
        documentId = await saveCandidate(existing, data);
    } catch (error) {
        // Another import created the same Recruitly ID a moment ago: never add a second one.
        if (!existing && error instanceof PortalStrapiError && /unique/i.test(error.message)) {
            return { ...base, outcome: "review", reason: "Saved by another import at the same time; reload and check", possibleMatches: [] };
        }
        throw error;
    }

    return {
        ...base,
        outcome: existing ? "updated" : "created",
        matchedBy: existing ? match.by : "",
        portalDocumentId: documentId,
        portalStage: mapped.portalStage,
    };
}

export async function POST(req) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const body = await req.json().catch(() => null);
    const jobId = String(body?.jobId || "");
    const candidateIds = Array.isArray(body?.candidateIds) ? [...new Set(body.candidateIds.map(String))] : [];

    if (!ID_PATTERN.test(jobId)) {
        return NextResponse.json({ ok: false, error: "Invalid Recruitly job." }, { status: 400 });
    }
    if (candidateIds.length === 0 || candidateIds.length > MAX_PER_IMPORT || !candidateIds.every((id) => ID_PATTERN.test(id))) {
        return NextResponse.json(
            { ok: false, error: `Choose between 1 and ${MAX_PER_IMPORT} candidates.` },
            { status: 400 }
        );
    }

    const counter = createCallCounter();
    const results = [];

    try {
        // Re-check every candidate against the live pipeline and stage mapping.
        const { entries } = await listAllJobPipeline(jobId, { counter });
        const active = entries.filter((e) => e?.rejected !== true);
        const placementList = await placementsForJob(active, jobId, { counter });
        const roleCache = new Map();

        // 1. Decide per candidate from the live pipeline and stage mapping.
        const eligible = [];
        for (const candidateId of candidateIds) {
            const entry = active.find((e) => String(e?.candidateId) === candidateId);
            if (!entry) {
                results.push({ candidateId, outcome: "skipped", reason: "Not on this job's pipeline (or rejected)", notes: [] });
                continue;
            }

            const placementStatus = placementList
                ? placementStatusFor(placementList.placements, entry.candidateId, entry.jobId || jobId)
                : null;
            const mapped = mapPipelineEntry(entry, { placementStatus });
            if (mapped.action !== ACTION.SHOW) {
                results.push({
                    candidateId,
                    name: entry.candidateName || "",
                    outcome: "skipped",
                    reason: mapped.reason || "Not shown to clients at this stage",
                    notes: [],
                });
                continue;
            }
            eligible.push({ candidateId, entry, mapped });
        }

        // 2. Read the Recruitly profiles, 3 at a time (Recruitly is slow per call).
        const profiles = await mapLimit(eligible, 3, (item) =>
            getCandidate(item.candidateId, { counter }).then(
                (profile) => ({ profile }),
                (error) => ({ error })
            )
        );

        // 3. Save in the portal one by one, so two rows can never race into a duplicate.
        for (const [i, item] of eligible.entries()) {
            const { profile, error: readError } = profiles[i];
            if (readError) {
                console.error("[RECRUITLY_IMPORT] Read failed:", item.candidateId, readError?.message);
                results.push({ candidateId: item.candidateId, name: item.entry.candidateName || "", outcome: "failed", reason: "Recruitly request failed", notes: [] });
                continue;
            }
            try {
                results.push(await importOne({ ...item, profile, roleCache }));
            } catch (error) {
                console.error("[RECRUITLY_IMPORT] Candidate failed:", item.candidateId, error?.message);
                results.push({
                    candidateId: item.candidateId,
                    name: item.entry.candidateName || "",
                    outcome: "failed",
                    reason: error instanceof RecruitlyError ? "Recruitly request failed" : "Could not save in the portal",
                    notes: [],
                });
            }
        }
    } catch (error) {
        const message = error instanceof RecruitlyError ? error.message : "Import failed.";
        console.error("[RECRUITLY_IMPORT] Import failed:", error?.message);
        return NextResponse.json({ ok: false, error: message, results, recruitlyCalls: counter.calls }, { status: 502 });
    }

    const count = (outcome) => results.filter((r) => r.outcome === outcome).length;
    const summary = {
        created: count("created"),
        updated: count("updated"),
        review: count("review"),
        skipped: count("skipped"),
        failed: count("failed"),
    };

    console.log(
        `[RECRUITLY_IMPORT] ${session.user?.email || "staff"} job ${jobId}: created ${summary.created}, updated ${summary.updated}, review ${summary.review}, skipped ${summary.skipped}, failed ${summary.failed}, Recruitly calls ${counter.calls}`
    );

    return NextResponse.json({ ok: true, jobId, summary, results, recruitlyCalls: counter.calls });
}
