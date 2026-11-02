"use client";


import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
    DndContext,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    DragOverlay,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import ENUMS from "@/config/enums.json";
import { IoClose } from "react-icons/io5";
import { MdDragIndicator } from "react-icons/md";
import { ClipLoader } from "react-spinners";
import PipelineUpdatePopup from "@/app/components/jobs/PipelineUpdatePopup";
import useAuthClient from "@/lib/useAuthClient";


function unwrapRelation(value) {
    if (!value) return null;
    if (value?.data) return unwrapRelation(value.data);
    if (value?.attributes) return { ...value.attributes, id: value.id, documentId: value.documentId || value.attributes?.documentId || "" };
    return value;
}

function getAgentName(candidate) {
    const directName = String(candidate?.agentName || candidate?.agentLabel || "").trim();
    if (directName) return directName;

    const agent = unwrapRelation(candidate?.agent || candidate?.agentData || candidate?.candidateAgent);
    if (!agent) return "No Agent";

    const company = String(agent?.companyName || agent?.label || agent?.name || "").trim();
    const contact = String(agent?.contactName || "").trim();

    if (company && contact) return `${company} (${contact})`;
    return company || contact || "No Agent";
}

function VerifiedBadge({ ok }) {
    return ok ? (
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-green-700">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-green-700">
                    <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                </svg>
            </span>
            Verified
        </span>
    ) : (
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-red-700">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-red-700">
                    <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z" />
                </svg>
            </span>
            Not Verified
        </span>
    );
}

async function fetchJsonSafe(url, opts) {
    const res = await fetch(url, { cache: "no-store", ...(opts || {}) });
    const text = await res.text();

    let json;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(`API returned non-JSON (status ${res.status}). First bytes: ${text.slice(0, 80)}`);
    }

    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Request failed");
    }

    return json;
}

function blocksToPlainText(blocks) {
    if (!Array.isArray(blocks)) return "";
    return blocks
        .map((b) => {
            const children = Array.isArray(b?.children) ? b.children : [];
            return children.map((c) => c?.text || "").join("").trim();
        })
        .filter(Boolean)
        .join("\n\n");
}

function normalizeProcessLabel(to) {
    const labels = (ENUMS?.candidateProcess || []).map(String);

    const map = {
        suggested: labels[0] || "Suggested Candidate",
        shortlisted: labels[1] || "Shortlisted Candidate",
        interview: labels[2] || "Requested Interview",
        hired: labels[3] || "Hired Candidate",
        immigration: "Immigration",
        placed: "Placed",
    };

    if (!to) return map.suggested;

    const value = String(to).trim();

    if (labels.includes(value)) return value;
    if (map[value]) return map[value];

    return value;
}

function processKeyFromLabel(v) {
    const x = String(v || "").trim().toLowerCase();

    if (x === "shortlisted candidate") return "shortlisted";
    if (x === "requested interview") return "interview";
    if (x === "hired candidate") return "hired";
    if (x === "immigration") return "immigration";
    if (x === "placed") return "placed";

    return "suggested";
}

function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isValidLink(value) {
    const raw = String(value || "").trim();
    return /^https?:\/\//i.test(raw);
}

function proxyMediaUrl(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    return `/api/media/proxy?url=${encodeURIComponent(s)}`;
}

function adminMediaUrl(url) {
    const s = String(url || "").trim();
    if (!s) return "";

    const base = String(process.env.NEXT_PUBLIC_ADMIN_BASE_URL || "")
        .trim()
        .replace(/\/$/, "");

    if (!base) return s;

    try {
        const u = new URL(s);
        return `${base}${u.pathname}${u.search || ""}`;
    } catch {
        return `${base}${s.startsWith("/") ? "" : "/"}${s}`;
    }
}

function withProcess(items, processKey) {
    return (Array.isArray(items) ? items : []).map((x) => ({
        ...x,
        currentProcess: processKey,
    }));
}

function ensureOfferLetterShape(value) {
    if (!value || typeof value !== "object") return null;
    if (!value.url && !value.name && !value.id) return null;

    return {
        id: value.id ?? null,
        name: value.name || "",
        url: value.url || "",
    };
}


function passthroughImageLoader({ src }) {
    return src;
}

function CandidateAvatar({
    src,
    alt = "Candidate",
    width = 48,
    height = 48,
    className = "",
}) {
    const safeSrc = String(src || "").trim() || "/images/default-avatar.jpg";

    return (
        <Image
            loader={passthroughImageLoader}
            unoptimized
            src={safeSrc}
            alt={alt}
            width={width}
            height={height}
            onError={(event) => {
                event.currentTarget.src = "/images/default-avatar.jpg";
            }}
            className={className}
        />
    );
}

