"use client";

import { useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";

/* ------------------------------------------------------------------ */
/* Helpers */
/* ------------------------------------------------------------------ */
export function isValidDateNotFuture(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    d.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return d <= now;
}

export function isValidUrl(value) {
    if (!value) return true;
    try {
        const u = new URL(value);
        return !!u.hostname;
    } catch {
        return false;
    }
}

export function fileExtOk(file, allowedExt) {
    const name = (file?.name || "").toLowerCase();
    return allowedExt.some((ext) => name.endsWith(ext));
}

export function normalizePhone(phone) {
    return String(phone || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^\d+\-\s()]/g, "");
}

export async function fetchJsonSafe(url) {
    const res = await fetch(url, { cache: "no-store" });
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

export function normalizeIdArray(v) {
    // accepts: [1,"2",{id:3}], or {data:[{id:..}]}
    const arr = Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : [];
    return arr
        .map((x) => Number((x && typeof x === "object") ? (x.id ?? x.value ?? x) : x))
        .filter((n) => Number.isFinite(n));
}

/* ------------------------------------------------------------------ */
/* UI bits: Tooltip + Inputs */
/* ------------------------------------------------------------------ */
export function InfoTip({ text }) {
    if (!text) return null;
    return (
        <span className="relative inline-flex items-center group">
            <svg className="h-4 w-4 text-gray-400 group-hover:text-gray-700" viewBox="0 0 24 24" aria-hidden="true">
                <path
                    fill="currentColor"
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 15c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1Zm0-8c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Z"
                />
            </svg>

            <span className="pointer-events-none ml-20 absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 shadow-lg opacity-0 group-hover:opacity-100 transition">
                {text}
            </span>
        </span>
    );
}

export function Field({ label, hint, info, error, children }) {
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <div className="text-sm text-gray-900">{label}</div>
                <InfoTip text={info} />
            </div>
            {hint ? <div className="text-base ml-3 text-gray-700">{hint}</div> : null}
            {children}
            {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>
    );
}

export function Input(props) {
    return (
        <input
            {...props}
            className={`w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-100 focus:ring-2 focus:ring-red-300 ${props.disabled ? "opacity-60 bg-gray-100 cursor-not-allowed" : ""
                }`}
        />
    );
}

export function Select({ children, ...props }) {
    return (
        <div className="relative">
            <select
                {...props}
                className={`w-full pr-10 appearance-none rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-100 focus:ring-2 focus:ring-red-300 ${props.disabled ? "opacity-60 bg-gray-100 cursor-not-allowed" : ""
                    }`}
            >
                {children}
            </select>

            {/* ✅ custom arrow (move left/right by changing right-4) */}
            <svg
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-700"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
            >
                <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z"
                    clipRule="evenodd"
                />
            </svg>
        </div>
    );
}

export function Textarea(props) {
    return (
        <textarea
            {...props}
            className="w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-100 focus:ring-2 focus:ring-red-300"
        />
    );
}

export function PasswordInput({ value, onChange, placeholder, error }) {
    const [show, setShow] = useState(false);
    return (
        <div className="space-y-1">
            <div className="relative">
                <input
                    type={show ? "text" : "password"}
                    value={value || ""}
                    onChange={onChange}
                    placeholder={placeholder}
                    className={`w-full rounded-xl border border-gray-400 bg-white px-3 py-2 pr-10 text-sm text-gray-900 outline-none focus:border-red-100 focus:ring-2 focus:ring-red-300 ${error ? "border-red-400" : ""
                        }`}
                />
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-700 hover:text-gray-800"
                    title={show ? "Hide" : "Show"}
                >
                    {show ? (
                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path
                                fill="currentColor"
                                d="M12 6c5 0 9.27 3.11 11 6-1.73 2.89-6 6-11 6S2.73 14.89 1 12c1.73-2.89 6-6 11-6Zm0 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                            />
                        </svg>
                    ) : (
                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path
                                fill="currentColor"
                                d="M2.1 3.51 3.51 2.1 21.9 20.49 20.49 21.9l-3.1-3.1A12.9 12.9 0 0 1 12 20C7 20 2.73 16.89 1 14c.76-1.27 2.02-2.68 3.66-3.92L2.1 3.51ZM12 6c5 0 9.27 3.11 11 6-.62 1.04-1.56 2.16-2.78 3.21l-2.24-2.24A4 4 0 0 0 11.03 6.02L9.35 4.34A12.7 12.7 0 0 1 12 6Z"
                            />
                        </svg>
                    )}
                </button>
            </div>
            {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>
    );
}

export function DropzoneBox({ label, acceptText, multiple, value, onChange, error, info, hint }) {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        multiple,
        onDrop: (acceptedFiles) => {
            if (!multiple) onChange(acceptedFiles?.[0] || null);
            else onChange(acceptedFiles || []);
        },
    });

    const files = useMemo(() => {
        if (!value) return [];
        return Array.isArray(value) ? value : [value];
    }, [value]);

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <div className="text-sm text-gray-700">{label}</div>
                <InfoTip text={info} />
            </div>
            {hint ? <div className="text-xs text-gray-700">{hint}</div> : null}

            <div
                {...getRootProps()}
                className={`rounded-2xl border border-dashed px-4 py-4 text-sm cursor-pointer ${isDragActive ? "bg-amber-50 border-amber-300" : "bg-gray-50 border-gray-200"
                    }`}
            >
                <input {...getInputProps()} />
                <div className="text-gray-700">Click to add an asset or drag & drop</div>
                <div className="text-xs text-gray-700 mt-1">{acceptText}</div>

                <div className="mt-3 space-y-2">
                    {files.length === 0 ? (
                        <div className="text-xs text-gray-700">No file selected.</div>
                    ) : (
                        files.map((f, idx) => (
                            <div key={`${f.name}-${idx}`} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                                <div className="text-xs text-gray-900 truncate">{f.name}</div>
                                <div className="text-xs text-gray-700">{Math.round((f.size || 0) / 1024)} KB</div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Searchable Multi-Select for job_roles */
/* ------------------------------------------------------------------ */
export function MultiSelectSearchIds({
    label,
    info,
    hint,
    options, // [{id,title}]
    value, // [id,id,...]
    onChange,
    error,
    getLabel = (o) => o.title,
    getValue = (o) => o.id,
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");

    const selectedIds = Array.isArray(value) ? value : [];

    const byId = useMemo(() => {
        const m = new Map();
        (options || []).forEach((o) => m.set(getValue(o), o));
        return m;
    }, [options, getValue]);

    const selectedOptions = useMemo(
        () => selectedIds.map((id) => byId.get(id)).filter(Boolean),
        [selectedIds, byId]
    );

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return options || [];
        return (options || []).filter((o) => String(getLabel(o)).toLowerCase().includes(s));
    }, [q, options, getLabel]);

    function toggle(opt) {
        const id = getValue(opt);
        const exists = selectedIds.includes(id);
        const next = exists ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
        onChange(next);
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <div className="text-sm text-gray-700">{label}</div>
                {info ? <InfoTip text={info} /> : null}
            </div>
            {hint ? <div className="text-xs text-gray-700">{hint}</div> : null}

            <div className="flex flex-wrap gap-2">
                {selectedOptions.length === 0 ? (
                    <div className="text-xs text-gray-700">No role selected.</div>
                ) : (
                    selectedOptions.map((o) => {
                        const id = getValue(o);
                        return (
                            <span
                                key={id}
                                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-800"
                            >
                                {getLabel(o)}
                                <button
                                    type="button"
                                    className="text-gray-700 hover:text-gray-900"
                                    onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                                    title="Remove"
                                >
                                    ✕
                                </button>
                            </span>
                        );
                    })
                )}
            </div>

            <div className="relative">
                <button
                    type="button"
                    className="w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                    onClick={() => setOpen((s) => !s)}
                >
                    {open ? "Close roles list" : "Select job roles"}
                </button>

                {open && (
                    <div className="absolute z-40 mt-2 w-full rounded-2xl border border-gray-400 bg-white shadow-lg overflow-hidden">
                        <div className="p-3 border-b border-gray-200">
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search roles..."
                                className="w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-200"
                            />
                            <div className="mt-2 flex items-center justify-between">
                                <div className="text-xs text-gray-700">{filtered.length} results</div>
                                <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => onChange([])}>
                                    Clear all
                                </button>
                            </div>
                        </div>

                        <div className="max-h-64 overflow-auto p-2">
                            {filtered.length === 0 ? (
                                <div className="p-3 text-sm text-gray-600">No roles found.</div>
                            ) : (
                                filtered.map((opt) => {
                                    const id = getValue(opt);
                                    return (
                                        <label key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(id)}
                                                onChange={() => toggle(opt)}
                                                className="h-4 w-4"
                                            />
                                            <span className="text-sm text-gray-800">{getLabel(opt)}</span>
                                        </label>
                                    );
                                })
                            )}
                        </div>

                        <div className="p-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                            <button
                                type="button"
                                className="rounded-xl bg-red-700 px-3 py-2 text-sm text-white hover:opacity-90"
                                onClick={() => setOpen(false)}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>
    );
}