"use client";

import React, { useEffect, useMemo, useState } from "react";
import useAuthClient from "@/lib/useAuthClient";
import { useRouter } from "next/navigation";

// same UI components you use in Candidate form (theme)
import { Field, Input, Textarea, Select } from "@/app/staff/ui/CandidateFormUI";

// enums.json
import ENUMS from "@/config/enums.json";
import { ClipLoader } from "react-spinners";
import { readClientJobsContext } from "@/lib/clientJobsContext";

async function fetchJsonSafe(url, options = {}) {
    const res = await fetch(url, {
        cache: "no-store",
        ...options,
        headers: {
            ...(options?.headers || {}),
        },
    });

    const text = await res.text();
    let json;

    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(
            `API returned non-JSON (status ${res.status}). First bytes: ${text.slice(0, 80)}`
        );
    }

    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Request failed (status ${res.status})`);
    }

    return json;
}

/* -------------------- helpers -------------------- */

function toIntOrNull(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBlocksFromText(text) {
    const t = String(text || "").trim();
    if (!t) return [];
    const parts = t
        .split(/\n\s*\n/)
        .map((x) => x.trim())
        .filter(Boolean);
    return parts.map((p) => ({
        type: "paragraph",
        children: [{ type: "text", text: p }],
    }));
}

function blocksToPlainText(blocks) {
    if (!Array.isArray(blocks)) return "";
    return blocks
        .map((b) => {
            const ch = Array.isArray(b?.children) ? b.children : [];
            const line = ch.map((c) => c?.text || "").join("");
            return line.trim();
        })
        .filter(Boolean)
        .join("\n\n");
}

function StatusPill({ status }) {
    const s = String(status || "").toLowerCase();
    const cls =
        s === "open"
            ? "border-green-200 bg-green-50 text-green-700"
            : s === "closed"
                ? "border-gray-200 bg-gray-50 text-gray-700"
                : "border-gray-200 bg-gray-50 text-gray-700";

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${cls}`}>
            {status || "—"}
        </span>
    );
}


function getPipelineCounts(job) {
    const steps = [
        {
            key: "suggested",
            label: "Suggested",
            match: ["suggested candidate", "suggested"],
            color: "bg-gray-500",
            soft: "bg-gray-100",
            text: "text-gray-700",
        },
        {
            key: "shortlisted",
            label: "Shortlisted",
            match: ["shortlisted candidate", "shortlisted"],
            color: "bg-blue-500",
            soft: "bg-blue-50",
            text: "text-blue-700",
        },
        {
            key: "interview",
            label: "Interview",
            match: ["requested interview", "interview"],
            color: "bg-purple-500",
            soft: "bg-purple-50",
            text: "text-purple-700",
        },
        {
            key: "offered ",
            label: "Offered ",
            match: ["hired candidate", "offered "],
            color: "bg-green-600",
            soft: "bg-green-50",
            text: "text-green-700",
        },
        {
            key: "immigration",
            label: "Immigration",
            match: ["immigration"],
            color: "bg-amber-500",
            soft: "bg-amber-50",
            text: "text-amber-700",
        },
        {
            key: "placed",
            label: "Placed",
            match: ["placed"],
            color: "bg-red-600",
            soft: "bg-red-50",
            text: "text-red-700",
        },
    ];

    const assignments = Array.isArray(job?.assignCandidatesToJob)
        ? job.assignCandidatesToJob
        : [];

    const counts = steps.map((step) => {
        const count = assignments.filter((item) => {
            const value = String(item?.candidateProcessList || "")
                .trim()
                .toLowerCase();

            return step.match.includes(value);
        }).length;

        return {
            ...step,
            count,
        };
    });

    const total = counts.reduce((sum, item) => sum + item.count, 0);

    return { counts, total };
}

