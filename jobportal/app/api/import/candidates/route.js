export const runtime = "nodejs";

import ExcelJS from "exceljs";
import qs from "qs";
import { CreateNotification } from "@/lib/server/notification";

/* ------------------------------------------------------------------ */
/* Basic helpers */
/* ------------------------------------------------------------------ */

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}

async function readBodySafe(res) {
    const text = await res.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
}

function cleanString(v) {
    if (v === null || v === undefined) return "";

    if (typeof v === "object") {
        if (v.hyperlink) return String(v.hyperlink).trim();
        if (v.text) return String(v.text).trim();

        if (Array.isArray(v.richText)) {
            return v.richText.map((x) => x?.text || "").join("").trim();
        }

        if (v.result !== undefined) return String(v.result).trim();
    }

    return String(v).trim();
}

function normalizeHeader(v) {
    return cleanString(v)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[_-]+/g, " ")
        .trim();
}

function getFirstExisting(rowObj, names) {
    for (const name of names) {
        const key = normalizeHeader(name);

        if (Object.prototype.hasOwnProperty.call(rowObj, key)) {
            return rowObj[key];
        }
    }

    return "";
}

function isHttpUrl(v) {
    const s = cleanString(v);

    if (!s) return false;

    try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

function toNumberOrNull(v) {
    const s = cleanString(v);
    if (!s) return null;

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function toBooleanOrFalse(v) {
    const s = cleanString(v).toLowerCase();

    return (
        s === "true" ||
        s === "yes" ||
        s === "1" ||
        s === "y" ||
        s === "verified"
    );
}

function toDateOrNull(v) {
    if (!v) return null;

    if (v instanceof Date && !Number.isNaN(v.getTime())) {
        return v.toISOString().slice(0, 10);
    }

    const s = cleanString(v);
    if (!s) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const d = new Date(s);

    if (!Number.isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
    }

    return null;
}

function splitTitles(v) {
    const s = cleanString(v);
    if (!s) return [];

    return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

function makeUsernameFromEmailOrName(email, fullName) {
    const e = cleanString(email);

    if (e && e.includes("@")) {
        return e.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "");
    }

    const n = cleanString(fullName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "");

    return n || `candidate_${Date.now()}`;
}

function defaultPassword() {
    return `Candidate@${Math.floor(100000 + Math.random() * 900000)}`;
}

function unwrapCandidate(parsed) {
    const rec = parsed?.data ?? null;

    if (!rec) return null;

    if (rec?.attributes) {
        return {
            id: rec.id,
            documentId: rec.documentId ?? rec.attributes?.documentId,
            ...rec.attributes,
        };
    }

    return rec;
}

function normalizeStrapiMedia(media, STRAPI_BASE_URL) {
    const m = media?.data ?? media;
    const attrs = m?.attributes ?? m;

    const id = m?.id ?? null;
    const name = attrs?.name ?? "";
    const url = attrs?.url ?? "";

    const origin = String(STRAPI_BASE_URL || "").replace(/\/api\/?$/, "");

    const absUrl = url
        ? url.startsWith("http")
            ? url
            : joinUrl(origin, url)
        : "";

    return {
        id,
        name,
        url: absUrl,
    };
}

function getUserFromCandidate(candidate) {
    const rel = candidate?.users_permissions_user;
    const d = rel?.data ?? rel;
    const attrs = d?.attributes ?? d;

    return {
        id: d?.id ?? null,
        username: attrs?.username || "",
        email: attrs?.email || "",
    };
}

/* ------------------------------------------------------------------ */
/* Candidate data from Excel */
/* ------------------------------------------------------------------ */

function buildCandidateData(rowObj) {
    const data = {};

    const fullName = getFirstExisting(rowObj, ["Full Name", "fullName", "Name"]);
    const firstName = getFirstExisting(rowObj, ["First Name", "firstName"]);
    const lastName = getFirstExisting(rowObj, ["Last Name", "lastName"]);

    if (cleanString(fullName)) data.fullName = cleanString(fullName);
    if (cleanString(firstName)) data.firstName = cleanString(firstName);
    if (cleanString(lastName)) data.lastName = cleanString(lastName);

    const mobile = getFirstExisting(rowObj, ["Mobile", "Phone", "mobile"]);
    if (cleanString(mobile)) data.mobile = cleanString(mobile);

    const birthDate = toDateOrNull(getFirstExisting(rowObj, ["Birth Date", "birthDate"]));
    if (birthDate) data.birthDate = birthDate;

    const genderList = getFirstExisting(rowObj, ["Gender", "genderList"]);
    if (cleanString(genderList)) data.genderList = cleanString(genderList);

    const nationalityList = getFirstExisting(rowObj, ["Nationality", "nationalityList"]);
    if (cleanString(nationalityList)) data.nationalityList = cleanString(nationalityList);

    const maritalStatusList = getFirstExisting(rowObj, ["Marital Status", "maritalStatusList"]);
    if (cleanString(maritalStatusList)) data.maritalStatusList = cleanString(maritalStatusList);

    const seasonalStatusList = getFirstExisting(rowObj, ["Seasonal Status", "seasonalStatusList"]);
    if (cleanString(seasonalStatusList)) data.seasonalStatusList = cleanString(seasonalStatusList);

    const englishLevelList = getFirstExisting(rowObj, ["English Level", "englishLevelList"]);
    if (cleanString(englishLevelList)) data.englishLevelList = cleanString(englishLevelList);

    const jobStatus = getFirstExisting(rowObj, ["Job Status", "jobStatus"]);
    if (cleanString(jobStatus)) data.jobStatus = cleanString(jobStatus);

    const isProfileVerifiedList = getFirstExisting(rowObj, [
        "Profile Verified",
        "Verified",
        "isProfileVerifiedList",
    ]);
    if (cleanString(isProfileVerifiedList)) {
        data.isProfileVerifiedList = cleanString(isProfileVerifiedList);
    }

    const currentlyEmployed = getFirstExisting(rowObj, ["Currently Employed", "currentlyEmployed"]);
    if (cleanString(currentlyEmployed)) {
        data.currentlyEmployed = toBooleanOrFalse(currentlyEmployed);
    }

    const numberOfExperience = toNumberOrNull(
        getFirstExisting(rowObj, ["Number of Experience", "numberOfExperience", "Experience"])
    );
    if (numberOfExperience !== null) data.numberOfExperience = numberOfExperience;

    const shortSummary = getFirstExisting(rowObj, ["Short Summary", "shortSummary"]);
    if (cleanString(shortSummary)) data.shortSummary = cleanString(shortSummary);

    const privateNotes = getFirstExisting(rowObj, ["Private Notes", "privateNotes"]);
    if (cleanString(privateNotes)) data.privateNotes = cleanString(privateNotes);

    const currentJobExperiece = toNumberOrNull(
        getFirstExisting(rowObj, ["Current Job Experience", "currentJobExperiece"])
    );
    if (currentJobExperiece !== null) data.currentJobExperiece = currentJobExperiece;

    const previousJobExperiece = toNumberOrNull(
        getFirstExisting(rowObj, ["Previous Job Experience", "previousJobExperiece"])
    );
    if (previousJobExperiece !== null) data.previousJobExperiece = previousJobExperiece;

    const previousCompany = getFirstExisting(rowObj, ["Previous Company", "previousCompany"]);
    if (cleanString(previousCompany)) data.previousCompany = cleanString(previousCompany);

    const currentCompany = getFirstExisting(rowObj, ["Current Company", "currentCompany"]);
    if (cleanString(currentCompany)) data.currentCompany = cleanString(currentCompany);

    const dateScreeningInterview = toDateOrNull(
        getFirstExisting(rowObj, [
            "Screening Interview Date",
            "Date Screening Interview",
            "dateScreeningInterview",
        ])
    );
    if (dateScreeningInterview) data.dateScreeningInterview = dateScreeningInterview;

    const passportExpireDate = toDateOrNull(
        getFirstExisting(rowObj, [
            "Passport Expiry Date",
            "Passport Expire Date",
            "passportExpireDate",
        ])
    );
    if (passportExpireDate) data.passportExpireDate = passportExpireDate;

    const workingVideoLink = getFirstExisting(rowObj, ["Working Video Link", "workingVideoLink"]);
    if (cleanString(workingVideoLink)) data.workingVideoLink = cleanString(workingVideoLink);

    const miScreeningVideoLink = getFirstExisting(rowObj, [
        "MI Screening Video Link",
        "miScreeningVideoLink",
    ]);
    if (cleanString(miScreeningVideoLink)) {
        data.miScreeningVideoLink = cleanString(miScreeningVideoLink);
    }

    return data;
}

/* ------------------------------------------------------------------ */
/* Route */
/* ------------------------------------------------------------------ */

export async function POST(req) {
    const STRAPI_BASE_URL =
        process.env.STRAPI_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

    const RAW_TOKEN = String(
        process.env.STRAPI_TOKEN || process.env.API_TOKEN || ""
    ).trim();

    if (!STRAPI_BASE_URL || !RAW_TOKEN) {
        return Response.json(
            {
                ok: false,
                error: "Missing STRAPI_BASE_URL/NEXT_PUBLIC_API_BASE_URL or STRAPI_TOKEN/API_TOKEN",
            },
            { status: 500 }
        );
    }

    const BEARER = RAW_TOKEN.toLowerCase().startsWith("bearer ")
        ? RAW_TOKEN
        : `Bearer ${RAW_TOKEN}`;

    async function strapiFetch(pathValue, opts = {}) {
        const url = joinUrl(STRAPI_BASE_URL, pathValue);
        const method = opts.method || "GET";
        const useAuth = opts.useAuth !== false;

        const headers = {
            ...(useAuth ? { Authorization: BEARER } : {}),
            ...(opts.headers || {}),
        };

        let body = opts.body;

        if (opts.json !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(opts.json);
        }

        const res = await fetch(url, {
            method,
            headers,
            body,
            redirect: "manual",
            cache: "no-store",
        });

        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            const err = new Error(
                `Strapi redirect detected (${res.status}). Fix STRAPI_BASE_URL. location=${loc}`
            );
            err.status = 500;
            throw err;
        }

        const parsed = await readBodySafe(res);

        if (!res.ok) {
            const msg =
                parsed?.error?.message ||
                parsed?.message ||
                parsed?.raw ||
                `Strapi error: ${res.status}`;

            const err = new Error(msg);
            err.status = res.status;
            err.details = parsed?.error || parsed;
            throw err;
        }

        return parsed;
    }

    async function downloadRemoteFile(fileUrl) {
        const url = cleanString(fileUrl);

        if (!isHttpUrl(url)) return null;

        let res = await fetch(url, {
            method: "GET",
            cache: "no-store",
        });

        if (!res.ok) {
            res = await fetch(url, {
                method: "GET",
                headers: {
                    Authorization: BEARER,
                },
                cache: "no-store",
            });
        }

        if (!res.ok) {
            throw new Error(`Could not download file URL: ${url} (${res.status})`);
        }

        const arrayBuffer = await res.arrayBuffer();
        const contentType =
            res.headers.get("content-type") || "application/octet-stream";

        let filename = "";

        try {
            const u = new URL(url);
            filename = decodeURIComponent(u.pathname.split("/").pop() || "");
        } catch {
            filename = "";
        }

        if (!filename || !filename.includes(".")) {
            const ext =
                contentType.includes("png")
                    ? ".png"
                    : contentType.includes("jpeg") || contentType.includes("jpg")
                        ? ".jpg"
                        : contentType.includes("pdf")
                            ? ".pdf"
                            : contentType.includes("word")
                                ? ".docx"
                                : ".bin";

            filename = `candidate-file-${Date.now()}${ext}`;
        }

        return {
            buffer: Buffer.from(arrayBuffer),
            contentType,
            filename,
            sourceUrl: url,
        };
    }

    async function uploadFileFromUrl(fileUrl) {
        const downloaded = await downloadRemoteFile(fileUrl);

        if (!downloaded) return null;

        const fd = new FormData();

        const blob = new Blob([downloaded.buffer], {
            type: downloaded.contentType,
        });

        fd.append("files", blob, downloaded.filename);

        const res = await fetch(joinUrl(STRAPI_BASE_URL, "upload"), {
            method: "POST",
            headers: {
                Authorization: BEARER,
            },
            body: fd,
            redirect: "manual",
            cache: "no-store",
        });

        const parsed = await readBodySafe(res);

        if (!res.ok) {
            const msg =
                parsed?.error?.message ||
                parsed?.message ||
                parsed?.raw ||
                `Upload failed (${res.status})`;

            throw new Error(msg);
        }

        const uploaded = Array.isArray(parsed) ? parsed[0] : parsed?.data?.[0] || parsed;

        const uploadedId = Number(uploaded?.id);

        if (!Number.isFinite(uploadedId) || uploadedId <= 0) {
            throw new Error("Upload succeeded but file ID was not returned");
        }

        return {
            id: uploadedId,
            name: uploaded?.name || downloaded.filename,
            url: uploaded?.url || "",
        };
    }

    async function findJobRoleByTitle(title) {
        const t = cleanString(title);
        if (!t) return null;

        const query = qs.stringify(
            {
                filters: {
                    title: {
                        $eqi: t,
                    },
                },
                pagination: {
                    page: 1,
                    pageSize: 1,
                },
            },
            { encodeValuesOnly: true }
        );

        const parsed = await strapiFetch(`job-roles?${query}`, {
            method: "GET",
            useAuth: true,
        });

        const item = Array.isArray(parsed?.data) ? parsed.data[0] : null;

        if (!item) return null;

        const attrs = item?.attributes ?? item;

        return {
            id: item.id,
            title: attrs?.title || "",
        };
    }

    async function createJobRole(title) {
        const t = cleanString(title);
        if (!t) return null;

        const parsed = await strapiFetch("job-roles", {
            method: "POST",
            useAuth: true,
            json: {
                data: {
                    title: t,
                },
            },
        });

        const item = parsed?.data;
        if (!item) return null;

        const attrs = item?.attributes ?? item;

        return {
            id: item.id,
            title: attrs?.title || "",
        };
    }

    async function getOrCreateJobRoleIds(titles) {
        const ids = [];

        for (const title of titles) {
            const t = cleanString(title);
            if (!t) continue;

            let role = await findJobRoleByTitle(t);

            if (!role) {
                role = await createJobRole(t);
            }

            const id = Number(role?.id);

            if (Number.isFinite(id) && id > 0) {
                ids.push(id);
            }
        }

        return [...new Set(ids)];
    }


    async function findAgentByText(value) {
        const v = cleanString(value);
        if (!v) return null;

        // If Excel value is already a documentId, use it first.
        try {
            const byDocumentId = await strapiFetch(`agents/${v}`, {
                method: "GET",
                useAuth: true,
            });

            const rec = byDocumentId?.data || null;
            if (rec?.id) {
                const attrs = rec?.attributes ?? rec;
                return {
                    id: rec.id,
                    documentId: rec.documentId || attrs?.documentId || "",
                    companyName: attrs?.companyName || "",
                    contactName: attrs?.contactName || "",
                    designation: attrs?.designation || "",
                };
            }
        } catch {
            // ignore and search by companyName/contactName below
        }

        const query = qs.stringify(
            {
                status: "published",
                filters: {
                    $or: [
                        { companyName: { $eqi: v } },
                        { contactName: { $eqi: v } },
                    ],
                },
                pagination: { page: 1, pageSize: 1 },
            },
            { encodeValuesOnly: true }
        );

        const parsed = await strapiFetch(`agents?${query}`, {
            method: "GET",
            useAuth: true,
        });

        const item = Array.isArray(parsed?.data) ? parsed.data[0] : null;
        if (!item) return null;

        const attrs = item?.attributes ?? item;

        return {
            id: item.id,
            documentId: item.documentId || attrs?.documentId || "",
            companyName: attrs?.companyName || "",
            contactName: attrs?.contactName || "",
            designation: attrs?.designation || "",
        };
    }

    async function getCandidateByDocumentId(documentId) {
        const query = qs.stringify(
            {
                populate: {
                    profileImage: true,
                    CV: true,
                    passport: true,
                    users_permissions_user: true,
                    job_roles: true,
                    agent: true,
                    documents: {
                        populate: {
                            file: true,
                        },
                    },
                },
            },
            { encodeValuesOnly: true }
        );

        const parsed = await strapiFetch(`candidates/${documentId}?${query}`, {
            method: "GET",
            useAuth: true,
        });

        return unwrapCandidate(parsed);
    }

    async function findUserByEmail(email) {
        const e = cleanString(email);
        if (!e) return null;

        const query = qs.stringify(
            {
                filters: {
                    email: {
                        $eqi: e,
                    },
                },
                pagination: {
                    page: 1,
                    pageSize: 1,
                },
            },
            { encodeValuesOnly: true }
        );

        try {
            const parsed = await strapiFetch(`users?${query}`, {
                method: "GET",
                useAuth: true,
            });

            const user = Array.isArray(parsed)
                ? parsed[0]
                : parsed?.data?.[0] || null;

            if (!user) return null;

            const attrs = user?.attributes ?? user;

            return {
                id: user.id,
                username: attrs?.username || "",
                email: attrs?.email || "",
            };
        } catch {
            return null;
        }
    }

    async function createUserSafe({ email, username, fullName }) {
        const cleanEmail = cleanString(email);

        if (!cleanEmail) {
            return {
                ok: false,
                user: null,
                message: "No email provided, user not created",
            };
        }

        const existing = await findUserByEmail(cleanEmail);

        if (existing?.id) {
            return {
                ok: true,
                user: existing,
                message: "Existing user found",
            };
        }

        const cleanUsername =
            cleanString(username) || makeUsernameFromEmailOrName(cleanEmail, fullName);

        const payload = {
            username: cleanUsername,
            email: cleanEmail,
            password: defaultPassword(),
            confirmed: true,
            blocked: false,
            provider: "local",
        };

        try {
            const parsed = await strapiFetch("users", {
                method: "POST",
                useAuth: true,
                json: payload,
            });

            const attrs = parsed?.attributes ?? parsed;

            return {
                ok: true,
                user: {
                    id: parsed?.id,
                    username: attrs?.username || cleanUsername,
                    email: attrs?.email || cleanEmail,
                },
                message: "User created",
            };
        } catch (firstError) {
            try {
                const parsed = await strapiFetch("auth/local/register", {
                    method: "POST",
                    useAuth: false,
                    json: {
                        username: cleanUsername,
                        email: cleanEmail,
                        password: payload.password,
                    },
                });

                const u = parsed?.user || null;

                return {
                    ok: !!u?.id,
                    user: u
                        ? {
                            id: u.id,
                            username: u.username || cleanUsername,
                            email: u.email || cleanEmail,
                        }
                        : null,
                    message: u?.id ? "User registered" : "User register returned no user",
                };
            } catch (secondError) {
                return {
                    ok: false,
                    user: null,
                    message:
                        secondError?.message ||
                        firstError?.message ||
                        "User creation failed",
                };
            }
        }
    }

    async function updateUserSafe(userId, payload) {
        const id = Number(userId);

        if (!Number.isFinite(id) || id <= 0) {
            return {
                ok: true,
                skipped: true,
                message: "No valid users_permissions_user id found",
            };
        }

        const cleanPayload = {};

        if (cleanString(payload?.email)) {
            cleanPayload.email = cleanString(payload.email);
        }

        if (cleanString(payload?.username)) {
            cleanPayload.username = cleanString(payload.username);
        }

        if (!cleanPayload.email && !cleanPayload.username) {
            return {
                ok: true,
                skipped: true,
                message: "No email/username changes",
            };
        }

        try {
            await strapiFetch(`users/${id}`, {
                method: "PUT",
                useAuth: true,
                json: cleanPayload,
            });

            return {
                ok: true,
                skipped: false,
                message: "User email/username updated",
            };
        } catch (error) {
            return {
                ok: false,
                skipped: false,
                message: error?.message || "User update failed",
            };
        }
    }

    async function applyMediaFromExcel(rowObj, candidateData, existingCandidate = null) {
        const profileImageUrl = cleanString(
            getFirstExisting(rowObj, ["Profile Image URL", "profileImageUrl"])
        );

        const cvUrl = cleanString(
            getFirstExisting(rowObj, ["CV URL", "CV", "cvUrl"])
        );

        const passportUrl = cleanString(
            getFirstExisting(rowObj, ["Passport URL", "passportUrl"])
        );

        const existingProfile = normalizeStrapiMedia(
            existingCandidate?.profileImage,
            STRAPI_BASE_URL
        );

        const existingCV = normalizeStrapiMedia(
            existingCandidate?.CV,
            STRAPI_BASE_URL
        );

        const existingPassport = normalizeStrapiMedia(
            existingCandidate?.passport,
            STRAPI_BASE_URL
        );

        if (isHttpUrl(profileImageUrl) && profileImageUrl !== existingProfile.url) {
            const uploaded = await uploadFileFromUrl(profileImageUrl);
            if (uploaded?.id) candidateData.profileImage = uploaded.id;
        }

        if (isHttpUrl(cvUrl) && cvUrl !== existingCV.url) {
            const uploaded = await uploadFileFromUrl(cvUrl);
            if (uploaded?.id) candidateData.CV = uploaded.id;
        }

        if (isHttpUrl(passportUrl) && passportUrl !== existingPassport.url) {
            const uploaded = await uploadFileFromUrl(passportUrl);
            if (uploaded?.id) candidateData.passport = uploaded.id;
        }
    }

    async function buildDocumentsFromExcel(rowObj, existingCandidate = null) {
        const existingDocs = Array.isArray(existingCandidate?.documents)
            ? existingCandidate.documents
            : [];

        const resultDocs = [];
        let hasAnyDocumentColumn = false;

        for (let i = 1; i <= 3; i++) {
            const name = cleanString(
                getFirstExisting(rowObj, [`Document ${i} Name`, `document${i}Name`])
            );

            const remarks = cleanString(
                getFirstExisting(rowObj, [`Document ${i} Remarks`, `document${i}Remarks`])
            );

            const fileUrl = cleanString(
                getFirstExisting(rowObj, [`Document ${i} File URL`, `document${i}FileUrl`])
            );

            const existingDoc = existingDocs[i - 1] || null;
            const existingMedia = normalizeStrapiMedia(
                existingDoc?.file ?? existingDoc?.files,
                STRAPI_BASE_URL
            );

            if (name || remarks || fileUrl) {
                hasAnyDocumentColumn = true;
            }

            if (!name && !remarks && !fileUrl && !existingDoc) {
                continue;
            }

            const docPayload = {};

            /*
                Do not send component id in update payload.
                Strapi can throw "Invalid key id" when nested component ids are included
                from an imported Excel update. We keep using Document ID to find/update
                the candidate, but document component payloads are rebuilt without id.
            */

            docPayload.name = name || existingDoc?.name || "";
            docPayload.remarks = remarks || existingDoc?.remarks || "";

            if (isHttpUrl(fileUrl) && fileUrl !== existingMedia.url) {
                const uploaded = await uploadFileFromUrl(fileUrl);
                if (uploaded?.id) docPayload.file = uploaded.id;
            } else if (existingMedia?.id) {
                docPayload.file = existingMedia.id;
            }

            if (docPayload.name || docPayload.remarks || docPayload.file) {
                resultDocs.push(docPayload);
            }
        }

        if (!hasAnyDocumentColumn) {
            return null;
        }

        return resultDocs;
    }

    try {
        const formData = await req.formData();

        const mode = cleanString(formData.get("mode")).toLowerCase();
        const file = formData.get("file");

        if (!file || typeof file.arrayBuffer !== "function") {
            return Response.json(
                { ok: false, error: "Excel file is required" },
                { status: 400 }
            );
        }

        if (mode !== "new" && mode !== "update") {
            return Response.json(
                { ok: false, error: 'Invalid import mode. Use "new" or "update".' },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.worksheets[0];

        if (!worksheet) {
            return Response.json(
                { ok: false, error: "Excel file has no worksheet" },
                { status: 400 }
            );
        }

        const headerRow = worksheet.getRow(1);
        const headers = [];

        headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            headers[colNumber] = normalizeHeader(cell.value);
        });

        const report = [];

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
            const row = worksheet.getRow(rowNumber);

            const rowObj = {};
            let hasAnyValue = false;

            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const header = headers[colNumber];

                if (!header) return;

                const value = cleanString(cell.value);
                rowObj[header] = value;

                if (value) hasAnyValue = true;
            });

            if (!hasAnyValue) continue;

            try {
                const documentId = cleanString(
                    getFirstExisting(rowObj, ["Document ID", "documentId", "DocumentId"])
                );

                const referenceNumber = cleanString(
                    getFirstExisting(rowObj, [
                        "Reference Number",
                        "referenceNumber",
                        "Reference",
                        "Ref",
                    ])
                );

                const email = cleanString(getFirstExisting(rowObj, ["Email", "email"]));
                const username = cleanString(getFirstExisting(rowObj, ["Username", "username"]));
                const fullName = cleanString(
                    getFirstExisting(rowObj, ["Full Name", "fullName", "Name"])
                );

                const jobRoleTitles = splitTitles(
                    getFirstExisting(rowObj, ["Job Roles", "job_roles", "Roles"])
                );

                const jobRoleIds = await getOrCreateJobRoleIds(jobRoleTitles);

                const agentText = cleanString(getFirstExisting(rowObj, ["Agent", "agent", "Agent Name", "agentName"]));
                const agentRecord = agentText ? await findAgentByText(agentText) : null;

                if (mode === "update") {
                    if (!documentId) {
                        skipped++;

                        report.push({
                            row: rowNumber,
                            status: "skipped",
                            message: "Missing Document ID",
                        });

                        continue;
                    }

                    if (!referenceNumber) {
                        skipped++;

                        report.push({
                            row: rowNumber,
                            status: "skipped",
                            message: "Missing Reference Number",
                        });

                        continue;
                    }

                    const existingCandidate = await getCandidateByDocumentId(documentId);

                    if (!existingCandidate) {
                        skipped++;

                        report.push({
                            row: rowNumber,
                            status: "skipped",
                            message: `Candidate not found for Document ID: ${documentId}`,
                        });

                        continue;
                    }

                    const existingRef = cleanString(existingCandidate?.referenceNumber);

                    if (existingRef !== referenceNumber) {
                        skipped++;

                        report.push({
                            row: rowNumber,
                            status: "skipped",
                            message: `Reference Number mismatch. Excel: ${referenceNumber}, Strapi: ${existingRef || "empty"}`,
                        });

                        continue;
                    }

                    const candidateData = buildCandidateData(rowObj);

                    if (jobRoleIds.length > 0) {
                        candidateData.job_roles = jobRoleIds;
                    }

                    if (agentText) {
                        candidateData.agent = agentRecord?.id || null;
                    }

                    await applyMediaFromExcel(rowObj, candidateData, existingCandidate);

                    const docsPayload = await buildDocumentsFromExcel(rowObj, existingCandidate);

                    if (docsPayload) {
                        candidateData.documents = docsPayload;
                    }

                    await strapiFetch(`candidates/${documentId}?status=published`, {
                        method: "PUT",
                        useAuth: true,
                        json: {
                            data: candidateData,
                        },
                    });

                    const user = getUserFromCandidate(existingCandidate);

                    const userUpdate = await updateUserSafe(user?.id, {
                        email,
                        username,
                    });

                    updated++;

                    if (userUpdate.ok) {
                        report.push({
                            row: rowNumber,
                            status: "updated",
                            message: userUpdate.skipped
                                ? "Candidate updated. Media/files processed. User email/username unchanged."
                                : "Candidate, media/files, and user email/username updated.",
                        });
                    } else {
                        report.push({
                            row: rowNumber,
                            status: "warning",
                            message: `Candidate/media updated, but user email/username update failed: ${userUpdate.message}`,
                        });
                    }

                    continue;
                }

                // mode === "new"
                if (!fullName) {
                    skipped++;

                    report.push({
                        row: rowNumber,
                        status: "skipped",
                        message: "Full Name is required for new candidate",
                    });

                    continue;
                }

                const userCreate = await createUserSafe({
                    email,
                    username,
                    fullName,
                });

                const candidateData = buildCandidateData(rowObj);

                candidateData.fullName = candidateData.fullName || fullName;
                candidateData.type = "candidate";

                if (userCreate?.user?.id) {
                    candidateData.referenceNumber = `CAN_${userCreate.user.id}`;
                    candidateData.users_permissions_user = userCreate.user.id;
                } else {
                    candidateData.referenceNumber = `CAN_${Date.now()}_${rowNumber}`;
                }

                if (!candidateData.jobStatus) {
                    candidateData.jobStatus = "Available";
                }

                if (jobRoleIds.length > 0) {
                    candidateData.job_roles = jobRoleIds;
                }

                if (agentText) {
                    candidateData.agent = agentRecord?.id || null;
                }

                await applyMediaFromExcel(rowObj, candidateData, null);

                const docsPayload = await buildDocumentsFromExcel(rowObj, null);

                if (docsPayload) {
                    candidateData.documents = docsPayload;
                }

                await strapiFetch("candidates?status=published", {
                    method: "POST",
                    useAuth: true,
                    json: {
                        data: candidateData,
                    },
                });

                created++;

                if (userCreate.ok) {
                    report.push({
                        row: rowNumber,
                        status: "created",
                        message: "Candidate created with media/files processed.",
                    });
                } else {
                    report.push({
                        row: rowNumber,
                        status: "warning",
                        message: `Candidate created with media/files processed, but login user was not created: ${userCreate.message}`,
                    });
                }
            } catch (error) {
                skipped++;

                report.push({
                    row: rowNumber,
                    status: "skipped",
                    message: error?.message || "Row import failed",
                });
            }
        }

        const totalRows = created + updated + skipped;

        const importType = mode === "new"
            ? "New Candidate Import"
            : "Candidate Data Update Import";

        const completionStatus = skipped > 0
            ? "Completed with Partial Skips"
            : "Completed Successfully";

        if (created > 0 || updated > 0) {
            try {
                await CreateNotification({
                    title: `Candidate Import ${completionStatus} - ${importType}`,
                    details: `${totalRows} row${totalRows === 1 ? "" : "s"} processed. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}. Import mode: ${importType}.`,
                    email: false,
                });
            } catch (notificationError) {
                console.error("Candidate import notification failed:", notificationError);
            }
        }

        return Response.json(
            {
                ok: true,
                mode,
                totalRows,
                created,
                updated,
                skipped,
                report,
            },
            { status: 200 }
        );
    } catch (error) {
        return Response.json(
            {
                ok: false,
                error: error?.message || "Import failed",
                details: error?.details || null,
            },
            { status: error?.status || 500 }
        );
    }
}