// GET /api/recruitly/clients/ – staff only.
// Every portal client with its Recruitly company link, for the import screen.
// Reads the portal only; no Recruitly calls.
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { PortalStrapiError, strapiFetchAll } from "@/lib/server/portalStrapi";

export const runtime = "nodejs";

export async function GET() {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    try {
        const rows = await strapiFetchAll("/clients", {
            fields: ["companyName", "recruitlyCompanyId"],
            sort: ["companyName:asc", "id:asc"],
        });

        const clients = rows.map((row) => ({
            documentId: row?.documentId ?? "",
            companyName: row?.companyName ?? "",
            recruitlyCompanyId: row?.recruitlyCompanyId || null,
        }));

        return NextResponse.json({ ok: true, total: clients.length, clients });
    } catch (error) {
        const status = error instanceof PortalStrapiError && error.status === 500 ? 500 : 502;
        console.error("[RECRUITLY_CLIENTS] Failed:", error?.message);
        return NextResponse.json({ ok: false, error: "Could not load portal clients." }, { status });
    }
}
