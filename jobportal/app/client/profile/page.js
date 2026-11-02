"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDropzone } from "react-dropzone";
import { ClipLoader } from "react-spinners";
import ENUMS from "@/config/enums.json";

const DEFAULT_LOGO = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="#f3f4f6"/>
  <rect x="55" y="70" width="190" height="150" rx="18" fill="#d1d5db"/>
  <rect x="85" y="105" width="130" height="18" rx="9" fill="#9ca3af"/>
  <rect x="85" y="140" width="90" height="14" rx="7" fill="#9ca3af"/>
  <text x="150" y="260" text-anchor="middle" font-family="Arial" font-size="18" fill="#6b7280">Company Logo</text>
</svg>
`)}`;

const COUNTRY_OPTIONS = Array.from(
    new Set([
        ...(Array.isArray(ENUMS?.countries) ? ENUMS.countries : []),
        ...(Array.isArray(ENUMS?.nationalities) ? ENUMS.nationalities : []),
    ].map((value) => String(value || "").trim()).filter(Boolean))
).sort((a, b) => a.localeCompare(b));

const INDUSTRY_OPTIONS = Array.isArray(ENUMS?.industries)
    ? ENUMS.industries.map(String).filter(Boolean)
    : [];

const COMPANY_SIZE_OPTIONS = Array.isArray(ENUMS?.companySize)
    ? ENUMS.companySize.map(String).filter(Boolean)
    : [];

function isValidWebsite(value) {
    const raw = String(value || "").trim();
    if (!raw) return true;

    try {
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        return Boolean(url.hostname);
    } catch {
        return false;
    }
}

function isValidPhone(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    return /^[0-9+\-\s()]{7,20}$/.test(raw);
}

function validImageFile(file) {
    if (!(file instanceof File)) return true;
    return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

const ContactSchema = z.object({
    name: z.string().optional(),
    designation: z.string().optional(),
    mobile: z.string().optional(),
    remarks: z.string().optional(),
});

const ClientProfileSchema = z
    .object({
        companyName: z.string().optional(),
        contactName: z.string().min(1, "Contact name is required"),
        designation: z.string().min(1, "Designation is required"),
        city: z.string().min(1, "City is required"),
        address: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
        countryList: z.string().min(1, "Country is required"),
        industriesList: z.string().optional(),
        companySizeList: z.string().optional(),
        shortDescription: z.string().optional(),
        username: z.string().min(3, "Username must be at least 3 characters"),
        email: z.string().optional(),
        existingLogoUrl: z.string().optional(),
        logoFile: z.any().optional(),
        contactList: z.array(ContactSchema).optional(),
        password: z.string().optional(),
        retypePassword: z.string().optional(),
    })
    .superRefine((value, ctx) => {
        if (value.website && !isValidWebsite(value.website)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["website"],
                message: "Website URL is invalid",
            });
        }

        if (value.logoFile instanceof File) {
            if (!validImageFile(value.logoFile)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["logoFile"],
                    message: "Logo must be JPG, PNG, or WEBP",
                });
            }

            if (value.logoFile.size > 5 * 1024 * 1024) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["logoFile"],
                    message: "Logo must be 5 MB or smaller",
                });
            }
        }

        const password = String(value.password || "").trim();
        const retypePassword = String(value.retypePassword || "").trim();

        if (password || retypePassword) {
            if (password.length < 8) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["password"],
                    message: "Password must be at least 8 characters",
                });
            }

            if (!retypePassword) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["retypePassword"],
                    message: "Retype password is required",
                });
            } else if (password !== retypePassword) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["retypePassword"],
                    message: "Passwords do not match",
                });
            }
        }

        (value.contactList || []).forEach((contact, index) => {
            const name = String(contact?.name || "").trim();
            const designation = String(contact?.designation || "").trim();
            const mobile = String(contact?.mobile || "").trim();
            const remarks = String(contact?.remarks || "").trim();
            const hasAnyValue = name || designation || mobile || remarks;

            if (!hasAnyValue) return;

            if (!name) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["contactList", index, "name"],
                    message: "Contact name is required",
                });
            }

            if (!mobile) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["contactList", index, "mobile"],
                    message: "Mobile is required",
                });
            } else if (!isValidPhone(mobile)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["contactList", index, "mobile"],
                    message: "Mobile is invalid",
                });
            }
        });
    });

