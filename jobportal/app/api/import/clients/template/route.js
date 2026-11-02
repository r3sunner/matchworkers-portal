export const runtime = "nodejs";

import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";


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

function addClientDropdowns(workbook, worksheet, { rowStart = 2, rowEnd = 5000 } = {}) {
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

function autoFitColumns(worksheet) {
    worksheet.columns.forEach((column) => {
        let maxLength = 12;
        column.eachCell({ includeEmpty: true }, (cell) => {
            const value = cell.value && typeof cell.value === "object"
                ? cell.value.text || cell.value.hyperlink || JSON.stringify(cell.value)
                : String(cell.value || "");
            maxLength = Math.max(maxLength, Math.min(value.length + 2, 45));
        });
        column.width = maxLength;
    });
}

function safeDateFilename() {
    return new Date().toISOString().slice(0, 10);
}

export async function GET() {
    try {
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
        worksheet.getRow(1).alignment = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true,
        };

        worksheet.addRow({
            documentId: "Leave empty for new import",
            id: "",
            companyName: "Example Company",
            contactName: "Contact Name",
            designation: "Designation",
            username: "example.client",
            email: "client@example.com",
            phone: "+971500000000",
            website: "https://example.com",
            city: "Dubai",
            address: "Business address",
            countryList: "United Arab Emirates",
            industriesList: "Construction",
            companySizeList: "Small",
            statusList: "Active",
            leadStatus: "Lead",
            shortDescription: "Short company description",
            privateNote: "Internal note",
            logoUrl: "",
            contact1Name: "Contact Person",
            contact1Designation: "Manager",
            contact1Mobile: "+971500000000",
            contact1Remarks: "",
            contact2Name: "",
            contact2Designation: "",
            contact2Mobile: "",
            contact2Remarks: "",
            contact3Name: "",
            contact3Designation: "",
            contact3Mobile: "",
            contact3Remarks: "",
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

        const instructionSheet = workbook.addWorksheet("Instructions");

        instructionSheet.columns = [
            { header: "Topic", key: "topic", width: 30 },
            { header: "Details", key: "details", width: 90 },
        ];

        instructionSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        instructionSheet.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF991B1B" },
        };

        instructionSheet.addRows([
            {
                topic: "Import New Data",
                details: "Use Import New Data for creating new clients. Document ID is ignored for new records.",
            },
            {
                topic: "Update Existing Data",
                details: "Use Update Existing Data only with exported Excel files. Document ID must be valid.",
            },
            {
                topic: "Dropdown Columns",
                details: "Country, Industry, Company Size, Status, and Lead Status use latest values from config/enums.json.",
            },
            {
                topic: "Logo URL",
                details: "Put a public image URL in Logo URL. The import route downloads it, uploads it to Strapi Media Library, and links it to the client.",
            },
            {
                topic: "Contacts",
                details: "Use Contact 1, Contact 2, and Contact 3 columns for repeatable contactList component data.",
            },
        ]);

        instructionSheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.alignment = { vertical: "top", wrapText: true };
            });
        });

        autoFitColumns(worksheet);

        addClientDropdowns(workbook, worksheet, {
            rowStart: 2,
            rowEnd: 5000,
        });

        const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="client-import-template-${safeDateFilename()}.xlsx"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("Client template failed:", error);

        return Response.json(
            {
                ok: false,
                error: error?.message || "Client template failed",
            },
            { status: 500 }
        );
    }
}
