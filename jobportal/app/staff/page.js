"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts";
import { ClipLoader } from "react-spinners";

const RED = "#b91c1c";

function shortStageName(name) {
    const map = {
        "Requested Interview": "Interview",
        "Hired Candidate": "Offered",
        "Offered Candidate": "Offered",
        Immigration: "Immigration",
        Placed: "Placed",
    };

    return map[name] || name;
}

function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

function appendUniqueByDocumentId(oldItems, newItems) {
    const map = new Map();

    [...(oldItems || []), ...(newItems || [])].forEach((item) => {
        const key = String(item?.documentId || item?.id || Math.random());
        if (!map.has(key)) map.set(key, item);
    });

    return [...map.values()];
}

const REFRESH_RATE_COOKIE = "staff_dashboard_refresh_rate";
const REFRESH_RATE_OPTIONS = [10, 15, 20, 30, 45, 60];

function getCookieValue(name) {
    if (typeof document === "undefined") return "";

    return document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`))
        ?.split("=")
        .slice(1)
        .join("=") || "";
}

function setCookieValue(name, value, maxAgeDays = 365) {
    if (typeof document === "undefined") return;

    document.cookie = `${name}=${encodeURIComponent(String(value))}; path=/; max-age=${60 * 60 * 24 * maxAgeDays}; SameSite=Lax`;
}

function normalizeRefreshRate(value) {
    const n = Number(value);
    return REFRESH_RATE_OPTIONS.includes(n) ? n : 20;
}

function mergeLatestByDocumentId(newItems, oldItems) {
    const map = new Map();

    [...(newItems || []), ...(oldItems || [])].forEach((item) => {
        const key = String(item?.documentId || item?.id || "");
        if (!key) return;
        if (!map.has(key)) map.set(key, item);
    });

    return [...map.values()];
}

function nextMetaAfterSilentRefresh(oldMeta, freshMeta, currentLength) {
    const pageSize = Number(oldMeta?.pageSize || freshMeta?.pageSize || 10);
    const total = Number(freshMeta?.total || 0);
    const loaded = Number(currentLength || 0);
    const page = Math.max(1, Math.ceil(loaded / pageSize));

    return {
        ...(freshMeta || {}),
        page,
        pageSize,
        total,
        pageCount: Number(freshMeta?.pageCount || 1),
        hasMore: loaded < total,
    };
}

function RefreshCountdown({ secondsLeft, refreshRate, refreshing }) {
    const safeRate = Math.max(1, Number(refreshRate || 20));
    const safeLeft = Math.max(0, Math.min(safeRate, Number(secondsLeft || 0)));
    const percent = Math.max(0, Math.min(100, (safeLeft / safeRate) * 100));

    return (
        <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 shadow-sm backdrop-blur">
            <div
                className="flex h-11 w-11 items-center justify-center rounded-full p-[3px]"
                style={{
                    background: `conic-gradient(#ffffff ${percent}%, rgba(255,255,255,0.22) ${percent}% 100%)`,
                }}
                title={`Next refresh in ${safeLeft}s`}
            >
                <div className="flex h-full w-full items-center justify-center rounded-full bg-red-800 text-sm font-extrabold text-white">
                    {refreshing ? "↻" : safeLeft}
                </div>
            </div>
            <div className="hidden sm:block">
                <div className="text-[10px] font-bold uppercase tracking-wide text-red-100">Auto refresh</div>
                <div className="text-xs font-bold text-white">Every {safeRate}s</div>
            </div>
        </div>
    );
}

function formatOpenHistoryPlainText(history) {
    if (!Array.isArray(history) || history.length === 0) return "No open history found.";

    return history
        .map((row, index) => {
            if (row && typeof row === "object") {
                return [
                    `${index + 1}. ${row.name || row.email || "Unknown User"}`,
                    `Email: ${row.email || "N/A"}`,
                    `Role: ${row.role || "N/A"}`,
                    `Opened At: ${formatDateTime(row.openedAt)}`,
                ].join("\n");
            }

            return `${index + 1}. ${String(row || "N/A")}`;
        })
        .join("\n\n");
}

