"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "avif", "pdf"];

function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(
        Math.floor(Math.log(size) / Math.log(1024)),
        units.length - 1
    );

    const value = size / 1024 ** index;
    return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function fileExtension(name) {
    return String(name || "")
        .split(".")
        .pop()
        .toUpperCase();
}

function isAcceptedFile(file) {
    const extension = fileExtension(file?.name).toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(extension);
}

function absoluteFileUrl(relativeUrl) {
    if (!relativeUrl) return "";
    if (typeof window === "undefined") return relativeUrl;
    return new URL(relativeUrl, window.location.origin).toString();
}

function Spinner({ size = 18 }) {
    return (
        <span
            aria-hidden="true"
            className="inline-block animate-spin rounded-full border-2 border-current border-r-transparent"
            style={{ width: size, height: size }}
        />
    );
}

function FilePreview({ file }) {
    if (file.kind === "image") {
        return (
            <img
                src={file.url}
                alt={file.displayName || file.name}
                className="h-full w-full object-contain p-3"
                loading="lazy"
            />
        );
    }

    return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-red-50 text-red-700">
            <svg viewBox="0 0 24 24" className="h-14 w-14" aria-hidden="true">
                <path
                    fill="currentColor"
                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM7 12h3.2c1.7 0 2.8.9 2.8 2.4s-1.1 2.4-2.8 2.4H9V19H7v-7Zm2 1.7v1.5h1c.7 0 1-.3 1-.8s-.3-.7-1-.7H9Zm5-1.7h2.6c2 0 3.4 1.3 3.4 3.5S18.6 19 16.6 19H14v-7Zm2 1.7v3.6h.5c.9 0 1.5-.6 1.5-1.8s-.6-1.8-1.5-1.8H16Z"
                />
            </svg>
            <span className="mt-1 text-xs font-semibold">PDF document</span>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-3xl">
                📁
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No temporary files</h2>
            <p className="mt-1 text-sm text-gray-600">
                Drop images or PDFs above to create temporary public URLs for Excel imports.
            </p>
        </div>
    );
}

