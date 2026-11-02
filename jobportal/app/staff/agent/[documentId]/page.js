"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";

import ENUMS from "../../../../config/enums.json";
import ContactFieldArray from "@/app/staff/ui/ContactFieldArray";

import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
    Field,
    Input,
    Select,
    Textarea,
    PasswordInput,
    fetchJsonSafe,
    normalizePhone,
} from "@/app/staff/ui/CandidateFormUI";
import useAuthClient from "@/lib/useAuthClient";

const AgentEditSchema = z
    .object({
        companyName: z.string().min(1, "Company name is required"),
        contactName: z.string().optional(),
        designation: z.string().optional(),
        city: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        webiste: z.string().optional(),

        countryList: z.string().optional(),
        statusList: z.string().optional(),

        shortDescription: z.string().max(500, "Max 500 characters").optional(),
        privateNote: z.string().max(2000, "Max 2000 characters").optional(),

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

        username: z.string().min(1, "Username is required"),
        email: z.string().email("Invalid email"),

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

export default function EditAgentPage() {
    const params = useParams();
    const documentId = params?.documentId;

    const [submitMsg, setSubmitMsg] = useState("");
    const [loading, setLoading] = useState(true);

    const { user, loadingAuth } = useAuthClient();

    const statusOptions = Array.isArray(ENUMS?.status)
        ? ENUMS.status
        : ["Active", "Inactive"];

    const {
        register,
        control,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(AgentEditSchema),
        defaultValues: {
            companyName: "",
            contactName: "",
            designation: "",
            city: "",
            address: "",
            phone: "",
            webiste: "",

            countryList: "",
            statusList: "Active",

            shortDescription: "",
            privateNote: "",

            contactList: [],

            username: "",
            email: "",
            password: "",
            retypePassword: "",
        },
    });

    useEffect(() => {
        if (!documentId) return;

        let alive = true;

        async function loadAgent() {
            setLoading(true);
            setSubmitMsg("");

            try {
                const json = await fetchJsonSafe(`/api/agents/getagent/${documentId}`);
                if (!alive) return;

                reset({
                    ...(json?.formDefaults || {}),
                    statusList: json?.formDefaults?.statusList || "Active",
                });
            } catch (e) {
                console.error(e);
                if (!alive) return;
                setSubmitMsg(`Error: ${e.message || "Failed to load agent"} ❌`);
            } finally {
                if (alive) setLoading(false);
            }
        }

        loadAgent();

        return () => {
            alive = false;
        };
    }, [documentId, reset]);

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
                statusList: formData.statusList || "Active",
                contactList: contacts,
            };

            const fd = new FormData();
            fd.append("data", JSON.stringify(payloadData));

            const res = await fetch(`/api/agents/update/${documentId}`, {
                method: "POST",
                body: fd,
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Agent not saved");

            setSubmitMsg("Agent updated ✅");
        } catch (e) {
            console.error(e);
            setSubmitMsg(`Error: ${e.message || "Agent not saved"} ❌`);
        }
    };

    if (loading || loadingAuth) {
        return (
            <div className="min-h-screen bg-gray-50">
                <main className="mx-auto w-[95%] lg:w-[85%] px-2 sm:px-4 py-5">
                    <div className="flex justify-start items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6">
                        <ClipLoader size={25} color="#b91c1c" speedMultiplier={1} />
                        <div className="text-left">Loading Agent...</div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="topHeading">Update Agent</div>

            <main className="mx-auto w-[95%] lg:w-[85%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <header className="border-b border-gray-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-lg text-gray-900 font-semibold">Agent Data</div>
                                <div className="text-sm text-gray-600">Update agent details.</div>
                            </div>

                            <Link
                                href="/staff/agent"
                                className="rounded-xl border border-gray-400 bg-white px-6 py-2 text-base text-gray-700 hover:bg-gray-50"
                            >
                                Back
                            </Link>
                        </div>
                    </header>

                    <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-6">
                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Company Info</div>
                            <div className="text-sm text-gray-800 mt-1">Basic agent/company details.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field
                                    label={
                                        <>
                                            Company Name <span className="text-red-600 text-lg">*</span>
                                        </>
                                    }
                                    error={errors.companyName?.message}
                                >
                                    <Input {...register("companyName")} />
                                </Field>

                                <Field label="Contact Name" error={errors.contactName?.message}>
                                    <Input {...register("contactName")} />
                                </Field>


                                <Field label="Designation" error={errors.designation?.message}>
                                    <Input {...register("designation")} />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field label="City" error={errors.city?.message}>
                                    <Input {...register("city")} />
                                </Field>

                                <Field label="Phone" error={errors.phone?.message}>
                                    <Input {...register("phone")} />
                                </Field>

                                <Field label="Website" error={errors.webiste?.message}>
                                    <Input {...register("webiste")} placeholder="https://example.com" />
                                </Field>
                            </div>

                            <div className="mt-4">
                                <Field label="Address" error={errors.address?.message}>
                                    <Textarea {...register("address")} rows={3} />
                                </Field>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Classification</div>
                            <div className="text-sm text-gray-800 mt-1">Country and status.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Country" error={errors.countryList?.message}>
                                    <Select {...register("countryList")}>
                                        <option value="">Choose here</option>
                                        {(ENUMS.countries || ENUMS.nationalities || []).map((x) => (
                                            <option key={x} value={x}>{x}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Status" error={errors.statusList?.message}>
                                    <Select {...register("statusList")}>
                                        <option value="">Choose here</option>
                                        {statusOptions.map((x) => (
                                            <option key={x} value={x}>{x}</option>
                                        ))}
                                    </Select>
                                </Field>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Description & Notes</div>
                            <div className="text-sm text-gray-800 mt-1">Internal and display notes.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Short Description" error={errors.shortDescription?.message}>
                                    <Textarea {...register("shortDescription")} rows={4} maxLength={500} />
                                </Field>

                                <Field label="Private Note" error={errors.privateNote?.message}>
                                    <Textarea {...register("privateNote")} rows={4} maxLength={2000} />
                                </Field>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Contacts</div>
                            <div className="text-sm text-gray-800 mt-1">Agent contact persons.</div>

                            <div className="mt-4">
                                <ContactFieldArray
                                    control={control}
                                    register={register}
                                    errors={errors}
                                    name="contactList"
                                />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-200 p-4">
                            <div className="text-base text-red-600 font-semibold">Login Account</div>
                            <div className="text-sm text-gray-800 mt-1">Update users-permissions account.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Username" error={errors.username?.message}>
                                    <Input {...register("username")} />
                                </Field>

                                <Field label="Email" error={errors.email?.message}>
                                    <Input {...register("email")} type="email" />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="New Password" error={errors.password?.message}>
                                    <Controller
                                        control={control}
                                        name="password"
                                        render={({ field }) => (
                                            <PasswordInput
                                                value={field.value || ""}
                                                onChange={field.onChange}
                                                placeholder="Leave blank to keep current password"
                                                autoComplete="new-password"
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
                                                value={field.value || ""}
                                                onChange={field.onChange}
                                                placeholder="Retype new password"
                                                autoComplete="new-password"
                                                error={errors.retypePassword?.message}
                                            />
                                        )}
                                    />
                                </Field>
                            </div>
                        </div>

                        {submitMsg ? (
                            <div
                                className={`rounded-xl border p-3 text-sm ${submitMsg.startsWith("Error:")
                                    ? "border-red-200 bg-red-50 text-red-700"
                                    : "border-green-200 bg-green-50 text-green-700"
                                    }`}
                            >
                                {submitMsg}
                            </div>
                        ) : null}

                        <div className="flex items-center justify-end gap-2">
                            <Link
                                href="/staff/agent"
                                className="rounded-xl border border-gray-300 bg-white px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </Link>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-xl bg-red-700 px-5 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {isSubmitting ? "Saving..." : "Update Agent"}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}
