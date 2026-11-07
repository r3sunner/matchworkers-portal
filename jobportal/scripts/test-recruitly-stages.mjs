// Offline checks for lib/server/recruitlyStages.js (Q7 stage mapping).
// Run from jobportal/:  node --test scripts/test-recruitly-stages.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

const { mapPipelineEntry, placementStatusFor, PORTAL_STAGE, ACTION, PLACEMENT_LANDED_WORKING } =
    await import("../lib/server/recruitlyStages.js");

const map = (status, stage, extra = {}, options) => mapPipelineEntry({ status, stage, ...extra }, options);

test("sub-stages map as agreed on 4 Nov", () => {
    const cases = [
        ["SHORTLIST", "Sent to Client", PORTAL_STAGE.SUGGESTED],
        ["SHORTLIST", "Viewed By Client", PORTAL_STAGE.SUGGESTED],
        ["CV_SENT", "Feedback Received", PORTAL_STAGE.SHORTLISTED],
        ["CV_SENT", "Selecting", PORTAL_STAGE.SHORTLISTED],
        ["CV_SENT", "Arranging Interview", PORTAL_STAGE.REQUESTED_INTERVIEW],
        ["CV_SENT", "1st Interview Done", PORTAL_STAGE.INTERVIEWED],
        ["CV_SENT", "2nd Interview Done", PORTAL_STAGE.INTERVIEWED],
        ["INTERVIEW", "Offer Pending", PORTAL_STAGE.OFFERED],
        ["INTERVIEW", "Offer Received From Client", PORTAL_STAGE.OFFERED],
        ["INTERVIEW", "Offer Accepted by Candidate/2nd Payment Made", PORTAL_STAGE.OFFERED],
        ["INTERVIEW", "Offering", PORTAL_STAGE.OFFERED],
        ["INTERVIEW", "WP Submitted", PORTAL_STAGE.IMMIGRATION],
        ["INTERVIEW", "WP Accepted", PORTAL_STAGE.IMMIGRATION],
        ["OFFER", "Visa Approved", PORTAL_STAGE.IMMIGRATION],
        ["OFFER", "Greece – Visa Appointment", PORTAL_STAGE.IMMIGRATION],
    ];
    for (const [status, stage, expected] of cases) {
        const r = map(status, stage);
        assert.equal(r.action, ACTION.SHOW, `${stage} should be shown`);
        assert.equal(r.portalStage, expected, stage);
    }
});

test("everything before Sent to Client is hidden", () => {
    for (const [status, stage] of [
        ["SOURCED", "Initial Call"],
        ["SOURCED", ""],
        ["APPLIED", "Full Candidate Profile Available"],
        ["APPLIED", ""],
        ["SHORTLIST", "Spec Send"],
        ["SHORTLIST", "Matching"],
    ]) {
        const r = map(status, stage);
        assert.equal(r.action, ACTION.HIDE, `${status}/${stage}`);
        assert.equal(r.portalStage, null);
    }
});

test("no sub-stage follows the general sub-stage of the same name", () => {
    assert.equal(map("SHORTLIST", "").action, ACTION.HIDE);
    assert.equal(map("CV_SENT", "").portalStage, PORTAL_STAGE.SHORTLISTED);
    assert.equal(map("INTERVIEW", null).portalStage, PORTAL_STAGE.OFFERED);
    assert.equal(map("OFFER", "").portalStage, PORTAL_STAGE.IMMIGRATION);
});

test("rejected is removed at any stage", () => {
    for (const status of ["SHORTLIST", "CV_SENT", "INTERVIEW", "OFFER", "PLACED"]) {
        const r = map(status, "Sent to Client", { rejected: true });
        assert.equal(r.action, ACTION.REMOVE, status);
    }
});

test("Placed only with Landed – Working with our client", () => {
    assert.equal(map("PLACED", "Placed", {}, { placementStatus: PLACEMENT_LANDED_WORKING }).portalStage, PORTAL_STAGE.PLACED);
    assert.equal(map("PLACED", "Placed", {}, { placementStatus: "Landed – Working with our client" }).portalStage, PORTAL_STAGE.PLACED);

    const none = map("PLACED", "Placed");
    assert.equal(none.action, ACTION.SHOW);
    assert.equal(none.portalStage, PORTAL_STAGE.IMMIGRATION);

    for (const other of ["Landed - Awaiting placement", "Landed - Self-placed", "Ended - Resigned", "Ended - Absconded"]) {
        assert.equal(map("PLACED", "Placed", {}, { placementStatus: other }).action, ACTION.REMOVE, other);
    }
});

test("unknown sub-stage is hidden and reported", () => {
    const r = map("CV_SENT", "Some New Stage");
    assert.equal(r.action, ACTION.HIDE);
    assert.match(r.reason, /Not in the stage mapping: Some New Stage/);
});

test("spelling and spacing differences still match", () => {
    assert.equal(map("shortlist", "  sent   to CLIENT ").portalStage, PORTAL_STAGE.SUGGESTED);
});

test("Jeeves's test job JB-1210 maps as expected", () => {
    const landed = PLACEMENT_LANDED_WORKING;
    assert.equal(map("SOURCED", "Sourcing").action, ACTION.HIDE); // CA-114062
    assert.equal(map("SHORTLIST", "Sent to Client").portalStage, PORTAL_STAGE.SUGGESTED); // CA-114061
    assert.equal(map("CV_SENT", "Feedback Received").portalStage, PORTAL_STAGE.SHORTLISTED); // CA-114063
    assert.equal(map("CV_SENT", "1st Interview Done").portalStage, PORTAL_STAGE.INTERVIEWED); // CA-114065
    assert.equal(map("PLACED", "Placed", {}, { placementStatus: landed }).portalStage, PORTAL_STAGE.PLACED); // CA-114064
});

test("placement lookup matches candidate and job", () => {
    const placements = [
        { candidateId: "c1", jobId: "j9", statusName: "Ended - Resigned" },
        { candidateId: "c1", jobId: "j1", statusName: PLACEMENT_LANDED_WORKING },
    ];
    assert.equal(placementStatusFor(placements, "c1", "j1"), PLACEMENT_LANDED_WORKING);
    assert.equal(placementStatusFor(placements, "c2", "j1"), null);
});
