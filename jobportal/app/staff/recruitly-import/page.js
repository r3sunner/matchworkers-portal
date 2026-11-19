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

// Candidates sent per import request (see runImport): 3 at a time, so their
// Recruitly reads and file copies run in parallel and staff see "Importing 4–6
// of 10…". Only the first request re-reads the job's pipeline.
const IMPORT_BATCH = 3;
// Above this, the dialog warns that a large import takes a while (30 calls/min).
const LARGE_IMPORT = 10;

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

// Import result: what happened to the candidate's Full Candidate Profile (CV) and photo.
const FILE_STATUS = {
    added: "added",
    updated: "updated (newer file in Recruitly)",
    unchanged: "unchanged",
    missing: "none in Recruitly",
    failed: "could not be copied",
};

const OUTCOME = {
    created: { label: "Created", style: "bg-green-50 text-green-700 ring-green-200" },
    updated: { label: "Updated", style: "bg-sky-50 text-sky-700 ring-sky-200" },
    review: { label: "Needs review", style: "bg-amber-50 text-amber-800 ring-amber-200" },
    skipped: { label: "Skipped", style: "bg-gray-100 text-gray-600 ring-gray-200" },
    failed: { label: "Failed", style: "bg-red-50 text-red-700 ring-red-200" },
    removed: { label: "Taken off job", style: "bg-gray-100 text-gray-700 ring-gray-300" },
};

