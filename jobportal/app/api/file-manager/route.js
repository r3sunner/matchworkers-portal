export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import path from "node:path";
import { readdir, stat, unlink, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/server/requireStaffSession";
import {
    ensureFileManagerStorage,
    FILE_MANAGER_STORAGE_DIR,
} from "@/lib/server/fileManagerStorage";

const STORAGE_DIR = FILE_MANAGER_STORAGE_DIR;
const MAX_FILE_COUNT = 30;
const MAX_FILE_SIZE = Math.max(
    1,
    Number(process.env.FILE_MANAGER_MAX_MB || 25)
) * 1024 * 1024;
const MAX_TOTAL_SIZE = Math.max(
    1,
    Number(process.env.FILE_MANAGER_MAX_TOTAL_MB || 100)
) * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".avif",
    ".pdf",
]);

const IMAGE_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".avif",
]);

async function ensureStorageDirectory() {
    await ensureFileManagerStorage();
}

function json(data, status = 200) {
    return NextResponse.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store, max-age=0",
        },
    });
}

async function requireStaff() {
    const session = await getStaffSession();

    if (!session.ok) {
        return {
            ok: false,
            response: json(
                {
                    ok: false,
                    error: session.error,
                },
                session.status
            ),
        };
    }

    return { ok: true, session };
}

function sanitizeOriginalName(fileName) {
    const parsed = path.parse(String(fileName || "file"));
    const extension = parsed.ext.toLowerCase();
    const safeBase = parsed.name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100) || "file";

    return {
        base: safeBase,
        extension,
    };
}

async function writeFileWithShortUniqueName(originalName, buffer) {
    const { base, extension } = sanitizeOriginalName(originalName);

    // Six digits keep the public URL short while still avoiding most collisions.
    // writeFile(..., { flag: "wx" }) guarantees an existing file is never overwritten.
    for (let attempt = 0; attempt < 25; attempt += 1) {
        const shortId = String(crypto.randomInt(100000, 1000000));
        const storedName = `${shortId}-${base}${extension}`;
        const destination = path.join(STORAGE_DIR, storedName);

        try {
            await writeFile(destination, buffer, { flag: "wx" });
            return storedName;
        } catch (error) {
            if (error?.code === "EEXIST") continue;
            throw error;
        }
    }

    throw new Error("Unable to create a unique short filename. Please try again.");
}

function displayNameFromStoredName(storedName) {
    return String(storedName || "")
        // Old naming format: 13-digit timestamp + 10-character hash.
        .replace(/^\d{13}-[a-f0-9]{10}-/i, "")
        // New naming format: short 6-digit unique number.
        .replace(/^\d{6}-/, "");
}

function publicUrlForName(name) {
    return `/filemanager/${encodeURIComponent(name)}`;
}

function detectFileType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return "unknown";

    if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";

    if (
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    ) return "jpg";

    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
    ) return "png";

    const firstSix = buffer.subarray(0, 6).toString("ascii");
    if (firstSix === "GIF87a" || firstSix === "GIF89a") return "gif";

    if (
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) return "webp";

    const boxType = buffer.subarray(4, 12).toString("ascii");
    if (boxType.includes("ftypavif") || boxType.includes("ftypavis")) {
        return "avif";
    }

    return "unknown";
}

function extensionMatchesDetectedType(extension, detectedType) {
    if (detectedType === "pdf") return extension === ".pdf";
    if (detectedType === "jpg") return extension === ".jpg" || extension === ".jpeg";
    if (detectedType === "png") return extension === ".png";
    if (detectedType === "gif") return extension === ".gif";
    if (detectedType === "webp") return extension === ".webp";
    if (detectedType === "avif") return extension === ".avif";
    return false;
}

function isSafeStoredName(name) {
    if (!name || typeof name !== "string") return false;
    if (name !== path.basename(name)) return false;
    if (name.startsWith(".")) return false;

    const extension = path.extname(name).toLowerCase();
    return ALLOWED_EXTENSIONS.has(extension);
}

async function getFileItem(name) {
    const filePath = path.join(STORAGE_DIR, name);
    const fileStat = await stat(filePath);
    const extension = path.extname(name).toLowerCase();

    return {
        name,
        displayName: displayNameFromStoredName(name),
        extension: extension.replace(/^\./, "").toUpperCase(),
        kind: IMAGE_EXTENSIONS.has(extension) ? "image" : "pdf",
        size: fileStat.size,
        createdAt: fileStat.birthtime?.toISOString?.() || fileStat.ctime.toISOString(),
        modifiedAt: fileStat.mtime.toISOString(),
        url: publicUrlForName(name),
    };
}

