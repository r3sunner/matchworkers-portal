import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import qs from "qs";
import { USER_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function strapiBase() {
    return (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
}

function strapiToken() {
    return process.env.STRAPI_TOKEN || "";
}

function bearer() {
    const token = strapiToken();
    return token ? (token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`) : "";
}

function arr(v) {
    return Array.isArray(v) ? v : [];
}

function attr(item) {
    return item?.attributes ? item.attributes : item || {};
}

function text(v) {
    return String(v || "").trim();
}

function toBool(v) {
    return v === true || String(v).toLowerCase() === "true";
}

function numberParam(value, fallback, min = 1, max = 100) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
}

function isOpenJob(job) {
    return text(job?.statusList).toLowerCase() === "open";
}

function getClientName(client) {
    const c = attr(client);
    return c?.companyName || c?.name || c?.contactName || "N/A";
}

function hasOfferLetter(item) {
    return Boolean(
        item?.offerLetter?.data ||
        item?.offerLetter?.id ||
        item?.offerLetter?.url ||
        item?.offerLetter?.documentId
    );
}

const PIPELINE_STAGES = [
    "Shortlisted Candidate",
    "Requested Interview",
    "Hired Candidate",
    "Immigration",
    "Placed",
];

function normalizeStage(stage) {
    const value = text(stage).toLowerCase();

    if (value === "shortlisted candidate") return "Shortlisted Candidate";
    if (value === "requested interview") return "Requested Interview";
    if (value === "hired candidate") return "Hired Candidate";
    if (value === "immigration") return "Immigration";
    if (value === "placed") return "Placed";

    return text(stage);
}

function displayStage(stage) {
    const normalized = normalizeStage(stage);
    return normalized === "Hired Candidate" ? "Offered Candidate" : normalized;
}

async function readBodySafe(res) {
    const responseText = await res.text();

    try {
        return responseText ? JSON.parse(responseText) : null;
    } catch {
        return { raw: responseText };
    }
}

async function strapiFetch(path, options = {}) {
    const base = strapiBase();

    if (!base) {
        const error = new Error("Missing NEXT_PUBLIC_API_BASE_URL");
        error.status = 500;
        throw error;
    }

    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = {
        ...(bearer() ? { Authorization: bearer() } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
    };

    const res = await fetch(url, {
        ...options,
        headers,
        redirect: "manual",
        cache: "no-store",
    });

    const json = await readBodySafe(res);

    if (!res.ok || json?.error) {
        const error = new Error(
            json?.error?.message ||
            json?.message ||
            json?.raw ||
            `Strapi request failed with status ${res.status}`
        );
        error.status = res.status;
        error.response = json;
        throw error;
    }

    return json;
}

function unwrapRelation(value) {
    const raw = value?.data ?? value;
    if (!raw) return null;

    const data = attr(raw);

    return {
        id: raw?.id ?? data?.id ?? null,
        documentId: raw?.documentId || data?.documentId || "",
        ...data,
    };
}

function parseOpenHistory(value) {
    if (!value) return [];

    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function relationName(relation, type) {
    if (!relation) return "N/A";

    if (type === "client") {
        return relation.companyName || relation.contactName || relation.email || relation.documentId || "N/A";
    }

    if (type === "staff") {
        return relation.fullName || relation.name || relation.username || relation.email || relation.documentId || "N/A";
    }

    if (type === "candidate") {
        return relation.fullName || relation.firstName || relation.email || relation.referenceNumber || relation.documentId || "N/A";
    }

    return relation.name || relation.fullName || relation.companyName || relation.email || "N/A";
}

function normalizeNotification(row) {
    if (!row) return null;

    const data = attr(row);
    const client = unwrapRelation(data.client);
    const staff = unwrapRelation(data.staff);
    const candidate = unwrapRelation(data.candidate);

    return {
        id: row?.id ?? data?.id ?? null,
        documentId: row?.documentId || data?.documentId || "",
        title: data?.title || "Untitled Notification",
        details: data?.details || "",
        sendEmail: toBool(data?.sendEmail),
        openMessage: toBool(data?.openMessage),
        openHistoryRaw: data?.openHistory || "",
        openHistory: parseOpenHistory(data?.openHistory),
        createdAt: data?.createdAt || row?.createdAt || null,
        updatedAt: data?.updatedAt || row?.updatedAt || null,
        clientName: relationName(client, "client"),
        staffName: relationName(staff, "staff"),
        candidateName: relationName(candidate, "candidate"),
        clientDocumentId: client?.documentId || "",
        staffDocumentId: staff?.documentId || "",
        candidateDocumentId: candidate?.documentId || "",
    };
}

function notificationPopulate() {
    // Keep relations fully populated because project schemas may use
    // different display fields for client/staff/candidate records.
    return {
        client: true,
        staff: true,
        candidate: true,
    };
}

async function getCandidateCount(filters = {}) {
    const queryObj = {
        status: "published",
        pagination: {
            page: 1,
            pageSize: 1,
        },
    };

    if (filters && Object.keys(filters).length) {
        queryObj.filters = filters;
    }

    const query = qs.stringify(queryObj, { encodeValuesOnly: true });
    const json = await strapiFetch(`/candidates?${query}`);

    return Number(json?.meta?.pagination?.total || 0);
}

async function getNotificationsByRelation({ relation, page, pageSize }) {
    const baseQuery = {
        status: "published",
        fields: ["title", "details", "sendEmail", "openMessage", "openHistory", "createdAt", "updatedAt"],
        populate: notificationPopulate(),
        sort: ["createdAt:desc"],
    };

    const filteredQuery = qs.stringify(
        {
            ...baseQuery,
            filters: {
                [relation]: {
                    id: {
                        $notNull: true,
                    },
                },
            },
            pagination: {
                page,
                pageSize,
            },
        },
        { encodeValuesOnly: true }
    );

    try {
        const json = await strapiFetch(`/client-notifications?${filteredQuery}`);
        const meta = json?.meta?.pagination || {};

        return {
            items: arr(json?.data).map(normalizeNotification).filter(Boolean),
            meta: {
                page: Number(meta.page || page),
                pageSize: Number(meta.pageSize || pageSize),
                pageCount: Number(meta.pageCount || 1),
                total: Number(meta.total || 0),
                hasMore: Number(meta.page || page) < Number(meta.pageCount || 1),
            },
        };
    } catch (error) {
        // Fallback for Strapi setups that do not support $notNull relation filters.
        // Fetch a larger latest batch, filter relation in Next.js, then paginate locally.
        console.error(`Notification relation filter fallback used for ${relation}:`, error?.message);

        const fallbackQuery = qs.stringify(
            {
                ...baseQuery,
                pagination: {
                    page: 1,
                    pageSize: 1000,
                },
            },
            { encodeValuesOnly: true }
        );

        const json = await strapiFetch(`/client-notifications?${fallbackQuery}`);
        const allItems = arr(json?.data)
            .map(normalizeNotification)
            .filter(Boolean)
            .filter((item) => {
                if (relation === "client") return item.clientDocumentId || item.clientName !== "N/A";
                if (relation === "staff") return item.staffDocumentId || item.staffName !== "N/A";
                if (relation === "candidate") return item.candidateDocumentId || item.candidateName !== "N/A";
                return false;
            });

        const total = allItems.length;
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const start = (page - 1) * pageSize;

        return {
            items: allItems.slice(start, start + pageSize),
            meta: {
                page,
                pageSize,
                pageCount,
                total,
                hasMore: page < pageCount,
            },
        };
    }
}
function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

async function getCurrentUserFromCookies() {
    const store = await cookies();
    const names = [USER_COOKIE_NAME, "user", "safeUser", "auth_user"];

    for (const name of names) {
        const raw = store.get(name)?.value;
        if (!raw) continue;

        const decoded = decodeURIComponent(raw);
        const parsed = safeJsonParse(decoded) || safeJsonParse(raw);

        if (parsed) return parsed;
    }

    return null;
}

function currentUserName(user) {
    return (
        user?.fullName ||
        user?.name ||
        user?.companyName ||
        user?.username ||
        user?.email ||
        "Unknown Staff"
    );
}

function currentUserRole(user) {
    return (
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.role ||
        user?.type ||
        "staff"
    );
}

async function getNotificationByDocumentId(documentId) {
    const query = qs.stringify(
        {
            status: "published",
            fields: ["title", "details", "sendEmail", "openMessage", "openHistory", "createdAt", "updatedAt"],
            populate: notificationPopulate(),
        },
        { encodeValuesOnly: true }
    );

    const json = await strapiFetch(`/client-notifications/${documentId}?${query}`);
    return normalizeNotification(json?.data);
}

export async function GET(req) {
    try {
        const base = strapiBase();

        if (!base) {
            return NextResponse.json(
                { ok: false, error: "Missing NEXT_PUBLIC_API_BASE_URL" },
                { status: 500 }
            );
        }

        const { searchParams } = new URL(req.url);

        const jobsPage = numberParam(searchParams.get("jobsPage"), 1, 1, 9999);
        const jobsPageSize = numberParam(searchParams.get("jobsPageSize"), 10, 1, 50);
        const clientNotificationsPage = numberParam(searchParams.get("clientNotificationsPage"), 1, 1, 9999);
        const clientNotificationsPageSize = numberParam(searchParams.get("clientNotificationsPageSize"), 15, 1, 50);
        const staffNotificationsPage = numberParam(searchParams.get("staffNotificationsPage"), 1, 1, 9999);
        const staffNotificationsPageSize = numberParam(searchParams.get("staffNotificationsPageSize"), 15, 1, 50);

        const jobsQuery = qs.stringify(
            {
                status: "published",
                filters: {
                    statusList: {
                        $eqi: "Open",
                    },
                },
                sort: ["updatedAt:desc", "createdAt:desc"],
                pagination: {
                    pageSize: 1000,
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

        const clientsQuery = qs.stringify(
            {
                status: "published",
                filters: {
                    statusList: {
                        $eqi: "Active",
                    },
                },
                pagination: {
                    pageSize: 1,
                },
            },
            { encodeValuesOnly: true }
        );

        const [
            jobsRes,
            clientsRes,
            clientNotifications,
            staffNotifications,
            totalCandidatesCount,
            availableCandidatesCount,
        ] = await Promise.all([
            fetch(`${base}/jobs?${jobsQuery}`, {
                headers: { Authorization: bearer() },
                cache: "no-store",
            }),
            fetch(`${base}/clients?${clientsQuery}`, {
                headers: { Authorization: bearer() },
                cache: "no-store",
            }),
            getNotificationsByRelation({
                relation: "client",
                page: clientNotificationsPage,
                pageSize: clientNotificationsPageSize,
            }),
            getNotificationsByRelation({
                relation: "staff",
                page: staffNotificationsPage,
                pageSize: staffNotificationsPageSize,
            }),
            getCandidateCount(),
            getCandidateCount({
                jobStatus: {
                    $eqi: "Available",
                },
            }),
        ]);

        const jobsJson = await jobsRes.json().catch(() => null);
        const clientsJson = await clientsRes.json().catch(() => null);

        if (!jobsRes.ok) {
            return NextResponse.json(
                { ok: false, error: jobsJson?.error?.message || "Failed to fetch jobs" },
                { status: jobsRes.status }
            );
        }

        const jobs = arr(jobsJson?.data).map(attr).filter(isOpenJob);

        const pipelineCounts = {};
        PIPELINE_STAGES.forEach((s) => {
            pipelineCounts[s] = 0;
        });

        let pipelineCandidates = 0;
        let hiredCandidates = 0;
        let offerLetters = 0;
        let totalVacancies = 0;
        let totalPlacedOrHired = 0;
        let jobsWithoutCandidates = 0;
        let jobsLowProgress = 0;

        const allJobsPerformance = [];

        for (const job of jobs) {
            const assigned = arr(job?.assignCandidatesToJob);

            const jobCounts = {};
            PIPELINE_STAGES.forEach((s) => {
                jobCounts[s] = 0;
            });

            if (assigned.length === 0) {
                jobsWithoutCandidates += 1;
            }

            for (const item of assigned) {
                const stage = normalizeStage(item?.candidateProcessList);

                if (PIPELINE_STAGES.includes(stage)) {
                    pipelineCounts[stage] += 1;
                    jobCounts[stage] += 1;
                    pipelineCandidates += 1;
                }

                if (stage === "Hired Candidate" || stage === "Immigration" || stage === "Placed") {
                    hiredCandidates += 1;
                }

                if (hasOfferLetter(item)) {
                    offerLetters += 1;
                }
            }

            const vacanciesNo = Number(job?.vacanciesNo || job?.vacancyNo || 0);
            const progressHired =
                Number(jobCounts["Hired Candidate"] || 0) + Number(jobCounts["Placed"] || 0);

            totalVacancies += vacanciesNo;
            totalPlacedOrHired += progressHired;

            const progress = vacanciesNo
                ? Math.min(100, Math.round((progressHired / vacanciesNo) * 100))
                : 0;

            if (vacanciesNo > 0 && progress < 50) {
                jobsLowProgress += 1;
            }

            allJobsPerformance.push({
                documentId: job?.documentId || null,
                title: job?.title || job?.jobTitle || "Untitled Job",
                referenceNo: job?.referenceNo || "N/A",
                clientName: getClientName(job?.client?.data || job?.client),
                statusList: job?.statusList || "Open",
                latestUpdate: job?.updatedAt || job?.createdAt || null,
                vacanciesNo,
                totalCandidates: assigned.length,
                shortlisted: jobCounts["Shortlisted Candidate"],
                requestedInterview: jobCounts["Requested Interview"],
                hired: jobCounts["Hired Candidate"],
                hiredLabel: "Offered Candidate",
                immigration: jobCounts["Immigration"],
                placed: jobCounts["Placed"],
                progressHired,
                progress,
            });
        }

        allJobsPerformance.sort((a, b) => new Date(b.latestUpdate || 0) - new Date(a.latestUpdate || 0));

        const jobsTotal = allJobsPerformance.length;
        const jobsPageCount = Math.max(1, Math.ceil(jobsTotal / jobsPageSize));
        const start = (jobsPage - 1) * jobsPageSize;
        const jobsPerformance = allJobsPerformance.slice(start, start + jobsPageSize);

        const offeredCandidates =
            Number(pipelineCounts["Hired Candidate"] || 0) +
            Number(pipelineCounts["Immigration"] || 0) +
            Number(pipelineCounts["Placed"] || 0);

        const activePipelineCandidates =
            Number(pipelineCounts["Shortlisted Candidate"] || 0) +
            Number(pipelineCounts["Requested Interview"] || 0);

        const otherCandidates = Math.max(
            0,
            Number(totalCandidatesCount || 0) -
            Number(availableCandidatesCount || 0) -
            offeredCandidates -
            activePipelineCandidates
        );

        const candidatePieChart = [
            {
                name: "Available Candidates",
                value: Number(availableCandidatesCount || 0),
            },
            {
                name: "Pipeline Candidates",
                value: activePipelineCandidates,
            },
            {
                name: "Offered / Immigration / Placed",
                value: offeredCandidates,
            },
            ...(otherCandidates > 0
                ? [
                    {
                        name: "Other Candidates",
                        value: otherCandidates,
                    },
                ]
                : []),
        ].filter((item) => Number(item.value || 0) > 0);

        return NextResponse.json({
            ok: true,
            stats: {
                openJobs: jobs.length,
                activeClients: clientsJson?.meta?.pagination?.total || 0,
                hiredCandidates,
                pipelineCandidates,
                offerLetters,
                totalVacancies,
                totalPlacedOrHired,
                jobsWithoutCandidates,
                jobsLowProgress,
                interviewCandidates: pipelineCounts["Requested Interview"] || 0,
                immigrationCandidates: pipelineCounts["Immigration"] || 0,
                placedCandidates: pipelineCounts["Placed"] || 0,
            },
            pipelineChart: PIPELINE_STAGES.map((name) => ({
                name,
                label: displayStage(name),
                value: pipelineCounts[name] || 0,
            })),
            jobsPerformance,
            jobsPerformanceMeta: {
                page: jobsPage,
                pageSize: jobsPageSize,
                pageCount: jobsPageCount,
                total: jobsTotal,
                hasMore: jobsPage < jobsPageCount,
            },
            candidateStats: {
                totalCandidates: Number(totalCandidatesCount || 0),
                availableCandidates: Number(availableCandidatesCount || 0),
                offeredCandidates,
                activePipelineCandidates,
                pipelineCandidates,
                offerLettersReceived: offerLetters,
                otherCandidates,
            },
            candidatePieChart,
            recentUpdates: clientNotifications,
            hiringInsights: staffNotifications,
        });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error?.message || "Dashboard fetch failed" },
            { status: error?.status || 500 }
        );
    }
}

export async function POST(req) {
    try {
        const body = await req.json().catch(() => null);

        if (!body) {
            return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
        }

        const action = text(body.action);

        if (action !== "openNotification") {
            return NextResponse.json({ ok: false, error: "Invalid dashboard action" }, { status: 400 });
        }

        const documentId = text(body.documentId || body.notificationDocumentId);

        if (!documentId) {
            return NextResponse.json({ ok: false, error: "Notification documentId is required" }, { status: 400 });
        }

        const current = await getNotificationByDocumentId(documentId);

        if (!current) {
            return NextResponse.json({ ok: false, error: "Notification not found" }, { status: 404 });
        }

        const user = await getCurrentUserFromCookies();
        const openedAt = new Date().toISOString();

        const nextHistory = [
            ...parseOpenHistory(current.openHistoryRaw),
            {
                name: currentUserName(user),
                email: user?.email || "",
                role: currentUserRole(user),
                openedAt,
            },
        ];

        await strapiFetch(`/client-notifications/${documentId}?status=published`, {
            method: "PUT",
            body: JSON.stringify({
                data: {
                    openMessage: true,
                    openHistory: JSON.stringify(nextHistory, null, 2),
                },
            }),
        });

        const updated = await getNotificationByDocumentId(documentId);

        return NextResponse.json({
            ok: true,
            notification: updated,
        });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error?.message || "Notification open history update failed" },
            { status: error?.status || 500 }
        );
    }
}
