"use client";

import React, { useEffect, useState } from "react";
import { ClipLoader } from "react-spinners";
import PipelineCandidatePopup from "@/app/components/jobs/PipelineCandidatePopup";

async function fetchJsonSafe(url, opts) {
    const res = await fetch(url, { cache: "no-store", ...(opts || {}) });
    const text = await res.text();

    let json;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(`API returned non-JSON. Status ${res.status}`);
    }

    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Request failed");
    }

    return json;
}

function formatDate(value) {
    if (!value) return "—";

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
    ).padStart(2, "0")}`;
}

function PipelineTable({ pipeline, job, onOpen }) {
    const cols = [
        ["Suggested", "suggested", pipeline?.suggested || 0],
        ["Shortlisted", "shortlisted", pipeline?.shortlisted || 0],
        ["Interview", "requestedInterview", pipeline?.requestedInterview || 0],
        ["Interviewed", "interviewed", pipeline?.interviewed || 0],
        ["Hired", "hired", pipeline?.hired || 0],
        ["Immigration", "immigration", pipeline?.immigration || 0],
        ["Placed", "placed", pipeline?.placed || 0],
    ];

    return (
        <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse border border-gray-300 text-sm">
                <tbody>
                    <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-2 py-1 text-left font-bold text-gray-900">
                            Pipeline
                        </th>

                        {cols.map(([label]) => (
                            <th
                                key={label}
                                className="border border-gray-300 px-2 py-1 text-center font-semibold text-gray-900"
                            >
                                {label}
                            </th>
                        ))}
                    </tr>

                    <tr>
                        <td className="border border-gray-300 px-2 py-1 font-semibold text-gray-900">
                            Candidates
                        </td>

                        {cols.map(([label, key, value]) => (
                            <td
                                key={label}
                                className="border border-gray-300 px-2 py-1 text-center"
                            >
                                {Number(value) > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => onOpen(job, key)}
                                        className="font-bold text-red-700 underline underline-offset-2 hover:text-red-900"
                                    >
                                        {value}
                                    </button>
                                ) : (
                                    <span className="font-bold text-gray-800">0</span>
                                )}
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

function JobCard({ job, onOpenCandidates }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm hover:shadow-md">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-red-700">
                        {job?.title || "—"}
                    </h2>

                    <div className="mt-1 flex flex-wrap gap-2 text-sm">
                        <span className="rounded bg-gray-100 px-2 py-[2px] text-gray-700">
                            Ref: <b>{job?.referenceNo || "—"}</b>
                        </span>

                        <span className="rounded bg-gray-100 px-2 py-[2px] text-gray-700">
                            Client: <b>{job?.clientName || "—"}</b>
                        </span>

                        <span className="rounded bg-green-50 px-2 py-[2px] font-semibold text-green-700">
                            {job?.statusList || "—"}
                        </span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => onOpenCandidates(job, "all")}
                    disabled={!job?.documentId}
                    className="shrink-0 rounded bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                    Pipeline Update
                </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4 xl:grid-cols-5">
                <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Created</div>
                    <div className="font-semibold text-gray-800">
                        {formatDate(job?.createdAt)}
                    </div>
                </div>

                <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Closing</div>
                    <div className="font-semibold text-gray-800">
                        {formatDate(job?.closingDate)}
                    </div>
                </div>

                <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Vacancies</div>
                    <div className="font-semibold text-gray-800">
                        {job?.vacanciesNo || "—"}
                    </div>
                </div>

                <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Experience</div>
                    <div className="font-semibold text-gray-800">
                        {job?.experience || "—"}
                    </div>
                </div>

                <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Location</div>
                    <div className="truncate font-semibold text-gray-800">
                        {job?.location || "—"}
                    </div>
                </div>
            </div>

            <PipelineTable
                pipeline={job?.pipeline}
                job={job}
                onOpen={onOpenCandidates}
            />
        </div>
    );
}

function CandidatePopup({ popup, onClose }) {
    if (!popup?.open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3">
            <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold text-gray-900">
                            {popup?.job?.title || "Job"} Candidates
                        </h2>

                        <div className="text-sm text-gray-500">
                            {popup?.job?.referenceNo || "—"} • {popup?.title || "Pipeline"}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                        Close
                    </button>
                </div>

                <div className="max-h-[78vh] overflow-y-auto p-4">
                    {popup.candidates.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                            No candidates found.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {popup.candidates.map((c, idx) => (
                                <div
                                    key={`${c.documentId || c.id || "candidate"}-${idx}`}
                                    className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                                >
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={c.avatar || "/images/default-avatar.jpg"}
                                            alt={c.fullName || "Candidate"}
                                            onError={(e) => {
                                                e.currentTarget.src = "/images/default-avatar.jpg";
                                            }}
                                            className="h-14 w-14 rounded-full border bg-gray-100 object-cover"
                                        />

                                        <div className="min-w-0">
                                            <div className="truncate font-semibold text-red-700">
                                                {c.fullName || "—"}
                                            </div>

                                            <div className="truncate text-sm text-gray-600">
                                                Ref: {c.referenceNumber || "—"}
                                            </div>

                                            <div className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-[2px] text-xs font-semibold text-gray-700">
                                                {c.currentPipelineStatus || "—"}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className="mt-3 w-full rounded-lg border border-red-700 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                                    >
                                        Pipeline Update
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function OpenJobsPage() {
    const [items, setItems] = useState([]);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);

    const [search, setSearch] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const [appliedFilters, setAppliedFilters] = useState({
        search: "",
        fromDate: "",
        toDate: "",
    });

    const [candidatePopup, setCandidatePopup] = useState({
        open: false,
        job: null,
        title: "",
        candidates: [],
    });

    useEffect(() => {
        let ignore = false;

        async function load() {
            setLoading(true);
            setErr("");

            try {
                const qs = new URLSearchParams({
                    page: String(page),
                    pageSize: String(pageSize),
                });

                if (appliedFilters.search) {
                    qs.set("search", appliedFilters.search);
                }

                if (appliedFilters.fromDate) {
                    qs.set("fromDate", appliedFilters.fromDate);
                }

                if (appliedFilters.toDate) {
                    qs.set("toDate", appliedFilters.toDate);
                }

                const json = await fetchJsonSafe(`/api/jobs/open-list?${qs.toString()}`);

                if (ignore) return;

                setItems(Array.isArray(json?.items) ? json.items : []);
                setPageCount(json?.pageCount || 1);
                setTotal(json?.total || 0);
            } catch (e) {
                if (!ignore) setErr(e?.message || "Failed to load open jobs");
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        load();

        return () => {
            ignore = true;
        };
    }, [page, pageSize, appliedFilters]);

    function applyFilters() {
        setAppliedFilters({
            search: search.trim(),
            fromDate,
            toDate,
        });

        setPage(1);
    }

    function clearFilters() {
        setSearch("");
        setFromDate("");
        setToDate("");

        setAppliedFilters({
            search: "",
            fromDate: "",
            toDate: "",
        });

        setPage(1);
    }

    function closeCandidatePopup() {
        setCandidatePopup({
            open: false,
            job: null,
            title: "",
            candidates: [],
        });
    }

    function openCandidatePopup(job, key = "all") {
        const groups = job?.pipelineCandidates || {};

        let candidates = [];

        if (key === "all") {
            candidates = [
                ...(groups.suggested || []),
                ...(groups.shortlisted || []),
                ...(groups.requestedInterview || []),
                ...(groups.interviewed || []),
                ...(groups.hired || []),
                ...(groups.immigration || []),
                ...(groups.placed || []),
            ];
        } else {
            candidates = groups[key] || [];
        }

        const titles = {
            all: "All Pipeline Candidates",
            suggested: "Suggested Candidates",
            shortlisted: "Shortlisted Candidates",
            requestedInterview: "Interview Candidates",
            interviewed: "Interviewed Candidates",
            hired: "Hired Candidates",
            immigration: "Immigration Candidates",
            placed: "Placed Candidates",
        };

        setCandidatePopup({
            open: true,
            job,
            title: titles[key] || "Pipeline Candidates",
            candidates,
        });
    }

    return (
        <div className="mx-auto w-full max-w-[1800px] px-3 py-4">
            <div className="mb-3 flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Open Jobs</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Total open jobs: <b>{total}</b>
                    </p>
                </div>
            </div>

            <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                    <div className="md:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-600">
                            Search
                        </label>

                        <input
                            type="text"
                            placeholder="Job name, client name, reference no..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") applyFilters();
                            }}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-600">
                            Created From
                        </label>

                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-600">
                            Created To
                        </label>

                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                        />
                    </div>

                    <div className="flex items-end gap-2">
                        <button
                            type="button"
                            onClick={applyFilters}
                            className="w-full rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                        >
                            Search
                        </button>

                        <button
                            type="button"
                            onClick={clearFilters}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            Clear
                        </button>
                    </div>
                </div>

                <div className="mt-2 text-sm text-gray-500">
                    Showing <b>{items.length}</b> jobs on this page
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
                    <ClipLoader size={24} color="#b91c1c" />
                    Loading open jobs...
                </div>
            ) : err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {err}
                </div>
            ) : items.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
                    No jobs found.
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((job) => (
                        <JobCard
                            key={job.documentId || job.id}
                            job={job}
                            onOpenCandidates={openCandidatePopup}
                        />
                    ))}
                </div>
            )}

            {!loading && !err && pageCount > 1 ? (
                <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row">
                    <div className="text-sm text-gray-600">
                        Page <b>{page}</b> of <b>{pageCount}</b>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Previous
                        </button>

                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                            disabled={page >= pageCount}
                            className="rounded-md bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            ) : null}

            <PipelineCandidatePopup
                popup={candidatePopup}
                onClose={closeCandidatePopup}
                onRefresh={() => {
                    setAppliedFilters((prev) => ({ ...prev }));
                }}
            />
        </div>
    );
}