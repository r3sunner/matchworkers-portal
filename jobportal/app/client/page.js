"use client";

import React, { useEffect, useMemo, useState } from "react";
import useAuthClient from "@/lib/useAuthClient";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import { ClipLoader } from "react-spinners";

const RED = "#b91c1c";

// Recent Updates infinite-scroll settings
// Change this to 3 when testing scroll loading. Keep 7 for live use.
const RECENT_ACTIVITY_PAGE_SIZE = 7;
const RECENT_ACTIVITY_SCROLL_TRIGGER_PX = 80;

function shortStageName(name) {
    const map = {
        "Requested Interview": "Interview",
        "Hired Candidate": "Offered",
        Immigration: "Immigration",
        Placed: "Placed",
    };

    return map[name] || name;
}

function displayOfferText(value) {
    if (value === null || value === undefined) return "";

    return String(value)
        .replace(/\bHired Candidate\b/g, "Offered Candidate")
        .replace(/\bhired candidate\b/g, "offered candidate")
        .replace(/\bHired\b/g, "Offered")
        .replace(/\bhired\b/g, "offered")
        .replace(/\bHire\b/g, "Offer")
        .replace(/\bhire\b/g, "offer")
        .replace(/\bHiring\b/g, "Offer")
        .replace(/\bhiring\b/g, "offering");
}


function formatDateTime(value) {
    if (!value) return "—";

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);

    return d.toLocaleString();
}

function getAuthClientDocumentId(user) {
    return String(
        user?.documentId ||
        user?.clientDocumentId ||
        user?.client?.documentId ||
        user?.client?.data?.documentId ||
        user?.client?.data?.attributes?.documentId ||
        ""
    ).trim();
}

