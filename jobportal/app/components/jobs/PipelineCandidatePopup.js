"use client";

import React, { useState } from "react";
import PipelineUpdatePopup from "./PipelineUpdatePopup";

export default function PipelineCandidatePopup({ popup, onClose, onRefresh }) {
    const [selected, setSelected] = useState(null);

    if (!popup?.open) return null;

    return (
        <>
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3">
                <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                    <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                        <div className="min-w-0">
                            <h2 className="truncate text-lg font-bold text-gray-900">
                                {popup?.job?.title || "Job"} Candidates
                            </h2>
                            <div className="text-sm text-gray-500">
                                {popup?.job?.referenceNo || "—"} • {popup?.title || "Pipeline"}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                            Close
                        </button>
                    </div>

                    <div className="max-h-[78vh] overflow-y-auto p-4">
                        {popup.candidates.length === 0 ? (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                                No candidates found.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {popup.candidates.map((c, idx) => (
                                    <div
                                        key={`${c.documentId || c.id || "candidate"}-${idx}`}
                                        className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                                    >
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={c.avatar || "/images/default-avatar.jpg"}
                                                alt={c.fullName || "Candidate"}
                                                onError={(e) => {
                                                    e.currentTarget.src = "/images/default-avatar.jpg";
                                                }}
                                                className="h-14 w-14 rounded-full border bg-gray-100 object-cover"
                                            />

                                            <div className="min-w-0">
                                                <div className="truncate font-semibold text-red-700">
                                                    {c.fullName || "—"}
                                                </div>
                                                <div className="truncate text-sm text-gray-600">
                                                    Ref: {c.referenceNumber || "—"}
                                                </div>
                                                <div className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-[2px] text-xs font-semibold text-gray-700">
                                                    {c.currentPipelineStatus || c.candidateProcessList || "—"}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setSelected(c)}
                                            className="mt-3 w-full rounded-lg border border-red-700 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                                        >
                                            Pipeline Update
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selected ? (
                <PipelineUpdatePopup
                    job={popup.job}
                    candidate={selected}
                    onClose={() => setSelected(null)}
                    onUpdated={() => {
                        onRefresh?.();
                    }}
                />
            ) : null}
        </>
    );
}