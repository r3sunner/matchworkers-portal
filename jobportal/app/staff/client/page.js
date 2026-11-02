"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ClipLoader } from "react-spinners";
import useAuthClient from "@/lib/useAuthClient";
import { useRouter } from "next/navigation";
import ENUMS from "@/config/enums.json";
import { saveClientJobsContext } from "@/lib/clientJobsContext";

const LEAD_STATUS_OPTIONS = Array.isArray(ENUMS?.LeadStatus)
    ? ENUMS.LeadStatus
    : ["Lead", "Active", "Rejected"];

const DELETE_CONFIRM_TEXT = "permeability delete";
const CLIENT_PAGE_SIZE = 15;

function ClientLogo({ src, name, size = "small" }) {
    const logoUrl = String(src || "").trim();
    const label = String(name || "Client").trim() || "Client";
    const initials =
        label
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("") || "C";

    const sizeClass = size === "large" ? "h-24 w-24 text-xl" : "h-9 w-9 text-xs";

    return (
        <div
            role="img"
            aria-label={`${label} logo`}
            className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100 font-bold text-gray-600 ${sizeClass}`}
        >
            <span>{initials}</span>
            {logoUrl ? (
                <span
                    aria-hidden="true"
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
                />
            ) : null}
        </div>
    );
}

async function fetchJsonSafe(url, options) {
    const res = await fetch(url, { cache: "no-store", ...(options || {}) });
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
        throw new Error(json?.error || `Request failed (${res.status})`);
    }
    return json;
}

function StatusPill({ status }) {
    const s = (status || "").toLowerCase();
    const cls =
        s === "active"
            ? "border-green-200 bg-green-50 text-green-700"
            : s === "inactive"
                ? "border-gray-200 bg-gray-50 text-gray-700"
                : s === "blocked"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-gray-200 bg-gray-50 text-gray-700";

    return (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${cls}`}>
            {status || "—"}
        </span>
    );
}

