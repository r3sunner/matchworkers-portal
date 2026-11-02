"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
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

function safeImgSrc(src) {
    const s = (src || "").trim();
    return s ? s : DEFAULT_AVATAR;
}

function isPdfUrl(url) {
    if (!url) return false;
    return String(url).toLowerCase().includes(".pdf");
}

function isValidLink(url) {
    return !!String(url || "").trim();
}

function proxyMediaUrl(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    return `/api/media/proxy?url=${encodeURIComponent(s)}`;
}

async function fetchJsonSafe(url) {
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
        throw new Error(json?.error || `Request failed (${res.status})`);
    }

    return json;
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

function rolesLabelName(roles = []) {
    if (!roles?.length) return "—";
    return roles.join(", ");
}

function isVerifiedValue(v) {
    const s = String(v || "").toLowerCase();
    return s === "verified" || s === "yes" || s === "true";
}

export default function CandidateProfilePage() {
    const params = useParams();
    const documentId = params?.documentId ? String(params.documentId) : "";

    const [detailLoading, setDetailLoading] = useState(true);
    const [detailError, setDetailError] = useState("");
    const [detail, setDetail] = useState(null);

    const [cvLoading, setCvLoading] = useState(false);
    const [cvFailed, setCvFailed] = useState(false);

    const cvLoadedRef = useRef(false);
    const cvTimeoutRef = useRef(null);

    useEffect(() => {
        async function loadCandidate() {
            if (!documentId) {
                setDetailError("Candidate documentId is missing in URL.");
                setDetailLoading(false);
                return;
            }

            setDetailLoading(true);
            setDetailError("");
            setDetail(null);

            try {
                const json = await fetchJsonSafe(`/api/candidates/getcandidate/${documentId}`);
                setDetail(json);

                const cvUrl = json?.existingMedia?.CV?.url || "";

                if (isPdfUrl(cvUrl)) {
                    setCvLoading(true);
                    setCvFailed(false);
                    cvLoadedRef.current = false;

                    if (cvTimeoutRef.current) clearTimeout(cvTimeoutRef.current);

                    cvTimeoutRef.current = setTimeout(() => {
                        if (!cvLoadedRef.current) {
                            setCvFailed(true);
                            setCvLoading(false);
                        }
                    }, 6000);
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

        loadCandidate();

        return () => {
            if (cvTimeoutRef.current) {
                clearTimeout(cvTimeoutRef.current);
                cvTimeoutRef.current = null;
            }
        };
    }, [documentId]);

    const form = detail?.formDefaults || {};
    const existingMedia = detail?.existingMedia || {};
    const profileImageUrl = existingMedia?.profileImage?.url || "";
    const cvUrl = existingMedia?.CV?.url || "";
    const previewCvUrl = proxyMediaUrl(cvUrl);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="topHeading">Candidate Profile</div>

            <main className="mt-10 mx-auto w-[95%] lg:w-[90%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                            <div className="text-lg sm:text-xl text-red-700 truncate">Candidate Profile</div>
                            <div className="text-sm text-gray-800 truncate">
                                Reference No: {form.referenceNumber || "—"}
                            </div>
                        </div>

                        <Link
                            href="/candidate"
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                            Back
                        </Link>
                    </div>

                    {detailLoading ? (
                        <div className="mt-6 flex justify-start items-center gap-3 text-sm text-gray-600">
                            <ClipLoader size={25} color="#b91c1c" speedMultiplier={1} />
                            <div className="text-left">Loading candidate...</div>
                        </div>
                    ) : detailError ? (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                            {detailError}
                        </div>
                    ) : (
                        <>
                            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex items-center gap-4">
                                    <img
                                        src={safeImgSrc(profileImageUrl)}
                                        alt={form.fullName || "Candidate"}
                                        className="h-28 w-28 rounded-full object-cover border border-gray-200 bg-white"
                                        onError={(e) => {
                                            e.currentTarget.onerror = null;
                                            e.currentTarget.src = DEFAULT_AVATAR;
                                        }}
                                    />

                                    <div>
                                        <div className="text-xl text-red-700">{form.fullName || "—"}</div>

                                        <div className="text-sm text-gray-800">
                                            {rolesLabelName(form.job_roles_name || [])} •{" "}
                                            <span className="font-medium">{form.jobStatus || "—"}</span>
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <InfoChip label="Experience:" value={`${form.numberOfExperience ?? 0}Y`} />
                                            <InfoChip label="Employed:" value={form.currentlyEmployed ? "Yes" : "No"} />
                                            <InfoChip label="Source:" value={form.source || "—"} />
                                        </div>
                                    </div>
                                </div>

                                <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700">
                                        <VerifiedIcon ok={isVerifiedValue(form.isProfileVerifiedList)} />
                                        <span>{form.isProfileVerifiedList || "Not Verified"}</span>
                                    </span>

                                    <StatusPill status={form.jobStatus} />
                                </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-gray-400 p-3">
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {[
                                        ["Reference", form.referenceNumber],
                                        ["First Name", form.firstName],
                                        ["Last Name", form.lastName],
                                        ["Username", form.username],
                                        ["Email", form.email],
                                        ["Mobile", form.mobile],
                                        ["Birth Date", form.birthDate],
                                        ["Gender", form.genderList],
                                        ["Nationality", form.nationalityList],
                                        ["Marital Status", form.maritalStatusList],
                                        ["Seasonal Status", form.seasonalStatusList],
                                        ["English Level", form.englishLevelList],
                                        ["Previous Company", form.previousCompany],
                                        ["Previous Job Experience", `${form.previousJobExperiece ?? 0}Y`],
                                        ["Current Company", form.currentCompany],
                                        ["Current Job Experience", `${form.currentJobExperiece ?? 0}Y`],
                                        ["Passport Expiry", form.passportExpireDate],
                                    ].map(([k, v]) => (
                                        <div className="text-sm" key={k}>
                                            <div className="text-gray-700">{k}</div>
                                            <div className="text-gray-800 break-words">{v || "—"}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div className="text-sm">
                                        <div className="text-gray-700">Short Summary</div>
                                        <div className="text-gray-800">{form.shortSummary || "—"}</div>
                                    </div>

                                    <div className="text-sm">
                                        <div className="text-gray-700">Private Notes</div>
                                        <div className="text-gray-800">{form.privateNotes || "—"}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
                                <div className="rounded-xl border border-gray-400 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-base text-gray-800">Passport</div>

                                        {existingMedia?.passport?.url ? (
                                            <a
                                                href={existingMedia.passport.url}
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

                                    <div className="text-xs text-gray-800 mt-2">
                                        Expiry: {form.passportExpireDate || "—"}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-400 p-3">
                                    <div className="text-sm text-gray-800">Working Video</div>

                                    <div className="mt-2">
                                        {isValidLink(form.workingVideoLink) ? (
                                            <a
                                                className="text-sm text-blue-600 hover:underline"
                                                href={form.workingVideoLink}
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
                                        {isValidLink(form.miScreeningVideoLink) ? (
                                            <a
                                                className="text-sm text-blue-600 hover:underline"
                                                href={form.miScreeningVideoLink}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Open Video
                                            </a>
                                        ) : (
                                            <div className="text-xs text-gray-500">None</div>
                                        )}
                                    </div>

                                    <div className="text-xs text-gray-800 mt-2">
                                        Screening Date: {form.dateScreeningInterview || "—"}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-gray-400 p-3">
                                <div className="text-sm text-gray-800">
                                    Documents ({form?.documents?.length || 0})
                                </div>

                                <div className="mt-3 space-y-2">
                                    {(form?.documents || []).map((d, idx) => (
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

                                    {(form?.documents || []).length === 0 ? (
                                        <div className="text-xs text-gray-500">No documents</div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="mt-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm text-gray-800">CV Preview</div>

                                    {cvUrl ? (
                                        <a
                                            href={cvUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-sm text-blue-600 hover:underline"
                                        >
                                            Open / Download
                                        </a>
                                    ) : (
                                        <span className="text-xs text-gray-500">No file</span>
                                    )}
                                </div>

                                {cvUrl ? (
                                    <div className="mt-2 rounded-xl border border-gray-400 overflow-hidden relative">
                                        {isPdfUrl(cvUrl) ? (
                                            <>
                                                {cvLoading && (
                                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
                                                        <div className="h-12 w-12 rounded-full border-4 border-red-600 border-t-transparent animate-spin" />
                                                    </div>
                                                )}

                                                {cvFailed ? (
                                                    <div className="p-4 sm:p-6">
                                                        <div className="text-red-700">CV preview failed to load</div>
                                                        <p className="text-sm text-gray-800 mt-2">
                                                            Use Open / Download to open in new tab.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="h-[65vh] sm:h-[78vh]">
                                                        <iframe
                                                            src={previewCvUrl}
                                                            title="CV PDF"
                                                            className="w-full h-full"
                                                            onLoad={() => {
                                                                cvLoadedRef.current = true;
                                                                setCvLoading(false);
                                                                setCvFailed(false);

                                                                if (cvTimeoutRef.current) {
                                                                    clearTimeout(cvTimeoutRef.current);
                                                                    cvTimeoutRef.current = null;
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="p-3 bg-gray-50">
                                                <img
                                                    src={proxyMediaUrl(cvUrl)}
                                                    alt="CV"
                                                    className="w-full max-h-[78vh] object-contain rounded-xl border border-gray-400 bg-white"
                                                    onError={(e) => {
                                                        e.currentTarget.onerror = null;
                                                        e.currentTarget.src = cvUrl;
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                <p className="mt-2 text-xs text-gray-500">
                                    Tip: If preview doesn’t load, click{" "}
                                    <span className="text-gray-700">Open / Download</span>.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}