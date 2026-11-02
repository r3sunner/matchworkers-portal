export const runtime = "nodejs";

import ExcelJS from "exceljs";
import qs from "qs";
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

function makeUsernameFromEmailOrName(email, companyName) {
    const e = cleanString(email);
    if (e && e.includes("@")) return e.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "");

    const n = cleanString(companyName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "");

    return n || `client_${Date.now()}`;
}

function defaultPassword() {
    return `Client@${Math.floor(100000 + Math.random() * 900000)}`;
}

function unwrapClient(parsed) {
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

    return { id, name, url: absUrl };
}

function getUserFromClient(client) {
    const rel = client?.users_permissions_user;
    const d = rel?.data ?? rel;
    const attrs = d?.attributes ?? d;

    return {
        id: d?.id ?? null,
        username: attrs?.username || "",
        email: attrs?.email || "",
    };
}

function buildClientData(rowObj) {
    const data = {};

    const companyName = getFirstExisting(rowObj, ["Company Name", "companyName"]);
    if (cleanString(companyName)) data.companyName = cleanString(companyName);

    const contactName = getFirstExisting(rowObj, ["Contact Name", "contactName"]);
    if (cleanString(contactName)) data.contactName = cleanString(contactName);

    const designation = getFirstExisting(rowObj, ["Designation", "designation"]);
    if (cleanString(designation)) data.designation = cleanString(designation);

    const city = getFirstExisting(rowObj, ["City", "city"]);
    if (cleanString(city)) data.city = cleanString(city);

    const address = getFirstExisting(rowObj, ["Address", "address"]);
    if (cleanString(address)) data.address = cleanString(address);

    const phone = getFirstExisting(rowObj, ["Phone", "phone"]);
    if (cleanString(phone)) data.phone = cleanString(phone);

    const website = getFirstExisting(rowObj, ["Website", "website"]);
    if (cleanString(website)) data.website = cleanString(website);

    const countryList = getFirstExisting(rowObj, ["Country", "countryList"]);
    if (cleanString(countryList)) data.countryList = cleanString(countryList);

    const industriesList = getFirstExisting(rowObj, ["Industry", "industriesList"]);
    if (cleanString(industriesList)) data.industriesList = cleanString(industriesList);

    const companySizeList = getFirstExisting(rowObj, ["Company Size", "companySizeList"]);
    if (cleanString(companySizeList)) data.companySizeList = cleanString(companySizeList);

    const statusList = getFirstExisting(rowObj, ["Status", "statusList"]);
    if (cleanString(statusList)) data.statusList = cleanString(statusList);

    const leadStatus = getFirstExisting(rowObj, ["Lead Status", "leadStatus"]);
    if (cleanString(leadStatus)) data.leadStatus = cleanString(leadStatus);

    const shortDescription = getFirstExisting(rowObj, ["Short Description", "shortDescription"]);
    if (cleanString(shortDescription)) data.shortDescription = cleanString(shortDescription);

    const privateNote = getFirstExisting(rowObj, ["Private Note", "privateNote"]);
    if (cleanString(privateNote)) data.privateNote = cleanString(privateNote);

    return data;
}

