// R4: link the existing portal candidates (created before the Recruitly import)
// to their Recruitly records. Agreed with Matchworkers (16 Nov): nothing is
// linked automatically. The portal suggests a match where it can find one and
// staff confirm or reject each candidate on the review screen.
//
// Suggestion source: the same name on the same job in Recruitly. For every
// portal job linked to a Recruitly job (import screen, step 4), that Recruitly
// job is read (one call per job) and each unlinked portal candidate on the
// portal job is compared by name with the people on the Recruitly job. Jobs are
// never paired by JB number: the portal's numbers are its own (checked 18 Nov).
// The number in CV file names is NOT used (not reliable, per Matchworkers).
//
// Server only. Reads Recruitly (GET only), writes the portal (Strapi) only.
import { strapiFetchAll, strapiRequest } from "./portalStrapi.js";
import { referenceChange } from "./recruitlyImportMapping.js";

export const MATCH_STATUS = {
    PENDING: "pending", // has at least one suggestion, waiting for staff
    NONE: "no_suggestion", // nothing found; staff can still link by CA number
    CONFIRMED: "confirmed",
    REJECTED: "rejected",
};

const MATCHES = "/candidate-matches";

// Name compared without accents, case, punctuation or word order:
// "Petrov, Ivan" = "ivan PETROV" = "Iván Petrov".
export function nameKey(name) {
    return String(name || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean)
        .sort()
        .join(" ");
}

// Import (R4): could two names be the same person? Same words in any order,
// without accents, case or punctuation ("Petrov, Ivan" = "Iván PETROV"), or all
// words of the shorter name inside the longer one when it has at least two words
// ("Ivan Petrov" ⊂ "Ivan Georgiev Petrov"). Used only to send a candidate to
// "Needs review" instead of creating a second copy; never to link automatically.
export function namesLookAlike(a, b) {
    const x = nameKey(a);
    const y = nameKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [short, long] = x.split(" ").length <= y.split(" ").length ? [x.split(" "), y.split(" ")] : [y.split(" "), x.split(" ")];
    if (short.length < 2) return false;
    const pool = [...long];
    for (const w of short) {
        const at = pool.indexOf(w);
        if (at === -1) return false;
        pool.splice(at, 1);
    }
    return true;
}

// Pure: suggestions for one job.
// portalCandidates: [{ documentId, fullName }] unlinked candidates on the portal job
// entries: Recruitly pipeline entries of the job with that reference
// takenRecruitlyIds: Set of Recruitly IDs already linked to a portal candidate
// Returns Map(candidateDocumentId → [{ recruitlyId, name, jobRef, reason }]).
export function suggestForJob({ portalCandidates, entries, jobRef, takenRecruitlyIds = new Set() }) {
    const byName = new Map();
    for (const e of entries || []) {
        const id = String(e?.candidateId || "");
        const key = nameKey(e?.candidateName);
        if (!id || !key || takenRecruitlyIds.has(id)) continue;
        const list = byName.get(key) || [];
        if (!list.some((x) => x.recruitlyId === id)) list.push({ recruitlyId: id, name: String(e.candidateName || "").trim() });
        byName.set(key, list);
    }

    const out = new Map();
    for (const c of portalCandidates || []) {
        const found = byName.get(nameKey(c?.fullName)) || [];
        if (!found.length) continue;
        out.set(
            c.documentId,
            found.map((f) => ({
                ...f,
                jobRef,
                reason:
                    found.length > 1
                        ? `Same name on ${jobRef} in Recruitly (${found.length} people with this name on that job – check carefully)`
                        : `Same name on ${jobRef} in Recruitly`,
            }))
        );
    }
    return out;
}

// Pure: adds new suggestions to a row's list, one entry per Recruitly person,
// collecting every job where the name was found.
export function mergeSuggestions(existing, added) {
    const list = Array.isArray(existing) ? existing.map((s) => ({ ...s, jobRefs: [...(s.jobRefs || [s.jobRef].filter(Boolean))] })) : [];
    for (const s of added || []) {
        const same = list.find((x) => x.recruitlyId === s.recruitlyId);
        if (same) {
            if (s.jobRef && !same.jobRefs.includes(s.jobRef)) same.jobRefs.push(s.jobRef);
            same.reason = `Same name on ${same.jobRefs.join(", ")} in Recruitly`;
        } else {
            list.push({ recruitlyId: s.recruitlyId, name: s.name, jobRefs: s.jobRef ? [s.jobRef] : [], reason: s.reason });
        }
    }
    return list;
}

// "114061", "ca 114061", "CA-114061" → "CA-114061"; anything else → "".
export function normalizeCaNumber(value) {
    const m = String(value || "").trim().match(/^(?:ca[\s-]*)?(\d{4,8})$/i);
    return m ? `CA-${m[1]}` : "";
}

// ---------- Strapi side ----------

