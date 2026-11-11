// PUT /api/recruitly/clients/<clientDocumentId>/ – staff only.
// Links a portal client to its Recruitly company (or removes the link with
// null). Writes to the portal only, never to Recruitly.
// Body: { "recruitlyCompanyId": "<id>" | null }
import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/server/requireStaffSession";
import { PortalStrapiError, strapiRequest } from "@/lib/server/portalStrapi";

export const runtime = "nodejs";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export async function PUT(req, { params }) {
    const session = await verifyStaffSession();
    if (!session.ok) {
        return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { clientDocumentId } = await params;
    const body = await req.json().catch(() => null);
    const raw = body?.recruitlyCompanyId;
    const recruitlyCompanyId = raw === null || raw === "" ? null : String(raw ?? "").trim();

    if (!ID_PATTERN.test(String(clientDocumentId || ""))) {
        return NextResponse.json({ ok: false, error: "Invalid client." }, { status: 400 });
    }
    if (recruitlyCompanyId !== null && !ID_PATTERN.test(recruitlyCompanyId)) {
        return NextResponse.json({ ok: false, error: "Invalid Recruitly company ID." }, { status: 400 });
    }

    try {
        const json = await strapiRequest(`/clients/${encodeURIComponent(clientDocumentId)}`, {
            method: "PUT",
            query: { status: "published", fields: ["companyName", "recruitlyCompanyId"] },
            body: { data: { recruitlyCompanyId } },
        });

        console.log(
            `[RECRUITLY_CLIENTS] ${session.user?.email || "staff"} set Recruitly company on client ${clientDocumentId}: ${recruitlyCompanyId || "(removed)"}`
        );

        return NextResponse.json({
            ok: true,
            client: {
                documentId: json?.data?.documentId ?? clientDocumentId,
                companyName: json?.data?.companyName ?? "",
                recruitlyCompanyId: json?.data?.recruitlyCompanyId || null,
            },
        });
    } catch (error) {
        if (error instanceof PortalStrapiError && error.status === 404) {
            return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
        }
        if (error instanceof PortalStrapiError && /unique/i.test(error.message)) {
            return NextResponse.json(
                { ok: false, error: "This Recruitly company is already linked to another portal client." },
                { status: 409 }
            );
        }
        console.error("[RECRUITLY_CLIENTS] Link failed:", error?.message);
        return NextResponse.json({ ok: false, error: "Could not save the link." }, { status: 502 });
    }
}