function buildContactsFromExcel(rowObj, existingClient = null) {
    const existingContacts = Array.isArray(existingClient?.contactList)
        ? existingClient.contactList
        : [];

    const result = [];
    let hasAnyContactColumn = false;

    for (let i = 1; i <= 3; i++) {
        const name = cleanString(getFirstExisting(rowObj, [`Contact ${i} Name`, `contact${i}Name`]));
        const designation = cleanString(getFirstExisting(rowObj, [`Contact ${i} Designation`, `contact${i}Designation`]));
        const mobile = cleanString(getFirstExisting(rowObj, [`Contact ${i} Mobile`, `contact${i}Mobile`]));
        const remarks = cleanString(getFirstExisting(rowObj, [`Contact ${i} Remarks`, `contact${i}Remarks`]));

        const existingContact = existingContacts[i - 1] || null;

        if (name || designation || mobile || remarks) {
            hasAnyContactColumn = true;
        }

        if (!name && !designation && !mobile && !remarks && !existingContact) {
            continue;
        }

        const payload = {};

        // Do not send component `id` in update payload.
        // Some Strapi setups reject nested component ids with "Invalid key id".
        // Existing values are still reused below, but the payload only sends editable fields.
        payload.name = name || existingContact?.name || "";
        payload.designation = designation || existingContact?.designation || "";
        payload.mobile = mobile || existingContact?.mobile || "";
        payload.remarks = remarks || existingContact?.remarks || "";

        if (payload.name || payload.designation || payload.mobile || payload.remarks) {
            result.push(payload);
        }
    }

    if (!hasAnyContactColumn && existingClient) return null;

    return result;
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

    async function downloadRemoteFile(fileUrl) {
        const url = cleanString(fileUrl);
        if (!isHttpUrl(url)) return null;

        let res = await fetch(url, { method: "GET", cache: "no-store" });

        if (!res.ok) {
            res = await fetch(url, {
                method: "GET",
                headers: { Authorization: BEARER },
                cache: "no-store",
            });
        }

        if (!res.ok) {
            throw new Error(`Could not download logo URL: ${url} (${res.status})`);
        }

        const arrayBuffer = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") || "application/octet-stream";

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
                        : contentType.includes("webp")
                            ? ".webp"
                            : ".bin";

            filename = `client-logo-${Date.now()}${ext}`;
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
        const blob = new Blob([downloaded.buffer], { type: downloaded.contentType });
        fd.append("files", blob, downloaded.filename);

        const res = await fetch(joinUrl(STRAPI_BASE_URL, "upload"), {
            method: "POST",
            headers: { Authorization: BEARER },
            body: fd,
            redirect: "manual",
            cache: "no-store",
        });

        const parsed = await readBodySafe(res);

        if (!res.ok) {
            throw new Error(parsed?.error?.message || parsed?.message || parsed?.raw || `Upload failed (${res.status})`);
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

    async function applyLogoFromExcel(rowObj, clientData, existingClient = null) {
        const logoUrl = cleanString(getFirstExisting(rowObj, ["Logo URL", "logoUrl"]));
        if (!isHttpUrl(logoUrl)) return;

        const existingLogo = normalizeStrapiMedia(existingClient?.logo, STRAPI_BASE_URL);

        if (logoUrl !== existingLogo.url) {
            const uploaded = await uploadFileFromUrl(logoUrl);
            if (uploaded?.id) clientData.logo = uploaded.id;
        }
    }

    async function getClientByDocumentId(documentId) {
        const query = qs.stringify(
            {
                populate: {
                    logo: true,
                    contactList: true,
                    users_permissions_user: true,
                },
            },
            { encodeValuesOnly: true }
        );

        const parsed = await strapiFetch(`clients/${documentId}?${query}`, {
            method: "GET",
            useAuth: true,
        });

        return unwrapClient(parsed);
    }

    async function findUserByEmail(email) {
        const e = cleanString(email);
        if (!e) return null;

        const query = qs.stringify(
            {
                filters: { email: { $eqi: e } },
                pagination: { page: 1, pageSize: 1 },
            },
            { encodeValuesOnly: true }
        );

        try {
            const parsed = await strapiFetch(`users?${query}`, {
                method: "GET",
                useAuth: true,
            });

            const user = Array.isArray(parsed) ? parsed[0] : parsed?.data?.[0] || null;
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

    async function createUserSafe({ email, username, companyName }) {
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

        const cleanUsername = cleanString(username) || makeUsernameFromEmailOrName(cleanEmail, companyName);

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
                    message: secondError?.message || firstError?.message || "User creation failed",
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

        if (cleanString(payload?.email)) cleanPayload.email = cleanString(payload.email);
        if (cleanString(payload?.username)) cleanPayload.username = cleanString(payload.username);

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

    try {
        const formData = await req.formData();
        const mode = cleanString(formData.get("mode")).toLowerCase();
        const file = formData.get("file");

        if (!file || typeof file.arrayBuffer !== "function") {
            return Response.json({ ok: false, error: "Excel file is required" }, { status: 400 });
        }

        if (mode !== "new" && mode !== "update") {
            return Response.json({ ok: false, error: 'Invalid import mode. Use "new" or "update".' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.worksheets[0];

        if (!worksheet) {
            return Response.json({ ok: false, error: "Excel file has no worksheet" }, { status: 400 });
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
                const documentId = cleanString(getFirstExisting(rowObj, ["Document ID", "documentId", "DocumentId"]));
                const email = cleanString(getFirstExisting(rowObj, ["Email", "email"]));
                const username = cleanString(getFirstExisting(rowObj, ["Username", "username"]));
                const companyName = cleanString(getFirstExisting(rowObj, ["Company Name", "companyName"]));

                if (mode === "update") {
                    if (!documentId) {
                        skipped++;
                        report.push({ row: rowNumber, status: "skipped", message: "Missing Document ID" });
                        continue;
                    }

                    const existingClient = await getClientByDocumentId(documentId);

                    if (!existingClient) {
                        skipped++;
                        report.push({ row: rowNumber, status: "skipped", message: `Client not found for Document ID: ${documentId}` });
                        continue;
                    }

                    const clientData = buildClientData(rowObj);

                    const contactsPayload = buildContactsFromExcel(rowObj, existingClient);
                    if (contactsPayload) clientData.contactList = contactsPayload;

                    await applyLogoFromExcel(rowObj, clientData, existingClient);

                    await strapiFetch(`clients/${documentId}?status=published`, {
                        method: "PUT",
                        useAuth: true,
                        json: { data: clientData },
                    });

                    const user = getUserFromClient(existingClient);
                    const userUpdate = await updateUserSafe(user?.id, { email, username });

                    updated++;

                    if (userUpdate.ok) {
                        report.push({
                            row: rowNumber,
                            status: "updated",
                            message: userUpdate.skipped
                                ? "Client updated. User email/username unchanged."
                                : "Client and user email/username updated.",
                        });
                    } else {
                        report.push({
                            row: rowNumber,
                            status: "warning",
                            message: `Client updated, but user email/username update failed: ${userUpdate.message}`,
                        });
                    }

                    continue;
                }

                // New import
                if (!companyName) {
                    skipped++;
                    report.push({
                        row: rowNumber,
                        status: "skipped",
                        message: "Company Name is required for new client",
                    });
                    continue;
                }

                const userCreate = await createUserSafe({ email, username, companyName });
                const clientData = buildClientData(rowObj);

                clientData.companyName = clientData.companyName || companyName;
                clientData.type = "client";
                clientData.leadStatus = clientData.leadStatus || "Lead";
                clientData.statusList = clientData.statusList || "Active";

                if (userCreate?.user?.id) {
                    clientData.users_permissions_user = userCreate.user.id;
                }

                const contactsPayload = buildContactsFromExcel(rowObj, null);
                if (contactsPayload) clientData.contactList = contactsPayload;

                await applyLogoFromExcel(rowObj, clientData, null);

                await strapiFetch("clients?status=published", {
                    method: "POST",
                    useAuth: true,
                    json: { data: clientData },
                });

                created++;

                if (userCreate.ok) {
                    report.push({ row: rowNumber, status: "created", message: "Client created." });
                } else {
                    report.push({
                        row: rowNumber,
                        status: "warning",
                        message: `Client created, but login user was not created: ${userCreate.message}`,
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
        const changedRows = created + updated;
        const importType = mode === "new" ? "New Client Import" : "Client Data Update Import";
        const completionStatus = skipped > 0 ? "Completed with Partial Skips" : "Completed Successfully";

        // Create import notification only when at least one client was created or updated.
        // If created = 0 and updated = 0, nothing changed, so no notification log is created.
        if (changedRows > 0) {
            try {
                await CreateNotification({
                    title: `Client Import ${completionStatus} - ${importType}`,
                    details: `Client import completed. Import type: ${importType}. Total rows processed: ${totalRows}. Created: ${created}. Updated: ${updated}. Skipped: ${skipped}.`,
                    email: false,
                });
            } catch (notificationError) {
                console.error("Client import notification failed:", notificationError);
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
