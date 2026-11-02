"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";

import ENUMS from "../../../../config/enums.json";
import ContactFieldArray from "@/app/staff/ui/ContactFieldArray";

import { useForm, Controller, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
    Field,
    Input,
    Select,
    Textarea,
    DropzoneBox,
    PasswordInput,
    fetchJsonSafe,
    normalizePhone,
    fileExtOk,
} from "@/app/staff/ui/CandidateFormUI";
import useAuthClient from "@/lib/useAuthClient";

/* ------------------------------------------------------------------ */
/* Schema (EDIT) */
/* ------------------------------------------------------------------ */
const ClientEditSchema = z
    .object({
        companyName: z.string().min(1, "Company name is required"),
        contactName: z.string().optional(),
        designation: z.string().optional(),
        city: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),

        countryList: z.string().optional(),
        industriesList: z.string().optional(),
        companySizeList: z.string().optional(),
        statusList: z.string().optional(),
        leadStatus: z.string().optional(),

        shortDescription: z.string().max(500, "Max 500 characters").optional(),
        privateNote: z.string().max(2000, "Max 2000 characters").optional(),

        // media
        logo: z.any().optional(),

        // component
        contactList: z
            .array(
                z.object({
                    name: z.string().optional(),
                    designation: z.string().optional(),
                    mobile: z.string().optional(),
                    remarks: z.string().optional(),
                })
            )
            .default([]),

        // account (edit)
        username: z.string().min(1, "Username is required"),
        email: z.string().email("Invalid email"),

        // password optional in edit
        password: z.string().optional(),
        retypePassword: z.string().optional(),
    })
    .superRefine((val, ctx) => {
        const p = String(val.password || "").trim();
        const rp = String(val.retypePassword || "").trim();

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

        if (val.logo && val.logo instanceof File) {
            if (!fileExtOk(val.logo, [".jpg", ".jpeg", ".png", ".webp"])) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["logo"],
                    message: "Logo must be jpg/png/webp",
                });
            }
        }

        if (val.phone) {
            const p2 = String(val.phone).trim();
            if (p2.length < 7 || p2.length > 30) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["phone"],
                    message: "Phone must be 7–30 characters",
                });
            }
        }

        (val.contactList || []).forEach((c, i) => {
            const any =
                (c?.name || "").trim() ||
                (c?.designation || "").trim() ||
                (c?.mobile || "").trim() ||
                (c?.remarks || "").trim();

            if (!any) return;

            if (!String(c?.name || "").trim()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["contactList", i, "name"],
                    message: "Contact name is required",
                });
            }

            if (c?.mobile) {
                const m = String(c.mobile).trim();
                if (m.length < 7 || m.length > 20) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["contactList", i, "mobile"],
                        message: "Mobile must be 7–20 characters",
                    });
                }
            }
        });
    });