export default function StaffFileManagerPage() {
    const inputRef = useRef(null);
    const xhrRef = useRef(null);

    const [files, setFiles] = useState([]);
    const [selectedNames, setSelectedNames] = useState(() => new Set());
    const [dragActive, setDragActive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [deleting, setDeleting] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [copiedName, setCopiedName] = useState("");

    const selectedCount = selectedNames.size;
    const allSelected = files.length > 0 && files.every((file) => selectedNames.has(file.name));

    const totalSize = useMemo(
        () => files.reduce((sum, file) => sum + Number(file.size || 0), 0),
        [files]
    );

    const loadFiles = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/file-manager", {
                method: "GET",
                cache: "no-store",
            });
            const json = await response.json();

            if (!response.ok || !json?.ok) {
                throw new Error(json?.error || `Unable to load files (${response.status}).`);
            }

            const nextFiles = Array.isArray(json.files) ? json.files : [];
            setFiles(nextFiles);
            setSelectedNames((previous) => {
                const valid = new Set(nextFiles.map((file) => file.name));
                return new Set([...previous].filter((name) => valid.has(name)));
            });
        } catch (requestError) {
            setFiles([]);
            setError(requestError?.message || "Unable to load files.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadFiles();

        return () => {
            if (xhrRef.current) xhrRef.current.abort();
        };
    }, [loadFiles]);

    function validateSelectedFiles(selectedFiles) {
        const list = Array.from(selectedFiles || []);
        const accepted = list.filter(isAcceptedFile);
        const rejected = list.filter((file) => !isAcceptedFile(file));

        if (rejected.length > 0) {
            setError(
                `Skipped unsupported files: ${rejected.map((file) => file.name).join(", ")}`
            );
        }

        return accepted;
    }

    function uploadFiles(selectedFiles) {
        const acceptedFiles = validateSelectedFiles(selectedFiles);
        if (acceptedFiles.length === 0 || uploading) return;

        setUploading(true);
        setUploadProgress(0);
        setMessage("");
        setError("");

        const formData = new FormData();
        acceptedFiles.forEach((file) => formData.append("files", file));

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("POST", "/api/file-manager");
        xhr.responseType = "json";

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
        };

        xhr.onload = async () => {
            const json = xhr.response || {};

            if (xhr.status < 200 || xhr.status >= 300 || !json?.ok) {
                setError(json?.error || `Upload failed (${xhr.status}).`);
            } else {
                const uploadedCount = Number(json.uploadedCount || 0);
                const skippedCount = Number(json.skippedCount || 0);
                setMessage(
                    `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded${skippedCount ? `, ${skippedCount} skipped` : ""
                    }.`
                );
                await loadFiles();
            }

            setUploading(false);
            setUploadProgress(0);
            xhrRef.current = null;
            if (inputRef.current) inputRef.current.value = "";
        };

        xhr.onerror = () => {
            setError("Network error while uploading files.");
            setUploading(false);
            setUploadProgress(0);
            xhrRef.current = null;
        };

        xhr.onabort = () => {
            setMessage("Upload cancelled.");
            setUploading(false);
            setUploadProgress(0);
            xhrRef.current = null;
        };

        xhr.send(formData);
    }

    function onDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        if (!uploading) setDragActive(true);
    }

    function onDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setDragActive(false);
    }

    function onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
        uploadFiles(event.dataTransfer.files);
    }

    function toggleFile(name) {
        setSelectedNames((previous) => {
            const next = new Set(previous);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    }

    function toggleAll() {
        if (allSelected) {
            setSelectedNames(new Set());
            return;
        }

        setSelectedNames(new Set(files.map((file) => file.name)));
    }

    async function copyUrl(file) {
        const completeUrl = absoluteFileUrl(file.url);

        try {
            await navigator.clipboard.writeText(completeUrl);
        } catch {
            const textArea = document.createElement("textarea");
            textArea.value = completeUrl;
            textArea.style.position = "fixed";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            textArea.remove();
        }

        setCopiedName(file.name);
        setMessage(`Copied: ${completeUrl}`);
        window.setTimeout(() => setCopiedName(""), 1800);
    }

    async function deleteFiles({ all = false } = {}) {
        const names = all ? [] : [...selectedNames];

        if (!all && names.length === 0) {
            setError("Select at least one file to delete.");
            return;
        }

        const confirmation = window.confirm(
            all
                ? `Delete all ${files.length} temporary files? This cannot be undone.`
                : `Delete ${names.length} selected file${names.length === 1 ? "" : "s"}?`
        );

        if (!confirmation) return;

        setDeleting(true);
        setMessage("");
        setError("");

        try {
            const response = await fetch("/api/file-manager", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(all ? { all: true } : { files: names }),
            });
            const json = await response.json();

            if (!response.ok || !json?.ok) {
                throw new Error(json?.error || `Delete failed (${response.status}).`);
            }

            setMessage(`${json.deletedCount || 0} file${json.deletedCount === 1 ? "" : "s"} deleted.`);
            setSelectedNames(new Set());
            await loadFiles();
        } catch (requestError) {
            setError(requestError?.message || "Unable to delete files.");
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="topHeading">File Manager</div>

            <main className="mx-auto mt-10 w-[95%] max-w-7xl px-2 py-6 sm:px-4">
                <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                    <header className="border-b border-gray-200 px-5 py-5 sm:px-7">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h1 className="text-xl font-semibold text-gray-900">Temporary File Manager</h1>
                                <p className="mt-1 max-w-3xl text-sm text-gray-600">
                                    Upload images and PDFs, copy their public URLs into Excel, then delete them after import.
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                                    <span className="rounded-full bg-gray-100 px-2.5 py-1">{files.length} files</span>
                                    <span className="rounded-full bg-gray-100 px-2.5 py-1">{formatBytes(totalSize)}</span>
                                    <span className="rounded-full bg-gray-100 px-2.5 py-1">{selectedCount} selected</span>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={loadFiles}
                                    disabled={loading || uploading || deleting}
                                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Refresh
                                </button>
                                <button
                                    type="button"
                                    onClick={() => deleteFiles()}
                                    disabled={selectedCount === 0 || deleting || uploading}
                                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-40"
                                >
                                    {deleting ? "Deleting..." : `Delete selected${selectedCount ? ` (${selectedCount})` : ""}`}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => deleteFiles({ all: true })}
                                    disabled={files.length === 0 || deleting || uploading}
                                    className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-40"
                                >
                                    Delete all
                                </button>
                            </div>
                        </div>
                    </header>

                    <div className="p-5 sm:p-7">
                        <div
                            onDragEnter={onDragOver}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            className={`relative overflow-hidden rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ${dragActive
                                ? "scale-[1.01] border-red-500 bg-red-50 shadow-lg"
                                : "border-gray-300 bg-gray-50 hover:border-red-300 hover:bg-red-50/30"
                                }`}
                        >
                            <input
                                ref={inputRef}
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/gif,image/webp,image/avif,application/pdf"
                                onChange={(event) => uploadFiles(event.target.files)}
                                className="hidden"
                            />

                            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm transition ${dragActive ? "animate-bounce" : ""}`}>
                                ⬆️
                            </div>
                            <h2 className="mt-4 text-lg font-semibold text-gray-900">
                                {dragActive ? "Drop files to upload" : "Drag and drop multiple files"}
                            </h2>
                            <p className="mt-1 text-sm text-gray-600">
                                JPG, PNG, GIF, WEBP, AVIF and PDF files are supported.
                            </p>

                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                disabled={uploading || deleting}
                                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-50"
                            >
                                {uploading ? <Spinner /> : null}
                                {uploading ? "Uploading..." : "Select multiple files"}
                            </button>

                            {uploading ? (
                                <div className="mx-auto mt-5 max-w-xl">
                                    <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-700">
                                        <span>Uploading files</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                                        <div
                                            className="h-full rounded-full bg-red-700 transition-all duration-200"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {message ? (
                            <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                                {message}
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {error}
                            </div>
                        ) : null}

                        <div className="mt-7 flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Uploaded files</h2>
                                <p className="text-sm text-gray-600">Newest files appear first.</p>
                            </div>

                            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={toggleAll}
                                    disabled={files.length === 0}
                                    className="h-4 w-4 rounded border-gray-300 text-red-700 focus:ring-red-500"
                                />
                                Select all
                            </label>
                        </div>

                        <div className="mt-5">
                            {loading ? (
                                <div className="flex min-h-44 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-gray-700">
                                    <div className="flex items-center gap-3">
                                        <Spinner size={22} />
                                        <span>Loading files...</span>
                                    </div>
                                </div>
                            ) : files.length === 0 ? (
                                <EmptyState />
                            ) : (
                                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {files.map((file) => {
                                        const selected = selectedNames.has(file.name);
                                        const copied = copiedName === file.name;

                                        return (
                                            <article
                                                key={file.name}
                                                className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg ${selected ? "border-red-400 ring-2 ring-red-100" : "border-gray-200"
                                                    }`}
                                            >
                                                <div className="relative h-48 overflow-hidden bg-gray-100">
                                                    <FilePreview file={file} />
                                                    <label className="absolute left-3 top-3 flex cursor-pointer items-center justify-center rounded-lg bg-white/95 p-2 shadow">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() => toggleFile(file.name)}
                                                            className="h-4 w-4 rounded border-gray-300 text-red-700 focus:ring-red-500"
                                                            aria-label={`Select ${file.displayName}`}
                                                        />
                                                    </label>
                                                    <span className="absolute right-3 top-3 rounded-lg bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                                                        {file.extension}
                                                    </span>
                                                </div>

                                                <div className="p-4">
                                                    <h3 className="truncate text-sm font-semibold text-gray-900" title={file.displayName}>
                                                        {file.displayName}
                                                    </h3>
                                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                                                        <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                                                            <div className="text-gray-500">Format</div>
                                                            <div className="mt-0.5 font-medium text-gray-800">{file.extension}</div>
                                                        </div>
                                                        <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                                                            <div className="text-gray-500">Size</div>
                                                            <div className="mt-0.5 font-medium text-gray-800">{formatBytes(file.size)}</div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 text-xs">
                                                        <div className="text-gray-500">Uploaded</div>
                                                        <div className="mt-0.5 font-medium text-gray-800">{formatDate(file.createdAt)}</div>
                                                    </div>

                                                    <div className="mt-4 flex gap-2">
                                                        <a
                                                            href={file.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                                                        >
                                                            Open
                                                        </a>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyUrl(file)}
                                                            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium text-white transition ${copied ? "bg-green-700" : "bg-red-700 hover:bg-red-800"
                                                                }`}
                                                        >
                                                            {copied ? "Copied" : "Copy URL"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