function Card({ title, value, hint, icon, color = "red", animationDelay = 0 }) {
    const colorMap = {
        red: "from-red-600 to-red-800",
        amber: "from-amber-500 to-orange-600",
        blue: "from-sky-500 to-blue-700",
        green: "from-emerald-500 to-green-700",
        purple: "from-violet-500 to-purple-700",
    };

    return (
        <div
            className="dashboard-stat-card overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            style={{ animationDelay: `${animationDelay}ms` }}
        >
            <div className={`h-1.5 bg-gradient-to-r ${colorMap[color] || colorMap.red}`} />

            <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-gray-500">{title}</p>
                        <h2 className="mt-3 text-3xl font-extrabold text-gray-900">
                            {value}
                        </h2>
                    </div>

                    <div
                        className="dashboard-stat-icon flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-2xl"
                        style={{ animationDelay: `${animationDelay + 180}ms` }}
                    >
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

function Section({ title, children, right, subtitle }) {
    return (
        <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
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
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${map[color] || map.gray}`}>
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
                    {item.name}: <span className="font-bold text-red-700">{item.value}</span>
                </div>
            ))}
        </div>
    );
}

const CANDIDATE_PIE_COLORS = ["#16a34a", "#2563eb", "#b91c1c", "#9ca3af"];

const SLIM_METRIC_TONES = {
    red: {
        box: "border-red-100 bg-red-50/90 text-red-900",
        dot: "bg-red-700",
    },
    green: {
        box: "border-emerald-100 bg-emerald-50/90 text-emerald-900",
        dot: "bg-emerald-600",
    },
    blue: {
        box: "border-sky-100 bg-sky-50/90 text-sky-900",
        dot: "bg-sky-600",
    },
    amber: {
        box: "border-amber-100 bg-amber-50/90 text-amber-900",
        dot: "bg-amber-600",
    },
    purple: {
        box: "border-purple-100 bg-purple-50/90 text-purple-900",
        dot: "bg-purple-600",
    },
    gray: {
        box: "border-gray-100 bg-gray-50/90 text-gray-900",
        dot: "bg-gray-500",
    },
};

function CandidatePieTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;

    const item = payload[0];

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
            <div className="text-sm font-extrabold text-gray-900">{item?.name}</div>
            <div className="mt-1 text-sm text-gray-700">
                Candidates: <span className="font-extrabold text-red-700">{item?.value || 0}</span>
            </div>
        </div>
    );
}

function SlimMetricBlock({ label, value, tone = "red", animationDelay = 0 }) {
    const toneClass = SLIM_METRIC_TONES[tone] || SLIM_METRIC_TONES.red;

    return (
        <div
            className={`dashboard-slim-card flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-2.5 py-2 ${toneClass.box}`}
            style={{ animationDelay: `${animationDelay}ms` }}
        >
            <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${toneClass.dot}`} />
                <span className="truncate text-[11px] font-extrabold uppercase tracking-wide opacity-80">
                    {label}
                </span>
            </div>
            <span className="shrink-0 text-lg font-black leading-none">
                {value || 0}
            </span>
        </div>
    );
}

function PipelineInfoBlocks({ data, stats }) {
    const rows = Array.isArray(data) ? data : [];
    const findValue = (name) => Number(rows.find((item) => item?.name === name)?.value || 0);

    const interview = findValue("Requested Interview");
    const offered = findValue("Hired Candidate");
    const immigration = Number(stats?.immigrationCandidates || 0);
    const placed = Number(stats?.placedCandidates || 0);
    const total = interview + offered + immigration + placed;

    return (
        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
            <SlimMetricBlock label="Total Pipeline" value={total} tone="red" animationDelay={100} />
            <SlimMetricBlock label="Interview" value={interview} tone="amber" animationDelay={180} />
            <SlimMetricBlock label="Offered" value={offered} tone="green" animationDelay={260} />
            <SlimMetricBlock label="Immigration" value={immigration} tone="purple" animationDelay={340} />
            <SlimMetricBlock label="Placed" value={placed} tone="gray" animationDelay={420} />
        </div>
    );
}

function CandidatesOverview({ stats, data }) {
    const pieData = Array.isArray(data) ? data : [];
    const hasPieData = pieData.some((item) => Number(item.value || 0) > 0);

    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white via-red-50/30 to-sky-50/50 p-3">
                {hasPieData ? (
                    <div className="h-[230px] min-h-[230px] min-w-0 w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={48}
                                    outerRadius={78}
                                    paddingAngle={3}
                                    stroke="#ffffff"
                                    strokeWidth={3}
                                    isAnimationActive
                                    animationBegin={80}
                                    animationDuration={650}
                                    animationEasing="ease-out"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell
                                            key={`${entry.name}-${index}`}
                                            fill={CANDIDATE_PIE_COLORS[index % CANDIDATE_PIE_COLORS.length]}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip content={<CandidatePieTooltip />} />
                                <Legend
                                    verticalAlign="bottom"
                                    height={42}
                                    iconType="circle"
                                    formatter={(value) => (
                                        <span className="text-xs font-bold text-gray-700">{value}</span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="flex h-[230px] items-center justify-center text-sm font-bold text-gray-500">
                        No candidate data found.
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <SlimMetricBlock label="Total Candidates" value={stats.totalCandidates} tone="red" animationDelay={80} />
                <SlimMetricBlock label="Available" value={stats.availableCandidates} tone="green" animationDelay={140} />
                <SlimMetricBlock label="Offered Candidates" value={stats.offeredCandidates} tone="amber" animationDelay={200} />
                <SlimMetricBlock label="Pipeline Candidates" value={stats.pipelineCandidates} tone="blue" animationDelay={260} />
                <div className="sm:col-span-2">
                    <SlimMetricBlock label="Offer Letters Received" value={stats.offerLettersReceived} tone="purple" animationDelay={320} />
                </div>
            </div>
        </div>
    );
}

function MailIcon({ active }) {
    if (!active) return null;

    return (
        <span
            title="Email sent"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-xs text-emerald-700"
        >
            ✉
        </span>
    );
}

function HistoryIcon({ active, onClick }) {
    if (!active) return null;

    return (
        <button
            type="button"
            title="View open history"
            onClick={onClick}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-sm text-blue-700 hover:bg-blue-100"
        >
            🕘
        </button>
    );
}

function NotificationCard({ item, accent = "red", onOpen, onHistory, showHistory = true }) {
    const hasHistory = showHistory && Array.isArray(item?.openHistory) && item.openHistory.length > 0;
    const accentClass = accent === "amber" ? "hover:border-amber-200 hover:bg-amber-50/50" : "hover:border-red-200 hover:bg-red-50/50";

    return (
        <div
            className={`flex w-full items-center justify-between gap-3 border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition ${accentClass}`}
        >
            <button
                type="button"
                onClick={() => onOpen(item)}
                className="min-w-0 flex-1 text-left"
            >
                <div className="truncate text-sm font-extrabold text-gray-900">
                    {item?.title || "Untitled Notification"}
                </div>
                <div className="mt-0.5 text-xs font-semibold text-gray-500">
                    {formatDateTime(item?.createdAt)}
                </div>
            </button>

            <div className="flex shrink-0 items-center gap-1.5">
                <MailIcon active={item?.sendEmail} />
                <HistoryIcon
                    active={hasHistory}
                    onClick={(e) => {
                        e.stopPropagation();
                        onHistory(item);
                    }}
                />
            </div>
        </div>
    );
}

function NotificationModal({ item, type, onClose, onHistory }) {
    if (!item) return null;

    const isClient = type === "client";
    const hasHistory = Array.isArray(item?.openHistory) && item.openHistory.length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-red-700 to-gray-950 px-5 py-4 text-white">
                    <div className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wide text-red-100">
                            {isClient ? "Client Notification" : "Staff Notification"}
                        </div>
                        <h3 className="mt-1 truncate text-lg font-extrabold">{item.title}</h3>
                        <div className="mt-1 text-xs text-red-50">{formatDateTime(item.createdAt)}</div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/10"
                    >
                        Close
                    </button>
                </div>

                <div className="max-h-[calc(90vh-80px)] overflow-y-auto p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <div className="text-xs font-bold uppercase text-gray-500">
                                {isClient ? "Client Name" : "Staff Name"}
                            </div>
                            <div className="mt-1 text-sm font-extrabold text-gray-900">
                                {isClient ? item.clientName : item.staffName}
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <div className="text-xs font-bold uppercase text-gray-500">Email Status</div>
                            <div className="mt-1 flex items-center gap-2 text-sm font-extrabold text-gray-900">
                                <MailIcon active={item.sendEmail} />
                                {item.sendEmail ? "Email sent" : "Email not sent"}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                        <div className="text-xs font-bold uppercase text-gray-500">Title</div>
                        <div className="mt-1 text-sm font-extrabold text-gray-900">{item.title}</div>
                    </div>

                    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                        <div className="text-xs font-bold uppercase text-gray-500">Details</div>
                        <div className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-800">
                            {item.details || "—"}
                        </div>
                    </div>

                    {!isClient && hasHistory ? (
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={() => onHistory(item)}
                                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
                            >
                                🕘 View Open History
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function HistoryModal({ item, onClose }) {
    if (!item) return null;

    const history = Array.isArray(item?.openHistory) ? item.openHistory : [];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                    <div>
                        <h3 className="text-lg font-extrabold text-gray-900">Open History</h3>
                        <div className="text-xs font-semibold text-gray-500">{item.title}</div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
                    >
                        Close
                    </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto p-5">
                    <pre className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-800">
                        {formatOpenHistoryPlainText(history)}
                    </pre>
                </div>
            </div>
        </div>
    );
}

async function fetchDashboardData(params = {}) {
    const search = new URLSearchParams({
        days: String(params.days ?? 30),
        jobsPage: String(params.jobsPage || 1),
        jobsPageSize: String(params.jobsPageSize || 10),
        clientNotificationsPage: String(params.clientNotificationsPage || 1),
        clientNotificationsPageSize: String(params.clientNotificationsPageSize || 15),
        staffNotificationsPage: String(params.staffNotificationsPage || 1),
        staffNotificationsPageSize: String(params.staffNotificationsPageSize || 15),
    });

    const res = await fetch(`/api/staff/dashboard?${search.toString()}`, {
        cache: "no-store",
        signal: params.signal,
    });

    const json = await res.json();

    if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load dashboard");
    }

    return json;
}

export default function StaffDashboardPage() {
    const [data, setData] = useState(null);
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [chartReady, setChartReady] = useState(false);
    const [error, setError] = useState("");

    const [jobsPerformance, setJobsPerformance] = useState([]);
    const [jobsMeta, setJobsMeta] = useState({ page: 1, pageSize: 10, pageCount: 1, total: 0, hasMore: false });
    const [jobsLoadingMore, setJobsLoadingMore] = useState(false);

    const [recentUpdates, setRecentUpdates] = useState([]);
    const [recentMeta, setRecentMeta] = useState({ page: 1, pageSize: 15, pageCount: 1, total: 0, hasMore: false });
    const [recentLoadingMore, setRecentLoadingMore] = useState(false);

    const [hiringInsights, setHiringInsights] = useState([]);
    const [insightMeta, setInsightMeta] = useState({ page: 1, pageSize: 15, pageCount: 1, total: 0, hasMore: false });
    const [insightLoadingMore, setInsightLoadingMore] = useState(false);

    const [selectedNotification, setSelectedNotification] = useState(null);
    const [selectedNotificationType, setSelectedNotificationType] = useState("client");
    const [historyNotification, setHistoryNotification] = useState(null);

    const [refreshRate, setRefreshRate] = useState(() =>
        normalizeRefreshRate(getCookieValue(REFRESH_RATE_COOKIE))
    );
    const [secondsLeft, setSecondsLeft] = useState(() =>
        normalizeRefreshRate(getCookieValue(REFRESH_RATE_COOKIE))
    );
    const [silentRefreshing, setSilentRefreshing] = useState(false);

    const jobsLockRef = useRef(false);
    const recentLockRef = useRef(false);
    const insightLockRef = useRef(false);
    const silentRefreshLockRef = useRef(false);
    const silentRefreshRef = useRef(null);

    async function loadDashboard(selectedDays = days) {
        try {
            setLoading(true);
            setChartReady(false);
            setError("");

            const json = await fetchDashboardData({
                days: selectedDays,
                jobsPage: 1,
                jobsPageSize: 10,
                clientNotificationsPage: 1,
                clientNotificationsPageSize: 15,
                staffNotificationsPage: 1,
                staffNotificationsPageSize: 15,
            });

            setData(json);
            setJobsPerformance(Array.isArray(json.jobsPerformance) ? json.jobsPerformance : []);
            setJobsMeta(json.jobsPerformanceMeta || { page: 1, pageSize: 10, pageCount: 1, total: 0, hasMore: false });
            setRecentUpdates(Array.isArray(json?.recentUpdates?.items) ? json.recentUpdates.items : []);
            setRecentMeta(json?.recentUpdates?.meta || { page: 1, pageSize: 15, pageCount: 1, total: 0, hasMore: false });
            setHiringInsights(Array.isArray(json?.hiringInsights?.items) ? json.hiringInsights.items : []);
            setInsightMeta(json?.hiringInsights?.meta || { page: 1, pageSize: 15, pageCount: 1, total: 0, hasMore: false });

            setTimeout(() => {
                setChartReady(true);
            }, 350);
        } catch (err) {
            setError(err?.message || "Dashboard error");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        let cancelled = false;
        let chartTimer = null;
        const controller = new AbortController();

        async function loadInitialDashboard() {
            try {
                const json = await fetchDashboardData({
                    days: 30,
                    jobsPage: 1,
                    jobsPageSize: 10,
                    clientNotificationsPage: 1,
                    clientNotificationsPageSize: 15,
                    staffNotificationsPage: 1,
                    staffNotificationsPageSize: 15,
                    signal: controller.signal,
                });

                if (cancelled) return;

                setData(json);
                setJobsPerformance(Array.isArray(json.jobsPerformance) ? json.jobsPerformance : []);
                setJobsMeta(json.jobsPerformanceMeta || { page: 1, pageSize: 10, pageCount: 1, total: 0, hasMore: false });
                setRecentUpdates(Array.isArray(json?.recentUpdates?.items) ? json.recentUpdates.items : []);
                setRecentMeta(json?.recentUpdates?.meta || { page: 1, pageSize: 15, pageCount: 1, total: 0, hasMore: false });
                setHiringInsights(Array.isArray(json?.hiringInsights?.items) ? json.hiringInsights.items : []);
                setInsightMeta(json?.hiringInsights?.meta || { page: 1, pageSize: 15, pageCount: 1, total: 0, hasMore: false });

                chartTimer = window.setTimeout(() => {
                    if (!cancelled) setChartReady(true);
                }, 350);
            } catch (err) {
                if (!cancelled && err?.name !== "AbortError") {
                    setError(err?.message || "Dashboard error");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadInitialDashboard();

        return () => {
            cancelled = true;
            controller.abort();
            if (chartTimer) window.clearTimeout(chartTimer);
        };
    }, []);

    async function refreshDashboardSilently() {
        if (silentRefreshLockRef.current) return;

        silentRefreshLockRef.current = true;
        setSilentRefreshing(true);

        try {
            const json = await fetchDashboardData({
                days,
                jobsPage: 1,
                jobsPageSize: 10,
                clientNotificationsPage: 1,
                clientNotificationsPageSize: 15,
                staffNotificationsPage: 1,
                staffNotificationsPageSize: 15,
            });

            setData(json);
            setChartReady(true);

            setJobsPerformance((prev) => {
                const merged = mergeLatestByDocumentId(json.jobsPerformance || [], prev);
                setJobsMeta((oldMeta) => nextMetaAfterSilentRefresh(
                    oldMeta,
                    json.jobsPerformanceMeta,
                    merged.length
                ));
                return merged;
            });

            setRecentUpdates((prev) => {
                const merged = mergeLatestByDocumentId(json?.recentUpdates?.items || [], prev);
                setRecentMeta((oldMeta) => nextMetaAfterSilentRefresh(
                    oldMeta,
                    json?.recentUpdates?.meta,
                    merged.length
                ));
                return merged;
            });

            setHiringInsights((prev) => {
                const merged = mergeLatestByDocumentId(json?.hiringInsights?.items || [], prev);
                setInsightMeta((oldMeta) => nextMetaAfterSilentRefresh(
                    oldMeta,
                    json?.hiringInsights?.meta,
                    merged.length
                ));
                return merged;
            });

            setError("");
        } catch (err) {
            console.error("Silent dashboard refresh failed:", err);
        } finally {
            silentRefreshLockRef.current = false;
            setSilentRefreshing(false);
        }
    }

    useEffect(() => {
        silentRefreshRef.current = refreshDashboardSilently;
    });

    useEffect(() => {
        setCookieValue(REFRESH_RATE_COOKIE, refreshRate);

        const timer = window.setInterval(() => {
            setSecondsLeft((current) => {
                if (current <= 1) {
                    silentRefreshRef.current?.();
                    return refreshRate;
                }

                return current - 1;
            });
        }, 1000);

        return () => window.clearInterval(timer);
    }, [refreshRate]);

    async function loadMoreJobs() {
        if (jobsLockRef.current || jobsLoadingMore || !jobsMeta?.hasMore) return;

        jobsLockRef.current = true;
        setJobsLoadingMore(true);

        try {
            const nextPage = Number(jobsMeta.page || 1) + 1;
            const json = await fetchDashboardData({ days, jobsPage: nextPage, jobsPageSize: 10 });
            setJobsPerformance((prev) => appendUniqueByDocumentId(prev, json.jobsPerformance || []));
            setJobsMeta(json.jobsPerformanceMeta || jobsMeta);
        } catch (e) {
            setError(e?.message || "Failed to load more jobs");
        } finally {
            jobsLockRef.current = false;
            setJobsLoadingMore(false);
        }
    }

    async function loadMoreRecentUpdates() {
        if (recentLockRef.current || recentLoadingMore || !recentMeta?.hasMore) return;

        recentLockRef.current = true;
        setRecentLoadingMore(true);

        try {
            const nextPage = Number(recentMeta.page || 1) + 1;
            const json = await fetchDashboardData({ days, clientNotificationsPage: nextPage, clientNotificationsPageSize: 15 });
            setRecentUpdates((prev) => appendUniqueByDocumentId(prev, json?.recentUpdates?.items || []));
            setRecentMeta(json?.recentUpdates?.meta || recentMeta);
        } catch (e) {
            setError(e?.message || "Failed to load more recent updates");
        } finally {
            recentLockRef.current = false;
            setRecentLoadingMore(false);
        }
    }

    async function loadMoreHiringInsights() {
        if (insightLockRef.current || insightLoadingMore || !insightMeta?.hasMore) return;

        insightLockRef.current = true;
        setInsightLoadingMore(true);

        try {
            const nextPage = Number(insightMeta.page || 1) + 1;
            const json = await fetchDashboardData({ days, staffNotificationsPage: nextPage, staffNotificationsPageSize: 15 });
            setHiringInsights((prev) => appendUniqueByDocumentId(prev, json?.hiringInsights?.items || []));
            setInsightMeta(json?.hiringInsights?.meta || insightMeta);
        } catch (e) {
            setError(e?.message || "Failed to load more staff notifications");
        } finally {
            insightLockRef.current = false;
            setInsightLoadingMore(false);
        }
    }

    function handleScrollNearEnd(e, loadMore) {
        const el = e.currentTarget;
        const nearEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 90;
        if (nearEnd) loadMore();
    }

    async function openNotification(item, type = "client") {
        setSelectedNotificationType(type);
        setSelectedNotification(item);

        if (type !== "staff") return;

        try {
            const res = await fetch("/api/staff/dashboard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "openNotification",
                    documentId: item.documentId,
                }),
            });

            const json = await res.json();

            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "Failed to update open history");
            }

            const updated = json.notification || item;
            setSelectedNotification(updated);
            setHiringInsights((prev) =>
                prev.map((row) =>
                    String(row.documentId) === String(updated.documentId) ? updated : row
                )
            );
        } catch (e) {
            console.error("Open history update failed:", e);
        }
    }

    const stats = data?.stats || {};
    const candidateStats = data?.candidateStats || {};

    const totalPipeline = useMemo(() => {
        return (data?.pipelineChart || []).reduce(
            (sum, item) => sum + Number(item.value || 0),
            0
        );
    }, [data]);

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-red-50/40 p-4 md:p-6">
            <div className="mx-auto max-w-[96%] space-y-6 2xl:max-w-[92%]">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-800 via-red-700 to-gray-950 p-6 text-white shadow-lg">
                    <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10" />
                    <div className="absolute bottom-0 right-20 h-28 w-28 rounded-full bg-red-400/20" />

                    <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
                        <div>
                            <Badge color="red">Admin Reporting Dashboard</Badge>

                            <h1 className="mt-4 text-2xl font-extrabold md:text-4xl">
                                Hiring Process Overview
                            </h1>

                            <p className="mt-3 max-w-2xl text-sm leading-6 text-red-50">
                                Track open jobs, active clients, notifications, pipeline candidates and hiring progress.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <RefreshCountdown
                                secondsLeft={secondsLeft}
                                refreshRate={refreshRate}
                                refreshing={silentRefreshing}
                            />

                            <select
                                value={days}
                                onChange={(e) => {
                                    const value = Number(e.target.value);
                                    setDays(value);
                                    loadDashboard(value);
                                    setSecondsLeft(refreshRate);
                                }}
                                className="rounded-xl border border-white/20 bg-white px-4 py-2 text-sm font-bold text-gray-900 shadow-sm outline-none"
                            >
                                <option value={7}>Last 7 Days</option>
                                <option value={30}>Last 30 Days</option>
                                <option value={90}>Last 90 Days</option>
                            </select>

                            <select
                                value={refreshRate}
                                onChange={(e) => {
                                    const value = normalizeRefreshRate(e.target.value);
                                    setRefreshRate(value);
                                    setSecondsLeft(value);
                                }}
                                className="rounded-xl border border-white/20 bg-white px-4 py-2 text-sm font-bold text-gray-900 shadow-sm outline-none"
                                title="Dashboard refresh rate"
                            >
                                {REFRESH_RATE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        Refresh {option}s
                                    </option>
                                ))}
                            </select>

                            <button
                                onClick={() => {
                                    loadDashboard(days);
                                    setSecondsLeft(refreshRate);
                                }}
                                className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/20 transition hover:bg-white/25"
                            >
                                Refresh
                            </button>
                        </div>
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
                                hint="Currently open"
                                icon="💼"
                                color="red"
                                animationDelay={0}
                            />

                            <Card
                                title="Offered Candidates"
                                value={stats.hiredCandidates || 0}
                                hint="Offered + Immigration + Placed"
                                icon="✅"
                                color="green"
                                animationDelay={90}
                            />

                            <Card
                                title="Pipeline Candidates"
                                value={stats.pipelineCandidates || 0}
                                hint={`${totalPipeline} in process`}
                                icon="📊"
                                color="blue"
                                animationDelay={180}
                            />

                            <Card
                                title="Offer Letters"
                                value={stats.offerLetters || 0}
                                hint="Uploaded"
                                icon="📄"
                                color="amber"
                                animationDelay={270}
                            />

                            <Card
                                title="Active Clients"
                                value={stats.activeClients || 0}
                                hint="Active clients"
                                icon="🏢"
                                color="purple"
                                animationDelay={360}
                            />
                        </>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <Section
                        title="Hiring Pipeline"
                        subtitle="Stage wise candidate movement"
                        right={<Badge color="red">Live Report</Badge>}
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
                            <>
                                <div className="h-[300px] min-h-[300px] min-w-0 w-full">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                        <BarChart
                                            data={(data?.pipelineChart || []).filter(
                                                (item) => item?.name !== "Shortlisted Candidate"
                                            )}
                                        >
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
                                                isAnimationActive
                                                animationBegin={80}
                                                animationDuration={800}
                                                animationEasing="ease-out"
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <PipelineInfoBlocks data={data?.pipelineChart || []} stats={stats} />
                            </>
                        )}
                    </Section>

                    <Section
                        title="Pipeline Summary"
                        subtitle="Current candidates by stage"
                        right={<Badge color="blue">Open Jobs</Badge>}
                    >
                        {!chartReady ? (
                            <div className="flex h-[340px] items-center justify-center">
                                <ClipLoader size={42} color={RED} />
                            </div>
                        ) : (
                            <>
                                <div className="space-y-3">
                                    {(data?.pipelineChart || [])
                                        .filter((item) => item?.name !== "Shortlisted Candidate")
                                        .map((item, index) => {
                                            const max = Math.max(
                                                ...(data?.pipelineChart || [])
                                                    .filter((x) => x?.name !== "Shortlisted Candidate")
                                                    .map((x) => Number(x.value || 0)),
                                                1
                                            );

                                            const percent = Math.round((Number(item.value || 0) / max) * 100);

                                            return (
                                                <div
                                                    key={item.name}
                                                    className="pipeline-summary-row rounded-xl border border-transparent p-2 transition hover:border-red-100 hover:bg-red-50/40"
                                                    style={{ animationDelay: `${120 + index * 110}ms` }}
                                                >
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
                                                            className="pipeline-summary-fill h-full rounded-full bg-gradient-to-r from-red-600 to-red-800"
                                                            style={{
                                                                "--pipeline-width": `${percent}%`,
                                                                animationDelay: `${220 + index * 110}ms`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                                <PipelineInfoBlocks data={data?.pipelineChart || []} stats={stats} />
                            </>
                        )}
                    </Section>

                    <Section
                        title="Candidates"
                        subtitle="Total candidates, availability and offer-letter coverage"
                        right={<Badge color="purple">Live Candidates</Badge>}
                    >
                        {!chartReady ? (
                            <div className="flex h-[340px] items-center justify-center">
                                <ClipLoader size={42} color={RED} />
                            </div>
                        ) : (
                            <CandidatesOverview
                                stats={candidateStats}
                                data={data?.candidatePieChart || []}
                            />
                        )}
                    </Section>
                </div>

                <Section
                    title="Jobs Performance"
                    subtitle="Only open jobs. Scroll down to load 10 more jobs at a time."
                    right={<Badge color="green">{jobsPerformance.length}/{jobsMeta.total || 0} Open Jobs</Badge>}
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
                            onScroll={(e) => handleScrollNearEnd(e, loadMoreJobs)}
                            className="max-h-[620px] overflow-auto rounded-2xl border border-gray-100"
                        >
                            <table className="w-full min-w-[1350px] text-left text-sm">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-gradient-to-r from-red-700 to-gray-900 text-xs uppercase text-white">
                                        <th className="px-4 py-4">Job</th>
                                        <th className="px-4 py-4">Client</th>
                                        <th className="px-4 py-4">Vacancies</th>
                                        <th className="px-4 py-4">Status</th>
                                        <th className="px-4 py-4">Latest Update</th>
                                        <th className="px-4 py-4">Interview</th>
                                        <th className="px-4 py-4">Offered</th>
                                        <th className="px-4 py-4">Immigration</th>
                                        <th className="px-4 py-4">Placed</th>
                                        <th className="px-4 py-4">Progress</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {jobsPerformance.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={10}
                                                className="px-4 py-10 text-center text-sm font-semibold text-gray-500"
                                            >
                                                No open jobs found.
                                            </td>
                                        </tr>
                                    ) : (
                                        jobsPerformance.map((job, index) => {
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
                                                        {job.documentId ? (
                                                            <Link
                                                                href={`/jobs/${job.documentId}/`} target="_blank" rel="noopener noreferrer"
                                                                className="font-extrabold text-red-700 hover:underline"
                                                            >
                                                                {job.title}
                                                            </Link>
                                                        ) : (
                                                            <div className="font-extrabold text-gray-900">{job.title}</div>
                                                        )}
                                                        <div className="mt-1 text-xs font-semibold text-gray-500">
                                                            {job.referenceNo}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-4 text-gray-700">
                                                        {job.clientName}
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <Badge color="red">{job.vacanciesNo || 0}</Badge>
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <Badge color="green">{job.statusList || "Open"}</Badge>
                                                    </td>

                                                    <td className="px-4 py-4 text-xs font-bold text-gray-600">
                                                        {formatDateTime(job.latestUpdate)}
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

                            {jobsLoadingMore ? (
                                <div className="flex items-center justify-center gap-2 bg-white py-4 text-sm font-bold text-gray-500">
                                    <ClipLoader size={18} color={RED} />
                                    Loading more jobs...
                                </div>
                            ) : jobsMeta.hasMore ? (
                                <div className="bg-gray-50 py-3 text-center text-xs font-bold text-gray-500">
                                    Scroll down to load more open jobs
                                </div>
                            ) : (
                                <div className="bg-gray-50 py-3 text-center text-xs font-bold text-gray-500">
                                    All open jobs loaded
                                </div>
                            )}
                        </div>
                    )}
                </Section>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <Section
                        title="Client Recent Updates"
                        subtitle="Latest client notifications from the Notification collection"
                        right={<Badge color="purple">{recentUpdates.length}/{recentMeta.total || 0} Client Records</Badge>}
                    >
                        {loading ? (
                            <div className="flex h-36 items-center justify-center">
                                <ClipLoader size={32} color={RED} />
                            </div>
                        ) : recentUpdates.length ? (
                            <div
                                onScroll={(e) => handleScrollNearEnd(e, loadMoreRecentUpdates)}
                                className="max-h-[560px] space-y-2 overflow-y-auto pr-2"
                            >
                                {recentUpdates.map((item) => (
                                    <NotificationCard
                                        key={item.documentId || item.id}
                                        item={item}
                                        accent="red"
                                        showHistory={false}
                                        onOpen={(record) => openNotification(record, "client")}
                                        onHistory={setHistoryNotification}
                                    />
                                ))}

                                {recentLoadingMore ? (
                                    <div className="flex items-center justify-center gap-2 py-4 text-sm font-bold text-gray-500">
                                        <ClipLoader size={18} color={RED} />
                                        Loading more notifications...
                                    </div>
                                ) : recentMeta.hasMore ? (
                                    <div className="py-3 text-center text-xs font-bold text-gray-500">
                                        Scroll down to load more client notifications
                                    </div>
                                ) : (
                                    <div className="py-3 text-center text-xs font-bold text-gray-500">
                                        All client notifications loaded
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm font-semibold text-gray-500">
                                No client notifications found.
                            </p>
                        )}
                    </Section>

                    <Section
                        title="Staff Latest Notification"
                        subtitle="Latest staff notifications from the Notification collection"
                        right={<Badge color="amber">{hiringInsights.length}/{insightMeta.total || 0} Staff Records</Badge>}
                    >
                        {loading ? (
                            <div className="flex h-36 items-center justify-center">
                                <ClipLoader size={32} color={RED} />
                            </div>
                        ) : hiringInsights.length ? (
                            <div
                                onScroll={(e) => handleScrollNearEnd(e, loadMoreHiringInsights)}
                                className="max-h-[560px] space-y-2 overflow-y-auto pr-2"
                            >
                                {hiringInsights.map((item) => (
                                    <NotificationCard
                                        key={item.documentId || item.id}
                                        item={item}
                                        accent="amber"
                                        onOpen={(record) => openNotification(record, "staff")}
                                        onHistory={setHistoryNotification}
                                    />
                                ))}

                                {insightLoadingMore ? (
                                    <div className="flex items-center justify-center gap-2 py-4 text-sm font-bold text-gray-500">
                                        <ClipLoader size={18} color={RED} />
                                        Loading more staff notifications...
                                    </div>
                                ) : insightMeta.hasMore ? (
                                    <div className="py-3 text-center text-xs font-bold text-gray-500">
                                        Scroll down to load more staff notifications
                                    </div>
                                ) : (
                                    <div className="py-3 text-center text-xs font-bold text-gray-500">
                                        All staff notifications loaded
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm font-semibold text-gray-500">
                                No staff notifications found.
                            </p>
                        )}
                    </Section>
                </div>
            </div>

            <NotificationModal
                item={selectedNotification}
                type={selectedNotificationType}
                onClose={() => setSelectedNotification(null)}
                onHistory={setHistoryNotification}
            />

            <HistoryModal
                item={historyNotification}
                onClose={() => setHistoryNotification(null)}
            />

            <style jsx global>{`
                @keyframes dashboardCardEnter {
                    0% {
                        opacity: 0;
                        transform: translateY(18px) scale(0.97);
                    }
                    70% {
                        opacity: 1;
                        transform: translateY(-2px) scale(1.01);
                    }
                    100% {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                @keyframes dashboardIconPop {
                    0% {
                        opacity: 0;
                        transform: scale(0.55) rotate(-10deg);
                    }
                    65% {
                        opacity: 1;
                        transform: scale(1.14) rotate(4deg);
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1) rotate(0);
                    }
                }

                @keyframes dashboardSlimEnter {
                    from {
                        opacity: 0;
                        transform: translateX(-12px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                @keyframes pipelineRowEnter {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes pipelineBarGrow {
                    from {
                        width: 0;
                    }
                    to {
                        width: var(--pipeline-width);
                    }
                }

                .dashboard-stat-card {
                    opacity: 0;
                    animation: dashboardCardEnter 620ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }

                .dashboard-stat-icon {
                    opacity: 0;
                    animation: dashboardIconPop 720ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }

                .dashboard-slim-card {
                    opacity: 0;
                    animation: dashboardSlimEnter 520ms ease-out forwards;
                }

                .pipeline-summary-row {
                    opacity: 0;
                    animation: pipelineRowEnter 560ms ease-out forwards;
                }

                .pipeline-summary-fill {
                    width: 0;
                    animation: pipelineBarGrow 1400ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }

                @media (prefers-reduced-motion: reduce) {
                    .dashboard-stat-card,
                    .dashboard-stat-icon,
                    .dashboard-slim-card,
                    .pipeline-summary-row,
                    .pipeline-summary-fill {
                        opacity: 1;
                        animation: none !important;
                        transform: none !important;
                    }

                    .pipeline-summary-fill {
                        width: var(--pipeline-width);
                    }
                }
            `}</style>
        </main>
    );
}
