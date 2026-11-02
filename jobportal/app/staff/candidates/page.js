"use client";

import useAuthClient from "@/lib/useAuthClient";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClipLoader } from "react-spinners";

/* ✅ Default profile image (fallback) */
const DEFAULT_AVATAR =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <rect width="100%" height="100%" fill="#f3f4f6"/>
    <circle cx="150" cy="120" r="55" fill="#d1d5db"/>
    <rect x="70" y="200" width="160" height="30" rx="15" fill="#d1d5db"/>
    <text x="150" y="265" text-anchor="middle" font-family="Arial" font-size="18" fill="#6b7280">
      Profile
    </text>
  </svg>
`);

const DELETE_CONFIRM_TEXT = "permeability delete";
const CANDIDATE_PAGE_SIZE = 15;

function safeImgSrc(src) {
    const s = (src || "").trim();
    return s ? s : DEFAULT_AVATAR;
}

function passthroughImageLoader({ src }) {
    return src;
}

function SafeImage({ src, alt, width, height, className }) {
    const [failed, setFailed] = useState(false);
    const resolvedSrc = failed ? DEFAULT_AVATAR : safeImgSrc(src);

    return (
        <Image
            loader={passthroughImageLoader}
            unoptimized
            src={resolvedSrc}
            alt={alt || "Image"}
            width={width}
            height={height}
            className={className}
            onError={() => setFailed(true)}
        />
    );
}

function isPdfUrl(url) {
    if (!url) return false;
    return String(url).toLowerCase().includes(".pdf");
}

function isValidLink(url) {
    return url;
}

function proxyMediaUrl(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    return `/api/media/proxy?url=${encodeURIComponent(s)}`;
}

async function fetchJsonSafe(url, options = {}) {
    const res = await fetch(url, { cache: "no-store", ...options });
    const text = await res.text();
    let json;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(`API returned non-JSON (status ${res.status}). First bytes: ${text.slice(0, 80)}`);
    }
    if (!res.ok || json?.ok === false) throw new Error(json?.error || `Request failed (${res.status})`);
    return json;
}


async function fetchAgents() {
    const res = await fetch("/api/candidates/agents", {
        method: "GET",
        cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to fetch agents");
    }

    return Array.isArray(json?.items) ? json.items : [];
}

function agentLabel(agent) {
    if (!agent) return "No Agent";
    const company = agent.companyName || agent.label || "";
    const contact = agent.contactName || "";
    return contact ? `${company} (${contact})` : company || "--";
}

function unwrapStrapiRelation(value) {
    if (!value) return null;

    if (value?.data?.attributes) {
        return {
            id: value.data.id,
            documentId: value.data.documentId,
            ...value.data.attributes,
        };
    }

    if (value?.attributes) {
        return {
            id: value.id,
            documentId: value.documentId,
            ...value.attributes,
        };
    }

    if (value?.data && !Array.isArray(value.data)) {
        return value.data;
    }

    return value;
}

function getAgentName(source) {
    const formDefaults = source?.formDefaults || {};
    const directName =
        source?.agentName ||
        formDefaults?.agentName ||
        source?.agentLabel ||
        formDefaults?.agentLabel ||
        "";

    if (String(directName || "").trim()) {
        return String(directName).trim();
    }

    const agent = unwrapStrapiRelation(formDefaults?.agent || source?.agent);

    if (!agent) return "No Agent";

    return agentLabel({
        companyName: agent.companyName || agent.label || agent.name || "",
        contactName: agent.contactName || "",
    });
}


function getAgentDocumentId(source) {
    const formDefaults = source?.formDefaults || {};
    const agent = unwrapStrapiRelation(formDefaults?.agent || source?.agent);

    return (
        source?.agentDocumentId ||
        formDefaults?.agentDocumentId ||
        agent?.documentId ||
        agent?.id ||
        ""
    );
}

function VerifiedIcon({ ok }) {
    return (
        <span title={ok ? "Verified" : "Not Verified"} className="inline-flex items-center justify-center">
            {ok ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-green-700">
                    <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-500">
                    <path
                        fill="currentColor"
                        d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"
                    />
                </svg>
            )}
        </span>
    );
}

function StatusPill({ status }) {
    const s = (status || "").toLowerCase();
    const cls =
        s === "available"
            ? "border-green-200 bg-green-50 text-green-700"
            : s === "working"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : s === "on hold"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : s === "blacklisted"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-gray-200 bg-gray-50 text-gray-700";

    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${cls}`}>{status || "—"}</span>;
}

function InfoChip({ label, value }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
            <span className="text-gray-800">{label}</span>
            <span className="text-gray-900">{value}</span>
        </span>
    );
}

function rolesLabel(roles = []) {
    if (!roles?.length) return "—";
    if (roles.length === 1) return roles[0];
    return `${roles[0]} +${roles.length - 1}`;
}

function rolesLabelName(roles = []) {
    if (!roles?.length) return "—";
    return roles.join(", ");
}

function isVerifiedValue(v) {
    const s = String(v || "").toLowerCase();
    return s === "verified" || s === "yes" || s === "true";
}

function ExportExcelIcon({ className = "h-4 w-4" }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path
                fill="currentColor"
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM8.1 10h2.1l1.15 2.05L12.55 10h2.05l-2.1 3.35L14.75 17h-2.1l-1.3-2.25L10.05 17H8l2.25-3.65L8.1 10Z"
            />
        </svg>
    );
}

