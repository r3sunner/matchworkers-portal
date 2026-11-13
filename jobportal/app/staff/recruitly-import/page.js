"use client";

// Staff screen for the Recruitly import (Milestone 1, R1).
// Choose a portal client → link it to its Recruitly company once (can be
// changed or removed) → choose a Recruitly job → tick candidates.
// The Import action itself comes next.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipLoader } from "react-spinners";

function cls(...parts) {
    return parts.filter(Boolean).join(" ");
}

async function fetchJson(url, options) {
    const res = await fetch(url, { cache: "no-store", ...options });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Request failed (${res.status}).`);
    }

    return json;
}

const STAGE_LABEL = {
    "Suggested Candidate": "Suggested",
    "Shortlisted Candidate": "Shortlisted",
    "Requested Interview": "Requested Interview",
    Interviewed: "Interviewed",
    "Hired Candidate": "Offered",
    Immigration: "Immigration",
    Placed: "Placed",
};

const STAGE_STYLE = {
    "Suggested Candidate": "bg-sky-50 text-sky-700 ring-sky-200",
    "Shortlisted Candidate": "bg-indigo-50 text-indigo-700 ring-indigo-200",
    "Requested Interview": "bg-violet-50 text-violet-700 ring-violet-200",
    Interviewed: "bg-purple-50 text-purple-700 ring-purple-200",
    "Hired Candidate": "bg-amber-50 text-amber-700 ring-amber-200",
    Immigration: "bg-orange-50 text-orange-700 ring-orange-200",
    Placed: "bg-green-50 text-green-700 ring-green-200",
};

const STATUS_LABEL = {
    SOURCED: "Sourcing",
    APPLIED: "Preparing",
    SHORTLIST: "Matching",
    CV_SENT: "Selecting",
    INTERVIEW: "Offering",
    OFFER: "Immigration",
    PLACED: "Placed",
};

// Order in the table: importable first, then not shown yet, then removed.
const ACTION_ORDER = { show: 0, hide: 1, remove: 2 };

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Spinner({ label }) {
    return (
        <div className="flex items-center gap-3 py-2 text-sm text-gray-600">
            <ClipLoader size={18} color="#b91c1c" speedMultiplier={1} />
            <span>{label}</span>
        </div>
    );
}

function ErrorBox({ message, onRetry }) {
    if (!message) return null;
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>{message}</span>
            {onRetry ? (
                <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                    Try again
                </button>
            ) : null}
        </div>
    );
}

function FieldLabel({ step, children, done }) {
    return (
        <div className="mb-1.5 flex items-center gap-2">
            <span
                className={cls(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    done ? "bg-red-700 text-white" : "bg-gray-200 text-gray-600"
                )}
            >
                {done ? "✓" : step}
            </span>
            <span className="text-sm font-semibold text-gray-800">{children}</span>
        </div>
    );
}

function Modal({ title, children, onClose, busy, wide = false }) {
    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape" && !busy) onClose();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose, busy]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) onClose();
            }}
        >
            <div className="absolute inset-0 bg-black/50" />
            <div className={cls("relative w-full bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
                <div className="text-lg sm:text-xl text-red-700">{title}</div>
                <div className="mt-3">{children}</div>
            </div>
        </div>
    );
}

// Searchable dropdown that floats over the page (no layout shift), with
// keyboard support: ↑ ↓ to move, Enter to pick, Esc to close.
function SearchableSelect({ value, onChange, options, placeholder = "Select", disabled = false, emptyText = "No result found" }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [active, setActive] = useState(0);
    const wrapRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        function onDoc(e) {
            if (!wrapRef.current?.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const selected = options.find((x) => String(x.value) === String(value));
    const filtered = options.filter((x) =>
        `${x.label} ${x.hint || ""}`.toLowerCase().includes(q.trim().toLowerCase())
    );

    function openList() {
        if (disabled) return;
        setQ("");
        setActive(0);
        setOpen(true);
    }

    function choose(opt) {
        onChange(opt.value);
        setOpen(false);
        setQ("");
    }

    function onKeyDown(e) {
        if (e.key === "Escape") {
            setOpen(false);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && filtered[active]) {
            e.preventDefault();
            choose(filtered[active]);
        }
    }

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active]);

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openList())}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={cls(
                    "w-full rounded-xl border bg-white px-3 py-2.5 text-left text-sm transition",
                    open ? "border-red-300 ring-2 ring-red-100" : "border-gray-300",
                    disabled ? "cursor-not-allowed bg-gray-50 opacity-60" : "hover:border-gray-400"
                )}
            >
                <span className="flex items-center justify-between gap-3">
                    <span className={cls("truncate", selected ? "text-gray-900" : "text-gray-400")}>
                        {selected ? selected.label : placeholder}
                        {selected?.hint ? <span className="ml-2 text-xs text-gray-500">{selected.hint}</span> : null}
                    </span>
                    <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                </span>
            </button>

            {open && !disabled ? (
                <div className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                    <div className="border-b border-gray-100 p-2">
                        <input
                            autoFocus
                            value={q}
                            onChange={(e) => {
                                setQ(e.target.value);
                                setActive(0);
                            }}
                            onKeyDown={onKeyDown}
                            placeholder="Type to search…"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                        />
                    </div>
                    <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
                        {filtered.map((opt, i) => (
                            <button
                                type="button"
                                role="option"
                                aria-selected={String(value) === String(opt.value)}
                                key={opt.value}
                                data-index={i}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => choose(opt)}
                                className={cls(
                                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm",
                                    i === active ? "bg-gray-50" : "",
                                    String(value) === String(opt.value) ? "text-red-700 font-medium" : "text-gray-800"
                                )}
                            >
                                <span className="truncate">{opt.label}</span>
                                <span className="flex shrink-0 items-center gap-2">
                                    {opt.hint ? <span className="text-xs text-gray-500">{opt.hint}</span> : null}
                                    {opt.badge ? (
                                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-green-200">
                                            {opt.badge}
                                        </span>
                                    ) : null}
                                </span>
                            </button>
                        ))}

                        {filtered.length === 0 ? <div className="px-3 py-2 text-sm text-gray-500">{emptyText}</div> : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

const OUTCOME = {
    created: { label: "Created", style: "bg-green-50 text-green-700 ring-green-200" },
    updated: { label: "Updated", style: "bg-sky-50 text-sky-700 ring-sky-200" },
    review: { label: "Needs review", style: "bg-amber-50 text-amber-800 ring-amber-200" },
    skipped: { label: "Skipped", style: "bg-gray-100 text-gray-600 ring-gray-200" },
    failed: { label: "Failed", style: "bg-red-50 text-red-700 ring-red-200" },
    removed: { label: "Taken off job", style: "bg-gray-100 text-gray-700 ring-gray-300" },
};

function ImportResult({ result }) {
    const s = result?.summary || {};
    const rows = result?.results || [];
    return (
        <div aria-live="polite">
            {result?.job ? (
                <p className="mb-3 text-sm text-gray-700">
                    Portal job <span className="font-semibold">{result.job.referenceNo || result.job.title}</span>{" "}
                    {result.job.created ? "was created for this client." : "was updated."}
                </p>
            ) : null}
            <div className="flex flex-wrap gap-2 text-xs">
                {["created", "updated", "removed", "review", "skipped", "failed"].map((k) =>
                    s[k] ? (
                        <span key={k} className={cls("rounded-full px-3 py-1 font-medium ring-1", OUTCOME[k].style)}>
                            {s[k]} {OUTCOME[k].label.toLowerCase()}
                        </span>
                    ) : null
                )}
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Candidate</th>
                            <th className="px-3 py-3 font-semibold">Result</th>
                            <th className="px-3 py-3 font-semibold">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.candidateId} className="border-t border-gray-100 align-top">
                                <td className="px-4 py-3">
                                    <div className="font-medium text-gray-900">{r.name || r.candidateId}</div>
                                    {r.reference ? <div className="text-xs text-gray-500">{r.reference}</div> : null}
                                </td>
                                <td className="px-3 py-3">
                                    <span className={cls("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", OUTCOME[r.outcome]?.style)}>
                                        {OUTCOME[r.outcome]?.label || r.outcome}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-600">
                                    {r.outcome === "updated" && r.matchedBy ? <div>Matched existing candidate by {r.matchedBy}</div> : null}
                                    {r.stageNote ? <div className="text-gray-800">{r.stageNote}</div> : null}
                                    {r.reason ? <div>{r.reason}</div> : null}
                                    {(r.possibleMatches || []).map((m) => (
                                        <div key={m.documentId} className="text-gray-500">
                                            Possible match: {m.fullName || "(no name)"}
                                            {m.reference ? ` (${m.reference})` : ""}
                                        </div>
                                    ))}
                                    {(r.notes || []).map((n) => (
                                        <div key={n} className="text-amber-700">
                                            {n}
                                        </div>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function RecruitlyImportPage() {
    const [clients, setClients] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [loadingSetup, setLoadingSetup] = useState(true);
    const [setupError, setSetupError] = useState("");

    const [clientDocumentId, setClientDocumentId] = useState("");
    const [linkCompanyId, setLinkCompanyId] = useState("");
    const [changingLink, setChangingLink] = useState(false);
    const [confirm, setConfirm] = useState(null); // { kind: "link" | "unlink", companyId? }
    const [savingLink, setSavingLink] = useState(false);
    const [linkError, setLinkError] = useState("");
    const [notice, setNotice] = useState("");

    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [jobsError, setJobsError] = useState("");
    const [jobId, setJobId] = useState("");

    const [pipeline, setPipeline] = useState(null);
    const [loadingPipeline, setLoadingPipeline] = useState(false);
    const [pipelineError, setPipelineError] = useState("");
    const [selected, setSelected] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [importError, setImportError] = useState("");

    const setupRequest = useRef(0);
    const jobsRequest = useRef(0);
    const pipelineRequest = useRef(0);

    const loadSetup = useCallback(async () => {
        const request = ++setupRequest.current;
        setLoadingSetup(true);
        setSetupError("");
        try {
            const [clientsJson, companiesJson] = await Promise.all([
                fetchJson("/api/recruitly/clients/"),
                fetchJson("/api/recruitly/companies/"),
            ]);
            if (request !== setupRequest.current) return;
            setClients(clientsJson.clients || []);
            setCompanies(companiesJson.companies || []);
        } catch (error) {
            if (request === setupRequest.current) setSetupError(error.message);
        } finally {
            if (request === setupRequest.current) setLoadingSetup(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(loadSetup, 0);
        return () => {
            clearTimeout(timer);
            setupRequest.current += 1;
        };
    }, [loadSetup]);

    // Success messages hide themselves after a few seconds.
    useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(""), 4000);
        return () => clearTimeout(timer);
    }, [notice]);

    const client = useMemo(
        () => clients.find((c) => c.documentId === clientDocumentId) || null,
        [clients, clientDocumentId]
    );
    const linkedCompany = useMemo(
        () => companies.find((c) => c.id === client?.recruitlyCompanyId) || null,
        [companies, client]
    );
    const job = useMemo(() => jobs.find((j) => j.id === jobId) || null, [jobs, jobId]);

    const clientOptions = useMemo(
        () =>
            clients.map((c) => ({
                value: c.documentId,
                label: c.companyName || "(no name)",
                badge: c.recruitlyCompanyId ? "Linked" : "",
            })),
        [clients]
    );
    const linkedElsewhere = useMemo(
        () =>
            new Set(
                clients
                    .filter((c) => c.documentId !== clientDocumentId && c.recruitlyCompanyId)
                    .map((c) => c.recruitlyCompanyId)
            ),
        [clients, clientDocumentId]
    );
    const companyOptions = useMemo(
        () =>
            companies
                .filter((c) => !linkedElsewhere.has(c.id) && c.id !== client?.recruitlyCompanyId)
                .map((c) => ({
                    value: c.id,
                    label: c.name || "(no name)",
                    hint: `${c.jobCount} ${c.jobCount === 1 ? "job" : "jobs"}`,
                })),
        [companies, linkedElsewhere, client]
    );
    const jobOptions = useMemo(
        () =>
            jobs.map((j) => ({
                value: j.id,
                label: `${j.reference} – ${j.title}`,
                hint: j.statusName || "",
            })),
        [jobs]
    );
    const pendingCompany = useMemo(
        () => companies.find((c) => c.id === (confirm?.companyId || linkCompanyId)) || null,
        [companies, confirm, linkCompanyId]
    );

    function resetPipeline() {
        pipelineRequest.current += 1;
        setPipeline(null);
        setSelected([]);
        setPipelineError("");
        setLoadingPipeline(false);
        setImportResult(null);
        setImportError("");
    }

    const loadJobs = useCallback(async (companyId) => {
        const request = ++jobsRequest.current;
        setJobs([]);
        setJobId("");
        resetPipeline();
        setJobsError("");
        if (!companyId) {
            setLoadingJobs(false);
            return;
        }

        setLoadingJobs(true);
        try {
            const json = await fetchJson(`/api/recruitly/jobs/?companyId=${encodeURIComponent(companyId)}`);
            if (request === jobsRequest.current) setJobs(json.jobs || []);
        } catch (error) {
            if (request === jobsRequest.current) setJobsError(error.message);
        } finally {
            if (request === jobsRequest.current) setLoadingJobs(false);
        }
    }, []);

    function selectClient(documentId) {
        setClientDocumentId(documentId);
        setLinkCompanyId("");
        setChangingLink(false);
        setLinkError("");
        setNotice("");
        const next = clients.find((c) => c.documentId === documentId);
        loadJobs(next?.recruitlyCompanyId || "");
    }

    async function loadPipeline(nextJobId, { fresh = false } = {}) {
        resetPipeline();
        if (!nextJobId) return;

        const request = pipelineRequest.current;
        setLoadingPipeline(true);
        try {
            const json = await fetchJson(
                `/api/recruitly/jobs/${encodeURIComponent(nextJobId)}/pipeline/${fresh ? "?fresh=1" : ""}`
            );
            if (request === pipelineRequest.current) setPipeline(json);
        } catch (error) {
            if (request === pipelineRequest.current) setPipelineError(error.message);
        } finally {
            if (request === pipelineRequest.current) setLoadingPipeline(false);
        }
    }

    function selectJob(nextJobId) {
        setJobId(nextJobId);
        loadPipeline(nextJobId);
    }

    async function saveLink(recruitlyCompanyId) {
        if (!client) return;
        setSavingLink(true);
        setLinkError("");

        try {
            const json = await fetchJson(`/api/recruitly/clients/${encodeURIComponent(client.documentId)}/`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recruitlyCompanyId }),
            });
            const savedId = json.client.recruitlyCompanyId || null;
            setClients((prev) =>
                prev.map((c) => (c.documentId === client.documentId ? { ...c, recruitlyCompanyId: savedId } : c))
            );
            const savedName = companies.find((c) => c.id === savedId)?.name;
            setNotice(
                savedId
                    ? `${client.companyName} is now linked to ${savedName || "the Recruitly company"}.`
                    : `Link removed. ${client.companyName} is no longer linked to Recruitly.`
            );
            setLinkCompanyId("");
            setChangingLink(false);
            setConfirm(null);
            loadJobs(savedId || "");
        } catch (error) {
            setLinkError(error.message);
            setConfirm(null);
        } finally {
            setSavingLink(false);
        }
    }

    const entries = useMemo(
        () =>
            [...(pipeline?.entries || [])].sort(
                (a, b) => (ACTION_ORDER[a.action] ?? 9) - (ACTION_ORDER[b.action] ?? 9)
            ),
        [pipeline]
    );
    const importable = entries.filter((e) => e.action === "show");
    const allSelected = importable.length > 0 && importable.every((e) => selected.includes(e.pipelineId));
    const someSelected = selected.length > 0 && !allSelected;

    const selectAllRef = useRef(null);
    useEffect(() => {
        if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
    }, [someSelected]);

    function toggle(pipelineId) {
        setSelected((prev) =>
            prev.includes(pipelineId) ? prev.filter((id) => id !== pipelineId) : [...prev, pipelineId]
        );
    }

    function toggleAll() {
        setSelected(allSelected ? [] : importable.map((e) => e.pipelineId));
    }

    async function runImport() {
        const candidateIds = entries
            .filter((e) => selected.includes(e.pipelineId) && e.action === "show" && e.candidateId)
            .map((e) => e.candidateId);
        if (!jobId || candidateIds.length === 0) return;

        setImporting(true);
        setImportError("");
        setImportResult(null);
        try {
            const json = await fetchJson("/api/recruitly/import/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId, clientDocumentId, candidateIds }),
            });
            setImportResult(json);
            setSelected([]);
        } catch (error) {
            setImportError(error.message);
        } finally {
            setImporting(false);
            setConfirm({ kind: "result" });
        }
    }

    const isLinked = Boolean(client?.recruitlyCompanyId);
    const showLinkPicker = client && (!isLinked || changingLink);

    return (
        <>
            <div className="topHeading">Import from Recruitly</div>

            <div className="w-full mx-auto p-4 space-y-5">
                <p className="text-sm text-gray-600">
                    Choose a client and one of its Recruitly jobs, then tick the candidates to add to the portal.
                    Only candidates from &quot;Sent to Client&quot; onwards can be imported.
                </p>

                <ErrorBox message={setupError} onRetry={loadSetup} />

                {/* ---------------- Choose job ---------------- */}
                <section className="rounded-2xl border border-gray-200 bg-white p-5">
                    <h2 className="mb-4 text-base font-semibold text-gray-900">Choose a job</h2>

                    {loadingSetup ? (
                        <Spinner label="Loading clients and Recruitly companies…" />
                    ) : (
                        <div className="grid gap-5 lg:grid-cols-3">
                            {/* 1. Client */}
                            <div className="min-w-0">
                                <FieldLabel step={1} done={Boolean(client)}>
                                    Portal client
                                </FieldLabel>
                                <SearchableSelect
                                    value={clientDocumentId}
                                    onChange={selectClient}
                                    options={clientOptions}
                                    placeholder="Select a client"
                                    emptyText="No client found"
                                />
                            </div>

                            {/* 2. Recruitly company */}
                            <div className="min-w-0">
                                <FieldLabel step={2} done={isLinked && !changingLink}>
                                    Recruitly company
                                </FieldLabel>

                                {!client ? (
                                    <div className="rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-400">
                                        Select a client first
                                    </div>
                                ) : null}

                                {client && isLinked && !changingLink ? (
                                    <div className="rounded-xl border border-green-200 bg-green-50/60 py-1 pl-3 pr-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="truncate text-sm font-medium text-gray-900">
                                                    {linkedCompany?.name || "Recruitly company (no jobs listed)"}
                                                </span>
                                                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                                                    Linked
                                                </span>
                                            </div>
                                            <div className="flex shrink-0 items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setChangingLink(true);
                                                        setNotice("");
                                                    }}
                                                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                                                >
                                                    Change
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirm({ kind: "unlink" })}
                                                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-white"
                                                >
                                                    Remove link
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {showLinkPicker ? (
                                    <div className="space-y-2">
                                        <SearchableSelect
                                            value={linkCompanyId}
                                            onChange={setLinkCompanyId}
                                            options={companyOptions}
                                            placeholder="Search Recruitly companies"
                                            disabled={savingLink}
                                            emptyText="No company found (or already linked to another client)"
                                        />
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                disabled={!linkCompanyId || savingLink}
                                                onClick={() => setConfirm({ kind: "link", companyId: linkCompanyId })}
                                                className="rounded-lg bg-red-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                                            >
                                                Link company
                                            </button>
                                            {changingLink ? (
                                                <button
                                                    type="button"
                                                    disabled={savingLink}
                                                    onClick={() => {
                                                        setChangingLink(false);
                                                        setLinkCompanyId("");
                                                    }}
                                                    className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                                >
                                                    Cancel
                                                </button>
                                            ) : null}
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            {changingLink
                                                ? "Pick a different Recruitly company for this client."
                                                : "Not linked yet. Link it once; it is remembered next time."}
                                        </p>
                                    </div>
                                ) : null}
                            </div>

                            {/* 3. Job */}
                            <div className="min-w-0">
                                <FieldLabel step={3} done={Boolean(job)}>
                                    Recruitly job
                                </FieldLabel>
                                {!client || !isLinked || changingLink ? (
                                    <div className="rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-400">
                                        {client ? "Link a Recruitly company first" : "Select a client first"}
                                    </div>
                                ) : loadingJobs ? (
                                    <Spinner label="Loading jobs…" />
                                ) : jobsError ? (
                                    <ErrorBox message={jobsError} onRetry={() => loadJobs(client.recruitlyCompanyId)} />
                                ) : jobs.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500">
                                        This Recruitly company has no jobs
                                    </div>
                                ) : (
                                    <SearchableSelect
                                        value={jobId}
                                        onChange={selectJob}
                                        options={jobOptions}
                                        placeholder={`Select a job (${jobs.length})`}
                                        emptyText="No job found"
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {notice ? (
                        <div
                            role="status"
                            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800"
                        >
                            <span>{notice}</span>
                            <button
                                type="button"
                                onClick={() => setNotice("")}
                                aria-label="Dismiss message"
                                className="rounded-md px-1.5 text-lg leading-none text-green-700 hover:bg-green-100"
                            >
                                ×
                            </button>
                        </div>
                    ) : null}
                    {linkError ? (
                        <div className="mt-4">
                            <ErrorBox message={linkError} />
                        </div>
                    ) : null}
                </section>

                {/* ---------------- Candidates ---------------- */}
                {job ? (
                    <section className="rounded-2xl border border-gray-200 bg-white p-5">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold text-gray-900">Candidates</h2>
                                <p className="text-sm text-gray-500">
                                    {job.reference} – {job.title}
                                    {job.statusName ? ` · ${job.statusName}` : ""}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => loadPipeline(jobId, { fresh: true })}
                                disabled={loadingPipeline}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Reload from Recruitly
                            </button>
                        </div>

                        <ErrorBox message={pipelineError} onRetry={() => loadPipeline(jobId)} />
                        {loadingPipeline ? <Spinner label="Loading candidates from Recruitly…" /> : null}

                        {pipeline ? (
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <span className="rounded-full bg-green-50 px-3 py-1 font-medium text-green-700 ring-1 ring-green-200">
                                        {pipeline.summary.show} can be imported
                                    </span>
                                    <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
                                        {pipeline.summary.hide} not shown yet
                                    </span>
                                    {pipeline.summary.remove ? (
                                        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-amber-200">
                                            {pipeline.summary.remove} placement ended
                                        </span>
                                    ) : null}
                                    {pipeline.rejectedHidden ? (
                                        <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
                                            {pipeline.rejectedHidden} rejected (left out)
                                        </span>
                                    ) : null}
                                </div>

                                {!pipeline.complete || pipeline.placementsComplete === false ? (
                                    <ErrorBox
                                        message="Recruitly did not send the full list. Reload before importing."
                                        onRetry={() => loadPipeline(jobId)}
                                    />
                                ) : null}

                                {entries.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                                        No candidates on this job yet.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                                <tr>
                                                    <th className="w-10 px-4 py-3">
                                                        <input
                                                            ref={selectAllRef}
                                                            type="checkbox"
                                                            aria-label="Select all"
                                                            className="h-4 w-4 accent-red-700"
                                                            checked={allSelected}
                                                            disabled={importable.length === 0}
                                                            onChange={toggleAll}
                                                        />
                                                    </th>
                                                    <th className="px-3 py-3 font-semibold">Candidate</th>
                                                    <th className="px-3 py-3 font-semibold">Recruitly stage</th>
                                                    <th className="px-3 py-3 font-semibold">Portal stage</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {entries.map((e) => {
                                                    const canImport = e.action === "show";
                                                    const isSelected = selected.includes(e.pipelineId);
                                                    const note = e.reason || e.placementStatus || "";
                                                    return (
                                                        <tr
                                                            key={e.pipelineId}
                                                            onClick={() => canImport && toggle(e.pipelineId)}
                                                            className={cls(
                                                                "border-t border-gray-100 transition",
                                                                canImport ? "cursor-pointer hover:bg-gray-50" : "bg-gray-50/70",
                                                                isSelected ? "bg-red-50/60 hover:bg-red-50" : ""
                                                            )}
                                                        >
                                                            <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                                                                <input
                                                                    type="checkbox"
                                                                    aria-label={`Select ${e.candidateName}`}
                                                                    className="h-4 w-4 accent-red-700"
                                                                    checked={isSelected}
                                                                    disabled={!canImport}
                                                                    onChange={() => toggle(e.pipelineId)}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-3">
                                                                <div className={cls("font-medium", canImport ? "text-gray-900" : "text-gray-500")}>
                                                                    {e.candidateName || "—"}
                                                                </div>
                                                                {note ? (
                                                                    <div className={cls("text-xs", canImport ? "text-gray-500" : "text-gray-400")}>
                                                                        {note}
                                                                    </div>
                                                                ) : null}
                                                            </td>
                                                            <td className={cls("px-3 py-3", canImport ? "text-gray-700" : "text-gray-400")}>
                                                                {STATUS_LABEL[e.status] || e.status}
                                                                {e.stage ? <span className="text-gray-400"> / </span> : null}
                                                                {e.stage || ""}
                                                            </td>
                                                            <td className="px-3 py-3">
                                                                {e.portalStage ? (
                                                                    <span
                                                                        className={cls(
                                                                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
                                                                            STAGE_STYLE[e.portalStage] || "bg-gray-50 text-gray-700 ring-gray-200"
                                                                        )}
                                                                    >
                                                                        {STAGE_LABEL[e.portalStage] || e.portalStage}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-gray-400">Not shown yet</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {importable.length > 0 ? (
                                    <div className="sticky bottom-0 z-20 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-gray-200 bg-white/95 px-5 py-3 backdrop-blur">
                                        <div className="text-sm text-gray-700">
                                            <span className="font-semibold text-gray-900">{selected.length}</span> of {importable.length} selected
                                            {selected.length > 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setSelected([])}
                                                    className="ml-3 text-xs font-medium text-gray-500 underline hover:text-gray-700"
                                                >
                                                    Clear
                                                </button>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="hidden text-xs text-gray-500 sm:inline">
                                                Existing portal candidates are updated, never duplicated.
                                            </span>
                                            <button
                                                type="button"
                                                disabled={selected.length === 0 || importing}
                                                onClick={() => setConfirm({ kind: "import" })}
                                                className="rounded-lg bg-red-700 px-5 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                                            >
                                                {importing ? "Importing…" : "Import selected"}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </section>
                ) : null}

            </div>

            {/* ---------------- Confirm dialogs ---------------- */}
            {confirm?.kind === "link" && client ? (
                <Modal title="Link Recruitly company" onClose={() => setConfirm(null)} busy={savingLink}>
                    <p className="text-sm text-gray-700">
                        Link <span className="font-semibold">{client.companyName}</span> to the Recruitly company{" "}
                        <span className="font-semibold">{pendingCompany?.name}</span>?
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                        <li>Staff will see this company&apos;s Recruitly jobs when importing for this client.</li>
                        <li>Saved in the portal only; nothing changes in Recruitly.</li>
                        <li>You can change or remove the link later.</li>
                    </ul>
                    <div className="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={savingLink}
                            onClick={() => setConfirm(null)}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={savingLink}
                            onClick={() => saveLink(confirm.companyId)}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                        >
                            {savingLink ? "Linking…" : "Link company"}
                        </button>
                    </div>
                </Modal>
            ) : null}

            {confirm?.kind === "import" && job ? (
                <Modal title="Import candidates" onClose={() => setConfirm(null)} busy={importing}>
                    <p className="text-sm text-gray-700">
                        Import <span className="font-semibold">{selected.length}</span>{" "}
                        {selected.length === 1 ? "candidate" : "candidates"} from{" "}
                        <span className="font-semibold">
                            {job.reference} – {job.title}
                        </span>{" "}
                        into the portal?
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                        <li>Candidates already in the portal are updated, never added twice.</li>
                        <li>If a match is uncertain, the candidate is not imported and is listed for review.</li>
                        <li>Nothing changes in Recruitly.</li>
                    </ul>
                    <div className="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={importing}
                            onClick={() => setConfirm(null)}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={importing}
                            onClick={runImport}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                        >
                            {importing ? "Importing…" : "Import"}
                        </button>
                    </div>
                </Modal>
            ) : null}

            {confirm?.kind === "result" ? (
                <Modal
                    title={importError ? "Import failed" : "Import result"}
                    wide
                    onClose={() => {
                        setConfirm(null);
                        setImportResult(null);
                        setImportError("");
                    }}
                >
                    {importError ? <ErrorBox message={importError} /> : null}
                    {importResult ? <ImportResult result={importResult} /> : null}
                    <div className="mt-5 flex justify-end">
                        <button
                            type="button"
                            autoFocus
                            onClick={() => {
                                setConfirm(null);
                                setImportResult(null);
                                setImportError("");
                            }}
                            className="rounded-lg bg-red-700 px-5 py-2 text-sm font-medium text-white hover:bg-red-800"
                        >
                            Close
                        </button>
                    </div>
                </Modal>
            ) : null}

            {confirm?.kind === "unlink" && client ? (
                <Modal title="Remove link" onClose={() => setConfirm(null)} busy={savingLink}>
                    <p className="text-sm text-gray-700">
                        Remove the link between <span className="font-semibold">{client.companyName}</span> and{" "}
                        <span className="font-semibold">{linkedCompany?.name || "its Recruitly company"}</span>?
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                        <li>Candidates and jobs already in the portal are not changed.</li>
                        <li>Nothing changes in Recruitly.</li>
                        <li>You can link the client again at any time.</li>
                    </ul>
                    <div className="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={savingLink}
                            onClick={() => setConfirm(null)}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Keep link
                        </button>
                        <button
                            type="button"
                            disabled={savingLink}
                            onClick={() => saveLink(null)}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                        >
                            {savingLink ? "Removing…" : "Remove link"}
                        </button>
                    </div>
                </Modal>
            ) : null}
        </>
    );
}