function PipelineQuickView({ job }) {
    const { counts } = getPipelineCounts(job);

    const vacancies = Number(job?.vacanciesNo || 0);

    const weights = {
        suggested: 10,
        shortlisted: 25,
        interview: 45,
        offered: 70,
        immigration: 85,
        placed: 100,
    };

    const weightedTotal = counts.reduce((sum, item) => {
        return sum + item.count * (weights[item.key] || 0);
    }, 0);

    const maxProgress = vacancies > 0 ? vacancies * 100 : 0;

    const percent =
        maxProgress > 0
            ? Math.min(100, Math.round((weightedTotal / maxProgress) * 100))
            : 0;

    return (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-gray-700">
                    Candidate Pipeline
                </div>

                <div className="text-[11px] text-gray-600">
                    {percent}%{" "}
                    <span className="text-gray-400">
                        / Vacancies: {vacancies || "—"}
                    </span>
                </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                    className="h-full rounded-full bg-red-300 transition-all"
                    style={{ width: `${percent}%` }}
                />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-6">
                {counts.map((item) => {
                    const styles = {
                        suggested: {
                            wrap: "bg-gray-100 border-gray-300",
                            label: "text-gray-700",
                            count: "text-gray-900",
                        },
                        shortlisted: {
                            wrap: "bg-blue-50 border-blue-200",
                            label: "text-blue-700",
                            count: "text-blue-800",
                        },
                        interview: {
                            wrap: "bg-purple-50 border-purple-200",
                            label: "text-purple-700",
                            count: "text-purple-800",
                        },
                        offered: {
                            wrap: "bg-green-50 border-green-200",
                            label: "text-green-700",
                            count: "text-green-800",
                        },
                        immigration: {
                            wrap: "bg-amber-50 border-amber-200",
                            label: "text-amber-700",
                            count: "text-amber-800",
                        },
                        placed: {
                            wrap: "bg-red-50 border-red-200",
                            label: "text-red-700",
                            count: "text-red-800",
                        },
                    };

                    const s = styles[item.key] || {
                        wrap: "bg-gray-50 border-gray-200",
                        label: "text-gray-700",
                        count: "text-gray-900",
                    };

                    return (
                        <div
                            key={item.key}
                            className={`flex items-center justify-between gap-1 rounded-md border px-2 py-1 ${s.wrap}`}
                        >
                            <span className={`truncate text-[10px] leading-none ${s.label}`}>
                                {item.label}
                            </span>

                            <span className={`text-[11px] font-bold leading-none ${s.count}`}>
                                {item.count}
                            </span>
                        </div>
                    );
                })}
            </div>


        </div>
    );
}

function roleNameFromAuth(user, role) {
    return String(
        role?.name ||
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.type ||
        role ||
        user?.role ||
        ""
    )
        .trim()
        .toLowerCase();
}

function clientDocumentIdFromUser(user) {
    const possibleValues = [
        user?.documentId,
        user?.clientDocumentId,
        user?.client?.documentId,
        user?.client?.data?.documentId,
        user?.client?.data?.attributes?.documentId,
        user?.data?.documentId,
        user?.profile?.documentId,
    ];

    return String(possibleValues.find((value) => String(value || "").trim()) || "").trim();
}

function clientNameFromUser(user) {
    return String(
        user?.companyName ||
        user?.client?.companyName ||
        user?.client?.data?.companyName ||
        user?.client?.data?.attributes?.companyName ||
        ""
    ).trim();
}

/* -------------------- page -------------------- */

export default function ClientJobsPage() {
    return <ClientJobsContent />;
}


