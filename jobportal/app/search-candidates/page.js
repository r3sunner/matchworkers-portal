"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import useAuthClient from "@/lib/useAuthClient";

import ENUMS from "../../config/enums.json";
import { ClipLoader } from "react-spinners";

/* ---------------- helpers ---------------- */

function cls(...arr) {
    return arr.filter(Boolean).join(" ");
}

function safeArray(v) {
    return Array.isArray(v) ? v : [];
}

function roleNameFromAuth(user, role) {
    return String(
        role?.name ||
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.type ||
        (typeof role === "string" ? role : "") ||
        (typeof user?.role === "string" ? user.role : "") ||
        user?.role?.type ||
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

    return String(
        possibleValues.find((value) => String(value || "").trim()) || ""
    ).trim();
}

const RESULT_PAGE_SIZE = 40;

function getCandidateImage(candidate) {
    return String(candidate?.profileImage?.url || "").trim();
}

function passthroughImageLoader({ src }) {
    return src;
}

async function fetchJsonSafe(url, options) {
    let res;
    let text = "";

    try {
        res = await fetch(url, {
            cache: "no-store",
            ...(options || {}),
        });

        text = await res.text();
    } catch (networkError) {
        if (networkError?.name === "AbortError") {
            throw networkError;
        }

        throw new Error("Unable to connect to server");
    }

    let json = null;

    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(`API returned invalid response (status ${res.status})`);
    }

    if (!res.ok || json?.ok === false) {
        throw new Error(
            json?.error ||
            json?.message ||
            `Request failed${res?.status ? ` (${res.status})` : ""}`
        );
    }

    return json;
}

function CandidateAvatarImage({ src, alt, size, className, fallbackText }) {
    const [failed, setFailed] = useState(false);

    if (!src || failed) {
        return (
            <div
                className={cls(
                    "flex shrink-0 items-center justify-center rounded-full bg-red-100 font-bold text-red-700",
                    className
                )}
                role="img"
                aria-label={alt}
            >
                {fallbackText}
            </div>
        );
    }

    return (
        <Image
            loader={passthroughImageLoader}
            unoptimized
            src={src}
            alt={alt}
            width={size}
            height={size}
            onError={() => setFailed(true)}
            className={className}
        />
    );
}

function CandidateAvatar({ candidate, size = 64, className = "" }) {
    const src = getCandidateImage(candidate);
    const name = String(candidate?.fullName || "Candidate").trim();
    const fallbackText = name.charAt(0).toUpperCase() || "C";

    return (
        <CandidateAvatarImage
            key={src || fallbackText}
            src={src}
            alt={name}
            size={size}
            className={className}
            fallbackText={fallbackText}
        />
    );
}

function LikeChip({ icon, label, value }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2 py-1 text-[11px] text-gray-700">
            <span className="text-base leading-none">{icon}</span>
            <span className="truncate">{label}</span>
            <span className="font-semibold text-gray-900">{value ?? 0}</span>
        </span>
    );
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