/* ------------------------------------------------------------------ */
/* Page */
/* ------------------------------------------------------------------ */
export default function EditClientPage() {
    const params = useParams();
    const documentId = params?.documentId;

    const [submitMsg, setSubmitMsg] = useState("");
    const [loading, setLoading] = useState(true);

    const { user, role, loadingAuth } = useAuthClient();

    const roleName = String(
        role?.name ||
        user?.role?.name ||
        ""
    ).toLowerCase();

    const isStaff = roleName === "staff";


    const [existingMedia, setExistingMedia] = useState({
        logo: { url: "", name: "", id: null },
    });

    const leadStatusOptions = Array.isArray(ENUMS?.LeadStatus)
        ? ENUMS.LeadStatus
        : ["Lead", "Active", "Rejected"];

    const {
        register,
        control,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(ClientEditSchema),
        defaultValues: {
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
            statusList: "",
            leadStatus: "Lead",

            shortDescription: "",
            privateNote: "",

            logo: null,
            contactList: [],

            username: "",
            email: "",
            password: "",
            retypePassword: "",
        },
    });

    useEffect(() => {
        if (!documentId) return;

        (async () => {
            setLoading(true);
            setSubmitMsg("");
            try {
                const json = await fetchJsonSafe(`/api/clients/getclient/${documentId}`);
                reset({
                    ...(json?.formDefaults || {}),
                    leadStatus: json?.formDefaults?.leadStatus || "Lead",
                });
                setExistingMedia(
                    json?.existingMedia || {
                        logo: { url: "", name: "", id: null },
                    }
                );
            } catch (e) {
                console.error(e);
                setSubmitMsg(`Error: ${e.message || "Failed to load client"} ❌`);
            } finally {
                setLoading(false);
            }
        })();
    }, [documentId, reset]);

    const logo = useWatch({
        control,
        name: "logo",
    });

    const logoPreview = useMemo(() => {
        if (logo instanceof File) {
            return URL.createObjectURL(logo);
        }

        return existingMedia?.logo?.url || "";
    }, [logo, existingMedia?.logo?.url]);

    useEffect(() => {
        if (!(logo instanceof File) || !logoPreview) return undefined;

        return () => {
            URL.revokeObjectURL(logoPreview);
        };
    }, [logo, logoPreview]);

    const onSubmit = async (formData) => {
        setSubmitMsg("");

        if (formData.phone) formData.phone = normalizePhone(formData.phone);

        const contacts = (formData.contactList || []).map((c) => ({
            ...c,
            mobile: c?.mobile ? normalizePhone(c.mobile) : c?.mobile,
        }));

        try {
            const payloadData = {
                ...formData,
                logo: undefined,
                leadStatus: formData.leadStatus || "Lead",
                contactList: contacts,
            };

            const fd = new FormData();
            fd.append("data", JSON.stringify(payloadData));

            if (formData.logo instanceof File) {
                fd.append("files.logo", formData.logo);
            }

            const res = await fetch(`/api/clients/update/${documentId}`, {
                method: "POST",
                body: fd,
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Client not saved");

            setSubmitMsg("Client updated ✅");
        } catch (e) {
            console.error(e);
            setSubmitMsg(`Error: ${e.message || "Client not saved"} ❌`);
        }
    };

    if (loading && loadingAuth) {
        return (
            <div className="min-h-screen bg-gray-50">
                <main className="mx-auto w-[95%] lg:w-[85%] px-2 sm:px-4 py-5">
                    <div className="flex justify-start items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6">
                        <ClipLoader
                            size={25}
                            color="#b91c1c"
                            speedMultiplier={1}
                        />
                        <div className="text-left">Loading Client...</div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="topHeading">
                {["client", "clients"].includes(user?.role?.name?.toLowerCase()) ? (
                    <span>Update {user?.name}</span>
                ) : (
                    <span>Update Client</span>
                )}
            </div>

            <main className="mx-auto w-[95%] lg:w-[85%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <header className="border-b border-gray-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-lg text-gray-900 font-semibold">
                                    {["client", "clients"].includes(user?.role?.name?.toLowerCase()) ? (
                                        <span>{user?.name} Data</span>
                                    ) : (
                                        <span>Client Data</span>
                                    )}
                                </div>
                                <div className="text-sm text-gray-600">Update client details.</div>
                            </div>

                            {user?.role?.name === "staff" && (
                                <Link
                                    href="/staff/client"
                                    className="rounded-xl border border-gray-400 bg-white px-6 py-2 text-base text-gray-700 hover:bg-gray-50"
                                >
                                    Back
                                </Link>
                            )}
                        </div>
                    </header>

                    <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-6">
                        {/* ------------------ COMPANY INFO ------------------ */}
                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Company Info</div>
                            <div className="text-sm text-gray-800 mt-1">Basic company details.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field
                                    label={
                                        <>
                                            Company Name <span className="text-red-600 text-lg">*</span>
                                        </>
                                    }
                                    error={errors.companyName?.message}
                                >
                                    <Input {...register("companyName")} placeholder="e.g. ABC Trading LLC" />
                                </Field>

                                <Field label="Contact Person" error={errors.contactName?.message}>
                                    <Input {...register("contactName")} placeholder="e.g. Mr. Ali" />
                                </Field>

                                <Field label="Designation" error={errors.designation?.message}>
                                    <Input {...register("designation")} placeholder="e.g. Hiring Manager" />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field label="City" error={errors.city?.message}>
                                    <Input {...register("city")} placeholder="e.g. Dubai" />
                                </Field>

                                <Field label="Phone" error={errors.phone?.message}>
                                    <Input {...register("phone")} placeholder="+971 5x xxxxxxx" />
                                </Field>

                                <Field label="Website" error={errors.website?.message}>
                                    <Input {...register("website")} placeholder="https://example.com" />
                                </Field>
                            </div>

                            <div className="mt-4">
                                <Field label="Address" error={errors.address?.message}>
                                    <Textarea {...register("address")} rows={3} placeholder="Company address..." />
                                </Field>
                            </div>
                        </div>

                        {/* ------------------ LOGO ------------------ */}
                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Logo</div>
                            <div className="text-sm text-gray-800 mt-1">Upload/replace client logo.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Controller
                                    control={control}
                                    name="logo"
                                    render={({ field }) => (
                                        <DropzoneBox
                                            label="Company Logo"
                                            acceptText="Accepted: .jpg, .png, .webp"
                                            multiple={false}
                                            value={field.value}
                                            onChange={field.onChange}
                                            error={errors.logo?.message}
                                        />
                                    )}
                                />

                                {logoPreview ? (
                                    <div className="rounded-2xl border border-gray-200 p-3 bg-gray-50">
                                        <div className="text-sm text-gray-800 mb-2">Preview</div>
                                        <div
                                            role="img"
                                            aria-label="Company logo preview"
                                            className="h-40 w-40 rounded-2xl border border-gray-200 bg-white bg-cover bg-center"
                                            style={{
                                                backgroundImage: `url("${String(logoPreview).replace(/"/g, "%22")}")`,
                                            }}
                                        />
                                        {existingMedia?.logo?.url && !(logo instanceof File) ? (
                                            <div className="mt-2 text-xs text-gray-600">
                                                Current: {existingMedia.logo.name || "logo"}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* ------------------ DROPDOWNS ------------------ */}
                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Classification</div>
                            <div className="text-sm text-gray-800 mt-1">Company category dropdowns.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4">
                                <Field label="Country" error={errors.countryList?.message}>
                                    <Select {...register("countryList")}>
                                        <option value="">Choose here</option>
                                        {(ENUMS.countries || ENUMS.countryList || []).map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Industry" error={errors.industriesList?.message}>
                                    <Select {...register("industriesList")}>
                                        <option value="">Choose here</option>
                                        {(ENUMS.industries || ENUMS.industoryList || ENUMS.industriesList || []).map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Company Size" error={errors.companySizeList?.message}>
                                    <Select {...register("companySizeList")}>
                                        <option value="">Choose here</option>
                                        {(ENUMS.companySize || ENUMS.companySizeList || []).map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Status" error={errors.statusList?.message}>
                                    <Select {...register("statusList")}>
                                        <option value="">Choose here</option>
                                        {(ENUMS.status || ENUMS.statusList || []).map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Lead Status" error={errors.leadStatus?.message}>
                                    <Select {...register("leadStatus")}>
                                        <option value="">Choose here</option>
                                        {leadStatusOptions.map((x) => (
                                            <option key={x} value={x}>
                                                {x}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            </div>
                        </div>

                        {/* ------------------ NOTES ------------------ */}
                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Descriptions & Notes</div>

                            <div className={`mt-4 grid grid-cols-1 gap-4 ${isStaff ? "md:grid-cols-2" : ""}`}>
                                <Field label="Short Description" error={errors.shortDescription?.message}>
                                    <Textarea
                                        {...register("shortDescription")}
                                        rows={4}
                                        maxLength={500}
                                        placeholder="Short company description..."
                                    />
                                </Field>

                                {isStaff && (
                                    <Field label="Private Note" error={errors.privateNote?.message}>
                                        <Textarea
                                            {...register("privateNote")}
                                            rows={4}
                                            maxLength={2000}
                                            placeholder="Internal notes..."
                                        />
                                    </Field>
                                )}
                            </div>
                        </div>

                        {/* ------------------ CONTACT LIST ------------------ */}
                        <ContactFieldArray control={control} register={register} errors={errors} name="contactList" />

                        {/* ------------------ ACCOUNT ------------------ */}
                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Account</div>
                            <div className="text-sm text-gray-800 mt-1">Client login credentials.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Username" error={errors.username?.message}>
                                    <Input {...register("username")} />
                                </Field>

                                <Field label="Email" error={errors.email?.message}>
                                    <Input {...register("email")} />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Password" info="Leave empty if you don't want to change." error={errors.password?.message}>
                                    <Controller
                                        control={control}
                                        name="password"
                                        render={({ field }) => (
                                            <PasswordInput
                                                value={field.value}
                                                onChange={field.onChange}
                                                autoComplete="new-password"
                                                placeholder="If password change required"
                                                error={errors.password?.message}
                                            />
                                        )}
                                    />
                                </Field>

                                <Field label="Retype Password" info="Must match password." error={errors.retypePassword?.message}>
                                    <Controller
                                        control={control}
                                        name="retypePassword"
                                        render={({ field }) => (
                                            <PasswordInput
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder="Retype second time"
                                                error={errors.retypePassword?.message}
                                            />
                                        )}
                                    />
                                </Field>
                            </div>
                        </div>

                        {/* ------------------ ACTIONS ------------------ */}
                        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                            <Link
                                href="/staff/clients"
                                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-center"
                            >
                                Cancel
                            </Link>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
                            >
                                {isSubmitting ? "Saving..." : "Save Client"}
                            </button>
                        </div>

                        {submitMsg ? (
                            <div
                                className={`rounded-xl px-4 py-3 text-sm ${submitMsg.startsWith("Error:")
                                    ? "border border-red-200 bg-red-50 text-red-700"
                                    : "border border-green-200 bg-green-50 text-green-700"
                                    }`}
                            >
                                {submitMsg}
                            </div>
                        ) : null}
                    </form>
                </div>
            </main>
        </div>
    );
}