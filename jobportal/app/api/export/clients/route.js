export const runtime = "nodejs";

import ExcelJS from "exceljs";
import qs from "qs";
import fs from "fs";
import path from "path";
import { CreateNotification } from "@/lib/server/notification";




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
        if (v.hyperlink) return String(v.hyperlink).trim();
        if (v.text) return String(v.text).trim();
        if (Array.isArray(v.richText)) return v.richText.map((x) => x?.text || "").join("").trim();
        if (v.result !== undefined) return String(v.result).trim();
    }
    return String(v).trim();
}

function normalizeHeader(v) {
    return cleanString(v).toLowerCase().replace(/\s+/g, " ").replace(/[_-]+/g, " ").trim();
}

function getFirstExisting(rowObj, names) {
    for (const name of names) {
        const key = normalizeHeader(name);
        if (Object.prototype.hasOwnProperty.call(rowObj, key)) return rowObj[key];
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

function loadEnumsSafe() {
    try {
        const filePath = path.join(process.cwd(), "config", "enums.json");
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        console.error("Failed to load config/enums.json:", error);
        return {};
    }
}

function enumValues(enums, key) {
    const arr = Array.isArray(enums?.[key]) ? enums[key] : [];
    return arr
        .map((x) => (typeof x === "string" ? x : x?.label || String(x?.value ?? "")))
        .map((x) => String(x || "").trim())
        .filter(Boolean);
}

function safeDefinedName(name) {
    return String(name || "").replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]/, "_");
}

function getColumnNumberByHeader(worksheet, headerName) {
    const expected = String(headerName || "").trim().toLowerCase();
    let found = null;
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const value = String(cell.value || "").trim().toLowerCase();
        if (value === expected) found = colNumber;
    });
    return found;
}

