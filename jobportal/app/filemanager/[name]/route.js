export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import {
    ensureFileManagerStorage,
    FILE_MANAGER_STORAGE_DIR,
} from "@/lib/server/fileManagerStorage";

const STORAGE_DIR = FILE_MANAGER_STORAGE_DIR;

const CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".pdf": "application/pdf",
};

function safeFileName(value) {
    const name = String(value || "");

    if (!name || name !== path.basename(name)) return "";
    if (name.startsWith(".")) return "";
    if (name.includes("/") || name.includes("\\")) return "";

    const extension = path.extname(name).toLowerCase();
    if (!CONTENT_TYPES[extension]) return "";

    return name;
}

function baseHeaders({ name, size, modifiedAt }) {
    const extension = path.extname(name).toLowerCase();

    return {
        "Content-Type": CONTENT_TYPES[extension],
        "Content-Disposition": `inline; filename="${name.replace(/["\\]/g, "-")}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, max-age=0",
        "Content-Length": String(size),
        "Last-Modified": modifiedAt.toUTCString(),
        "X-Content-Type-Options": "nosniff",
    };
}

function parseRange(rangeHeader, fileSize) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader || "").trim());
    if (!match) return null;

    const startText = match[1];
    const endText = match[2];

    let start;
    let end;

    // Suffix range, for example: bytes=-500
    if (!startText && endText) {
        const suffixLength = Number(endText);
        if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;

        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
    } else {
        start = Number(startText);
        end = endText ? Number(endText) : fileSize - 1;
    }

    if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start ||
        start >= fileSize
    ) {
        return null;
    }

    return {
        start,
        end: Math.min(end, fileSize - 1),
    };
}

async function resolveFile(context) {
    await ensureFileManagerStorage();

    const params = await context.params;
    const name = safeFileName(params?.name);

    if (!name) return null;

    const filePath = path.join(STORAGE_DIR, name);

    try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) return null;

        return {
            name,
            filePath,
            fileStat,
        };
    } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
    }
}

export async function GET(request, context) {
    try {
        const resolved = await resolveFile(context);

        if (!resolved) {
            return new Response("File not found", { status: 404 });
        }

        const { name, filePath, fileStat } = resolved;
        const fileSize = fileStat.size;
        const headers = baseHeaders({
            name,
            size: fileSize,
            modifiedAt: fileStat.mtime,
        });

        const rangeHeader = request.headers.get("range");

        if (rangeHeader) {
            const range = parseRange(rangeHeader, fileSize);

            if (!range) {
                return new Response(null, {
                    status: 416,
                    headers: {
                        ...headers,
                        "Content-Range": `bytes */${fileSize}`,
                        "Content-Length": "0",
                    },
                });
            }

            const completeFile = await readFile(filePath);
            const partialFile = completeFile.subarray(range.start, range.end + 1);

            return new Response(partialFile, {
                status: 206,
                headers: {
                    ...headers,
                    "Content-Length": String(partialFile.length),
                    "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
                },
            });
        }

        const file = await readFile(filePath);

        return new Response(file, {
            status: 200,
            headers,
        });
    } catch (error) {
        console.error("File Manager public file error:", error);
        return new Response("Unable to read file", { status: 500 });
    }
}

export async function HEAD(_request, context) {
    try {
        const resolved = await resolveFile(context);

        if (!resolved) {
            return new Response(null, { status: 404 });
        }

        const { name, fileStat } = resolved;

        return new Response(null, {
            status: 200,
            headers: baseHeaders({
                name,
                size: fileStat.size,
                modifiedAt: fileStat.mtime,
            }),
        });
    } catch (error) {
        console.error("File Manager public HEAD error:", error);
        return new Response(null, { status: 500 });
    }
}
