// Recruitly candidate → portal candidate fields for the import (R1, R4).
// Pure functions: no Recruitly or Strapi calls, so they can be tested offline.
// Field list = the agreed field mapping (3–4 Nov 2026, Overview approved 7 Nov).

// ISO country code (Recruitly nationalityCodes) → the portal's nationality
// list (config/enums.json "nationalities"). Unknown codes are reported, not guessed.
export const NATIONALITY_BY_CODE = {
    AD: "Andorra",
    AE: "United Arab Emirates",
    AF: "Afghanistan",
    AG: "Antigua and Barbuda",
    AL: "Albania",
    AM: "Armenia",
    AO: "Angola",
    AR: "Argentina",
    AT: "Austria",
    AU: "Australia",
    AZ: "Azerbaijan",
    BA: "Bosnia and Herzegovina",
    BB: "Barbados",
    BD: "Bangladesh",
    BE: "Belgium",
    BG: "Bulgaria",
    BH: "Bahrain",
    BI: "Burundi",
    BN: "Brunei",
    BO: "Bolivia",
    BR: "Brazil",
    BS: "Bahamas",
    BT: "Bhutan",
    BW: "Botswana",
    BY: "Belarus",
    BZ: "Belize",
    CA: "Canada",
    CD: "Congo (Democratic Republic of the)",
    CF: "Central African Republic",
    CG: "Congo (Republic of the)",
    CH: "Switzerland",
    CI: "Cote d’Ivoire",
    CL: "Chile",
    CM: "Cameroon",
    CN: "China",
    CO: "Colombia",
    CR: "Costa Rica",
    CU: "Cuba",
    CV: "Cabo Verde",
    CY: "Cyprus",
    CZ: "Czechia",
    DE: "Germany",
    DJ: "Djibouti",
    DK: "Denmark",
    DM: "Dominica",
    DO: "Dominican Republic",
    DY: "Benin",
    DZ: "Algeria",
    EC: "Ecuador",
    EE: "Estonia",
    EG: "Egypt",
    ER: "Eritrea",
    ES: "Spain",
    ET: "Ethiopia",
    FI: "Finland",
    FJ: "Fiji",
    FM: "Micronesia",
    FX: "France",
    GA: "Gabon",
    GD: "Grenada",
    GE: "Georgia",
    GH: "Ghana",
    GM: "Gambia",
    GN: "Guinea",
    GQ: "Equatorial Guinea",
    GR: "Greece",
    GT: "Guatemala",
    GW: "Guinea-Bissau",
    GY: "Guyana",
    HN: "Honduras",
    HR: "Croatia",
    HT: "Haiti",
    HU: "Hungary",
    HV: "Burkina Faso",
    ID: "Indonesia",
    IE: "Ireland",
    IN: "India",
    IQ: "Iraq",
    IR: "Iran",
    IS: "Iceland",
    IT: "Italy",
    JM: "Jamaica",
    JO: "Jordan",
    JP: "Japan",
    KE: "Kenya",
    KG: "Kyrgyzstan",
    KH: "Cambodia",
    KI: "Kiribati",
    KM: "Comoros",
    KN: "Saint Kitts and Nevis",
    KP: "Korea (North)",
    KR: "Korea (South)",
    KW: "Kuwait",
    KZ: "Kazakhstan",
    LA: "Laos",
    LB: "Lebanon",
    LC: "Saint Lucia",
    LI: "Liechtenstein",
    LK: "Sri Lanka",
    LR: "Liberia",
    LS: "Lesotho",
    LT: "Lithuania",
    LU: "Luxembourg",
    LV: "Latvia",
    LY: "Libya",
    MA: "Morocco",
    MC: "Monaco",
    MD: "Moldova",
    ME: "Montenegro",
    MG: "Madagascar",
    MH: "Marshall Islands",
    MK: "North Macedonia",
    ML: "Mali",
    MM: "Myanmar",
    MN: "Mongolia",
    MR: "Mauritania",
    MT: "Malta",
    MU: "Mauritius",
    MV: "Maldives",
    MW: "Malawi",
    MX: "Mexico",
    MY: "Malaysia",
    MZ: "Mozambique",
    NA: "Namibia",
    NE: "Niger",
    NG: "Nigeria",
    NI: "Nicaragua",
    NL: "Netherlands",
    NO: "Norway",
    NP: "Nepal",
    NR: "Nauru",
    NZ: "New Zealand",
    OM: "Oman",
    PA: "Panama",
    PE: "Peru",
    PG: "Papua New Guinea",
    PH: "Philippines",
    PK: "Pakistan",
    PL: "Poland",
    PS: "Palestine",
    PT: "Portugal",
    PW: "Palau",
    PY: "Paraguay",
    QA: "Qatar",
    RO: "Romania",
    RW: "Rwanda",
    SA: "Saudi Arabia",
    SB: "Solomon Islands",
    SC: "Seychelles",
    SD: "Sudan",
    SE: "Sweden",
    SG: "Singapore",
    SI: "Slovenia",
    SK: "Slovakia",
    SL: "Sierra Leone",
    SM: "San Marino",
    SN: "Senegal",
    SO: "Somalia",
    SR: "Suriname",
    SS: "South Sudan",
    ST: "Sao Tome and Principe",
    SU: "Russia",
    SV: "El Salvador",
    SY: "Syria",
    SZ: "Eswatini",
    TD: "Chad",
    TG: "Togo",
    TH: "Thailand",
    TJ: "Tajikistan",
    TM: "Turkmenistan",
    TN: "Tunisia",
    TO: "Tonga",
    TP: "Timor-Leste",
    TR: "Turkey",
    TT: "Trinidad and Tobago",
    TV: "Tuvalu",
    TW: "Taiwan",
    TZ: "Tanzania",
    UA: "Ukraine",
    UG: "Uganda",
    UK: "United Kingdom",
    US: "United States",
    UY: "Uruguay",
    UZ: "Uzbekistan",
    VA: "Vatican City",
    VC: "Saint Vincent and the Grenadines",
    VE: "Venezuela",
    VN: "Vietnam",
    VU: "Vanuatu",
    WS: "Samoa",
    XK: "Kosovo",
    YE: "Yemen",
    YU: "Serbia",
    ZA: "South Africa",
    ZM: "Zambia",
    ZW: "Zimbabwe",
};