function LeadStatusPill({ status }) {
    const value = (status || "Lead").trim();
    const s = value.toLowerCase();

    const cls =
        s === "lead"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : s === "active"
                ? "border-green-200 bg-green-50 text-green-700"
                : s === "rejected"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-gray-200 bg-gray-50 text-gray-700";

    return (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${cls}`}>
            {value}
        </span>
    );
}

function InfoChip({ label, value }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
            <span className="text-gray-800">{label}</span>
            <span className="text-gray-900">{value}</span>
        </span>
    );
}


function ExcelIcon({ className = "h-4 w-4" }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path
                fill="currentColor"
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM8.1 10h2.1l1.15 2.05L12.55 10h2.05l-2.1 3.35L14.75 17h-2.1l-1.3-2.25L10.05 17H8l2.25-3.65L8.1 10Z"
            />
        </svg>
    );
}

function ImportIcon({ className = "h-4 w-4" }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path
                fill="currentColor"
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM8 11h8v2H8v-2Zm0 4h5v2H8v-2Zm6.8-1.9 1.4 1.4L14 16.7l-2.2-2.2 1.4-1.4.8.8.8-.8Z"
            />
        </svg>
    );
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

async function downloadBlobFile(res, fallbackName) {
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || fallbackName;

    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
}

async function downloadClientExport({ mode, selectedDocumentIds = [], q = "", leadStatus = "" }) {
    const res = await fetch("/api/export/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, selectedDocumentIds, q, leadStatus }),
    });

    if (!res.ok) {
        let message = `Export failed (${res.status})`;
        try {
            const json = await res.json();
            message = json?.error || message;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    await downloadBlobFile(res, `clients-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function downloadClientImportTemplate() {
    const res = await fetch("/api/import/clients/template", {
        method: "GET",
        cache: "no-store",
    });

    if (!res.ok) {
        let message = `Template download failed (${res.status})`;
        try {
            const json = await res.json();
            message = json?.error || message;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    await downloadBlobFile(res, "client-import-template.xlsx");
}

async function uploadClientImport({ mode, file }) {
    const fd = new FormData();
    fd.append("mode", mode);
    fd.append("file", file);

    const res = await fetch("/api/import/clients", {
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

async function deleteSelectedClients({ documentIds, confirmationText, actor }) {
    const res = await fetch("/api/clients/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds, confirmationText, actor }),
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


export default function ClientsPage() {
    const router = useRouter();
    const { user, role, loadingAuth } = useAuthClient();

    function openClientJobs(client) {
        const documentId = String(client?.documentId || "").trim();

        if (!documentId) {
            alert("Client document ID is missing.");
            return;
        }

        const saved = saveClientJobsContext({
            documentId,
            companyName: client?.companyName || "",
        });

        if (!saved) {
            alert("Unable to save the selected client in this browser tab.");
            return;
        }

        router.push("/client/jobs/");
    }

    useEffect(() => {


        if (loadingAuth) return;

        if (role?.name === "clients") {
            router.replace("/client");
        } else if (role?.name === "candidates") {
            router.replace("/candidate");
        } else if (role?.name === "staff") {
            // allowed
        }
    }, [user, role, loadingAuth, router]);

    const [search, setSearch] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");
    const [leadStatus, setLeadStatus] = useState("");

    const [page, setPage] = useState(1);

    const [rows, setRows] = useState([]);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);

    const [loadingTable, setLoadingTable] = useState(true);
    const [tableError, setTableError] = useState("");

    // View modal
    const [selected, setSelected] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [detail, setDetail] = useState(null);

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
    const [deletingClients, setDeletingClients] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [deleteReport, setDeleteReport] = useState(null);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(search.trim()), 350);
        return () => clearTimeout(t);
    }, [search]);

    async function loadClients(nextPage = page, q = debouncedQ, lead = leadStatus) {
        setLoadingTable(true);
        setTableError("");

        try {
            const params = new URLSearchParams();
            params.set("page", String(nextPage));
            params.set("pageSize", String(CLIENT_PAGE_SIZE));
            params.set("q", q || "");
            params.set("leadStatus", lead || "");

            const json = await fetchJsonSafe(`/api/clients/list?${params.toString()}`);

            setRows(Array.isArray(json.items) ? json.items : []);
            setPageCount(Number(json.pageCount || 1));
            setTotal(Number(json.total || 0));
        } catch (e) {
            setTableError(e?.message || "Failed to load clients");
            setRows([]);
            setPageCount(1);
            setTotal(0);
        } finally {
            setLoadingTable(false);
        }
    }

    useEffect(() => {
        const controller = new AbortController();

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(CLIENT_PAGE_SIZE));
        params.set("q", debouncedQ || "");
        params.set("leadStatus", leadStatus || "");

        Promise.resolve().then(() => {
            if (controller.signal.aborted) return;
            setLoadingTable(true);
            setTableError("");
        });

        fetchJsonSafe(`/api/clients/list?${params.toString()}`, {
            signal: controller.signal,
        })
            .then((json) => {
                if (controller.signal.aborted) return;
                setRows(Array.isArray(json.items) ? json.items : []);
                setPageCount(Number(json.pageCount || 1));
                setTotal(Number(json.total || 0));
            })
            .catch((error) => {
                if (error?.name === "AbortError" || controller.signal.aborted) return;
                setTableError(error?.message || "Failed to load clients");
                setRows([]);
                setPageCount(1);
                setTotal(0);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoadingTable(false);
                }
            });

        return () => controller.abort();
    }, [page, debouncedQ, leadStatus]);

    function closeModal() {
        setSelected(null);
        setDetail(null);
        setDetailError("");
        setDetailLoading(false);
    }

    useEffect(() => {
        if (!selected) return;
        const onKey = (e) => e.key === "Escape" && closeModal();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selected]);

    useEffect(() => {
        if (!selected) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [selected]);

    async function openClient(row) {
        setSelected(row);
        setDetail(null);
        setDetailError("");
        setDetailLoading(true);

        try {
            const json = await fetchJsonSafe(`/api/clients/getclient/${row.documentId}`);
            setDetail(json);
        } catch (e) {
            setDetailError(e?.message || "Failed to load client details");
        } finally {
            setDetailLoading(false);
        }
    }

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

        const deletedRows = (deleteReport.deletedClients || []).map((x) => ({
            documentId: x.documentId,
            companyName: x.companyName || x.name || "",
            status: "Deleted",
            message: "Client deleted successfully.",
        }));

        const failedRows = (deleteReport.failedClientDeletes || []).map((x) => ({
            documentId: x.documentId,
            companyName: x.companyName || x.name || "",
            status: "Failed",
            message: x.error || "Client delete failed.",
        }));

        const fetchErrorRows = (deleteReport.fetchErrors || []).map((x) => ({
            documentId: x.documentId,
            companyName: "",
            status: "Skipped",
            message: x.error || "Client could not be loaded.",
        }));

        return [...deletedRows, ...failedRows, ...fetchErrorRows];
    }, [deleteReport]);

    function toggleClientSelection(documentId) {
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
            setExportError("Please select at least one client to export.");
            return;
        }

        setExporting(true);

        try {
            await downloadClientExport({
                mode,
                selectedDocumentIds: Array.from(selectedIds),
                q: mode === "all" ? debouncedQ || "" : "",
                leadStatus: mode === "all" ? leadStatus || "" : "",
            });
        } catch (e) {
            setExportError(e?.message || "Failed to export clients");
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
            await downloadClientImportTemplate();
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
            const json = await uploadClientImport({
                mode: importMode,
                file: importFile,
            });

            setImportReport(json);
            await loadClients(1, debouncedQ, leadStatus);
            setPage(1);
        } catch (e) {
            setImportError(e?.message || "Failed to import clients");
        } finally {
            setImporting(false);
        }
    }

    function openDeleteModal() {
        setDeleteError("");
        setDeleteReport(null);
        setDeleteConfirmText("");
        setDeleteModalOpen(true);
    }

    function closeDeleteModal() {
        if (deletingClients) return;
        setDeleteModalOpen(false);
        setDeleteConfirmText("");
        setDeleteError("");
    }

    async function handleDeleteSelected() {
        setDeleteError("");
        setDeleteReport(null);

        if (selectedIds.size === 0) {
            setDeleteError("Please select at least one client to delete.");
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

        setDeletingClients(true);

        try {
            const json = await deleteSelectedClients({
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
                (json?.deletedClients || [])
                    .map((x) => String(x.documentId || ""))
                    .filter(Boolean)
            );

            setSelectedIds((prev) => {
                const next = new Set(prev);
                deletedIds.forEach((id) => next.delete(id));
                return next;
            });

            await loadClients(1, debouncedQ, leadStatus);
            setPage(1);
        } catch (e) {
            setDeleteError(e?.message || "Failed to delete selected clients");
        } finally {
            setDeletingClients(false);
        }
    }

    const headerText = useMemo(() => {
        const q = (debouncedQ || "").trim();
        const lead = (leadStatus || "").trim();

        if (!q && !lead) return `(${total} clients)`;
        if (q && lead) return `(${total} results for "${q}" in ${lead})`;
        if (q) return `(${total} results for "${q}")`;
        return `(${total} ${lead} clients)`;
    }, [debouncedQ, leadStatus, total]);



    return (
        <div className="min-h-screen bg-gray-50">
            <div className="topHeading">Clients</div>

            <main className="mt-10 mx-auto w-[95%] lg:w-[90%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <header className="border-b border-gray-200 bg-white px-4 py-4 ">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="text-lg text-gray-900">Clients</div>
                                    <div className="text-sm text-gray-800">{headerText}</div>
                                    <div className="text-xs text-gray-500">Selected: {selectedCount}</div>
                                </div>

                                <div className="flex flex-wrap w-full sm:w-auto items-center gap-2 sm:justify-end">
                                    <div className="relative w-full sm:w-lg">
                                        <input
                                            value={search}
                                            onChange={(e) => {
                                                setSearch(e.target.value);
                                                setPage(1);
                                            }}
                                            placeholder="Search (company/phone/email/country/status)..."
                                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-10 text-sm text-gray-800 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-300"
                                        />
                                        <span className="pointer-events-none absolute right-4 top-4 -translate-y-1/2 text-gray-600 text-2xl">
                                            ⌕
                                        </span>
                                    </div>

                                    <select
                                        value={leadStatus}
                                        onChange={(e) => {
                                            setLeadStatus(e.target.value);
                                            setPage(1);
                                        }}
                                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-300"
                                    >
                                        <option value="">All Lead Status</option>
                                        {LEAD_STATUS_OPTIONS.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>

                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setExportMenuOpen((v) => !v)}
                                            disabled={exporting}
                                            className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 hover:bg-green-100 disabled:opacity-50 whitespace-nowrap"
                                            title="Export clients to Excel"
                                        >
                                            {exporting ? <ClipLoader size={16} color="#166534" /> : <ExcelIcon className="h-4 w-4" />}
                                            {exporting ? "Exporting..." : "Export"}
                                        </button>

                                        {exportMenuOpen && (
                                            <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                                                <button
                                                    type="button"
                                                    onClick={() => handleExport("all")}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                                                >
                                                    <ExcelIcon className="mt-0.5 h-5 w-5 text-green-700" />
                                                    <span>
                                                        <span className="block text-gray-900">Export all clients</span>
                                                        <span className="block text-xs text-gray-500">Exports all filtered clients from Strapi.</span>
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleExport("selected")}
                                                    disabled={selectedCount === 0}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <ExcelIcon className="mt-0.5 h-5 w-5 text-green-700" />
                                                    <span>
                                                        <span className="block text-gray-900">Export selected clients</span>
                                                        <span className="block text-xs text-gray-500">{selectedCount} selected across pagination.</span>
                                                    </span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setImportMenuOpen((v) => !v)}
                                            disabled={importing}
                                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
                                            title="Import clients from Excel"
                                        >
                                            {importing ? <ClipLoader size={16} color="#1d4ed8" /> : <ImportIcon className="h-4 w-4" />}
                                            {importing ? "Importing..." : "Import"}
                                        </button>

                                        {importMenuOpen && (
                                            <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                                                <button
                                                    type="button"
                                                    onClick={() => openImportModal("new")}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                                                >
                                                    <ImportIcon className="mt-0.5 h-5 w-5 text-blue-700" />
                                                    <span>
                                                        <span className="block text-gray-900">Import new data</span>
                                                        <span className="block text-xs text-gray-500">Document ID is ignored for new clients.</span>
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => openImportModal("update")}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                                                >
                                                    <ImportIcon className="mt-0.5 h-5 w-5 text-blue-700" />
                                                    <span>
                                                        <span className="block text-gray-900">Update existing data</span>
                                                        <span className="block text-xs text-gray-500">Requires valid Document ID.</span>
                                                    </span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {selectedCount > 0 ? (
                                        <button
                                            type="button"
                                            onClick={openDeleteModal}
                                            disabled={deletingClients}
                                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 hover:bg-red-100 disabled:opacity-50 whitespace-nowrap"
                                            title="Delete selected clients"
                                        >
                                            {deletingClients ? <ClipLoader size={16} color="#991b1b" /> : <DeleteIcon className="h-4 w-4" />}
                                            Delete ({selectedCount})
                                        </button>
                                    ) : null}

                                    <button
                                        type="button"
                                        onClick={() => loadClients(page, debouncedQ, leadStatus)}
                                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                                        title="Reload from DB"
                                    >
                                        Refresh
                                    </button>

                                    <Link
                                        href="/staff/client/new"
                                        className="rounded-xl bg-red-700 px-3 py-2 text-sm text-white hover:opacity-90 whitespace-nowrap"
                                    >
                                        + Create New
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </header>

                    {exportError ? (
                        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                            {exportError}
                        </div>
                    ) : null}

                    {importReport ? (
                        <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
                            Import report: Total rows {importReport.totalRows || 0}, Created {importReport.created || 0}, Updated {importReport.updated || 0}, Skipped {importReport.skipped || 0}.
                        </div>
                    ) : null}

                    {deleteReport ? (
                        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                            Delete report: Deleted {deleteReport.deletedCount || 0}, Failed {(deleteReport.failedClientDeletes || []).length}, Media deleted {deleteReport.deletedMediaCount || 0}, Log created: {deleteReport.logCreated ? "Yes" : "No"}.
                        </div>
                    ) : null}

                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr className="text-xs uppercase text-gray-800">
                                    <th className="px-3 py-2">
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSelected}
                                            onChange={toggleVisibleSelection}
                                            disabled={visibleSelectableIds.length === 0}
                                            className="h-4 w-4 rounded border-gray-300 text-red-700 focus:ring-red-500"
                                            title="Select all visible clients"
                                        />
                                    </th>
                                    <th className="px-3 py-2">Id</th>
                                    <th className="px-3 py-2">Logo</th>
                                    <th className="px-3 py-2">Company</th>
                                    <th className="px-3 py-2">Phone</th>
                                    <th className="px-3 py-2">Country</th>
                                    <th className="px-3 py-2">Industry</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2">Lead Status</th>
                                    <th className="px-3 py-2">Account</th>
                                    <th className="px-3 py-2">Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loadingTable || loadingAuth ? (
                                    <tr>
                                        <td colSpan={11} className="px-3 py-6 text-sm text-gray-800">
                                            <div className="flex items-center gap-3">
                                                <ClipLoader
                                                    size={25}
                                                    color="#b91c1c"
                                                    speedMultiplier={2}
                                                />
                                                <span>Loading clients...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : tableError ? (
                                    <tr>
                                        <td colSpan={11} className="px-3 py-6 text-sm text-red-700">
                                            {tableError}
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="px-3 py-6 text-sm text-gray-800">
                                            No clients found.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((c) => (
                                        <tr
                                            key={c.documentId || c.id}
                                            className="border-b border-gray-200 hover:bg-gray-50"
                                        >
                                            <td className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(String(c.documentId || ""))}
                                                    onChange={() => toggleClientSelection(c.documentId)}
                                                    className="h-4 w-4 rounded border-gray-300 text-red-700 focus:ring-red-500"
                                                    aria-label={`Select ${c.companyName || "client"}`}
                                                />
                                            </td>
                                            <td className="px-3 py-2">{c.id}</td>

                                            <td className="px-3 py-2">
                                                <ClientLogo
                                                    src={c.logoUrl}
                                                    name={c.companyName}
                                                />
                                            </td>

                                            <td className="px-3 py-2 text-sm text-gray-900">
                                                {c.companyName || "—"}
                                                <div className="text-xs text-gray-500">{c.city || "—"}</div>
                                            </td>

                                            <td className="px-3 py-2 text-sm text-gray-800">{c.phone || "—"}</td>

                                            <td className="px-3 py-2 text-sm text-gray-800">
                                                {c.countryList || "—"}
                                            </td>

                                            <td className="px-3 py-2 text-sm text-gray-800">
                                                {c.industriesList || "—"}
                                            </td>

                                            <td className="px-3 py-2">
                                                <StatusPill status={c.statusList} />
                                            </td>

                                            <td className="px-3 py-2">
                                                <LeadStatusPill status={c.leadStatus || "Lead"} />
                                            </td>

                                            <td className="px-3 py-2 text-sm text-gray-900">
                                                {c.username || "—"}
                                                <div className="text-xs text-gray-500">{c.email || "—"}</div>
                                            </td>

                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openClient(c)}
                                                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        View
                                                    </button>

                                                    <Link
                                                        href={`/staff/client/${c.documentId}/`}
                                                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Edit
                                                    </Link>




                                                    <button
                                                        type="button"
                                                        onClick={() => openClientJobs(c)}
                                                        disabled={
                                                            !String(c?.leadStatus || "").toLowerCase() ||
                                                            String(c?.leadStatus || "").toLowerCase() === "rejected"
                                                        }
                                                        className={`rounded-lg border px-3 py-1.5 text-sm
    ${!String(c?.leadStatus || "").toLowerCase() ||
                                                                String(c?.leadStatus || "").toLowerCase() === "rejected"
                                                                ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                                                                : "border-red-200 bg-white text-red-600 hover:bg-gray-50"
                                                            }`}
                                                        title={
                                                            !String(c?.leadStatus || "").toLowerCase() ||
                                                                String(c?.leadStatus || "").toLowerCase() === "rejected"
                                                                ? "Client must not be empty or rejected to view jobs"
                                                                : ""
                                                        }
                                                    >
                                                        Client Jobs List
                                                    </button>


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
                            <span className="ml-2 text-xs text-gray-500">({total} clients)</span>
                            <span className="ml-2 text-xs text-gray-500">Selected: {selectedCount}</span>
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

                {deleteModalOpen && (
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
                                    <div className="text-lg sm:text-xl text-red-700">Client Deletion</div>
                                    <div className="text-sm text-gray-700">
                                        You are going to delete {selectedCount} client{selectedCount === 1 ? "" : "s"}. This action is permanent and cannot be recovered. Client logo media files and linked login users will also be deleted where possible. A log record will be created in Strapi.
                                    </div>
                                </div>

                                <button
                                    onClick={closeDeleteModal}
                                    disabled={deletingClients}
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
                                    disabled={deletingClients}
                                    className="mt-3 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-200 disabled:opacity-50"
                                />
                            </div>

                            {deleteError ? (
                                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                    {deleteError}
                                </div>
                            ) : null}

                            {deleteReport ? (
                                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                                    <div className="text-sm text-gray-900">
                                        Deleted: {deleteReport.deletedCount || 0} • Failed: {(deleteReport.failedClientDeletes || []).length} • Media deleted: {deleteReport.deletedMediaCount || 0} • Log created: {deleteReport.logCreated ? "Yes" : "No"}
                                    </div>

                                    {deleteDetails.length > 0 ? (
                                        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-gray-50 text-gray-700">
                                                    <tr>
                                                        <th className="px-2 py-2">Client</th>
                                                        <th className="px-2 py-2">Status</th>
                                                        <th className="px-2 py-2">Message</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {deleteDetails.slice(0, 100).map((r, idx) => (
                                                        <tr key={`${r.documentId || idx}-${idx}`} className="border-t border-gray-100">
                                                            <td className="px-2 py-2">{r.companyName || r.documentId || "—"}</td>
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
                                    disabled={deletingClients}
                                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={handleDeleteSelected}
                                    disabled={deletingClients || deleteConfirmText.trim().toLowerCase() !== DELETE_CONFIRM_TEXT || selectedCount === 0}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                                >
                                    {deletingClients ? <ClipLoader size={16} color="#ffffff" /> : <DeleteIcon className="h-4 w-4" />}
                                    {deletingClients ? "Deleting..." : `Delete ${selectedCount} Client${selectedCount === 1 ? "" : "s"}`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {importModalOpen && (
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
                                        {importMode === "new" ? "Import New Clients" : "Update Existing Clients"}
                                    </div>
                                    <div className="text-sm text-gray-700">
                                        {importMode === "new"
                                            ? "Document ID will be ignored because new clients are created by the system."
                                            : "Every row must have a valid Document ID. Invalid rows will be skipped in the report."}
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
                                            Use this template for new import. It includes dropdowns from config/enums.json.
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleTemplateDownload}
                                        disabled={templateLoading || importing}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 hover:bg-green-100 disabled:opacity-50"
                                    >
                                        {templateLoading ? <ClipLoader size={16} color="#166534" /> : <ExcelIcon className="h-4 w-4" />}
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
                                <div className="mt-2 text-xs text-gray-500">Accepted file types: .xlsx, .xls</div>
                            </div>

                            {importError ? (
                                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                    {importError}
                                </div>
                            ) : null}

                            {importReport ? (
                                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                                    <div className="text-sm text-blue-900">
                                        Total rows: {importReport.totalRows || 0} • Created: {importReport.created || 0} • Updated: {importReport.updated || 0} • Skipped: {importReport.skipped || 0}
                                    </div>

                                    {(importReport.report || []).length > 0 ? (
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
                                                    {importReport.report.slice(0, 100).map((r, idx) => (
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
                                    {importing ? <ClipLoader size={16} color="#ffffff" /> : <ImportIcon className="h-4 w-4" />}
                                    {importing ? "Importing..." : importMode === "new" ? "Import New Data" : "Update Existing Data"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {selected && (
                    <div
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                        role="dialog"
                        aria-modal="true"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) closeModal();
                        }}
                    >
                        <div className="absolute inset-0 bg-black/50" />

                        <div className="relative w-full sm:max-w-5xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-lg sm:text-xl truncate">Client Profile</div>
                                    <div className="text-sm text-gray-800 truncate">
                                        {selected.companyName || "—"}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Link
                                        href={`/staff/client/${selected.documentId}/`}
                                        className="rounded-lg bg-red-700 text-white px-3 py-2 text-sm hover:opacity-90"
                                        onClick={closeModal}
                                    >
                                        Edit Client
                                    </Link>

                                    <Link
                                        href={`/client/${selected.documentId}/dashboard`}
                                        className="rounded-lg bg-red-700 text-white px-3 py-2 text-sm hover:opacity-90"
                                        onClick={closeModal}
                                    >
                                        Client Dashboard
                                    </Link>

                                    <button
                                        onClick={closeModal}
                                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        type="button"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            {detailLoading ? (
                                <div className="flex items-center gap-3 mt-4 rounded-xl border border-gray-300 p-4 text-sm text-gray-700">
                                    <ClipLoader
                                        size={25}
                                        color="#b91c1c"
                                        speedMultiplier={2}
                                    />
                                    <div className="text-left">Loading details...</div>
                                </div>
                            ) : detailError ? (
                                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                    {detailError}
                                </div>
                            ) : (
                                <>
                                    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
                                        <div className="flex items-center gap-4">
                                            <ClientLogo
                                                src={detail?.existingMedia?.logo?.url || selected.logoUrl}
                                                name={selected.companyName}
                                                size="large"
                                            />
                                            <div>
                                                <div className="text-xl text-red-700">
                                                    {detail?.formDefaults?.companyName || selected.companyName}
                                                </div>
                                                <div className="text-sm text-gray-800">
                                                    {detail?.formDefaults?.city || selected.city || "—"} •{" "}
                                                    <span className="font-medium">
                                                        {detail?.formDefaults?.statusList || selected.statusList || "—"}
                                                    </span>
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <InfoChip
                                                        label="Country:"
                                                        value={detail?.formDefaults?.countryList || "—"}
                                                    />
                                                    <InfoChip
                                                        label="Industry:"
                                                        value={detail?.formDefaults?.industriesList || "—"}
                                                    />
                                                    <InfoChip
                                                        label="Size:"
                                                        value={detail?.formDefaults?.companySizeList || "—"}
                                                    />

                                                </div>
                                            </div>
                                        </div>

                                        <div className="sm:ml-auto flex flex-col gap-2 items-start sm:items-end">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-gray-600">Status:</span>
                                                <StatusPill
                                                    status={detail?.formDefaults?.statusList || selected.statusList}
                                                />
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-gray-600">Lead Status:</span>
                                                <LeadStatusPill
                                                    status={detail?.formDefaults?.leadStatus || selected.leadStatus || "Lead"}
                                                />
                                            </div>
                                        </div>

                                    </div>

                                    <div className="mt-4 rounded-xl border border-gray-300 p-3">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                            {[
                                                ["Contact Person", detail?.formDefaults?.contactName],
                                                ["Designation", detail?.formDefaults?.designation],
                                                ["Phone", detail?.formDefaults?.phone],
                                                ["Website", detail?.formDefaults?.website],
                                                ["City", detail?.formDefaults?.city],
                                                ["Country", detail?.formDefaults?.countryList],
                                                ["Industry", detail?.formDefaults?.industriesList],
                                                ["Company Size", detail?.formDefaults?.companySizeList],
                                                ["Status", detail?.formDefaults?.statusList],
                                                ["Lead Status", detail?.formDefaults?.leadStatus || "Lead"],
                                                ["Username", detail?.formDefaults?.username],
                                                ["Email", detail?.formDefaults?.email],
                                            ].map(([k, v]) => (
                                                <div className="text-sm" key={k}>
                                                    <div className="text-gray-700">{k}</div>
                                                    <div className="text-gray-800 break-words">{v || "—"}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <div className="text-sm">
                                                <div className="text-gray-700">Short Description</div>
                                                <div className="text-gray-800">
                                                    {detail?.formDefaults?.shortDescription || "—"}
                                                </div>
                                            </div>
                                            <div className="text-sm">
                                                <div className="text-gray-700">Private Note</div>
                                                <div className="text-gray-800">
                                                    {detail?.formDefaults?.privateNote || "—"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-xl border border-gray-300 p-3">
                                        <div className="text-sm text-gray-800">
                                            Contacts ({detail?.formDefaults?.contactList?.length || 0})
                                        </div>

                                        <div className="mt-3 space-y-2">
                                            {(detail?.formDefaults?.contactList || []).map((c, idx) => (
                                                <div
                                                    key={idx}
                                                    className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-gray-800 truncate">
                                                            {c.name || "—"}
                                                        </div>
                                                        <div className="text-xs text-gray-700">
                                                            {c.designation || "—"} • {c.mobile || "—"}
                                                        </div>
                                                        <div className="text-xs text-gray-600 mt-1">
                                                            Remarks: {c.remarks || "—"}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {(detail?.formDefaults?.contactList || []).length === 0 ? (
                                                <div className="text-xs text-gray-500">No contacts</div>
                                            ) : null}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="mt-4 flex justify-end">
                                <button
                                    onClick={closeModal}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
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