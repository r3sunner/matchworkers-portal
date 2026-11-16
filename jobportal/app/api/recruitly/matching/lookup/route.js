// POST /api/recruitly/matching/lookup/ { caNumber } – staff only. R4 review screen.
// "Link by CA number": finds the Recruitly candidate with exactly this CA
// reference so staff can see the name before confirming. 1 Recruitly call.
// Returns the Recruitly ID, CA number and name only (never contact details).
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { RecruitlyError, createCallCounter, findCandidateByReference } from "@/lib/server/recruitly";
import { normalizeCaNumber, takenRecruitlyIds } from "@/lib/server/recruitlyMatching";

export const runtime = "nodejs";

export async function POST(req) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const body = await req.json().catch(() => null);
    const caNumber = normalizeCaNumber(body?.caNumber);
    if (!caNumber) {
        return NextResponse.json({ ok: false, error: "Enter a CA number, e.g. CA-114061." }, { status: 400 });
    }

    const counter = createCallCounter();
    try {
        const found = await findCandidateByReference(caNumber, { counter });
        if (!found?.id) {
            return NextResponse.json({ ok: false, error: `${caNumber} was not found in Recruitly.` }, { status: 404 });
        }
        const recruitlyId = String(found.id);
        const taken = await takenRecruitlyIds([recruitlyId]);
        return NextResponse.json({
            ok: true,
            match: {
                recruitlyId,
                caNumber,
                name: [found.firstName, found.lastName].filter(Boolean).join(" ").trim() || found.fullName || "",
                alreadyLinked: taken.has(recruitlyId),
            },
            recruitlyCalls: counter.calls,
        });
    } catch (error) {
        console.error("[RECRUITLY_MATCHING] Lookup failed:", error?.message);
        const message = error instanceof RecruitlyError ? "Recruitly request failed. Please try again in a minute." : "Could not look up the CA number.";
        return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status: 502 });
    }
}
