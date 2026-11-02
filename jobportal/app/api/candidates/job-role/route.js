import { NextResponse } from "next/server";
import qs from "qs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function strapiBase() {
    return (process.env.NEXT_PUBLIC_API_BASE_URL || "")
        .trim()
        .replace(/\/$/, "");
}

function strapiToken() {
    return (process.env.STRAPI_TOKEN || "").trim();
}

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/$/, "");
    const p = String(path || "").replace(/^\//, "");
    return `${b}/${p}`;
}

function getBearer() {
    const token = strapiToken();
    return token ? `Bearer ${token}` : "";
}

function normalizeJobRole(item) {
    return {
        id: item?.id ?? null,
        documentId: item?.documentId ?? "",
        title: item?.title || item?.name || "",
    };
}

export async function GET() {
    try {
        const base = strapiBase();

        if (!base) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "Missing NEXT_PUBLIC_API_BASE_URL in env",
                },
                { status: 500 }
            );
        }

        const allJobRoles = [];
        let page = 1;
        const pageSize = 100;

        while (true) {
            const query = qs.stringify(
                {
                    sort: ["title:asc"],
                    pagination: {
                        page,
                        pageSize,
                    },
                },
                {
                    encodeValuesOnly: true,
                }
            );

            const url = `${joinUrl(base, "job-roles")}?${query}`;

            const headers = {
                "Content-Type": "application/json",
            };

            const bearer = getBearer();
            if (bearer) {
                headers.Authorization = bearer;
            }

            const res = await fetch(url, {
                method: "GET",
                headers,
                cache: "no-store",
            });

            const json = await res.json().catch(() => null);

            if (!res.ok) {
                return NextResponse.json(
                    {
                        ok: false,
                        error:
                            json?.error?.message ||
                            json?.error ||
                            `Failed to fetch job roles. Status: ${res.status}`,
                        details: json,
                    },
                    { status: res.status }
                );
            }

            const rows = Array.isArray(json?.data) ? json.data : [];
            allJobRoles.push(...rows.map(normalizeJobRole).filter((x) => x.id && x.title));

            const pagination = json?.meta?.pagination;

            if (!pagination || page >= pagination.pageCount) {
                break;
            }

            page += 1;
        }

        return NextResponse.json({
            ok: true,
            data: allJobRoles,
        });
    } catch (error) {
        console.error("GET /api/candidates/job-role error:", error);

        return NextResponse.json(
            {
                ok: false,
                error: error?.message || "Failed to fetch job roles",
            },
            { status: 500 }
        );
    }
}