async function listFiles() {
    await ensureStorageDirectory();
    const entries = await readdir(STORAGE_DIR, { withFileTypes: true });
    const names = entries
        .filter((entry) => entry.isFile() && isSafeStoredName(entry.name))
        .map((entry) => entry.name);

    const settled = await Promise.allSettled(names.map(getFileItem));

    return settled
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
        .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

export async function GET() {
    const access = await requireStaff();
    if (!access.ok) return access.response;

    try {
        const files = await listFiles();

        return json({
            ok: true,
            files,
            count: files.length,
            totalSize: files.reduce((sum, file) => sum + file.size, 0),
        });
    } catch (error) {
        console.error("File Manager list error:", error);
        return json(
            {
                ok: false,
                error: error?.message || "Unable to list files.",
            },
            500
        );
    }
}

export async function POST(request) {
    const access = await requireStaff();
    if (!access.ok) return access.response;

    try {
        await ensureStorageDirectory();

        const formData = await request.formData();
        const uploadedFiles = formData
            .getAll("files")
            .filter((value) => value && typeof value.arrayBuffer === "function");

        if (uploadedFiles.length === 0) {
            return json(
                {
                    ok: false,
                    error: "Select at least one image or PDF file.",
                },
                400
            );
        }

        if (uploadedFiles.length > MAX_FILE_COUNT) {
            return json(
                {
                    ok: false,
                    error: `You can upload a maximum of ${MAX_FILE_COUNT} files at one time.`,
                },
                400
            );
        }

        const totalSize = uploadedFiles.reduce(
            (sum, file) => sum + Number(file.size || 0),
            0
        );

        if (totalSize > MAX_TOTAL_SIZE) {
            return json(
                {
                    ok: false,
                    error: `Total upload size is too large. Maximum is ${Math.round(MAX_TOTAL_SIZE / 1024 / 1024)} MB.`,
                },
                400
            );
        }

        const report = [];

        for (const file of uploadedFiles) {
            const originalName = String(file.name || "file");
            const { extension } = sanitizeOriginalName(originalName);

            if (!ALLOWED_EXTENSIONS.has(extension)) {
                report.push({
                    originalName,
                    status: "skipped",
                    error: "Only JPG, JPEG, PNG, GIF, WEBP, AVIF and PDF files are allowed.",
                });
                continue;
            }

            if (Number(file.size || 0) > MAX_FILE_SIZE) {
                report.push({
                    originalName,
                    status: "skipped",
                    error: `File is larger than ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`,
                });
                continue;
            }

            const buffer = Buffer.from(await file.arrayBuffer());
            const detectedType = detectFileType(buffer);

            if (!extensionMatchesDetectedType(extension, detectedType)) {
                report.push({
                    originalName,
                    status: "skipped",
                    error: "The file content does not match its extension or the file type is unsupported.",
                });
                continue;
            }

            const storedName = await writeFileWithShortUniqueName(
                originalName,
                buffer
            );

            const item = await getFileItem(storedName);

            report.push({
                originalName,
                status: "uploaded",
                file: item,
            });
        }

        const uploaded = report
            .filter((item) => item.status === "uploaded")
            .map((item) => item.file);

        return json({
            ok: uploaded.length > 0,
            uploaded,
            uploadedCount: uploaded.length,
            skippedCount: report.length - uploaded.length,
            report,
        }, uploaded.length > 0 ? 200 : 400);
    } catch (error) {
        console.error("File Manager upload error:", error);
        return json(
            {
                ok: false,
                error: error?.message || "File upload failed.",
            },
            500
        );
    }
}

export async function DELETE(request) {
    const access = await requireStaff();
    if (!access.ok) return access.response;

    try {
        await ensureStorageDirectory();

        const body = await request.json().catch(() => ({}));
        const deleteAll = body?.all === true;
        const requestedFiles = Array.isArray(body?.files) ? body.files : [];

        let names = [];

        if (deleteAll) {
            const entries = await readdir(STORAGE_DIR, { withFileTypes: true });
            names = entries
                .filter((entry) => entry.isFile() && isSafeStoredName(entry.name))
                .map((entry) => entry.name);
        } else {
            names = [...new Set(requestedFiles.map((value) => String(value || "")))]
                .filter(isSafeStoredName);
        }

        if (names.length === 0) {
            return json(
                {
                    ok: false,
                    error: deleteAll ? "There are no files to delete." : "Select at least one file.",
                },
                400
            );
        }

        const report = [];

        for (const name of names) {
            const target = path.join(STORAGE_DIR, path.basename(name));

            try {
                await unlink(target);
                report.push({ name, status: "deleted" });
            } catch (error) {
                if (error?.code === "ENOENT") {
                    report.push({ name, status: "missing" });
                } else {
                    report.push({
                        name,
                        status: "failed",
                        error: error?.message || "Delete failed.",
                    });
                }
            }
        }

        const deletedCount = report.filter((item) => item.status === "deleted").length;

        return json({
            ok: true,
            deletedCount,
            report,
        });
    } catch (error) {
        console.error("File Manager delete error:", error);
        return json(
            {
                ok: false,
                error: error?.message || "Unable to delete files.",
            },
            500
        );
    }
}
