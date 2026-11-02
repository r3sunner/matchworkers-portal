"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ENUMS from "../../../../config/enums.json";

// ✅ your existing component
import DocumentsFieldArray from "@/app/staff/ui/DocumentsFieldArray";

import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
    Field,
    Input,
    Select,
    Textarea,
    DropzoneBox,
    MultiSelectSearchIds,
    PasswordInput,
    normalizePhone,
    fileExtOk,
    isValidDateNotFuture,
} from "@/app/staff/ui/CandidateFormUI";

/* ------------------------------------------------------------------ */
/* Helpers */
/* ------------------------------------------------------------------ */
function isValidUrlOptional(v) {
    const s = String(v || "").trim();
    if (!s) return true;

    try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

async function fetchJobRoles() {
    const res = await fetch("/api/candidates/job-role", {
        method: "GET",
        cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to fetch job roles");
    }

    return Array.isArray(json?.data) ? json.data : [];
}

async function fetchAgents() {
    const res = await fetch("/api/candidates/agents", {
        method: "GET",
        cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to fetch agents");
    }

    return Array.isArray(json?.items) ? json.items : [];
}

function agentLabel(agent) {
    if (!agent) return "No Agent";
    const company = agent.companyName || agent.label || "";
    const contact = agent.contactName || "";
    return contact ? `${company} (${contact})` : company || "Unnamed Agent";
}

/* ------------------------------------------------------------------ */
/* Schema (Strapi fields) */
/* ------------------------------------------------------------------ */
const CandidateCreateSchema = z
    .object({
        referenceNumber: z.string().optional(),

        fullName: z.string().min(1, "Full name is required"),
        firstName: z.string().min(2, "First name must be at least 2 characters"),

        lastName: z.string().optional(),

        genderList: z.string().optional(),
        birthDate: z.string().optional(),
        nationalityList: z.string().optional(),
        maritalStatusList: z.string().optional(),
        seasonalStatusList: z.string().optional(),
        englishLevelList: z.string().optional(),

        mobile: z.string().optional(),
        email: z.string().min(1, "Email is required"),

        jobStatus: z.string().optional(),
        job_roles: z.array(z.number()).optional(),

        isProfileVerifiedList: z.string().optional(),
        currentlyEmployed: z.boolean().optional(),

        numberOfExperience: z.coerce.number().optional(),
        shortSummary: z.string().max(250, "Max 250 characters").optional(),
        privateNotes: z.string().max(2000, "Max 2000 characters").optional(),

        currentJobExperiece: z.coerce.number().optional(),
        previousJobExperiece: z.coerce.number().optional(),
        previousCompany: z.string().max(120, "Max 120 characters").optional(),
        currentCompany: z.string().max(120, "Max 120 characters").optional(),

        agent: z.coerce.number().nullable().optional(),

        dateScreeningInterview: z.string().optional(),

        username: z.string().min(1, "Username is required"),
        password: z.string().min(3, "Password must be at least 3 characters"),
        retypePassword: z.string().min(3, "Retype Password must be at least 3 characters"),

        profileImage: z.any().optional(),
        CV: z.any().optional(),
        passport: z.any().optional(),
        passportExpireDate: z.string().optional(),

        workingVideoLink: z.string().optional(),
        miScreeningVideoLink: z.string().optional(),

        documents: z
            .array(
                z.object({
                    name: z.string().optional(),
                    remarks: z.string().max(200, "Max 200 characters").optional(),
                    file: z.any().optional(),
                    existingUrl: z.string().optional(),
                })
            )
            .default([]),
    })
    .superRefine((val, ctx) => {
        if (val.profileImage && val.profileImage instanceof File) {
            if (!fileExtOk(val.profileImage, [".jpg", ".jpeg", ".png", ".webp"])) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["profileImage"],
                    message: "Profile image must be jpg/png/webp",
                });
            }
        }

        if (val.birthDate) {
            if (!isValidDateNotFuture(val.birthDate)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["birthDate"],
                    message: "Invalid birth date",
                });
            }
        }

        if (val.email) {
            const emailOk = z.string().email().safeParse(val.email).success;
            if (!emailOk) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["email"],
                    message: "Invalid email",
                });
            }
        }

        if (val.mobile) {
            const m = String(val.mobile).trim();
            if (m.length < 7 || m.length > 20) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["mobile"],
                    message: "Mobile must be 7–20 characters",
                });
            }
        }

        const p = (val.password || "").trim();
        const rp = (val.retypePassword || "").trim();

        if (p || rp) {
            if (p.length < 4) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["password"],
                    message: "Password must be at least 4 characters",
                });
            }

            if (!rp) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["retypePassword"],
                    message: "Retype password is required",
                });
            }

            if (p && rp && p !== rp) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["retypePassword"],
                    message: "Passwords do not match",
                });
            }
        }

        if (val.CV && val.CV instanceof File) {
            if (!fileExtOk(val.CV, [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"])) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["CV"],
                    message: "CV must be pdf/jpg/png/webp/doc/docx",
                });
            }
        }

        if (val.passport && val.passport instanceof File) {
            if (!fileExtOk(val.passport, [".pdf", ".jpg", ".jpeg", ".png", ".webp"])) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["passport"],
                    message: "Passport must be pdf/jpg/png/webp",
                });
            }
        }

        if (!isValidUrlOptional(val.workingVideoLink)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["workingVideoLink"],
                message: "Working video link must be a valid http/https URL",
            });
        }

        if (!isValidUrlOptional(val.miScreeningVideoLink)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["miScreeningVideoLink"],
                message: "MI screening video link must be a valid http/https URL",
            });
        }

        (val.documents || []).forEach((d, i) => {
            const any = (d?.name || "").trim() || (d?.remarks || "").trim() || d?.file;

            if (!any) return;

            if (!String(d?.name || "").trim()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["documents", i, "name"],
                    message: "Document name is required",
                });
            }

            if (d?.file && d.file instanceof File) {
                if (!fileExtOk(d.file, [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".csv"])) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["documents", i, "file"],
                        message: "Invalid file type (pdf/image/doc/xls/csv allowed)",
                    });
                }
            } else {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["documents", i, "file"],
                    message: "Document file is required",
                });
            }
        });
    });

