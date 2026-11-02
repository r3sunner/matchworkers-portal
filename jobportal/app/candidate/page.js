"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

function shortStageName(name) {
    const map = {
        "Requested Interview": "Interview",
        "Hired Candidate": "Offered",
        Immigration: "Immigration",
        Placed: "Placed",
    };

    return map[name] || name || "N/A";
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
                        <h2 className="mt-3 text-3xl font-extrabold text-gray-900">{value}</h2>
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

function stageColor(stage) {
    const value = String(stage || "").toLowerCase();

    if (value === "requested interview") return "amber";
    if (value === "hired candidate") return "green";
    if (value === "immigration") return "purple";
    if (value === "placed") return "red";

    return "gray";
}

async function fetchDashboardData(signal) {
    const res = await fetch("/api/candidates/dashboard", {
        cache: "no-store",
        signal,
    });

    const json = await res.json();

    if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load dashboard");
    }

    return json;
}

export default function CandidateDashboardPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [chartReady, setChartReady] = useState(false);
    const [error, setError] = useState("");

    const requestControllerRef = useRef(null);
    const chartTimerRef = useRef(null);

    async function refreshDashboard() {
        requestControllerRef.current?.abort();

        if (chartTimerRef.current) {
            window.clearTimeout(chartTimerRef.current);
            chartTimerRef.current = null;
        }

        const controller = new AbortController();
        requestControllerRef.current = controller;

        setLoading(true);
        setChartReady(false);
        setError("");

        try {
            const json = await fetchDashboardData(controller.signal);

            if (controller.signal.aborted) return;

            setData(json);

            chartTimerRef.current = window.setTimeout(() => {
                setChartReady(true);
                chartTimerRef.current = null;
            }, 350);
        } catch (err) {
            if (err?.name !== "AbortError") {
                setError(err?.message || "Dashboard error");
            }
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }

    useEffect(() => {
        const controller = new AbortController();
        requestControllerRef.current = controller;

        fetchDashboardData(controller.signal)
            .then((json) => {
                if (controller.signal.aborted) return;

                setData(json);

                chartTimerRef.current = window.setTimeout(() => {
                    setChartReady(true);
                    chartTimerRef.current = null;
                }, 350);
            })
            .catch((err) => {
                if (err?.name !== "AbortError") {
                    setError(err?.message || "Dashboard error");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => {
            controller.abort();

            if (chartTimerRef.current) {
                window.clearTimeout(chartTimerRef.current);
                chartTimerRef.current = null;
            }
        };
    }, []);

    const stats = data?.stats || {};
    const user = data?.user || {};

    const latestStage = useMemo(() => {
        const first = data?.applications?.[0];
        return first?.stageLabel || "N/A";
    }, [data]);

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-red-50/40 p-4 md:p-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-800 via-red-700 to-gray-950 p-6 text-white shadow-lg">
                    <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10" />
                    <div className="absolute bottom-0 right-20 h-28 w-28 rounded-full bg-red-400/20" />

                    <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
                        <div>
                            <Badge color="red">Candidate Dashboard</Badge>

                            <h1 className="mt-4 text-2xl font-extrabold md:text-4xl">
                                My Job Applications
                            </h1>

                            <p className="mt-3 max-w-2xl text-sm leading-6 text-red-50">
                                View jobs where your profile is added, current hiring stage,
                                interview status, offer letters and placement progress.
                            </p>

                            {!loading && user?.name ? (
                                <p className="mt-3 text-sm font-semibold text-white">
                                    Logged in as: {user.name}
                                </p>
                            ) : null}
                        </div>

                        <button
                            onClick={refreshDashboard}
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
                                title="Applied Jobs"
                                value={stats.totalApplications || 0}
                                hint={`${stats.openJobs || 0} open jobs`}
                                icon="💼"
                                color="red"
                            />

                            <Card
                                title="Current Stage"
                                value={latestStage}
                                hint="Latest update"
                                icon="📍"
                                color="blue"
                            />

                            <Card
                                title="Interview"
                                value={stats.interview || 0}
                                hint="Requested Interview"
                                icon="🗓️"
                                color="amber"
                            />

                            <Card
                                title="Offered / Placed"
                                value={stats.hiredJobs || 0}
                                hint="Final stages"
                                icon="✅"
                                color="green"
                            />

                            <Card
                                title="Offer Letters"
                                value={stats.offerLetters || 0}
                                hint="Uploaded"
                                icon="📄"
                                color="purple"
                            />
                        </>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <Section
                        title="My Hiring Pipeline"
                        subtitle="Stage wise count of your applications"
                        right={<Badge color="red">My Status</Badge>}
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
                                    <BarChart data={data?.pipelineChart || []}>
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
                                            name="Jobs"
                                            fill={RED}
                                            radius={[10, 10, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Section>

                    <Section
                        title="Status Summary"
                        subtitle="Your applications by current stage"
                        right={<Badge color="blue">Overview</Badge>}
                    >
                        {loading || !chartReady ? (
                            <div className="flex h-[340px] items-center justify-center">
                                <ClipLoader size={42} color={RED} />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {(data?.pipelineChart || []).map((item) => {
                                    const max = Math.max(
                                        ...(data?.pipelineChart || []).map((x) => Number(x.value || 0)),
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
                    title="Jobs Related To My Account"
                    subtitle="Only jobs where your candidate profile exists in pipeline"
                    right={<Badge color="green">Applications</Badge>}
                >
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="text-center">
                                <ClipLoader size={38} color={RED} />
                                <p className="mt-3 text-sm font-semibold text-gray-500">
                                    Loading applications...
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-gray-100">
                            <table className="w-full min-w-[900px] text-left text-sm">
                                <thead>
                                    <tr className="bg-gradient-to-r from-red-700 to-gray-900 text-xs uppercase text-white">
                                        <th className="px-4 py-4">Job</th>
                                        <th className="px-4 py-4">Client</th>
                                        <th className="px-4 py-4">Job Status</th>
                                        <th className="px-4 py-4">My Stage</th>
                                        <th className="px-4 py-4">Offer Letter</th>
                                        <th className="px-4 py-4">Last Update</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {(data?.applications || []).length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="px-4 py-10 text-center text-sm font-semibold text-gray-500"
                                            >
                                                No job application found for your account.
                                            </td>
                                        </tr>
                                    ) : (
                                        (data?.applications || []).map((job, index) => (
                                            <tr
                                                key={`${job.jobDocumentId || job.referenceNo}-${index}`}
                                                className="border-b bg-white transition hover:bg-red-50/40"
                                            >
                                                <td className="px-4 py-4">
                                                    <div className="font-extrabold text-gray-900">
                                                        {job.title}
                                                    </div>
                                                    <div className="mt-1 text-xs font-semibold text-gray-500">
                                                        {job.referenceNo}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-4 text-gray-700">
                                                    {job.clientName}
                                                </td>

                                                <td className="px-4 py-4">
                                                    <Badge
                                                        color={
                                                            String(job.jobStatus || "").toLowerCase() === "open"
                                                                ? "green"
                                                                : "gray"
                                                        }
                                                    >
                                                        {job.jobStatus}
                                                    </Badge>
                                                </td>

                                                <td className="px-4 py-4">
                                                    <Badge color={stageColor(job.stage)}>
                                                        {job.stageLabel === "Hired Candidate" ? "Offered" : job.stageLabel}
                                                    </Badge>
                                                </td>

                                                <td className="px-4 py-4">
                                                    {job.hasOfferLetter ? (
                                                        <Badge color="green">Available</Badge>
                                                    ) : (
                                                        <Badge color="gray">Not Uploaded</Badge>
                                                    )}
                                                </td>

                                                <td className="px-4 py-4 text-xs font-semibold text-gray-500">
                                                    {job.updatedAt
                                                        ? new Date(job.updatedAt).toLocaleString()
                                                        : "N/A"}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>

                <Section
                    title="Application Insights"
                    subtitle="Summary based on your job pipeline records"
                    right={<Badge color="amber">Summary</Badge>}
                >
                    {loading ? (
                        <div className="flex h-32 items-center justify-center">
                            <ClipLoader size={32} color={RED} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-gray-700">
                                <b className="text-red-800">Applications:</b> Your profile is linked
                                with <b>{stats.totalApplications || 0}</b> job(s).
                            </div>

                            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-gray-700">
                                <b className="text-amber-800">Interview:</b>{" "}
                                <b>{stats.interview || 0}</b> application(s) are at interview stage.
                            </div>

                            <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4 text-sm text-gray-700">
                                <b className="text-purple-800">Immigration:</b>{" "}
                                <b>{stats.immigration || 0}</b> application(s) are in immigration.
                            </div>

                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-gray-700">
                                <b className="text-emerald-800">Final Stage:</b>{" "}
                                <b>{stats.hiredJobs || 0}</b> application(s) are hired or placed.
                            </div>
                        </div>
                    )}
                </Section>
            </div>
        </main>
    );
}