function cleanString(value) {
    return String(value ?? "").trim();
}

function normalizeProfileResponse(raw) {
    const profile = raw?.profile || raw?.data?.attributes || raw?.data || raw || {};

    return {
        companyName: cleanString(profile?.companyName),
        contactName: cleanString(profile?.contactName),
        designation: cleanString(profile?.designation),
        city: cleanString(profile?.city),
        address: cleanString(profile?.address),
        phone: cleanString(profile?.phone),
        website: cleanString(profile?.website),
        countryList: cleanString(profile?.countryList || profile?.country),
        industriesList: cleanString(profile?.industriesList),
        companySizeList: cleanString(profile?.companySizeList),
        shortDescription: cleanString(profile?.shortDescription),
        username: cleanString(profile?.username),
        email: cleanString(profile?.email || profile?.loginEmail),
        existingLogoUrl: cleanString(profile?.logoUrl || profile?.existingLogoUrl),
        logoName: cleanString(profile?.logoName),
        contactList: Array.isArray(profile?.contactList)
            ? profile.contactList.map((contact) => ({
                name: cleanString(contact?.name),
                designation: cleanString(contact?.designation),
                mobile: cleanString(contact?.mobile || contact?.phone),
                remarks: cleanString(contact?.remarks),
            }))
            : [],
    };
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
        cache: "no-store",
        ...options,
    });

    const text = await res.text();
    let json = null;

    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(
            `API returned an invalid response (status ${res.status}). Check that app/api/clients/profile/route.js exists.`
        );
    }

    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Request failed (${res.status})`);
    }

    return json;
}

function Field({ label, error, hint, children }) {
    return (
        <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{label}</label>
            {children}
            {hint ? <div className="text-xs text-gray-500">{hint}</div> : null}
            {error ? <div className="text-xs font-medium text-red-700">{error}</div> : null}
        </div>
    );
}

function Input({ className = "", ...props }) {
    return (
        <input
            {...props}
            className={`w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-600 ${className}`}
        />
    );
}

function Select({ className = "", children, ...props }) {
    return (
        <select
            {...props}
            className={`w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100 ${className}`}
        >
            {children}
        </select>
    );
}

function Textarea({ className = "", ...props }) {
    return (
        <textarea
            {...props}
            className={`w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100 ${className}`}
        />
    );
}

function LogoDropzone({ value, onChange, error }) {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        multiple: false,
        accept: {
            "image/jpeg": [".jpg", ".jpeg"],
            "image/png": [".png"],
            "image/webp": [".webp"],
        },
        onDrop: (acceptedFiles) => onChange(acceptedFiles?.[0] || null),
    });

    return (
        <div>
            <div
                {...getRootProps()}
                className={`cursor-pointer rounded-2xl border border-dashed px-4 py-5 text-sm transition ${isDragActive
                    ? "border-red-400 bg-red-50"
                    : "border-gray-300 bg-gray-50 hover:border-red-300"
                    }`}
            >
                <input {...getInputProps()} />
                <div className="font-medium text-gray-800">
                    Click to select a logo or drag and drop
                </div>
                <div className="mt-1 text-xs text-gray-500">
                    JPG, PNG or WEBP. Maximum 5 MB.
                </div>
                {value instanceof File ? (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
                        {value.name} · {Math.max(1, Math.round(value.size / 1024))} KB
                    </div>
                ) : null}
            </div>
            {error ? <div className="mt-1 text-xs font-medium text-red-700">{error}</div> : null}
        </div>
    );
}

const DEFAULT_VALUES = {
    companyName: "",
    contactName: "",
    designation: "",
    city: "",
    address: "",
    phone: "",
    website: "",
    countryList: "",
    industriesList: "",
    companySizeList: "",
    shortDescription: "",
    username: "",
    email: "",
    existingLogoUrl: "",
    logoFile: null,
    contactList: [],
    password: "",
    retypePassword: "",
};

export default function ClientProfilePage() {
    const [loading, setLoading] = useState(true);
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [localLogoPreview, setLocalLogoPreview] = useState("");
    const [profileLoaded, setProfileLoaded] = useState(false);

    const {
        register,
        control,
        watch,
        reset,
        setValue,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(ClientProfileSchema),
        defaultValues: DEFAULT_VALUES,
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "contactList",
    });

    const existingLogoUrl = watch("existingLogoUrl");
    const logoFile = watch("logoFile");
    const selectedCountry = watch("countryList");
    const selectedIndustry = watch("industriesList");
    const selectedCompanySize = watch("companySizeList");

    useEffect(() => {
        if (!(logoFile instanceof File)) {
            setLocalLogoPreview("");
            return undefined;
        }

        const objectUrl = URL.createObjectURL(logoFile);
        setLocalLogoPreview(objectUrl);

        return () => URL.revokeObjectURL(objectUrl);
    }, [logoFile]);

    const logoPreview = useMemo(
        () => localLogoPreview || existingLogoUrl || DEFAULT_LOGO,
        [existingLogoUrl, localLogoPreview]
    );

    async function loadProfile() {
        const json = await fetchJson("/api/clients/profile", {
            method: "GET",
        });

        const profile = normalizeProfileResponse(json);

        reset({
            ...DEFAULT_VALUES,
            ...profile,
            logoFile: null,
            password: "",
            retypePassword: "",
        });

        return profile;
    }

    useEffect(() => {
        let active = true;

        (async () => {
            try {
                setLoading(true);
                setProfileLoaded(false);
                setErrorMessage("");
                setSuccessMessage("");
                await loadProfile();
                if (active) setProfileLoaded(true);
            } catch (error) {
                if (active) {
                    setErrorMessage(error?.message || "Failed to load client profile.");
                }
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
        };
        // loadProfile uses stable module-level helpers and react-hook-form reset.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reset]);

    async function onSubmit(data) {
        setSuccessMessage("");
        setErrorMessage("");

        try {
            const payload = {
                contactName: cleanString(data.contactName),
                designation: cleanString(data.designation),
                city: cleanString(data.city),
                address: cleanString(data.address),
                website: cleanString(data.website),
                countryList: cleanString(data.countryList),
                industriesList: cleanString(data.industriesList),
                companySizeList: cleanString(data.companySizeList),
                shortDescription: cleanString(data.shortDescription),
                username: cleanString(data.username),
                contactList: (data.contactList || [])
                    .map((contact) => ({
                        name: cleanString(contact?.name),
                        designation: cleanString(contact?.designation),
                        mobile: cleanString(contact?.mobile),
                        remarks: cleanString(contact?.remarks),
                    }))
                    .filter(
                        (contact) =>
                            contact.name ||
                            contact.designation ||
                            contact.mobile ||
                            contact.remarks
                    ),
                removeLogo:
                    !cleanString(data.existingLogoUrl) &&
                    !(data.logoFile instanceof File),
            };

            if (cleanString(data.password)) {
                payload.password = cleanString(data.password);
            }

            const formData = new FormData();
            formData.append("data", JSON.stringify(payload));

            if (data.logoFile instanceof File) {
                formData.append("files.logo", data.logoFile);
            }

            const json = await fetchJson("/api/clients/profile", {
                method: "PUT",
                body: formData,
            });

            const profile = normalizeProfileResponse(json);

            reset({
                ...DEFAULT_VALUES,
                ...profile,
                logoFile: null,
                password: "",
                retypePassword: "",
            });

            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent("user-profile-image-updated", {
                        detail: {
                            image: profile.existingLogoUrl || "",
                            name: profile.companyName || "",
                        },
                    })
                );
            }

            setSuccessMessage(json?.message || "Profile updated successfully.");
        } catch (error) {
            setErrorMessage(error?.message || "Failed to update profile.");
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="topHeading">Client Profile</div>

            <main className="mx-auto w-[95%] px-2 py-5 sm:px-4 lg:w-[85%]">
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <header className="border-b border-gray-200 px-4 py-4 sm:px-6">
                        <h1 className="text-lg font-semibold text-gray-900">My Profile</h1>
                        <p className="mt-1 text-sm text-gray-600">
                            Your client record is loaded automatically from the logged-in account.
                        </p>
                    </header>

                    {loading ? (
                        <div className="flex items-center gap-3 p-6 text-sm text-gray-600">
                            <ClipLoader size={25} color="#b91c1c" />
                            <span>Loading profile...</span>
                        </div>
                    ) : errorMessage && !profileLoaded ? (
                        <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                            {errorMessage}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-4 sm:p-6">
                            <section className="rounded-2xl border border-gray-200 p-4">
                                <div className="text-sm font-semibold text-gray-900">Company Logo</div>

                                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                        <img
                                            src={logoPreview}
                                            alt="Company logo preview"
                                            className="h-44 w-44 rounded-2xl border border-gray-200 bg-white object-contain"
                                            onError={(event) => {
                                                event.currentTarget.src = DEFAULT_LOGO;
                                            }}
                                        />
                                        <div className="mt-2 text-xs text-gray-500">
                                            {logoFile instanceof File
                                                ? "New selected logo"
                                                : existingLogoUrl
                                                    ? "Current company logo"
                                                    : "Default logo"}
                                        </div>
                                    </div>

                                    <div className="lg:col-span-2">
                                        <Controller
                                            control={control}
                                            name="logoFile"
                                            render={({ field }) => (
                                                <LogoDropzone
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    error={errors.logoFile?.message}
                                                />
                                            )}
                                        />

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setValue("logoFile", null)}
                                                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                            >
                                                Clear Selected Logo
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setValue("logoFile", null);
                                                    setValue("existingLogoUrl", "");
                                                }}
                                                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                                            >
                                                Remove Existing Logo
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-gray-200 p-4">
                                <div className="mb-4 text-sm font-semibold text-gray-900">Company Information</div>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <Field label="Company Name" hint="Contact staff to change the company name.">
                                        <Input {...register("companyName")} disabled />
                                    </Field>

                                    <Field label="Main Phone" hint="Contact staff to change the main phone.">
                                        <Input {...register("phone")} disabled />
                                    </Field>

                                    <Field label="Contact Name *" error={errors.contactName?.message}>
                                        <Input {...register("contactName")} />
                                    </Field>

                                    <Field label="Designation *" error={errors.designation?.message}>
                                        <Input {...register("designation")} />
                                    </Field>

                                    <Field label="Country *" error={errors.countryList?.message}>
                                        <Select {...register("countryList")}>
                                            <option value="">Select country</option>
                                            {selectedCountry && !COUNTRY_OPTIONS.includes(selectedCountry) ? (
                                                <option value={selectedCountry}>{selectedCountry}</option>
                                            ) : null}
                                            {COUNTRY_OPTIONS.map((country) => (
                                                <option key={country} value={country}>
                                                    {country}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="City *" error={errors.city?.message}>
                                        <Input {...register("city")} />
                                    </Field>

                                    <Field label="Industry" error={errors.industriesList?.message}>
                                        <Select {...register("industriesList")}>
                                            <option value="">Select industry</option>
                                            {selectedIndustry && !INDUSTRY_OPTIONS.includes(selectedIndustry) ? (
                                                <option value={selectedIndustry}>{selectedIndustry}</option>
                                            ) : null}
                                            {INDUSTRY_OPTIONS.map((industry) => (
                                                <option key={industry} value={industry}>
                                                    {industry}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Company Size" error={errors.companySizeList?.message}>
                                        <Select {...register("companySizeList")}>
                                            <option value="">Select company size</option>
                                            {selectedCompanySize && !COMPANY_SIZE_OPTIONS.includes(selectedCompanySize) ? (
                                                <option value={selectedCompanySize}>{selectedCompanySize}</option>
                                            ) : null}
                                            {COMPANY_SIZE_OPTIONS.map((size) => (
                                                <option key={size} value={size}>
                                                    {size}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Website" error={errors.website?.message}>
                                        <Input {...register("website")} placeholder="example.com" />
                                    </Field>

                                    <Field label="Login Email" hint="The login email cannot be changed here.">
                                        <Input {...register("email")} disabled />
                                    </Field>

                                    <div className="md:col-span-2">
                                        <Field label="Address" error={errors.address?.message}>
                                            <Textarea {...register("address")} rows={3} />
                                        </Field>
                                    </div>

                                    <div className="md:col-span-2">
                                        <Field label="Short Description" error={errors.shortDescription?.message}>
                                            <Textarea {...register("shortDescription")} rows={4} />
                                        </Field>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-gray-200 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <div className="text-sm font-semibold text-gray-900">Contact List</div>
                                        <p className="mt-1 text-xs text-gray-500">
                                            Add other contact people for your company.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            append({ name: "", designation: "", mobile: "", remarks: "" })
                                        }
                                        className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
                                    >
                                        + Add Contact
                                    </button>
                                </div>

                                {fields.length === 0 ? (
                                    <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                                        No additional contacts have been added.
                                    </div>
                                ) : (
                                    <div className="mt-4 space-y-4">
                                        {fields.map((field, index) => (
                                            <div key={field.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                                <div className="mb-3 flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-800">
                                                        Contact #{index + 1}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => remove(index)}
                                                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                                                    <Field
                                                        label="Name *"
                                                        error={errors.contactList?.[index]?.name?.message}
                                                    >
                                                        <Input {...register(`contactList.${index}.name`)} />
                                                    </Field>
                                                    <Field
                                                        label="Designation"
                                                        error={errors.contactList?.[index]?.designation?.message}
                                                    >
                                                        <Input {...register(`contactList.${index}.designation`)} />
                                                    </Field>
                                                    <Field
                                                        label="Mobile *"
                                                        error={errors.contactList?.[index]?.mobile?.message}
                                                    >
                                                        <Input {...register(`contactList.${index}.mobile`)} />
                                                    </Field>
                                                    <Field
                                                        label="Remarks"
                                                        error={errors.contactList?.[index]?.remarks?.message}
                                                    >
                                                        <Input {...register(`contactList.${index}.remarks`)} />
                                                    </Field>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="rounded-2xl border border-gray-200 p-4">
                                <div className="text-sm font-semibold text-gray-900">Login Details</div>
                                <p className="mt-1 text-xs text-gray-500">
                                    Leave password fields empty to keep the current password.
                                </p>

                                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <Field label="Username *" error={errors.username?.message}>
                                        <Input {...register("username")} />
                                    </Field>
                                    <div />
                                    <Field label="New Password" error={errors.password?.message}>
                                        <Input
                                            {...register("password")}
                                            type="password"
                                            autoComplete="new-password"
                                            placeholder="Minimum 8 characters"
                                        />
                                    </Field>
                                    <Field label="Retype New Password" error={errors.retypePassword?.message}>
                                        <Input
                                            {...register("retypePassword")}
                                            type="password"
                                            autoComplete="new-password"
                                        />
                                    </Field>
                                </div>
                            </section>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm">
                                    {errorMessage ? (
                                        <span className="font-semibold text-red-700">{errorMessage}</span>
                                    ) : successMessage ? (
                                        <span className="font-semibold text-green-700">{successMessage}</span>
                                    ) : (
                                        <span className="text-gray-500">
                                            Update your information and click Save Changes.
                                        </span>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="rounded-xl bg-red-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}
