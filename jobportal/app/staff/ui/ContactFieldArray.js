"use client";

import { useFieldArray } from "react-hook-form";
import {
    Field,
    Input,
    Textarea,
} from "@/app/staff/ui/CandidateFormUI";

export default function ContactFieldArray({ control, register, errors, name = "contactList" }) {
    const { fields, append, remove } = useFieldArray({
        control,
        name,
    });

    const rowErrors = errors?.[name] || [];

    return (
        <div className="rounded-2xl border border-red-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-base text-red-600 font-semibold">Contact List</div>
                    <div className="text-sm text-gray-600">
                        Add multiple contacts (name, designation, mobile, remarks).
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => append({ name: "", designation: "", mobile: "", remarks: "" })}
                    className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90"
                >
                    + Add Contact
                </button>
            </div>

            {fields.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                    No contact yet. Click <b>Add Contact</b>.
                </div>
            ) : null}

            <div className="mt-4 space-y-4">
                {fields.map((f, idx) => {
                    const e = rowErrors?.[idx] || {};
                    return (
                        <div key={f.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-gray-900">
                                    Contact #{idx + 1}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => remove(idx)}
                                    className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                    Remove
                                </button>
                            </div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Name" error={e?.name?.message}>
                                    <Input
                                        {...register(`${name}.${idx}.name`)}
                                        placeholder="e.g. Ahmed Khan"
                                    />
                                </Field>

                                <Field label="Position" error={e?.designation?.message}>
                                    <Input
                                        {...register(`${name}.${idx}.designation`)}
                                        placeholder="e.g. HR Manager"
                                    />
                                </Field>
                            </div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Phone" error={e?.mobile?.message}>
                                    <Input
                                        {...register(`${name}.${idx}.mobile`)}
                                        placeholder="+971 5xx xxxxxxx"
                                    />
                                </Field>

                                <Field label="Remarks" error={e?.remarks?.message}>
                                    <Textarea
                                        {...register(`${name}.${idx}.remarks`)}
                                        rows={3}
                                        placeholder="Notes about this contact..."
                                        maxLength={200}
                                    />
                                </Field>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}