function CvPreview({ cvUrl }) {
    const [loading, setLoading] = useState(Boolean(cvUrl));
    const [failed, setFailed] = useState(false);
    const loadedRef = useRef(false);

    useEffect(() => {
        if (!cvUrl) return undefined;

        const timeoutId = window.setTimeout(() => {
            if (!loadedRef.current) {
                setFailed(true);
                setLoading(false);
            }
        }, 8000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [cvUrl]);

    if (!cvUrl) {
        return (
            <div className="mt-4 rounded-xl border border-gray-200 p-4 text-sm text-gray-500">
                No CV file is available for this candidate.
            </div>
        );
    }

    return (
        <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-800">
                    CV Preview (PDF)
                </div>
                <a
                    href={cvUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                >
                    Open / Download
                </a>
            </div>

            <div className="relative mt-2 overflow-hidden rounded-xl border border-gray-200">
                {loading ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white">
                        <ClipLoader size={52} color="#b91c1c" />
                        <div className="mt-3 text-sm text-gray-600">
                            Loading CV preview...
                        </div>
                    </div>
                ) : null}

                {failed ? (
                    <div className="p-4 sm:p-6">
                        <div className="font-semibold text-red-700">
                            CV preview failed to load
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                            Use the button below to open it in a new tab.
                        </p>
                        <div className="mt-3">
                            <a
                                href={cvUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded-lg bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90"
                            >
                                Open CV in New Tab
                            </a>
                        </div>
                    </div>
                ) : (
                    <div className="h-[65vh] sm:h-[78vh]">
                        <iframe
                            src={proxyMediaUrl(cvUrl)}
                            title="CV PDF"
                            className="h-full w-full"
                            onLoad={() => {
                                loadedRef.current = true;
                                setLoading(false);
                                setFailed(false);
                            }}
                        />
                    </div>
                )}
            </div>

            <p className="mt-2 text-xs text-gray-500">
                Tip: If preview doesn&apos;t load, click{" "}
                <a
                    href={cvUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                >
                    Open CV in New Tab
                </a>{" "}
                to view the full CV in PDF format.
            </p>
        </div>
    );
}

async function hydrateHiredOfferLetters(list, jobDocumentId) {
    if (!Array.isArray(list) || list.length === 0) return list;

    return Promise.all(
        list.map(async (candidate) => {
            try {
                const qs = new URLSearchParams({
                    jobDocumentId: String(jobDocumentId || ""),
                    candidateDocumentId: String(candidate?.documentId || ""),
                });
                const json = await fetchJsonSafe(
                    `/api/jobs/candidates/move?${qs.toString()}`
                );

                return {
                    ...candidate,
                    offerLetter: ensureOfferLetterShape(json?.offerLetter),
                };
            } catch {
                return {
                    ...candidate,
                    offerLetter: ensureOfferLetterShape(candidate?.offerLetter),
                };
            }
        })
    );
}

function updateCandidateInList(list, candidateDocumentId, patch) {
    return (Array.isArray(list) ? list : []).map((item) =>
        String(item?.documentId) === String(candidateDocumentId)
            ? { ...item, ...patch }
            : item
    );
}

function removeCandidateFromList(list, candidateDocumentId) {
    return (Array.isArray(list) ? list : []).filter(
        (item) => String(item?.documentId) !== String(candidateDocumentId)
    );
}

function upsertCandidateAtTop(list, candidate) {
    const next = removeCandidateFromList(list, candidate?.documentId);
    return [candidate, ...next];
}

function displayProcessLabel(value) {
    const raw = String(value || "").trim();

    if (raw === "Hired Candidate") {
        return "Offered Candidate";
    }

    return raw;
}

function StageBadge({ value }) {
    const displayValue = displayProcessLabel(value);
    const v = String(value || "").trim().toLowerCase();

    const cls =
        v === "hired candidate"
            ? "border-green-200 bg-green-50 text-green-700"
            : v === "immigration"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : v === "placed"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : v === "requested interview"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : v === "shortlisted candidate"
                            ? "border-purple-200 bg-purple-50 text-purple-700"
                            : "border-gray-200 bg-gray-50 text-gray-700";

    if (!displayValue) return null;

    return (
        <span className={`inline-flex max-w-full rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${cls}`}>
            <span className="truncate">{displayValue}</span>
        </span>
    );
}

function SectionHeader({ title, count, children }) {
    return (
        <div className="mb-2 flex flex-col gap-2 border-b border-gray-200 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                {title}
                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                    {count}
                </span>
            </h2>

            {children ? <div className="shrink-0">{children}</div> : null}
        </div>
    );
}

function EmptySection({ text }) {
    return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
            {text}
        </div>
    );
}

function RemoveButton({ onClick, title = "Remove candidate" }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
            <IoClose className="h-4 w-4" />
        </button>
    );
}

function DropZoneSection({ id, children }) {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <div
            ref={setNodeRef}
            className={`rounded-xl transition ${isOver ? "ring-2 ring-red-500 ring-offset-2" : ""}`}
        >
            {children}
        </div>
    );
}

function DraggableCandidateCard({ candidate, sectionKey, children }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging,
    } = useDraggable({
        id: candidate?.documentId,
        data: {
            candidate,
            fromSection: sectionKey,
        },
    });

    const style = {
        transform: CSS.Translate.toString(transform),
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={isDragging ? "opacity-40" : ""}
        >
            <div className="relative">
                <button
                    type="button"
                    {...listeners}
                    {...attributes}
                    title="Drag candidate"
                    className="absolute left-2 top-2 z-10 inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-700 active:cursor-grabbing"
                >
                    <MdDragIndicator className="h-4 w-4" />
                </button>

                {children}
            </div>
        </div>
    );
}