async function downloadExcelExport({ mode, selectedDocumentIds = [], q = "" }) {
    const res = await fetch("/api/export/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, selectedDocumentIds, q }),
    });

    if (!res.ok) {
        let message = `Export failed (${res.status})`;
        try {
            const json = await res.json();
            message = json?.error || message;
        } catch {
            // response is not JSON
        }
        throw new Error(message);
    }

    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `candidates-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
}

function ImportExcelIcon({ className = "h-4 w-4" }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path
                fill="currentColor"
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM8 11h8v2H8v-2Zm0 4h5v2H8v-2Zm6.8-1.9 1.4 1.4L14 16.7l-2.2-2.2 1.4-1.4.8.8.8-.8Z"
            />
        </svg>
    );
}

async function downloadImportTemplate() {
    const res = await fetch("/api/import/candidates/template", {
        method: "GET",
        cache: "no-store",
    });

    if (!res.ok) {
        let message = `Template download failed (${res.status})`;
        try {
            const json = await res.json();
            message = json?.error || message;
        } catch {
            // response is not JSON
        }
        throw new Error(message);
    }

    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || "candidate-import-template.xlsx";

    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
}

async function uploadCandidateImport({ mode, file }) {
    const fd = new FormData();
    fd.append("mode", mode);
    fd.append("file", file);

    const res = await fetch("/api/import/candidates", {
        method: "POST",
        body: fd,
    });

    const text = await res.text();
    let json;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(`Import API returned non-JSON (status ${res.status}). First bytes: ${text.slice(0, 80)}`);
    }

    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Import failed (${res.status})`);
    }

    return json;
}

function DeleteIcon({ className = "h-4 w-4" }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path
                fill="currentColor"
                d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9h6V9h2v11H7V9Z"
            />
        </svg>
    );
}

