"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ClipLoader } from "react-spinners";

/* -------------------- helpers -------------------- */

async function fetchJsonSafe(url, options = {}) {
    const res = await fetch(url, {
        cache: "no-store",
        ...options,
    });

    const text = await res.text();

    let json = null;

    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(
            `API returned non-JSON response. Status: ${res.status}. First bytes: ${text.slice(
                0,
                120
            )}`
        );
    }

    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
    }

    return json;
}

function blocksToPlainText(blocks) {
    if (!Array.isArray(blocks)) return "";

    return blocks
        .map((block) => {
            const children = Array.isArray(block?.children) ? block.children : [];

            return children
                .map((child) => child?.text || "")
                .join("")
                .trim();
        })
        .filter(Boolean)
        .join("\n\n");
}

function formatDate(value) {
    if (!value) return "—";

    try {
        return new Date(value).toLocaleDateString();
    } catch {
        return "—";
    }
}

function normalizeStage(value) {
    const v = String(value || "").trim().toLowerCase();

    if (v === "suggested candidate" || v === "suggested") {
        return "Suggested";
    }

    if (v === "shortlisted candidate" || v === "shortlisted") {
        return "Shortlisted";
    }

    if (v === "requested interview" || v === "interview") {
        return "Interview";
    }

    if (v === "interviewed") {
        return "Interviewed";
    }

    if (v === "hired candidate" || v === "hired") {
        return "Hired";
    }

    if (v === "immigration") {
        return "Immigration";
    }

    if (v === "placed") {
        return "Placed";
    }

    return value || "—";
}

function stageStyles(stage) {
    const s = normalizeStage(stage);

    if (s === "Placed") {
        return {
            pill: "border-red-200 bg-red-50 text-red-700",
            bar: "bg-red-600",
            soft: "bg-red-50 border-red-200",
        };
    }

    if (s === "Immigration") {
        return {
            pill: "border-amber-200 bg-amber-50 text-amber-700",
            bar: "bg-amber-500",
            soft: "bg-amber-50 border-amber-200",
        };
    }

    if (s === "Hired") {
        return {
            pill: "border-green-200 bg-green-50 text-green-700",
            bar: "bg-green-600",
            soft: "bg-green-50 border-green-200",
        };
    }

    if (s === "Interview") {
        return {
            pill: "border-purple-200 bg-purple-50 text-purple-700",
            bar: "bg-purple-500",
            soft: "bg-purple-50 border-purple-200",
        };
    }

    if (s === "Shortlisted") {
        return {
            pill: "border-blue-200 bg-blue-50 text-blue-700",
            bar: "bg-blue-500",
            soft: "bg-blue-50 border-blue-200",
        };
    }

    return {
        pill: "border-gray-200 bg-gray-50 text-gray-700",
        bar: "bg-gray-500",
        soft: "bg-gray-50 border-gray-200",
    };
}

function stageProgress(stage) {
    const s = normalizeStage(stage);

    const progress = {
        Suggested: 15,
        Shortlisted: 30,
        Interview: 50,
        Interviewed: 60,
        Hired: 70,
        Immigration: 85,
        Placed: 100,
    };

    return progress[s] || 0;
}

function JobStatusPill({ status }) {
    const s = String(status || "").toLowerCase();

    const cls =
        s === "open" || s === "active"
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-gray-200 bg-gray-50 text-gray-700";

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${cls}`}>
            {status || "—"}
        </span>
    );
}

function CandidateStagePill({ stage }) {
    const styles = stageStyles(stage);

    return (
        <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles.pill}`}
        >
            {normalizeStage(stage)}
        </span>
    );
}

