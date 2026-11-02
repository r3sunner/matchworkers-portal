import path from "node:path";
import {
    access,
    copyFile,
    mkdir,
    readdir,
    rename,
    rmdir,
    unlink,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const ALLOWED_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".avif",
    ".pdf",
]);

const configuredStorageDirectory = String(
    process.env.FILE_MANAGER_STORAGE_DIR || ""
).trim();

export const FILE_MANAGER_STORAGE_DIR = configuredStorageDirectory
    ? path.resolve(configuredStorageDirectory)
    : path.join(process.cwd(), "storage", "filemanager");

const LEGACY_PUBLIC_DIRECTORY = path.join(
    process.cwd(),
    "public",
    "filemanager"
);

let ensurePromise = null;

function isSafeLegacyFileName(name) {
    if (!name || typeof name !== "string") return false;
    if (name !== path.basename(name)) return false;
    if (name.startsWith(".")) return false;

    return ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase());
}

async function pathExists(target) {
    try {
        await access(target, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function moveFileSafely(source, destination) {
    if (await pathExists(destination)) {
        return false;
    }

    try {
        await rename(source, destination);
        return true;
    } catch (error) {
        if (error?.code !== "EXDEV") throw error;

        await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
        await unlink(source);
        return true;
    }
}

async function migrateLegacyPublicFiles() {
    let entries;

    try {
        entries = await readdir(LEGACY_PUBLIC_DIRECTORY, {
            withFileTypes: true,
        });
    } catch (error) {
        if (error?.code === "ENOENT") return;
        throw error;
    }

    for (const entry of entries) {
        if (!entry.isFile() || !isSafeLegacyFileName(entry.name)) continue;

        const source = path.join(LEGACY_PUBLIC_DIRECTORY, entry.name);
        const destination = path.join(FILE_MANAGER_STORAGE_DIR, entry.name);

        try {
            await moveFileSafely(source, destination);
        } catch (error) {
            console.error(
                `Unable to migrate legacy File Manager file: ${entry.name}`,
                error
            );
        }
    }

    // Remove the old public directory only when it is empty.
    // This prevents it from shadowing the dynamic /filemanager/[name] route.
    try {
        await rmdir(LEGACY_PUBLIC_DIRECTORY);
    } catch (error) {
        if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) {
            console.error("Unable to remove legacy public/filemanager folder:", error);
        }
    }
}

export async function ensureFileManagerStorage() {
    if (!ensurePromise) {
        ensurePromise = (async () => {
            await mkdir(FILE_MANAGER_STORAGE_DIR, { recursive: true });
            await migrateLegacyPublicFiles();
        })().catch((error) => {
            ensurePromise = null;
            throw error;
        });
    }

    await ensurePromise;
    return FILE_MANAGER_STORAGE_DIR;
}