async function deleteSelectedCandidates({ documentIds, confirmationText, actor }) {
    const res = await fetch("/api/candidates/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            documentIds,
            confirmationText,
            actor,
        }),
    });

    const text = await res.text();
    let json;

    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(`Delete API returned non-JSON (status ${res.status}). First bytes: ${text.slice(0, 80)}`);
    }

    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Delete failed (${res.status})`);
    }

    return json;
}

export default function CandidatesPage() {
    const router = useRouter();
    const { user, role, authLoading } = useAuthClient();
    const roleName = String(role?.name || user?.role?.name || role || user?.role || "").toLowerCase();
    const isStaff = roleName === "staff";
    const canViewPrivateCandidateFields = isStaff;
    const canViewAgent = isStaff;
    const tableColumnCount = isStaff ? 12 : 9;

    useEffect(() => {
        if (authLoading) return;


        //if (role === "clients" || role === "staff") {
        if (roleName === "staff") {
            // do nothing
        } else if (roleName === "candidates") {
            router.replace("/candidate");
        } else if (roleName === "clients") {
            router.replace("/client");
        }

    }, [role, roleName, authLoading, router]);

    const [search, setSearch] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");
    const [agentFilter, setAgentFilter] = useState("all");
    const [agents, setAgents] = useState([]);
    const [agentsError, setAgentsError] = useState("");

    const [page, setPage] = useState(1);

    const [rows, setRows] = useState([]);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);

    const [loadingTable, setLoadingTable] = useState(true);
    const [tableError, setTableError] = useState("");

    const [selectedCandidate, setSelectedCandidate] = useState(null);

    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [detail, setDetail] = useState(null);

    const [cvLoading, setCvLoading] = useState(false);
    const [cvFailed, setCvFailed] = useState(false);
    const [cvError, setCvError] = useState("");
    const [cvObjectUrl, setCvObjectUrl] = useState("");
    const [cvRetryKey, setCvRetryKey] = useState(0);

    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState("");

    const [importMenuOpen, setImportMenuOpen] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importMode, setImportMode] = useState("new");
    const [importFile, setImportFile] = useState(null);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState("");
    const [importReport, setImportReport] = useState(null);
    const [templateLoading, setTemplateLoading] = useState(false);

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deletingCandidates, setDeletingCandidates] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [deleteReport, setDeleteReport] = useState(null);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(search.trim()), 350);
        return () => clearTimeout(t);
    }, [search]);


    useEffect(() => {
        if (authLoading || !isStaff) return undefined;

        let alive = true;

        Promise.resolve()
            .then(() => fetchAgents())
            .then((list) => {
                if (!alive) return;
                setAgents(list);
                setAgentsError("");
            })
            .catch((error) => {
                console.error("Fetch agents error:", error);
                if (!alive) return;
                setAgents([]);
                setAgentsError(error?.message || "Failed to fetch agents");
            });

        return () => {
            alive = false;
        };
    }, [authLoading, isStaff]);

    const effectiveAgentFilter = isStaff ? agentFilter : "all";

    async function loadCandidates(nextPage = page, q = debouncedQ, selectedAgent = effectiveAgentFilter) {
        setLoadingTable(true);
        setTableError("");
        try {
            const safeAgentFilter = isStaff ? selectedAgent || "all" : "all";
            const url = `/api/candidates/list?page=${nextPage}&pageSize=${CANDIDATE_PAGE_SIZE}&q=${encodeURIComponent(q || "")}&agent=${encodeURIComponent(safeAgentFilter)}`;
            const json = await fetchJsonSafe(url);
            setRows(Array.isArray(json.items) ? json.items : []);
            setPageCount(Number(json.pageCount || 1));
            setTotal(Number(json.total || 0));
        } catch (e) {
            setTableError(e?.message || "Failed to load candidates");
            setRows([]);
            setPageCount(1);
            setTotal(0);
        } finally {
            setLoadingTable(false);
        }
    }

    useEffect(() => {
        if (authLoading) return undefined;

        const controller = new AbortController();
        let active = true;
        const url = `/api/candidates/list?page=${page}&pageSize=${CANDIDATE_PAGE_SIZE}&q=${encodeURIComponent(debouncedQ || "")}&agent=${encodeURIComponent(effectiveAgentFilter)}`;

        Promise.resolve()
            .then(() => {
                if (!active) return null;
                setLoadingTable(true);
                setTableError("");
                return fetchJsonSafe(url, { signal: controller.signal });
            })
            .then((json) => {
                if (!active || !json) return;
                setRows(Array.isArray(json.items) ? json.items : []);
                setPageCount(Number(json.pageCount || 1));
                setTotal(Number(json.total || 0));
            })
            .catch((error) => {
                if (!active || error?.name === "AbortError") return;
                setTableError(error?.message || "Failed to load candidates");
                setRows([]);
                setPageCount(1);
                setTotal(0);
            })
            .finally(() => {
                if (active) setLoadingTable(false);
            });

        return () => {
            active = false;
            controller.abort();
        };
    }, [authLoading, page, debouncedQ, effectiveAgentFilter]);

    function closeCandidate() {
        setSelectedCandidate(null);
        setDetail(null);
        setDetailError("");
        setDetailLoading(false);

        setCvLoading(false);
        setCvFailed(false);
        setCvError("");
        setCvObjectUrl("");
    }

    useEffect(() => {
        if (!selectedCandidate) return;
        const onKey = (e) => e.key === "Escape" && closeCandidate();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedCandidate]);

    useEffect(() => {
        if (!selectedCandidate) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => (document.body.style.overflow = prev);
    }, [selectedCandidate]);

    async function openCandidate(c) {
        setSelectedCandidate(c);
        setDetail(null);
        setDetailError("");
        setDetailLoading(true);

        try {
            const json = await fetchJsonSafe(`/api/candidates/getcandidate/${c.documentId}`);
            setDetail(json);
            console.log("Candidate detail:", json);
            const cvUrl = json?.existingMedia?.CV?.url || "";
            setCvObjectUrl("");
            setCvError("");

            if (isPdfUrl(cvUrl)) {
                setCvLoading(true);
                setCvFailed(false);
            } else {
                setCvLoading(false);
                setCvFailed(false);
            }
        } catch (e) {
            setDetailError(e?.message || "Failed to load candidate details");
        } finally {
            setDetailLoading(false);
        }
    }


    useEffect(() => {
        const cvUrl = detail?.existingMedia?.CV?.url || "";

        if (!selectedCandidate || !isPdfUrl(cvUrl)) {
            setCvObjectUrl("");
            return undefined;
        }

        const controller = new AbortController();
        let objectUrl = "";
        let active = true;

        setCvLoading(true);
        setCvFailed(false);
        setCvError("");
        setCvObjectUrl("");

        async function loadPdfPreview() {
            try {
                const response = await fetch(proxyMediaUrl(cvUrl), {
                    method: "GET",
                    cache: "no-store",
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const responseText = await response.text();
                    let message = `CV preview request failed (${response.status})`;

                    try {
                        const json = responseText ? JSON.parse(responseText) : null;
                        message = json?.error || message;
                    } catch {
                        if (responseText) {
                            message = `${message}: ${responseText.slice(0, 120)}`;
                        }
                    }

                    throw new Error(message);
                }

                const contentType = String(
                    response.headers.get("content-type") || ""
                ).toLowerCase();

                if (
                    contentType &&
                    !contentType.includes("application/pdf") &&
                    !contentType.includes("application/octet-stream")
                ) {
                    throw new Error(
                        `The server returned "${contentType}" instead of a PDF.`
                    );
                }

                const pdfBlob = await response.blob();

                if (!active) return;

                objectUrl = URL.createObjectURL(
                    pdfBlob.type
                        ? pdfBlob
                        : new Blob([pdfBlob], { type: "application/pdf" })
                );

                setCvObjectUrl(objectUrl);
            } catch (error) {
                if (!active || error?.name === "AbortError") return;

                console.error("CV preview error:", error);
                setCvFailed(true);
                setCvError(error?.message || "CV preview failed to load");
            } finally {
                if (active) {
                    setCvLoading(false);
                }
            }
        }

        loadPdfPreview();

        return () => {
            active = false;
            controller.abort();

            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [selectedCandidate, detail?.existingMedia?.CV?.url, cvRetryKey]);

    const selectedCount = selectedIds.size;

    const visibleSelectableIds = useMemo(
        () => rows.map((c) => String(c.documentId || "")).filter(Boolean),
        [rows]
    );

    const allVisibleSelected =
        visibleSelectableIds.length > 0 &&
        visibleSelectableIds.every((id) => selectedIds.has(id));

    const deleteDetails = useMemo(() => {
        if (!deleteReport) return [];

        const deletedRows = (deleteReport.deletedCandidates || []).map((x) => ({
            documentId: x.documentId,
            fullName: x.name || x.fullName || "",
            status: "Deleted",
            message: "Candidate deleted successfully.",
        }));

        const failedRows = (deleteReport.failedCandidateDeletes || []).map((x) => ({
            documentId: x.documentId,
            fullName: x.name || x.fullName || "",
            status: "Failed",
            message: x.error || "Candidate delete failed.",
        }));

        const fetchErrorRows = (deleteReport.fetchErrors || []).map((x) => ({
            documentId: x.documentId,
            fullName: "",
            status: "Skipped",
            message: x.error || "Candidate could not be loaded.",
        }));

        return [...deletedRows, ...failedRows, ...fetchErrorRows];
    }, [deleteReport]);

    function toggleCandidateSelection(documentId) {
        const id = String(documentId || "");
        if (!id) return;

        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleVisibleSelection() {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleSelectableIds.forEach((id) => next.delete(id));
            } else {
                visibleSelectableIds.forEach((id) => next.add(id));
            }
            return next;
        });
    }

    async function handleExport(mode) {
        setExportError("");
        setExportMenuOpen(false);

        if (mode === "selected" && selectedIds.size === 0) {
            setExportError("Please select at least one candidate to export.");
            return;
        }

        setExporting(true);
        try {
            await downloadExcelExport({
                mode,
                selectedDocumentIds: Array.from(selectedIds),
                q: mode === "all" ? "" : debouncedQ || "",
            });
        } catch (e) {
            setExportError(e?.message || "Failed to export candidates");
        } finally {
            setExporting(false);
        }
    }

    function openImportModal(mode) {
        setImportMode(mode);
        setImportFile(null);
        setImportError("");
        setImportReport(null);
        setImportMenuOpen(false);
        setImportModalOpen(true);
    }

    function closeImportModal() {
        if (importing) return;
        setImportModalOpen(false);
        setImportFile(null);
        setImportError("");
    }

    async function handleTemplateDownload() {
        setImportError("");
        setTemplateLoading(true);

        try {
            await downloadImportTemplate();
        } catch (e) {
            setImportError(e?.message || "Failed to download template");
        } finally {
            setTemplateLoading(false);
        }
    }

    async function handleImportSubmit() {
        setImportError("");
        setImportReport(null);

        if (!importFile) {
            setImportError("Please select an Excel file first.");
            return;
        }

        setImporting(true);

        try {
            const json = await uploadCandidateImport({
                mode: importMode,
                file: importFile,
            });

            setImportReport({
                totalRows: Number(json?.totalRows || 0),
                created: Number(json?.created || 0),
                updated: Number(json?.updated || 0),
                skipped: Number(json?.skipped || 0),
                details: Array.isArray(json?.report) ? json.report : [],
            });
            await loadCandidates(1, debouncedQ, agentFilter);
            setPage(1);
        } catch (e) {
            setImportError(e?.message || "Failed to import candidates");
        } finally {
            setImporting(false);
        }
    }

    function openDeleteModal() {
        if (!isStaff) return;
        setDeleteError("");
        setDeleteReport(null);
        setDeleteConfirmText("");
        setDeleteModalOpen(true);
    }

    function closeDeleteModal() {
        if (deletingCandidates) return;
        setDeleteModalOpen(false);
        setDeleteConfirmText("");
        setDeleteError("");
    }

    async function handleDeleteSelected() {
        if (!isStaff) {
            setDeleteError("Only staff can delete candidates.");
            return;
        }

        setDeleteError("");
        setDeleteReport(null);

        if (selectedIds.size === 0) {
            setDeleteError("Please select at least one candidate to delete.");
            return;
        }

        if (deleteConfirmText.trim().toLowerCase() !== DELETE_CONFIRM_TEXT) {
            setDeleteError(`Please type "${DELETE_CONFIRM_TEXT}" exactly to confirm deletion.`);
            return;
        }

        const roleName =
            role?.name ||
            user?.role?.name ||
            user?.role ||
            user?.type ||
            "Unknown";

        const userName =
            user?.name ||
            user?.fullName ||
            user?.username ||
            user?.email ||
            "Unknown User";

        setDeletingCandidates(true);

        try {
            const json = await deleteSelectedCandidates({
                documentIds: Array.from(selectedIds),
                confirmationText: deleteConfirmText,
                actor: {
                    name: userName,
                    userType: roleName,
                    email: user?.email || "",
                    id: user?.id || null,
                },
            });

            setDeleteReport(json);

            const deletedIds = new Set(
                (json?.deletedCandidates || [])
                    .map((x) => String(x.documentId || ""))
                    .filter(Boolean)
            );

            setSelectedIds((prev) => {
                const next = new Set(prev);
                deletedIds.forEach((id) => next.delete(id));
                return next;
            });

            await loadCandidates(1, debouncedQ, agentFilter);
            setPage(1);
        } catch (e) {
            setDeleteError(e?.message || "Failed to delete selected candidates");
        } finally {
            setDeletingCandidates(false);
        }
    }

    const headerText = useMemo(() => {
        const q = (debouncedQ || "").trim();
        const agent = (agentFilter || "all").trim();

        const agentText =
            agent === "none"
                ? "No Agent"
                : agent !== "all"
                    ? (agents.find((a) => a.documentId === agent)?.companyName || "Selected Agent")
                    : "";

        if (!q && agent === "all") return `(${total} candidates)`;
        if (q && agent !== "all") return `(${total} results for "${q}" / ${agentText})`;
        if (q) return `(${total} results for "${q}")`;
        return `(${total} candidates / ${agentText})`;
    }, [debouncedQ, total, agentFilter, agents]);

    const selectedCandidateAgentName = useMemo(() => {
        if (!selectedCandidate) return "No Agent";

        return getAgentName({
            ...selectedCandidate,
            ...(detail || {}),
            formDefaults: {
                ...(detail?.formDefaults || {}),
                agentName: detail?.formDefaults?.agentName || selectedCandidate.agentName || "",
                agent: detail?.formDefaults?.agent || selectedCandidate.agent || null,
            },
        });
    }, [detail, selectedCandidate]);

    function getCandidateAgentDisplay(candidate) {
        const directName = getAgentName(candidate);

        if (directName !== "No Agent") return directName;

        const agentDocumentId = String(getAgentDocumentId(candidate) || "");
        const matchedAgent = agents.find((agent) =>
            String(agent.documentId || agent.id || "") === agentDocumentId
        );

        return matchedAgent ? agentLabel(matchedAgent) : directName;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="topHeading">
                Candidates
            </div>

            <main className="mt-10 mx-auto w-[95%] lg:w-[90%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <header className="border-b border-gray-200 bg-white px-4 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="text-lg text-gray-900">Candidates</div>
                                <div className="text-sm text-gray-800">Number Of Candidates • {headerText}</div>
                                {isStaff ? (
                                    <div className="text-xs text-gray-500">Selected for export: {selectedCount}</div>
                                ) : null}
                            </div>

                            <div className="flex w-full sm:w-auto items-center gap-2 sm:justify-end">
                                <div className="relative w-full sm:w-lg">
                                    <input
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setPage(1);
                                        }}
                                        placeholder={isStaff ? "Search (name/ref/phone/email/role)..." : "Search (name/ref/role)..."}
                                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-10 text-sm text-gray-800 outline-none  focus:border-red-200 focus:ring-2 focus:ring-red-300"
                                    />
                                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 text-2xl">⌕</span>
                                </div>

                                {isStaff ? (
                                    <select
                                        value={agentFilter}
                                        onChange={(e) => {
                                            setAgentFilter(e.target.value);
                                            setPage(1);
                                        }}
                                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-300"
                                        title={agentsError || "Filter by agent"}
                                    >
                                        <option value="all">Show All Agents</option>
                                        <option value="none">No Agent</option>
                                        {agents.map((a) => (
                                            <option key={a.documentId} value={a.documentId}>
                                                {agentLabel(a)}
                                            </option>
                                        ))}
                                    </select>
                                ) : null}

                                {isStaff ? (
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setExportMenuOpen((v) => !v)}
                                            disabled={exporting}
                                            className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 hover:bg-green-100 disabled:opacity-50 whitespace-nowrap"
                                            title="Export candidates to Excel"
                                        >
                                            {exporting ? (
                                                <ClipLoader size={16} color="#166534" />
                                            ) : (
                                                <ExportExcelIcon className="h-4 w-4" />
                                            )}
                                            {exporting ? "Exporting..." : "Export"}
                                        </button>

                                        {exportMenuOpen && (
                                            <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                                                <button
                                                    type="button"
                                                    onClick={() => handleExport("all")}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                                                >
                                                    <ExportExcelIcon className="mt-0.5 h-5 w-5 text-green-700" />
                                                    <span>
                                                        <span className="block text-gray-900">Export all candidates</span>
                                                        <span className="block text-xs text-gray-500">Exports every published candidate from Strapi.</span>
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleExport("selected")}
                                                    disabled={selectedCount === 0}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <ExportExcelIcon className="mt-0.5 h-5 w-5 text-green-700" />
                                                    <span>
                                                        <span className="block text-gray-900">Export selected candidates</span>
                                                        <span className="block text-xs text-gray-500">{selectedCount} selected across pagination.</span>
                                                    </span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {isStaff ? (
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setImportMenuOpen((v) => !v)}
                                            disabled={importing}
                                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
                                            title="Import candidates from Excel"
                                        >
                                            {importing ? (
                                                <ClipLoader size={16} color="#1d4ed8" />
                                            ) : (
                                                <ImportExcelIcon className="h-4 w-4" />
                                            )}
                                            {importing ? "Importing..." : "Import"}
                                        </button>

                                        {importMenuOpen && (
                                            <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                                                <button
                                                    type="button"
                                                    onClick={() => openImportModal("new")}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                                                >
                                                    <ImportExcelIcon className="mt-0.5 h-5 w-5 text-blue-700" />
                                                    <span>
                                                        <span className="block text-gray-900">Import new data</span>
                                                        <span className="block text-xs text-gray-500">Ignores documentId and Reference Number columns.</span>
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => openImportModal("update")}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                                                >
                                                    <ImportExcelIcon className="mt-0.5 h-5 w-5 text-blue-700" />
                                                    <span>
                                                        <span className="block text-gray-900">Update existing data</span>
                                                        <span className="block text-xs text-gray-500">Requires valid documentId and Reference Number.</span>
                                                    </span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {isStaff && selectedCount > 0 ? (
                                    <button
                                        type="button"
                                        onClick={openDeleteModal}
                                        disabled={deletingCandidates}
                                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 hover:bg-red-100 disabled:opacity-50 whitespace-nowrap"
                                        title="Delete selected candidates"
                                    >
                                        {deletingCandidates ? (
                                            <ClipLoader size={16} color="#991b1b" />
                                        ) : (
                                            <DeleteIcon className="h-4 w-4" />
                                        )}
                                        Delete ({selectedCount})
                                    </button>
                                ) : null}

                                <button
                                    type="button"
                                    onClick={() => loadCandidates(page, debouncedQ, agentFilter)}
                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                                    title="Reload from DB"
                                >
                                    Refresh
                                </button>

                                {isStaff && (
                                    <Link
                                        href="/staff/candidates/new"
                                        className="rounded-xl bg-red-700 px-3 py-2 text-sm text-white hover:opacity-90 whitespace-nowrap"
                                    >
                                        + Create New
                                    </Link>
                                )}
                            </div>
                        </div>
                    </header>

                    {isStaff && exportError ? (
                        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                            {exportError}
                        </div>
                    ) : null}

                    {isStaff && importReport ? (
                        <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
                            Import report: Total rows {importReport.totalRows || 0}, Created {importReport.created || 0}, Updated {importReport.updated || 0}, Skipped {importReport.skipped || 0}.
                        </div>
                    ) : null}

                    {isStaff && deleteReport ? (
                        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                            Delete report: Deleted {deleteReport.deletedCount || 0}, Failed {(deleteReport.failedCandidateDeletes || []).length}, Media deleted {deleteReport.deletedMediaCount || 0}, Log created: {deleteReport.logCreated ? "Yes" : "No"}.
                        </div>
                    ) : null}

                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr className="text-xs uppercase text-gray-800">
                                    {isStaff ? (
                                        <th className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={allVisibleSelected}
                                                onChange={toggleVisibleSelection}
                                                disabled={visibleSelectableIds.length === 0}
                                                className="h-4 w-4 rounded border-gray-300 text-red-700 focus:ring-red-500"
                                                title="Select all visible candidates"
                                            />
                                        </th>
                                    ) : null}
                                    <th className="px-3 py-2">Id</th>
                                    <th className="px-3 py-2">Profile</th>
                                    <th className="px-3 py-2">Ref</th>
                                    <th className="px-3 py-2">Name</th>
                                    {isStaff ? <th className="px-3 py-2">Phone</th> : null}
                                    {isStaff ? <th className="px-3 py-2">Agent</th> : null}
                                    <th className="px-3 py-2">Nationality</th>
                                    <th className="px-3 py-2">Roles</th>
                                    <th className="px-3 py-2">Job Status</th>
                                    <th className="px-3 py-2">Verified</th>
                                    <th className="px-3 py-2">Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loadingTable || authLoading ? (
                                    <tr>
                                        <td colSpan={tableColumnCount} className="px-3 py-6 text-sm text-gray-800">
                                            <div className="flex items-center justify-center gap-3">
                                                <ClipLoader size={25} color="#b91c1c" />
                                                <span>Loading candidates...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : tableError ? (
                                    <tr>
                                        <td colSpan={tableColumnCount} className="px-3 py-6 text-sm text-red-700">
                                            {tableError}
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={tableColumnCount} className="px-3 py-6 text-sm text-gray-800">
                                            No candidates found.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((c) => (
                                        <tr key={c.documentId || c.id} className="border-b border-gray-200 hover:bg-gray-50">
                                            {isStaff ? (
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(String(c.documentId || ""))}
                                                        onChange={() => toggleCandidateSelection(c.documentId)}
                                                        className="h-4 w-4 rounded border-gray-300 text-red-700 focus:ring-red-500"
                                                        aria-label={`Select ${c.fullName || c.referenceNumber || "candidate"}`}
                                                    />
                                                </td>
                                            ) : null}
                                            <td className="px-3 py-2">{c.id}</td>
                                            <td className="px-3 py-2">
                                                <SafeImage
                                                    src={c.profileImageUrl}
                                                    alt={c.fullName || "Candidate"}
                                                    width={36}
                                                    height={36}
                                                    className="h-9 w-9 rounded-xl border border-gray-200 bg-white object-cover"
                                                />
                                            </td>

                                            <td className="px-3 py-2 text-sm text-gray-900">{c.referenceNumber || "—"}</td>

                                            <td className="px-3 py-2 text-sm text-gray-900">
                                                {c.fullName || "—"}
                                                {isStaff ? <div className="text-xs text-gray-500">{c.email || "—"}</div> : null}
                                            </td>

                                            {isStaff ? <td className="px-3 py-2 text-sm text-gray-800">{c.mobile || "—"}</td> : null}
                                            {isStaff ? <td className="px-3 py-2 text-sm text-gray-800">{getCandidateAgentDisplay(c)}</td> : null}
                                            <td className="px-3 py-2 text-sm text-gray-800">{c.nationalityList || "—"}</td>
                                            <td className="px-3 py-2 text-sm text-gray-800">{rolesLabelName(c.job_roles || [])}</td>

                                            <td className="px-3 py-2">
                                                <StatusPill status={c.jobStatus} />
                                            </td>

                                            <td className="px-3 py-2">
                                                <VerifiedIcon ok={isVerifiedValue(c.isProfileVerifiedList)} />
                                            </td>

                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openCandidate(c)}
                                                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        View
                                                    </button>

                                                    {isStaff && (
                                                        <Link
                                                            href={`/staff/candidates/${c.documentId}/`}
                                                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                        >
                                                            Edit
                                                        </Link>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-3">
                        <div className="text-sm text-gray-800">
                            Page {page} of {pageCount}
                            <span className="ml-2 text-xs text-gray-500">({total} candidates)</span>
                            {isStaff ? <span className="ml-2 text-xs text-gray-500">Selected: {selectedCount}</span> : null}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1 || loadingTable}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                            >
                                Prev
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                                disabled={page >= pageCount || loadingTable}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                {isStaff && deleteModalOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                        role="dialog"
                        aria-modal="true"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) closeDeleteModal();
                        }}
                    >
                        <div className="absolute inset-0 bg-black/50" />

                        <div className="relative w-full sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-lg sm:text-xl text-red-700">Candidate Deletion</div>
                                    <div className="text-sm text-gray-700">
                                        You are going to delete {selectedCount} candidate{selectedCount === 1 ? "" : "s"}. This action is permanent and cannot be recovered. Candidate media files will also be deleted where possible. A log record will be created in Strapi.
                                    </div>
                                </div>

                                <button
                                    onClick={closeDeleteModal}
                                    disabled={deletingCandidates}
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                    type="button"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                                <div className="text-sm text-red-900">
                                    To start deleting process, type <span className="font-semibold">{DELETE_CONFIRM_TEXT}</span> in the field below.
                                </div>
                                <input
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    placeholder={DELETE_CONFIRM_TEXT}
                                    disabled={deletingCandidates}
                                    className="mt-3 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-200 disabled:opacity-50"
                                />
                            </div>

                            {deleteError ? (
                                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                    {deleteError}
                                </div>
                            ) : null}

                            {isStaff && deleteReport ? (
                                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                                    <div className="text-sm text-gray-900">
                                        Deleted: {deleteReport.deletedCount || 0} • Failed: {(deleteReport.failedCandidateDeletes || []).length} • Media deleted: {deleteReport.deletedMediaCount || 0} • Log created: {deleteReport.logCreated ? "Yes" : "No"}
                                    </div>

                                    {deleteReport.logResult && !deleteReport.logCreated ? (
                                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                                            Candidate deleted, but log was not created. Check Strapi log collection endpoint/field names/API token permission.
                                        </div>
                                    ) : null}

                                    {deleteDetails.length > 0 ? (
                                        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-gray-50 text-gray-700">
                                                    <tr>
                                                        <th className="px-2 py-2">Candidate</th>
                                                        <th className="px-2 py-2">Status</th>
                                                        <th className="px-2 py-2">Message</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {deleteDetails.slice(0, 100).map((r, idx) => (
                                                        <tr key={`${r.documentId || idx}-${idx}`} className="border-t border-gray-100">
                                                            <td className="px-2 py-2">{r.fullName || r.documentId || "—"}</td>
                                                            <td className="px-2 py-2">{r.status}</td>
                                                            <td className="px-2 py-2">{r.message}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            <div className="mt-5 flex flex-col sm:flex-row justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={closeDeleteModal}
                                    disabled={deletingCandidates}
                                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={handleDeleteSelected}
                                    disabled={deletingCandidates || deleteConfirmText.trim().toLowerCase() !== DELETE_CONFIRM_TEXT || selectedCount === 0}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                                >
                                    {deletingCandidates ? <ClipLoader size={16} color="#ffffff" /> : <DeleteIcon className="h-4 w-4" />}
                                    {deletingCandidates ? "Deleting..." : `Delete ${selectedCount} Candidate${selectedCount === 1 ? "" : "s"}`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {isStaff && importModalOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                        role="dialog"
                        aria-modal="true"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) closeImportModal();
                        }}
                    >
                        <div className="absolute inset-0 bg-black/50" />

                        <div className="relative w-full sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-lg sm:text-xl text-red-700">
                                        {importMode === "new" ? "Import New Candidates" : "Update Existing Candidates"}
                                    </div>
                                    <div className="text-sm text-gray-700">
                                        {importMode === "new"
                                            ? "documentId and Reference Number will be ignored because they are system generated."
                                            : "Every row must have valid documentId and Reference Number. Invalid rows will be skipped in the report."}
                                    </div>
                                </div>

                                <button
                                    onClick={closeImportModal}
                                    disabled={importing}
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                    type="button"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                        <div className="text-sm text-gray-900">Excel Template</div>
                                        <div className="text-xs text-gray-600">
                                            Use this template for new import. It contains all candidate columns, but system fields are ignored for new records.
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleTemplateDownload}
                                        disabled={templateLoading || importing}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 hover:bg-green-100 disabled:opacity-50"
                                    >
                                        {templateLoading ? <ClipLoader size={16} color="#166534" /> : <ExportExcelIcon className="h-4 w-4" />}
                                        Template
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4">
                                <label className="block text-sm text-gray-800 mb-2">Select Excel file</label>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                    className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
                                />
                                <div className="mt-2 text-xs text-gray-500">
                                    Accepted file types: .xlsx, .xls
                                </div>
                            </div>

                            {importError ? (
                                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                    {importError}
                                </div>
                            ) : null}

                            {isStaff && importReport ? (
                                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                                    <div className="text-sm text-blue-900">
                                        Total rows: {importReport.totalRows || 0} • Created: {importReport.created || 0} • Updated: {importReport.updated || 0} • Skipped: {importReport.skipped || 0}
                                    </div>

                                    {(importReport.details || []).length > 0 ? (
                                        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-blue-100 bg-white">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-gray-50 text-gray-700">
                                                    <tr>
                                                        <th className="px-2 py-2">Row</th>
                                                        <th className="px-2 py-2">Status</th>
                                                        <th className="px-2 py-2">Message</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importReport.details.slice(0, 100).map((r, idx) => (
                                                        <tr key={`${r.row}-${idx}`} className="border-t border-gray-100">
                                                            <td className="px-2 py-2">{r.row}</td>
                                                            <td className="px-2 py-2">{r.status}</td>
                                                            <td className="px-2 py-2">{r.message}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            <div className="mt-5 flex flex-col sm:flex-row justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={closeImportModal}
                                    disabled={importing}
                                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={handleImportSubmit}
                                    disabled={importing || !importFile}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                                >
                                    {importing ? <ClipLoader size={16} color="#ffffff" /> : <ImportExcelIcon className="h-4 w-4" />}
                                    {importing ? "Importing..." : importMode === "new" ? "Import New Data" : "Update Existing Data"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {selectedCandidate && (
                    <div
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                        role="dialog"
                        aria-modal="true"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) closeCandidate();
                        }}
                    >
                        <div className="absolute inset-0 bg-black/50" />

                        <div className="relative w-full sm:max-w-6xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-lg sm:text-xl text-red-700 truncate">Candidate Profile</div>
                                    <div className="text-sm text-gray-800 truncate">
                                        Reference No: {selectedCandidate.referenceNumber}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {isStaff && (
                                        <Link
                                            href={`/staff/candidates/${selectedCandidate.documentId}`}
                                            className="rounded-lg bg-red-700 text-white px-3 py-2 text-sm hover:opacity-90"
                                            onClick={closeCandidate}
                                        >
                                            Edit Candidate
                                        </Link>
                                    )}

                                    <button
                                        onClick={closeCandidate}
                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        type="button"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            {detailLoading ? (
                                <div className="flex justify-start items-center gap-3 text-sm text-gray-600">
                                    <ClipLoader size={25} color="#b91c1c" speedMultiplier={1} />
                                    <div className="text-left">Loading filters...</div>
                                </div>
                            ) : detailError ? (
                                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{detailError}</div>
                            ) : (
                                <>
                                    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
                                        <div className="flex items-center gap-4">
                                            <SafeImage
                                                src={detail?.existingMedia?.profileImage?.url || selectedCandidate.profileImageUrl}
                                                alt={selectedCandidate.fullName || "Candidate"}
                                                width={112}
                                                height={112}
                                                className="h-28 w-28 rounded-full border border-gray-200 bg-white object-cover"
                                            />
                                            <div>
                                                <div className="text-xl text-red-700">{detail?.formDefaults?.fullName || selectedCandidate.fullName}</div>
                                                <div className="text-sm text-gray-800">
                                                    {rolesLabelName(selectedCandidate.job_roles || [])} •{" "}
                                                    <span className="font-medium">{detail?.formDefaults?.jobStatus || selectedCandidate.jobStatus || "—"}</span>
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <InfoChip label="Experience:" value={`${detail?.formDefaults?.numberOfExperience ?? 0}Y`} />
                                                    <InfoChip label="Employed:" value={detail?.formDefaults?.currentlyEmployed ? "Yes" : "No"} />
                                                    {canViewAgent ? (
                                                        <InfoChip label="Agent:" value={selectedCandidateAgentName} />
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="sm:ml-auto flex items-center gap-2">
                                            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700">
                                                <VerifiedIcon ok={isVerifiedValue(detail?.formDefaults?.isProfileVerifiedList || selectedCandidate.isProfileVerifiedList)} />
                                                <span>{detail?.formDefaults?.isProfileVerifiedList || selectedCandidate.isProfileVerifiedList || "Not Verified"}</span>
                                            </span>
                                            <StatusPill status={detail?.formDefaults?.jobStatus || selectedCandidate.jobStatus} />
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-xl border border-gray-400 p-3 ">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                            {[
                                                ["Reference", detail?.formDefaults?.referenceNumber || selectedCandidate.referenceNumber],
                                                ...(canViewAgent ? [["Agent", selectedCandidateAgentName]] : []),
                                                ["First Name", detail?.formDefaults?.firstName],
                                                ["Last Name", detail?.formDefaults?.lastName],
                                                ...(canViewPrivateCandidateFields ? [
                                                    ["Username", detail?.formDefaults?.username],
                                                    ["Email", detail?.formDefaults?.email],
                                                    ["Mobile", detail?.formDefaults?.mobile],
                                                ] : []),
                                                ["Birth Date", detail?.formDefaults?.birthDate],
                                                ["Gender", detail?.formDefaults?.genderList],
                                                ["Nationality", detail?.formDefaults?.nationalityList],
                                                ["Marital Status", detail?.formDefaults?.maritalStatusList],
                                                ["Seasonal Status", detail?.formDefaults?.seasonalStatusList],
                                                ["English Level", detail?.formDefaults?.englishLevelList],
                                                ["Previous Company", detail?.formDefaults?.previousCompany],

                                                ["Current Company", detail?.formDefaults?.currentCompany],


                                            ].map(([k, v]) => (
                                                <div className="text-sm" key={k}>
                                                    <div className="text-gray-700 ">{k}</div>
                                                    <div className="text-gray-800 break-words">{v || "—"}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className={`mt-3 grid grid-cols-1 gap-2 ${isStaff ? "md:grid-cols-2" : ""}`}>
                                            <div className="text-sm">
                                                <div className="text-gray-700">Short Summary</div>
                                                <div className="text-gray-800">
                                                    {detail?.formDefaults?.shortSummary || "—"}
                                                </div>
                                            </div>

                                            {isStaff && (
                                                <div className="text-sm">
                                                    <div className="text-gray-700">Private Notes</div>
                                                    <div className="text-gray-800">
                                                        {detail?.formDefaults?.privateNotes || "—"}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-gray-400 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-base text-gray-800">Passport</div>
                                                {detail?.existingMedia?.passport?.url ? (
                                                    <a
                                                        href={detail.existingMedia.passport.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-sm rounded-lg bg-gray-900 text-white px-3 py-2 hover:opacity-90"
                                                    >
                                                        Download
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-gray-500">No file</span>
                                                )}
                                            </div>

                                        </div>

                                        <div className="rounded-xl border border-gray-400 p-3">
                                            <div className="text-sm text-gray-800">Working Video</div>
                                            <div className="mt-2">
                                                {isValidLink(detail?.formDefaults?.workingVideoLink) ? (
                                                    <a
                                                        className="text-sm text-blue-600 hover:underline"
                                                        href={detail.formDefaults.workingVideoLink}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Open Video
                                                    </a>
                                                ) : (
                                                    <div className="text-xs text-gray-500">None</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-gray-400 p-3">
                                            <div className="text-sm text-gray-800">MI Screening Video</div>
                                            <div className="mt-2">
                                                {isValidLink(detail?.formDefaults?.miScreeningVideoLink) ? (
                                                    <a
                                                        className="text-sm text-blue-600 hover:underline"
                                                        href={detail.formDefaults.miScreeningVideoLink}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Open Video
                                                    </a>
                                                ) : (
                                                    <div className="text-xs text-gray-500">None</div>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-800 mt-2">Screening Date: {detail?.formDefaults?.dateScreeningInterview || "—"}</div>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-xl border border-gray-400 p-3">
                                        <div className="text-sm text-gray-800">Documents ({detail?.formDefaults?.documents?.length || 0})</div>

                                        <div className="mt-3 space-y-2">
                                            {(detail?.formDefaults?.documents || []).map((d, idx) => (
                                                <div
                                                    key={idx}
                                                    className="rounded-xl border border-gray-400 bg-gray-50 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-gray-800 truncate">{d.name || "—"}</div>
                                                        <div className="text-xs text-gray-800">
                                                            Remarks: <span className="text-gray-800">{d.remarks || "—"}</span>
                                                        </div>
                                                    </div>

                                                    {d.existingUrl ? (
                                                        <a
                                                            href={d.existingUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="w-full sm:w-auto text-center rounded-lg bg-blue-600 text-white px-3 py-2 text-sm hover:opacity-90"
                                                        >
                                                            Download
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-gray-500">No file</span>
                                                    )}
                                                </div>
                                            ))}
                                            {(detail?.formDefaults?.documents || []).length === 0 ? (
                                                <div className="text-xs text-gray-500">No documents</div>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-sm text-gray-800">CV Preview </div>
                                            {detail?.existingMedia?.CV?.url ? (
                                                <a href={detail.existingMedia.CV.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                                                    Open / Download
                                                </a>
                                            ) : (
                                                <span className="text-xs text-gray-500">No file</span>
                                            )}
                                        </div>

                                        {detail?.existingMedia?.CV?.url ? (
                                            <div className="mt-2 rounded-xl border border-gray-400 overflow-hidden relative">
                                                {isPdfUrl(detail.existingMedia.CV.url) ? (
                                                    <>
                                                        {cvLoading && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-white">
                                                                <div className="h-12 w-12 rounded-full border-4 border-red-600 border-t-transparent animate-spin" />
                                                            </div>
                                                        )}

                                                        {cvFailed ? (
                                                            <div className="p-4 sm:p-6">
                                                                <div className="text-red-700">CV preview failed to load</div>
                                                                <p className="text-sm text-gray-800 mt-2">
                                                                    {cvError || "The PDF could not be loaded through the media proxy."}
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const cvUrl = detail?.existingMedia?.CV?.url || "";
                                                                        if (!cvUrl) return;

                                                                        setCvFailed(false);
                                                                        setCvError("");
                                                                        setCvLoading(true);
                                                                        setCvObjectUrl("");
                                                                        setCvRetryKey((value) => value + 1);
                                                                    }}
                                                                    className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-sm text-white hover:opacity-90"
                                                                >
                                                                    Retry Preview
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="h-[65vh] sm:h-[78vh]">
                                                                {cvObjectUrl ? (
                                                                    <iframe
                                                                        key={cvObjectUrl}
                                                                        src={cvObjectUrl}
                                                                        title="CV PDF"
                                                                        className="w-full h-full"
                                                                        onLoad={() => {
                                                                            setCvLoading(false);
                                                                            setCvFailed(false);
                                                                        }}
                                                                    />
                                                                ) : cvLoading ? null : (
                                                                    <div className="flex h-full items-center justify-center p-4 text-sm text-gray-600">
                                                                        Preparing PDF preview...
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="p-3 bg-gray-50">
                                                        <SafeImage
                                                            src={proxyMediaUrl(detail.existingMedia.CV.url)}
                                                            alt="CV"
                                                            width={1200}
                                                            height={1600}
                                                            className="max-h-[78vh] w-full rounded-xl border border-gray-400 bg-white object-contain"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}

                                        <p className="mt-2 text-xs text-gray-500">
                                            Tip: If preview doesn’t load, click <span className="text-gray-700">Open / Download</span>.
                                        </p>
                                    </div>
                                </>
                            )}

                            <div className="mt-4 flex justify-end">
                                <button
                                    onClick={closeCandidate}
                                    className="rounded-lg border border-gray-400 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    type="button"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}