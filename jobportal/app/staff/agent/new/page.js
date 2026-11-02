"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
    normalizePhone,
} from "@/app/staff/ui/CandidateFormUI";

const AgentCreateSchema = z
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

        username: z.string().min(3, "Username must be at least 3 characters"),
        email: z.string().email("Invalid email"),
        password: z.string().min(3, "Password must be at least 3 characters"),
        retypePassword: z.string().min(3, "Retype password is required"),
    })
    .superRefine((val, ctx) => {
        if (val.password !== val.retypePassword) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["retypePassword"],
                message: "Passwords do not match",
            });
        }

        if (val.phone) {
            const p = String(val.phone).trim();
            if (p.length < 7 || p.length > 30) {
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

export default function NewAgentPage() {
    const [submitMsg, setSubmitMsg] = useState("");

    const statusOptions = Array.isArray(ENUMS?.status)
        ? ENUMS.status
        : ["Active", "Inactive"];

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
        reset,
    } = useForm({
        resolver: zodResolver(AgentCreateSchema),
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

            const res = await fetch("/api/agents/create", {
                method: "POST",
                body: fd,
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Agent not saved");

            setSubmitMsg("Agent + Account created ✅");
            reset({
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
            });
        } catch (e) {
            setSubmitMsg(`Error: ${e?.message || "Agent not saved"} ❌`);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="topHeading">Create Agent</div>

            <main className="mx-auto w-[95%] lg:w-[85%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <header className="border-b border-gray-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-lg text-gray-900 font-semibold">Create Agent</div>
                                <div className="text-sm text-gray-600">
                                    Create a new agent company and login account.
                                </div>
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
                                    <Input {...register("companyName")} placeholder="e.g. ABC Agency" />
                                </Field>

                                <Field label="Contact Name" error={errors.contactName?.message}>
                                    <Input {...register("contactName")} placeholder="e.g. Mr. Ali" />
                                </Field>

                                <Field label="Designation" error={errors.designation?.message}>
                                    <Input {...register("designation")} placeholder="e.g. Sales Manager" />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Field label="City" error={errors.city?.message}>
                                    <Input {...register("city")} placeholder="e.g. Dubai" />
                                </Field>

                                <Field label="Phone" error={errors.phone?.message}>
                                    <Input {...register("phone")} placeholder="+971 5x xxxxxxx" />
                                </Field>

                                <Field label="Website" error={errors.webiste?.message}>
                                    <Input {...register("webiste")} placeholder="https://example.com" />
                                </Field>
                            </div>

                            <div className="mt-4">
                                <Field label="Address" error={errors.address?.message}>
                                    <Textarea {...register("address")} rows={3} placeholder="Agent address..." />
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
                            <div className="text-sm text-gray-800 mt-1">Add agent contact persons.</div>

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
                            <div className="text-sm text-gray-800 mt-1">Create users-permissions account with Agent role.</div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Username" error={errors.username?.message}>
                                    <Input {...register("username")} placeholder="agent.username" />
                                </Field>

                                <Field label="Email" error={errors.email?.message}>
                                    <Input {...register("email")} type="email" placeholder="agent@example.com" />
                                </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Password" error={errors.password?.message}>
                                    <Controller
                                        control={control}
                                        name="password"
                                        render={({ field }) => (
                                            <PasswordInput
                                                value={field.value || ""}
                                                onChange={field.onChange}
                                                placeholder="Min 3 characters"
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
                                                placeholder="Retype password"
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
                                {isSubmitting ? "Saving..." : "Create Agent"}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}
