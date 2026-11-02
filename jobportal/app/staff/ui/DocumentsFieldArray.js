"use client";

import { Controller, useFieldArray } from "react-hook-form";
import { useDropzone } from "react-dropzone";
import { useMemo } from "react";

/**
 * DocumentsFieldArray.jsx
 * Each document row: { name, remarks, file, existingUrl }
 *
 * Usage:
 * <DocumentsFieldArray control={control} register={register} errors={errors} name="documents" />
 */

function Input(props) {
    return (
        <input
            {...props}
            className="w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-200"
        />
    );
}

function Textarea(props) {
    return (
        <textarea
            {...props}
            className="w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-200"
        />
    );
}

function DropzoneMini({ value, onChange, error, existingUrl }) {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        multiple: false,
        onDrop: (acceptedFiles) => {
            onChange(acceptedFiles?.[0] || null);
        },
        accept: {
            "application/pdf": [".pdf"],
            "image/*": [".jpg", ".jpeg", ".png", ".webp"],
        },
    });

    const file = useMemo(() => (value instanceof File ? value : null), [value]);

    return (
        <div className="space-y-2">
            <div
                {...getRootProps()}
                className={`rounded-xl border border-dashed px-3 py-3 text-sm cursor-pointer ${isDragActive ? "bg-amber-50 border-amber-300" : "bg-gray-50 border-gray-400"
                    }`}
            >
                <input {...getInputProps()} />

                <div className="text-gray-700">Click to add an asset or drag & drop</div>
                <div className="text-xs text-gray-500 mt-1">
                    Accepted: pdf, jpg, png, webp
                </div>



                {file ? (
                    <div className="mt-3 rounded-xl border border-gray-400 bg-white px-3 py-2">
                        <div className="text-xs text-gray-900 truncate">{file.name}</div>
                        <div className="text-xs text-gray-500">
                            {Math.round((file.size || 0) / 1024)} KB
                        </div>
                    </div>
                ) : (
                    <div className="mt-3 text-xs text-gray-500">No new file selected.</div>
                )}


            </div>

            <div className="flex items-center justify-between gap-2">

                {existingUrl ? (
                    <div className="mt-2 text-xs">
                        <a
                            href={existingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-red-600 hover:underline"
                        >
                            Open existing file
                        </a>
                    </div>
                ) : null}


                <div className="text-xs text-gray-500">
                    {file ? "New file selected" : existingUrl ? "Using existing file" : ""}
                </div>

                {file ? (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        className="rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                        Clear file
                    </button>
                ) : null}
            </div>

            {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>
    );
}

export default function DocumentsFieldArray({

    control,
    register,
    errors,
    name = "documents",
}) {
    const { fields, append, remove, move } = useFieldArray({
        control,
        name,
    });

    const addDocument = () => {
        append({ name: "", remarks: "", file: null, existingUrl: "" });
    };

    return (
        <div className="rounded-2xl border border-red-100 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm text-gray-900">Documents ({fields.length})</div>
                    {fields.length === 0 ? (
                        <button
                            type="button"
                            onClick={addDocument}
                            className="mt-1 text-xs text-blue-600 hover:underline"
                        >
                            No entry yet. Click to add one.
                        </button>
                    ) : (
                        <div className="mt-1 text-xs text-gray-800">
                            Add more documents (Name, File, Remarks). Use Up/Down to reorder.
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={addDocument}
                    className="rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                >
                    + Add Document
                </button>
            </div>

            {fields.length > 0 ? (
                <div className="mt-4 space-y-3">
                    {fields.map((f, index) => {
                        const nameErr = errors?.[name]?.[index]?.name?.message;
                        const remarksErr = errors?.[name]?.[index]?.remarks?.message;
                        const fileErr = errors?.[name]?.[index]?.file?.message;

                        return (
                            <div key={f.id} className="rounded-2xl border border-gray-400 bg-white p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="text-sm text-gray-800">Document #{index + 1}</div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => move(index, index - 1)}
                                            disabled={index === 0}
                                            className="rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            title="Move up"
                                        >
                                            Up
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => move(index, index + 1)}
                                            disabled={index === fields.length - 1}
                                            className="rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            title="Move down"
                                        >
                                            Down
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => remove(index)}
                                            className="rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {/* Name */}
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-700">Name</div>
                                        <Input
                                            {...register(`${name}.${index}.name`)}
                                            placeholder="e.g. Experience Letter"
                                        />
                                        {nameErr ? <div className="text-xs text-red-700">{nameErr}</div> : null}
                                    </div>

                                    {/* Remarks */}
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-700">Remarks</div>
                                        <Input
                                            {...register(`${name}.${index}.remarks`)}
                                            placeholder="e.g. Verified / Pending"
                                        />
                                        {remarksErr ? <div className="text-xs text-red-700">{remarksErr}</div> : null}
                                    </div>

                                    {/* File */}
                                    <div className="md:col-span-2 space-y-1">
                                        <div className="text-sm text-gray-700">File</div>

                                        {/* keep existingUrl in form state */}
                                        <input type="hidden" {...register(`${name}.${index}.existingUrl`)} />

                                        <Controller
                                            control={control}
                                            name={`${name}.${index}.file`}
                                            render={({ field }) => (
                                                <DropzoneMini
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    existingUrl={f.existingUrl || ""}
                                                    error={fileErr}
                                                />
                                            )}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}