export async function unlinkedCandidates() {
    return strapiFetchAll("/candidates", {
        filters: { $or: [{ recruitlyId: { $null: true } }, { recruitlyId: { $eq: "" } }] },
        fields: ["documentId", "fullName", "referenceNumber"],
        sort: ["id:asc"],
    });
}

export async function allMatchRows() {
    return strapiFetchAll(MATCHES, { sort: ["id:asc"] });
}

export async function matchRowsFor(candidateDocumentIds) {
    const rows = [];
    for (let i = 0; i < candidateDocumentIds.length; i += 100) {
        const json = await strapiRequest(MATCHES, {
            query: { filters: { candidateDocumentId: { $in: candidateDocumentIds.slice(i, i + 100) } }, pagination: { pageSize: 100 } },
        });
        rows.push(...(Array.isArray(json?.data) ? json.data : []));
    }
    return rows;
}

export function createMatchRow(data) {
    return strapiRequest(MATCHES, { method: "POST", body: { data } });
}

export function updateMatchRow(documentId, data) {
    return strapiRequest(`${MATCHES}/${encodeURIComponent(documentId)}`, { method: "PUT", body: { data } });
}

// Portal jobs with a reference, with the documentIds of the candidates on them.
export async function portalJobsWithCandidates() {
    const jobs = await strapiFetchAll("/jobs", {
        fields: ["documentId", "referenceNo", "title", "recruitlyJobId"],
        populate: { assignCandidatesToJob: { populate: { candidate: { fields: ["documentId", "fullName", "recruitlyId"] } } } },
        sort: ["id:asc"],
    });
    return jobs
        .filter((j) => String(j?.referenceNo || "").trim())
        .map((j) => ({
            documentId: j.documentId,
            referenceNo: String(j.referenceNo).trim(),
            title: j.title || "",
            recruitlyJobId: j.recruitlyJobId || "",
            candidates: (j.assignCandidatesToJob || [])
                .map((item) => item?.candidate)
                .filter((c) => c?.documentId)
                .map((c) => ({ documentId: c.documentId, fullName: c.fullName || "", recruitlyId: c.recruitlyId || "" })),
        }));
}

// Recruitly IDs (from the list) already linked to a portal candidate.
export async function takenRecruitlyIds(recruitlyIds) {
    const ids = [...new Set((recruitlyIds || []).map(String).filter(Boolean))];
    const taken = new Set();
    for (let i = 0; i < ids.length; i += 100) {
        const json = await strapiRequest("/candidates", {
            query: {
                status: "published",
                filters: { recruitlyId: { $in: ids.slice(i, i + 100) } },
                fields: ["recruitlyId"],
                pagination: { pageSize: 100 },
            },
        });
        for (const c of json?.data || []) if (c?.recruitlyId) taken.add(String(c.recruitlyId));
    }
    return taken;
}

export async function loadCandidate(documentId) {
    const json = await strapiRequest(`/candidates/${encodeURIComponent(documentId)}`, {
        query: { status: "published", fields: ["documentId", "fullName", "referenceNumber", "previousReference", "recruitlyId", "caNumber"] },
    });
    return json?.data || null;
}

// Another portal candidate already holding this Recruitly ID or CA number.
export async function findConflict({ documentId, recruitlyId, caNumber }) {
    const or = [{ recruitlyId: { $eq: recruitlyId } }];
    if (caNumber) or.push({ caNumber: { $eq: caNumber } }, { referenceNumber: { $eq: caNumber } });
    const json = await strapiRequest("/candidates", {
        query: {
            status: "published",
            filters: { $and: [{ documentId: { $ne: documentId } }, { $or: or }] },
            fields: ["documentId", "fullName", "referenceNumber"],
            pagination: { pageSize: 1 },
        },
    });
    return json?.data?.[0] || null;
}

// Links the portal candidate to the Recruitly record: Recruitly ID, CA number,
// and the CA number becomes the shown reference (old CAN_ kept, see referenceChange).
export async function linkCandidate(candidate, { recruitlyId, caNumber }) {
    const data = { recruitlyId: String(recruitlyId), ...referenceChange(candidate, caNumber) };
    if (caNumber) data.caNumber = caNumber;
    await strapiRequest(`/candidates/${encodeURIComponent(candidate.documentId)}`, {
        method: "PUT",
        query: { status: "published" },
        body: { data },
    });
    return data;
}

// Undo of a confirm made on the review screen: link removed, old reference back.
export async function unlinkCandidate(candidate) {
    const data = { recruitlyId: null, caNumber: null };
    if (String(candidate?.previousReference || "").trim()) {
        data.referenceNumber = candidate.previousReference;
        data.previousReference = null;
    } else if (candidate?.caNumber && candidate.referenceNumber === candidate.caNumber) {
        data.referenceNumber = null;
    }
    await strapiRequest(`/candidates/${encodeURIComponent(candidate.documentId)}`, {
        method: "PUT",
        query: { status: "published" },
        body: { data },
    });
    return data;
}
