import { NextResponse } from "next/server";
import qs from "qs";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const PIPELINE_STAGES = [
    "Shortlisted Candidate",
    "Requested Interview",
    "Interviewed",
    "Hired Candidate",
    "Immigration",
    "Placed",
];

function strapiBase() {
    return (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
}

function strapiToken() {
    return process.env.STRAPI_TOKEN || "";
}

function bearer() {
    const token = strapiToken();
    return token ? `Bearer ${token}` : "";
}

function arr(v) {
    return Array.isArray(v) ? v : [];
}

function attr(item) {
    return item?.attributes ? item.attributes : item;
}

function text(v) {
    return String(v || "").trim();
}

function normalizeStage(stage) {
    const value = text(stage).toLowerCase();

    if (value === "shortlisted candidate") return "Shortlisted Candidate";
    if (value === "requested interview") return "Requested Interview";
    if (value === "interviewed") return "Interviewed";
    if (value === "hired candidate") return "Hired Candidate";
    if (value === "immigration") return "Immigration";
    if (value === "placed") return "Placed";

    return text(stage);
}

function shortStageName(stage) {
    const map = {
        "Shortlisted Candidate": "Shortlisted",
        "Requested Interview": "Interview",
        "Hired Candidate": "Hired",
        Immigration: "Immigration",
        Placed: "Placed",
    };

    return map[stage] || stage || "N/A";
}

function hasOfferLetter(item) {
    return Boolean(
        item?.offerLetter?.data ||
        item?.offerLetter?.id ||
        item?.offerLetter?.url ||
        item?.offerLetter?.documentId
    );
}

function getClientName(client) {
    const c = attr(client);
    return c?.companyName || c?.name || "N/A";
}

export async function GET() {
    try {
        const session = await getSession();

        if (!session?.user) {

            return NextResponse.json(
                { ok: false, error: "Not authenticated" },
                { status: 401 }
            );
        }


        const user = session.user;
        const role = text(user?.type || user?.role?.type || user?.roleRaw.type).toLowerCase();

        if (role !== "candidate" && role !== "candidates") {
            return NextResponse.json(
                { ok: false, error: "Only candidates can access this dashboard" },
                { status: 403 }
            );
        }

        const candidateDocumentId = user?.documentId;

        if (!candidateDocumentId) {
            return NextResponse.json(
                { ok: false, error: "Candidate documentId missing in login session" },
                { status: 400 }
            );
        }

        const base = strapiBase();

        if (!base) {
            return NextResponse.json(
                { ok: false, error: "Missing NEXT_PUBLIC_API_BASE_URL" },
                { status: 500 }
            );
        }

        const query = qs.stringify(
            {
                status: "published",
                filters: {
                    assignCandidatesToJob: {
                        candidate: {
                            documentId: {
                                $eq: candidateDocumentId,
                            },
                        },
                    },
                },
                sort: ["createdAt:desc"],
                pagination: {
                    pageSize: 200,
                },
                populate: {
                    client: true,
                    assignCandidatesToJob: {
                        populate: {
                            candidate: true,
                            offerLetter: true,
                        },
                    },
                },
            },
            { encodeValuesOnly: true }
        );

        const res = await fetch(`${base}/jobs?${query}`, {
            headers: {
                Authorization: bearer(),
            },
            cache: "no-store",
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
            return NextResponse.json(
                { ok: false, error: json?.error?.message || "Failed to fetch candidate jobs" },
                { status: res.status }
            );
        }

        const jobs = arr(json?.data).map(attr);

        const stageCounts = {};
        PIPELINE_STAGES.forEach((s) => {
            stageCounts[s] = 0;
        });

        let totalApplications = 0;
        let openJobs = 0;
        let hiredJobs = 0;
        let offerLetters = 0;

        const applications = [];

        for (const job of jobs) {
            const assigned = arr(job?.assignCandidatesToJob);

            const myAssignments = assigned.filter((item) => {
                const candidate = attr(item?.candidate?.data || item?.candidate);
                return candidate?.documentId === candidateDocumentId;
            });

            for (const item of myAssignments) {
                const stage = normalizeStage(item?.candidateProcessList);

                if (PIPELINE_STAGES.includes(stage)) {
                    stageCounts[stage] += 1;
                }

                totalApplications += 1;

                if (text(job?.statusList).toLowerCase() === "open") {
                    openJobs += 1;
                }

                if (stage === "Hired Candidate" || stage === "Placed") {
                    hiredJobs += 1;
                }

                if (hasOfferLetter(item)) {
                    offerLetters += 1;
                }

                applications.push({
                    jobDocumentId: job?.documentId || null,
                    title: job?.title || job?.jobTitle || "Untitled Job",
                    referenceNo: job?.referenceNo || "N/A",
                    clientName: getClientName(job?.client?.data || job?.client),
                    jobStatus: job?.statusList || "N/A",
                    stage,
                    stageLabel: shortStageName(stage),
                    hasOfferLetter: hasOfferLetter(item),
                    updatedAt: job?.updatedAt || job?.createdAt || null,
                });
            }
        }

        applications.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

        return NextResponse.json({
            ok: true,
            user: {
                name: user?.name || user?.username || "",
                email: user?.email || "",
                role,
                documentId: candidateDocumentId,
            },
            stats: {
                totalApplications,
                openJobs,
                hiredJobs,
                offerLetters,
                shortlisted: stageCounts["Shortlisted Candidate"] || 0,
                interview: stageCounts["Requested Interview"] || 0,
                immigration: stageCounts["Immigration"] || 0,
                placed: stageCounts["Placed"] || 0,
            },
            pipelineChart: PIPELINE_STAGES.map((name) => ({
                name,
                label: shortStageName(name),
                value: stageCounts[name] || 0,
            })),
            applications,
        });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error?.message || "Candidate dashboard fetch failed" },
            { status: 500 }
        );
    }
}