function SearchableSingleSelect({
    label,
    value,
    onChange,
    options,
    placeholder = "Select",
    disabled = false,
    renderOptionLabel,
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const wrapRef = useRef(null);

    useEffect(() => {
        function onDoc(e) {
            if (!wrapRef.current?.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const selected = options.find((x) => String(x.value) === String(value));
    const filtered = options.filter((x) =>
        String(renderOptionLabel ? renderOptionLabel(x) : x.label || "")
            .toLowerCase()
            .includes(q.toLowerCase())
    );

    return (
        <div ref={wrapRef}>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>

            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen((s) => !s)}
                className={cls(
                    "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-left text-sm",
                    disabled ? "opacity-60 cursor-not-allowed" : "hover:border-gray-400"
                )}
            >
                <div className="flex items-center justify-between gap-3">
                    <span className={selected ? "text-gray-900" : "text-gray-400"}>
                        {selected
                            ? (renderOptionLabel ? renderOptionLabel(selected) : selected.label)
                            : placeholder}
                    </span>
                    <span className="text-gray-400">▾</span>
                </div>
            </button>

            {open && !disabled ? (
                <div className="relative z-30 mt-2 rounded-xl border border-gray-200 bg-white shadow-lg">
                    <div className="p-2 border-b border-gray-100">
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search..."
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200"
                        />
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setOpen(false);
                                setQ("");
                            }}
                            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                            {placeholder}
                        </button>

                        {filtered.map((opt) => (
                            <button
                                type="button"
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                    setQ("");
                                }}
                                className={cls(
                                    "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50",
                                    String(value) === String(opt.value) ? "bg-red-50 text-red-700" : ""
                                )}
                            >
                                {renderOptionLabel ? renderOptionLabel(opt) : opt.label}
                            </button>
                        ))}

                        {filtered.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500">No result found</div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function SearchableMultiSelect({
    label,
    values,
    onChange,
    options,
    placeholder = "Select",
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const wrapRef = useRef(null);

    useEffect(() => {
        function onDoc(e) {
            if (!wrapRef.current?.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const selectedOptions = options.filter((x) => values.includes(String(x.value)));
    const filtered = options.filter((x) =>
        String(x.label || "").toLowerCase().includes(q.toLowerCase())
    );

    function toggle(v) {
        const s = String(v);
        if (values.includes(s)) onChange(values.filter((x) => x !== s));
        else onChange([...values, s]);
    }

    return (
        <div ref={wrapRef}>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>

            <button
                type="button"
                onClick={() => setOpen((s) => !s)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-left text-sm hover:border-gray-400"
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        {selectedOptions.length ? (
                            <div className="flex flex-wrap gap-1">
                                {selectedOptions.map((x) => (
                                    <span
                                        key={x.value}
                                        className="inline-flex items-center rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-xs"
                                    >
                                        {x.label}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="text-gray-400">{placeholder}</span>
                        )}
                    </div>
                    <span className="text-gray-400">▾</span>
                </div>
            </button>

            {open ? (
                <div className="relative z-30 mt-2 rounded-xl border border-gray-200 bg-white shadow-lg">
                    <div className="p-2 border-b border-gray-100">
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search..."
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200"
                        />
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                        {filtered.map((opt) => {
                            const checked = values.includes(String(opt.value));
                            return (
                                <label
                                    key={opt.value}
                                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(opt.value)}
                                    />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}

                        {filtered.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500">No result found</div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/* ---------------- page ---------------- */

export default function SearchCandidatesPage() {
    const auth = useAuthClient();
    const user = auth?.user;
    const role = auth?.role;
    const authLoading = Boolean(auth?.loadingAuth ?? auth?.authLoading ?? false);

    const roleName = roleNameFromAuth(user, role);
    const isStaff = roleName === "staff";
    const isClient = roleName === "client" || roleName === "clients";
    const authenticatedClientDocumentId = clientDocumentIdFromUser(user);

    const [loadingMeta, setLoadingMeta] = useState(true);
    const [loadingResults, setLoadingResults] = useState(false);
    const [actionLoading, setActionLoading] = useState("");
    const [err, setErr] = useState("");

    const [clients, setClients] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [jobRoles, setJobRoles] = useState([]);

    const [clientDocumentId, setClientDocumentId] = useState("");
    const [jobDocumentId, setJobDocumentId] = useState("");
    const [searchText, setSearchText] = useState("");
    const [genderList, setGenderList] = useState("");
    const [nationalityList, setNationalityList] = useState("");
    const [selectedJobRoles, setSelectedJobRoles] = useState([]);

    const [results, setResults] = useState([]);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [actionPickerOpen, setActionPickerOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState("");
    const [pickerClientDocumentId, setPickerClientDocumentId] = useState("");
    const [pickerJobDocumentId, setPickerJobDocumentId] = useState("");
    const [actionError, setActionError] = useState("");
    const [candidateAlreadyAdded, setCandidateAlreadyAdded] = useState(false);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);
    const [metaReady, setMetaReady] = useState(false);

    const genders = useMemo(
        () => safeArray(ENUMS?.genders).map((x) => ({ value: x, label: x })),
        []
    );

    const nationalities = useMemo(
        () => safeArray(ENUMS?.nationalities).map((x) => ({ value: x, label: x })),
        []
    );

    const filteredJobs = useMemo(() => {
        if (!clientDocumentId) return jobs;
        return jobs.filter((j) => String(j.clientDocumentId || "") === String(clientDocumentId));
    }, [jobs, clientDocumentId]);

    function resetPageForFreshSearch() {
        setPage(1);
    }

    const searchCandidates = useCallback(
        async (overridePayload = null, requestedPage = page) => {
            setLoadingResults(true);
            setErr("");

            try {
                const pageToLoad = Math.max(
                    1,
                    Number(overridePayload?.page || requestedPage || 1)
                );

                const payload = {
                    q: searchText,
                    genderList,
                    nationalityList,
                    jobRoles: selectedJobRoles,
                    ...(overridePayload || {}),
                    page: pageToLoad,
                    pageSize: RESULT_PAGE_SIZE,
                };

                const json = await fetchJsonSafe("/api/search-candidates/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const pagination = json?.pagination || {};

                setResults(safeArray(json.items));
                setTotal(
                    Number(
                        pagination.total ??
                        json.total ??
                        safeArray(json.items).length
                    )
                );
                setPageCount(
                    Math.max(
                        1,
                        Number(pagination.pageCount ?? json.pageCount ?? 1)
                    )
                );
                setPage(
                    Math.max(
                        1,
                        Number(pagination.page ?? pageToLoad)
                    )
                );
            } catch (error) {
                if (error?.name === "AbortError") return;

                setErr(error?.message || "Failed to search candidates");
                setResults([]);
                setTotal(0);
                setPageCount(1);
            } finally {
                setLoadingResults(false);
            }
        },
        [
            genderList,
            nationalityList,
            page,
            searchText,
            selectedJobRoles,
        ]
    );

    // Remove legacy query parameters without a reload.
    // The page now always works at /search-candidates/.
    useEffect(() => {
        if (typeof window === "undefined" || !window.location.search) return;

        window.history.replaceState(
            window.history.state,
            "",
            window.location.pathname
        );
    }, []);

    useEffect(() => {
        if (authLoading) return undefined;

        const controller = new AbortController();

        Promise.resolve().then(() => {
            if (controller.signal.aborted) return;

            setLoadingMeta(true);
            setMetaReady(false);
            setErr("");
        });

        if (!isStaff && !isClient) {
            setErr("You do not have permission to search candidates.");
            setLoadingMeta(false);
            setMetaReady(false);
            return () => controller.abort();
        }

        fetchJsonSafe("/api/search-candidates/meta", {
            signal: controller.signal,
        })
            .then((json) => {
                if (controller.signal.aborted) return;

                const clientsData = safeArray(json.clients);
                const jobsData = safeArray(json.jobs);
                const jobRolesData = safeArray(json.jobRoles);

                const resolvedClientDocumentId = isClient
                    ? String(
                        json?.currentClientDocumentId ||
                        json?.initialClientDocumentId ||
                        authenticatedClientDocumentId ||
                        clientsData[0]?.documentId ||
                        ""
                    ).trim()
                    : "";

                if (isClient && !resolvedClientDocumentId) {
                    throw new Error(
                        "Your logged-in client account does not contain a document ID. Please log out and log in again."
                    );
                }

                setClients(clientsData);
                setJobs(jobsData);
                setJobRoles(jobRolesData);
                setClientDocumentId(resolvedClientDocumentId);
                setPickerClientDocumentId(resolvedClientDocumentId);
                setJobDocumentId("");
                setPickerJobDocumentId("");
                setPage(1);
                setMetaReady(true);
            })
            .catch((error) => {
                if (
                    controller.signal.aborted ||
                    error?.name === "AbortError"
                ) {
                    return;
                }

                setErr(error?.message || "Failed to load filters");
                setResults([]);
                setTotal(0);
                setPageCount(1);
                setMetaReady(false);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoadingMeta(false);
                }
            });

        return () => {
            controller.abort();
        };
    }, [
        authLoading,
        authenticatedClientDocumentId,
        isClient,
        isStaff,
    ]);

    useEffect(() => {
        if (!metaReady) return undefined;

        const timeoutId = window.setTimeout(() => {
            searchCandidates(null, page);
        }, 350);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [metaReady, page, searchCandidates]);

    function resetFilters() {
        setSearchText("");
        setGenderList("");
        setNationalityList("");
        setSelectedJobRoles([]);
        setPage(1);

        searchCandidates({
            q: "",
            genderList: "",
            nationalityList: "",
            jobRoles: [],
            page: 1,
        });
    }

    async function performCandidateAction(candidateDocumentId, action, selectedJobDocumentId) {
        const actionKey = `${candidateDocumentId}:${action}`;
        setActionLoading(actionKey);
        setActionError("");

        try {
            const json = await fetchJsonSafe("/api/search-candidates/select", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidateDocumentId,
                    jobDocumentId: selectedJobDocumentId,
                    action,
                }),
            });

            const processText = json?.candidateProcessList || "";

            setResults((prev) =>
                prev.filter((x) => String(x.documentId) !== String(candidateDocumentId))
            );
            setTotal((prev) => Math.max(0, Number(prev || 0) - 1));

            setSelectedCandidate((prev) =>
                prev && String(prev.documentId) === String(candidateDocumentId)
                    ? {
                        ...prev,
                        candidateProcessListForSelectedJob: processText,
                    }
                    : prev
            );

            setActionPickerOpen(false);
            setSelectedCandidate(null);
        } catch (e) {
            const message = e?.message || "Failed to update candidate";

            if (message.toLowerCase().includes("already added")) {
                setClientDocumentId(pickerClientDocumentId);
                setJobDocumentId(selectedJobDocumentId);
                setCandidateAlreadyAdded(true);
                setActionError("This candidate is already added in this job.");
                setActionPickerOpen(false);
                return;
            }

            setActionError(message);
        } finally {
            setActionLoading("");
        }
    }

    function moveCandidate(candidateDocumentId, action) {
        if (candidateAlreadyAdded) return;

        setPendingAction(action);
        setPickerClientDocumentId(isClient ? clientDocumentId : "");
        setPickerJobDocumentId("");
        setActionError("");
        setActionPickerOpen(true);
    }

    function closeActionPicker() {
        if (actionLoading) return;
        setActionPickerOpen(false);
        setPendingAction("");
        setActionError("");
    }

    function submitActionPicker() {
        if (!selectedCandidate || !pendingAction) return;

        if (!pickerClientDocumentId) {
            setActionError("Please select a client.");
            return;
        }

        if (!pickerJobDocumentId) {
            setActionError("Please select a job.");
            return;
        }

        setClientDocumentId(pickerClientDocumentId);
        setJobDocumentId(pickerJobDocumentId);

        performCandidateAction(
            selectedCandidate.documentId,
            pendingAction,
            pickerJobDocumentId
        );
    }

    const clientOptions = useMemo(
        () =>
            clients.map((x) => ({
                value: x.documentId,
                label: x.companyName || x.contactName || x.documentId,
            })),
        [clients]
    );

    const jobOptions = useMemo(
        () =>
            filteredJobs.map((x) => ({
                value: x.documentId,
                label: x.title || "Untitled Job",
                referenceNumber: x.referenceNo || "",
                clientDocumentId: x.clientDocumentId || "",
            })),
        [filteredJobs]
    );

    const pickerFilteredJobs = useMemo(() => {
        if (!pickerClientDocumentId) return jobs;

        return jobs.filter(
            (job) =>
                String(job.clientDocumentId || "") ===
                String(pickerClientDocumentId)
        );
    }, [jobs, pickerClientDocumentId]);

    const pickerJobOptions = useMemo(
        () =>
            pickerFilteredJobs.map((x) => ({
                value: x.documentId,
                label: x.title || "Untitled Job",
                referenceNumber: x.referenceNo || "",
                clientDocumentId: x.clientDocumentId || "",
            })),
        [pickerFilteredJobs]
    );

    const jobRoleOptions = useMemo(
        () =>
            jobRoles.map((x) => ({
                value: x.documentId,
                label: x.title || x.documentId,
            })),
        [jobRoles]
    );

    const selectedClientOption = useMemo(
        () => clientOptions.find((x) => String(x.value) === String(clientDocumentId)) || null,
        [clientOptions, clientDocumentId]
    );

    const selectedJobOption = useMemo(
        () => jobOptions.find((x) => String(x.value) === String(jobDocumentId)) || null,
        [jobOptions, jobDocumentId]
    );

    return (
        <>
            <div className="topHeading">Search Candidates</div>

            <div className="w-full mx-auto p-4 space-y-6">
                {err ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {err}
                    </div>
                ) : null}

                <div className="border border-gray-200 rounded-2xl p-4 sm:p-6 bg-gray-50">
                    {loadingMeta ? (
                        <div className="flex justify-start items-center gap-3 text-sm text-gray-600">
                            <ClipLoader size={25} color="#b91c1c" speedMultiplier={1} />
                            <div className="text-left">Loading filters...</div>
                        </div>
                    ) : (
                        <>

                            {isStaff ? (
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        Search
                                    </label>
                                    <input
                                        value={searchText}
                                        onChange={(e) => {
                                            setSearchText(e.target.value);
                                            resetPageForFreshSearch();
                                        }}
                                        placeholder="Search by Name,  Short Summary, Reference Number"
                                        className="w-full rounded-xl border border-gray-300 px-3 mb-3 bg-white py-2 text-sm outline-none focus:ring-2 focus:ring-red-200"
                                    />
                                </div>
                            ) : null}

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                <SearchableSingleSelect
                                    label="Gender"
                                    value={genderList}
                                    onChange={(value) => {
                                        setGenderList(value);
                                        resetPageForFreshSearch();
                                    }}
                                    options={genders}
                                    placeholder="All genders"
                                />

                                <SearchableSingleSelect
                                    label="Nationality"
                                    value={nationalityList}
                                    onChange={(value) => {
                                        setNationalityList(value);
                                        resetPageForFreshSearch();
                                    }}
                                    options={nationalities}
                                    placeholder="All nationalities"
                                />







                                <SearchableMultiSelect
                                    label="Job Roles"
                                    values={selectedJobRoles}
                                    onChange={(values) => {
                                        setSelectedJobRoles(values);
                                        resetPageForFreshSearch();
                                    }}
                                    options={jobRoleOptions}
                                    placeholder="Select job roles"
                                />
                            </div>

                            <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    Reset
                                </button>
                                <button
                                    type="button"
                                    onClick={() => searchCandidates()}
                                    disabled={loadingResults}
                                    className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                                >
                                    {loadingResults ? "Searching..." : "Search Candidates"}
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600">
                    <div>
                        Results: <span className="font-semibold text-gray-900">{results.length}</span>
                        <span className="ml-1 text-gray-500">of {total}</span>
                    </div>
                    <div className="text-xs text-gray-500">Maximum {RESULT_PAGE_SIZE} results per page</div>
                </div>

                {loadingResults ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">
                        <ClipLoader size={25} color="#b91c1c" speedMultiplier={1} />
                        <div className="text-left">Loading candidates...</div>
                    </div>
                ) : results.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">
                        No candidates found.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {results.map((c) => (
                            <div key={c.documentId || c.id} className="bg-gray-100 rounded-2xl p-3">
                                <div className="flex items-center gap-3">
                                    <CandidateAvatar
                                        candidate={c}
                                        size={64}
                                        className="h-16 w-16 rounded-full border border-white bg-white object-cover"
                                    />
                                    <div className="min-w-0">
                                        <div className="font-semibold text-red-600 text-sm truncate">
                                            {c.fullName || "—"}
                                        </div>
                                        <div className="text-xs text-gray-700 truncate">
                                            {c.nationality || "—"}
                                            {c.jobRoleTitles?.length
                                                ? ` • ${c.jobRoleTitles.join(", ")}`
                                                : ""}
                                        </div>
                                        <div className="text-[11px] text-gray-500 truncate">
                                            {c.referenceNumber || c.documentId || "—"}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-2  flex-wrap gap-2 hidden">
                                    <LikeChip
                                        icon="👍"
                                        label="Suggested to clients/jobs:"
                                        value={c.suggestedToClientsJobsCount ?? 0}
                                    />
                                    <LikeChip
                                        icon="⭐"
                                        label="Shortlisted/Interview by clients/jobs:"
                                        value={c.shortlistedByClientsJobsCount ?? 0}
                                    />
                                </div>

                                <p className="text-xs text-gray-700 mt-2 line-clamp-3">
                                    {c.shortSummary || "—"}
                                </p>

                                <div className="mt-2 text-[11px] text-gray-500">
                                    Current for selected job:{" "}
                                    <span className="font-semibold text-gray-700">
                                        {c.candidateProcessListForSelectedJob || "Not in selected job"}
                                    </span>
                                </div>

                                <button
                                    onClick={() => {
                                        setSelectedCandidate(c);
                                        setCandidateAlreadyAdded(false);
                                        setActionError("");
                                        setJobDocumentId("");
                                        if (roleName === "staff") {
                                            setClientDocumentId("");
                                        }
                                    }}
                                    className="mt-3 w-full text-white hover:text-gray-800 rounded-lg bg-red-600 border border-red-600 px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                    View Details
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {pageCount > 1 ? (
                <div className="w-full mx-auto px-4 pb-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-sm text-gray-600">
                        Page <span className="font-semibold text-gray-900">{page}</span> of{" "}
                        <span className="font-semibold text-gray-900">{pageCount}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1 || loadingResults}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Prev
                        </button>

                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                            disabled={page >= pageCount || loadingResults}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            ) : null}

            {selectedCandidate ? (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setSelectedCandidate(null);
                    }}
                >
                    <div className="absolute inset-0 bg-black/50" />

                    <div className="relative w-full sm:max-w-6xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-lg sm:text-xl font-bold truncate">
                                    Candidate Details
                                </div>
                                <div className="text-sm text-gray-600 truncate">
                                    {selectedCandidate.fullName} • {selectedCandidate.referenceNumber}
                                </div>

                                <div className="mt-3 space-y-2">
                                    <div className="text-sm hidden">
                                        <span className="font-semibold text-gray-800">Client: </span>
                                        {selectedClientOption ? (
                                            <span className="text-gray-700">{selectedClientOption.label}</span>
                                        ) : (
                                            <span className="font-medium text-red-800">
                                                --
                                            </span>
                                        )}
                                    </div>

                                    <div className="text-sm hidden">
                                        <span className="font-semibold text-gray-800">Job: </span>
                                        {selectedJobOption ? (
                                            <span className="text-gray-700">
                                                {selectedJobOption.referenceNumber
                                                    ? `${selectedJobOption.referenceNumber} - ${selectedJobOption.label}`
                                                    : selectedJobOption.label}
                                            </span>
                                        ) : (
                                            <span className="font-medium text-red-800">
                                                --
                                            </span>
                                        )}
                                    </div>

                                    {candidateAlreadyAdded && actionError ? (
                                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                                            {actionError}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    setSelectedCandidate(null);
                                    setActionPickerOpen(false);
                                    setActionError("");
                                    setCandidateAlreadyAdded(false);
                                }}
                                className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:justify-end">

                            {isStaff ? (
                                <button
                                    onClick={() => moveCandidate(selectedCandidate.documentId, "suggested")}
                                    disabled={candidateAlreadyAdded || Boolean(actionLoading)}
                                    className="w-full sm:w-auto rounded-lg border bg-orange-500 text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {actionLoading === `${selectedCandidate.documentId}:suggested`
                                        ? "Updating..."
                                        : "Suggested Candidate"}
                                </button>
                            ) : null}


                            <button
                                onClick={() => moveCandidate(selectedCandidate.documentId, "shortlisted")}
                                disabled={candidateAlreadyAdded || Boolean(actionLoading)}
                                className="hidden w-full sm:w-auto rounded-lg bg-green-600 text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {actionLoading === `${selectedCandidate.documentId}:shortlisted`
                                    ? "Updating..."
                                    : "Shortlist Candidate"}
                            </button>

                            <button
                                onClick={() => moveCandidate(selectedCandidate.documentId, "request interview")}
                                disabled={candidateAlreadyAdded || Boolean(actionLoading)}
                                className="w-full sm:w-auto rounded-lg bg-blue-600 text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {actionLoading === `${selectedCandidate.documentId}:request interview`
                                    ? "Updating..."
                                    : "Request Interview"}
                            </button>
                        </div>


                        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex items-center gap-4">
                                <CandidateAvatar
                                    candidate={selectedCandidate}
                                    size={112}
                                    className="h-28 w-28 rounded-full border bg-white object-cover"
                                />
                                <div>
                                    <div className="text-xl text-red-600 font-bold">
                                        {selectedCandidate.fullName || "—"}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        {selectedCandidate.nationality || "—"}
                                    </div>

                                    <div className="mt-2 hidden  flex-wrap gap-2">
                                        <LikeChip
                                            icon="👍"
                                            label="Suggested to clients/jobs:"
                                            value={selectedCandidate.suggestedToClientsJobsCount ?? 0}
                                        />
                                        <LikeChip
                                            icon="⭐"
                                            label="Shortlisted by clients/jobs:"
                                            value={selectedCandidate.shortlistedByClientsJobsCount ?? 0}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="sm:ml-auto">
                                <VerifiedBadge ok={!!selectedCandidate.isProfileVerified} />
                            </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-gray-200 p-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                {[
                                    ["Reference", selectedCandidate.referenceNumber],
                                    ["First Name", selectedCandidate.firstName],
                                    ["Last Name", selectedCandidate.lastName],

                                    ...(isStaff
                                        ? [
                                            ["Email", selectedCandidate.email],
                                            ["Mobile", selectedCandidate.mobile],
                                            ["Username", selectedCandidate.username],
                                        ]
                                        : []),
                                    ["Birth Date", selectedCandidate.birthDate],
                                    ["Nationality", selectedCandidate.nationality],
                                    ["Gender", selectedCandidate.genderList || selectedCandidate.gender],
                                    ["Marital Status", selectedCandidate.maritalStatusList || selectedCandidate.maritalStatus],
                                    ["English Level", selectedCandidate.englishLevelList || selectedCandidate.englishLevel],
                                    ["Selected Job Status", selectedCandidate.candidateProcessListForSelectedJob || "—"],
                                ].map(([k, v]) => (
                                    <div className="text-xs" key={k}>
                                        <div className="text-gray-500">{k}</div>
                                        <div className="font-semibold text-gray-800 break-words">{v || "—"}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="text-sm font-semibold text-gray-800">Job Roles</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {safeArray(selectedCandidate.jobRoleTitles).length ? (
                                    selectedCandidate.jobRoleTitles.map((x) => (
                                        <span
                                            key={x}
                                            className="inline-flex rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-700"
                                        >
                                            {x}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-sm text-gray-500">—</span>
                                )}
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="text-sm font-semibold text-gray-800">Short Summary</div>
                            <div className="text-sm text-gray-700 mt-1">
                                {selectedCandidate.shortSummary || "—"}
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="rounded-xl border border-gray-200 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold text-gray-800">CV</div>
                                    {selectedCandidate.cv?.url ? (
                                        <a
                                            href={selectedCandidate.cv.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-sm rounded-lg bg-gray-900 text-white px-3 py-2 hover:opacity-90"
                                        >
                                            Open CV
                                        </a>
                                    ) : (
                                        <span className="text-sm text-gray-500">No CV</span>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold text-gray-800">Passport</div>
                                    {selectedCandidate.passport?.url ? (
                                        <a
                                            href={selectedCandidate.passport.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-sm rounded-lg bg-gray-900 text-white px-3 py-2 hover:opacity-90"
                                        >
                                            Open Passport
                                        </a>
                                    ) : (
                                        <span className="text-sm text-gray-500">No Passport</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-gray-200 p-3">
                            <div className="text-sm font-semibold text-gray-800">
                                Documents ({safeArray(selectedCandidate.documents).length})
                            </div>

                            <div className="mt-3 space-y-2">
                                {safeArray(selectedCandidate.documents).length ? (
                                    safeArray(selectedCandidate.documents).map((d, idx) => (
                                        <div
                                            key={`${d.name || "doc"}-${idx}`}
                                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-gray-100 p-3"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-gray-800 break-words">
                                                    {d.name || "Document"}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {d.remarks || "—"}
                                                </div>
                                            </div>
                                            {d.file?.url ? (
                                                <a
                                                    href={d.file.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                                                >
                                                    Open
                                                </a>
                                            ) : (
                                                <span className="text-xs text-gray-400">No file</span>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-sm text-gray-500">No documents</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {selectedCandidate && actionPickerOpen ? (
                <div
                    className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeActionPicker();
                    }}
                >
                    <div className="absolute inset-0 bg-black/60" />

                    <div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-lg font-bold text-gray-900">
                                    Add Candidate to Job
                                </div>
                                <div className="mt-1 text-sm text-gray-600">
                                    Choose where to add {selectedCandidate.fullName || "this candidate"}.
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={closeActionPicker}
                                disabled={Boolean(actionLoading)}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-5 space-y-4">
                            {isStaff ? (
                                <SearchableSingleSelect
                                    label="Client"
                                    value={pickerClientDocumentId}
                                    onChange={(value) => {
                                        setPickerClientDocumentId(value);
                                        setPickerJobDocumentId("");
                                        setActionError("");
                                    }}
                                    options={clientOptions}
                                    placeholder="Select client"
                                />
                            ) : null}

                            <SearchableSingleSelect
                                label="Job"
                                value={pickerJobDocumentId}
                                onChange={(value) => {
                                    setPickerJobDocumentId(value);
                                    setActionError("");
                                }}
                                options={pickerJobOptions}
                                placeholder={
                                    pickerClientDocumentId
                                        ? "Select job"
                                        : "Select client first"
                                }
                                disabled={!pickerClientDocumentId}
                                renderOptionLabel={(opt) =>
                                    opt.referenceNumber
                                        ? `${opt.referenceNumber} - ${opt.label}`
                                        : opt.label
                                }
                            />

                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                                Adding candidate to <span className="font-semibold">{
                                    pendingAction === "suggested"
                                        ? "Suggested Candidates"
                                        : pendingAction === "shortlisted"
                                            ? "Shortlisted Candidates"
                                            : "Requested Interview"
                                }</span> section.
                            </div>

                            {actionError ? (
                                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                                    {actionError}
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={closeActionPicker}
                                disabled={Boolean(actionLoading)}
                                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={submitActionPicker}
                                disabled={
                                    Boolean(actionLoading) ||
                                    candidateAlreadyAdded ||
                                    !pickerClientDocumentId ||
                                    !pickerJobDocumentId
                                }
                                className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {actionLoading ? "Updating..." : "Continue"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}