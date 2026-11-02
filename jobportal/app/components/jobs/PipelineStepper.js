"use client";

import React from "react";

const STEPS = [
    { label: "Suggested", value: "Suggested Candidate" },
    { label: "Interview", value: "Requested Interview" },
    { label: "Offered", value: "Hired Candidate" },
    { label: "Immigration", value: "Immigration" },
    { label: "Placed", value: "Placed" },
];

function stepIndex(status) {
    const s = String(status || "").toLowerCase();

    if (s.includes("suggest")) return 0;

    // Shortlisted is hidden from the UI and treated as Suggested.
    if (s.includes("shortlist")) return 0;

    if (s.includes("interview")) return 1;
    if (s.includes("hired") || s.includes("offered")) return 2;
    if (s.includes("immigration")) return 3;
    if (s.includes("placed")) return 4;

    return 0;
}

export default function PipelineStepper({ status, candidate }) {
    const activeIndex = stepIndex(status);

    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 pb-0 ">
            <div className="mb-4">
                <div className="text-sm font-bold text-gray-900">
                    Pipeline Progress
                </div>
                <div className="text-xs text-gray-500">
                    Current status:{" "}
                    <b>
                        {String(status || "").toLowerCase().includes("shortlist")
                            ? "Suggested Candidate"
                            : status || "—"}
                    </b>
                </div>
            </div>

            <div className="relative overflow-x-auto pb-0">
                <div className="relative min-w-[650px] px-0 py-8 ">
                    <div className="absolute left-[10%] right-[10%] top-[70px] h-1 rounded-full bg-gray-200" />

                    <div
                        className="absolute left-[10%] top-[70px] h-1 rounded-full bg-red-600 transition-all duration-500"
                        style={{
                            width: `calc(80% * ${activeIndex / (STEPS.length - 1)})`,
                        }}
                    />

                    <div className="relative z-10 grid grid-cols-5 gap-0">
                        {STEPS.map((step, index) => {
                            const isDone = index < activeIndex;
                            const isActive = index === activeIndex;

                            return (
                                <div
                                    key={step.label}
                                    className="flex flex-col items-center text-center"
                                >
                                    <div
                                        className={`relative flex h-16 w-16 items-center justify-center rounded-full border-4 bg-white shadow-sm transition-all ${isActive
                                            ? "scale-110 border-red-600"
                                            : isDone
                                                ? "border-green-500"
                                                : "border-gray-300"
                                            }`}
                                    >
                                        {isActive ? (
                                            <img
                                                src={candidate?.avatar || "/images/default-avatar.jpg"}
                                                onError={(e) => {
                                                    e.currentTarget.src = "/images/default-avatar.jpg";
                                                }}
                                                alt={candidate?.fullName || "Candidate"}
                                                className="h-12 w-12 rounded-full object-cover"
                                            />
                                        ) : (
                                            <span
                                                className={`text-xl font-black ${isDone ? "text-green-600" : "text-gray-400"
                                                    }`}
                                            >
                                                {index + 1}
                                            </span>
                                        )}
                                    </div>

                                    <div
                                        className={`mt-3 text-sm font-bold ${isActive
                                            ? "text-red-700"
                                            : isDone
                                                ? "text-green-700"
                                                : "text-gray-500"
                                            }`}
                                    >
                                        {step.label}
                                    </div>

                                    <div className="mt-1 text-[11px] text-gray-400">
                                        Step {index + 1}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}