function Card({ title, value, hint, icon, color = "red" }) {
    const colorMap = {
        red: "from-red-600 to-red-800",
        amber: "from-amber-500 to-orange-600",
        blue: "from-sky-500 to-blue-700",
        green: "from-emerald-500 to-green-700",
        purple: "from-violet-500 to-purple-700",
    };

    return (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className={`h-1.5 bg-gradient-to-r ${colorMap[color] || colorMap.red}`} />

            <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-gray-500">{title}</p>
                        <h2 className="mt-3 text-3xl font-extrabold text-gray-900">
                            {value}
                        </h2>
                    </div>

                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-2xl">
                        {icon}
                    </div>
                </div>

                {hint ? (
                    <div className="mt-4 inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                        {hint}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function SkeletonCard() {
    return (
        <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="h-4 w-28 rounded bg-gray-200" />
            <div className="mt-5 h-8 w-20 rounded bg-gray-200" />
            <div className="mt-5 h-3 w-24 rounded bg-gray-100" />
        </div>
    );
}

function Section({ title, subtitle, children, right }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                    <h2 className="text-lg font-extrabold text-gray-900">{title}</h2>
                    {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
                </div>

                {right}
            </div>

            {children}
        </div>
    );
}

function Badge({ children, color = "gray" }) {
    const map = {
        red: "bg-red-50 text-red-700 border-red-200",
        green: "bg-emerald-50 text-emerald-700 border-emerald-200",
        amber: "bg-amber-50 text-amber-700 border-amber-200",
        blue: "bg-sky-50 text-sky-700 border-sky-200",
        purple: "bg-purple-50 text-purple-700 border-purple-200",
        gray: "bg-gray-50 text-gray-700 border-gray-200",
    };

    return (
        <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${map[color] || map.gray
                }`}
        >
            {children}
        </span>
    );
}

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
            <div className="mb-1 text-sm font-bold text-gray-900">
                {shortStageName(label)}
            </div>

            {payload.map((item, index) => (
                <div key={index} className="text-sm text-gray-700">
                    {item.name}:{" "}
                    <span className="font-bold text-red-700">{item.value}</span>
                </div>
            ))}
        </div>
    );
}

export default function ClientDashboardPage() {
    const { user: authUser, authLoading } = useAuthClient();

    const authClientDocumentId = useMemo(
        () => getAuthClientDocumentId(authUser),
        [authUser]
    );

    return (
        <ClientDashboardContent
            key={
                authLoading
                    ? "auth-loading"
                    : authClientDocumentId || "authenticated-client"
            }
            authLoading={authLoading}
            authClientDocumentId={authClientDocumentId}
        />
    );
}

function ClientDashboardContent({ authLoading, authClientDocumentId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [chartReady, setChartReady] = useState(false);
    const [error, setError] = useState("");

    const [activityPage, setActivityPage] = useState(1);
    const [activityLoadingMore, setActivityLoadingMore] = useState(false);

    async function loadDashboard(nextActivityPage = 1, appendActivity = false) {
        try {
            if (appendActivity) {
                setActivityLoadingMore(true);
            } else {
                setLoading(true);
                setChartReady(false);
                setActivityPage(1);
            }

            setError("");

            const params = new URLSearchParams({
                activityPage: String(nextActivityPage),
                activityPageSize: String(RECENT_ACTIVITY_PAGE_SIZE),
            });

            if (authClientDocumentId) {
                params.set("clientDocumentId", authClientDocumentId);
            }

            const res = await fetch(`/api/clients/dashboard?${params.toString()}`, {
                cache: "no-store",
            });

            const json = await res.json();

            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "Failed to load dashboard");
            }

            if (appendActivity) {
                setData((prev) => ({
                    ...(prev || json),
                    ...json,
                    recentActivity: [
                        ...((prev?.recentActivity || [])),
                        ...(json?.recentActivity || []),
                    ],
                }));
            } else {
                setData(json);
                setTimeout(() => {
                    setChartReady(true);
                }, 350);
            }

            setActivityPage(nextActivityPage);
        } catch (err) {
            setError(err?.message || "Dashboard error");
        } finally {
            if (appendActivity) {
                setActivityLoadingMore(false);
            } else {
                setLoading(false);
            }
        }
    }

    useEffect(() => {
        if (authLoading) return undefined;

        const controller = new AbortController();
        let chartTimer;

        const params = new URLSearchParams({
            activityPage: "1",
            activityPageSize: String(RECENT_ACTIVITY_PAGE_SIZE),
        });

        if (authClientDocumentId) {
            params.set("clientDocumentId", authClientDocumentId);
        }

        fetch(`/api/clients/dashboard?${params.toString()}`, {
            cache: "no-store",
            signal: controller.signal,
        })
            .then(async (res) => {
                const json = await res.json();

                if (!res.ok || !json?.ok) {
                    throw new Error(json?.error || "Failed to load dashboard");
                }

                return json;
            })
            .then((json) => {
                setData(json);
                setActivityPage(1);
                setError("");

                chartTimer = window.setTimeout(() => {
                    setChartReady(true);
                }, 350);
            })
            .catch((err) => {
                if (err?.name === "AbortError") return;
                setError(err?.message || "Dashboard error");
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => {
            controller.abort();

            if (chartTimer) {
                window.clearTimeout(chartTimer);
            }
        };
    }, [authLoading, authClientDocumentId]);

    function loadMoreRecentActivity() {
        if (activityLoadingMore || loading || !data?.activityPagination?.hasMore) return;
        loadDashboard(activityPage + 1, true);
    }

    function handleRecentActivityScroll(e) {
        const el = e.currentTarget;

        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

        if (distanceFromBottom <= RECENT_ACTIVITY_SCROLL_TRIGGER_PX) {
            loadMoreRecentActivity();
        }
    }

    function handleRecentActivityWheel(e) {
        // Fallback: if 7 cards are not tall enough to create a real scrollbar,
        // mouse-wheel down still loads the next page.
        if (e.deltaY <= 0) return;

        const el = e.currentTarget;
        const hasRealScroll = el.scrollHeight > el.clientHeight + 5;

        if (!hasRealScroll) {
            loadMoreRecentActivity();
        }
    }

    const stats = useMemo(() => data?.stats || {}, [data?.stats]);
    const user = data?.user || {};

    const vacancyProgress = useMemo(() => {
        const vacancies = Number(stats.totalVacancies || 0);
        const hired = Number(stats.hiredOrPlaced || 0);

        if (!vacancies) return 0;

        return Math.min(100, Math.round((hired / vacancies) * 100));
    }, [stats]);

    const openJobsPerformance = useMemo(() => {
        return (data?.jobsPerformance || []).filter(
            (job) => String(job.statusList || "").toLowerCase() === "open"
        );
    }, [data?.jobsPerformance]);

    const visiblePipelineChart = useMemo(() => {
        return (data?.pipelineChart || []).filter(
            (item) => String(item?.name || "") !== "Shortlisted Candidate"
        );
    }, [data?.pipelineChart]);

    const visibleRecentActivity = useMemo(() => {
        return (data?.recentActivity || []).filter(
            (item) => !String(item?.text || "").toLowerCase().includes("shortlisted")
        );
    }, [data?.recentActivity]);

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-red-50/40 p-4 md:p-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-800 via-red-700 to-gray-950 p-6 text-white shadow-lg">
                    <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10" />
                    <div className="absolute bottom-0 right-20 h-28 w-28 rounded-full bg-red-400/20" />

                    <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
                        <div>
                            <Badge color="red">Client Dashboard</Badge>

                            <h1 className="mt-4 text-2xl font-extrabold md:text-4xl">
                                My Job Progress
                            </h1>

                            <p className="mt-3 max-w-2xl text-sm leading-6 text-red-50">
                                View your posted jobs, vacancies, candidate pipeline, offer letters,
                                and offer progress.
                            </p>

                            {!loading && user?.name ? (
                                <p className="mt-3 text-sm font-semibold text-white">
                                    Logged in as: {user.name}
                                </p>
                            ) : null}
                        </div>

                        <button
                            onClick={() => loadDashboard(1, false)}
                            className="w-fit rounded-xl bg-white/15 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/20 transition hover:bg-white/25"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                        {error}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    {loading ? (
                        <>
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </>
                    ) : (
                        <>
                            <Card
                                title="Open Jobs"
                                value={stats.openJobs || 0}
                                hint={`${stats.totalJobs || 0} total jobs`}
                                icon="💼"
                                color="red"
                            />

                            <Card
                                title="Total Vacancies"
                                value={stats.totalVacancies || 0}
                                hint="Required offers"
                                icon="📌"
                                color="blue"
                            />

                            <Card
                                title="Offered / Placed"
                                value={stats.hiredOrPlaced || 0}
                                hint={`${vacancyProgress}% progress`}
                                icon="✅"
                                color="green"
                            />

                            <Card
                                title="In Pipeline"
                                value={stats.totalPipelineCandidates || 0}
                                hint="Candidates in process"
                                icon="📊"
                                color="purple"
                            />

                            <Card
                                title="Offer Letters"
                                value={stats.offerLetters || 0}
                                hint="Uploaded"
                                icon="📄"
                                color="amber"
                            />
                        </>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
                    <Section
                        title="Candidate Pipeline"
                        subtitle="Stage wise progress for your jobs"
                        right={<Badge color="red">Your Jobs</Badge>}
                    >
                        {!chartReady ? (
                            <div className="flex h-[340px] items-center justify-center">
                                <div className="text-center">
                                    <ClipLoader size={42} color={RED} />
                                    <p className="mt-3 text-sm font-semibold text-gray-500">
                                        Loading pipeline chart...
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="h-[340px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={visiblePipelineChart}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fontSize: 11 }}
                                            interval={0}
                                            height={70}
                                            tickFormatter={shortStageName}
                                        />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar
                                            dataKey="value"
                                            name="Candidates"
                                            fill={RED}
                                            radius={[10, 10, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Section>

                    <Section
                        title="Progress Summary"
                        subtitle="Vacancies compared with offered and placed candidates"
                        right={<Badge color="green">{vacancyProgress}%</Badge>}
                    >
                        {loading ? (
                            <div className="flex h-[340px] items-center justify-center">
                                <ClipLoader size={42} color={RED} />
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div>
                                    <div className="mb-2 flex items-center justify-between text-sm">
                                        <span className="font-bold text-gray-800">
                                            Overall Vacancy Progress
                                        </span>
                                        <span className="font-extrabold text-red-700">
                                            {stats.hiredOrPlaced || 0}/{stats.totalVacancies || 0}
                                        </span>
                                    </div>

                                    <div className="h-4 overflow-hidden rounded-full bg-gray-100">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-900"
                                            style={{ width: `${vacancyProgress}%` }}
                                        />
                                    </div>
                                </div>

                                {visiblePipelineChart.map((item) => {
                                    const max = Math.max(
                                        ...visiblePipelineChart.map((x) => Number(x.value || 0)),
                                        1
                                    );

                                    const percent = Math.round((Number(item.value || 0) / max) * 100);

                                    return (
                                        <div key={item.name}>
                                            <div className="mb-1 flex items-center justify-between text-sm">
                                                <span className="font-bold text-gray-800">
                                                    {shortStageName(item.name)}
                                                </span>
                                                <span className="font-extrabold text-red-700">
                                                    {item.value}
                                                </span>
                                            </div>

                                            <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-800"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Section>
                </div>

                <Section
                    title="My Posted Jobs"
                    subtitle="Each job progress is based on vacancies and offered/placed candidates"
                    right={<Badge color="blue">Job Wise</Badge>}
                >
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="text-center">
                                <ClipLoader size={38} color={RED} />
                                <p className="mt-3 text-sm font-semibold text-gray-500">
                                    Loading jobs report...
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="rounded-2xl border border-gray-100"
                            style={{
                                height: "680px",
                                overflow: "auto",
                                overscrollBehavior: "contain",
                                scrollbarGutter: "stable",
                            }}
                        >
                            <table className="w-full min-w-[1250px] text-left text-sm">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-gradient-to-r from-red-700 to-gray-900 text-xs uppercase text-white">
                                        <th className="px-4 py-4">Job</th>
                                        <th className="px-4 py-4">Status</th>
                                        <th className="px-4 py-4">Latest Update</th>
                                        <th className="px-4 py-4">Vacancies</th>
                                        <th className="px-4 py-4">Interview</th>
                                        <th className="px-4 py-4">Offered</th>
                                        <th className="px-4 py-4">Immigration</th>
                                        <th className="px-4 py-4">Placed</th>
                                        <th className="px-4 py-4">Progress</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {openJobsPerformance.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={9}
                                                className="px-4 py-10 text-center text-sm font-semibold text-gray-500"
                                            >
                                                No open jobs found for your account.
                                            </td>
                                        </tr>
                                    ) : (
                                        openJobsPerformance.map((job, index) => {
                                            const vacancies = Number(job.vacanciesNo || 0);
                                            const hired = Number(job.progressHired || 0);
                                            const progress = vacancies
                                                ? Math.min(100, Math.round((hired / vacancies) * 100))
                                                : 0;

                                            return (
                                                <tr
                                                    key={`${job.documentId || job.referenceNo}-${index}`}
                                                    className="border-b bg-white transition hover:bg-red-50/40"
                                                >
                                                    <td className="px-4 py-4">
                                                        <div className="font-extrabold text-gray-900">
                                                            <a
                                                                href={`/jobs/${job.documentId}/`}
                                                                className="text-red-700 hover:underline"
                                                            >
                                                                {job.title}
                                                            </a>
                                                        </div>
                                                        <div className="mt-1 text-xs font-semibold text-gray-500">
                                                            {job.referenceNo}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <Badge
                                                            color={
                                                                String(job.statusList || "").toLowerCase() === "open"
                                                                    ? "green"
                                                                    : "gray"
                                                            }
                                                        >
                                                            {job.statusList}
                                                        </Badge>
                                                    </td>

                                                    <td className="px-4 py-4 text-xs font-semibold text-gray-700">
                                                        {formatDateTime(job.latestUpdateDate)}
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <Badge color="red">{job.vacanciesNo || 0}</Badge>
                                                    </td>

                                                    <td className="px-4 py-4 font-bold text-amber-700">
                                                        {job.requestedInterview || 0}
                                                    </td>

                                                    <td className="px-4 py-4 font-bold text-emerald-700">
                                                        {job.hired || 0}
                                                    </td>

                                                    <td className="px-4 py-4 font-bold text-purple-700">
                                                        {job.immigration || 0}
                                                    </td>

                                                    <td className="px-4 py-4 font-bold text-red-700">
                                                        {job.placed || 0}
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-2.5 w-44 overflow-hidden rounded-full bg-gray-200">
                                                                <div
                                                                    className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-900"
                                                                    style={{ width: `${progress}%` }}
                                                                />
                                                            </div>

                                                            <span className="text-xs font-extrabold text-gray-700">
                                                                {progress}%
                                                            </span>
                                                        </div>

                                                        <div className="mt-1 text-xs font-semibold text-gray-500">
                                                            {hired}/{vacancies} offered / placed
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
                    <Section
                        title="Recent Updates"
                        subtitle="Latest movement in your jobs"
                        right={<Badge color="purple">Recent</Badge>}
                    >
                        {loading ? (
                            <div className="flex h-36 items-center justify-center">
                                <ClipLoader size={32} color={RED} />
                            </div>
                        ) : visibleRecentActivity.length ? (
                            <div
                                className="space-y-3 pr-2"
                                style={{
                                    height: "420px",
                                    overflowY: "scroll",
                                    overscrollBehavior: "contain",
                                    scrollbarGutter: "stable",
                                }}
                                onScroll={handleRecentActivityScroll}
                                onWheel={handleRecentActivityWheel}
                            >
                                {visibleRecentActivity.map((item, index) => (
                                    <div
                                        key={`${item.jobDocumentId || "activity"}-${item.date || index}-${index}`}
                                        className="rounded-2xl border border-gray-200 bg-gradient-to-r from-white to-red-50/50 p-4"
                                    >
                                        <a
                                            href={`/jobs/${item.jobDocumentId}/`}
                                            className="block text-sm font-bold text-gray-900 hover:text-red-700 hover:underline"
                                        >
                                            {displayOfferText(item.text)}
                                        </a>

                                        <div className="mt-1 text-sm font-semibold text-gray-800">
                                            {item.jobTitle || "Untitled Job"}
                                        </div>

                                        <div className="mt-1 text-xs font-semibold text-gray-500">
                                            {formatDateTime(item.date)}
                                        </div>
                                    </div>
                                ))}

                                {activityLoadingMore ? (
                                    <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white p-3 text-sm font-semibold text-gray-500">
                                        <ClipLoader size={18} color={RED} />
                                        Loading more updates...
                                    </div>
                                ) : null}

                                {!data?.activityPagination?.hasMore ? (
                                    <div className="py-2 text-center text-xs font-semibold text-gray-400">
                                        No more updates.
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <p className="text-sm font-semibold text-gray-500">
                                No recent updates found.
                            </p>
                        )}
                    </Section>

                    <Section
                        title="Offer Insights"
                        subtitle="Summary based on your jobs only"
                        right={<Badge color="amber">Insights</Badge>}
                    >
                        {loading ? (
                            <div className="flex h-36 items-center justify-center">
                                <ClipLoader size={32} color={RED} />
                            </div>
                        ) : (
                            <div className="space-y-3 text-sm text-gray-700">
                                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                                    <b className="text-red-800">Vacancy Coverage:</b>{" "}
                                    {stats.hiredOrPlaced || 0} of {stats.totalVacancies || 0}{" "}
                                    vacancies are offered or placed. Overall progress is{" "}
                                    <b>{vacancyProgress}%</b>.
                                </div>

                                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                                    <b className="text-amber-800">Interview Stage:</b>{" "}
                                    {stats.interviewCandidates || 0} candidate(s) are currently
                                    waiting in interview stage.
                                </div>

                                <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
                                    <b className="text-purple-800">Immigration Process:</b>{" "}
                                    {stats.immigrationCandidates || 0} candidate(s) are currently in
                                    immigration stage.
                                </div>

                                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                                    <b className="text-sky-800">Job Status:</b> You have{" "}
                                    {stats.openJobs || 0} open job(s) and {stats.closedJobs || 0}{" "}
                                    closed job(s).
                                </div>
                            </div>
                        )}
                    </Section>
                </div>
            </div>
        </main>
    );
}