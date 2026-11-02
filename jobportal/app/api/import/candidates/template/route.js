export const runtime = "nodejs";

import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

/* ------------------------------------------------------------------ */
/* Helpers */
/* ------------------------------------------------------------------ */

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

function addCandidateDropdowns(workbook, worksheet, { rowStart = 2, rowEnd = 5000 } = {}) {
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

/* ------------------------------------------------------------------ */
/* Route */
/* ------------------------------------------------------------------ */

export async function GET() {
    try {
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

        worksheet.addRow({
            documentId: "Leave empty for new import",
            id: "",
            referenceNumber: "Leave empty for new import",

            fullName: "Example Candidate",
            firstName: "Example",
            lastName: "Candidate",

            username: "example.candidate",
            email: "example@example.com",
            mobile: "+971500000000",

            birthDate: "1995-01-01",
            genderList: "Male",
            nationalityList: "Pakistan",
            maritalStatusList: "Single",
            seasonalStatusList: "Registered",
            englishLevelList: "Basic",

            jobStatus: "Available",
            isProfileVerifiedList: "Documents Pending",
            currentlyEmployed: "No",

            numberOfExperience: 2,
            previousCompany: "",
            previousJobExperiece: 0,
            currentCompany: "",
            currentJobExperiece: 0,

            dateScreeningInterview: "",
            passportExpireDate: "",

            shortSummary: "Short candidate summary",
            privateNotes: "Internal notes",

            workingVideoLink: "",
            miScreeningVideoLink: "",

            jobRoles: "Driver, Cleaner",
            agentName: "",

            profileImageUrl: "",
            cvUrl: "",
            passportUrl: "",

            document1Name: "",
            document1Remarks: "",
            document1FileUrl: "",

            document2Name: "",
            document2Remarks: "",
            document2FileUrl: "",

            document3Name: "",
            document3Remarks: "",
            document3FileUrl: "",
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
                details:
                    "Use Import New Data for creating new candidates. Document ID and Reference Number are ignored because they are system generated.",
            },
            {
                topic: "Update Existing Data",
                details:
                    "Use Update Existing Data only with exported Excel files. Document ID and Reference Number must be valid and must match the existing candidate.",
            },
            {
                topic: "Dropdown Columns",
                details:
                    "Gender, Nationality, Marital Status, Seasonal Status, English Level, Job Status, Profile Verified, and Currently Employed use latest values from config/enums.json.",
            },
            {
                topic: "Job Roles",
                details:
                    "Enter job roles separated by comma. Example: Driver, Cleaner, Electrician.",
            },
            {
                topic: "Media URLs",
                details:
                    "Profile Image URL, CV URL, Passport URL, and Document File URLs are kept for reference/future compatibility. Current import focuses on text fields and relations.",
            },
        ]);

        instructionSheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.alignment = {
                    vertical: "top",
                    wrapText: true,
                };
            });
        });

        autoFitColumns(worksheet);

        addCandidateDropdowns(workbook, worksheet, {
            rowStart: 2,
            rowEnd: 5000,
        });

        const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

        const filename = `candidate-import-template-${safeDateFilename()}.xlsx`;

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
        console.error("Candidate template failed:", error);

        return Response.json(
            {
                ok: false,
                error: error?.message || "Candidate template failed",
            },
            { status: 500 }
        );
    }
}