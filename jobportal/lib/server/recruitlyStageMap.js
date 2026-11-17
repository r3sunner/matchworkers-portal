// Editable stage mapping (Q7): the "Recruitly Stage Mapping" table in the
// Strapi admin, one row per Recruitly pipeline sub-stage, matched by the
// Recruitly stage ID.
//
// Pipeline entries only carry the stage name, so each import reads Recruitly's
// stage list (id + current name; 1 call, cached 5 minutes) to turn names into
// IDs. Effects:
//   - a stage renamed in Recruitly keeps its mapping (same ID); the row's
//     name is updated to the new one;
//   - a stage added in Recruitly gets a row with Portal Stage empty, which
//     means "the agreed default" until staff choose one;
//   - the first time the table is used it is filled with the 63 sub-stages
//     and the mapping agreed on 4 Nov 2026, so a release needs no manual step.
// Rejected and Placed rules stay in recruitlyStages.js; Sourcing/Preparing rows
// start as "Not shown" and can be changed like any other row.
// Writes the portal only; nothing changes in Recruitly.
import { strapiFetchAll, strapiRequest } from "./portalStrapi.js";
import { getMasterdataCached } from "./recruitly.js";
import { RECRUITLY_STAGES } from "./recruitlyStageList.js";
import { PORTAL_STAGE, defaultPortalStage, normalizeStageName } from "./recruitlyStages.js";

const PATH = "/recruitly-stage-maps";
const LOOKUP_CACHE_MS = 60 * 1000;

// Table value (Strapi enum) ↔ value the portal stores in candidateProcessList.
export const TABLE_STAGE = {
    "Not shown": null,
    Suggested: PORTAL_STAGE.SUGGESTED,
    Shortlisted: PORTAL_STAGE.SHORTLISTED,
    "Requested Interview": PORTAL_STAGE.REQUESTED_INTERVIEW,
    Interviewed: PORTAL_STAGE.INTERVIEWED,
    Offered: PORTAL_STAGE.OFFERED,
    Immigration: PORTAL_STAGE.IMMIGRATION,
};

export function tableValueFor(portalStage) {
    if (!portalStage) return "Not shown";
    return Object.keys(TABLE_STAGE).find((k) => TABLE_STAGE[k] === portalStage) || "Not shown";
}

const ROW_NOTE = {
    SOURCED: "Agreed 4 Nov: not shown (before Sent to Client). Choose a portal stage only if clients should see candidates at this stage.",
    APPLIED: "Agreed 4 Nov: not shown (before Sent to Client). Choose a portal stage only if clients should see candidates at this stage.",
    PLACED: "Decided by the placement status (Landed - Working = Placed); this row is not used.",
};

// Rows for the first fill: every known sub-stage with the agreed mapping.
export function initialRows(stages = RECRUITLY_STAGES) {
    return stages.map((s) => ({
        stageId: s.id,
        stageName: s.name,
        recruitlyStatus: s.status,
        portalStage: ROW_NOTE[s.status] ? "Not shown" : tableValueFor(defaultPortalStage(s.name, s.status)),
        note: ROW_NOTE[s.status] || null,
    }));
}

// What to write so the table follows Recruitly's current stage list:
// renamed rows and rows for new stages. Pure.
export function syncChanges(rows, recruitlyStages, today = new Date().toISOString().slice(0, 10)) {
    const byId = new Map((rows || []).map((r) => [r.stageId, r]));
    const renames = [];
    const added = [];
    for (const s of recruitlyStages || []) {
        const id = String(s?.id || "");
        const name = String(s?.name || "").trim();
        if (!id || !name) continue;
        const row = byId.get(id);
        if (!row) {
            added.push({
                stageId: id,
                stageName: name,
                portalStage: null,
                note: `New in Recruitly (found ${today}). Portal Stage empty = agreed default; choose one if needed.`,
            });
        } else if (String(row.stageName || "").trim() !== name) {
            renames.push({ row, stageName: name, note: `Renamed in Recruitly on ${today} (was "${row.stageName}").` });
        }
    }
    return { renames, added };
}

// Map of normalised sub-stage name → portal stage (null = not shown), for
// mapPipelineEntry. Rows with Portal Stage empty are left out (defaults apply).
// The current Recruitly name is used when known, so a rename keeps working
// even before the row's name is updated. Only rows whose stage ID Recruitly
// knows count: a row typed in by hand in the admin is ignored. When Recruitly's
// stage list could not be read, the IDs known at build time are used. Pure.
export function buildStageLookup(rows, recruitlyStages) {
    const known = recruitlyStages?.length ? recruitlyStages : RECRUITLY_STAGES;
    const currentName = new Map(known.map((s) => [String(s?.id || ""), s?.name]));
    const lookup = new Map();
    for (const r of rows || []) {
        if (!r?.portalStage || !(r.portalStage in TABLE_STAGE)) continue;
        if (!currentName.has(String(r.stageId || ""))) continue;
        const name = normalizeStageName(currentName.get(r.stageId) || r.stageName);
        if (name) lookup.set(name, TABLE_STAGE[r.portalStage]);
    }
    return lookup;
}

async function readRows() {
    return strapiFetchAll(PATH, { fields: ["documentId", "stageId", "stageName", "recruitlyStatus", "portalStage"] });
}

async function createRow(data) {
    try {
        await strapiRequest(PATH, { method: "POST", body: { data } });
    } catch (error) {
        // Another request added the same stage first (stageId is unique).
        if (error?.status !== 400) throw error;
    }
}

async function loadLookup({ counter } = {}) {
    let rows = await readRows();
    if (rows.length === 0) {
        for (const data of initialRows()) await createRow(data);
        rows = await readRows();
        console.log(`[RECRUITLY_STAGES] Stage mapping table filled with ${rows.length} rows`);
    }

    let recruitlyStages = null;
    try {
        const md = await getMasterdataCached({ counter });
        recruitlyStages = Array.isArray(md?.jobPipelineStages) ? md.jobPipelineStages : null;
    } catch (error) {
        // Recruitly's stage list is only needed for renames; the stored names still work.
        console.error("[RECRUITLY_STAGES] Stage list not read:", error?.message);
    }

    if (recruitlyStages?.length) {
        const { renames, added } = syncChanges(rows, recruitlyStages);
        try {
            for (const r of renames) {
                await strapiRequest(`${PATH}/${r.row.documentId}`, { method: "PUT", body: { data: { stageName: r.stageName, note: r.note } } });
            }
            for (const data of added) await createRow(data);
            if (renames.length || added.length) {
                console.log(`[RECRUITLY_STAGES] Stage mapping table: ${renames.length} renamed, ${added.length} added`);
            }
        } catch (error) {
            console.error("[RECRUITLY_STAGES] Table update failed:", error?.message);
        }
    }

    return buildStageLookup(rows, recruitlyStages);
}

// Shared by all routes for a minute (Next.js bundles routes separately).
const cache = (globalThis.__recruitlyStageLookup ??= { at: 0, value: null });

export async function loadStageLookup({ counter, fresh = false } = {}) {
    if (!fresh && cache.value && Date.now() - cache.at < LOOKUP_CACHE_MS) return cache.value;
    const value = loadLookup({ counter });
    cache.value = value;
    cache.at = Date.now();
    try {
        return await value;
    } catch (error) {
        cache.value = null;
        throw error;
    }
}
