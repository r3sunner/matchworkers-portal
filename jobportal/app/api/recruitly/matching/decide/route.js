// POST /api/recruitly/matching/decide/ – staff only. R4 review screen.
//   { matchDocumentId, action: "confirm", recruitlyId }
//       Reads the Recruitly record (1 call) for its CA number, refuses if another
//       portal candidate already has that Recruitly ID / CA number, then links:
//       Recruitly ID + CA number stored, CA number becomes the shown reference,
//       the old CAN_ reference is kept for search.
//   { matchDocumentId, action: "reject" }  → stays as it is (keeps CAN_).
//   { matchDocumentId, action: "undo" }    → back to the list; a confirmed link
//       is removed and the old reference restored.
// Writes the portal only; nothing changes in Recruitly.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { RecruitlyError, createCallCounter, getCandidate, toImportCandidate } from "@/lib/server/recruitly";
import { PortalStrapiError, strapiRequest } from "@/lib/server/portalStrapi";
import { MATCH_STATUS, findConflict, linkCandidate, loadCandidate, unlinkCandidate, updateMatchRow } from "@/lib/server/recruitlyMatching";

export const runtime = "nodejs";

async function loadRow(documentId) {
    const json = await strapiRequest(`/candidate-matches/${encodeURIComponent(documentId)}`);
    return json?.data || null;
}

export async function POST(req) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const body = await req.json().catch(() => null);
    const action = String(body?.action || "");
    const matchDocumentId = String(body?.matchDocumentId || "");
    if (!matchDocumentId || !["confirm", "reject", "undo"].includes(action)) {
        return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const counter = createCallCounter();
    const by = session.user?.email || "staff";

    try {
        const row = await loadRow(matchDocumentId);
        if (!row) return NextResponse.json({ ok: false, error: "Review row not found. Reload the list." }, { status: 404 });
        const candidate = await loadCandidate(row.candidateDocumentId);
        if (!candidate) return NextResponse.json({ ok: false, error: "The portal candidate no longer exists." }, { status: 404 });

        if (action === "reject") {
            if (row.status === MATCH_STATUS.CONFIRMED) {
                return NextResponse.json({ ok: false, error: "Already confirmed. Use Undo first." }, { status: 409 });
            }
            await updateMatchRow(row.documentId, { status: MATCH_STATUS.REJECTED, decidedBy: by, decidedAt: new Date().toISOString() });
            console.log(`[RECRUITLY_MATCHING] ${by} rejected ${candidate.referenceNumber || candidate.documentId}`);
            return NextResponse.json({ ok: true, status: MATCH_STATUS.REJECTED });
        }

        if (action === "undo") {
            if (row.status === MATCH_STATUS.CONFIRMED) {
                if (row.note === "Linked by a Recruitly import") {
                    return NextResponse.json({ ok: false, error: "This candidate was linked by an import, not on this screen; nothing to undo here." }, { status: 409 });
                }
                await unlinkCandidate(candidate);
            }
            const next = Array.isArray(row.suggestions) && row.suggestions.length ? MATCH_STATUS.PENDING : MATCH_STATUS.NONE;
            await updateMatchRow(row.documentId, { status: next, linkedRecruitlyId: null, linkedCaNumber: null, decidedBy: null, decidedAt: null });
            console.log(`[RECRUITLY_MATCHING] ${by} undid ${row.status} for ${candidate.documentId}`);
            return NextResponse.json({ ok: true, status: next });
        }

        // confirm
        if (row.status === MATCH_STATUS.CONFIRMED) {
            return NextResponse.json({ ok: false, error: "Already confirmed." }, { status: 409 });
        }
        if (candidate.recruitlyId) {
            return NextResponse.json({ ok: false, error: "This candidate is already linked to Recruitly (e.g. by an import). Reload the list." }, { status: 409 });
        }
        const recruitlyId = String(body?.recruitlyId || "").trim();
        if (!recruitlyId) return NextResponse.json({ ok: false, error: "Choose a Recruitly match first." }, { status: 400 });

        const profile = await getCandidate(recruitlyId, { counter });
        if (!profile) return NextResponse.json({ ok: false, error: "That Recruitly record was not found." }, { status: 404 });
        const source = toImportCandidate(profile);
        const caNumber = String(source.reference || "").trim();

        const conflict = await findConflict({ documentId: candidate.documentId, recruitlyId, caNumber });
        if (conflict) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `${caNumber || "This Recruitly record"} is already linked to another portal candidate: ${conflict.fullName || "unnamed"} (${conflict.referenceNumber || "no reference"}). Nothing was changed.`,
                },
                { status: 409 }
            );
        }

        const written = await linkCandidate(candidate, { recruitlyId, caNumber });
        await updateMatchRow(row.documentId, {
            status: MATCH_STATUS.CONFIRMED,
            linkedRecruitlyId: recruitlyId,
            linkedCaNumber: caNumber || null,
            decidedBy: by,
            decidedAt: new Date().toISOString(),
            note: null,
        });
        console.log(`[RECRUITLY_MATCHING] ${by} confirmed ${candidate.referenceNumber || candidate.documentId} → ${caNumber}`);
        return NextResponse.json({
            ok: true,
            status: MATCH_STATUS.CONFIRMED,
            caNumber,
            recruitlyName: source.fullName || "",
            reference: written.referenceNumber || candidate.referenceNumber || "",
            previousReference: written.previousReference || candidate.previousReference || "",
            recruitlyCalls: counter.calls,
        });
    } catch (error) {
        console.error("[RECRUITLY_MATCHING] Decide failed:", error?.message);
        const message =
            error instanceof RecruitlyError
                ? "Recruitly request failed. Please try again in a minute."
                : error instanceof PortalStrapiError
                  ? `Could not save in the portal: ${error.message}`
                  : "Could not save the decision.";
        return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status: 502 });
    }
}