function CandidatePipelineBar({ stage }) {
    const styles = stageStyles(stage);
    const percent = stageProgress(stage);

    const steps = [
        "Suggested",
        "Shortlisted",
        "Interview",
        "Interviewed",
        "Hired",
        "Immigration",
        "Placed",
    ];

    const current = normalizeStage(stage);

    return (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-gray-700">
                    Your Application Stage
                </div>

                <div className="text-[11px] text-gray-600">{percent}%</div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                    className={`h-full rounded-full transition-all ${styles.bar}`}
                    style={{ width: `${percent}%` }}
                />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-6">
                {steps.map((item) => {
                    const active = item === current;

                    return (
                        <div
                            key={item}
                            className={`rounded-md border px-2 py-1 text-center text-[10px] leading-none ${active
                                ? `${styles.soft} font-bold text-gray-900`
                                : "border-gray-200 bg-gray-50 text-gray-500"
                                }`}
                        >
                            {item}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* -------------------- page -------------------- */

export default function CandidateJobsPage() {
    const params = useParams();
    const candidateDocumentId = Array.isArray(params?.documentId)
        ? params.documentId[0]
        : params?.documentId;

    if (!candidateDocumentId) {
        return (
            <div className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 md:mx-20">
                Candidate ID is missing from the page URL.
            </div>
        );
    }

    // The key remounts the content when the candidate changes, naturally
    // resetting pagination and local state without setState inside an effect.
    return (
        <CandidateJobsContent
            key={candidateDocumentId}
            candidateDocumentId={candidateDocumentId}
        />
    );
}

function CandidateJobsContent({ candidateDocumentId }) {
    const pageSize = 10;

    const [page, setPage] = useState(1);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [pageCount, setPageCount] = useState(1);
    const [refreshKey, setRefreshKey] = useState(0);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [selectedJob, setSelectedJob] = useState(null);
    const [openView, setOpenView] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        const query = new URLSearchParams({
            candidateDocumentId,
            page: String(page),
            pageSize: String(pageSize),
        });

        fetchJsonSafe(`/api/jobs/candidates/jobs/list?${query.toString()}`, {
            signal: controller.signal,
        })
            .then((json) => {
                if (controller.signal.aborted) return;

                setItems(Array.isArray(json?.items) ? json.items : []);
                setTotal(Number(json?.total || 0));
                setPageCount(Math.max(1, Number(json?.pageCount || 1)));
                setErr("");
            })
            .catch((error) => {
                if (controller.signal.aborted || error?.name === "AbortError") return;

                setErr(error?.message || "Failed to load candidate jobs");
                setItems([]);
                setTotal(0);
                setPageCount(1);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [candidateDocumentId, page, refreshKey]);

    function refreshJobs() {
        setLoading(true);
        setErr("");
        setRefreshKey((value) => value + 1);
    }

    function goToPage(nextPage) {
        const safePage = Math.max(1, Math.min(pageCount, nextPage));

        if (safePage === page) return;

        setLoading(true);
        setErr("");
        setPage(safePage);
    }

    function openViewJob(job) {
        setSelectedJob(job);
        setOpenView(true);
    }

    function closeView() {
        setOpenView(false);
        setSelectedJob(null);
    }



    const summary = useMemo(() => {
        const counts = {
            Suggested: 0,
            Shortlisted: 0,
            Interview: 0,
            Interviewed: 0,
            Hired: 0,
            Immigration: 0,
            Placed: 0,
        };

        items.forEach((item) => {
            const stage = normalizeStage(item?.candidateProcessList);
            if (counts[stage] !== undefined) {
                counts[stage] += 1;
            }
        });

        return counts;
    }, [items]);

    return (
        <>
            {/* Header */}
            <div className="mt-0 md:mt-3 px-5 md:px-20 py-5 border-b border-gray-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <div className="topHeading border-0">My Jobs</div>
                    <div className="mt-1 text-sm text-gray-600">
                        View your assigned jobs and current application stages.
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={refreshJobs}
                        className="text-xs sm:text-sm rounded-full border border-red-600 text-gray-700 px-6 py-2 hover:bg-red-600 hover:text-white transition"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div className="w-full mx-auto p-4 space-y-4 px-5 md:px-20">
                {/* Summary */}
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="text-sm text-gray-700">
                            <span className="font-semibold">{total}</span> active job
                            {total === 1 ? "" : "s"} found
                        </div>

                        <div className="grid grid-cols-2 gap-1 sm:grid-cols-7">
                            {[
                                "Placed",
                                "Immigration",
                                "Hired",
                                "Interviewed",
                                "Interview",
                                "Shortlisted",
                                "Suggested",
                            ].map((stage) => {
                                const styles = stageStyles(stage);

                                return (
                                    <div
                                        key={stage}
                                        className={`rounded-md border px-2 py-1 text-center ${styles.soft}`}
                                    >
                                        <div className="text-[10px] text-gray-600 leading-none">
                                            {stage}
                                        </div>
                                        <div className="mt-1 text-xs font-bold text-gray-900 leading-none">
                                            {summary[stage] || 0}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Body */}
                {loading ? (
                    <div className="flex justify-start items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-800">
                        <ClipLoader size={25} color="#b91c1c" speedMultiplier={1} />
                        <div className="text-left">Loading your jobs...</div>
                    </div>
                ) : err ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                        {err}
                    </div>
                ) : items.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-800">
                        No active jobs found for this candidate.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((job) => (
                            <div
                                key={job.documentId || job.id}
                                className="w-full rounded-xl border border-gray-400 bg-white px-4 py-3 sm:px-4 sm:py-5"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    {/* Left */}
                                    <div className="min-w-0 w-full">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 min-w-0">
                                            <div
                                                onClick={() => openViewJob(job)}
                                                className="truncate text-lg sm:text-xl font-bold text-red-700 hover:underline cursor-pointer"
                                            >
                                                {job.title || "—"}
                                            </div>

                                            <span className="hidden sm:inline text-base text-gray-800 pr-5 ml-2">
                                                {job.referenceNo || job.id || "—"}
                                            </span>

                                            <span className="hidden sm:inline text-sm text-gray-700">
                                                <span className="text-blue-500">Created At: </span>
                                                {formatDate(job.createdAt)}
                                            </span>

                                            <span className="hidden sm:inline text-sm text-gray-700 ml-3">
                                                <span className="text-blue-500">Closing Date: </span>
                                                {formatDate(job.closingDate)}
                                            </span>
                                        </div>

                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">


                                            <span className="text-sm px-2 py-1 text-blue-500 bg-gray-100 rounded-md">
                                                📝 {job.jobTypeList || "—"}
                                            </span>

                                            <span className="text-sm px-2 py-1 text-blue-500 bg-gray-100 rounded-md">
                                                🌍 {job.location || "—"}
                                            </span>

                                            <span className="text-sm px-2 py-1 text-blue-500 bg-gray-100 rounded-md">
                                                👥 Vacancies: {job.vacanciesNo ?? "—"}
                                            </span>

                                            <span className="text-sm px-2 py-1 text-blue-500 bg-gray-100 rounded-md">
                                                👷‍♂️ Experience: {job.experience ?? "—"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Right */}
                                    <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-end">
                                        <JobStatusPill status={job.statusList} />
                                        <CandidateStagePill stage={job.candidateProcessList} />

                                        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2">
                                            <button
                                                onClick={() => openViewJob(job)}
                                                className="w-full sm:w-auto rounded-md border border-gray-300 text-gray-700 px-3 py-2 text-sm hover:bg-gray-50"
                                            >
                                                View
                                            </button>


                                        </div>
                                    </div>
                                </div>

                                <div className="mt-2 text-sm text-gray-700 line-clamp-2">
                                    {job.shortDescription || "—"}
                                </div>

                                <CandidatePipelineBar stage={job.candidateProcessList} />
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="text-sm text-gray-800">
                        Page {page} of {pageCount}
                        <span className="ml-2 text-xs text-gray-500">({total} jobs)</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1 || loading}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Prev
                        </button>

                        <button
                            type="button"
                            onClick={() => goToPage(page + 1)}
                            disabled={page >= pageCount || loading}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* View Modal */}
            {openView && selectedJob && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeView();
                    }}
                >
                    <div className="absolute inset-0 bg-black/50" />

                    <div className="relative w-full sm:max-w-5xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-lg sm:text-xl font-bold truncate text-red-700">
                                    {selectedJob.title || "Job"}
                                </div>

                                <div className="text-sm text-gray-600 truncate">
                                    {selectedJob.location || "—"} • Job ID:{" "}
                                    {selectedJob.referenceNo ||
                                        selectedJob.documentId ||
                                        selectedJob.id ||
                                        "—"}
                                </div>
                            </div>

                            <button
                                onClick={closeView}
                                className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-4 rounded-xl border border-gray-200 p-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                {[

                                    ["Job Status", selectedJob.statusList],
                                    ["Your Stage", normalizeStage(selectedJob.candidateProcessList)],
                                    ["Industry", selectedJob.industeryList],
                                    ["Job Type", selectedJob.jobTypeList],

                                    ["Created At", formatDate(selectedJob.createdAt)],
                                    ["Closing Date", formatDate(selectedJob.closingDate)],
                                    ["Vacancies", selectedJob.vacanciesNo],
                                    ["Experience", selectedJob.experience],
                                ].map(([label, value]) => (
                                    <div className="text-sm" key={label}>
                                        <div className="text-gray-600 font-semibold">
                                            {label}
                                        </div>
                                        <div className="text-gray-800">{value ?? "—"}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-4">
                            <CandidatePipelineBar
                                stage={selectedJob.candidateProcessList}
                            />
                        </div>

                        <div className="mt-4">
                            <div className="text-sm font-semibold text-gray-800">
                                Short Description
                            </div>
                            <div className="text-sm text-gray-700 mt-1">
                                {selectedJob.shortDescription || "—"}
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="text-sm font-semibold text-gray-800">
                                Details
                            </div>

                            <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700 rounded-xl border border-gray-200 bg-gray-50 p-3">
                                {blocksToPlainText(selectedJob.details) || "—"}
                            </pre>
                        </div>

                        <div className="mt-4 flex justify-end gap-2">


                            <button
                                onClick={closeView}
                                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}