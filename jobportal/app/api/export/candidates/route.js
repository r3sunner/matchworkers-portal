export const runtime = "nodejs";

import ExcelJS from "exceljs";
import qs from "qs";
import path from "path";
import fs from "fs";
import { CreateNotification } from "@/lib/server/notification";

/* ------------------------------------------------------------------ */
/* Helpers */
/* ------------------------------------------------------------------ */

function joinUrl(base, pathValue) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(pathValue || "").replace(/^\/+/, "");
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
        if (v.text) return String(v.text).trim();
        if (v.hyperlink) return String(v.hyperlink).trim();
        if (Array.isArray(v.richText)) {
            return v.richText.map((x) => x?.text || "").join("").trim();
        }
        if (v.result !== undefined) return String(v.result).trim();
    }

    return String(v).trim();
}

function loadEnumsSafe() {
    try {
        const filePath = path.join(process.cwd(), "config", "enums.json");
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw);
    } catch (error) {
        console.error("Failed to load config/enums.json:", error);
        return {};
    }
}

function enumValues(enums, key) {
    const arr = Array.isArray(enums?.[key]) ? enums[key] : [];

    return arr
        .map((x) => {
            if (typeof x === "string") return x;
            if (x && typeof x === "object") return x.label || String(x.value ?? "");
            return "";
        })
        .map((x) => String(x || "").trim())
        .filter(Boolean);
}

function safeDefinedName(name) {
    return String(name || "")
        .replace(/[^A-Za-z0-9_]/g, "_")
        .replace(/^[^A-Za-z_]/, "_");
}

function getColumnNumberByHeader(worksheet, headerName) {
    const expected = String(headerName || "").trim().toLowerCase();
    let found = null;

    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const value = String(cell.value || "").trim().toLowerCase();

        if (value === expected) {
            found = colNumber;
        }
    });

    return found;
}

function addCandidateDropdowns(workbook, worksheet, { rowStart = 2, rowEnd = 1000 } = {}) {
    const enums = loadEnumsSafe();

    const dropdownMap = {
        Gender: enumValues(enums, "genders"),
        Nationality: enumValues(enums, "nationalities"),
        "Marital Status": enumValues(enums, "maritalStatus"),
        "Seasonal Status": enumValues(enums, "seasonalStatus"),
        "English Level": enumValues(enums, "englishLevel"),
        "Job Status": enumValues(enums, "jobStatus"),
        "Profile Verified": enumValues(enums, "isProfileVerified"),
        "Currently Employed": enumValues(enums, "yesNo"),
    };

    let listSheet = workbook.getWorksheet("_dropdowns");

    if (listSheet) {
        workbook.removeWorksheet(listSheet.id);
    }

    listSheet = workbook.addWorksheet("_dropdowns");
    listSheet.state = "veryHidden";

    let listCol = 1;

    Object.entries(dropdownMap).forEach(([headerName, values]) => {
        if (!values.length) return;

        const targetCol = getColumnNumberByHeader(worksheet, headerName);
        if (!targetCol) return;

        const definedName = safeDefinedName(`${headerName}_List`);

        listSheet.getCell(1, listCol).value = headerName;

        values.forEach((value, index) => {
            listSheet.getCell(index + 2, listCol).value = value;
        });

        const colLetter = listSheet.getColumn(listCol).letter;
        const range = `'_dropdowns'!$${colLetter}$2:$${colLetter}$${values.length + 1}`;

        // ExcelJS definedNames.add(location, name)
        workbook.definedNames.add(range, definedName);

        for (let rowNumber = rowStart; rowNumber <= rowEnd; rowNumber++) {
            const cell = worksheet.getCell(rowNumber, targetCol);

            cell.dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [`=${definedName}`],
                showErrorMessage: true,
                errorStyle: "error",
                errorTitle: "Invalid value",
                error: `Please select a valid ${headerName} from dropdown.`,
            };
        }

        listCol++;
    });
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

function unwrapCollectionItem(item) {
    if (!item) return null;

    if (item.attributes) {
        return {
            id: item.id,
            documentId: item.documentId ?? item.attributes?.documentId,
            ...item.attributes,
        };
    }

    return item;
}

function relArray(rel) {
    const data = Array.isArray(rel) ? rel : rel?.data;
    return Array.isArray(data) ? data : [];
}

function getUserFields(candidate) {
    const d = candidate?.users_permissions_user?.data ?? candidate?.users_permissions_user ?? null;
    const attrs = d?.attributes ?? d;

    return {
        id: d?.id ?? null,
        username: attrs?.username ?? "",
        email: attrs?.email ?? "",
    };
}