function addClientDropdowns(workbook, worksheet, { rowStart = 2, rowEnd = 1000 } = {}) {
    const enums = loadEnumsSafe();

    const dropdownMap = {
        "Country": enumValues(enums, "countries").length ? enumValues(enums, "countries") : enumValues(enums, "nationalities"),
        "Industry": enumValues(enums, "industries"),
        "Company Size": enumValues(enums, "companySize"),
        "Status": enumValues(enums, "status"),
        "Lead Status": enumValues(enums, "LeadStatus"),
    };

    let listSheet = workbook.getWorksheet("_dropdowns");
    if (listSheet) workbook.removeWorksheet(listSheet.id);

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

        workbook.definedNames.add(range, definedName);

        for (let rowNumber = rowStart; rowNumber <= rowEnd; rowNumber++) {
            worksheet.getCell(rowNumber, targetCol).dataValidation = {
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
    const absUrl = url ? (url.startsWith("http") ? url : joinUrl(origin, url)) : "";
    return { id, name, url: absUrl };
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

function getUserFields(client) {
    const d = client?.users_permissions_user?.data ?? client?.users_permissions_user ?? null;
    const attrs = d?.attributes ?? d;
    return {
        id: d?.id ?? null,
        username: attrs?.username ?? "",
        email: attrs?.email ?? "",
    };
}

function mapContacts(client) {
    const contacts = Array.isArray(client?.contactList) ? client.contactList : [];
    return contacts.map((c) => ({
        name: c?.name || "",
        designation: c?.designation || "",
        mobile: c?.mobile || "",
        remarks: c?.remarks || "",
    }));
}

function setHyperlinkCell(row, key, value) {
    const url = cleanString(value);
    const cell = row.getCell(key);

    if (!url) {
        cell.value = "";
        return;
    }

    cell.value = { text: url, hyperlink: url };
    cell.font = { color: { argb: "FF0563C1" }, underline: true };
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
    return new Date().toISOString().slice(0, 10);
}

function getClientExportNotificationData({ mode, q, leadStatus, selectedDocumentIds, exportedCount }) {
    const isSelectedExport = mode === "selected";
    const hasFilters = Boolean(q || leadStatus);

    let exportScope = "Full Export";
    let title = "Client Data Export Completed - Full Export";
    const detailParts = [];

    if (isSelectedExport) {
        exportScope = "Partial Export";
        title = "Client Data Export Completed - Selected Clients";
        detailParts.push(`${exportedCount} of ${selectedDocumentIds.length} selected client record${selectedDocumentIds.length === 1 ? "" : "s"} exported successfully to Excel.`);
        detailParts.push("Scope: Selected client export / partial data export.");
    } else if (hasFilters) {
        exportScope = "Partial Export";
        title = "Client Data Export Completed - Filtered Export";
        detailParts.push(`${exportedCount} client record${exportedCount === 1 ? "" : "s"} exported successfully to Excel.`);
        detailParts.push("Scope: Filtered client export / partial data export.");
    } else {
        detailParts.push(`${exportedCount} client record${exportedCount === 1 ? "" : "s"} exported successfully to Excel.`);
        detailParts.push("Scope: Full client export. No search or lead-status filters were applied.");
    }

    if (!isSelectedExport && q) {
        detailParts.push(`Search filter: "${q}".`);
    }

    if (!isSelectedExport && leadStatus) {
        detailParts.push(`Lead status filter: "${leadStatus}".`);
    }

    return {
        title,
        details: detailParts.join(" "),
        exportScope,
    };
}

async function createClientExportSuccessNotification({ mode, q, leadStatus, selectedDocumentIds, exportedCount }) {
    try {
        const notification = getClientExportNotificationData({
            mode,
            q,
            leadStatus,
            selectedDocumentIds,
            exportedCount,
        });

        await CreateNotification({
            title: notification.title,
            details: notification.details,
            email: true,
        });
    } catch (notificationError) {
        console.error("Client export success notification failed:", notificationError);
    }
}

export async function POST(req) {
    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
    const RAW_TOKEN = String(process.env.STRAPI_TOKEN || process.env.API_TOKEN || "").trim();

    if (!STRAPI_BASE_URL || !RAW_TOKEN) {
        return Response.json(
            { ok: false, error: "Missing STRAPI_BASE_URL/NEXT_PUBLIC_API_BASE_URL or STRAPI_TOKEN/API_TOKEN" },
            { status: 500 }
        );
    }

    const BEARER = RAW_TOKEN.toLowerCase().startsWith("bearer ") ? RAW_TOKEN : `Bearer ${RAW_TOKEN}`;

    async function strapiFetch(pathValue, opts = {}) {
        const url = joinUrl(STRAPI_BASE_URL, pathValue);
        const headers = {
            ...(opts.useAuth === false ? {} : { Authorization: BEARER }),
            ...(opts.headers || {}),
        };

        let body = opts.body;
        if (opts.json !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(opts.json);
        }

        const res = await fetch(url, {
            method: opts.method || "GET",
            headers,
            body,
            redirect: "manual",
            cache: "no-store",
        });

        if (res.status >= 300 && res.status < 400) {
            const err = new Error(`Strapi redirect detected (${res.status}). Fix STRAPI_BASE_URL. location=${res.headers.get("location")}`);
            err.status = 500;
            throw err;
        }

        const parsed = await readBodySafe(res);

        if (!res.ok) {
            const err = new Error(parsed?.error?.message || parsed?.message || parsed?.raw || `Strapi error: ${res.status}`);
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
        const leadStatus = cleanString(body?.leadStatus || "");
        const selectedDocumentIds = Array.isArray(body?.selectedDocumentIds)
            ? body.selectedDocumentIds.map(cleanString).filter(Boolean)
            : [];

        if (mode === "selected" && selectedDocumentIds.length === 0) {
            return Response.json({ ok: false, error: "No selected clients provided." }, { status: 400 });
        }

        const clients = [];
        let page = 1;
        const pageSize = 100;

        while (true) {
            const andFilters = [];

            if (mode === "selected") {
                andFilters.push({ documentId: { $in: selectedDocumentIds } });
            } else {
                if (q) {
                    andFilters.push({
                        $or: [
                            { companyName: { $containsi: q } },
                            { contactName: { $containsi: q } },
                            { city: { $containsi: q } },
                            { address: { $containsi: q } },
                            { phone: { $containsi: q } },
                            { website: { $containsi: q } },
                            { countryList: { $containsi: q } },
                            { industriesList: { $containsi: q } },
                            { companySizeList: { $containsi: q } },
                            { statusList: { $containsi: q } },
                            { leadStatus: { $containsi: q } },
                            { users_permissions_user: { username: { $containsi: q } } },
                            { users_permissions_user: { email: { $containsi: q } } },
                        ],
                    });
                }

                if (leadStatus) {
                    andFilters.push({ leadStatus: { $eq: leadStatus } });
                }
            }

            const queryObj = {
                status: "published",
                sort: ["createdAt:desc"],
                pagination: { page, pageSize },
                populate: {
                    logo: true,
                    contactList: true,
                    users_permissions_user: true,
                },
            };

            if (andFilters.length === 1) queryObj.filters = andFilters[0];
            else if (andFilters.length > 1) queryObj.filters = { $and: andFilters };

            const query = qs.stringify(queryObj, { encodeValuesOnly: true });

            const parsed = await strapiFetch(`clients?${query}`, {
                method: "GET",
                useAuth: true,
            });

            const data = Array.isArray(parsed?.data) ? parsed.data : [];
            clients.push(...data);

            const pageCount = Number(parsed?.meta?.pagination?.pageCount || 1);
            if (page >= pageCount) break;
            page++;
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Job Portal";
        workbook.created = new Date();
        workbook.modified = new Date();

        const worksheet = workbook.addWorksheet("Clients", {
            views: [{ state: "frozen", ySplit: 1 }],
        });

        worksheet.columns = [
            { header: "Document ID", key: "documentId", width: 28 },
            { header: "ID", key: "id", width: 10 },

            { header: "Company Name", key: "companyName", width: 28 },
            { header: "Contact Name", key: "contactName", width: 24 },
            { header: "Designation", key: "designation", width: 24 },
            { header: "Username", key: "username", width: 24 },
            { header: "Email", key: "email", width: 30 },
            { header: "Phone", key: "phone", width: 24 },
            { header: "Website", key: "website", width: 32 },

            { header: "City", key: "city", width: 20 },
            { header: "Address", key: "address", width: 35 },
            { header: "Country", key: "countryList", width: 24 },
            { header: "Industry", key: "industriesList", width: 32 },
            { header: "Company Size", key: "companySizeList", width: 18 },
            { header: "Status", key: "statusList", width: 18 },
            { header: "Lead Status", key: "leadStatus", width: 18 },

            { header: "Short Description", key: "shortDescription", width: 40 },
            { header: "Private Note", key: "privateNote", width: 40 },

            { header: "Logo URL", key: "logoUrl", width: 45 },

            { header: "Contact 1 Name", key: "contact1Name", width: 24 },
            { header: "Contact 1 Designation", key: "contact1Designation", width: 24 },
            { header: "Contact 1 Mobile", key: "contact1Mobile", width: 22 },
            { header: "Contact 1 Remarks", key: "contact1Remarks", width: 35 },

            { header: "Contact 2 Name", key: "contact2Name", width: 24 },
            { header: "Contact 2 Designation", key: "contact2Designation", width: 24 },
            { header: "Contact 2 Mobile", key: "contact2Mobile", width: 22 },
            { header: "Contact 2 Remarks", key: "contact2Remarks", width: 35 },

            { header: "Contact 3 Name", key: "contact3Name", width: 24 },
            { header: "Contact 3 Designation", key: "contact3Designation", width: 24 },
            { header: "Contact 3 Mobile", key: "contact3Mobile", width: 22 },
            { header: "Contact 3 Remarks", key: "contact3Remarks", width: 35 },
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        worksheet.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF991B1B" },
        };
        worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };

        clients.forEach((item) => {
            const client = unwrapCollectionItem(item) || {};
            const user = getUserFields(client);
            const logo = normalizeStrapiMedia(client?.logo, STRAPI_BASE_URL);
            const contacts = mapContacts(client);

            const row = worksheet.addRow({
                documentId: client?.documentId || item?.documentId || "",
                id: client?.id ?? item?.id ?? "",

                companyName: client?.companyName || "",
                contactName: client?.contactName || "",
                designation: client?.designation || "",
                username: user.username || "",
                email: user.email || "",
                phone: client?.phone || "",
                website: client?.website || "",

                city: client?.city || "",
                address: client?.address || "",
                countryList: client?.countryList || "",
                industriesList: client?.industriesList || "",
                companySizeList: client?.companySizeList || "",
                statusList: client?.statusList || "",
                leadStatus: client?.leadStatus || "Lead",

                shortDescription: client?.shortDescription || "",
                privateNote: client?.privateNote || "",

                logoUrl: logo.url || "",

                contact1Name: contacts?.[0]?.name || "",
                contact1Designation: contacts?.[0]?.designation || "",
                contact1Mobile: contacts?.[0]?.mobile || "",
                contact1Remarks: contacts?.[0]?.remarks || "",

                contact2Name: contacts?.[1]?.name || "",
                contact2Designation: contacts?.[1]?.designation || "",
                contact2Mobile: contacts?.[1]?.mobile || "",
                contact2Remarks: contacts?.[1]?.remarks || "",

                contact3Name: contacts?.[2]?.name || "",
                contact3Designation: contacts?.[2]?.designation || "",
                contact3Mobile: contacts?.[2]?.mobile || "",
                contact3Remarks: contacts?.[2]?.remarks || "",
            });

            setHyperlinkCell(row, "website", client?.website || "");
            setHyperlinkCell(row, "logoUrl", logo.url || "");
        });

        worksheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.alignment = { vertical: "top", wrapText: true };
                cell.border = {
                    top: { style: "thin", color: { argb: "FFE5E7EB" } },
                    left: { style: "thin", color: { argb: "FFE5E7EB" } },
                    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
                    right: { style: "thin", color: { argb: "FFE5E7EB" } },
                };
            });
        });

        autoFitColumns(worksheet);

        addClientDropdowns(workbook, worksheet, {
            rowStart: 2,
            rowEnd: Math.max(worksheet.rowCount + 500, 1000),
        });

        const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

        await createClientExportSuccessNotification({
            mode,
            q,
            leadStatus,
            selectedDocumentIds,
            exportedCount: clients.length,
        });

        const filename =
            mode === "selected"
                ? `selected-clients-${safeDateFilename()}.xlsx`
                : `clients-export-${safeDateFilename()}.xlsx`;

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("Client export failed:", error);

        return Response.json(
            {
                ok: false,
                error: error?.message || "Client export failed",
                details: error?.details || null,
            },
            { status: error?.status || 500 }
        );
    }
}
