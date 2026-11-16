"use client";

// Staff review screen for linking existing portal candidates to Recruitly (R4).
// Agreed with Matchworkers: nothing is linked automatically. The portal
// suggests a match (same name on the same job in Recruitly) and staff confirm
// or reject each candidate. Candidates with no suggestion can be linked by
// typing their CA number. Confirmed candidates show their CA number as the
// reference; the old CAN_ reference is kept for search.

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipLoader } from "react-spinners";

function cls(...parts) {
    return parts.filter(Boolean).join(" ");
}

async function fetchJson(url, options) {
    const res = await fetch(url, { cache: "no-store", ...options });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error || `Request failed (${res.status}).`);
    return json;
}

const postJson = (url, body) =>
    fetchJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Jobs checked per request when building suggestions (1 Recruitly call each).
const JOB_BATCH = 3;

const TABS = [
    { key: "pending", label: "To review" },
    { key: "no_suggestion", label: "No suggestion" },
    { key: "confirmed", label: "Confirmed" },
    { key: "rejected", label: "Rejected" },
];

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

function Modal({ title, children, onClose, busy }) {
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
            <div className="relative w-full bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <div className="text-lg sm:text-xl text-red-700">{title}</div>
                <div className="mt-3">{children}</div>
            </div>
        </div>
    );
}

