import { CreateNotification } from "@/lib/server/notification";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}

async function readBodySafe(res) {
    const text = await res.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

function normalizeRole(value) {
    const role = String(value || "").trim().toLowerCase();

    if (role === "staff" || role === "staffs") return "staff";
    if (role === "client" || role === "clients") return "clients";
    if (role === "candidate" || role === "candidates") return "candidates";

    return role;
}

function normalizeString(value) {
    return String(value ?? "").trim();
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;

    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : null;
}

export async function PUT(req, { params }) {
    try {
        const session = await getSession();

        if (!session?.isLoggedIn || !session?.user) {
            return Response.json(
                { ok: false, error: "Authentication required" },
                { status: 401 }
            );
        }

        const roleName = normalizeRole(session?.role);

        if (roleName !== "staff") {
            return Response.json(
                { ok: false, error: "Only staff can update jobs" },
                { status: 403 }
            );
        }

        // Next.js 15/16 route params may be a Promise.
        const resolvedParams = await params;
        const documentId = normalizeString(resolvedParams?.documentId);

        if (!documentId) {
            return Response.json(
                { ok: false, error: "Missing job documentId" },
                { status: 400 }
            );
        }

        const body = await req.json().catch(() => null);

        if (!body) {
            return Response.json(
                { ok: false, error: "Missing or invalid JSON body" },
                { status: 400 }
            );
        }

        const STRAPI_BASE_URL = normalizeString(
            process.env.STRAPI_BASE_URL || process.env.STRAPI_URL
        );

        // Use the same token priority as the working jobs list/create routes.
        const RAW_TOKEN = normalizeString(
            process.env.STRAPI_TOKEN || process.env.STRAPI_API_TOKEN
        );

        if (!STRAPI_BASE_URL || !RAW_TOKEN) {
            return Response.json(
                {
                    ok: false,
                    error: "Missing STRAPI_BASE_URL or STRAPI_TOKEN",
                },
                { status: 500 }
            );
        }

        const authorization = RAW_TOKEN.toLowerCase().startsWith("bearer ")
            ? RAW_TOKEN
            : `Bearer ${RAW_TOKEN}`;

        const url = joinUrl(
            STRAPI_BASE_URL,
            `jobs/${encodeURIComponent(documentId)}?status=published`
        );

        const res = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: authorization,
                "Content-Type": "application/json",
            },
            cache: "no-store",
            redirect: "manual",
            body: JSON.stringify({
                data: {
                    title: normalizeString(body.title),
                    location: normalizeString(body.location),
                    closingDate: normalizeString(body.closingDate) || null,
                    statusList: normalizeString(body.statusList) || "open",
                    industeryList: normalizeString(body.industeryList),
                    jobTypeList: normalizeString(body.jobTypeList),
                    showToCandidateList: normalizeString(body.showToCandidateList),
                    vacanciesNo: toNumberOrNull(body.vacanciesNo),
                    experience: toNumberOrNull(body.experience),
                    shortDescription: normalizeString(body.shortDescription),
                    details: Array.isArray(body.details) ? body.details : [],
                },
            }),
        });

        if (res.status >= 300 && res.status < 400) {
            return Response.json(
                {
                    ok: false,
                    error: "Strapi redirect detected. Check STRAPI_BASE_URL.",
                    details: {
                        status: res.status,
                        location: res.headers.get("location"),
                    },
                },
                { status: 500 }
            );
        }

        const json = await readBodySafe(res);

        if (!res.ok) {
            const strapiMessage =
                json?.error?.message ||
                json?.message ||
                json?.raw ||
                `Strapi request failed (${res.status})`;

            const errorMessage =
                res.status === 401 || res.status === 403
                    ? "Strapi token is invalid or does not have permission to update Jobs"
                    : "System Update failed";

            return Response.json(
                {
                    ok: false,
                    error: errorMessage,
                    strapiMessage,
                    details: json,
                },
                { status: res.status }
            );
        }

        const data = json?.data || null;
        const attrs = data?.attributes || data || {};
        const item = {
            documentId: data?.documentId || attrs?.documentId || documentId,
            id: data?.id ?? attrs?.id ?? null,
            ...attrs,
        };

        const notificationTitle =
            String(item?.statusList || "").toLowerCase() === "closed"
                ? `Job Closed (${item?.title || "Job"})`
                : `Job Updated (${item?.title || "Job"})`;

        const notificationDetails = [
            String(item?.statusList || "").toLowerCase() === "closed"
                ? "A job has been closed."
                : "A job has been updated.",
            `Job Title: ${item?.title || "—"}`,
            `Reference No.: ${item?.referenceNo || "—"}`,
        ].join("\n");

        // A notification failure should not undo an otherwise successful update.
        try {
            await CreateNotification({
                title: notificationTitle,
                details: notificationDetails,
                email: String(item?.statusList || "").toLowerCase() === "closed",
            });
        } catch (notificationError) {
            console.error("Job update notification failed:", notificationError);
        }

        return Response.json({ ok: true, item }, { status: 200 });
    } catch (error) {
        console.error("Job update route error:", error);

        return Response.json(
            { ok: false, error: error?.message || "Server error" },
            { status: 500 }
        );
    }
}
