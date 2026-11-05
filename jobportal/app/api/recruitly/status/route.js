// GET /api/recruitly/status/ – staff only.
// Confirms the Recruitly key works and both R2 file categories exist on the
// account. One Recruitly call; returns account settings only, no personal data.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import {
    FILE_CATEGORY_FULL_CANDIDATE_PROFILE,
    FILE_CATEGORY_PHOTO,
    RecruitlyError,
    createCallCounter,
    listFileCategories,
} from "@/lib/server/recruitly";

export const runtime = "nodejs";

export async function GET() {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const counter = createCallCounter();

    try {
        const json = await listFileCategories({ counter });
        const categories = Array.isArray(json?.data) ? json.data : [];
        const findName = (id) => categories.find((c) => c?.id === id)?.name || null;

        return NextResponse.json({
            ok: true,
            categoryCount: categories.length,
            fileCategories: {
                fullCandidateProfile: { id: FILE_CATEGORY_FULL_CANDIDATE_PROFILE, name: findName(FILE_CATEGORY_FULL_CANDIDATE_PROFILE) },
                photo: { id: FILE_CATEGORY_PHOTO, name: findName(FILE_CATEGORY_PHOTO) },
            },
            recruitlyCalls: counter.calls,
        });
    } catch (error) {
        return recruitlyErrorResponse(error, counter);
    }
}

function recruitlyErrorResponse(error, counter) {
    const message = error instanceof RecruitlyError ? error.message : "Recruitly request failed.";
    return NextResponse.json({ ok: false, error: message, recruitlyCalls: counter.calls }, { status: 502 });
}
