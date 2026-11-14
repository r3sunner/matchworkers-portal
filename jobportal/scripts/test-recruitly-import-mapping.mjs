// Offline tests for the Recruitly → portal field mapping (no network).
// Run: node --test scripts/test-recruitly-import-mapping.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    NATIONALITY_BY_CODE,
    htmlToText,
    mapGender,
    mapNationality,
    parseYears,
    phoneDigits,
    samePhone,
    toPortalCandidate,
} from "../lib/server/recruitlyImportMapping.js";

const ENUMS = JSON.parse(readFileSync(new URL("../config/enums.json", import.meta.url), "utf8"));

test("every nationality code maps to a name in the portal list", () => {
    const portal = new Set(ENUMS.nationalities);
    for (const [code, name] of Object.entries(NATIONALITY_BY_CODE)) {
        assert.ok(portal.has(name), `${code} → ${name} not in portal list`);
    }
    // Every portal country except "Other" has a code.
    const mapped = new Set(Object.values(NATIONALITY_BY_CODE));
    const missing = ENUMS.nationalities.filter((n) => n !== "Other" && !mapped.has(n));
    assert.deepEqual(missing, []);
});

test("nationality by code; two nationalities keep the first and say so", () => {
    assert.deepEqual(mapNationality(["NP"]), { value: "Nepal", note: "" });
    assert.deepEqual(mapNationality(["np"]), { value: "Nepal", note: "" });
    const two = mapNationality(["IN", "NP"]);
    assert.equal(two.value, "India");
    assert.match(two.note, /Two nationalities.*India, Nepal/);
    assert.equal(mapNationality(["KR"]).value, "Korea (South)");
    assert.equal(mapNationality(["TR"]).value, "Turkey");
});

test("unknown or missing nationality is reported, never guessed", () => {
    const unknown = mapNationality(["QQ"]);
    assert.equal(unknown.value, "");
    assert.match(unknown.note, /QQ is not in the portal list/);
    assert.deepEqual(mapNationality([]), { value: "", note: "" });
    assert.match(mapNationality([], ["Nepali, Nepalese"]).note, /has no country code/);
});

test("gender matches the portal list only", () => {
    assert.deepEqual(mapGender("male"), { value: "Male", note: "" });
    assert.deepEqual(mapGender("Female"), { value: "Female", note: "" });
    assert.deepEqual(mapGender(""), { value: "", note: "" });
    assert.equal(mapGender("Other").value, "");
    assert.match(mapGender("Other").note, /not in the portal list/);
});

test("overview HTML becomes plain text with line breaks", () => {
    assert.equal(htmlToText("<p>Hello&nbsp;<b>world</b></p><p>Line&amp;two</p>"), "Hello world\nLine&two");
    assert.equal(htmlToText("<ul><li>One</li><li>Two</li></ul>"), "- One\n- Two");
    assert.equal(htmlToText("a<br>b<br/>c"), "a\nb\nc");
    assert.equal(htmlToText(""), "");
    assert.equal(htmlToText("<script>x</script>ok"), "xok");
});

test("phone numbers compare by digits, tolerant of country code formatting", () => {
    assert.equal(phoneDigits("+91 98765-43210"), "919876543210");
    assert.ok(samePhone("+91 98765 43210", "0091-98765-43210"));
    assert.ok(samePhone("+91 98765 43210", "9876543210"));
    assert.ok(!samePhone("+91 98765 43210", "+91 98765 43211"));
    assert.ok(!samePhone("", "9876543210"));
    assert.ok(!samePhone("12345", "912345"), "short numbers need an exact match");
});

test("years of experience parsed safely", () => {
    assert.equal(parseYears("5"), 5);
    assert.equal(parseYears("3,5 years"), 3.5);
    assert.equal(parseYears(""), null);
    assert.equal(parseYears("n/a"), null);
    assert.equal(parseYears("150"), null);
});

test("portal fields: empty values left out so an update never blanks staff data", () => {
    const { data, notes } = toPortalCandidate({
        recruitlyId: "abc123",
        reference: "CA-114061",
        fullName: "Test Candidate One",
        firstName: "Test",
        lastName: "One",
        gender: "Male",
        nationalityCodes: ["NP"],
        overview: "<p>Hard worker</p>",
        yearsOfExperience: "",
        workingVideoLink: "",
        mobile: "+91 98765 43210",
        email: "someone@example.test",
    });
    assert.deepEqual(data, {
        recruitlyId: "abc123",
        caNumber: "CA-114061",
        fullName: "Test Candidate One",
        firstName: "Test",
        lastName: "One",
        genderList: "Male",
        nationalityList: "Nepal",
        shortSummary: "Hard worker",
    });
    assert.deepEqual(notes, []);
    assert.ok(!("referenceNumber" in data), "import never writes CAN_ references");
    assert.ok(!("mobile" in data) && !("email" in data), "contact details are compared, never copied");
});

