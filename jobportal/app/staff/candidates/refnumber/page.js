/* app/staff/candidates/[id]/edit/page.jsx  (Edit Candidate - FULL) */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
//import Header from "@/app/components/layouts/delete-staff/Header";

import { useForm, Controller, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDropzone } from "react-dropzone";

// ✅ adjust path if needed
import DocumentsFieldArray from "../../ui/DocumentsFieldArray";

/* ------------------------------------------------------------------ */
/* Helpers */
/* ------------------------------------------------------------------ */
function isValidDateNotFuture(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    d.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return d <= now;
}

function fileExtOk(file, allowedExt) {
    const name = (file?.name || "").toLowerCase();
    return allowedExt.some((ext) => name.endsWith(ext));
}

function isValidUrl(value) {
    if (!value) return true;
    try {
        const u = new URL(value);
        return !!u.hostname;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* UI: Tooltip + Inputs */
/* ------------------------------------------------------------------ */
function InfoTip({ text }) {
    if (!text) return null;
    return (
        <span className="relative inline-flex items-center group">
            <svg
                className="h-4 w-4 text-gray-400 group-hover:text-gray-700"
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path
                    fill="currentColor"
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 15c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1Zm0-8c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Z"
                />
            </svg>

            <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow-lg opacity-0 group-hover:opacity-100 transition">
                {text}
            </span>
        </span>
    );
}

function Field({ label, info, hint, error, children }) {
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <div className="text-sm text-gray-700">{label}</div>
                <InfoTip text={info} />
            </div>
            {hint ? <div className="text-xs text-gray-500">{hint}</div> : null}
            {children}
            {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>
    );
}

function Input(props) {
    return (
        <input
            {...props}
            className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-200 ${props.disabled ? "opacity-60" : ""
                }`}
        />
    );
}

function Select({ children, ...props }) {
    return (
        <select
            {...props}
            className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-200 ${props.disabled ? "opacity-60" : ""
                }`}
        >
            {children}
        </select>
    );
}

function Textarea(props) {
    return (
        <textarea
            {...props}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-200"
        />
    );
}

function PasswordInput({ value, onChange, placeholder, disabled, error }) {
    const [show, setShow] = useState(false);
    return (
        <div className="space-y-1">
            <div className="relative">
                <input
                    type={show ? "text" : "password"}
                    value={value || ""}
                    onChange={onChange}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-10 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-200 ${disabled ? "opacity-60" : ""
                        } ${error ? "border-red-400" : ""}`}
                />
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    disabled={disabled}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-500 hover:text-gray-800 disabled:opacity-50"
                    title={show ? "Hide" : "Show"}
                >
                    {show ? "🙈" : "👁️"}
                </button>
            </div>
            {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>
    );
}

function DropzoneBox({ label, info, acceptText, multiple, value, onChange, error }) {
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

            <div
                {...getRootProps()}
                className={`rounded-2xl border border-dashed px-4 py-4 text-sm cursor-pointer ${isDragActive ? "bg-amber-50 border-amber-300" : "bg-gray-50 border-gray-200"
                    }`}
            >
                <input {...getInputProps()} />
                <div className="text-gray-700">Click to add an asset or drag & drop</div>
                <div className="text-xs text-gray-500 mt-1">{acceptText}</div>

                <div className="mt-3 space-y-2">
                    {files.length === 0 ? (
                        <div className="text-xs text-gray-500">No new file selected.</div>
                    ) : (
                        files.map((f, idx) => (
                            <div key={`${f.name}-${idx}`} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                                <div className="text-xs text-gray-900 truncate">{f.name}</div>
                                <div className="text-xs text-gray-500">{Math.round((f.size || 0) / 1024)} KB</div>
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
function MultiSelectSearch({ label, info, hint, options, value, onChange, error }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const selected = Array.isArray(value) ? value : [];

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return options;
        return options.filter((o) => String(o).toLowerCase().includes(s));
    }, [q, options]);

    function toggle(opt) {
        const exists = selected.includes(opt);
        const next = exists ? selected.filter((x) => x !== opt) : [...selected, opt];
        onChange(next);
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <div className="text-sm text-gray-700">{label}</div>
                <InfoTip text={info} />
            </div>
            {hint ? <div className="text-xs text-gray-500">{hint}</div> : null}

            <div className="flex flex-wrap gap-2">
                {selected.length === 0 ? (
                    <div className="text-xs text-gray-500">No role selected.</div>
                ) : (
                    selected.map((r) => (
                        <span
                            key={r}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-800"
                        >
                            {r}
                            <button
                                type="button"
                                className="text-gray-500 hover:text-gray-900"
                                onClick={() => onChange(selected.filter((x) => x !== r))}
                                title="Remove"
                            >
                                ✕
                            </button>
                        </span>
                    ))
                )}
            </div>

            <div className="relative">
                <button
                    type="button"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                    onClick={() => setOpen((s) => !s)}
                >
                    {open ? "Close roles list" : "Select job roles"}
                </button>

                {open && (
                    <div className="absolute z-40 mt-2 w-full rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                        <div className="p-3 border-b border-gray-200">
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search roles..."
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-200"
                            />
                            <div className="mt-2 flex items-center justify-between">
                                <div className="text-xs text-gray-500">{filtered.length} results</div>
                                <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => onChange([])}>
                                    Clear all
                                </button>
                            </div>
                        </div>

                        <div className="max-h-64 overflow-auto p-2">
                            {filtered.length === 0 ? (
                                <div className="p-3 text-sm text-gray-600">No roles found.</div>
                            ) : (
                                filtered.map((opt) => (
                                    <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(opt)}
                                            onChange={() => toggle(opt)}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm text-gray-800">{opt}</span>
                                    </label>
                                ))
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

/* ------------------------------------------------------------------ */
/* ENUMS (replace later with Strapi enums fetch) */
/* ------------------------------------------------------------------ */
const ENUMS = {
    genders: ["Male", "Female", "Undisclosed"],
    nationalities: ["Pakistan", "UAE", "KSA", "India", "Bangladesh", "Philippines", "Egypt", "Other"],
    maritalStatus: ["Single", "Married", "Divorced", "Widowed"],
    seasonalStatus: ["Seasonal", "Permanent", "Any"],
    englishLevel: ["Average", "Basic", "Below Basic", "Excellent"],
    jobStatus: ["Available", "Working", "On Hold", "Blacklisted"],
    yesNo: [
        { label: "Yes", value: true },
        { label: "No", value: false },
    ],
};

const JOB_ROLES_DUMMY = [
    "CNC Machine Operator",
    "Electrician",
    "Fabricator",
    "General Worker",
    "Car Mechanic",
    "Forklift Operator",
    "Welder",
    "Plumber",
    "Painter",
];

/* ------------------------------------------------------------------ */
/* Zod Schema (Edit) */
/* ------------------------------------------------------------------ */
const EditSchema = z
    .object({
        referenceNumber: z.string().optional(),

        // identity
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        fullName: z.string().min(1, "Full name is required"),
        gender: z.string().min(1, "Gender is required"),
        birthDate: z.string().min(1, "Birth date is required"),
        nationality: z.string().min(1, "Nationality is required"),

        // status
        maritalStatus: z.string().min(1, "Marital status is required"),
        seasonalStatus: z.string().min(1, "Seasonal status is required"),
        englishLevel: z.string().min(1, "English level is required"),
        isProfileVerified: z.boolean(),
        currentlyEmployed: z.boolean().default(false),

        // contact + account
        mobile: z.string().min(7, "Mobile too short").max(20, "Mobile too long"),
        email: z.string().email("Invalid email"),
        username: z.string().min(3, "Username min 3 chars"),

        // job
        job_roles: z.array(z.string()).min(1, "Select at least 1 job role"),
        jobStatus: z.string().min(1, "Job status is required"),

        // extra
        numberOfExperience: z.coerce.number().min(0, "Must be 0 or more").optional(),
        shortSummary: z.string().max(250, "Max 250 characters").optional(),
        privateNotes: z.string().max(2000, "Max 2000 characters").optional(),
        currentJobExperiece: z.string().max(1200, "Max 1200 characters").optional(),
        previousJobExperiece: z.string().max(1200, "Max 1200 characters").optional(),
        previousCompany: z.string().max(120, "Max 120 characters").optional(),

        // screening
        dateScreeningInterview: z.string().optional(),
        screeningVideoLink: z.string().optional(),

        // passport
        passportExpireDate: z.string().min(1, "Passport expiry date is required"),

        // password update
        setPassword: z.boolean().default(false),
        password: z.string().optional(),
        retypePassword: z.string().optional(),

        // existing media urls
        existingProfileImageUrl: z.string().optional(),
        existingCvUrl: z.string().optional(),
        existingPassportUrl: z.string().optional(),
        existingWorkingVideoUrls: z.array(z.string()).default([]),
        existingMiScreeningVideoUrl: z.string().optional(),

        // replace uploads (optional)
        profileImageFile: z.any().optional(),
        cvFile: z.any().optional(),
        passportFile: z.any().optional(),
        workingVideos: z.any().optional(),
        miScreeningVideo: z.any().optional(),

        // repeatable documents
        documents: z
            .array(
                z.object({
                    name: z.string().min(1, "Document name is required"),
                    remarks: z.string().max(200, "Max 200 characters").optional(),
                    file: z.any().optional(),
                    existingUrl: z.string().optional(),
                })
            )
            .default([]),
    })
    .superRefine((val, ctx) => {
        if (!isValidDateNotFuture(val.birthDate)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["birthDate"], message: "Birth date invalid or in future" });
        }

        if (val.screeningVideoLink && !isValidUrl(val.screeningVideoLink)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["screeningVideoLink"], message: "Invalid URL (use https://...)" });
        }

        // password optional
        if (val.setPassword) {
            const p = (val.password || "").trim();
            const rp = (val.retypePassword || "").trim();
            if (!p || p.length < 8) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Min 8 characters" });
            }
            if (!rp) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retypePassword"], message: "Retype required" });
            }
            if (p && rp && p !== rp) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retypePassword"], message: "Passwords do not match" });
            }
        }

        // profile image (optional)
        if (val.profileImageFile && val.profileImageFile instanceof File) {
            if (!fileExtOk(val.profileImageFile, [".jpg", ".jpeg", ".png", ".webp"])) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["profileImageFile"], message: "Profile image must be jpg/png/webp" });
            }
        }

        // cv (optional) pdf or image
        if (val.cvFile && val.cvFile instanceof File) {
            if (!fileExtOk(val.cvFile, [".pdf", ".jpg", ".jpeg", ".png", ".webp"])) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cvFile"], message: "CV must be PDF or image" });
            }
        }

        // passport (optional) pdf or image
        if (val.passportFile && val.passportFile instanceof File) {
            if (!fileExtOk(val.passportFile, [".pdf", ".jpg", ".jpeg", ".png", ".webp"])) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["passportFile"], message: "Passport must be PDF or image" });
            }
        }

        // working videos (optional)
        if (Array.isArray(val.workingVideos)) {
            val.workingVideos.forEach((f, i) => {
                if (f instanceof File && !fileExtOk(f, [".mp4", ".mov", ".webm", ".mkv"])) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["workingVideos", i], message: "Video must be mp4/mov/webm/mkv" });
                }
            });
        }

        // mi screening video (optional)
        if (val.miScreeningVideo && val.miScreeningVideo instanceof File) {
            if (!fileExtOk(val.miScreeningVideo, [".mp4", ".mov", ".webm", ".mkv"])) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["miScreeningVideo"], message: "Video must be mp4/mov/webm/mkv" });
            }
        }

        // documents: validate only if user selected new file
        (val.documents || []).forEach((d, i) => {
            if (d.file && d.file instanceof File) {
                if (!fileExtOk(d.file, [".pdf", ".jpg", ".jpeg", ".png", ".webp"])) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["documents", i, "file"], message: "Invalid document file type" });
                }
            }
        });
    });

/* ------------------------------------------------------------------ */
/* Dummy loader (replace with Strapi fetch by id) */
/* ------------------------------------------------------------------ */
function getDummy(id) {
    return {
        referenceNumber: `CND-${String(id).slice(-4)}`,

        firstName: "Ali",
        lastName: "Khan",
        fullName: "Ali Khan",

        gender: "Male",
        birthDate: "1997-06-10",
        nationality: "Pakistan",

        maritalStatus: "Single",
        seasonalStatus: "Permanent",
        englishLevel: "Excellent",
        isProfileVerified: true,
        currentlyEmployed: false,

        mobile: "+92 300 1234567",
        email: "ali.khan@example.com",
        username: "ali.khan",

        job_roles: ["CNC Machine Operator", "Welder"],
        jobStatus: "Available",

        numberOfExperience: 5,
        shortSummary: "Ready to join immediately.",
        privateNotes: "Internal note: verified docs and good interview.",

        currentJobExperiece: "Currently working as CNC operator (2 years).",
        previousJobExperiece: "Worked as welder (3 years).",
        previousCompany: "ABC Engineering",

        source: "Facebook",
        dateScreeningInterview: "2026-02-01",
        screeningVideoLink: "https://example.com/screening",

        passportExpireDate: "2028-06-30",

        existingProfileImageUrl: "https://placehold.net/avatar.svg",
        existingCvUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        existingPassportUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        existingWorkingVideoUrls: [
            "https://file-examples.com/storage/fe9c09db77c5d52f2b0d51a/2017/04/file_example_MP4_480_1_5MG.mp4",
        ],
        existingMiScreeningVideoUrl:
            "https://file-examples.com/storage/fe9c09db77c5d52f2b0d51a/2017/04/file_example_MP4_480_1_5MG.mp4",

        setPassword: false,
        password: "",
        retypePassword: "",

        profileImageFile: null,
        cvFile: null,
        passportFile: null,
        workingVideos: [],
        miScreeningVideo: null,

        documents: [
            { name: "Experience Letter", remarks: "Verified", existingUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", file: null },
            { name: "Education Certificate", remarks: "Pending", existingUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", file: null },
        ],
    };
}

/* ------------------------------------------------------------------ */
/* Page */
/* ------------------------------------------------------------------ */
export default function EditCandidatePage({ params }) {
    const id = params?.id;
    const [submitMsg, setSubmitMsg] = useState("");

    // ✅ should come from Strapi (too many roles)
    const [jobRoles] = useState(JOB_ROLES_DUMMY);

    const {
        register,
        control,
        setValue,
        reset,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(EditSchema),
        defaultValues: {
            referenceNumber: "",

            firstName: "",
            lastName: "",
            fullName: "",
            gender: "",
            birthDate: "",
            nationality: "",

            maritalStatus: "",
            seasonalStatus: "",
            englishLevel: "",
            isProfileVerified: false,
            currentlyEmployed: false,

            mobile: "",
            email: "",
            username: "",

            job_roles: [],
            jobStatus: "",

            numberOfExperience: 0,
            shortSummary: "",
            privateNotes: "",

            currentJobExperiece: "",
            previousJobExperiece: "",
            previousCompany: "",


            dateScreeningInterview: "",
            screeningVideoLink: "",

            passportExpireDate: "",

            setPassword: false,
            password: "",
            retypePassword: "",

            existingProfileImageUrl: "",
            existingCvUrl: "",
            existingPassportUrl: "",
            existingWorkingVideoUrls: [],
            existingMiScreeningVideoUrl: "",

            profileImageFile: null,
            cvFile: null,
            passportFile: null,
            workingVideos: [],
            miScreeningVideo: null,

            documents: [],
        },
    });

    const [
        firstName,
        lastName,
        setPassword,
        existingProfileImageUrl,
        existingCvUrl,
        existingPassportUrl,
        watchedExistingWorkingVideoUrls,
        existingMiScreeningVideoUrl,
    ] = useWatch({
        control,
        name: [
            "firstName",
            "lastName",
            "setPassword",
            "existingProfileImageUrl",
            "existingCvUrl",
            "existingPassportUrl",
            "existingWorkingVideoUrls",
            "existingMiScreeningVideoUrl",
        ],
    });

    const existingWorkingVideoUrls = watchedExistingWorkingVideoUrls || [];

    useEffect(() => {
        reset(getDummy(Number(id)));
    }, [id, reset]);

    // auto fullName
    useEffect(() => {
        const fn = `${firstName || ""} ${lastName || ""}`.trim();
        setValue("fullName", fn, { shouldValidate: true, shouldDirty: true });
    }, [firstName, lastName, setValue]);

    const onSubmit = async (data) => {
        setSubmitMsg("");
        console.log("Edit payload:", data);
        setSubmitMsg("Candidate updated (dummy). Later connect to Strapi.");
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <Header />

            <main className="mx-auto w-[95%] lg:w-[85%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <header className="border-b border-gray-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-lg text-gray-900">Edit Candidate</div>
                                <div className="text-sm text-gray-600">ID: {id}</div>
                            </div>
                            <Link
                                href="/staff/candidates"
                                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                                Back
                            </Link>
                        </div>
                    </header>

                    <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-6">
                        {/* ------------------ Profile Image (Existing + Replace) ------------------ */}
                        <div className="rounded-2xl border border-gray-200 p-4">
                            <div className="text-sm font-semibold text-gray-900">Profile Image</div>

                            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                                    <div className="text-sm text-gray-800">Existing Profile Image</div>
                                    {existingProfileImageUrl ? (
                                        <div className="mt-2 flex items-center gap-3">
                                            <div
                                                role="img"
                                                aria-label="Profile"
                                                className="h-16 w-16 rounded-2xl border border-gray-200 bg-white bg-cover bg-center"
                                                style={{
                                                    backgroundImage: `url("${String(existingProfileImageUrl).replace(/"/g, "%22")}")`,
                                                }}
                                            />
                                            <a
                                                className="text-sm text-blue-600 hover:underline"
                                                href={existingProfileImageUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Open
                                            </a>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-gray-500 mt-1">None</div>
                                    )}
                                </div>

                                <Controller
                                    control={control}
                                    name="profileImageFile"
                                    render={({ field }) => (
                                        <DropzoneBox
                                            label="Replace Profile Image (Optional)"
                                            info="Upload jpg/png/webp"
                                            acceptText="Accepted: .jpg, .png, .webp"
                                            multiple={false}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.profileImageFile?.message}
                                        />
                                    )}
                                />
                            </div>
                        </div>

                        {/* ------------------ Identity & Contact ------------------ */}
                        <div className="rounded-2xl border border-gray-200 p-4">
                            <div className="text-sm font-semibold text-gray-900">Identity & Contact</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Reference Number" hint="Auto-generated by Strapi">
                                    <Input {...register("referenceNumber")} disabled />
                                </Field>

                                <Field label="Full Name" hint="Auto from first + last" error={errors.fullName?.message}>
                                    <Input {...register("fullName")} readOnly />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="First Name" info="As per passport" error={errors.firstName?.message}>
                                    <Input {...register("firstName")} />
                                </Field>
                                <Field label="Last Name" info="As per passport" error={errors.lastName?.message}>
                                    <Input {...register("lastName")} />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field label="Gender" info="Strapi enum" error={errors.gender?.message}>
                                    <Select {...register("gender")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.genders.map((g) => (
                                            <option key={g} value={g}>
                                                {g}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Birth Date" info="Must not be in future" error={errors.birthDate?.message}>
                                    <Input {...register("birthDate")} type="date" />
                                </Field>

                                <Field label="Nationality" info="Strapi enum" error={errors.nationality?.message}>
                                    <Select {...register("nationality")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.nationalities.map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Mobile" error={errors.mobile?.message}>
                                    <Input {...register("mobile")} placeholder="+92 3xx xxxxxxx" />
                                </Field>
                                <Field label="Email" info="Login/communication email" error={errors.email?.message}>
                                    <Input {...register("email")} />
                                </Field>
                            </div>
                        </div>

                        {/* ------------------ Job & Status ------------------ */}
                        <div className="rounded-2xl border border-gray-200 p-4">
                            <div className="text-sm font-semibold text-gray-900">Job & Status</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Controller
                                    control={control}
                                    name="job_roles"
                                    render={({ field }) => (
                                        <MultiSelectSearch
                                            label="Job Roles"
                                            info="Search & select multiple roles (Strapi relation)"
                                            hint="Type to search roles."
                                            options={jobRoles}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.job_roles?.message}
                                        />
                                    )}
                                />

                                <Field label="Job Status" error={errors.jobStatus?.message}>
                                    <Select {...register("jobStatus")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.jobStatus.map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                                <Field label="Marital Status" error={errors.maritalStatus?.message}>
                                    <Select {...register("maritalStatus")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.maritalStatus.map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Seasonal Status" error={errors.seasonalStatus?.message}>
                                    <Select {...register("seasonalStatus")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.seasonalStatus.map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="English Level" error={errors.englishLevel?.message}>
                                    <Select {...register("englishLevel")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.englishLevel.map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Profile Verified" info="Set Yes only after document checks">
                                    <Controller
                                        control={control}
                                        name="isProfileVerified"
                                        render={({ field }) => (
                                            <Select value={String(field.value)} onChange={(e) => field.onChange(e.target.value === "true")}>
                                                <option value="">Choose here</option>
                                                {ENUMS.yesNo.map((x) => (
                                                    <option key={x.label} value={String(x.value)}>
                                                        {x.label}
                                                    </option>
                                                ))}
                                            </Select>
                                        )}
                                    />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field label="Years of Experience" error={errors.numberOfExperience?.message}>
                                    <Input {...register("numberOfExperience")} type="number" min={0} step="any" />
                                </Field>

                                <Field label="Currently Employed">
                                    <Controller
                                        control={control}
                                        name="currentlyEmployed"
                                        render={({ field }) => (
                                            <Select value={String(field.value)} onChange={(e) => field.onChange(e.target.value === "true")}>
                                                <option value="">Choose here</option>
                                                {ENUMS.yesNo.map((x) => (
                                                    <option key={x.label} value={String(x.value)}>
                                                        {x.label}
                                                    </option>
                                                ))}
                                            </Select>
                                        )}
                                    />
                                </Field>
                            </div>
                        </div>

                        {/* ------------------ Experience ------------------ */}
                        <div className="rounded-2xl border border-gray-200 p-4">
                            <div className="text-sm font-semibold text-gray-900">Experience Details</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field label="Previous Company" error={errors.previousCompany?.message}>
                                    <Input {...register("previousCompany")} />
                                </Field>

                                <Field label="Current Job Experience" error={errors.currentJobExperiece?.message}>
                                    <Input {...register("currentJobExperiece")} />
                                </Field>

                                <Field label="Previous Job Experience" error={errors.previousJobExperiece?.message}>
                                    <Input {...register("previousJobExperiece")} />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Short Summary" info="Max 250 chars" error={errors.shortSummary?.message}>
                                    <Input {...register("shortSummary")} placeholder="Quick summary..." />
                                </Field>

                                <Field label="Private Notes" info="Internal only" error={errors.privateNotes?.message}>
                                    <Input {...register("privateNotes")} placeholder="Internal notes..." />
                                </Field>
                            </div>
                        </div>

                        {/* ------------------ Existing CV/Passport ------------------ */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                                <div className="text-sm text-gray-800">Existing CV</div>
                                {existingCvUrl ? (
                                    <a className="text-sm text-blue-600 hover:underline" href={existingCvUrl} target="_blank" rel="noreferrer">
                                        Open / Download
                                    </a>
                                ) : (
                                    <div className="text-xs text-gray-500">None</div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                                <div className="text-sm text-gray-800">Existing Passport</div>
                                {existingPassportUrl ? (
                                    <a className="text-sm text-blue-600 hover:underline" href={existingPassportUrl} target="_blank" rel="noreferrer">
                                        Open / Download
                                    </a>
                                ) : (
                                    <div className="text-xs text-gray-500">None</div>
                                )}
                            </div>
                        </div>

                        {/* ------------------ Media (Replace) + Passport Expiry ------------------ */}
                        <div className="rounded-2xl border border-gray-200 p-4">
                            <div className="text-sm font-semibold text-gray-900">Documents & Media</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Passport Expiry Date" info="Required" error={errors.passportExpireDate?.message}>
                                    <Input {...register("passportExpireDate")} type="date" />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Controller
                                    control={control}
                                    name="cvFile"
                                    render={({ field }) => (
                                        <DropzoneBox
                                            label="Replace CV (Optional)"
                                            info="Allowed: PDF or image"
                                            acceptText="Accepted: .pdf, .jpg, .png, .webp"
                                            multiple={false}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.cvFile?.message}
                                        />
                                    )}
                                />

                                <Controller
                                    control={control}
                                    name="passportFile"
                                    render={({ field }) => (
                                        <DropzoneBox
                                            label="Replace Passport (Optional)"
                                            info="Allowed: PDF or image"
                                            acceptText="Accepted: .pdf, .jpg, .png, .webp"
                                            multiple={false}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.passportFile?.message}
                                        />
                                    )}
                                />
                            </div>

                            {/* Working videos */}
                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                                    <div className="text-sm text-gray-800">Existing Working Videos</div>
                                    {existingWorkingVideoUrls.length ? (
                                        <div className="mt-2 space-y-1">
                                            {existingWorkingVideoUrls.map((u, idx) => (
                                                <a
                                                    key={idx}
                                                    className="block text-sm text-blue-600 hover:underline truncate"
                                                    href={u}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    Video {idx + 1}
                                                </a>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-gray-500 mt-1">None</div>
                                    )}
                                </div>

                                <Controller
                                    control={control}
                                    name="workingVideos"
                                    render={({ field }) => (
                                        <DropzoneBox
                                            label="Add/Replace Working Videos (Optional)"
                                            info="Upload multiple videos"
                                            acceptText="Accepted: .mp4, .mov, .webm, .mkv"
                                            multiple={true}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.workingVideos?.message}
                                        />
                                    )}
                                />
                            </div>

                            {/* MI screening video */}
                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                                    <div className="text-sm text-gray-800">Existing MI Screening Video</div>
                                    {existingMiScreeningVideoUrl ? (
                                        <a className="text-sm text-blue-600 hover:underline" href={existingMiScreeningVideoUrl} target="_blank" rel="noreferrer">
                                            Open Video
                                        </a>
                                    ) : (
                                        <div className="text-xs text-gray-500">None</div>
                                    )}
                                </div>

                                <Controller
                                    control={control}
                                    name="miScreeningVideo"
                                    render={({ field }) => (
                                        <DropzoneBox
                                            label="Replace MI Screening Video (Optional)"
                                            info="Upload new screening video if needed"
                                            acceptText="Accepted: .mp4, .mov, .webm, .mkv"
                                            multiple={false}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.miScreeningVideo?.message}
                                        />
                                    )}
                                />
                            </div>

                            {/* Repeatable documents */}
                            <div className="mt-4">
                                <DocumentsFieldArray control={control} register={register} errors={errors} name="documents" />
                            </div>
                        </div>

                        {/* ------------------ Screening ------------------ */}
                        <div className="rounded-2xl border border-gray-200 p-4">
                            <div className="text-sm font-semibold text-gray-900">Screening</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Screening Interview Date" info="Optional date" error={errors.dateScreeningInterview?.message}>
                                    <Input {...register("dateScreeningInterview")} type="date" />
                                </Field>

                                <Field
                                    label="Screening Video Link"
                                    info="Optional URL (must be full https://...)"
                                    error={errors.screeningVideoLink?.message}
                                >
                                    <Input {...register("screeningVideoLink")} placeholder="https://..." />
                                </Field>
                            </div>
                        </div>

                        {/* ------------------ Account ------------------ */}
                        <div className="rounded-2xl border border-gray-200 p-4">
                            <div className="text-sm font-semibold text-gray-900">Account</div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Username" error={errors.username?.message}>
                                    <Input {...register("username")} />
                                </Field>

                                <Field label="Email" hint="Login email" error={errors.email?.message}>
                                    <Input {...register("email")} />
                                </Field>
                            </div>

                            <div className="mt-4 flex items-center gap-2">
                                <input type="checkbox" {...register("setPassword")} className="h-4 w-4" id="setPassword" />
                                <label htmlFor="setPassword" className="text-sm text-gray-800">
                                    Set / Update Password (optional)
                                </label>
                            </div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Password" error={errors.password?.message}>
                                    <Controller
                                        control={control}
                                        name="password"
                                        render={({ field }) => (
                                            <PasswordInput
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder="Min 8 characters"
                                                disabled={!setPassword}
                                                error={errors.password?.message}
                                            />
                                        )}
                                    />
                                </Field>

                                <Field label="Retype Password" error={errors.retypePassword?.message}>
                                    <Controller
                                        control={control}
                                        name="retypePassword"
                                        render={({ field }) => (
                                            <PasswordInput
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder="Retype password"
                                                disabled={!setPassword}
                                                error={errors.retypePassword?.message}
                                            />
                                        )}
                                    />
                                </Field>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                            <Link
                                href="/staff/candidates"
                                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-center"
                            >
                                Cancel
                            </Link>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
                            >
                                {isSubmitting ? "Saving..." : "Update Candidate"}
                            </button>
                        </div>

                        {submitMsg ? (
                            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                                {submitMsg}
                            </div>
                        ) : null}
                    </form>
                </div>
            </main>
        </div>
    );
}