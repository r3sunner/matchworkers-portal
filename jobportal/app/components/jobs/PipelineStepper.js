"use client";

import React from "react";

// Stages as agreed with Matchworkers (Recruitly stage mapping, Nov 2026).
const STEPS = [
    { label: "Suggested", value: "Suggested Candidate" },
    { label: "Shortlisted", value: "Shortlisted Candidate" },
    { label: "Interview", value: "Requested Interview" },
    { label: "Interviewed", value: "Interviewed" },
    { label: "Offered", value: "Hired Candidate" },
    { label: "Immigration", value: "Immigration" },
    { label: "Placed", value: "Placed" },
];

const EDGE = 50 / STEPS.length; // % from each side to the centre of the outer steps

function stepIndex(status) {
    const s = String(status || "").toLowerCase();

    if (s.includes("suggest")) return 0;
    if (s.includes("shortlist")) return 1;
    // "interviewed" must be checked before "interview".
    if (s === "interviewed") return 3;
    if (s.includes("interview")) return 2;
    if (s.includes("hired") || s.includes("offered")) return 4;
    if (s.includes("immigration")) return 5;
    if (s.includes("placed")) return 6;

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
                <div className="relative min-w-[860px] px-0 py-8 ">
                    {/* Line runs from the centre of the first step to the centre of the last. */}
                    <div
                        className="absolute top-[70px] h-1 rounded-full bg-gray-200"
                        style={{ left: `${EDGE}%`, right: `${EDGE}%` }}
                    />

                    <div
                        className="absolute top-[70px] h-1 rounded-full bg-red-600 transition-all duration-500"
                        style={{
                            left: `${EDGE}%`,
                            width: `calc(${100 - 2 * EDGE}% * ${activeIndex / (STEPS.length - 1)})`,
                        }}
                    />

                    <div
                        className="relative z-10 grid gap-0"
                        style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}
                    >
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