// Job numbers (agreed with Matchworkers 18 Nov): JB- = a Recruitly job number,
// PJ- = a job that exists only in the portal. Portal jobs created before this
// change carry JB- numbers the portal made up itself; the one-off rename gives
// them PJ- with the same digits (JB-1252 → PJ-1252) and keeps the old number as
// previousReferenceNo, so a search for it still finds the job.
// Pure planning here; scripts/rename-portal-job-numbers.mjs writes it.

const OLD_PREFIX = /^JB-/i;

// jobs: [{ documentId, referenceNo, previousReferenceNo, recruitlyJobId }]
// Returns { renames: [{ documentId, from, to, keepPrevious }], skipped: [{ documentId, referenceNo, reason }] }.
// Never renames a job linked to Recruitly (its JB number is Recruitly's).
export function planJobRenames(jobs) {
    const list = Array.isArray(jobs) ? jobs : [];
    const taken = new Set(list.map((j) => String(j?.referenceNo || "").trim().toUpperCase()).filter(Boolean));
    const renames = [];
    const skipped = [];
    const planned = new Set();

    for (const job of list) {
        const from = String(job?.referenceNo || "").trim();
        if (!OLD_PREFIX.test(from)) continue;
        if (String(job?.recruitlyJobId || "").trim()) continue; // Recruitly job: keeps its JB number

        const to = `PJ-${from.slice(3)}`;
        const key = to.toUpperCase();
        if (taken.has(key) || planned.has(key)) {
            skipped.push({ documentId: job.documentId, referenceNo: from, reason: `${to} is already used by another job` });
            continue;
        }
        planned.add(key);
        renames.push({
            documentId: job.documentId,
            from,
            to,
            // An earlier previous number is never overwritten.
            keepPrevious: !String(job?.previousReferenceNo || "").trim(),
        });
    }
    return { renames, skipped };
}
