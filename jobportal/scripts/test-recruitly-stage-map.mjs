// Offline tests for the editable stage mapping table (lib/server/recruitlyStageMap.js).
// Run from jobportal/:  node --test scripts/test-recruitly-stage-map.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.STRAPI_BASE_URL = "http://strapi.test/api";
process.env.STRAPI_TOKEN = "FAKE-TOKEN";

const { initialRows, buildStageLookup, syncChanges, tableValueFor } = await import("../lib/server/recruitlyStageMap.js");
const { mapPipelineEntry, PORTAL_STAGE, ACTION } = await import("../lib/server/recruitlyStages.js");
const { RECRUITLY_STAGES } = await import("../lib/server/recruitlyStageList.js");

const rows = initialRows();
const row = (name) => rows.find((r) => r.stageName === name);
const map = (status, stage, stageLookup, extra = {}) => mapPipelineEntry({ status, stage, ...extra }, { stageLookup });

test("first fill: all 63 sub-stages with the mapping agreed on 4 Nov", () => {
    assert.equal(rows.length, 63);
    assert.equal(new Set(rows.map((r) => r.stageId)).size, 63, "IDs unique");
    assert.equal(row("Spec Send").portalStage, "Not shown");
    assert.equal(row("Sent to Client").portalStage, "Suggested");
    assert.equal(row("Viewed By Client").portalStage, "Suggested");
    assert.equal(row("Feedback Received").portalStage, "Shortlisted");
    assert.equal(row("Arranging Interview").portalStage, "Requested Interview");
    assert.equal(row("1st Interview Done").portalStage, "Interviewed");
    assert.equal(row("Offer Pending").portalStage, "Offered");
    assert.equal(row("WP Submitted").portalStage, "Immigration");
    for (const r of rows.filter((x) => x.recruitlyStatus === "OFFER")) assert.equal(r.portalStage, "Immigration", r.stageName);
    for (const r of rows.filter((x) => ["SOURCED", "APPLIED", "PLACED"].includes(x.recruitlyStatus))) {
        assert.equal(r.portalStage, "Not shown", r.stageName);
    }
    assert.match(row("Initial Call").note, /Choose a portal stage only if/);
    assert.match(row("Placed").note, /not used/);
});

test("with the unchanged table, every sub-stage maps exactly as without it", () => {
    const lookup = buildStageLookup(rows, null);
    for (const s of RECRUITLY_STAGES) {
        const [withTable, without] = [map(s.status, s.name, lookup), map(s.status, s.name, null)];
        assert.deepEqual([withTable.action, withTable.portalStage], [without.action, without.portalStage], s.name);
    }
});

test("staff change a row → the import follows the table", () => {
    const edited = rows.map((r) => (r.stageName === "Viewed By Client" ? { ...r, portalStage: "Not shown" } : r.stageName === "Selecting" ? { ...r, portalStage: "Requested Interview" } : r));
    const lookup = buildStageLookup(edited, null);
    assert.equal(map("SHORTLIST", "Viewed By Client", lookup).action, ACTION.HIDE);
    assert.equal(map("CV_SENT", "Selecting", lookup).portalStage, PORTAL_STAGE.REQUESTED_INTERVIEW);
    assert.equal(map("SHORTLIST", "Sent to Client", lookup).portalStage, PORTAL_STAGE.SUGGESTED, "others unchanged");
});

test("stage renamed in Recruitly → same ID, mapping kept", () => {
    const id = row("Feedback Received").stageId;
    const recruitly = RECRUITLY_STAGES.map((s) => ({ id: s.id, name: s.id === id ? "Client Feedback In" : s.name }));
    const edited = rows.map((r) => (r.stageId === id ? { ...r, portalStage: "Interviewed" } : r));
    const lookup = buildStageLookup(edited, recruitly);
    assert.equal(map("CV_SENT", "Client Feedback In", lookup).portalStage, PORTAL_STAGE.INTERVIEWED);

    const { renames, added } = syncChanges(rows, recruitly, "2026-11-16");
    assert.equal(added.length, 0);
    assert.equal(renames.length, 1);
    assert.equal(renames[0].stageName, "Client Feedback In");
    assert.match(renames[0].note, /was "Feedback Received"/);
});

test("new stage in Recruitly → row added with Portal Stage empty (default applies)", () => {
    const recruitly = [...RECRUITLY_STAGES.map((s) => ({ id: s.id, name: s.name })), { id: "new-1", name: "Visa Collected" }];
    const { renames, added } = syncChanges(rows, recruitly, "2026-11-16");
    assert.equal(renames.length, 0);
    assert.deepEqual(added.map((a) => [a.stageId, a.stageName, a.portalStage]), [["new-1", "Visa Collected", null]]);
    const lookup = buildStageLookup([...rows, added[0]], recruitly);
    assert.equal(lookup.has("visa collected"), false);
    assert.equal(map("OFFER", "Visa Collected", lookup).portalStage, PORTAL_STAGE.IMMIGRATION, "Immigration default");
    assert.equal(map("SHORTLIST", "Visa Collected", lookup).action, ACTION.HIDE, "unknown elsewhere stays hidden");
});

test("Sourcing and Preparing follow the table; rejected and Placed stay fixed", () => {
    const edited = rows.map((r) => ({ ...r, portalStage: "Suggested" }));
    const lookup = buildStageLookup(edited, null);
    assert.equal(map("SOURCED", "Initial Call", lookup).portalStage, PORTAL_STAGE.SUGGESTED, "Sourcing shown when the team chooses");
    assert.equal(map("APPLIED", "Ready to Send", lookup).portalStage, PORTAL_STAGE.SUGGESTED, "Preparing shown when the team chooses");
    const unchanged = buildStageLookup(rows, null);
    const hidden = map("SOURCED", "Initial Call", unchanged);
    assert.deepEqual([hidden.action, hidden.reason], [ACTION.HIDE, "Before Sent to Client"], "default stays hidden");
    assert.equal(map("SHORTLIST", "Sent to Client", lookup, { rejected: true }).action, ACTION.REMOVE);
    assert.equal(map("PLACED", "Placed", lookup).portalStage, PORTAL_STAGE.IMMIGRATION, "Placed still follows the placement rule");
});

test("unknown or empty table values are ignored", () => {
    const id = (name) => row(name).stageId;
    const lookup = buildStageLookup([{ stageId: id("Sent to Client"), stageName: "Sent to Client", portalStage: "Bogus" }, { stageId: id("Selecting"), stageName: "Selecting", portalStage: null }], null);
    assert.equal(lookup.size, 0);
    assert.equal(tableValueFor(PORTAL_STAGE.OFFERED), "Offered");
    assert.equal(tableValueFor(null), "Not shown");
});

test("a row typed in by hand (stage ID Recruitly doesn't know) is ignored", () => {
    const handMade = { stageId: "typed-by-hand", stageName: "Sent to Client", portalStage: "Not shown" };
    for (const recruitly of [null, RECRUITLY_STAGES.map((s) => ({ id: s.id, name: s.name }))]) {
        const lookup = buildStageLookup([...rows, handMade], recruitly);
        assert.equal(map("SHORTLIST", "Sent to Client", lookup).portalStage, PORTAL_STAGE.SUGGESTED, "real row wins");
        const alone = buildStageLookup([handMade], recruitly);
        assert.equal(alone.size, 0);
    }
});
