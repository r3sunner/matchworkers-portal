// GET /api/recruitly/candidates/<candidateId>/ – staff only.
// One Recruitly candidate as the import will see it: the mapped fields only,
// plus the Full Candidate Profile and Photo files (details only, no download).
// Two Recruitly calls.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import {
    FILE_CATEGORY_PHOTO,
    RecruitlyError,
    createCallCounter,
    getCandidate,
    latestFiles,
    listCandidateFiles,
    toImportCandidate,
} from "@/lib/server/recruitly";

export const runtime = "nodejs";

export async function GET(req, { params }) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { candidateId } = await params;
    const counter = createCallCounter();

    try {
        const profile = await getCandidate(candidateId, { counter });
        if (!profile?.id) {
            return NextResponse.json(
                { ok: false, error: "Candidate not found in Recruitly.", recruitlyCalls: counter.calls },
                { status: 404 }
            );
        }

        const files = await listCandidateFiles(candidateId, { counter });
        const latest = latestFiles(files);
        const toFile = (file) => ({
            id: file?.id ?? null,
            category: file?.categoryId === FILE_CATEGORY_PHOTO ? "photo" : "fullCandidateProfile",
            name: file?.name ?? "",
            contentType: file?.contentType ?? "",
            size: file?.size ?? null,
            uploadedOn: file?.uploadedOn ?? null,
        });

        return NextResponse.json({
            ok: true,
            candidate: toImportCandidate(profile),
            files: files.map(toFile),
            latest: {
                fullCandidateProfile: latest.fullCandidateProfile ? toFile(latest.fullCandidateProfile) : null,
                photo: latest.photo ? toFile(latest.photo) : null,
            },
            recruitlyCalls: counter.calls,
        });
    } catch (error) {
        const message = error instanceof RecruitlyError ? error.message : "Recruitly request failed.";
        return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status: 502 });
    }
}
