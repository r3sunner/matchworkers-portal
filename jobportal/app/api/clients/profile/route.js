import { NextResponse } from "next/server";
import qs from "qs";
import { requireAuth } from "@/lib/requireAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ClientProfileError extends Error {
    constructor(message, status = 500, details = null) {
        super(message);
        this.name = "ClientProfileError";
        this.status = status;
        this.details = details;
    }
}

function cleanString(value) {
    return String(value ?? "").trim();
}

function normalizeRole(session) {
    const user = session?.user || {};
    const raw =
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.type ||
        session?.role ||
        (typeof user?.role === "string" ? user.role : "") ||
        user?.role?.type ||
        user?.roleRaw?.type ||
        "";

    const role = cleanString(raw).toLowerCase();
    if (role === "client" || role === "clients") return "clients";
    if (role === "staff" || role === "staffs") return "staff";
    if (role === "candidate" || role === "candidates") return "candidates";
    return role;
}

async function requireClient() {
    const auth = await requireAuth();
    if (!auth.ok) {
        throw new ClientProfileError(
            auth.response?.status === 401 ? "Login required" : "Access denied",
            auth.response?.status || 401
        );
    }

    if (normalizeRole(auth.session) !== "clients") {
        throw new ClientProfileError(
            "Only a logged-in client can access this profile.",
            403
        );
    }

    return auth.session;
}

function getStrapiConfig() {
    const baseUrl = cleanString(
        process.env.STRAPI_BASE_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        process.env.STRAPI_URL
    ).replace(/\/+$/, "");

    const rawToken = cleanString(
        process.env.STRAPI_TOKEN ||
        process.env.STRAPI_API_TOKEN ||
        process.env.API_TOKEN
    );

    if (!baseUrl) {
        throw new ClientProfileError("Missing STRAPI_BASE_URL", 500);
    }

    if (!rawToken) {
        throw new ClientProfileError("Missing STRAPI_TOKEN", 500);
    }

    return {
        baseUrl,
        authorization: rawToken.toLowerCase().startsWith("bearer ")
            ? rawToken
            : `Bearer ${rawToken}`,
    };
}

function joinUrl(base, path) {
    return `${cleanString(base).replace(/\/+$/, "")}/${cleanString(path).replace(/^\/+/, "")}`;
}