function formatDate(value) {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const btnPrimary =
    "rounded-lg bg-red-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500";
const btnSecondary = "rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50";

export default function RecruitlyMatchingPage() {
    const [tab, setTab] = useState("pending");
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState("");

    const [building, setBuilding] = useState(false);
    const [buildProgress, setBuildProgress] = useState(null);
    const [buildSummary, setBuildSummary] = useState(null);
    const [buildError, setBuildError] = useState("");

    // Chosen suggestion per row (when there are several), keyed by matchDocumentId.
    const [choice, setChoice] = useState({});
    // { kind: "confirm" | "reject" | "undo" | "ca", row, suggestion?, lookup? }
    const [dialog, setDialog] = useState(null);
    const [saving, setSaving] = useState(false);
    const [dialogError, setDialogError] = useState("");
    const [caInput, setCaInput] = useState("");
    const [notice, setNotice] = useState("");

    // Only the newest request may update the list (fast tab / search changes).
    const listRequest = useRef(0);
    const load = useCallback(async () => {
        const request = ++listRequest.current;
        setLoading(true);
        setListError("");
        try {
            const params = new URLSearchParams({ status: tab, page: String(page) });
            if (query) params.set("q", query);
            const json = await fetchJson(`/api/recruitly/matching/list/?${params}`);
            if (request === listRequest.current) setList(json);
        } catch (error) {
            if (request === listRequest.current) setListError(error.message);
        } finally {
            if (request === listRequest.current) setLoading(false);
        }
    }, [tab, page, query]);

    useEffect(() => {
        const timer = setTimeout(load, 0);
        return () => clearTimeout(timer);
    }, [load]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            setQuery(q.trim());
        }, 300);
        return () => clearTimeout(timer);
    }, [q]);

    async function buildSuggestions() {
        setBuilding(true);
        setBuildError("");
        setBuildSummary(null);
        setNotice("");
        setBuildProgress({ phase: "start" });
        let calls = 0;
        let suggested = 0;
        const failed = [];
        try {
            const start = await postJson("/api/recruitly/matching/build/", { step: "start" });
            calls += Number(start.recruitlyCalls) || 0;
            const jobs = start.jobs || [];
            for (let i = 0; i < jobs.length; i += JOB_BATCH) {
                setBuildProgress({ phase: "jobs", done: i, total: jobs.length });
                const res = await postJson("/api/recruitly/matching/build/", { step: "jobs", jobs: jobs.slice(i, i + JOB_BATCH) });
                calls += Number(res.recruitlyCalls) || 0;
                suggested += Number(res.suggested) || 0;
                failed.push(...(res.failed || []));
            }
            setBuildSummary({
                candidates: start.candidates,
                jobsChecked: jobs.length,
                jobsNotInRecruitly: start.jobsNotInRecruitly,
                linkedElsewhere: start.linkedElsewhere,
                failed,
                calls,
            });
            setTab("pending");
            setPage(1);
        } catch (error) {
            setBuildError(error.message);
        } finally {
            setBuilding(false);
            setBuildProgress(null);
            load();
        }
    }

    function openDialog(next) {
        setDialogError("");
        setCaInput("");
        setDialog(next);
    }

    async function lookupCa() {
        setSaving(true);
        setDialogError("");
        try {
            const res = await postJson("/api/recruitly/matching/lookup/", { caNumber: caInput });
            setDialog((d) => ({ ...d, lookup: res.match }));
        } catch (error) {
            setDialogError(error.message);
        } finally {
            setSaving(false);
        }
    }

    async function decide(action, recruitlyId) {
        setSaving(true);
        setDialogError("");
        try {
            const res = await postJson("/api/recruitly/matching/decide/", {
                matchDocumentId: dialog.row.matchDocumentId,
                action,
                recruitlyId,
            });
            const name = dialog.row.candidate.fullName;
            setNotice(
                action === "confirm"
                    ? `${name} is now linked to Recruitly and shows ${res.caNumber}${res.previousReference ? ` (old reference ${res.previousReference} kept for search)` : ""}.`
                    : action === "reject"
                      ? `${name}: marked as not in Recruitly; keeps ${dialog.row.candidate.reference || "its reference"}.`
                      : `${name} is back on the list.`
            );
            setDialog(null);
            load();
        } catch (error) {
            setDialogError(error.message);
        } finally {
            setSaving(false);
        }
    }

    const counts = list?.counts || {};
    const rows = list?.rows || [];
    const nothingBuilt = list && Object.values(counts).every((n) => !n);

    return (
        <>
            <div className="topHeading">Match existing candidates</div>

            <div className="w-full mx-auto p-4 space-y-5">
                <p className="text-sm text-gray-600">
                    Candidates who were in the portal before the Recruitly import are linked to their Recruitly record here. Nothing is
                    linked automatically: check each suggestion, then confirm or reject it. A confirmed candidate shows their CA number;
                    the old reference stays searchable.
                </p>

                {/* ---------------- Suggestions ---------------- */}
                <section className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold text-gray-900">Suggestions</h2>
                            <p className="mt-1 text-sm text-gray-600">
                                Looks at each portal job in Recruitly and suggests anyone with the same name on the same job. Uses one
                                Recruitly request per job, so it takes a few minutes. Decisions already made are kept.
                            </p>
                        </div>
                        <button type="button" onClick={buildSuggestions} disabled={building} className={btnPrimary}>
                            {building
                                ? buildProgress?.phase === "jobs"
                                    ? `Checking jobs ${Math.min(buildProgress.done + JOB_BATCH, buildProgress.total)} of ${buildProgress.total}…`
                                    : "Preparing the list…"
                                : nothingBuilt
                                  ? "Build suggestions"
                                  : "Rebuild suggestions"}
                        </button>
                    </div>
                    {building ? (
                        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                            Recruitly allows 30 requests a minute, so this takes a little while. Please keep this page open until it finishes.
                        </p>
                    ) : null}
                    <div className="mt-3 space-y-2">
                        <ErrorBox message={buildError} onRetry={buildSuggestions} />
                        {buildSummary ? (
                            <div className="rounded-xl border border-green-200 bg-green-50/60 px-4 py-3 text-sm text-gray-800">
                                Checked {buildSummary.jobsChecked} {buildSummary.jobsChecked === 1 ? "job" : "jobs"} for {buildSummary.candidates}{" "}
                                unlinked {buildSummary.candidates === 1 ? "candidate" : "candidates"}.
                                {buildSummary.jobsNotInRecruitly
                                    ? ` ${buildSummary.jobsNotInRecruitly} portal ${buildSummary.jobsNotInRecruitly === 1 ? "job was" : "jobs were"} not found in Recruitly by reference.`
                                    : ""}
                                {buildSummary.linkedElsewhere ? ` ${buildSummary.linkedElsewhere} already linked by an import.` : ""}
                                {buildSummary.failed.length ? ` Could not read: ${buildSummary.failed.join(", ")} (run again later).` : ""}
                            </div>
                        ) : null}
                    </div>
                </section>

                {/* ---------------- Review list ---------------- */}
                <section className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2" role="tablist">
                            {TABS.map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === t.key}
                                    onClick={() => {
                                        setTab(t.key);
                                        setPage(1);
                                        setNotice("");
                                    }}
                                    className={cls(
                                        "rounded-full border px-3.5 py-1.5 text-sm",
                                        tab === t.key ? "border-red-700 bg-red-700 text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                                    )}
                                >
                                    {t.label} <span className={tab === t.key ? "text-white/80" : "text-gray-400"}>{counts[t.key] ?? 0}</span>
                                </button>
                            ))}
                        </div>
                        <input
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search name or reference"
                            className="w-full sm:w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-700 focus:outline-none"
                        />
                    </div>

                    {notice ? <div className="mt-4 rounded-xl border border-green-200 bg-green-50/60 px-4 py-3 text-sm text-gray-800">{notice}</div> : null}

                    <div className="mt-4">
                        <ErrorBox message={listError} onRetry={load} />
                        {loading && !list ? <Spinner label="Loading the review list…" /> : null}

                        {list && nothingBuilt ? (
                            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                                No review list yet. Click &quot;Build suggestions&quot; above to start.
                            </p>
                        ) : null}

                        {list && !nothingBuilt && rows.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                                {query ? "No candidate matches your search." : "Nothing here."}
                            </p>
                        ) : null}

                        {rows.length ? (
                            <div className={cls("overflow-x-auto rounded-xl border border-gray-200", loading && "opacity-60")}>
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold">Portal candidate</th>
                                            <th className="px-4 py-3 font-semibold">{tab === "confirmed" ? "Linked to" : "Suggested Recruitly match"}</th>
                                            <th className="px-4 py-3 font-semibold text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {rows.map((row) => {
                                            const many = row.suggestions.length > 1;
                                            const chosen = many ? choice[row.matchDocumentId] : row.suggestions[0]?.recruitlyId;
                                            const chosenSuggestion = row.suggestions.find((s) => s.recruitlyId === chosen);
                                            return (
                                                <tr key={row.matchDocumentId} className="align-top">
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">{row.candidate.fullName || "(no name)"}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {row.candidate.reference || "no reference"}
                                                            {row.candidate.previousReference ? ` · was ${row.candidate.previousReference}` : ""}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {tab === "confirmed" ? (
                                                            <div className="text-gray-800">
                                                                {row.linkedCaNumber || "Recruitly"}
                                                                <div className="text-xs text-gray-500">
                                                                    {row.note || [row.decidedBy, formatDate(row.decidedAt)].filter(Boolean).join(" · ")}
                                                                </div>
                                                            </div>
                                                        ) : row.suggestions.length ? (
                                                            <div className="space-y-2">
                                                                {row.suggestions.map((s) => (
                                                                    <label key={s.recruitlyId} className={cls("flex gap-2", many && "cursor-pointer")}>
                                                                        {many && tab === "pending" ? (
                                                                            <input
                                                                                type="radio"
                                                                                name={`pick-${row.matchDocumentId}`}
                                                                                checked={chosen === s.recruitlyId}
                                                                                onChange={() => setChoice((c) => ({ ...c, [row.matchDocumentId]: s.recruitlyId }))}
                                                                                className="mt-1 accent-red-700"
                                                                            />
                                                                        ) : null}
                                                                        <span>
                                                                            <span className="text-gray-900">{s.name}</span>
                                                                            <span className="block text-xs text-gray-500">{s.reason}</span>
                                                                        </span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400">No suggestion</span>
                                                        )}
                                                        {tab === "rejected" ? (
                                                            <div className="mt-1 text-xs text-gray-500">
                                                                Rejected {[row.decidedBy, formatDate(row.decidedAt)].filter(Boolean).join(" · ")}
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            {tab === "pending" ? (
                                                                <button
                                                                    type="button"
                                                                    disabled={!chosen}
                                                                    title={!chosen ? "Choose one of the suggestions first" : undefined}
                                                                    onClick={() => openDialog({ kind: "confirm", row, suggestion: chosenSuggestion })}
                                                                    className={btnPrimary}
                                                                >
                                                                    Confirm
                                                                </button>
                                                            ) : null}
                                                            {tab === "pending" || tab === "no_suggestion" || tab === "rejected" ? (
                                                                <button type="button" onClick={() => openDialog({ kind: "ca", row })} className={btnSecondary}>
                                                                    Link by CA number
                                                                </button>
                                                            ) : null}
                                                            {tab === "pending" || tab === "no_suggestion" ? (
                                                                <button type="button" onClick={() => openDialog({ kind: "reject", row })} className={btnSecondary}>
                                                                    {tab === "pending" ? "Reject" : "Not in Recruitly"}
                                                                </button>
                                                            ) : null}
                                                            {(tab === "confirmed" && !row.note) || tab === "rejected" ? (
                                                                <button type="button" onClick={() => openDialog({ kind: "undo", row })} className={btnSecondary}>
                                                                    Undo
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}

                        {list && list.pageCount > 1 ? (
                            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                                <span>
                                    {list.total} candidates · page {list.page} of {list.pageCount}
                                </span>
                                <div className="flex gap-2">
                                    <button type="button" disabled={list.page <= 1 || loading} onClick={() => setPage(list.page - 1)} className={btnSecondary}>
                                        Previous
                                    </button>
                                    <button
                                        type="button"
                                        disabled={list.page >= list.pageCount || loading}
                                        onClick={() => setPage(list.page + 1)}
                                        className={btnSecondary}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>

            {/* ---------------- Dialogs ---------------- */}
            {dialog ? (
                <Modal
                    title={
                        dialog.kind === "confirm"
                            ? "Confirm match"
                            : dialog.kind === "ca"
                              ? "Link by CA number"
                              : dialog.kind === "reject"
                                ? "Not the same person"
                                : "Undo"
                    }
                    busy={saving}
                    onClose={() => setDialog(null)}
                >
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>
                            Portal candidate: <span className="font-semibold">{dialog.row.candidate.fullName}</span>{" "}
                            <span className="text-gray-500">({dialog.row.candidate.reference || "no reference"})</span>
                        </p>

                        {dialog.kind === "confirm" ? (
                            <>
                                <p>
                                    Link to Recruitly candidate <span className="font-semibold">{dialog.suggestion?.name}</span>?
                                    <span className="block text-xs text-gray-500">{dialog.suggestion?.reason}</span>
                                </p>
                                <ul className="list-disc space-y-1 pl-5 text-gray-600">
                                    <li>The portal will show their CA number as the reference.</li>
                                    {dialog.row.candidate.reference ? <li>{dialog.row.candidate.reference} is kept and can still be searched.</li> : null}
                                    <li>Nothing changes in Recruitly. You can undo this.</li>
                                </ul>
                            </>
                        ) : null}

                        {dialog.kind === "ca" ? (
                            <>
                                <div className="flex gap-2">
                                    <input
                                        autoFocus
                                        value={caInput}
                                        onChange={(e) => {
                                            setCaInput(e.target.value);
                                            setDialog((d) => ({ ...d, lookup: null }));
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && caInput.trim() && !saving) lookupCa();
                                        }}
                                        placeholder="e.g. CA-114061"
                                        className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-700 focus:outline-none"
                                    />
                                    <button type="button" disabled={!caInput.trim() || saving} onClick={lookupCa} className={btnSecondary}>
                                        Find
                                    </button>
                                </div>
                                {dialog.lookup ? (
                                    <div
                                        className={cls(
                                            "rounded-xl border px-4 py-3",
                                            dialog.lookup.alreadyLinked ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50/60"
                                        )}
                                    >
                                        <div className="font-medium text-gray-900">
                                            {dialog.lookup.caNumber} – {dialog.lookup.name || "(no name in Recruitly)"}
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            {dialog.lookup.alreadyLinked
                                                ? "Already linked to another portal candidate; it cannot be linked twice."
                                                : "Check the name is the same person before linking."}
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        ) : null}

                        {dialog.kind === "reject" ? (
                            <p className="text-gray-600">
                                {dialog.row.suggestions.length
                                    ? "The suggested Recruitly candidate is not this person."
                                    : "This candidate is not in Recruitly."}{" "}
                                The candidate stays as they are and keeps {dialog.row.candidate.reference || "their reference"}. You can still link
                                them later from the Rejected tab.
                            </p>
                        ) : null}

                        {dialog.kind === "undo" ? (
                            <p className="text-gray-600">
                                {dialog.row.status === "confirmed"
                                    ? `Remove the link to ${dialog.row.linkedCaNumber || "Recruitly"} and show ${dialog.row.candidate.previousReference || "the old reference"} again?`
                                    : "Put this candidate back on the list to review again?"}
                            </p>
                        ) : null}

                        <ErrorBox message={dialogError} />
                    </div>

                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" disabled={saving} onClick={() => setDialog(null)} className={btnSecondary}>
                            Cancel
                        </button>
                        {dialog.kind === "confirm" ? (
                            <button type="button" disabled={saving} onClick={() => decide("confirm", dialog.suggestion?.recruitlyId)} className={btnPrimary}>
                                {saving ? "Linking…" : "Confirm"}
                            </button>
                        ) : null}
                        {dialog.kind === "ca" ? (
                            <button
                                type="button"
                                disabled={saving || !dialog.lookup || dialog.lookup.alreadyLinked}
                                onClick={() => decide("confirm", dialog.lookup.recruitlyId)}
                                className={btnPrimary}
                            >
                                {saving ? "Working…" : "Link"}
                            </button>
                        ) : null}
                        {dialog.kind === "reject" ? (
                            <button type="button" disabled={saving} onClick={() => decide("reject")} className={btnPrimary}>
                                {saving ? "Saving…" : dialog.row.suggestions.length ? "Reject" : "Not in Recruitly"}
                            </button>
                        ) : null}
                        {dialog.kind === "undo" ? (
                            <button type="button" disabled={saving} onClick={() => decide("undo")} className={btnPrimary}>
                                {saving ? "Saving…" : "Undo"}
                            </button>
                        ) : null}
                    </div>
                </Modal>
            ) : null}
        </>
    );
}
