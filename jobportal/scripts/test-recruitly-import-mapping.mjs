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
        mobile: "",
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
});