async function readResponse(res) {
    const text = await res.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

async function strapiFetch(path, options = {}) {
    const { baseUrl, authorization } = getStrapiConfig();
    const headers = {
        Authorization: authorization,
        ...(options.headers || {}),
    };

    let body = options.body;
    if (options.json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.json);
    }

    const url = joinUrl(baseUrl, path);
    const res = await fetch(url, {
        method: options.method || "GET",
        headers,
        body,
        cache: "no-store",
        redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
        throw new ClientProfileError(
            `Strapi redirected the request (${res.status}). Check STRAPI_BASE_URL.`,
            500,
            { location: res.headers.get("location"), url }
        );
    }

    const parsed = await readResponse(res);

    if (!res.ok) {
        throw new ClientProfileError(
            parsed?.error?.message ||
            parsed?.message ||
            parsed?.raw ||
            `Strapi request failed (${res.status})`,
            res.status,
            parsed?.error || parsed
        );
    }

    return parsed;
}

function unwrapEntity(value) {
    const entity = value?.data ?? value;
    if (!entity) return null;

    const attrs = entity?.attributes ?? entity;
    return {
        ...attrs,
        id: entity?.id ?? attrs?.id ?? null,
        documentId: entity?.documentId ?? attrs?.documentId ?? "",
    };
}

function unwrapRelation(value) {
    const entity = value?.data ?? value;
    if (!entity) return null;

    const attrs = entity?.attributes ?? entity;
    return {
        ...attrs,
        id: entity?.id ?? attrs?.id ?? null,
        documentId: entity?.documentId ?? attrs?.documentId ?? "",
    };
}

function normalizeMedia(value) {
    const media = unwrapRelation(value);
    if (!media) return { id: null, name: "", url: "" };

    const { baseUrl } = getStrapiConfig();
    const origin = baseUrl.replace(/\/api\/?$/, "");
    const rawUrl = cleanString(media?.url);

    return {
        id: media?.id ?? null,
        name: cleanString(media?.name),
        url: rawUrl
            ? /^https?:\/\//i.test(rawUrl)
                ? rawUrl
                : joinUrl(origin, rawUrl)
            : "",
    };
}

function normalizeContacts(value) {
    const list = Array.isArray(value)
        ? value
        : Array.isArray(value?.data)
            ? value.data
            : [];

    return list.map((item) => {
        const contact = item?.attributes ?? item ?? {};
        return {
            name: cleanString(contact?.name),
            designation: cleanString(contact?.designation),
            mobile: cleanString(contact?.mobile || contact?.phone),
            remarks: cleanString(contact?.remarks),
        };
    });
}

function normalizeProfile(clientEntity) {
    const client = unwrapEntity(clientEntity);
    const user = unwrapRelation(client?.users_permissions_user);
    const logo = normalizeMedia(client?.logo);

    return {
        documentId: cleanString(client?.documentId),
        companyName: cleanString(client?.companyName),
        contactName: cleanString(client?.contactName),
        designation: cleanString(client?.designation),
        city: cleanString(client?.city),
        address: cleanString(client?.address),
        phone: cleanString(client?.phone),
        website: cleanString(client?.website),
        countryList: cleanString(client?.countryList),
        industriesList: cleanString(client?.industriesList),
        companySizeList: cleanString(client?.companySizeList),
        statusList: cleanString(client?.statusList),
        leadStatus: cleanString(client?.leadStatus),
        shortDescription: cleanString(client?.shortDescription),
        username: cleanString(user?.username),
        email: cleanString(user?.email),
        logoId: logo.id,
        logoName: logo.name,
        logoUrl: logo.url,
        contactList: normalizeContacts(client?.contactList),
    };
}

function sessionLookupValues(session) {
    const user = session?.user || {};

    const documentId = cleanString(
        [
            user?.documentId,
            user?.clientDocumentId,
            user?.client?.documentId,
            user?.client?.data?.documentId,
            user?.client?.data?.attributes?.documentId,
            user?.profile?.documentId,
        ].find((value) => cleanString(value)) || ""
    );

    return {
        documentId,
        email: cleanString(user?.email),
        username: cleanString(user?.username),
    };
}

function clientPopulate() {
    return {
        logo: true,
        contactList: true,
        users_permissions_user: {
            populate: {
                role: true,
            },
        },
    };
}

async function fetchClientByDocumentId(documentId) {
    if (!documentId) return null;

    const query = qs.stringify(
        { populate: clientPopulate() },
        { encodeValuesOnly: true }
    );

    try {
        const result = await strapiFetch(
            `clients/${encodeURIComponent(documentId)}?${query}`,
            { method: "GET" }
        );
        return result?.data || null;
    } catch (error) {
        if (Number(error?.status) === 404) return null;
        throw error;
    }
}

async function fetchClientByLogin(session) {
    const lookup = sessionLookupValues(session);

    const direct = await fetchClientByDocumentId(lookup.documentId);
    if (direct) return direct;

    const orFilters = [];

    if (lookup.documentId) {
        orFilters.push({ documentId: { $eq: lookup.documentId } });
    }

    if (lookup.email) {
        orFilters.push({
            users_permissions_user: {
                email: { $eq: lookup.email },
            },
        });
    }

    if (lookup.username) {
        orFilters.push({
            users_permissions_user: {
                username: { $eq: lookup.username },
            },
        });
    }

    if (!orFilters.length) {
        throw new ClientProfileError(
            "The login session does not contain a client document ID, email, or username. Please log out and log in again.",
            403
        );
    }

    const query = qs.stringify(
        {
            filters: orFilters.length === 1 ? orFilters[0] : { $or: orFilters },
            populate: clientPopulate(),
            pagination: { page: 1, pageSize: 1 },
        },
        { encodeValuesOnly: true }
    );

    const result = await strapiFetch(`clients?${query}`, { method: "GET" });
    return result?.data?.[0] || null;
}

function validateWebsite(value) {
    if (!value) return;

    try {
        new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
        throw new ClientProfileError("Website URL is invalid", 400);
    }
}

function normalizeUpdatePayload(raw) {
    const contactName = cleanString(raw?.contactName);
    const designation = cleanString(raw?.designation);
    const city = cleanString(raw?.city);
    const countryList = cleanString(raw?.countryList);
    const username = cleanString(raw?.username);
    const password = cleanString(raw?.password);
    const website = cleanString(raw?.website);

    if (!contactName) throw new ClientProfileError("Contact name is required", 400);
    if (!designation) throw new ClientProfileError("Designation is required", 400);
    if (!city) throw new ClientProfileError("City is required", 400);
    if (!countryList) throw new ClientProfileError("Country is required", 400);
    if (username.length < 3) {
        throw new ClientProfileError("Username must be at least 3 characters", 400);
    }
    if (password && password.length < 8) {
        throw new ClientProfileError("Password must be at least 8 characters", 400);
    }

    validateWebsite(website);

    const contactList = (Array.isArray(raw?.contactList) ? raw.contactList : [])
        .map((item) => ({
            name: cleanString(item?.name),
            designation: cleanString(item?.designation),
            mobile: cleanString(item?.mobile || item?.phone),
            remarks: cleanString(item?.remarks),
        }))
        .filter((item) => item.name || item.designation || item.mobile || item.remarks);

    for (const contact of contactList) {
        if (!contact.name) {
            throw new ClientProfileError("Each contact must have a name", 400);
        }
        if (!contact.mobile) {
            throw new ClientProfileError("Each contact must have a mobile number", 400);
        }
    }

    return {
        contactName,
        designation,
        city,
        countryList,
        username,
        password,
        website,
        address: cleanString(raw?.address),
        industriesList: cleanString(raw?.industriesList),
        companySizeList: cleanString(raw?.companySizeList),
        shortDescription: cleanString(raw?.shortDescription),
        contactList,
        removeLogo: raw?.removeLogo === true,
    };
}

async function uploadLogo(file) {
    if (!file || typeof file.arrayBuffer !== "function" || !file.size) return null;

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (file.type && !allowed.includes(file.type)) {
        throw new ClientProfileError("Logo must be JPG, PNG, or WEBP", 400);
    }

    if (file.size > 5 * 1024 * 1024) {
        throw new ClientProfileError("Logo must be 5 MB or smaller", 400);
    }

    const formData = new FormData();
    formData.append("files", file, file.name);

    const uploaded = await strapiFetch("upload", {
        method: "POST",
        body: formData,
    });

    const first = Array.isArray(uploaded) ? uploaded[0] : null;
    if (!first?.id) {
        throw new ClientProfileError("Logo upload did not return a file ID", 500);
    }

    return first;
}

function errorResponse(error) {
    const status = Number(error?.status || 500);

    console.error("[CLIENT_PROFILE_API_ERROR]", {
        message: error?.message,
        status,
        details: error?.details || null,
    });

    return NextResponse.json(
        {
            ok: false,
            error: error?.message || "Client profile request failed",
            ...(process.env.NODE_ENV !== "production" && error?.details
                ? { details: error.details }
                : {}),
        },
        { status: Number.isFinite(status) ? status : 500 }
    );
}

export async function GET() {
    try {
        const session = await requireClient();
        const client = await fetchClientByLogin(session);

        if (!client) {
            throw new ClientProfileError(
                "No client profile is linked to the logged-in account.",
                404
            );
        }

        return NextResponse.json({
            ok: true,
            profile: normalizeProfile(client),
        });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function PUT(request) {
    try {
        const session = await requireClient();
        const currentClient = await fetchClientByLogin(session);

        if (!currentClient) {
            throw new ClientProfileError(
                "No client profile is linked to the logged-in account.",
                404
            );
        }

        const current = unwrapEntity(currentClient);
        const linkedUser = unwrapRelation(current?.users_permissions_user);
        const clientDocumentId = cleanString(current?.documentId);

        if (!clientDocumentId) {
            throw new ClientProfileError("Client document ID is missing in Strapi", 500);
        }

        if (!linkedUser?.id) {
            throw new ClientProfileError(
                "The client profile is not linked to a login user.",
                409
            );
        }

        const incoming = await request.formData();
        const rawData = incoming.get("data");

        if (!rawData) {
            throw new ClientProfileError("Missing data field", 400);
        }

        let parsedData;
        try {
            parsedData = JSON.parse(String(rawData));
        } catch {
            throw new ClientProfileError("Invalid JSON in data field", 400);
        }

        const update = normalizeUpdatePayload(parsedData);
        const logoFile = incoming.get("files.logo");
        const uploadedLogo = await uploadLogo(logoFile);

        const userUpdate = {};
        if (update.username !== cleanString(linkedUser?.username)) {
            userUpdate.username = update.username;
        }
        if (update.password) {
            userUpdate.password = update.password;
        }

        if (Object.keys(userUpdate).length > 0) {
            await strapiFetch(`users/${encodeURIComponent(linkedUser.id)}`, {
                method: "PUT",
                json: userUpdate,
            });
        }

        const clientUpdate = {
            contactName: update.contactName,
            designation: update.designation,
            city: update.city,
            address: update.address,
            website: update.website,
            countryList: update.countryList,
            industriesList: update.industriesList,
            companySizeList: update.companySizeList,
            shortDescription: update.shortDescription,
            contactList: update.contactList,
            users_permissions_user: linkedUser.id,
        };

        if (uploadedLogo?.id) {
            clientUpdate.logo = uploadedLogo.id;
        } else if (update.removeLogo) {
            clientUpdate.logo = null;
        }

        await strapiFetch(
            `clients/${encodeURIComponent(clientDocumentId)}?status=published`,
            {
                method: "PUT",
                json: { data: clientUpdate },
            }
        );

        const refreshed = await fetchClientByDocumentId(clientDocumentId);

        return NextResponse.json({
            ok: true,
            message: "Profile updated successfully.",
            profile: normalizeProfile(refreshed || currentClient),
        });
    } catch (error) {
        return errorResponse(error);
    }
}
