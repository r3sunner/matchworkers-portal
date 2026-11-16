// GET /api/recruitly/matching/list/?status=pending&q=&page=1 – staff only.
// R4 review screen rows: each existing portal candidate with its suggested
// Recruitly match(es) and status. No Recruitly calls.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { strapiRequest } from "@/lib/server/portalStrapi";
import { MATCH_STATUS, allMatchRows } from "@/lib/server/recruitlyMatching";

export const runtime = "nodejs";

const PAGE_SIZE = 25;
const STATUSES = Object.values(MATCH_STATUS);

async function candidatesByDocumentId(ids) {
    const map = new Map();
    for (let i = 0; i < ids.length; i += 100) {
        const json = await strapiRequest("/candidates", {
            query: {
                status: "published",
                filters: { documentId: { $in: ids.slice(i, i + 100) } },
                fields: ["documentId", "fullName", "referenceNumber", "previousReference", "caNumber", "recruitlyId"],
                pagination: { pageSize: 100 },
            },
        });
        for (const c of json?.data || []) map.set(c.documentId, c);
    }
    return map;
}

export async function GET(req) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const params = req.nextUrl.searchParams;
    const status = STATUSES.includes(params.get("status")) ? params.get("status") : MATCH_STATUS.PENDING;
    const q = String(params.get("q") || "").trim().toLowerCase();
    const page = Math.max(1, Number(params.get("page")) || 1);

    try {
        const rows = await allMatchRows();
        const candidates = await candidatesByDocumentId(rows.map((r) => r.candidateDocumentId));

        const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
        const joined = [];
        for (const r of rows) {
            const c = candidates.get(r.candidateDocumentId);
            if (!c) continue; // candidate deleted since
            counts[r.status] = (counts[r.status] || 0) + 1;
            joined.push({
                matchDocumentId: r.documentId,
                status: r.status,
                suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
                linkedCaNumber: r.linkedCaNumber || "",
                decidedBy: r.decidedBy || "",
                decidedAt: r.decidedAt || null,
                note: r.note || "",
                candidate: {
                    documentId: c.documentId,
                    fullName: c.fullName || "",
                    reference: c.referenceNumber || "",
                    previousReference: c.previousReference || "",
                },
            });
        }

        const matchesQuery = (row) =>
            !q ||
            [row.candidate.fullName, row.candidate.reference, row.candidate.previousReference, row.linkedCaNumber, ...row.suggestions.map((s) => s.name)]
                .join(" ")
                .toLowerCase()
                .includes(q);

        const filtered = joined
            .filter((row) => row.status === status && matchesQuery(row))
            .sort((a, b) => a.candidate.fullName.localeCompare(b.candidate.fullName));
        const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

        return NextResponse.json({
            ok: true,
            status,
            counts,
            total: filtered.length,
            page: Math.min(page, pageCount),
            pageCount,
            rows: filtered.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE),
        });
    } catch (error) {
        console.error("[RECRUITLY_MATCHING] List failed:", error?.message);
        return NextResponse.json({ ok: false, error: "Could not load the review list." }, { status: 502 });
    }
}
