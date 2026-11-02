"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ClipLoader } from "react-spinners";
import useAuthClient from "@/lib/useAuthClient";
import { useRouter } from "next/navigation";

async function fetchJsonSafe(url, options = {}) {
    const res = await fetch(url, {
        cache: "no-store",
        ...options,
    });
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

function InfoChip({ label, value }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
            <span className="text-gray-800">{label}</span>
            <span className="text-gray-900">{value}</span>
        </span>
    );
}

function AgentLogo({ name, size = "small" }) {
    const label = String(name || "Agent").trim() || "Agent";
    const initials =
        label
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("") || "A";

    const sizeClasses =
        size === "large"
            ? "h-24 w-24 rounded-2xl text-2xl"
            : "h-9 w-9 rounded-xl text-xs";

    return (
        <div
            role="img"
            aria-label={`${label} logo`}
            className={`flex shrink-0 items-center justify-center border border-red-200 bg-red-50 font-bold text-red-700 ${sizeClasses}`}
        >
            {initials}
        </div>
    );
}

export default function AgentsPage() {
    const pageSize = 15;
    const router = useRouter();
    const { user, role, loadingAuth } = useAuthClient();

    useEffect(() => {
        if (loadingAuth) return;

        const roleName = String(role?.name || user?.role?.name || "").toLowerCase();

        if (roleName === "clients") {
            router.replace("/client");
        } else if (roleName === "candidates") {
            router.replace("/candidate");
        } else if (roleName === "agent") {
            router.replace("/agent");
        }
    }, [user, role, loadingAuth, router]);

    const [search, setSearch] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");
    const [page, setPage] = useState(1);

    const [rows, setRows] = useState([]);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);

    const [loadingTable, setLoadingTable] = useState(true);
    const [tableError, setTableError] = useState("");

    const [selected, setSelected] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [detail, setDetail] = useState(null);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setLoadingTable(true);
            setTableError("");
            setPage(1);
            setDebouncedQ(search.trim());
        }, 350);

        return () => clearTimeout(timeoutId);
    }, [search]);

    async function loadAgents(nextPage = page, q = debouncedQ) {
        setLoadingTable(true);
        setTableError("");

        try {
            const params = new URLSearchParams();
            params.set("page", String(nextPage));
            params.set("pageSize", String(pageSize));
            params.set("q", q || "");

            const json = await fetchJsonSafe(`/api/agents/list?${params.toString()}`);

            setRows(Array.isArray(json.items) ? json.items : []);
            setPageCount(Number(json.pageCount || 1));
            setTotal(Number(json.total || 0));
        } catch (e) {
            setTableError(e?.message || "Failed to load agents");
            setRows([]);
            setPageCount(1);
            setTotal(0);
        } finally {
            setLoadingTable(false);
        }
    }

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
            q: debouncedQ || "",
        });

        fetchJsonSafe(`/api/agents/list?${params.toString()}`, {
            signal: controller.signal,
        })
            .then((json) => {
                setRows(Array.isArray(json.items) ? json.items : []);
                setPageCount(Number(json.pageCount || 1));
                setTotal(Number(json.total || 0));
            })
            .catch((error) => {
                if (error?.name === "AbortError") return;

                setTableError(error?.message || "Failed to load agents");
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
    }, [page, debouncedQ]);

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

    async function openAgent(row) {
        setSelected(row);
        setDetail(null);
        setDetailError("");
        setDetailLoading(true);

        try {
            const json = await fetchJsonSafe(`/api/agents/getagent/${row.documentId}`);
            setDetail(json);
        } catch (e) {
            setDetailError(e?.message || "Failed to load agent details");
        } finally {
            setDetailLoading(false);
        }
    }

    const headerText = useMemo(() => {
        const q = (debouncedQ || "").trim();
        if (!q) return `(${total} agents)`;
        return `(${total} results for "${q}")`;
    }, [debouncedQ, total]);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="topHeading">Agents</div>

            <main className="mt-10 mx-auto w-[95%] lg:w-[90%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <header className="border-b border-gray-200 bg-white px-4 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="text-lg text-gray-900">Agents</div>
                                <div className="text-sm text-gray-800">{headerText}</div>
                            </div>

                            <div className="flex flex-wrap w-full sm:w-auto items-center gap-2 sm:justify-end">
                                <div className="relative w-full sm:w-lg">
                                    <input
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                        }}
                                        placeholder="Search (company/personName/phone/email/country/status)..."
                                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-10 text-sm text-gray-800 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-300"
                                    />
                                    <span className="pointer-events-none absolute right-4 top-4 -translate-y-1/2 text-gray-600 text-2xl">
                                        ⌕
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => loadAgents(page, debouncedQ)}
                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                                    title="Reload from DB"
                                >
                                    Refresh
                                </button>

                                <Link
                                    href="/staff/agent/new"
                                    className="rounded-xl bg-red-700 px-3 py-2 text-sm text-white hover:opacity-90 whitespace-nowrap"
                                >
                                    + Create New
                                </Link>
                            </div>
                        </div>
                    </header>

                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr className="text-xs uppercase text-gray-800">
                                    <th className="px-3 py-2">Id</th>
                                    <th className="px-3 py-2">Agent</th>
                                    <th className="px-3 py-2">Company</th>
                                    <th className="px-3 py-2">Contact</th>
                                    <th className="px-3 py-2">Designation</th>
                                    <th className="px-3 py-2">Phone</th>
                                    <th className="px-3 py-2">Country</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2">Account</th>
                                    <th className="px-3 py-2">Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loadingTable || loadingAuth ? (
                                    <tr>
                                        <td colSpan={10} className="px-3 py-6 text-sm text-gray-800">
                                            <div className="flex items-center gap-3">
                                                <ClipLoader size={25} color="#b91c1c" speedMultiplier={2} />
                                                <span>Loading agents...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : tableError ? (
                                    <tr>
                                        <td colSpan={10} className="px-3 py-6 text-sm text-red-700">
                                            {tableError}
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="px-3 py-6 text-sm text-gray-800">
                                            No agents found.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((a) => (
                                        <tr
                                            key={a.documentId || a.id}
                                            className="border-b border-gray-200 hover:bg-gray-50"
                                        >
                                            <td className="px-3 py-2">{a.id}</td>

                                            <td className="px-3 py-2">
                                                <AgentLogo
                                                    name={a.companyName || a.contactName}
                                                />
                                            </td>

                                            <td className="px-3 py-2 text-sm text-gray-900">
                                                {a.companyName || "—"}
                                                <div className="text-xs text-gray-500">{a.city || "—"}</div>
                                            </td>

                                            <td className="px-3 py-2 text-sm text-gray-800">{a.contactName || "—"}</td>
                                            <td className="px-3 py-2 text-sm text-gray-800">{a.designation || "—"}</td>
                                            <td className="px-3 py-2 text-sm text-gray-800">{a.phone || "—"}</td>
                                            <td className="px-3 py-2 text-sm text-gray-800">{a.countryList || "—"}</td>

                                            <td className="px-3 py-2">
                                                <StatusPill status={a.statusList} />
                                            </td>

                                            <td className="px-3 py-2 text-sm text-gray-900">
                                                {a.username || "—"}
                                                <div className="text-xs text-gray-500">{a.email || "—"}</div>
                                            </td>

                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openAgent(a)}
                                                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        View
                                                    </button>

                                                    <Link
                                                        href={`/staff/agent/${a.documentId}/`}
                                                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Edit
                                                    </Link>
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
                            <span className="ml-2 text-xs text-gray-500">({total} agents)</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setLoadingTable(true);
                                    setTableError("");
                                    setPage((currentPage) => Math.max(1, currentPage - 1));
                                }}
                                disabled={page <= 1 || loadingTable}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                            >
                                Prev
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setLoadingTable(true);
                                    setTableError("");
                                    setPage((currentPage) =>
                                        Math.min(pageCount, currentPage + 1)
                                    );
                                }}
                                disabled={page >= pageCount || loadingTable}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

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
                                    <div className="text-lg sm:text-xl truncate">Agent Profile</div>
                                    <div className="text-sm text-gray-800 truncate">
                                        {selected.companyName || "—"}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Link
                                        href={`/staff/agent/${selected.documentId}/`}
                                        className="rounded-lg bg-red-700 text-white px-3 py-2 text-sm hover:opacity-90"
                                        onClick={closeModal}
                                    >
                                        Edit Agent
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
                                    <ClipLoader size={25} color="#b91c1c" speedMultiplier={2} />
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
                                            <AgentLogo
                                                name={
                                                    detail?.formDefaults?.companyName ||
                                                    selected.companyName
                                                }
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
                                                    <InfoChip label="Country:" value={detail?.formDefaults?.countryList || "—"} />
                                                    <InfoChip label="Contact:" value={detail?.formDefaults?.contactName || "—"} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="sm:ml-auto flex items-center gap-2">
                                            <span className="text-xs font-semibold text-gray-600">Status:</span>
                                            <StatusPill status={detail?.formDefaults?.statusList || selected.statusList} />
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-xl border border-gray-300 p-3">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                            {[
                                                ["Contact", detail?.formDefaults?.contactName],
                                                ["Designation", detail?.formDefaults?.designation],
                                                ["Phone", detail?.formDefaults?.phone],
                                                ["Website", detail?.formDefaults?.webiste],
                                                ["City", detail?.formDefaults?.city],
                                                ["Country", detail?.formDefaults?.countryList],
                                                ["Status", detail?.formDefaults?.statusList],
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