function ClientJobsContent() {

    // Resolve the client without exposing its documentId in the browser URL.
    const auth = useAuthClient();
    const user = auth?.user;
    const role = auth?.role;
    const authLoading = Boolean(auth?.loadingAuth ?? auth?.authLoading ?? false);

    const roleName = roleNameFromAuth(user, role);
    const isStaff = roleName === "staff";
    const isClient = roleName === "client" || roleName === "clients";
    const authenticatedClientDocumentId = clientDocumentIdFromUser(user);
    const authenticatedClientName = clientNameFromUser(user);

    const [clientDocumentId, setClientDocumentId] = useState("");
    const [clientName, setClientName] = useState("");
    const [clientContextLoading, setClientContextLoading] = useState(true);

    const pageSize = 10;

    const [page, setPage] = useState(1);
    const [items, setItems] = useState([]);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);

    const [showClosed, setShowClosed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    // modals
    const [openCreate, setOpenCreate] = useState(false);
    const [openView, setOpenView] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);

    // ✅ edit modal
    const [openEdit, setOpenEdit] = useState(false);
    const [editingJob, setEditingJob] = useState(null);

    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState("");

    // form fields (schema)
    const [title, setTitle] = useState("");
    const [location, setLocation] = useState("");
    const [closingDate, setClosingDate] = useState(""); // yyyy-mm-dd
    const [statusList, setStatusList] = useState("open");
    const [industeryList, setIndusteryList] = useState("");
    const [jobTypeList, setJobTypeList] = useState("");
    const [showToCandidateList, setShowToCandidateList] = useState("Job and Company");
    const [vacanciesNo, setVacanciesNo] = useState("");
    const [experience, setExperience] = useState("");
    const [shortDescription, setShortDescription] = useState("");
    const [detailsText, setDetailsText] = useState("");

    // enums (fallbacks safe)
    const statusOptions = useMemo(() => ENUMS?.statusList || ["open", "closed"], []);
    const industryOptions = useMemo(() => ENUMS?.industries || ENUMS?.industryList || [], []);
    const jobTypeOptions = useMemo(
        () => ENUMS?.jobType,
        []
    );
    const showToCandidateOptions = useMemo(
        () => ENUMS?.showToCandidate || ["Only Job Title", "Complete Job", "Job and Company"],
        []
    );

    useEffect(() => {
        if (authLoading) return undefined;

        let cancelled = false;

        Promise.resolve().then(() => {
            if (cancelled) return;

            setErr("");

            if (isClient) {
                if (!authenticatedClientDocumentId) {
                    setClientDocumentId("");
                    setClientName("");
                    setErr("Your logged-in client account does not contain a document ID. Please log out and log in again.");
                    setLoading(false);
                    setClientContextLoading(false);
                    return;
                }

                setClientDocumentId(authenticatedClientDocumentId);
                setClientName(authenticatedClientName);
                setClientContextLoading(false);
                return;
            }

            if (isStaff) {
                const selectedClient = readClientJobsContext();

                if (!selectedClient?.documentId) {
                    setClientDocumentId("");
                    setClientName("");
                    setErr("No client is selected. Open Staff > Clients and click Client Jobs List.");
                    setLoading(false);
                    setClientContextLoading(false);
                    return;
                }

                setClientDocumentId(selectedClient.documentId);
                setClientName(selectedClient.companyName || "");
                setClientContextLoading(false);
                return;
            }

            setClientDocumentId("");
            setClientName("");
            setErr("You do not have permission to view client jobs.");
            setLoading(false);
            setClientContextLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [
        authLoading,
        authenticatedClientDocumentId,
        authenticatedClientName,
        isClient,
        isStaff,
    ]);

    function jobsRequestHeaders() {
        return isStaff && clientDocumentId
            ? { "x-client-document-id": clientDocumentId }
            : {};
    }

    function jobsUrl(nextPage, includeClosed) {
        return `/api/jobs/list?page=${nextPage}&pageSize=${pageSize}&includeClosed=${includeClosed ? "1" : "0"}`;
    }

    function applyJobsResponse(json) {
        setItems(Array.isArray(json?.items) ? json.items : []);
        setPageCount(Number(json?.pageCount || 1));
        setTotal(Number(json?.total || 0));
        setClientName((current) => json?.client?.companyName || current || "");
    }

    function applyJobsError(error) {
        setErr(error?.message || "Failed to load jobs");
        setItems([]);
        setPageCount(1);
        setTotal(0);
    }

    async function refreshJobs(nextPage = page, includeClosed = showClosed) {
        if (!clientDocumentId) return;

        setLoading(true);
        setErr("");

        try {
            const json = await fetchJsonSafe(jobsUrl(nextPage, includeClosed), {
                headers: jobsRequestHeaders(),
            });
            applyJobsResponse(json);
        } catch (error) {
            applyJobsError(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (authLoading || clientContextLoading || !clientDocumentId) return undefined;

        const controller = new AbortController();

        Promise.resolve().then(() => {
            if (controller.signal.aborted) return;
            setLoading(true);
            setErr("");
        });

        fetchJsonSafe(jobsUrl(page, showClosed), {
            signal: controller.signal,
            headers: jobsRequestHeaders(),
        })
            .then((json) => {
                if (controller.signal.aborted) return;
                applyJobsResponse(json);
            })
            .catch((error) => {
                if (controller.signal.aborted || error?.name === "AbortError") return;
                applyJobsError(error);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
        // jobsRequestHeaders and jobsUrl use the values listed below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, clientContextLoading, clientDocumentId, isStaff, page, pageSize, showClosed]);

    function resetForm() {
        setTitle("");
        setLocation("");
        setClosingDate("");
        setStatusList("open");
        setIndusteryList("");
        setJobTypeList("");
        setShowToCandidateList("Job and Company");
        setVacanciesNo("");
        setExperience("");
        setShortDescription("");
        setDetailsText("");
        setSaveErr("");
    }

    function fillFormFromJob(job) {
        setTitle(job?.title || "");
        setLocation(job?.location || "");
        setClosingDate(job?.closingDate ? String(job.closingDate).slice(0, 10) : "");
        setStatusList(job?.statusList || "open");
        setIndusteryList(job?.industeryList || "");
        setJobTypeList(job?.jobTypeList || "");
        setShowToCandidateList(job?.showToCandidateList || "Job and Company");
        setVacanciesNo(job?.vacanciesNo ?? "");
        setExperience(job?.experience ?? "");
        setShortDescription(job?.shortDescription || "");
        setDetailsText(blocksToPlainText(job?.details) || "");
        setSaveErr("");
    }

    function closeCreate() {
        setOpenCreate(false);
        setSaving(false);
        setSaveErr("");
    }

    function openViewJob(job) {
        setSelectedJob(job);
        setOpenView(true);
    }

    function closeView() {
        setOpenView(false);
        setSelectedJob(null);
    }

    function canManageJobs(actionLabel = "manage jobs") {
        if (authLoading) {
            alert("Please wait, checking user role...");
            return false;
        }

        if (!isStaff) {
            alert(`Only staff can ${actionLabel}.`);
            return false;
        }

        return true;
    }

    // ✅ open edit modal (fetch fresh job from API)
    async function openEditJob(job) {
        if (!canManageJobs("update jobs")) return;

        try {
            setSaveErr("");
            setSaving(true);

            const docId = job?.documentId || job?.id;

            if (!docId) throw new Error("Job documentId missing");



            const json = await fetchJsonSafe(`/api/jobs/get/${docId}`);
            const fresh = json?.item || job;



            setEditingJob(fresh);
            fillFormFromJob(fresh);
            setOpenEdit(true);
        } catch (e) {
            alert(e?.message || "Failed to open edit");
        } finally {
            setSaving(false);
        }
    }

    function closeEdit() {
        setOpenEdit(false);
        setEditingJob(null);
        setSaving(false);
        setSaveErr("");
    }

    async function submitCreate(e) {
        e.preventDefault();

        if (!isStaff) {
            setSaveErr("Only staff can create jobs.");
            return;
        }

        setSaving(true);
        setSaveErr("");

        try {
            const payload = {
                title,
                location,
                closingDate: closingDate || null,
                statusList: statusList || "open",
                industeryList: industeryList || "",
                jobTypeList: jobTypeList || "",
                showToCandidateList: showToCandidateList || "",
                vacanciesNo: toIntOrNull(vacanciesNo),
                experience: toIntOrNull(experience),
                shortDescription,
                details: toBlocksFromText(detailsText),
            };

            const res = await fetch("/api/jobs/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...jobsRequestHeaders(),
                },
                cache: "no-store",
                body: JSON.stringify(payload),
            });

            const text = await res.text();
            let json;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                throw new Error(
                    `API returned non-JSON (status ${res.status}). First bytes: ${text.slice(0, 80)}`
                );
            }

            if (!res.ok || json?.ok === false) throw new Error(json?.error || "Create job failed");

            closeCreate();
            resetForm();
            setPage(1);
            await refreshJobs(1, showClosed);
        } catch (e2) {
            setSaveErr(e2?.message || "Failed to create job");
        } finally {
            setSaving(false);
        }
    }

    // ✅ submit update
    async function submitUpdate(e) {
        e.preventDefault();

        if (!isStaff) {
            setSaveErr("Only staff can update jobs.");
            return;
        }

        if (!editingJob?.documentId && !editingJob?.id) return;

        setSaving(true);
        setSaveErr("");

        try {
            const jobDocumentId = editingJob.documentId || editingJob.id;

            const payload = {
                title,
                location,
                closingDate: closingDate || null,
                statusList: statusList || "open",
                industeryList: industeryList || "",
                jobTypeList: jobTypeList || "",
                showToCandidateList: showToCandidateList || "",
                vacanciesNo: toIntOrNull(vacanciesNo),
                experience: toIntOrNull(experience),
                shortDescription,
                details: toBlocksFromText(detailsText),
            };

            const res = await fetch(`/api/jobs/update/${jobDocumentId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...jobsRequestHeaders(),
                },
                cache: "no-store",
                body: JSON.stringify(payload),
            });

            const text = await res.text();
            let json;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                throw new Error(
                    `API returned non-JSON (status ${res.status}). First bytes: ${text.slice(0, 80)}`
                );
            }

            if (!res.ok || json?.ok === false) throw new Error(json?.error || "Update job failed");

            // refresh list
            await refreshJobs(page, showClosed);

            // if view modal is open for same job, update that object too
            if (selectedJob && (selectedJob.documentId || selectedJob.id) === jobDocumentId) {
                setSelectedJob(json?.item || { ...selectedJob, ...payload });
            }

            closeEdit();
        } catch (e2) {
            setSaveErr(e2?.message || "Failed to update job");
        } finally {
            setSaving(false);
        }
    }

    const router = useRouter();

    async function OpenJobBoard(jobDocumentId) {
        if (!jobDocumentId) return;

        router.push(`/jobs/${jobDocumentId}`);
    }

    const headerText = useMemo(() => {
        return `(${total} ${showClosed ? "Jobs" : "Open Jobs"})`;
    }, [total, showClosed]);

    return (
        <>


            {/* Top Title + Right Menu */}
            <div className="mt-0 md:mt-3 px-20 py-5 border-b border-gray-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3   ">
                <div className="topHeading border-0">Jobs</div>

                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-gray-800 select-none">
                        <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={showClosed}
                            onChange={(e) => {
                                setLoading(true);
                                setErr("");
                                setPage(1);
                                setShowClosed(e.target.checked);
                            }}
                        />
                        Show closed jobs
                    </label>

                    <button
                        type="button"
                        onClick={() => refreshJobs(page, showClosed)}
                        className="text-xs sm:text-sm rounded-full border border-red-600 text-gray-700 px-6 py-2 hover:bg-red-600 hover:text-white transition"
                    >
                        Refresh
                    </button>

                    {isStaff && (
                        <button
                            type="button"
                            onClick={() => {
                                if (!canManageJobs("create jobs")) return;
                                resetForm();
                                setOpenCreate(true);
                            }}
                            className="text-xs sm:text-sm rounded-full bg-red-600 border border-red-600 text-white px-6 py-2 hover:bg-gray-50 hover:text-gray-800 transition"
                        >
                            + Create Job
                        </button>
                    )}
                </div>
            </div>

            <div className="w-full mx-auto p-4 space-y-4 px-20  ">
                <div className="text-sm text-gray-700">
                    {headerText}{" "}
                    <span className="text-sm text-gray-600 ml-2">
                        <span className="text-gray-600 font-semibold">Client: </span>
                        {clientName || items[0]?.companyName || "—"}
                    </span>
                </div>

                {loading ? (
                    <div className=" flex justify-start items-center gap-3  rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-800">
                        <ClipLoader
                            size={25}
                            color="#b91c1c"
                            speedMultiplier={1}
                        />
                        <div className="text-left">
                            Loading Job Candidates...
                        </div>
                    </div>
                ) : err ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                        {err}
                    </div>
                ) : items.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-800">
                        No jobs found.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((j) => (
                            <div
                                key={j.documentId || j.id}
                                className="w-full rounded-xl border border-gray-400 bg-white px-4 py-3 sm:px-4 sm:py-5"
                            >
                                {/* ✅ responsive: on mobile stack; on desktop row */}
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    {/* LEFT */}
                                    <div className="min-w-0 w-full">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3  min-w-0">
                                            <div
                                                onClick={() => OpenJobBoard(j.documentId)}
                                                className="truncate text-lg sm:text-xl font-bold text-red-700 hover:underline cursor-pointer"
                                            >
                                                {j.title || "—"}
                                            </div>

                                            {/* desktop-only meta pills */}
                                            <span className="hidden sm:inline text-base text-gray-800 pr-5 ml-2">
                                                {j.referenceNo || j.id || "—"}
                                            </span>
                                            <span className="hidden sm:inline text-sm text-gray-700">
                                                <span className="text-blue-500">Created At: </span>
                                                {j.createdAt ? new Date(j.createdAt).toLocaleDateString() : "—"}
                                            </span>
                                            <span className="hidden sm:inline text-sm text-gray-700 ml-3">
                                                <span className="text-blue-500">Closing Date: </span>
                                                {j.closingDate ? new Date(j.closingDate).toLocaleDateString() : "—"}
                                            </span>
                                        </div>

                                        {/* ✅ responsive meta line */}
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                                            <span className="text-sm px-2 py-1 text-blue-500 bg-gray-100 rounded-md">
                                                📝 {j.jobTypeList || "—"}
                                            </span>
                                            <span className="text-sm px-2 py-1 text-blue-500 bg-gray-100 rounded-md">
                                                🌍 {j.location || "—"}
                                            </span>
                                            <span className="text-sm px-2 py-1 text-blue-500 bg-gray-100 rounded-md">
                                                👥 vacancies: {j.vacanciesNo ?? "—"}
                                            </span>
                                            <span className="text-sm px-2 py-1 text-blue-500 bg-gray-100 rounded-md">
                                                👷‍♂️ Experience: {j.experience ?? "—"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* ✅ RIGHT actions: full width on mobile, align right on desktop */}
                                    <div className="w-full sm:w-2xl flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-end   ">
                                        <div className="flex items-center gap-2  not-first:not-last:">
                                            <StatusPill status={j.statusList} />
                                        </div>

                                        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2    ">
                                            <button
                                                onClick={() => openViewJob(j)}
                                                className="w-full sm:w-auto rounded-md border border-gray-300 text-gray-700 px-3 py-2 text-sm hover:bg-gray-50"
                                            >
                                                View
                                            </button>


                                            {isStaff && (
                                                <button
                                                    onClick={() => openEditJob(j)}
                                                    className="w-full sm:w-auto rounded-md border border-blue-600 text-blue-700 px-3 py-2 text-sm hover:bg-blue-100"
                                                >
                                                    Update
                                                </button>
                                            )}

                                            <button
                                                onClick={() => OpenJobBoard(j.documentId)}
                                                disabled={String(j.statusList || "").toLowerCase() === "closed"}
                                                className="w-full sm:w-auto rounded-md bg-red-700 text-white px-5 py-2 text-sm hover:opacity-90 disabled:opacity-40"
                                            >
                                                Job Board
                                            </button>
                                        </div>
                                    </div>
                                </div>



                                {/* Description */}
                                <div className="mt-2 text-sm text-gray-700 line-clamp-2">
                                    {j.shortDescription || "—"}
                                </div>


                                {/* Pipeline Quick View */}
                                <PipelineQuickView job={j} />


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
                            onClick={() => {
                                setLoading(true);
                                setErr("");
                                setPage((p) => Math.max(1, p - 1));
                            }}
                            disabled={page <= 1 || loading}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Prev
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setLoading(true);
                                setErr("");
                                setPage((p) => Math.min(pageCount, p + 1));
                            }}
                            disabled={page >= pageCount || loading}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* CREATE MODAL (keep your existing UI) */}
            {openCreate && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeCreate();
                    }}
                >
                    <div className="absolute inset-0 bg-black/50" />

                    <div className="relative w-full sm:max-w-4xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-lg sm:text-xl font-bold truncate text-red-700">Create Job</div>
                                <div className="text-sm text-gray-700 truncate ">
                                    <span className="font-bold">Client:</span> {items[0]?.companyName || "—"}
                                </div>
                            </div>

                            <button
                                onClick={closeCreate}
                                className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                                type="button"
                            >
                                Close
                            </button>
                        </div>

                        {saveErr ? (
                            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                {saveErr}
                            </div>
                        ) : null}

                        <form onSubmit={submitCreate} className="mt-5 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Title *">
                                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" />
                                </Field>

                                <Field label="Location">
                                    <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Dubai, UAE" />
                                </Field>

                                <Field label="Closing Date">
                                    <Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
                                </Field>

                                <Field label="Industry">
                                    <Select value={industeryList} onChange={(e) => setIndusteryList(e.target.value)}>
                                        <option value="">Select</option>
                                        {industryOptions.map((x) => (
                                            <option key={x} value={x}>{x}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Job Type">
                                    <Select value={jobTypeList} onChange={(e) => setJobTypeList(e.target.value)}>
                                        <option value="">Select</option>
                                        {jobTypeOptions.map((x) => (
                                            <option key={x} value={x}>{x}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="How to Share Details with the Candidate?">
                                    <Select value={showToCandidateList} onChange={(e) => setShowToCandidateList(e.target.value)}>
                                        <option value="">Select</option>
                                        {showToCandidateOptions.map((x) => (
                                            <option key={x} value={x}>{x}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Vacancies No">
                                    <Input value={vacanciesNo} onChange={(e) => setVacanciesNo(e.target.value)} placeholder="e.g. 5" />
                                </Field>

                                <Field label="Experience (years)">
                                    <Input value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="e.g. 2" />
                                </Field>
                            </div>

                            <Field label="Short Description">
                                <Textarea rows={3} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
                            </Field>

                            <Field label="Details (Rich Text blocks)">
                                <Textarea
                                    rows={7}
                                    value={detailsText}
                                    onChange={(e) => setDetailsText(e.target.value)}
                                    placeholder="Write details here..."
                                />
                            </Field>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={closeCreate}
                                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={saving || !isStaff || !clientDocumentId || !title.trim()}
                                    className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-40"
                                >
                                    {saving ? "Saving..." : "Create Job"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* VIEW MODAL (keep existing) */}
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
                                <div className="text-lg sm:text-xl font-bold truncate">{selectedJob.title || "Job"} </div>
                                <div className="text-sm text-gray-600 truncate">
                                    {selectedJob.location || "—"} • Job ID: {selectedJob.referenceNo || selectedJob.id || "—"}
                                </div>
                            </div>

                            <button onClick={closeView} className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
                                Close
                            </button>
                        </div>

                        <div className="mt-4 rounded-xl border border-gray-200 p-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                {[
                                    ["Status", selectedJob.statusList],
                                    ["Industry", selectedJob.industeryList],
                                    ["Job Type", selectedJob.jobTypeList],
                                    ["How To Candidate?", selectedJob.showToCandidateList],
                                    ["Created At", selectedJob.createdAt ? new Date(selectedJob.createdAt).toLocaleDateString() : "—"],
                                    ["Closing Date", selectedJob.closingDate ? new Date(selectedJob.closingDate).toLocaleDateString() : "—"],
                                    ["Vacancies", selectedJob.vacanciesNo],
                                    ["Experience", selectedJob.experience],
                                ].map(([k, v]) => (
                                    <div className="text-sm" key={k}>
                                        <div className="text-gray-600 font-semibold">{k}</div>
                                        <div className="text-gray-800">{v ?? "—"}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="text-sm font-semibold text-gray-800">Short Description</div>
                            <div className="text-sm text-gray-700 mt-1">{selectedJob.shortDescription || "—"}</div>
                        </div>

                        <div className="mt-4">
                            <div className="text-sm font-semibold text-gray-800">Details</div>
                            <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700 rounded-xl border border-gray-200 bg-gray-50 p-3">
                                {blocksToPlainText(selectedJob.details) || "—"}
                            </pre>
                        </div>

                        <div className="mt-4 flex justify-end gap-2">
                            {isStaff && (
                                <button
                                    onClick={() => openEditJob(selectedJob)}
                                    className="rounded-lg border border-blue-600 text-blue-700 px-4 py-2 text-sm hover:bg-blue-50"
                                >
                                    Update
                                </button>
                            )}
                            <button
                                onClick={() => OpenJobBoard(selectedJob.documentId)}
                                disabled={String(selectedJob.statusList || "").toLowerCase() === "closed"}
                                className="rounded-lg bg-red-700 text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
                            >
                                Job Board
                            </button>
                            <button onClick={closeView} className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ✅ EDIT MODAL */}
            {openEdit && editingJob && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeEdit();
                    }}
                >
                    <div className="absolute inset-0 bg-black/50" />

                    <div className="relative w-full sm:max-w-4xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-lg sm:text-xl font-bold truncate">Update Job</div>
                                <div className="text-sm text-gray-600 truncate">
                                    {editingJob.title || "—"} • Job ID: {editingJob.referenceNo || editingJob.documentId || editingJob.id || "—"}
                                </div>
                            </div>

                            <button
                                onClick={closeEdit}
                                className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                                type="button"
                            >
                                Close
                            </button>
                        </div>

                        {saveErr ? (
                            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                {saveErr}
                            </div>
                        ) : null}

                        <form onSubmit={submitUpdate} className="mt-5 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Title *">
                                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" />
                                </Field>

                                <Field label="Location">
                                    <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Dubai, UAE" />
                                </Field>

                                <Field label="Closing Date">
                                    <Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
                                </Field>

                                <Field label="Status">
                                    <Select value={statusList} onChange={(e) => setStatusList(e.target.value)}>
                                        {statusOptions.map((x) => (
                                            <option key={x} value={x}>{x}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Industry">
                                    <Select value={industeryList} onChange={(e) => setIndusteryList(e.target.value)}>
                                        <option value="">Select</option>
                                        {industryOptions.map((x) => (
                                            <option key={x} value={x}>{x}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Job Type">
                                    <Select value={jobTypeList} onChange={(e) => setJobTypeList(e.target.value)}>
                                        <option value="">Select</option>
                                        {jobTypeOptions.map((x) => (
                                            <option key={x} value={x}>{x}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="How to Share Details with the Candidate?">
                                    <Select value={showToCandidateList} onChange={(e) => setShowToCandidateList(e.target.value)}>
                                        <option value="">Select</option>
                                        {showToCandidateOptions.map((x) => (
                                            <option key={x} value={x}>{x}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Vacancies No">
                                    <Input value={vacanciesNo} onChange={(e) => setVacanciesNo(e.target.value)} placeholder="e.g. 5" />
                                </Field>

                                <Field label="Experience (years)">
                                    <Input value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="e.g. 2" />
                                </Field>
                            </div>

                            <Field label="Short Description">
                                <Textarea rows={3} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
                            </Field>

                            <Field label="Details (Rich Text blocks)">
                                <Textarea
                                    rows={7}
                                    value={detailsText}
                                    onChange={(e) => setDetailsText(e.target.value)}
                                    placeholder="Write details here..."
                                />
                            </Field>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={closeEdit}
                                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={saving || !isStaff || !clientDocumentId || !title.trim()}
                                    className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-40"
                                >
                                    {saving ? "Updating..." : "Update Job"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}