// One-off: portal-only jobs JB-… → PJ-… (same digits), old number kept as
// "previous reference" (agreed with Matchworkers 18 Nov). Jobs linked to
// Recruitly keep their JB number. Writes through the portal's Strapi API token,
// like the import does. Prints job numbers only, never other data.
//
// Run in the portal folder, with the portal's .env:
//   node --env-file=.env scripts/rename-portal-job-numbers.mjs              (dry run: shows the plan, changes nothing)
//   node --env-file=.env scripts/rename-portal-job-numbers.mjs --apply --log <file.json>
//   node --env-file=.env scripts/rename-portal-job-numbers.mjs --undo  --log <file.json>
// --apply writes every change to the log file first; --undo puts back exactly
// those jobs (only where the number is still the new one).
import fs from "node:fs";
import { strapiFetchAll, strapiRequest } from "../lib/server/portalStrapi.js";
import { planJobRenames } from "../lib/server/jobNumbers.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const undo = args.includes("--undo");
const logAt = args.indexOf("--log");
const logFile = logAt >= 0 ? args[logAt + 1] : "";

if (apply && undo) {
    console.error("Use --apply or --undo, not both.");
    process.exit(1);
}
if ((apply || undo) && !logFile) {
    console.error("--apply and --undo need --log <file.json>.");
    process.exit(1);
}

async function loadJobs() {
    return strapiFetchAll("/jobs", { fields: ["documentId", "referenceNo", "previousReferenceNo", "recruitlyJobId"] });
}

async function save(documentId, data) {
    await strapiRequest(`/jobs/${encodeURIComponent(documentId)}`, {
        method: "PUT",
        query: { status: "published" },
        body: { data },
    });
}

if (undo) {
    const log = JSON.parse(fs.readFileSync(logFile, "utf8"));
    const byDoc = new Map((await loadJobs()).map((j) => [j.documentId, j]));
    let restored = 0;
    let left = 0;
    for (const r of log.renames || []) {
        const job = byDoc.get(r.documentId);
        if (!job || job.referenceNo !== r.to) {
            left += 1;
            console.log(`left as it is: ${r.to} (now ${job ? job.referenceNo || "no number" : "job not found"})`);
            continue;
        }
        await save(r.documentId, r.keepPrevious ? { referenceNo: r.from, previousReferenceNo: null } : { referenceNo: r.from });
        restored += 1;
    }
    console.log(`Undo done: ${restored} restored, ${left} left as they are.`);
    process.exit(0);
}

const jobs = await loadJobs();
const { renames, skipped } = planJobRenames(jobs);
const linked = jobs.filter((j) => String(j?.recruitlyJobId || "").trim()).length;
console.log(`Jobs: ${jobs.length} · linked to Recruitly (keep JB): ${linked} · to rename: ${renames.length} · skipped: ${skipped.length}`);
for (const r of renames.slice(0, 10)) console.log(`  ${r.from} → ${r.to}`);
if (renames.length > 10) console.log(`  … and ${renames.length - 10} more`);
for (const s of skipped) console.log(`  skipped ${s.referenceNo}: ${s.reason}`);

if (!apply) {
    console.log("Dry run: nothing changed. Add --apply --log <file.json> to rename.");
    process.exit(0);
}

fs.writeFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), renames }, null, 2));
let done = 0;
for (const r of renames) {
    try {
        await save(r.documentId, r.keepPrevious ? { referenceNo: r.to, previousReferenceNo: r.from } : { referenceNo: r.to });
        done += 1;
    } catch (error) {
        console.error(`FAILED ${r.from}: ${error?.message || error}`);
    }
}
console.log(`Renamed ${done} of ${renames.length}. Change list: ${logFile}`);
