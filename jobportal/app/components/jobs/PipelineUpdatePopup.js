"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ClipLoader } from "react-spinners";
import PipelineStepper from "./PipelineStepper";
import useAuthClient from "@/lib/useAuthClient";
import {
    FaRegClock,
    FaRegCalendarAlt,
    FaHistory,
    FaEdit,
    FaFilePdf,
} from "react-icons/fa";

const PIPELINES = [
    { value: "Suggested Candidate", label: "Suggested Candidate" },
    // { value: "Shortlisted Candidate", label: "Shortlisted Candidate" },
    { value: "Requested Interview", label: "Requested Interview" },
    { value: "Hired Candidate", label: "Offered Candidate" },
    { value: "Immigration", label: "Immigration" },
    { value: "Placed", label: "Placed" },
];

function displayPipelineStage(value) {
    const stage = String(value || "").trim();
    if (stage === "Hired Candidate") return "Offered Candidate";
    return stage;
}

function canShowOfferLetter(status) {
    const s = String(status || "").toLowerCase();
    return s.includes("hired") || s.includes("immigration") || s.includes("placed");
}

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

function parseHistory(history) {
    try {
        const rows = history ? JSON.parse(history) : [];
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

function roleNameFromAuth(user, role) {
    return String(
        role?.name ||
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.type ||
        role ||
        ""
    ).toLowerCase();
}

function recordAuthorLabel(chat) {
    if (chat?.isSystemGenerated) {
        return (
            <>
                System{" "}
                {chat.personName ? (
                    <span className="text-sm font-normal text-gray-400">
                        - {chat.personName}
                    </span>
                ) : null}
            </>
        );
    }

    return chat.personName || "Staff";
}

function PipelineUpdatePopupContent({
    job,
    candidate,
    onClose,
    onUpdated,
}) {
    const chatScrollRef = useRef(null);

    const { user, role, authLoading } = useAuthClient();

    const roleName = roleNameFromAuth(user, role);
    const isStaff = roleName === "staff";
    const isClient = roleName === "client" || roleName === "clients";
    const canChangePipelineStatus = isStaff;
    const canManageOfferLetter = isStaff || isClient;
    const canAddRecord = isStaff || isClient;
    const canSeePrivateLogs = isStaff;
    const canEditLogs = isStaff;


    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [status, setStatus] = useState(candidate?.currentPipelineStatus || "");
    const [originalStatus, setOriginalStatus] = useState(
        candidate?.currentPipelineStatus || ""
    );

    const [offerLetter, setOfferLetter] = useState(null);
    const [offerFile, setOfferFile] = useState(null);

    const [chats, setChats] = useState([]);

    const [message, setMessage] = useState("");
    const [isPrivate, setIsPrivate] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [editingChat, setEditingChat] = useState(null);
    const [editMessage, setEditMessage] = useState("");
    const [editPrivate, setEditPrivate] = useState(false);

    const [historyPopup, setHistoryPopup] = useState(null);

    async function loadDetails() {
        setLoading(true);
        setErr("");

        try {
            const qs = new URLSearchParams({
                jobDocumentId: job.documentId,
                candidateDocumentId: candidate.documentId,
            });

            const json = await fetchJsonSafe(
                `/api/jobs/pipeline/details?${qs.toString()}`
            );

            const currentStatus =
                json?.currentPipelineStatus || candidate?.currentPipelineStatus || "";

            setStatus(currentStatus);
            setOriginalStatus(currentStatus);
            setOfferLetter(json?.offerLetter || null);
            setChats(Array.isArray(json?.chats) ? json.chats : []);
        } catch (e) {
            setErr(e?.message || "Failed to load details");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const jobDocumentId = job?.documentId;
        const candidateDocumentId = candidate?.documentId;

        if (!jobDocumentId || !candidateDocumentId) {
            return undefined;
        }

        const controller = new AbortController();
        const qs = new URLSearchParams({
            jobDocumentId,
            candidateDocumentId,
        });

        fetchJsonSafe(`/api/jobs/pipeline/details?${qs.toString()}`, {
            signal: controller.signal,
        })
            .then((json) => {
                const currentStatus =
                    json?.currentPipelineStatus ||
                    candidate?.currentPipelineStatus ||
                    "";

                setStatus(currentStatus);
                setOriginalStatus(currentStatus);
                setOfferLetter(json?.offerLetter || null);
                setChats(Array.isArray(json?.chats) ? json.chats : []);
            })
            .catch((error) => {
                if (error?.name !== "AbortError") {
                    setErr(error?.message || "Failed to load details");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [job?.documentId, candidate?.documentId, candidate?.currentPipelineStatus]);

    useEffect(() => {
        if (!chatScrollRef.current) return;
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }, [chats]);

    async function updateStatus() {
        if (!canChangePipelineStatus) return;

        const statusChanged = String(status || "") !== String(originalStatus || "");
        if (!status || !statusChanged) return;

        setSubmitting(true);
        setErr("");

        try {
            await fetchJsonSafe("/api/jobs/pipeline/update-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobDocumentId: job.documentId,
                    candidateDocumentId: candidate.documentId,
                    newStatus: status,
                }),
            });

            await loadDetails();
            onUpdated?.();
        } catch (e) {
            setErr(e?.message || "Failed to update pipeline");
        } finally {
            setSubmitting(false);
        }
    }

    async function uploadOfferLetter() {
        if (!canManageOfferLetter) return;
        if (!offerFile) return;

        setSubmitting(true);
        setErr("");

        try {
            const fd = new FormData();
            fd.append("jobDocumentId", job.documentId);
            fd.append("candidateDocumentId", candidate.documentId);
            fd.append("file", offerFile);

            await fetchJsonSafe("/api/jobs/pipeline/offer-letter", {
                method: "POST",
                body: fd,
            });

            /*
                System record is created inside:
                /api/jobs/pipeline/offer-letter/route.js

                Do not create another record here, otherwise duplicate logs appear.
            */

            setOfferFile(null);
            await loadDetails();
            onUpdated?.();
        } catch (e) {
            setErr(e?.message || "Failed to update offer letter");
        } finally {
            setSubmitting(false);
        }
    }

    async function createChat() {
        if (!canAddRecord) return;
        if (!message.trim()) return;

        setSubmitting(true);
        setErr("");

        try {
            await fetchJsonSafe("/api/jobs/pipeline/chats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobDocumentId: job.documentId,
                    candidateDocumentId: candidate.documentId,
                    message: message.trim(),
                    private: isPrivate,
                }),
            });

            setMessage("");
            setIsPrivate(false);
            await loadDetails();
        } catch (e) {
            setErr(e?.message || "Failed to create chat");
        } finally {
            setSubmitting(false);
        }
    }

    function openEdit(chat) {
        if (!canEditLogs) return;
        if (chat?.isSystemGenerated) return;

        setEditingChat(chat);
        setEditMessage(chat?.message || "");
        setEditPrivate(!!chat?.private);
    }

    async function saveEdit() {
        if (!canEditLogs) return;
        if (!editingChat?.documentId || !editMessage.trim()) return;

        setSubmitting(true);
        setErr("");

        try {
            await fetchJsonSafe(`/api/jobs/pipeline/chats/${editingChat.documentId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobDocumentId: job.documentId,
                    candidateDocumentId: candidate.documentId,
                    message: editMessage.trim(),
                    private: editPrivate,
                }),
            });

            setEditingChat(null);
            await loadDetails();
        } catch (e) {
            setErr(e?.message || "Failed to update chat");
        } finally {
            setSubmitting(false);
        }
    }

    const statusChanged = String(status || "") !== String(originalStatus || "");
    const showOfferLetter = canShowOfferLetter(originalStatus);

    const visibleChats = useMemo(() => {
        return (Array.isArray(chats) ? chats : []).filter((chat) => {
            if (chat?.private) return canSeePrivateLogs;
            return true;
        });
    }, [chats, canSeePrivateLogs]);

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-3">
            <div className="h-[94vh] w-full max-w-[1550px] overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold text-gray-900">
                            Pipeline Update
                        </h2>
                        <div className="text-sm text-gray-500">
                            {job?.referenceNo || "—"} • {candidate?.fullName || "—"}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                        Close
                    </button>
                </div>

                <div className="grid h-[calc(94vh-57px)] grid-cols-1 overflow-hidden lg:grid-cols-[1fr_620px]">
                    <div className="space-y-4 overflow-y-auto p-4">
                        <PipelineStepper status={status} candidate={candidate} />

                        <div className="rounded-xl border border-gray-200 p-4">
                            <div className="flex items-center gap-3">
                                <Image
                                    src={candidate?.avatar || "/images/default-avatar.jpg"}
                                    width={64}
                                    height={64}
                                    unoptimized
                                    onError={(event) => {
                                        if (!event.currentTarget.src.endsWith("/images/default-avatar.jpg")) {
                                            event.currentTarget.src = "/images/default-avatar.jpg";
                                        }
                                    }}
                                    alt={candidate?.fullName || "Candidate"}
                                    className="h-16 w-16 rounded-full border bg-gray-100 object-cover"
                                />

                                <div>
                                    <div className="text-lg font-bold text-red-700">
                                        {candidate?.fullName || "—"}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        Ref: {candidate?.referenceNumber || "—"}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        Current: {displayPipelineStage(originalStatus) || "—"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {canChangePipelineStatus ? (
                            <div className="rounded-xl border border-gray-200 p-4">
                                <label className="mb-1 block text-sm font-semibold text-gray-700">
                                    Change Pipeline Status
                                </label>

                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                    >
                                        <option value="">Select status</option>
                                        {PIPELINES.map((p) => (
                                            <option key={p.value} value={p.value}>
                                                {p.label}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        type="button"
                                        onClick={updateStatus}
                                        disabled={submitting || !statusChanged}
                                        className={`rounded-md px-5 py-2 text-sm font-semibold text-white ${statusChanged
                                            ? "bg-red-700 hover:opacity-90"
                                            : "cursor-not-allowed bg-gray-300"
                                            }`}
                                    >
                                        {submitting ? "Updating..." : "Update"}
                                    </button>
                                </div>

                                {err ? (
                                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                        {err}
                                    </div>
                                ) : null}
                            </div>
                        ) : err ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {err}
                            </div>
                        ) : null}

                        {showOfferLetter ? (
                            <div className="rounded-xl border border-gray-200 p-4">
                                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                                    <FaFilePdf className="text-red-700" />
                                    Offer Letter
                                </div>

                                {offerLetter?.url ? (
                                    <a
                                        href={offerLetter.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mb-3 inline-flex rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                                    >
                                        View Current Offer Letter
                                    </a>
                                ) : (
                                    <div className="mb-3 text-sm text-gray-500">
                                        No offer letter uploaded.
                                    </div>
                                )}

                                {canManageOfferLetter ? (
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) =>
                                                setOfferFile(e.target.files?.[0] || null)
                                            }
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                        />

                                        <button
                                            type="button"
                                            onClick={uploadOfferLetter}
                                            disabled={submitting || !offerFile}
                                            className={`rounded-md px-5 py-2 text-sm font-semibold text-white ${offerFile
                                                ? "bg-red-700 hover:opacity-90"
                                                : "cursor-not-allowed bg-gray-300"
                                                }`}
                                        >
                                            {offerLetter?.url ? "Update Offer" : "Upload Offer"}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                                        Offer letter upload is available for staff and client users only.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                                Offer letter option will appear when candidate status is Offered,
                                Immigration, or Placed.
                            </div>
                        )}

                        {canAddRecord ? (
                            <div className="rounded-xl border border-gray-200 p-4">
                                <label className="mb-1 block text-sm font-semibold text-gray-700">
                                    Add Record
                                </label>

                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    rows={4}
                                    placeholder="Write note..."
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                />

                                <div className="mt-2 flex items-center justify-between gap-3">

                                    {canSeePrivateLogs ? (
                                        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={isPrivate}
                                                onChange={(e) => setIsPrivate(e.target.checked)}
                                            />
                                            Private (for staff eyes only)
                                        </label>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={createChat}
                                        disabled={submitting || !message.trim()}
                                        className="rounded-md bg-red-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                    >
                                        Add Record
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="flex min-h-0 flex-col border-l bg-[#efeae2] bg-[radial-gradient(circle_at_20px_20px,rgba(255,255,255,0.45)_2px,transparent_2px)] bg-[length:32px_32px] p-4 pb-10">
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                            <div className="text-sm font-bold text-gray-800">
                                Record History/Logs
                            </div>

                            <button
                                type="button"
                                onClick={loadDetails}
                                disabled={loading || submitting}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? "Refreshing..." : "Refresh"}
                            </button>
                        </div>

                        {authLoading || loading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <ClipLoader size={18} color="#b91c1c" />
                                Loading logs...
                            </div>
                        ) : visibleChats.length === 0 ? (
                            <div className="rounded-lg border bg-white p-3 text-sm text-gray-600">
                                No record yet.
                            </div>
                        ) : (
                            <div
                                ref={chatScrollRef}
                                className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
                            >
                                {visibleChats.map((chat) => (
                                    <div
                                        key={chat.documentId || chat.id}
                                        className={`rounded-xl border p-3 text-sm shadow-sm ${chat.private
                                            ? "border-red-200 bg-red-50"
                                            : chat.isSystemGenerated
                                                ? "ml-12 border-blue-100 bg-blue-50"
                                                : "mr-12 border-gray-200 bg-white"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="font-semibold text-gray-800">
                                                {recordAuthorLabel(chat)}
                                            </div>

                                            <div className="flex items-center gap-2 text-gray-500">
                                                {canEditLogs && !chat.isSystemGenerated ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(chat)}
                                                        title="Edit record"
                                                        className="hover:text-red-700"
                                                    >
                                                        <FaEdit />
                                                    </button>
                                                ) : null}

                                                {chat.history ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setHistoryPopup(chat)}
                                                        title="View history"
                                                        className="hover:text-blue-700"
                                                    >
                                                        <FaHistory />
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="mt-1 whitespace-pre-line text-gray-700">
                                            {chat.message || "—"}
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                                            <span className="inline-flex items-center gap-1">
                                                <FaRegCalendarAlt />
                                                {chat.createdAt
                                                    ? new Date(chat.createdAt).toLocaleDateString()
                                                    : "—"}
                                            </span>

                                            <span className="inline-flex items-center gap-1">
                                                <FaRegClock />
                                                {chat.createdAt
                                                    ? new Date(chat.createdAt).toLocaleTimeString()
                                                    : "—"}
                                            </span>

                                            {chat.private ? (
                                                <span className="rounded-full bg-red-100 px-2 py-[1px] text-red-700">
                                                    Private
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {editingChat ? (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-3">
                    <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-2xl">
                        <div className="mb-3 text-lg font-bold">Edit Record</div>

                        <textarea
                            value={editMessage}
                            onChange={(e) => setEditMessage(e.target.value)}
                            rows={5}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />

                        <label className="mt-2 inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={editPrivate}
                                onChange={(e) => setEditPrivate(e.target.checked)}
                            />
                            Private
                        </label>

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setEditingChat(null)}
                                className="rounded-md border px-4 py-2 text-sm"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={saveEdit}
                                disabled={submitting}
                                className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {historyPopup ? (
                <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/50 p-3">
                    <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div className="flex items-center gap-2 font-bold text-gray-900">
                                <FaHistory className="text-blue-700" />
                                Record Edit History
                            </div>

                            <button
                                type="button"
                                onClick={() => setHistoryPopup(null)}
                                className="rounded border px-3 py-1 text-sm"
                            >
                                Close
                            </button>
                        </div>

                        <div className="max-h-[65vh] overflow-y-auto p-4">
                            {parseHistory(historyPopup?.history).length === 0 ? (
                                <div className="text-sm text-gray-500">No history found.</div>
                            ) : (
                                <div className="space-y-3">
                                    {parseHistory(historyPopup?.history).map((h, idx) => (
                                        <div
                                            key={idx}
                                            className="rounded-lg border bg-gray-50 p-3 text-sm"
                                        >
                                            <div className="font-semibold text-gray-800">
                                                {h.personName || "Staff"}
                                            </div>

                                            <div className="mt-1 whitespace-pre-line text-gray-700">
                                                {h.message || "—"}
                                            </div>

                                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                                                <span>Private: {h.private ? "Yes" : "No"}</span>
                                                <span>Created: {h.createdAt || "—"}</span>
                                                <span>Edited: {h.editedAt || "—"}</span>
                                                <span>Edited By: {h.editedBy || "—"}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function PipelineUpdatePopup(props) {
    const popupKey = `${props?.job?.documentId || "job"}:${props?.candidate?.documentId || "candidate"
        }`;

    return <PipelineUpdatePopupContent key={popupKey} {...props} />;
}
