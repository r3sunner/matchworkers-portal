"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
//import Header from "@/app/components/layouts/delete-staff/Header";

import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
    Field,
    Input,
    DropzoneBox,
    PasswordInput,
    fetchJsonSafe,
    fileExtOk,
} from "@/app/staff/ui/CandidateFormUI";

/* ------------------------------------------------------------------ */
/* Schema */
/* ------------------------------------------------------------------ */
const StaffEditSchema = z
    .object({
        fullName: z.string().min(1, "Full name is required"),
        mobile: z.string().optional(),
        designation: z.string().optional(),

        image: z.any().optional(),

        username: z.string().min(1, "Username is required"),
        email: z.string().email("Invalid email"),

        password: z.string().optional(),
        retypePassword: z.string().optional(),
    })
    .superRefine((val, ctx) => {
        // image validation if new file
        if (val.image && val.image instanceof File) {
            if (!fileExtOk(val.image, [".jpg", ".jpeg", ".png", ".webp"])) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["image"],
                    message: "Profile image must be jpg/png/webp",
                });
            }
        }

        // optional password update
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
    });

export default function StaffEditPage() {
    const params = useParams();
    const documentId = params?.documentId;

    const [submitMsg, setSubmitMsg] = useState("");
    const [loading, setLoading] = useState(true);

    const [existingMedia, setExistingMedia] = useState({
        image: { url: "", name: "", id: null },
    });

    const {
        register,
        control,
        watch,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(StaffEditSchema),
        defaultValues: {
            fullName: "",
            mobile: "",
            designation: "",

            image: null,

            username: "",
            email: "",
            password: "",
            retypePassword: "",
        },
    });

    // load staff defaults
    useEffect(() => {
        if (!documentId) return;

        (async () => {
            setLoading(true);
            setSubmitMsg("");
            try {
                const json = await fetchJsonSafe(`/api/staff/getstaff/${documentId}`);
                reset(json?.formDefaults || {});
                setExistingMedia(json?.existingMedia || existingMedia);
            } catch (e) {
                console.error(e);
                setSubmitMsg(`Error: ${e.message || "Failed to load staff"} ❌`);
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId, reset]);

    const image = watch("image");
    const imagePreview = useMemo(() => {
        if (image instanceof File) return URL.createObjectURL(image);
        return existingMedia?.image?.url || "";
    }, [image, existingMedia]);

    useEffect(() => {
        if (!(image instanceof File)) return;
        const url = URL.createObjectURL(image);
        return () => URL.revokeObjectURL(url);
    }, [image]);

    const onSubmit = async (formData) => {
        setSubmitMsg("");

        try {
            // send JSON without file objects
            const payloadData = {
                ...formData,
                image: undefined,
            };

            const fd = new FormData();
            fd.append("data", JSON.stringify(payloadData));

            if (formData.image instanceof File) {
                fd.append("files.image", formData.image);
            }

            // You will create update route next (same pattern as clients/update)
            const res = await fetch(`/api/staff/update/${documentId}`, {
                method: "POST",
                body: fd,
            });

            // const json = await res.json();
            //if (!res.ok) throw new Error(json?.error || "Staff not saved");

            const text = await res.text();
            let json;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                // This is the IMPORTANT part: now you will SEE the real error
                throw new Error(`Server returned non-JSON: ${text.slice(0, 200)}`);
            }

            if (!res.ok || json?.ok === false) {
                throw new Error(json?.error || `Request failed (${res.status})`);
            }



            setSubmitMsg("Staff updated ✅");
        } catch (e) {
            console.error(e);
            setSubmitMsg(`Error: ${e.message || "Staff not saved"} ❌`);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <Header />
                <main className="mx-auto w-[95%] lg:w-[85%] px-2 sm:px-4 py-5">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6">Loading staff...</div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <Header />

            <main className="mx-auto w-[95%] lg:w-[85%] px-2 sm:px-4 py-5">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <header className="border-b border-gray-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-lg text-red-600 font-semibold">Staff Profile</div>
                                <div className="text-sm text-gray-600">View or update staff profile and account.</div>
                            </div>


                        </div>
                    </header>

                    <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-6">
                        {/* --- TOP GRID: Left image / Right form --- */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* LEFT: big image */}
                            <div className="lg:col-span-1">
                                <div className="rounded-2xl border border-red-200 p-4">
                                    <div className="text-base text-red-600 font-semibold">Profile Image</div>
                                    <div className="text-sm text-gray-800 mt-1">Staff profile photo.</div>

                                    <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                        {imagePreview ? (
                                            <img
                                                src={imagePreview}
                                                alt="staff"
                                                className="w-full h-auto object-cover rounded-2xl border border-gray-200 bg-white"
                                            />
                                        ) : (
                                            <div className="w-full h-[360px] rounded-2xl border border-dashed border-gray-300 bg-white flex items-center justify-center text-gray-500">
                                                No image
                                            </div>
                                        )}

                                        <div className="mt-3">
                                            <Controller
                                                control={control}
                                                name="image"
                                                render={({ field }) => (
                                                    <DropzoneBox
                                                        label="Change Profile Image"
                                                        acceptText="Accepted: .jpg, .png, .webp"
                                                        multiple={false}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        error={errors.image?.message}
                                                    />
                                                )}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT: staff info */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="rounded-2xl border border-red-200 p-4">
                                    <div className="text-base text-red-600 font-semibold">Staff Info</div>
                                    <div className="text-sm text-gray-800 mt-1">Basic staff details.</div>

                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Field
                                            label={
                                                <>
                                                    Full Name <span className="text-red-600 text-lg">*</span>
                                                </>
                                            }
                                            error={errors.fullName?.message}
                                        >
                                            <Input {...register("fullName")} placeholder="e.g. Yasir Aslam" />
                                        </Field>

                                        <Field label="Mobile" error={errors.mobile?.message}>
                                            <Input {...register("mobile")} placeholder="+92 3xx xxxxxxx" />
                                        </Field>
                                    </div>

                                    <div className="mt-4">
                                        <Field label="Designation" error={errors.designation?.message}>
                                            <Input {...register("designation")} placeholder="e.g. HR Executive" />
                                        </Field>
                                    </div>
                                </div>

                                {/* ACCOUNT SECTION */}
                                <div className="rounded-2xl border border-red-200 p-4">
                                    <div className="text-base text-red-600 font-semibold">Account</div>
                                    <div className="text-sm text-gray-800 mt-1">Staff login credentials.</div>

                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Field label="Username" error={errors.username?.message}>
                                            <Input {...register("username")} />
                                        </Field>

                                        <Field label="Email" error={errors.email?.message}>
                                            <Input {...register("email")} />
                                        </Field>
                                    </div>

                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Field
                                            label="Password"
                                            info="Leave empty if you don't want to change."
                                            error={errors.password?.message}
                                        >
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

                                        <Field
                                            label="Retype Password"
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
                                                        placeholder="Retype second time"
                                                        error={errors.retypePassword?.message}
                                                    />
                                                )}
                                            />
                                        </Field>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ACTIONS */}
                        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                            <Link
                                href="/staff"
                                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-center"
                            >
                                Cancel
                            </Link>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
                            >
                                {isSubmitting ? "Saving..." : "Save Staff"}
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