// ---- Step 5 fields: dates, marital status, English level, companies, experience ----
import { employmentFacts, mapEnglishLevel, mapMaritalStatus, parseRecruitlyDate } from "../lib/server/recruitlyImportMapping.js";

test("Recruitly dates in every known format become yyyy-mm-dd", () => {
    assert.equal(parseRecruitlyDate("05/03/1990"), "1990-03-05", "dd/mm/yyyy (day first)");
    assert.equal(parseRecruitlyDate("05/03/1990 00:00:00"), "1990-03-05");
    assert.equal(parseRecruitlyDate("1990-03-05"), "1990-03-05");
    assert.equal(parseRecruitlyDate("1990-03-05T00:00:00.000Z"), "1990-03-05");
    assert.equal(parseRecruitlyDate(Date.UTC(1990, 2, 5)), "1990-03-05");
    for (const bad of ["", null, undefined, "not a date", "31/13/1990", "01/01/1800"]) assert.equal(parseRecruitlyDate(bad), "", String(bad));
});

test("marital status matches the portal list (same values in both systems)", () => {
    for (const v of ["Single", "married", "Divorced", "Widowed"]) assert.ok(mapMaritalStatus(v).value);
    assert.deepEqual(mapMaritalStatus(""), { value: "", note: "" });
    assert.match(mapMaritalStatus("Engaged").note, /not in the portal list/);
});

test("English level: only exact matches filled until Good/Poor are decided", () => {
    assert.deepEqual(mapEnglishLevel("Basic"), { value: "Basic", note: "" });
    assert.equal(mapEnglishLevel("Good").value, "");
    assert.match(mapEnglishLevel("Good").note, /no portal match yet/);
    assert.equal(mapEnglishLevel("Poor").value, "");
});

test("employment history: current company, previous company, experience in years", () => {
    const f = employmentFacts([
        { companyName: "Old Hotel", startDate: "01/01/2015", endDate: "01/01/2018", current: false },
        { companyName: "Recent Farm", startDate: "01/02/2018", endDate: "01/02/2021", current: false },
        { companyName: "Now Ltd", startDate: "2021-03-01", endDate: null, current: true },
    ]);
    assert.equal(f.currentCompany, "Now Ltd");
    assert.equal(f.previousCompany, "Recent Farm", "most recent finished job");
    assert.equal(f.previousJobYears, 3);
    assert.ok(f.currentJobYears >= 5, "current job counts to today");
    assert.ok(f.totalYears >= 11);
    const none = employmentFacts([{ companyName: "", startDate: null, endDate: null, current: false }], "From Employer");
    assert.deepEqual(none, { currentCompany: "From Employer", previousCompany: "", currentJobYears: null, previousJobYears: null, totalYears: null });
});

test("Years of Experience: Matchworkers' field first, calculated only when empty", async () => {
    const { toPortalCandidate } = await import("../lib/server/recruitlyImportMapping.js");
    const history = [{ companyName: "A", startDate: "01/01/2010", endDate: "01/01/2014", current: false }];
    assert.equal(toPortalCandidate({ recruitlyId: "x", yearsOfExperience: "7", employmentHistory: history }).data.numberOfExperience, 7);
    assert.equal(toPortalCandidate({ recruitlyId: "x", yearsOfExperience: "", employmentHistory: history }).data.numberOfExperience, 4);
});

test("all step-5 fields reach the portal names from the field mapping", async () => {
    const { toPortalCandidate } = await import("../lib/server/recruitlyImportMapping.js");
    const { data, notes } = toPortalCandidate({
        recruitlyId: "r1",
        dateOfBirth: "05/03/1990",
        maritalStatus: "Married",
        englishLevel: "Basic",
        miInterviewLink: "https://sharepoint/mi",
        screeningDate: "12/10/2026",
        currentEmployer: "Now Ltd",
        employmentHistory: [{ companyName: "Before Co", startDate: "01/01/2019", endDate: "31/12/2020", current: false }],
    });
    assert.equal(data.birthDate, "1990-03-05");
    assert.equal(data.maritalStatusList, "Married");
    assert.equal(data.englishLevelList, "Basic");
    assert.equal(data.miScreeningVideoLink, "https://sharepoint/mi");
    assert.equal(data.dateScreeningInterview, "2026-10-12");
    assert.equal(data.currentCompany, "Now Ltd");
    assert.equal(data.previousCompany, "Before Co");
    assert.equal(data.previousJobExperiece, 2);
    assert.deepEqual(notes, []);
});
