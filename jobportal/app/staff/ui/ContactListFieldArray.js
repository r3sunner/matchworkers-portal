"use client";

import { useFieldArray } from "react-hook-form";

function Field({ label, error, children }) {
    return (
        <div className="space-y-1">
            <div className="text-sm text-gray-700">{label}</div>
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

export default function ContactListFieldArray({
    control,
    register,
    errors,
    name = "contactList",
}) {
    const { fields, append, remove } = useFieldArray({ control, name });
    const listErrors = errors?.[name];

    return (
        <div className="rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <div className="text-sm text-gray-900">Contact List</div>
                    <div className="text-xs text-gray-600 mt-1">
                        Add multiple contacts (name, designation, mobile, remarks)
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() =>
                        append({ name: "", designation: "", mobile: "", remarks: "" })
                    }
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                    + Add Contact
                </button>
            </div>

            {fields.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500">
                    No entry yet. Click “Add Contact”.
                </div>
            ) : (
                <div className="mt-4 space-y-3">
                    {fields.map((item, index) => {
                        const rowErr = listErrors?.[index] || {};

                        return (
                            <div
                                key={item.id}
                                className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-800">
                                        Contact #{index + 1}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => remove(index)}
                                        className="rounded-xl bg-white border border-gray-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                                    >
                                        Remove
                                    </button>
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label="Name" error={rowErr?.name?.message}>
                                        <Input
                                            {...register(`${name}.${index}.name`)}
                                            placeholder="e.g. Bilal Ahmed"
                                        />
                                    </Field>

                                    <Field
                                        label="Designation"
                                        error={rowErr?.designation?.message}
                                    >
                                        <Input
                                            {...register(`${name}.${index}.designation`)}
                                            placeholder="e.g. HR Manager"
                                        />
                                    </Field>
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label="Mobile" error={rowErr?.mobile?.message}>
                                        <Input
                                            {...register(`${name}.${index}.mobile`)}
                                            placeholder="+92 3xx xxxxxxx"
                                        />
                                    </Field>

                                    <Field label="Remarks" error={rowErr?.remarks?.message}>
                                        <Input
                                            {...register(`${name}.${index}.remarks`)}
                                            placeholder="Optional note..."
                                        />
                                    </Field>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}