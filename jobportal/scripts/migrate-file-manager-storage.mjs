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

const projectRoot = process.cwd();
const sourceDirectory = path.join(projectRoot, "public", "filemanager");
const configuredStorageDirectory = String(
    process.env.FILE_MANAGER_STORAGE_DIR || ""
).trim();
const destinationDirectory = configuredStorageDirectory
    ? path.resolve(configuredStorageDirectory)
    : path.join(projectRoot, "storage", "filemanager");

const allowedExtensions = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".avif",
    ".pdf",
]);

async function exists(target) {
    try {
        await access(target, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function moveFile(source, destination) {
    if (await exists(destination)) {
        console.log(`Skipped because destination exists: ${path.basename(destination)}`);
        return "skipped";
    }

    try {
        await rename(source, destination);
    } catch (error) {
        if (error?.code !== "EXDEV") throw error;
        await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
        await unlink(source);
    }

    console.log(`Moved: ${path.basename(source)}`);
    return "moved";
}

await mkdir(destinationDirectory, { recursive: true });

let entries;
try {
    entries = await readdir(sourceDirectory, { withFileTypes: true });
} catch (error) {
    if (error?.code === "ENOENT") {
        console.log("No public/filemanager folder exists. Nothing to migrate.");
        console.log(`Runtime storage: ${destinationDirectory}`);
        process.exit(0);
    }
    throw error;
}

let moved = 0;
let skipped = 0;

for (const entry of entries) {
    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (!allowedExtensions.has(extension)) {
        console.log(`Unsupported file left in public folder: ${entry.name}`);
        skipped += 1;
        continue;
    }

    const result = await moveFile(
        path.join(sourceDirectory, entry.name),
        path.join(destinationDirectory, entry.name)
    );

    if (result === "moved") moved += 1;
    else skipped += 1;
}

try {
    await rmdir(sourceDirectory);
    console.log("Removed empty public/filemanager folder.");
} catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) throw error;
    console.log("public/filemanager was not removed because it is not empty.");
}

console.log(`Migration complete. Moved: ${moved}, skipped: ${skipped}`);
console.log(`Runtime storage: ${destinationDirectory}`);
