// Recruitly pipeline entry → portal stage (Q7), as agreed with Matchworkers
// on 4 Nov 2026. Pure functions: no Recruitly or Strapi calls.
//
// Stored portal values match what the portal already saves in
// candidateProcessList ("Hired Candidate" is shown as "Offered").
// The editable mapping table in the Strapi admin replaces SUB_STAGE_TO_PORTAL
// later; the rules below stay.

export const PORTAL_STAGE = {
    SUGGESTED: "Suggested Candidate",
    SHORTLISTED: "Shortlisted Candidate",
    REQUESTED_INTERVIEW: "Requested Interview",
    INTERVIEWED: "Interviewed",
    OFFERED: "Hired Candidate",
    IMMIGRATION: "Immigration",
    PLACED: "Placed",
};

// What the import does with an entry.
export const ACTION = {
    SHOW: "show", // imported, client sees it at portalStage
    HIDE: "hide", // not shown to the client yet (before Sent to Client)
    REMOVE: "remove", // rejected or placement ended: hidden, record and files kept
};

export const PLACEMENT_LANDED_WORKING = "Landed - Working with our client";

// Recruitly sub-stage name → portal stage. null = not shown yet.
const SUB_STAGE_TO_PORTAL = {
    "spec send": null,
    "matching": null,
    "sent to client": PORTAL_STAGE.SUGGESTED,
    "viewed by client": PORTAL_STAGE.SUGGESTED,
    "feedback received": PORTAL_STAGE.SHORTLISTED,
    "selecting": PORTAL_STAGE.SHORTLISTED,
    "arranging interview": PORTAL_STAGE.REQUESTED_INTERVIEW,
    "1st interview done": PORTAL_STAGE.INTERVIEWED,
    "2nd interview done": PORTAL_STAGE.INTERVIEWED,
    "offer pending": PORTAL_STAGE.OFFERED,
    "offer received from client": PORTAL_STAGE.OFFERED,
    "offer accepted by candidate/2nd payment made": PORTAL_STAGE.OFFERED,
    "offering": PORTAL_STAGE.OFFERED,
    "wp submitted": PORTAL_STAGE.IMMIGRATION,
    "wp accepted": PORTAL_STAGE.IMMIGRATION,
};

// Main stage (Recruitly status code) when the entry has no sub-stage: treated
// as the general sub-stage of the same name. SOURCED and APPLIED (Sourcing,
// Preparing) are never shown; every Immigration sub-stage maps to Immigration.
const STATUS_DEFAULT = {
    SOURCED: null,
    APPLIED: null,
    SHORTLIST: null,
    CV_SENT: PORTAL_STAGE.SHORTLISTED,
    INTERVIEW: PORTAL_STAGE.OFFERED,
    OFFER: PORTAL_STAGE.IMMIGRATION,
};

const ALWAYS_HIDDEN_STATUSES = new Set(["SOURCED", "APPLIED"]);

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[–—]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
}

function result(action, portalStage, reason) {
    return { action, portalStage, reason };
}

// entry: { status, stage, rejected } from the Recruitly pipeline.
// placementStatus: the placement's status name for this candidate and job,
// or null when there is no placement. Only used for PLACED entries.
export function mapPipelineEntry(entry, { placementStatus = null } = {}) {
    const status = String(entry?.status || "").toUpperCase();
    const subStage = normalize(entry?.stage);

    if (entry?.rejected === true) {
        return result(ACTION.REMOVE, null, "Rejected in Recruitly");
    }

    if (status === "PLACED") {
        if (!placementStatus) {
            return result(ACTION.SHOW, PORTAL_STAGE.IMMIGRATION, "Placed, no placement record yet");
        }
        if (normalize(placementStatus) === normalize(PLACEMENT_LANDED_WORKING)) {
            return result(ACTION.SHOW, PORTAL_STAGE.PLACED, "");
        }
        return result(ACTION.REMOVE, null, `Placement status: ${placementStatus}`);
    }

    if (ALWAYS_HIDDEN_STATUSES.has(status)) {
        return result(ACTION.HIDE, null, "Before Sent to Client");
    }

    if (subStage && subStage in SUB_STAGE_TO_PORTAL) {
        const portalStage = SUB_STAGE_TO_PORTAL[subStage];
        return portalStage
            ? result(ACTION.SHOW, portalStage, "")
            : result(ACTION.HIDE, null, "Before Sent to Client");
    }

    if (!subStage || status === "OFFER") {
        if (status in STATUS_DEFAULT) {
            const portalStage = STATUS_DEFAULT[status];
            return portalStage
                ? result(ACTION.SHOW, portalStage, "")
                : result(ACTION.HIDE, null, "Before Sent to Client");
        }
    }

    return result(ACTION.HIDE, null, `Not in the stage mapping: ${entry?.stage || status || "unknown"}`);
}

// Placement status for one candidate on one job, from listAllPlacements().
export function placementStatusFor(placements, candidateId, jobId) {
    const match = (placements || []).find(
        (p) => p?.candidateId === candidateId && p?.jobId === jobId
    );
    return match?.statusName || null;
}