function getAgentFields(candidate) {
    const d = candidate?.agent?.data ?? candidate?.agent ?? null;
    const attrs = d?.attributes ?? d;
    return {
        id: d?.id ?? null,
        documentId: d?.documentId ?? attrs?.documentId ?? "",
        companyName: attrs?.companyName ?? "",
        contactName: attrs?.contactName ?? "",
        designation: attrs?.designation ?? "",
    };
}

function getJobRoleTitles(candidate) {
    const arr = relArray(candidate?.job_roles);

    return arr
        .map((x) => {
            const attrs = x?.attributes ?? x;
            return attrs?.title ?? attrs?.name ?? "";
        })
        .filter(Boolean);
}

function mapDocuments(candidate, STRAPI_BASE_URL) {
    const docs = Array.isArray(candidate?.documents) ? candidate.documents : [];

    return docs.map((d) => {
        const media = normalizeStrapiMedia(d?.file ?? d?.files ?? null, STRAPI_BASE_URL);

        return {
            name: d?.name || "",
            remarks: d?.remarks || "",
            fileName: media.name || "",
            fileUrl: media.url || "",
        };
    });
}

function setHyperlinkCell(row, headerKey, value) {
    const cell = row.getCell(headerKey);
    const url = cleanString(value);

    if (!url) {
        cell.value = "";
        return;
    }

    cell.value = {
        text: url,
        hyperlink: url,
    };

    cell.font = {
        color: { argb: "FF0563C1" },
        underline: true,
    };
}

function autoFitColumns(worksheet) {
    worksheet.columns.forEach((column) => {
        let maxLength = 12;

        column.eachCell({ includeEmpty: true }, (cell) => {
            let value = "";

            if (cell.value && typeof cell.value === "object") {
                value = cell.value.text || cell.value.hyperlink || JSON.stringify(cell.value);
            } else {
                value = String(cell.value || "");
            }

            maxLength = Math.max(maxLength, Math.min(value.length + 2, 45));
        });

        column.width = maxLength;
    });
}

function safeDateFilename() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Route */
/* ------------------------------------------------------------------ */