// Name-only review row: staff decide. "Same person – link" updates and links
// the chosen portal candidate; "Import as new candidate" creates a new one
// (a different person with a similar name). Each asks once more before saving.
function ReviewActions({ row, busy, onResolve }) {
    const [asking, setAsking] = useState(null); // { kind: "link", match } | { kind: "new" }
    const matches = row.possibleMatches || [];

    if (asking) {
        const link = asking.kind === "link";
        return (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-gray-700">
                {link ? (
                    <p>
                        Link <span className="font-semibold">{row.name}</span> to the portal candidate{" "}
                        <span className="font-semibold">
                            {asking.match.fullName}
                            {asking.match.reference ? ` (${asking.match.reference})` : ""}
                        </span>
                        ? That record is updated from Recruitly and gets the CA number; its old reference is kept. Nothing new is
                        created.
                    </p>
                ) : (
                    <p>
                        Only if <span className="font-semibold">{row.name}</span> is a{" "}
                        <span className="font-semibold">different person</span> from the portal candidate
                        {matches.length === 1 ? "" : "s"} above. A new candidate is created.
                    </p>
                )}
                <div className="mt-2 flex gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAsking(null)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => onResolve(link ? { linkTo: asking.match.documentId } : { asNew: true })}
                        className="rounded-lg bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800 disabled:opacity-60"
                    >
                        {busy ? "Importing…" : link ? "Yes, same person – link" : "Yes, different person – create"}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {matches.map((m) => (
                <button
                    key={m.documentId}
                    type="button"
                    disabled={busy}
                    onClick={() => setAsking({ kind: "link", match: m })}
                    className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-50 disabled:opacity-50"
                >
                    Same person – link{matches.length > 1 ? ` to ${m.fullName}` : ""}
                </button>
            ))}
            <button
                type="button"
                disabled={busy}
                onClick={() => setAsking({ kind: "new" })}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
                Import as new candidate
            </button>
        </div>
    );
}

function ImportResult({ result, onResolve, resolvingId }) {
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
                                    {r.files ? (
                                        <div className="text-gray-600">
                                            CV: {FILE_STATUS[r.files.cv] || r.files.cv} · Photo:{" "}
                                            {r.files.photo === "missing" ? "none in Recruitly (placeholder shown)" : FILE_STATUS[r.files.photo] || r.files.photo}
                                        </div>
                                    ) : null}
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
                                    {r.outcome === "review" && r.nameOnly && onResolve ? (
                                        <ReviewActions
                                            row={r}
                                            busy={resolvingId === r.candidateId}
                                            onResolve={(choice) => onResolve(r.candidateId, choice)}
                                        />
                                    ) : null}
                                    {r.resolveError ? <div className="mt-1 text-red-700">{r.resolveError}</div> : null}
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

// Join step: which portal job this Recruitly job belongs to. Shown until the
// Recruitly job is linked; after the first import it goes there automatically.
const PICKER_SHORT_LIST = 6;
// A portal job whose title is this close (0..1), and clearly closer than the next
// one, is ticked in advance; staff still click Link and confirm.
const PRESELECT_SIMILARITY = 0.8;

// The option to tick in advance, or "" when there is no clear best match.
function preselectFor(options) {
    const [best, next] = options || [];
    if (!best || best.similarity < PRESELECT_SIMILARITY) return "";
    if (next && next.similarity >= best.similarity) return "";
    return best.documentId;
}

function PortalJobPicker({ state, choice, onChoose, onRetry, onLink, linking, linkError, changing, onChange, onCancelChange, onUnlink }) {
    const [showAll, setShowAll] = useState(false);
    const [q, setQ] = useState("");

    if (state.loading) return <Spinner label="Loading this client's portal jobs…" />;
    if (state.error) return <ErrorBox message={state.error} onRetry={onRetry} />;
    if (state.linked && !changing) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <span>
                    Imports go to portal job{" "}
                    <span className="font-semibold">
                        {state.linked.referenceNo ? `${state.linked.referenceNo} – ` : ""}
                        {state.linked.title}
                    </span>
                    .
                </span>
                {state.linked.locked ? (
                    <span className="text-xs text-green-900/70">
                        Candidates have been imported to this job, so the link can&apos;t be changed here. Ask your
                        administrator if it is wrong.
                    </span>
                ) : (
                    <span className="flex items-center gap-4">
                        <button type="button" onClick={onChange} className="text-sm font-medium text-gray-700 hover:underline">
                            Change
                        </button>
                        <button type="button" onClick={onUnlink} className="text-sm font-medium text-red-700 hover:underline">
                            Remove link
                        </button>
                    </span>
                )}
            </div>
        );
    }

    const options = state.options || [];
    if (!state.linked && options.length === 0) {
        return (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                This client has no portal job that is not linked to Recruitly, so a{" "}
                <span className="font-semibold">new portal job</span> is created automatically with the first import. Later
                imports of this Recruitly job go there too.
            </div>
        );
    }
    const preselected = preselectFor(options);
    const needle = q.trim().toLowerCase();
    const filtered = needle
        ? options.filter((o) => `${o.referenceNo} ${o.title}`.toLowerCase().includes(needle))
        : options;
    const shown = showAll || needle ? filtered : filtered.slice(0, PICKER_SHORT_LIST);

    const radio = (value, content, key) => (
        <label
            key={key}
            className={cls(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm",
                choice === value ? "border-red-300 bg-red-50" : "border-gray-200 bg-white hover:bg-gray-50"
            )}
        >
            <input
                type="radio"
                name="portal-job"
                className="mt-1"
                checked={choice === value}
                onChange={() => onChoose(value)}
            />
            <span className="min-w-0 flex-1">{content}</span>
        </label>
    );

    return (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Which portal job is this?</h3>
            {changing && state.linked ? (
                <p className="mt-1 text-xs text-gray-600">
                    Now linked to{" "}
                    <span className="font-semibold">
                        {state.linked.referenceNo ? `${state.linked.referenceNo} – ` : ""}
                        {state.linked.title}
                    </span>
                    . Choose another portal job for future imports. Candidates already imported stay on the current job.
                </p>
            ) : null}
            <p className={cls("mt-1 text-xs text-gray-600", changing && state.linked ? "hidden" : "")}>
                This Recruitly job is not linked to a portal job yet. If the job already exists in the portal, choose it:
                everything on it is kept and imported candidates are added to it. If not, create a new one. This is done
                once; later imports go there automatically. The candidates are shown after this step.
            </p>

            {options.length > PICKER_SHORT_LIST ? (
                <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search this client's portal jobs…"
                    className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
            ) : null}

            <div className="mt-3 space-y-2">
                {shown.map((o) =>
                    radio(
                        o.documentId,
                        <>
                            <span className="font-medium text-gray-900">{o.title || "(no title)"}</span>
                            {o.documentId === preselected ? (
                                <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                                    best match
                                </span>
                            ) : o.similarity >= 0.5 ? (
                                <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                    similar title
                                </span>
                            ) : null}
                            <span className="block text-xs text-gray-500">
                                {[o.referenceNo, o.statusList, `${o.candidateCount} ${o.candidateCount === 1 ? "candidate" : "candidates"}`]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                        </>,
                        o.documentId
                    )
                )}
                {!showAll && !needle && filtered.length > PICKER_SHORT_LIST ? (
                    <button
                        type="button"
                        onClick={() => setShowAll(true)}
                        className="text-xs font-medium text-gray-600 underline hover:text-gray-800"
                    >
                        Show all {filtered.length} portal jobs of this client
                    </button>
                ) : null}
                {needle && filtered.length === 0 ? <p className="text-xs text-gray-500">No portal job found.</p> : null}
                {options.length === 0 ? (
                    <p className="text-xs text-gray-600">This client has no portal jobs that are not linked to Recruitly.</p>
                ) : null}
                {radio(
                    "new",
                    <>
                        <span className="font-medium text-gray-900">Create a new portal job</span>
                        <span className="block text-xs text-gray-500">The job is not in the portal yet.</span>
                    </>,
                    "new"
                )}
            </div>

            <ErrorBox message={linkError} />
            <div className="mt-3 flex justify-end gap-2">
                {changing && state.linked ? (
                    <button
                        type="button"
                        disabled={linking}
                        onClick={onCancelChange}
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                ) : null}
                <button
                    type="button"
                    disabled={!choice || linking}
                    onClick={onLink}
                    className="rounded-lg bg-red-700 px-5 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                >
                    {choice === "new" ? "Create portal job" : "Link to this portal job"}
                </button>
            </div>
        </div>
    );
}

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
    const [importProgress, setImportProgress] = useState(null); // { done, total }
    const [importResult, setImportResult] = useState(null);
    const [importError, setImportError] = useState("");
    // Join step: { loading, error, linked, options } and staff's choice ("" | "new" | portal job documentId).
    const [portalJobs, setPortalJobs] = useState({ loading: false, error: "", linked: null, options: [] });
    const [portalChoice, setPortalChoice] = useState("");
    const portalJobsRequest = useRef(0);
    const [linkingJob, setLinkingJob] = useState(false);
    const [jobLinkError, setJobLinkError] = useState("");
    const [changingJob, setChangingJob] = useState(false);
    const [resolvingId, setResolvingId] = useState(""); // review row being linked / imported as new

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
        portalJobsRequest.current += 1;
        setPortalJobs({ loading: false, error: "", linked: null, options: [] });
        setPortalChoice("");
        setJobLinkError("");
        setChangingJob(false);
    }

    async function linkPortalJob() {
        if (!jobId || !portalChoice) return;
        setLinkingJob(true);
        setJobLinkError("");
        try {
            const json = await fetchJson(`/api/recruitly/jobs/${encodeURIComponent(jobId)}/portal-job/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    portalChoice === "new"
                        ? { clientDocumentId, createNew: true, replace: changingJob }
                        : { clientDocumentId, portalJobDocumentId: portalChoice, replace: changingJob }
                ),
            });
            setPortalChoice("");
            setChangingJob(false);
            setConfirm(null);
            resetPickerAfterSave();
            loadPortalJobs(jobId);
        } catch (error) {
            setJobLinkError(error.message);
            setConfirm(null);
        } finally {
            setLinkingJob(false);
        }
    }

    // Candidate list and selection belong to the old link; start them fresh.
    function resetPickerAfterSave() {
        setSelected([]);
        setImportResult(null);
        setImportError("");
    }

    async function unlinkPortalJob() {
        if (!jobId) return;
        setLinkingJob(true);
        setJobLinkError("");
        try {
            const json = await fetchJson(`/api/recruitly/jobs/${encodeURIComponent(jobId)}/portal-job/`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientDocumentId }),
            });
            portalJobsRequest.current += 1;
            setPortalJobs({ loading: false, error: "", linked: null, options: json.options || [] });
            setPortalChoice(preselectFor(json.options || []));
            setChangingJob(false);
            resetPickerAfterSave();
            setConfirm(null);
        } catch (error) {
            setJobLinkError(error.message);
            setConfirm(null);
        } finally {
            setLinkingJob(false);
        }
    }

    async function loadPortalJobs(nextJobId) {
        const request = ++portalJobsRequest.current;
        if (!nextJobId || !clientDocumentId) return;
        // A refresh of the same job keeps showing the current link while it loads.
        setPortalJobs((prev) =>
            prev.linked && nextJobId === jobId
                ? { ...prev, error: "" }
                : { loading: true, error: "", linked: null, options: [] }
        );
        try {
            const json = await fetchJson(
                `/api/recruitly/jobs/${encodeURIComponent(nextJobId)}/portal-job/?clientDocumentId=${encodeURIComponent(clientDocumentId)}`
            );
            if (request !== portalJobsRequest.current) return;
            setPortalJobs({ loading: false, error: "", linked: json.linked || null, options: json.options || [] });
            // Not linked: keep staff's tick on a refresh, else tick a clear best match.
            setPortalChoice((prev) => (json.linked ? "" : prev || preselectFor(json.options || [])));
        } catch (error) {
            if (request === portalJobsRequest.current) setPortalJobs({ loading: false, error: error.message, linked: null, options: [] });
        }
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
        loadPortalJobs(nextJobId);
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
        if (!portalJobs.linked && !autoCreateJob) return;

        setImporting(true);
        setImportError("");
        setImportResult(null);
        setImportProgress({ done: 0, total: candidateIds.length });

        // Sent IMPORT_BATCH at a time: Recruitly allows 30 calls a minute, so a big
        // job takes a while; small requests keep each one short and show progress.
        const results = new Map();
        let job = null;
        let calls = 0;
        try {
            for (let i = 0; i < candidateIds.length; i += IMPORT_BATCH) {
                const json = await fetchJson("/api/recruitly/import/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jobId,
                        clientDocumentId,
                        candidateIds: candidateIds.slice(i, i + IMPORT_BATCH),
                        freshPipeline: i === 0,
                    }),
                });
                if (json.job) job = job ? { ...json.job, created: job.created || json.job.created } : json.job;
                calls += Number(json.recruitlyCalls) || 0;
                for (const r of json.results || []) results.set(`${r.outcome === "removed" ? "removed:" : ""}${r.candidateId}`, r);
                setImportProgress({ done: Math.min(i + IMPORT_BATCH, candidateIds.length), total: candidateIds.length });
            }
            setSelected([]);
        } catch (error) {
            setImportError(
                results.size ? `${error.message} The candidates listed below were already imported.` : error.message
            );
        } finally {
            if (results.size) {
                const rows = [...results.values()];
                const count = (o) => rows.filter((r) => r.outcome === o).length;
                setImportResult({
                    job,
                    results: rows,
                    recruitlyCalls: calls,
                    summary: {
                        created: count("created"),
                        updated: count("updated"),
                        removed: count("removed"),
                        review: count("review"),
                        skipped: count("skipped"),
                        failed: count("failed"),
                    },
                });
            }
            setImporting(false);
            setImportProgress(null);
            setConfirm({ kind: "result" });
            // Imported candidates lock the portal job link (no Change / Remove link).
            if (results.size) loadPortalJobs(jobId);
        }
    }

    // Review row → "Same person – link" ({ linkTo: portal documentId }) or "Import as
    // new candidate" ({ asNew: true }): imports that one candidate, then replaces
    // its row in the result.
    async function resolveReview(candidateId, choice) {
        if (!jobId || !candidateId) return;
        setResolvingId(candidateId);
        const patch = (row) =>
            setImportResult((prev) => {
                if (!prev) return prev;
                const results = prev.results.map((r) => (r.candidateId === candidateId ? row(r) : r));
                const count = (o) => results.filter((r) => r.outcome === o).length;
                return {
                    ...prev,
                    results,
                    summary: {
                        created: count("created"),
                        updated: count("updated"),
                        removed: count("removed"),
                        review: count("review"),
                        skipped: count("skipped"),
                        failed: count("failed"),
                    },
                };
            });
        try {
            const json = await fetchJson("/api/recruitly/import/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobId,
                    clientDocumentId,
                    candidateIds: [candidateId],
                    ...(choice?.linkTo ? { linkTo: { [candidateId]: choice.linkTo } } : { newCandidateIds: [candidateId] }),
                    freshPipeline: false,
                }),
            });
            const row = (json.results || []).find((r) => r.candidateId === candidateId);
            if (row) patch(() => row);
        } catch (error) {
            patch((r) => ({ ...r, resolveError: error.message }));
        } finally {
            setResolvingId("");
        }
    }

    const isLinked = Boolean(client?.recruitlyCompanyId);
    const chosenPortalJob = portalJobs.options.find((o) => o.documentId === portalChoice) || null;
    // Nothing to choose from: the import creates the portal job (server checks it too).
    const autoCreateJob =
        Boolean(job) && !portalJobs.loading && !portalJobs.error && !portalJobs.linked && portalJobs.options.length === 0;
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

                {/* ---------------- Portal job (step 4) ---------------- */}
                {job ? (
                    <section className="rounded-2xl border border-gray-200 bg-white p-5">
                        <div className="mb-3">
                            <FieldLabel step={4} done={Boolean(portalJobs.linked)}>
                                Portal job
                            </FieldLabel>
                        </div>
                        <PortalJobPicker
                            key={jobId}
                            state={portalJobs}
                            choice={portalChoice}
                            onChoose={(value) => {
                                setPortalChoice(value);
                                setJobLinkError("");
                            }}
                            onRetry={() => loadPortalJobs(jobId)}
                            onLink={() => setConfirm({ kind: "jobLink" })}
                            linking={linkingJob}
                            linkError={jobLinkError}
                            changing={changingJob}
                            onChange={() => {
                                setChangingJob(true);
                                setPortalChoice("");
                                setJobLinkError("");
                            }}
                            onCancelChange={() => {
                                setChangingJob(false);
                                setPortalChoice("");
                                setJobLinkError("");
                            }}
                            onUnlink={() => setConfirm({ kind: "jobUnlink" })}
                        />
                    </section>
                ) : null}

                {/* ---------------- Candidates (after the portal job is linked) ---------------- */}
                {job && (portalJobs.linked || autoCreateJob) && !changingJob ? (
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

            {confirm?.kind === "jobUnlink" && job && portalJobs.linked ? (
                <Modal title="Remove portal job link" onClose={() => setConfirm(null)} busy={linkingJob}>
                    <p className="text-sm text-gray-700">
                        Remove the link between the Recruitly job{" "}
                        <span className="font-semibold">
                            {job.reference} – {job.title}
                        </span>{" "}
                        and the portal job{" "}
                        <span className="font-semibold">
                            {portalJobs.linked.referenceNo ? `${portalJobs.linked.referenceNo} – ` : ""}
                            {portalJobs.linked.title}
                        </span>
                        ?
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                        <li>The portal job and the candidates already imported onto it stay as they are.</li>
                        <li>Before the next import of this Recruitly job you choose the portal job again.</li>
                        <li>Saved in the portal only; nothing changes in Recruitly.</li>
                    </ul>
                    <div className="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={linkingJob}
                            onClick={() => setConfirm(null)}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={linkingJob}
                            onClick={unlinkPortalJob}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                        >
                            {linkingJob ? "Removing…" : "Remove link"}
                        </button>
                    </div>
                </Modal>
            ) : null}

            {confirm?.kind === "jobLink" && job ? (
                <Modal
                    title={portalChoice === "new" ? "Create portal job" : "Link portal job"}
                    onClose={() => setConfirm(null)}
                    busy={linkingJob}
                >
                    <p className="text-sm text-gray-700">
                        {portalChoice === "new" ? "Create a new portal job for " : "Link "}
                        <span className="font-semibold">{client?.companyName}</span>
                        {portalChoice === "new" ? " from the Recruitly job " : "'s portal job "}
                        {portalChoice === "new" ? (
                            <span className="font-semibold">
                                {job.reference} – {job.title}
                            </span>
                        ) : (
                            <>
                                <span className="font-semibold">
                                    {chosenPortalJob?.referenceNo ? `${chosenPortalJob.referenceNo} – ` : ""}
                                    {chosenPortalJob?.title}
                                </span>{" "}
                                to the Recruitly job{" "}
                                <span className="font-semibold">
                                    {job.reference} – {job.title}
                                </span>
                            </>
                        )}
                        ?
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                        {portalChoice === "new" ? (
                            <li>The new job gets the Recruitly title and reference; no candidates yet.</li>
                        ) : (
                            <li>Everything on the portal job stays (title, candidates, offer letters, chats).</li>
                        )}
                        {changingJob && portalJobs.linked ? (
                            <li>
                                {portalJobs.linked.referenceNo || portalJobs.linked.title} is no longer linked. Candidates
                                already imported stay there; they are not moved.
                            </li>
                        ) : null}
                        <li>Every import of this Recruitly job will go to this portal job.</li>
                        <li>Saved in the portal only; nothing changes in Recruitly.</li>
                    </ul>
                    <div className="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={linkingJob}
                            onClick={() => setConfirm(null)}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={linkingJob}
                            onClick={linkPortalJob}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                        >
                            {linkingJob ? "Saving…" : portalChoice === "new" ? "Create portal job" : "Link portal job"}
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
                    {portalJobs.linked ? (
                        <p className="mt-2 text-sm text-gray-700">
                            Portal job:{" "}
                            <span className="font-semibold">
                                {portalJobs.linked.referenceNo ? `${portalJobs.linked.referenceNo} – ` : ""}
                                {portalJobs.linked.title}
                            </span>
                        </p>
                    ) : autoCreateJob ? (
                        <p className="mt-2 text-sm text-gray-700">
                            Portal job: <span className="font-semibold">a new portal job for {client?.companyName}</span>
                        </p>
                    ) : null}
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                        <li>Candidates already in the portal are updated, never added twice.</li>
                        <li>If a match is uncertain, the candidate is not imported and is listed for review.</li>
                        <li>Nothing changes in Recruitly.</li>
                    </ul>
                    {selected.length > LARGE_IMPORT ? (
                        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                            Recruitly allows 30 requests a minute, so a large import takes a little while (about 2 minutes for 50
                            candidates). Please keep this page open until it finishes.
                        </p>
                    ) : null}
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
                            {importing
                                ? importProgress
                                    ? importProgress.done + 1 >= Math.min(importProgress.done + IMPORT_BATCH, importProgress.total)
                                        ? `Importing ${importProgress.total} of ${importProgress.total}…`
                                        : `Importing ${importProgress.done + 1}–${Math.min(importProgress.done + IMPORT_BATCH, importProgress.total)} of ${importProgress.total}…`
                                    : "Importing…"
                                : "Import"}
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
                    {importResult ? (
                        <ImportResult result={importResult} onResolve={resolveReview} resolvingId={resolvingId} />
                    ) : null}
                    <div className="mt-5 flex justify-end gap-3">
                        {importError ? (
                            // Same candidates again (the selection is kept when an import fails);
                            // re-importing ones already done is safe: they come back "updated".
                            // Reopens the Import dialog so its progress ("Importing 1–3 of N…") shows.
                            <button
                                type="button"
                                onClick={() => {
                                    setImportResult(null);
                                    setImportError("");
                                    setConfirm({ kind: "import" });
                                    runImport();
                                }}
                                className="rounded-lg border border-red-700 px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                            >
                                Try again
                            </button>
                        ) : null}
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