export const PORTAL_GENDERS = ["Male", "Female", "Undisclosed"];

function text(value) {
    return String(value ?? "").trim();
}

export function normalizeEmail(value) {
    return text(value).toLowerCase();
}

// Digits only; "+91 98765-43210" → "919876543210".
export function phoneDigits(value) {
    return text(value).replace(/\D/g, "");
}

// Two numbers are the same phone when their digits match, or when both have
// at least 9 digits and the last 9 match (country code written differently).
export function samePhone(a, b) {
    const x = phoneDigits(a);
    const y = phoneDigits(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return x.length >= 9 && y.length >= 9 && x.slice(-9) === y.slice(-9);
}

const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

// Recruitly's Overview is HTML. Keep the words and line breaks, drop the tags.
export function htmlToText(html) {
    const withBreaks = text(html)
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
        .replace(/<\s*li[^>]*>/gi, "- ")
        .replace(/<[^>]*>/g, "")
        .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

    return withBreaks
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function mapGender(value) {
    const wanted = text(value).toLowerCase();
    if (!wanted) return { value: "", note: "" };
    const match = PORTAL_GENDERS.find((g) => g.toLowerCase() === wanted);
    return match ? { value: match, note: "" } : { value: "", note: `Gender "${text(value)}" is not in the portal list` };
}

// The portal holds one nationality. With two in Recruitly, the first is kept and
// the other is reported until Matchworkers decides how to show both.
export function mapNationality(codes, names = []) {
    const list = (Array.isArray(codes) ? codes : []).map((c) => text(c).toUpperCase()).filter(Boolean);
    if (list.length === 0) {
        const named = (Array.isArray(names) ? names : []).map(text).filter(Boolean);
        return { value: "", note: named.length ? `Nationality "${named.join(", ")}" has no country code` : "" };
    }

    const mapped = list.map((code) => ({ code, name: NATIONALITY_BY_CODE[code] || "" }));
    const known = mapped.filter((m) => m.name);
    const notes = [];

    for (const m of mapped) if (!m.name) notes.push(`Nationality code ${m.code} is not in the portal list`);
    if (known.length > 1) notes.push(`Two nationalities in Recruitly (${known.map((m) => m.name).join(", ")}); kept ${known[0].name}`);

    return { value: known[0]?.name || "", note: notes.join("; ") };
}

export function parseYears(value) {
    const m = text(value).replace(",", ".").match(/\d+(\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) && n >= 0 && n < 80 ? n : null;
}

// candidate = toImportCandidate(profile) plus email/mobile. Returns the portal
// fields to write (empty values left out, so an update never blanks a field
// staff filled in) and notes for the import report.
export function toPortalCandidate(candidate) {
    const notes = [];
    const gender = mapGender(candidate?.gender);
    const nationality = mapNationality(candidate?.nationalityCodes, candidate?.nationalities);
    if (gender.note) notes.push(gender.note);
    if (nationality.note) notes.push(nationality.note);

    const years = parseYears(candidate?.yearsOfExperience);
    const data = {
        recruitlyId: text(candidate?.recruitlyId),
        caNumber: text(candidate?.reference),
        fullName: text(candidate?.fullName),
        firstName: text(candidate?.firstName),
        lastName: text(candidate?.lastName),
        mobile: text(candidate?.mobile),
        genderList: gender.value,
        nationalityList: nationality.value,
        shortSummary: htmlToText(candidate?.overview),
        numberOfExperience: years,
        workingVideoLink: text(candidate?.workingVideoLink),
    };

    for (const key of Object.keys(data)) {
        if (data[key] === "" || data[key] === null) delete data[key];
    }

    return { data, notes };
}