export async function POST(req) {
    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
    const RAW_TOKEN = String(process.env.STRAPI_TOKEN || process.env.API_TOKEN || "").trim();

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

    try {
        const body = await req.json().catch(() => ({}));

        const mode = cleanString(body?.mode || "all");
        const q = cleanString(body?.q || "");
        const selectedDocumentIds = Array.isArray(body?.selectedDocumentIds)
            ? body.selectedDocumentIds.map(cleanString).filter(Boolean)
            : [];

        if (mode === "selected" && selectedDocumentIds.length === 0) {
            return Response.json(
                { ok: false, error: "No selected candidates provided." },
                { status: 400 }
            );
        }

        const candidates = [];
        let page = 1;
        const pageSize = 100;

        while (true) {
            const filters = {};

            if (mode === "selected") {
                filters.documentId = {
                    $in: selectedDocumentIds,
                };
            } else if (q) {
                filters.$or = [
                    { referenceNumber: { $containsi: q } },
                    { fullName: { $containsi: q } },
                    { firstName: { $containsi: q } },
                    { lastName: { $containsi: q } },
                    { mobile: { $containsi: q } },
                    { nationalityList: { $containsi: q } },
                    { jobStatus: { $containsi: q } },
                    { workingVideoLink: { $containsi: q } },
                    { miScreeningVideoLink: { $containsi: q } },
                    { users_permissions_user: { username: { $containsi: q } } },
                    { users_permissions_user: { email: { $containsi: q } } },
                    { job_roles: { title: { $containsi: q } } },
                    { agent: { companyName: { $containsi: q } } },
                ];
            }

            const queryObj = {
                status: "published",
                sort: ["createdAt:desc"],
                pagination: {
                    page,
                    pageSize,
                },
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
            };

            if (Object.keys(filters).length > 0) {
                queryObj.filters = filters;
            }

            const query = qs.stringify(queryObj, { encodeValuesOnly: true });

            const parsed = await strapiFetch(`candidates?${query}`, {
                method: "GET",
                useAuth: true,
            });

            const data = Array.isArray(parsed?.data) ? parsed.data : [];

            candidates.push(...data);

            const pagination = parsed?.meta?.pagination || {};
            const pageCount = Number(pagination.pageCount || 1);

            if (page >= pageCount) break;

            page++;
        }

        const workbook = new ExcelJS.Workbook();

        workbook.creator = "Job Portal";
        workbook.created = new Date();
        workbook.modified = new Date();

        const worksheet = workbook.addWorksheet("Candidates", {
            views: [{ state: "frozen", ySplit: 1 }],
        });

        worksheet.columns = [
            { header: "Document ID", key: "documentId", width: 28 },
            { header: "ID", key: "id", width: 10 },
            { header: "Reference Number", key: "referenceNumber", width: 20 },

            { header: "Full Name", key: "fullName", width: 28 },
            { header: "First Name", key: "firstName", width: 20 },
            { header: "Last Name", key: "lastName", width: 20 },

            { header: "Username", key: "username", width: 22 },
            { header: "Email", key: "email", width: 30 },
            { header: "Mobile", key: "mobile", width: 20 },

            { header: "Birth Date", key: "birthDate", width: 16 },
            { header: "Gender", key: "genderList", width: 18 },
            { header: "Nationality", key: "nationalityList", width: 22 },
            { header: "Marital Status", key: "maritalStatusList", width: 18 },
            { header: "Seasonal Status", key: "seasonalStatusList", width: 28 },
            { header: "English Level", key: "englishLevelList", width: 18 },

            { header: "Job Status", key: "jobStatus", width: 18 },
            { header: "Profile Verified", key: "isProfileVerifiedList", width: 22 },
            { header: "Currently Employed", key: "currentlyEmployed", width: 18 },

            { header: "Number of Experience", key: "numberOfExperience", width: 20 },
            { header: "Previous Company", key: "previousCompany", width: 25 },
            { header: "Previous Job Experience", key: "previousJobExperiece", width: 22 },
            { header: "Current Company", key: "currentCompany", width: 25 },
            { header: "Current Job Experience", key: "currentJobExperiece", width: 22 },

            { header: "Screening Interview Date", key: "dateScreeningInterview", width: 22 },
            { header: "Passport Expiry Date", key: "passportExpireDate", width: 20 },

            { header: "Short Summary", key: "shortSummary", width: 40 },
            { header: "Private Notes", key: "privateNotes", width: 40 },

            { header: "Working Video Link", key: "workingVideoLink", width: 40 },
            { header: "MI Screening Video Link", key: "miScreeningVideoLink", width: 40 },

            { header: "Job Roles", key: "jobRoles", width: 35 },
            { header: "Agent", key: "agentName", width: 30 },

            { header: "Profile Image URL", key: "profileImageUrl", width: 45 },
            { header: "CV URL", key: "cvUrl", width: 45 },
            { header: "Passport URL", key: "passportUrl", width: 45 },

            { header: "Document 1 Name", key: "document1Name", width: 25 },
            { header: "Document 1 Remarks", key: "document1Remarks", width: 35 },
            { header: "Document 1 File URL", key: "document1FileUrl", width: 45 },

            { header: "Document 2 Name", key: "document2Name", width: 25 },
            { header: "Document 2 Remarks", key: "document2Remarks", width: 35 },
            { header: "Document 2 File URL", key: "document2FileUrl", width: 45 },

            { header: "Document 3 Name", key: "document3Name", width: 25 },
            { header: "Document 3 Remarks", key: "document3Remarks", width: 35 },
            { header: "Document 3 File URL", key: "document3FileUrl", width: 45 },
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        worksheet.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF991B1B" },
        };
        worksheet.getRow(1).alignment = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true,
        };

        candidates.forEach((item) => {
            const candidate = unwrapCollectionItem(item) || {};
            const user = getUserFields(candidate);
            const roles = getJobRoleTitles(candidate);
            const agent = getAgentFields(candidate);

            const profileImage = normalizeStrapiMedia(candidate?.profileImage, STRAPI_BASE_URL);
            const cv = normalizeStrapiMedia(candidate?.CV, STRAPI_BASE_URL);
            const passport = normalizeStrapiMedia(candidate?.passport, STRAPI_BASE_URL);
            const docs = mapDocuments(candidate, STRAPI_BASE_URL);

            const row = worksheet.addRow({
                documentId: candidate?.documentId || item?.documentId || "",
                id: candidate?.id ?? item?.id ?? "",
                referenceNumber: candidate?.referenceNumber || "",

                fullName: candidate?.fullName || "",
                firstName: candidate?.firstName || "",
                lastName: candidate?.lastName || "",

                username: user.username || "",
                email: user.email || "",
                mobile: candidate?.mobile || "",

                birthDate: candidate?.birthDate || "",
                genderList: candidate?.genderList || "",
                nationalityList: candidate?.nationalityList || "",
                maritalStatusList: candidate?.maritalStatusList || "",
                seasonalStatusList: candidate?.seasonalStatusList || "",
                englishLevelList: candidate?.englishLevelList || "",

                jobStatus: candidate?.jobStatus || "",
                isProfileVerifiedList: candidate?.isProfileVerifiedList || "",
                currentlyEmployed: candidate?.currentlyEmployed ? "Yes" : "No",

                numberOfExperience: candidate?.numberOfExperience ?? "",
                previousCompany: candidate?.previousCompany || "",
                previousJobExperiece: candidate?.previousJobExperiece ?? "",
                currentCompany: candidate?.currentCompany || "",
                currentJobExperiece: candidate?.currentJobExperiece ?? "",

                dateScreeningInterview: candidate?.dateScreeningInterview || "",
                passportExpireDate: candidate?.passportExpireDate || "",

                shortSummary: candidate?.shortSummary || "",
                privateNotes: candidate?.privateNotes || "",

                workingVideoLink: candidate?.workingVideoLink || "",
                miScreeningVideoLink: candidate?.miScreeningVideoLink || "",

                jobRoles: roles.join(", "),
                agentName: agent.companyName || agent.contactName || "",

                profileImageUrl: profileImage.url || "",
                cvUrl: cv.url || "",
                passportUrl: passport.url || "",

                document1Name: docs?.[0]?.name || "",
                document1Remarks: docs?.[0]?.remarks || "",
                document1FileUrl: docs?.[0]?.fileUrl || "",

                document2Name: docs?.[1]?.name || "",
                document2Remarks: docs?.[1]?.remarks || "",
                document2FileUrl: docs?.[1]?.fileUrl || "",

                document3Name: docs?.[2]?.name || "",
                document3Remarks: docs?.[2]?.remarks || "",
                document3FileUrl: docs?.[2]?.fileUrl || "",
            });

            setHyperlinkCell(row, "workingVideoLink", candidate?.workingVideoLink || "");
            setHyperlinkCell(row, "miScreeningVideoLink", candidate?.miScreeningVideoLink || "");
            setHyperlinkCell(row, "profileImageUrl", profileImage.url || "");
            setHyperlinkCell(row, "cvUrl", cv.url || "");
            setHyperlinkCell(row, "passportUrl", passport.url || "");
            setHyperlinkCell(row, "document1FileUrl", docs?.[0]?.fileUrl || "");
            setHyperlinkCell(row, "document2FileUrl", docs?.[1]?.fileUrl || "");
            setHyperlinkCell(row, "document3FileUrl", docs?.[2]?.fileUrl || "");
        });

        worksheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.alignment = {
                    vertical: "top",
                    wrapText: true,
                };

                cell.border = {
                    top: { style: "thin", color: { argb: "FFE5E7EB" } },
                    left: { style: "thin", color: { argb: "FFE5E7EB" } },
                    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
                    right: { style: "thin", color: { argb: "FFE5E7EB" } },
                };
            });
        });

        autoFitColumns(worksheet);

        addCandidateDropdowns(workbook, worksheet, {
            rowStart: 2,
            rowEnd: Math.max(worksheet.rowCount + 500, 1000),
        });

        const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

        const exportedCount = candidates.length;
        const isSelectedExport = mode === "selected";
        const isFilteredExport = !isSelectedExport && Boolean(q);

        const exportType = isSelectedExport
            ? "Selected Partial Export"
            : isFilteredExport
                ? "Filtered Partial Export"
                : "Full Export";

        const exportedLabel = `${exportedCount} candidate record${exportedCount === 1 ? "" : "s"}`;

        const detailParts = [
            `${exportedLabel} exported successfully to Excel.`,
            `Export scope: ${exportType}.`,
        ];

        if (isSelectedExport) {
            detailParts.push(
                `${selectedDocumentIds.length} candidate record${selectedDocumentIds.length === 1 ? "" : "s"} were selected for export.`
            );
        }

        if (isFilteredExport) {
            detailParts.push(`Search keyword: "${q}".`);
        }

        try {
            await CreateNotification({
                title: `Candidate Data Export Completed - ${exportType}`,
                details: detailParts.join(" "),
                email: true,
            });
        } catch (notificationError) {
            console.error("Candidate export notification failed:", notificationError);
        }

        const filename =
            mode === "selected"
                ? `selected-candidates-${safeDateFilename()}.xlsx`
                : `candidates-export-${safeDateFilename()}.xlsx`;

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type":
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("Candidate export failed:", error);

        return Response.json(
            {
                ok: false,
                error: error?.message || "Candidate export failed",
                details: error?.details || null,
            },
            { status: error?.status || 500 }
        );
    }
}