function OfferLetterModal({
    open,
    candidate,
    onClose,
    onUpload,
    onRemove,
    submitting,
    error,
}) {
    const [file, setFile] = useState(null);

    useEffect(() => {
        if (!open) return;

        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", onKey);

        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);

    if (!open || !candidate || typeof document === "undefined") return null;

    const offer = ensureOfferLetterShape(candidate?.offerLetter);

    return createPortal(
        <div
            className="fixed inset-0 z-[310] flex items-center justify-center bg-black/70 p-3"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-5">
                    <div>
                        <div className="text-base font-bold text-gray-900 sm:text-lg">
                            {offer ? "View / Edit Offer Letter" : "Upload Offer Letter"}
                        </div>
                        <div className="text-xs text-gray-500 sm:text-sm">
                            {candidate?.fullName || "Candidate"}
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-4 p-4 sm:p-5">
                    {offer ? (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <div className="text-sm font-semibold text-gray-800">
                                Current Offer Letter
                            </div>
                            <div className="mt-1 break-all text-xs text-gray-600 sm:text-sm">
                                {offer?.name || "Offer Letter"}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {offer?.url ? (
                                    <a
                                        href={adminMediaUrl(offer.url)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 sm:text-sm"
                                    >
                                        View Offer Letter
                                    </a>
                                ) : null}

                                <button
                                    onClick={() => onRemove(candidate)}
                                    disabled={submitting}
                                    className="rounded-lg border border-red-600 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ) : null}

                    <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-800">
                            {offer ? "Replace Offer Letter" : "Select Offer Letter"}
                        </label>
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="block w-full rounded-lg border border-gray-300 p-3 text-sm"
                        />
                        <div className="mt-2 text-xs text-gray-500">
                            Allowed: PDF, JPG, JPEG, PNG
                        </div>
                    </div>

                    {error ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                            onClick={onClose}
                            disabled={submitting}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Cancel
                        </button>

                        <button
                            onClick={() => onUpload(candidate, file)}
                            disabled={submitting || !file}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting ? "Uploading file..." : offer ? "Update Offer Letter" : "Upload Offer Letter"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function ConfirmRemoveModal({
    open,
    candidate,
    submitting,
    onConfirm,
    onNo,
    onCancel,
}) {
    const [removeChatHistory, setRemoveChatHistory] = useState(true);
    const [removalReason, setRemovalReason] = useState("");

    useEffect(() => {
        if (!open) return;

        const onKey = (e) => {
            if (e.key === "Escape") onCancel();
        };

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", onKey);

        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onCancel]);

    if (!open || !candidate || typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[320] flex items-center justify-center bg-black/70 p-3"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
        >
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="border-b border-gray-200 px-4 py-3 sm:px-5">
                    <div className="text-lg font-bold text-gray-900">Confirm Remove</div>
                    <div className="text-sm text-gray-500">
                        {candidate?.fullName || "Candidate"}
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    <div className="text-sm text-gray-800">
                        Are you sure you want to remove this candidate from this job?
                    </div>

                    <label className="mt-4 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm text-gray-800">
                        <input
                            type="checkbox"
                            checked={removeChatHistory}
                            onChange={(e) => setRemoveChatHistory(e.target.checked)}
                            className="mt-1 h-4 w-4"
                        />

                        <span>
                            <span className="font-semibold text-red-700">
                                Remove record history too
                            </span>
                            <span className="mt-1 block text-xs text-gray-600">
                                This will delete pipeline chat/history logs for this candidate in this job and reduce data load.
                            </span>
                        </span>
                    </label>

                    <div className="mt-4">
                        <label className="mb-2 block text-sm font-semibold text-gray-800">
                            Reason <span className="text-red-600">*</span>
                        </label>
                        <textarea
                            value={removalReason}
                            onChange={(e) => setRemovalReason(e.target.value)}
                            rows={4}
                            placeholder="Write the reason for removing this candidate from this job..."
                            disabled={submitting}
                            className="block w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <div className="mt-1 text-xs text-gray-500">
                            This reason will be saved in the notification details.
                        </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                            onClick={onCancel}
                            disabled={submitting}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Cancel
                        </button>

                        <button
                            onClick={onNo}
                            disabled={submitting}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            No
                        </button>

                        <button
                            onClick={() => onConfirm(candidate, removeChatHistory, removalReason.trim())}
                            disabled={submitting || !removalReason.trim()}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting ? "Removing..." : "Yes, Remove"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}



export default function JobCandidatesPage() {
    const routeParams = useParams();
    const router = useRouter();
    const jobDocumentId = routeParams?.documentId;

    const { user, role, authLoading, loadingAuth } = useAuthClient();
    const roleCandidates = [
        role?.name,
        user?.role?.name,
        user?.roleRaw?.name,
        user?.type,
        user?.role?.type,
        role,
        user?.role,
    ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);

    const roleName =
        roleCandidates.find((value) =>
            ["staff", "staffs", "client", "clients", "candidate", "candidates"].includes(value)
        ) || roleCandidates[0] || "";

    const isStaff = roleName === "staff" || roleName === "staffs";
    const isClient = roleName === "client" || roleName === "clients";
    const isAuthLoading = Boolean(authLoading ?? loadingAuth);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const [job, setJob] = useState(null);
    const [jobErr, setJobErr] = useState("");
    const [jobLoading, setJobLoading] = useState(true);

    const [suggestedCandidates, setSuggestedCandidates] = useState([]);
    const [shortlistedCandidates, setShortlistedCandidates] = useState([]);
    const [requestedInterviewCandidates, setRequestedInterviewCandidates] = useState([]);
    const [hiredCandidates, setHiredCandidates] = useState([]);

    const [activeDragCandidate, setActiveDragCandidate] = useState(null);

    const [pipelinePopup, setPipelinePopup] = useState({
        open: false,
        candidate: null,
    });

    const [selectedCandidate, setSelectedCandidate] = useState(null);

    const [offerModal, setOfferModal] = useState({
        open: false,
        candidate: null,
    });

    const [removeConfirmModal, setRemoveConfirmModal] = useState({
        open: false,
        candidate: null,
    });

    const [offerSubmitting, setOfferSubmitting] = useState(false);
    const [offerError, setOfferError] = useState("");
    const [removingCandidateId, setRemovingCandidateId] = useState("");
    const [clearingSuggested, setClearingSuggested] = useState(false);

    const suggestedRef = useRef(null);
    const shortlistedRef = useRef(null);
    const requestedRef = useRef(null);
    const hiredRef = useRef(null);

    function scrollToSuggested() {
        suggestedRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }

    function scrollToShortlisted() {
        shortlistedRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }

    function scrollToInterview() {
        requestedRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }

    function scrollToHired() {
        hiredRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }

    function getDropActionBySection(sectionId) {
        if (sectionId === "suggested") return "Suggested Candidate";
        if (sectionId === "shortlisted") return "Shortlisted Candidate";
        if (sectionId === "interview") return "Requested Interview";
        if (sectionId === "hired") return "Hired Candidate";
        return "";
    }

    function handleDragStart(event) {
        const candidate = event?.active?.data?.current?.candidate || null;
        setActiveDragCandidate(candidate);
    }

    async function handleDragEnd(event) {
        const activeCandidate = event?.active?.data?.current?.candidate || null;
        const fromSection = event?.active?.data?.current?.fromSection || "";
        const toSection = event?.over?.id || "";

        setActiveDragCandidate(null);

        if (!activeCandidate || !toSection) return;
        if (String(fromSection) === String(toSection)) return;

        const action = getDropActionBySection(toSection);
        if (!action) return;

        await moveCandidateTo(activeCandidate, action);
    }

    function handleDragCancel() {
        setActiveDragCandidate(null);
    }

    function openPipelinePopup(candidate) {
        setPipelinePopup({
            open: true,
            candidate: {
                ...candidate,
                avatar: candidate?.avatar || "/images/default-avatar.jpg",
                currentPipelineStatus: normalizeProcessLabel(candidate?.currentProcess),
            },
        });
    }

    function closePipelinePopup() {
        setPipelinePopup({
            open: false,
            candidate: null,
        });
    }

    function openOfferModal(candidate) {
        setOfferError("");
        setOfferModal({
            open: true,
            candidate,
        });
    }

    function closeOfferModal() {
        setOfferError("");
        setOfferModal({
            open: false,
            candidate: null,
        });
    }

    function openRemoveConfirmModal(candidate) {
        setRemoveConfirmModal({
            open: true,
            candidate,
        });
    }

    function closeRemoveConfirmModal() {
        setRemoveConfirmModal({
            open: false,
            candidate: null,
        });
    }

    function closeCandidate() {
        setSelectedCandidate(null);
    }

    function refreshCandidateAcrossState(candidateDocumentId, patch) {
        setSuggestedCandidates((prev) => updateCandidateInList(prev, candidateDocumentId, patch));
        setShortlistedCandidates((prev) => updateCandidateInList(prev, candidateDocumentId, patch));
        setRequestedInterviewCandidates((prev) => updateCandidateInList(prev, candidateDocumentId, patch));
        setHiredCandidates((prev) => updateCandidateInList(prev, candidateDocumentId, patch));

        setSelectedCandidate((prev) =>
            String(prev?.documentId) === String(candidateDocumentId)
                ? { ...prev, ...patch }
                : prev
        );

        setOfferModal((prev) =>
            String(prev?.candidate?.documentId) === String(candidateDocumentId)
                ? { ...prev, candidate: { ...prev.candidate, ...patch } }
                : prev
        );

        setRemoveConfirmModal((prev) =>
            String(prev?.candidate?.documentId) === String(candidateDocumentId)
                ? { ...prev, candidate: { ...prev.candidate, ...patch } }
                : prev
        );
    }

    function removeCandidateAcrossState(candidateDocumentId) {
        setSuggestedCandidates((prev) => removeCandidateFromList(prev, candidateDocumentId));
        setShortlistedCandidates((prev) => removeCandidateFromList(prev, candidateDocumentId));
        setRequestedInterviewCandidates((prev) => removeCandidateFromList(prev, candidateDocumentId));
        setHiredCandidates((prev) => removeCandidateFromList(prev, candidateDocumentId));

        if (String(selectedCandidate?.documentId) === String(candidateDocumentId)) {
            closeCandidate();
        }

        if (String(offerModal?.candidate?.documentId) === String(candidateDocumentId)) {
            closeOfferModal();
        }

        if (String(removeConfirmModal?.candidate?.documentId) === String(candidateDocumentId)) {
            closeRemoveConfirmModal();
        }
    }


    useEffect(() => {
        if (!selectedCandidate) return undefined;

        const onKey = (event) => {
            if (event.key === "Escape") {
                setSelectedCandidate(null);
            }
        };

        window.addEventListener("keydown", onKey);

        return () => {
            window.removeEventListener("keydown", onKey);
        };
    }, [selectedCandidate]);

    useEffect(() => {
        let ignore = false;

        async function load() {
            if (!jobDocumentId || isAuthLoading) return;

            if (!isStaff && !isClient) {
                setJob(null);
                setJobErr("Only authenticated staff or clients can access the job board.");
                setJobLoading(false);
                return;
            }

            setJobLoading(true);
            setJobErr("");

            try {
                const json = await fetchJsonSafe(`/api/jobs/candidates/get/${jobDocumentId}`);
                if (ignore) return;

                const suggested = withProcess(json?.lists?.suggested || [], "suggested");
                const shortlisted = withProcess(json?.lists?.shortlisted || [], "shortlisted");
                const interview = withProcess(json?.lists?.interview || [], "interview");

                const hiredRaw = withProcess(json?.lists?.hired || [], "hired");
                const immigrationRaw = withProcess(json?.lists?.immigration || [], "immigration");
                const placedRaw = withProcess(json?.lists?.placed || [], "placed");

                const hiredFinalRaw = [
                    ...hiredRaw,
                    ...immigrationRaw,
                    ...placedRaw,
                ];

                const hired = await hydrateHiredOfferLetters(hiredFinalRaw, jobDocumentId);

                if (ignore) return;

                setJob(json?.job || null);
                setSuggestedCandidates(suggested);
                setShortlistedCandidates(shortlisted);
                setRequestedInterviewCandidates(interview);
                setHiredCandidates(hired);
            } catch (e) {
                if (!ignore) setJobErr(e?.message || "Failed to load job");
            } finally {
                if (!ignore) setJobLoading(false);
            }
        }

        load();

        return () => {
            ignore = true;
        };
    }, [jobDocumentId, isAuthLoading, isStaff, isClient]);

    async function moveCandidateTo(candidate, toKeyOrLabel) {
        if (!jobDocumentId || !candidate?.documentId) return;

        const toLabel = normalizeProcessLabel(toKeyOrLabel);
        const toKey = processKeyFromLabel(toLabel);

        if (candidate?.currentProcess === toKey) return;

        const movedCandidate = {
            ...candidate,
            currentProcess: toKey,
            candidateProcessList: toLabel,
        };

        const oldSuggested = suggestedCandidates;
        const oldShortlisted = shortlistedCandidates;
        const oldInterview = requestedInterviewCandidates;
        const oldHired = hiredCandidates;
        const oldSelected = selectedCandidate;

        setSuggestedCandidates((prev) => removeCandidateFromList(prev, candidate.documentId));
        setShortlistedCandidates((prev) => removeCandidateFromList(prev, candidate.documentId));
        setRequestedInterviewCandidates((prev) => removeCandidateFromList(prev, candidate.documentId));
        setHiredCandidates((prev) => removeCandidateFromList(prev, candidate.documentId));

        if (toKey === "suggested") {
            setSuggestedCandidates((prev) => upsertCandidateAtTop(prev, movedCandidate));
        } else if (toKey === "shortlisted") {
            setShortlistedCandidates((prev) => upsertCandidateAtTop(prev, movedCandidate));
        } else if (toKey === "interview") {
            setRequestedInterviewCandidates((prev) => upsertCandidateAtTop(prev, movedCandidate));
        } else if (toKey === "hired" || toKey === "immigration" || toKey === "placed") {
            setHiredCandidates((prev) => upsertCandidateAtTop(prev, movedCandidate));
        }

        if (String(selectedCandidate?.documentId) === String(candidate?.documentId)) {
            setSelectedCandidate(movedCandidate);
        }

        try {
            const json = await fetchJsonSafe(`/api/jobs/candidates/move`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobDocumentId,
                    candidateDocumentId: candidate.documentId,
                    action: toLabel,
                }),
            });

            const patch = {
                currentProcess: toKey,
                candidateProcessList: toLabel,
                offerLetter: ensureOfferLetterShape(json?.offerLetter) ?? ensureOfferLetterShape(candidate?.offerLetter),
            };

            refreshCandidateAcrossState(candidate.documentId, patch);
        } catch (e) {
            setSuggestedCandidates(oldSuggested);
            setShortlistedCandidates(oldShortlisted);
            setRequestedInterviewCandidates(oldInterview);
            setHiredCandidates(oldHired);
            setSelectedCandidate(oldSelected);
            alert(e?.message || "Failed to update job in Strapi");
        }
    }

    async function handleUploadOfferLetter(candidate, file) {
        if (!jobDocumentId || !candidate?.documentId || !file) return;

        setOfferSubmitting(true);
        setOfferError("");

        try {
            const fd = new FormData();
            fd.append("action", "uploadOfferLetter");
            fd.append("jobDocumentId", jobDocumentId);
            fd.append("candidateDocumentId", candidate.documentId);
            fd.append("file", file);

            const res = await fetch("/api/jobs/candidates/move", {
                method: "POST",
                body: fd,
            });

            const json = await res.json();

            if (!res.ok || json?.ok === false) {
                throw new Error(json?.error || "Upload failed");
            }

            refreshCandidateAcrossState(candidate.documentId, {
                offerLetter: ensureOfferLetterShape(json?.offerLetter),
            });

            closeOfferModal();
        } catch (e) {
            setOfferError(e?.message || "Upload failed");
        } finally {
            setOfferSubmitting(false);
        }
    }

    async function handleRemoveOfferLetter(candidate) {
        if (!jobDocumentId || !candidate?.documentId) return;

        setOfferSubmitting(true);
        setOfferError("");

        try {
            await fetchJsonSafe(`/api/jobs/candidates/move`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "removeOfferLetter",
                    jobDocumentId,
                    candidateDocumentId: candidate.documentId,
                }),
            });

            refreshCandidateAcrossState(candidate.documentId, { offerLetter: null });
            closeOfferModal();
        } catch (e) {
            setOfferError(e?.message || "Failed to remove offer letter");
        } finally {
            setOfferSubmitting(false);
        }
    }

    async function handleRemoveCandidateConfirmed(candidate, removeChatHistory = true, deletionReason = "") {
        if (!jobDocumentId || !candidate?.documentId) return;

        const oldSuggested = suggestedCandidates;
        const oldShortlisted = shortlistedCandidates;
        const oldInterview = requestedInterviewCandidates;
        const oldHired = hiredCandidates;

        setRemovingCandidateId(String(candidate.documentId));
        removeCandidateAcrossState(candidate.documentId);

        try {
            await fetchJsonSafe(`/api/jobs/candidates/move`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "removeCandidate",
                    jobDocumentId,
                    candidateDocumentId: candidate.documentId,

                    // ✅ new
                    removeChatHistory,
                    deletionReason,
                }),
            });

            closeRemoveConfirmModal();
        } catch (e) {
            setSuggestedCandidates(oldSuggested);
            setShortlistedCandidates(oldShortlisted);
            setRequestedInterviewCandidates(oldInterview);
            setHiredCandidates(oldHired);
            closeRemoveConfirmModal();
            alert(e?.message || "Failed to remove candidate");
        } finally {
            setRemovingCandidateId("");
        }
    }

    async function handleClearSuggested() {
        if (!jobDocumentId || suggestedCandidates.length === 0) return;

        const oldSuggested = suggestedCandidates;

        setClearingSuggested(true);
        setSuggestedCandidates([]);

        try {
            await fetchJsonSafe(`/api/jobs/candidates/move`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "clearSuggestedCandidates",
                    jobDocumentId,

                    // ✅ force remove suggested candidates logs too
                    removeChatHistory: true,
                }),
            });
        } catch (e) {
            setSuggestedCandidates(oldSuggested);
            alert(e?.message || "Failed to clear suggested candidates");
        } finally {
            setClearingSuggested(false);
        }
    }

    const candidateForPopup = useMemo(() => {
        if (!selectedCandidate) return null;

        return {
            ...selectedCandidate,
            cvUrl: selectedCandidate.cvUrl,
            passportUrl: selectedCandidate.passportUrl,
            documents: Array.isArray(selectedCandidate.documents) ? selectedCandidate.documents : [],
            workingVideoLink: selectedCandidate.workingVideoLink || "",
            miScreeningVideoLink: selectedCandidate.miScreeningVideoLink || "",
            agentName: getAgentName(selectedCandidate),
            offerLetter: ensureOfferLetterShape(selectedCandidate.offerLetter),
        };
    }, [selectedCandidate]);

    const renderCandidateCard = (c, sectionKey) => {
        const offer = ensureOfferLetterShape(c?.offerLetter);
        const isHired = sectionKey === "hired";

        const cardClass = isHired
            ? offer
                ? "border-green-200 bg-green-50/70"
                : "border-orange-200 bg-orange-50/70"
            : "border-gray-200 bg-white";

        const offerBtnClass = offer
            ? "border-green-600 text-green-700 hover:bg-green-50"
            : "border-orange-500 text-orange-700 hover:bg-orange-50";

        return (
            <div
                key={c.documentId || c.id}
                className={`group relative rounded-xl border p-3 pl-9 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cardClass}`}
            >
                <RemoveButton
                    onClick={() => openRemoveConfirmModal(c)}
                    title="Remove candidate from job"
                />

                <div className="flex items-center gap-3 pr-8">
                    <CandidateAvatar
                        src={c.avatar}
                        alt={c.fullName || "Candidate"}
                        width={48}
                        height={48}
                        className="h-12 w-12 shrink-0 rounded-full border border-white bg-white object-cover shadow-sm"
                    />

                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-gray-900">
                            {c.fullName || "—"}
                        </div>

                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-600">
                            <span className="truncate">{c.nationality || "—"}</span>
                            <span className="text-gray-300">•</span>
                            <span className="truncate">Ref: {c.referenceNumber || "—"}</span>
                        </div>

                        <div className="mt-1">
                            <StageBadge value={c.candidateProcessList} />
                        </div>
                    </div>
                </div>

                {c.shortSummary ? (
                    <p className="mt-2 line-clamp-2 min-h-[32px] text-xs leading-4 text-gray-600">
                        {c.shortSummary}
                    </p>
                ) : (
                    <p className="mt-2 line-clamp-2 min-h-[32px] text-xs leading-4 text-gray-400">
                        No summary available.
                    </p>
                )}

                <div className="mt-3 grid grid-cols-1 gap-1.5">
                    <button
                        onClick={() => setSelectedCandidate(c)}
                        className="w-full rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-800"
                    >
                        Action/View Profile
                    </button>

                    {sectionKey === "hired" ? (
                        <>
                            <button
                                onClick={() => openOfferModal(c)}
                                className={`w-full rounded-md border bg-white px-3 py-1.5 text-xs font-semibold transition ${offerBtnClass}`}
                            >
                                {offer ? "View Offer Letter" : "Upload Offer Letter"}
                            </button>

                            <button
                                type="button"
                                onClick={() => openPipelinePopup(c)}
                                className="w-full rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                            >
                                Pipeline Update
                            </button>
                        </>
                    ) : null}

                    {removingCandidateId === String(c.documentId) ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <ClipLoader size={14} color="#b91c1c" />
                            Removing...
                        </div>
                    ) : null}
                </div>
            </div>
        );
    };

    async function AddNewCandidates(clientDocumentId, jobDocumentId) {
        if (!jobDocumentId || !clientDocumentId) {
            console.log("Missing IDs", { clientDocumentId, jobDocumentId });
            return;
        }

        router.push(
            `/search-candidates?clientDocumentId=${clientDocumentId}&jobDocumentId=${jobDocumentId}`
        );
    }

    const isInShortlisted = candidateForPopup?.currentProcess === "shortlisted";
    const isInInterview = candidateForPopup?.currentProcess === "interview";
    const isInHired =
        candidateForPopup?.currentProcess === "hired" ||
        candidateForPopup?.currentProcess === "immigration" ||
        candidateForPopup?.currentProcess === "placed";

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="min-h-screen bg-gray-50">
                <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-10">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="text-xl font-bold text-gray-900 sm:text-2xl">
                                Job Board
                            </div>
                            <div className="mt-0.5 text-xs text-gray-500">
                                Manage candidates by pipeline stage
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={scrollToSuggested}
                                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-red-600 hover:bg-red-600 hover:text-white"
                            >
                                Suggested ({suggestedCandidates.length})
                            </button>

                            <button
                                type="button"
                                onClick={scrollToShortlisted}
                                className=" hidden rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-red-600 hover:bg-red-600 hover:text-white"
                            >
                                Shortlisted ({shortlistedCandidates.length})
                            </button>

                            <button
                                type="button"
                                onClick={scrollToInterview}
                                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-red-600 hover:bg-red-600 hover:text-white"
                            >
                                Interview ({requestedInterviewCandidates.length})
                            </button>

                            <button
                                type="button"
                                onClick={scrollToHired}
                                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-red-600 hover:bg-red-600 hover:text-white"
                            >
                                Offered / Immigration / Placed ({hiredCandidates.length})
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mx-auto w-full   space-y-5 px-4 py-4 sm:px-6 lg:px-20">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        {jobLoading ? (
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                                <ClipLoader
                                    size={25}
                                    color="#b91c1c"
                                    speedMultiplier={1}
                                />
                                <div>Loading job & candidates...</div>
                            </div>
                        ) : jobErr ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {jobErr}
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                        <h1 className="truncate text-xl font-bold text-red-700 sm:text-2xl">
                                            {job?.title || "—"}
                                        </h1>

                                        <div className="mt-1 text-xs font-semibold text-gray-500">
                                            Reference:{" "}
                                            <span className="text-gray-800">
                                                {job?.referenceNo || "—"}
                                            </span>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                                                🌍 {job?.location || "—"}
                                            </span>

                                            <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                                                📝 {job?.jobTypeList || "—"}
                                            </span>

                                            <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                                                👥 Vacancies: {job?.vacanciesNo ?? "—"}
                                            </span>

                                            <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                                                👷 Experience: {job?.experience ?? "—"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-2 text-center lg:min-w-[330px]">
                                        <div>
                                            <div className="text-[10px] uppercase tracking-wide text-gray-500">
                                                Status
                                            </div>
                                            <div className="mt-0.5 text-xs font-bold text-gray-900">
                                                {job?.statusList || "—"}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-[10px] uppercase tracking-wide text-gray-500">
                                                Created
                                            </div>
                                            <div className="mt-0.5 text-xs font-bold text-gray-900">
                                                {formatDate(job?.createdAt)}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-[10px] uppercase tracking-wide text-gray-500">
                                                Closing
                                            </div>
                                            <div className="mt-0.5 text-xs font-bold text-gray-900">
                                                {job?.closingDate || "—"}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                            Summary
                                        </div>
                                        <p className="mt-1 line-clamp-3 text-sm leading-5 text-gray-700">
                                            {job?.shortDescription || "—"}
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                            Details
                                        </div>
                                        <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-5 text-gray-700">
                                            {blocksToPlainText(job?.details) || "—"}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex justify-end">

                        {isStaff ? (
                            <button
                                onClick={() => AddNewCandidates(job?.client?.documentId, job?.documentId)}
                                className=" hidden w-full rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 sm:w-auto"
                            >
                                + Add Candidates
                            </button>
                        ) : null}
                    </div>

                    <DropZoneSection id="suggested">
                        <section ref={suggestedRef} className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <SectionHeader title="Suggested Candidates" count={suggestedCandidates.length}>
                                {suggestedCandidates.length > 0 ? (
                                    <button
                                        onClick={handleClearSuggested}
                                        disabled={clearingSuggested}
                                        className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                                    >
                                        {clearingSuggested ? "Clearing..." : "Clear all"}
                                    </button>
                                ) : null}
                            </SectionHeader>

                            {suggestedCandidates.length === 0 ? (
                                <EmptySection text="No suggested candidates. Drop candidates here to mark as Suggested." />
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                    {suggestedCandidates.map((c) => (
                                        <DraggableCandidateCard
                                            key={c.documentId || c.id}
                                            candidate={c}
                                            sectionKey="suggested"
                                        >
                                            {renderCandidateCard(c, "suggested")}
                                        </DraggableCandidateCard>
                                    ))}
                                </div>
                            )}
                        </section>
                    </DropZoneSection>


                    {/** hide  shortlisted Icon */}
                    <DropZoneSection id="shortlisted" >
                        <section ref={shortlistedRef} className=" hidden scroll-mt-24 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <SectionHeader title="Shortlisted Candidates" count={shortlistedCandidates.length} />

                            {shortlistedCandidates.length === 0 ? (
                                <EmptySection text="No shortlisted candidates. Drop candidates here to shortlist." />
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                    {shortlistedCandidates.map((c) => (
                                        <DraggableCandidateCard
                                            key={c.documentId || c.id}
                                            candidate={c}
                                            sectionKey="shortlisted"
                                        >
                                            {renderCandidateCard(c, "shortlisted")}
                                        </DraggableCandidateCard>
                                    ))}
                                </div>
                            )}
                        </section>
                    </DropZoneSection>

                    <DropZoneSection id="interview">
                        <section ref={requestedRef} className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <SectionHeader title="Requested Interviews" count={requestedInterviewCandidates.length} />

                            {requestedInterviewCandidates.length === 0 ? (
                                <EmptySection text="No interview requests yet. Drop candidates here to request interview." />
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                    {requestedInterviewCandidates.map((c) => (
                                        <DraggableCandidateCard
                                            key={c.documentId || c.id}
                                            candidate={c}
                                            sectionKey="interview"
                                        >
                                            {renderCandidateCard(c, "interview")}
                                        </DraggableCandidateCard>
                                    ))}
                                </div>
                            )}
                        </section>
                    </DropZoneSection>

                    <DropZoneSection id="hired">
                        <section ref={hiredRef} className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <SectionHeader title="Offered  / Immigration / Placed Candidates" count={hiredCandidates.length} />

                            {hiredCandidates.length === 0 ? (
                                <EmptySection text="No hired, immigration, or placed candidates yet. Drop candidates here to hire." />
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                    {hiredCandidates.map((c) => (
                                        <DraggableCandidateCard
                                            key={c.documentId || c.id}
                                            candidate={c}
                                            sectionKey="hired"
                                        >
                                            {renderCandidateCard(c, "hired")}
                                        </DraggableCandidateCard>
                                    ))}
                                </div>
                            )}
                        </section>
                    </DropZoneSection>
                </div>
            </div>

            {candidateForPopup && (
                <div
                    className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeCandidate();
                    }}
                >
                    <div className="absolute inset-0 bg-black/50" />

                    <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-6xl sm:rounded-2xl sm:p-6">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="truncate text-lg font-bold sm:text-xl">
                                    Candidate CV / Profile
                                </div>
                                <div className="truncate text-sm text-gray-600">
                                    {candidateForPopup.fullName} • {candidateForPopup.referenceNumber}
                                </div>
                            </div>

                            <button
                                onClick={closeCandidate}
                                className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">

                            {/** hide  shortlisted Icon */}

                            <button
                                onClick={() => moveCandidateTo(candidateForPopup, "shortlisted")}
                                disabled={isInShortlisted}
                                className="hidden w-full rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 sm:w-auto"
                            >
                                Shortlist Candidate
                            </button>

                            <button
                                onClick={() => moveCandidateTo(candidateForPopup, "interview")}
                                disabled={isInInterview}
                                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto"
                            >
                                Request Interview
                            </button>

                            <button
                                onClick={() => moveCandidateTo(candidateForPopup, "hired")}
                                disabled={isInHired}
                                className="w-full rounded-lg bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-red-300 sm:w-auto"
                            >
                                Offer Candidate
                            </button>

                            {isInHired ? (
                                <>
                                    <button
                                        onClick={() => openOfferModal(candidateForPopup)}
                                        className={`w-full rounded-lg px-4 py-2 text-sm text-white sm:w-auto ${candidateForPopup?.offerLetter
                                            ? "bg-blue-600 hover:bg-green-700"
                                            : "bg-orange-500 hover:bg-orange-600"
                                            }`}
                                    >
                                        {candidateForPopup?.offerLetter ? "View Offer Letter" : "Upload Offer Letter"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => openPipelinePopup(candidateForPopup)}
                                        className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:opacity-90 sm:w-auto"
                                    >
                                        Pipeline Update
                                    </button>
                                </>
                            ) : null}
                        </div>

                        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-4">
                                <CandidateAvatar
                                    src={candidateForPopup.avatar}
                                    alt={candidateForPopup.fullName || "Candidate"}
                                    width={112}
                                    height={112}
                                    className="h-24 w-24 rounded-full bg-gray-100 object-cover sm:h-28 sm:w-28"
                                />
                                <div>
                                    <div className="text-xl font-bold text-red-600">
                                        {candidateForPopup.fullName || "—"}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        {candidateForPopup.nationality || "—"}
                                    </div>
                                    <div className="mt-1 text-xs font-semibold text-gray-500">
                                        Current Stage: {normalizeProcessLabel(candidateForPopup?.currentProcess)}
                                    </div>
                                </div>
                            </div>

                            <div className="sm:ml-auto">
                                <VerifiedBadge ok={!!candidateForPopup.isProfileVerified} />
                            </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-gray-200 p-3">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                {[
                                    ["Reference", candidateForPopup.referenceNumber],
                                    ...(isStaff ? [["Agent", candidateForPopup.agentName || "No Agent"]] : []),
                                    ["Full Name", candidateForPopup.fullName],
                                    ["First Name", candidateForPopup.firstName],
                                    ["Last Name", candidateForPopup.lastName],
                                    ...(isStaff
                                        ? [
                                            ["Username", candidateForPopup.username],
                                            ["Email", candidateForPopup.email],
                                            ["Mobile", candidateForPopup.mobile],
                                        ]
                                        : []),
                                    ["Birth Date", candidateForPopup.birthDate],
                                    ["Gender", candidateForPopup.gender],
                                    ["Nationality", candidateForPopup.nationality],
                                    ["Marital Status", candidateForPopup.maritalStatusList],
                                    ["Seasonal Status", candidateForPopup.seasonalStatusList],
                                    ["English Level", candidateForPopup.englishLevelList],
                                    ...(isStaff
                                        ? [["Previous Company", candidateForPopup.previousCompany],
                                        [
                                            "Previous Job Experience",
                                            candidateForPopup.previousJobExperiece
                                                ? `${candidateForPopup.previousJobExperiece}Y`
                                                : "—",
                                        ],
                                        ["Current Company", candidateForPopup.currentCompany],
                                        [
                                            "Current Job Experience",
                                            candidateForPopup.currentJobExperiece
                                                ? `${candidateForPopup.currentJobExperiece}Y`
                                                : "—",
                                        ],
                                        ["Passport Expiry", candidateForPopup.passportExpireDate],

                                        ]
                                        : []),
                                ].map(([k, v]) => (
                                    <div className="text-xs" key={k}>
                                        <div className="text-gray-500">{k}</div>
                                        <div className="font-semibold text-gray-800">{v || "—"}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                <div className="text-sm">
                                    <div className="text-gray-700">Short Summary</div>
                                    <div className="text-gray-800">
                                        {candidateForPopup.shortSummary || "—"}
                                    </div>
                                </div>

                                {isStaff ? (
                                    <div className="text-sm">
                                        <div className="text-gray-700">Private Notes</div>
                                        <div className="text-gray-800">
                                            {candidateForPopup.privateNotes || "—"}
                                        </div>
                                    </div>
                                ) : null}




                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                            <div className="rounded-xl border border-gray-300 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-base text-gray-800">Passport</div>
                                    {candidateForPopup.passportUrl ? (
                                        <a
                                            href={candidateForPopup.passportUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:opacity-90"
                                        >
                                            Download
                                        </a>
                                    ) : (
                                        <span className="text-xs text-gray-500">No file</span>
                                    )}
                                </div>
                                {isStaff ? (<div className="mt-2 text-xs text-gray-800">
                                    Expiry: {candidateForPopup.passportExpireDate || "—"}
                                </div>) : null}
                            </div>

                            <div className="rounded-xl border border-gray-300 p-3">
                                <div className="text-sm text-gray-800">Working Video</div>
                                <div className="mt-2">
                                    {isValidLink(candidateForPopup?.workingVideoLink) ? (
                                        <a
                                            href={candidateForPopup.workingVideoLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-block rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:opacity-90"
                                        >
                                            Open Video
                                        </a>
                                    ) : (
                                        <div className="text-xs text-gray-500">None</div>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-300 p-3">
                                <div className="text-sm text-gray-800">MI Screening Video</div>
                                <div className="mt-2">
                                    {isValidLink(candidateForPopup?.miScreeningVideoLink) ? (
                                        <a
                                            href={candidateForPopup.miScreeningVideoLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-block rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:opacity-90"
                                        >
                                            Open Video
                                        </a>
                                    ) : (
                                        <div className="text-xs text-gray-500">None</div>
                                    )}
                                </div>
                                <div className="mt-2 text-xs text-gray-800">
                                    Screening Date: {candidateForPopup?.dateScreeningInterview || "—"}
                                </div>
                            </div>
                        </div>

                        {candidateForPopup?.offerLetter ? (
                            <div className="mt-4 rounded-xl border border-gray-300 p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">Offer Letter</div>
                                        <div className="text-xs text-gray-600">
                                            {candidateForPopup.offerLetter?.name || "Offer Letter"}
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        {candidateForPopup.offerLetter?.url ? (
                                            <a
                                                href={adminMediaUrl(candidateForPopup.offerLetter.url)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:opacity-90"
                                            >
                                                View Offer Letter
                                            </a>
                                        ) : null}

                                        <button
                                            onClick={() => openOfferModal(candidateForPopup)}
                                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                                        >
                                            Edit Offer Letter
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="mt-4 rounded-xl border border-gray-300 p-3">
                            <div className="text-sm text-gray-800">
                                Documents ({candidateForPopup?.documents?.length || 0})
                            </div>

                            <div className="mt-3 space-y-2">
                                {(candidateForPopup?.documents || []).map((d, idx) => (
                                    <div
                                        key={idx}
                                        className="flex flex-col gap-2 rounded-xl border border-gray-300 bg-gray-50 p-3 sm:flex-row sm:items-center"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm text-gray-800">
                                                {d?.name || "—"}
                                            </div>
                                            <div className="text-xs text-gray-800">
                                                Remarks:{" "}
                                                <span className="text-gray-800">{d?.remarks || "—"}</span>
                                            </div>
                                        </div>

                                        {d?.url ? (
                                            <a
                                                href={d.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-center text-sm text-white hover:opacity-90 sm:w-auto"
                                            >
                                                Download
                                            </a>
                                        ) : (
                                            <span className="text-xs text-gray-500">No file</span>
                                        )}
                                    </div>
                                ))}

                                {(candidateForPopup?.documents || []).length === 0 ? (
                                    <div className="text-xs text-gray-500">No documents</div>
                                ) : null}
                            </div>
                        </div>

                        <CvPreview
                            key={candidateForPopup.cvUrl || "no-cv"}
                            cvUrl={candidateForPopup.cvUrl}
                        />

                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={closeCandidate}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pipelinePopup.open && pipelinePopup.candidate ? (
                <PipelineUpdatePopup
                    job={job}
                    candidate={pipelinePopup.candidate}
                    onClose={closePipelinePopup}
                    onUpdated={() => {
                        // optional: keep popup open, refresh page data manually if needed
                    }}
                />
            ) : null}

            {offerModal.open && offerModal.candidate ? (
                <OfferLetterModal
                    key={offerModal.candidate.documentId || offerModal.candidate.id}
                    open
                    candidate={offerModal.candidate}
                    onClose={closeOfferModal}
                    onUpload={handleUploadOfferLetter}
                    onRemove={handleRemoveOfferLetter}
                    submitting={offerSubmitting}
                    error={offerError}
                />
            ) : null}

            {removeConfirmModal.open && removeConfirmModal.candidate ? (
                <ConfirmRemoveModal
                    key={
                        removeConfirmModal.candidate.documentId ||
                        removeConfirmModal.candidate.id
                    }
                    open
                    candidate={removeConfirmModal.candidate}
                    submitting={!!removingCandidateId}
                    onConfirm={handleRemoveCandidateConfirmed}
                    onNo={closeRemoveConfirmModal}
                    onCancel={closeRemoveConfirmModal}
                />
            ) : null}

            <DragOverlay>
                {activeDragCandidate ? (
                    <div className="w-72 rounded-xl border border-red-200 bg-white p-3 shadow-2xl">
                        <div className="flex items-center gap-3">
                            <CandidateAvatar
                                src={activeDragCandidate.avatar}
                                alt={activeDragCandidate.fullName || "Candidate"}
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-full object-cover"
                            />
                            <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-gray-900">
                                    {activeDragCandidate.fullName || "—"}
                                </div>
                                <div className="truncate text-xs text-gray-500">
                                    Ref: {activeDragCandidate.referenceNumber || "—"}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}