// R2 / R3: copy a candidate's Full Candidate Profile and Photo from Recruitly
// into the portal's own file storage. Server only.
//
// - Only the two allowed Recruitly categories, by category ID (see recruitly.js);
//   every other category and uncategorised files are never listed or downloaded.
// - Newest file per category. Each file the portal stores is tagged (caption)
//   with the Recruitly file ID, so an unchanged file is never downloaded again.
// - A file the import replaces is deleted only if the import added it; files
//   staff uploaded themselves are never deleted.
// - No photo in Recruitly: nothing is attached and the portal shows its neutral
//   placeholder (R3). No Full Candidate Profile: the candidate is still imported.
import { downloadFile, latestFiles, listCandidateFiles } from "./recruitly.js";
import { strapiDeleteFile, strapiRequest, strapiUploadFile } from "./portalStrapi.js";

export const RECRUITLY_FILE_TAG = "recruitly-file:";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const CONTENT_TYPES = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
};

export function contentTypeFor(file) {
    const ext = String(file?.extension || String(file?.name || "").split(".").pop() || "")
        .replace(/^\./, "")
        .toLowerCase();
    const listed = String(file?.contentType || "").split(";")[0].trim();
    return CONTENT_TYPES[ext] || (listed && listed !== "application/octet-stream" ? listed : "application/octet-stream");
}

export function tagFor(recruitlyFileId) {
    return `${RECRUITLY_FILE_TAG}${recruitlyFileId}`;
}

const KINDS = [
    { key: "fullCandidateProfile", field: "CV", label: "Full Candidate Profile", missing: "No Full Candidate Profile in Recruitly; imported without a CV" },
    { key: "photo", field: "profileImage", label: "Photo", missing: "No photo in Recruitly; the portal shows the placeholder" },
];

// Returns { cv, photo, notes } where cv / photo is
// "added" | "updated" | "unchanged" | "missing" | "failed".
// `files` (optional): the candidate's allowed Recruitly files, already listed
// by the caller (saves a call); otherwise they are listed here.
export async function syncCandidateFiles({ recruitlyCandidateId, portalDocumentId, counter, files }) {
    const result = { cv: "missing", photo: "missing", notes: [] };

    const [listed, current] = await Promise.all([
        files ? Promise.resolve(files) : listCandidateFiles(recruitlyCandidateId, { counter }),
        strapiRequest(`/candidates/${encodeURIComponent(portalDocumentId)}`, {
            query: {
                status: "published",
                fields: ["documentId"],
                populate: { CV: { fields: ["id", "caption", "name"] }, profileImage: { fields: ["id", "caption", "name"] } },
            },
        }).then((json) => json?.data),
    ]);
    const newest = latestFiles(listed);

    const update = {};
    const toDelete = [];
    const notes = { CV: [], profileImage: [] };

    // CV and photo are copied at the same time (Recruitly takes ~1 s per download).
    await Promise.all(
        KINDS.map(async (kind) => {
            const outKey = kind.field === "CV" ? "cv" : "photo";
            const recruitlyFile = newest[kind.key];
            const existing = current?.[kind.field] || null;

            if (!recruitlyFile) {
                result[outKey] = "missing";
                notes[kind.field].push(kind.missing);
                return; // never remove what the portal already has
            }

            if (existing?.caption === tagFor(recruitlyFile.id)) {
                result[outKey] = "unchanged";
                return;
            }

            try {
                if (Number(recruitlyFile.size) > MAX_FILE_BYTES) {
                    throw new Error(`file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
                }
                const { buffer } = await downloadFile(recruitlyFile, { counter });
                const uploaded = await strapiUploadFile({
                    buffer,
                    filename: recruitlyFile.name || `${kind.label}.${recruitlyFile.extension || "bin"}`,
                    contentType: contentTypeFor(recruitlyFile),
                    caption: tagFor(recruitlyFile.id),
                    alternativeText: kind.label,
                });
                update[kind.field] = uploaded.id;
                result[outKey] = existing ? "updated" : "added";
                if (existing?.id && String(existing.caption || "").startsWith(RECRUITLY_FILE_TAG)) toDelete.push(existing.id);
            } catch (error) {
                result[outKey] = "failed";
                notes[kind.field].push(`${kind.label} could not be copied (${error?.message || "error"}); the candidate was still imported`);
            }
        })
    );
    // Notes in a fixed order (CV first), whatever finished first.
    result.notes.push(...notes.CV, ...notes.profileImage);

    if (Object.keys(update).length) {
        await strapiRequest(`/candidates/${encodeURIComponent(portalDocumentId)}`, {
            method: "PUT",
            query: { status: "published" },
            body: { data: update },
        });
        // Only after the candidate points at the new file: remove the old one the import had added.
        for (const id of toDelete) {
            try {
                await strapiDeleteFile(id);
            } catch {
                // An old copy left in the media library is harmless; never fail the import for it.
            }
        }
    }

    return result;
}