/* ------------------------------------------------------------------ */
/* Page */
/* ------------------------------------------------------------------ */
export default function NewCandidatePage() {
    const [jobRoles, setJobRoles] = useState([]);
    const [jobRolesLoading, setJobRolesLoading] = useState(true);
    const [jobRolesError, setJobRolesError] = useState("");

    const [agents, setAgents] = useState([]);
    const [agentsLoading, setAgentsLoading] = useState(true);
    const [agentsError, setAgentsError] = useState("");
    const [submitMsg, setSubmitMsg] = useState("");

    useEffect(() => {
        let alive = true;

        async function loadJobRoles() {
            try {
                setJobRolesLoading(true);
                setJobRolesError("");

                const roles = await fetchJobRoles();

                if (!alive) return;

                setJobRoles(roles);
            } catch (error) {
                console.error("Fetch job roles error:", error);

                if (!alive) return;

                setJobRoles([]);
                setJobRolesError(error?.message || "Failed to fetch job roles");
            } finally {
                if (alive) {
                    setJobRolesLoading(false);
                }
            }
        }

        loadJobRoles();

        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        let alive = true;

        async function loadAgents() {
            try {
                setAgentsLoading(true);
                setAgentsError("");

                const list = await fetchAgents();

                if (!alive) return;

                setAgents(list);
            } catch (error) {
                console.error("Fetch agents error:", error);

                if (!alive) return;

                setAgents([]);
                setAgentsError(error?.message || "Failed to fetch agents");
            } finally {
                if (alive) {
                    setAgentsLoading(false);
                }
            }
        }

        loadAgents();

        return () => {
            alive = false;
        };
    }, []);

    const {
        register,
        control,
        watch,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(CandidateCreateSchema),
        defaultValues: {
            referenceNumber: "",

            firstName: "",
            lastName: "",
            fullName: "",
            profileImage: null,
            genderList: "",
            birthDate: "",
            nationalityList: "",
            maritalStatusList: "",
            seasonalStatusList: "",
            englishLevelList: "",

            mobile: "",
            email: "",

            jobStatus: "",
            job_roles: [],

            isProfileVerifiedList: "",
            currentlyEmployed: false,

            numberOfExperience: 0,
            shortSummary: "",
            privateNotes: "",

            currentJobExperiece: 0,
            previousJobExperiece: 0,
            previousCompany: "",
            currentCompany: "",

            agent: null,

            dateScreeningInterview: "",

            username: "",
            password: "",
            retypePassword: "",

            CV: null,
            passport: null,
            passportExpireDate: "",

            workingVideoLink: "",
            miScreeningVideoLink: "",

            documents: [],
        },
    });

    const profileImage = watch("profileImage");

    const profilePreview = useMemo(() => {
        if (profileImage && profileImage instanceof File) {
            return URL.createObjectURL(profileImage);
        }

        return "";
    }, [profileImage]);

    useEffect(() => {
        if (!(profileImage instanceof File)) return;

        const url = URL.createObjectURL(profileImage);

        return () => URL.revokeObjectURL(url);
    }, [profileImage]);

    const onSubmit = async (formData) => {
        setSubmitMsg("");

        if (formData.mobile) {
            formData.mobile = normalizePhone(formData.mobile);
        }

        try {
            const payloadData = {
                ...formData,
                agent: formData.agent ? Number(formData.agent) : null,

                profileImage: undefined,
                CV: undefined,
                passport: undefined,

                documents: (formData.documents || []).map((d) => ({
                    name: d?.name || "",
                    remarks: d?.remarks || "",
                })),
            };

            const fd = new FormData();

            fd.append("data", JSON.stringify(payloadData));

            if (formData.profileImage instanceof File) {
                fd.append("files.profileImage", formData.profileImage);
            }

            if (formData.CV instanceof File) {
                fd.append("files.CV", formData.CV);
            }

            if (formData.passport instanceof File) {
                fd.append("files.passport", formData.passport);
            }

            (formData.documents || []).forEach((doc, idx) => {
                if (doc?.file instanceof File) {
                    fd.append(`files.documents.${idx}.file`, doc.file);
                }
            });

            const res = await fetch("/api/candidates/create", {
                method: "POST",
                body: fd,
            });

            const json = await res.json();

            if (!res.ok) {
                throw new Error(json?.error || "Candidate not saved");
            }

            setSubmitMsg(`Candidate saved ✅ Ref: ${json.referenceNumber || ""}`);
        } catch (error) {
            console.error("Add Candidate Error:", error);
            setSubmitMsg(`Error: ${error.message || "Candidate not saved"} ❌`);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <main className="mx-auto w-[95%] lg:w-[85%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <header className="border-b border-gray-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-lg text-gray-900">Create Candidate</div>
                                <div className="text-sm text-gray-600">Create new candidate.</div>
                            </div>

                            <Link
                                href="/staff/candidates"
                                className="rounded-xl border border-gray-400 bg-white px-6 py-2 text-base text-gray-700 hover:bg-gray-50"
                            >
                                Back
                            </Link>
                        </div>
                    </header>

                    <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-6">
                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Identity & Contact</div>
                            <div className="text-sm text-gray-800 mt-1">
                                Start with required information for quick processing.
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field
                                    label={
                                        <>
                                            Full Name <span className="text-red-600 text-lg">*</span>
                                        </>
                                    }
                                    info="Full name of candidate"
                                    error={errors.fullName?.message}
                                >
                                    <Input {...register("fullName")} placeholder="First + Middle + Last" />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Controller
                                    control={control}
                                    name="profileImage"
                                    render={({ field }) => (
                                        <DropzoneBox
                                            label="Profile Image"
                                            acceptText="Accepted: .jpg, .png, .webp"
                                            multiple={false}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.profileImage?.message}
                                        />
                                    )}
                                />

                                {profilePreview ? (
                                    <div className="rounded-2xl border border-gray-200 p-3 bg-gray-50">
                                        <div className="text-sm text-gray-800 mb-2">Preview</div>
                                        <img
                                            src={profilePreview}
                                            className="h-40 w-40 rounded-2xl object-cover border border-gray-200 bg-white"
                                            alt="Preview"
                                        />
                                    </div>
                                ) : null}
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field
                                    label={
                                        <>
                                            First Name <span className="text-red-600 text-lg">*</span>
                                        </>
                                    }
                                    info="Candidate first name as per passport."
                                    error={errors.firstName?.message}
                                >
                                    <Input {...register("firstName")} />
                                </Field>

                                <Field
                                    label="Last Name"
                                    info="Candidate last name as per passport."
                                    error={errors.lastName?.message}
                                >
                                    <Input {...register("lastName")} />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field
                                    label="Gender"
                                    info="Enumeration from Strapi (Male/Female/Undisclosed)."
                                    error={errors.genderList?.message}
                                >
                                    <Select {...register("genderList")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.genders.map((g) => (
                                            <option key={g} value={g}>
                                                {g}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Birth Date" info="Must not be in future." error={errors.birthDate?.message}>
                                    <Input {...register("birthDate")} type="date" />
                                </Field>

                                <Field
                                    label="Nationality"
                                    info="Enumeration from Strapi."
                                    error={errors.nationalityList?.message}
                                >
                                    <Select {...register("nationalityList")}>
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
                                <Field label="Mobile" info="Phone number 7–20 chars." error={errors.mobile?.message}>
                                    <Input {...register("mobile")} placeholder="+971 5xx xxxxxxx" />
                                </Field>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Job & Status</div>
                            <div className="text-sm text-gray-800 mt-1">
                                Most-used screening fields for shortlisting.
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Controller
                                    control={control}
                                    name="job_roles"
                                    render={({ field }) => (
                                        <div>
                                            <MultiSelectSearchIds
                                                label="Job Roles"
                                                info="Search and select multiple roles (Strapi relation)."
                                                hint={
                                                    jobRolesLoading
                                                        ? "Loading job roles..."
                                                        : jobRolesError
                                                            ? "Job roles failed to load."
                                                            : "Type to search roles. Select multiple."
                                                }
                                                options={jobRoles}
                                                value={field.value || []}
                                                onChange={field.onChange}
                                                error={errors.job_roles?.message || jobRolesError}
                                                getLabel={(o) => o.title}
                                                getValue={(o) => o.id}
                                            />

                                            {jobRolesLoading ? (
                                                <div className="mt-1 text-xs text-gray-500">Loading job roles...</div>
                                            ) : null}

                                            {jobRolesError ? (
                                                <div className="mt-1 text-xs text-red-600">{jobRolesError}</div>
                                            ) : null}
                                        </div>
                                    )}
                                />

                                <Field label="Job Status" info="Current candidate availability status." error={errors.jobStatus?.message}>
                                    <Select {...register("jobStatus")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.jobStatus.map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Agent" info="Link candidate with agent." error={errors.agent?.message || agentsError}>
                                    <Select {...register("agent")}>
                                        <option value="">No Agent</option>
                                        {agents.map((a) => (
                                            <option key={a.documentId} value={a.id}>
                                                {agentLabel(a)}
                                            </option>
                                        ))}
                                    </Select>
                                    {agentsLoading ? (
                                        <div className="mt-1 text-xs text-gray-500">Loading agents...</div>
                                    ) : null}
                                    {agentsError ? (
                                        <div className="mt-1 text-xs text-red-600">{agentsError}</div>
                                    ) : null}
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                                <Field
                                    label="Marital Status"
                                    info="Enumeration from Strapi."
                                    error={errors.maritalStatusList?.message}
                                >
                                    <Select {...register("maritalStatusList")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.maritalStatus.map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field
                                    label="Seasonal Status"
                                    info="Enumeration from Strapi."
                                    error={errors.seasonalStatusList?.message}
                                >
                                    <Select {...register("seasonalStatusList")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.seasonalStatus.map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field
                                    label="English Level"
                                    info="Enumeration from Strapi."
                                    error={errors.englishLevelList?.message}
                                >
                                    <Select {...register("englishLevelList")}>
                                        <option value="">Choose here</option>
                                        {ENUMS.englishLevel.map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Profile Verified" info="Set Yes only after document checks.">
                                    <Controller
                                        control={control}
                                        name="isProfileVerifiedList"
                                        render={({ field }) => (
                                            <Select
                                                value={field.value || ""}
                                                onChange={(e) => field.onChange(e.target.value)}
                                            >
                                                <option value="">Choose here</option>
                                                {ENUMS.isProfileVerified.map((x, idx) => (
                                                    <option key={`${x}-${idx}`} value={x}>
                                                        {x}
                                                    </option>
                                                ))}
                                            </Select>
                                        )}
                                    />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field
                                    label="Number of Experience (Years)"
                                    info="Total experience in years. (number field)"
                                    error={errors.numberOfExperience?.message}
                                >
                                    <Input {...register("numberOfExperience")} type="number" min={0} step={1} />
                                </Field>

                                <Field label="Currently Employed" info="Yes if candidate is currently working.">
                                    <Controller
                                        control={control}
                                        name="currentlyEmployed"
                                        render={({ field }) => (
                                            <Select
                                                value={String(field.value)}
                                                onChange={(e) => field.onChange(e.target.value === "true")}
                                            >
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

                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Experience Details</div>
                            <div className="text-sm text-gray-800 mt-1">Useful for recruiters and screening.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field label="Previous Company" info="Last company name (if any)." error={errors.previousCompany?.message}>
                                    <Input {...register("previousCompany")} placeholder="Company name" />
                                </Field>

                                {/*      <Field
                                    label="Previous Job Experience"
                                    info="Short details about previous jobs."
                                    error={errors.previousJobExperiece?.message}
                                >
                                    <Input {...register("previousJobExperiece")} type="number" min={0} step={1} />
                                </Field>    */   }

                                <Field label="Current Company" info="Last company name (if any)." error={errors.currentCompany?.message}>
                                    <Input {...register("currentCompany")} placeholder="Company name" />
                                </Field>


                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">


                                {/*  <Field
                                    label="Current Job Experience"
                                    info="Short details about current job."
                                    error={errors.currentJobExperiece?.message}
                                >
                                    <Input {...register("currentJobExperiece")} type="number" min={0} step={1} />
                                </Field>     */}
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Short Summary" info="Max 250 chars. Good for quick review." error={errors.shortSummary?.message}>
                                    <Textarea
                                        {...register("shortSummary")}
                                        placeholder="e.g. Ready to join, strong skills in..."
                                        rows={4}
                                        maxLength={250}
                                    />
                                </Field>

                                <Field label="Private Notes" info="Internal only (not for clients)." error={errors.privateNotes?.message}>
                                    <Textarea
                                        {...register("privateNotes")}
                                        placeholder="Recruiter notes..."
                                        rows={4}
                                        maxLength={2000}
                                    />
                                </Field>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Documents & Media</div>
                            <div className="text-sm text-gray-800 mt-1">Upload required media. CV supports PDF/images.</div>

                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Controller
                                    control={control}
                                    name="CV"
                                    render={({ field }) => (
                                        <DropzoneBox
                                            label="CV (Required)"
                                            info="Strapi media: PDF or image."
                                            hint="Accepted: .pdf, .jpg, .png, .webp"
                                            acceptText="Accepted: .pdf, .jpg, .png, .webp"
                                            multiple={false}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.CV?.message}
                                        />
                                    )}
                                />

                                <Controller
                                    control={control}
                                    name="passport"
                                    render={({ field }) => (
                                        <DropzoneBox
                                            label="Passport (Required)"
                                            info="Passport scan image or PDF."
                                            hint="Accepted: .pdf, .jpg, .png, .webp"
                                            acceptText="Accepted: .pdf, .jpg, .png, .webp"
                                            multiple={false}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.passport?.message}
                                        />
                                    )}
                                />
                            </div>

                            {/*  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field
                                    label="Passport Expiry Date"
                                    info="Required. Used for visa processing."
                                    error={errors.passportExpireDate?.message}
                                >
                                    <Input {...register("passportExpireDate")} type="date" />
                                </Field>
                            </div>    */}

                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Field
                                    label="Working Video Link"
                                    info="Paste video URL. It will open in new tab."
                                    error={errors.workingVideoLink?.message}
                                >
                                    <Input {...register("workingVideoLink")} placeholder="https://..." type="url" />
                                </Field>
                            </div>

                            <div className="mt-4">
                                <DocumentsFieldArray
                                    control={control}
                                    register={register}
                                    errors={errors}
                                    name="documents"
                                />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Screening</div>
                            <div className="text-sm text-gray-800 mt-1">Store interview date and video link</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field
                                    label="Screening Interview Date"
                                    info="Date of screening interview (optional)."
                                    error={errors.dateScreeningInterview?.message}
                                >
                                    <Input {...register("dateScreeningInterview")} type="date" />
                                </Field>

                                <Field
                                    label="MI Screening Video Link"
                                    info="Paste screening video URL. It will open in new tab."
                                    error={errors.miScreeningVideoLink?.message}
                                >
                                    <Input {...register("miScreeningVideoLink")} placeholder="https://..." type="url" />
                                </Field>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Account</div>
                            <div className="text-sm text-gray-800 mt-1">Candidate login credentials.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field
                                    label={
                                        <>
                                            Username <span className="text-red-600 text-lg">*</span>
                                        </>
                                    }
                                    info="Login username (min 4 chars)."
                                    error={errors.username?.message}
                                >
                                    <Input {...register("username")} />
                                </Field>

                                <Field
                                    label={
                                        <>
                                            Email <span className="text-red-600 text-lg">*</span>
                                        </>
                                    }
                                    info="Login email."
                                    error={errors.email?.message}
                                >
                                    <Input {...register("email")} />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field
                                    label={
                                        <>
                                            Password <span className="text-red-600 text-lg">*</span>
                                        </>
                                    }
                                    info="Min 4 characters."
                                    error={errors.password?.message}
                                >
                                    <Controller
                                        control={control}
                                        name="password"
                                        render={({ field }) => (
                                            <PasswordInput
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder="Min 4 characters"
                                                error={errors.password?.message}
                                            />
                                        )}
                                    />
                                </Field>

                                <Field
                                    label={
                                        <>
                                            Retype Password <span className="text-red-600 text-lg">*</span>
                                        </>
                                    }
                                    info="Must match password."
                                    error={errors.retypePassword?.message}
                                >
                                    <Controller
                                        control={control}
                                        name="retypePassword"
                                        render={({ field }) => (
                                            <PasswordInput
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder="Retype password"
                                                error={errors.retypePassword?.message}
                                            />
                                        )}
                                    />
                                </Field>
                            </div>
                        </div>

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
                                {isSubmitting ? "Saving..." : "Save Candidate"}
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